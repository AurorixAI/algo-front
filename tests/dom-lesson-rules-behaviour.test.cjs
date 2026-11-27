// LESSON-RULES пачка 3 (Э1, Э2, Э5, Э6, Э7, Э12): the BEHAVIOUR of the window of the decision and of the withdraw - what the person sees and what the server is asked, in a real DOM on the server's own
// answers (tests/fixtures/lessonRules).  A double press, a broken network, an answer that is no preview, the 409 «уже решено» in the first preview / from the journal / from the sheet, a failed withdraw,
// the numbers of the tab and of the line «Решает владелец» (the server's, not the length of the page), the lists read again after a decision.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, isDry, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { answer, listServer, WORLD_DAY, plain } = require("./helpers/lesson-rules-answers.cjs");

const ctx = setup(test);
const KIND_PATH = /\/attendance\/cancellation-kind$/;
const WITHDRAW = /\/lessons\/withdraw-cancellation$/;
const MON = 'button[aria-label="Решить отмену: Математика 7, Эргашев К., 23.11"]';
const noise = (errors) => errors.filter((text) => !/404|Failed to load resource|409|422|500/.test(text));
const ALREADY = answer("refusals").already_decided;
const LIST = /^\/auth\/org\/substitutions$/;
const SUMMARY = "/auth/org/substitutions/summary";

async function open(server, { user = OWNER, width = 1280 } = {}) {
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", server, { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
  await run.page.evaluate(([who]) => window.mount("substitutions", who, { role: who.org_role === "admin" ? "admin" : "owner" }), [user]);
  await run.page.waitForSelector('[data-testid="waiting-row"], [data-testid="waiting-reported-row"], [data-testid="one-off-decisions-toggle"]');
  return run;
}
/** Waits for a state of the server's log (the screen reads again on its own time): polls with a limit, never a fixed pause. */
async function until(check, what) {
  for (let i = 0; i < 100; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`not reached in 5 s: ${what}`);
}
const reads = (calls, matcher) => calls.filter((c) => c.method === "GET" && matcher(c)).length;
const realKind = (calls) => calls.filter((c) => c.method === "PUT" && KIND_PATH.test(c.path) && !isDry(c));
const centreServer = (extra) => listServer({ extra: (r) => (extra && extra(r)) || (r.method === "PUT" && KIND_PATH.test(r.path) ? { json: isDry(r) ? answer("dry_run_confirm_centre") : { ok: true, changed: true, cancellationKind: "centre", version: 3 } } : null) });
async function chooseCentre(page) {
  await page.click(MON);
  await page.click('[data-testid="waiting-outcome-centre"]');
  await page.waitForFunction(() => /Перерасчёт/.test(document.querySelector('[data-testid="waiting-caption"]')?.textContent ?? ""));
}

test("a double press on «Подтвердить» writes ONCE; the toast names the outcome; the list and the badge are read again", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const run = await open(centreServer((r) => (r.method === "PUT" && KIND_PATH.test(r.path) && !isDry(r)
    ? gate.then(() => ({ json: { ok: true, changed: true, cancellationKind: "centre", version: 3 } })) : null)));
  const { page, calls } = run;
  await chooseCentre(page);
  const listBefore = reads(calls, (c) => LIST.test(c.path)), summaryBefore = reads(calls, (c) => c.path === SUMMARY);
  await page.evaluate(() => { const button = document.querySelector('[data-testid="waiting-confirm"]'); button.click(); button.click(); });
  await page.waitForFunction(() => document.querySelector('[data-testid="waiting-confirm"]')?.hasAttribute("disabled") || document.querySelector('[data-testid="waiting-confirm"] [class*="animate-spin"]'));
  release();
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
  assert.equal(realKind(calls).length, 1, "two presses, one request");
  assert.match(plain(await page.textContent('[role="status"]')), /^Отмена подтверждена: по вине центра$/);
  await until(() => reads(calls, (c) => LIST.test(c.path)) > listBefore, "the list «Ждут решения» is read again");
  await until(() => reads(calls, (c) => c.path === SUMMARY) > summaryBefore, "the counter of the menu is read again");
  assert.deepEqual(noise(run.errors), []);
  await page.close();
});

test("the network breaks on the press: the window STAYS, says it in words, no toast, nothing was decided; the second press goes through", async () => {
  const run = await open(centreServer());
  const { page, calls } = run;
  await chooseCentre(page);
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    let broken = false;
    window.fetch = (input, init) => {
      const url = String(typeof input === "string" ? input : input.url);
      const method = (init && init.method) || (typeof input !== "string" && input.method) || "GET";
      if (!broken && method === "PUT" && /cancellation-kind/.test(url) && !/dry_run=true/.test(url)) { broken = true; return Promise.reject(new TypeError("Failed to fetch")); }
      return original(input, init);
    };
  });
  await page.click('[data-testid="waiting-confirm"]');
  await page.waitForSelector('[data-testid="waiting-problem"]');
  assert.ok(plain(await page.textContent('[data-testid="waiting-problem"]')).length > 10, "the person is told");
  assert.equal(await page.locator('[role="dialog"]').count(), 1, "the window stays");
  assert.equal(await page.locator('[role="status"]').count(), 0, "no green toast: nothing was decided");
  assert.equal(realKind(calls).length, 0, "the broken request never reached the server");
  assert.equal(await page.isDisabled('[data-testid="waiting-confirm"]'), false, "the button is back");
  await page.click('[data-testid="waiting-confirm"]');
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
  assert.equal(realKind(calls).length, 1);
  await page.close();
});

test("the preview answers 200 `changed: false` with no preview (somebody decided meanwhile): «Отмена уже решена», no outcome offered, no sums invented, the list is read again", async () => {
  const run = await open(centreServer((r) => (r.method === "PUT" && KIND_PATH.test(r.path) && isDry(r) ? { json: { ok: true, changed: false, from: "centre", to: "centre", cancellationKind: "centre" } } : null)));
  const { page, calls } = run;
  const before = reads(calls, (c) => LIST.test(c.path));
  await page.click(MON);
  await page.waitForSelector('[data-testid="waiting-decided"]');
  assert.equal(plain(await page.textContent('[data-testid="waiting-decided"]')), "Отмену уже решил другой человек.");
  assert.match(plain(await page.textContent('[role="dialog"]')), /Отмена уже решена/);
  assert.equal(await page.locator('[data-testid="waiting-confirm"]').count(), 0);
  assert.equal(await page.locator('[data-testid="waiting-outcomes"]').count(), 0);
  await until(() => reads(calls, (c) => LIST.test(c.path)) > before, "the row goes from the list on the next reading");
  await page.close();
});

test("the preview is no preview and no refusal (a broken answer): the window says it could not count, offers «Повторить», never a sum", async () => {
  const run = await open(centreServer((r) => (r.method === "PUT" && KIND_PATH.test(r.path) && isDry(r) ? { json: { ok: false } } : null)));
  const { page } = run;
  await page.click(MON);
  await page.click('[data-testid="waiting-outcome-centre"]');
  await page.waitForSelector('[data-testid="waiting-caption"] button');
  assert.match(plain(await page.textContent('[data-testid="waiting-caption"]')), /Не удалось посчитать последствия/);
  assert.equal(await page.isDisabled('[data-testid="waiting-confirm"]'), true);
  await page.close();
});

test("409 ALREADY_DECIDED already at the FIRST preview (the real answer of C13.1: the preview after another's decision): the window opens as «Отмена уже решена» with the sentence of the server - who, when, which outcome; the list and the counter are read again", async () => {
  const real = answer("dry_run_confirm_after_other_decided_409");
  assert.equal(real.detail.code, "ALREADY_DECIDED");
  assert.equal(real.detail.message, "Отмену подтвердил Рустам Валиев (владелец) в 12:00: по вине центра.");
  const run = await open(centreServer((r) => (r.method === "PUT" && KIND_PATH.test(r.path) && isDry(r) ? { status: 409, json: real } : null)));
  const { page, calls } = run;
  const list = reads(calls, (c) => LIST.test(c.path)), summary = reads(calls, (c) => c.path === SUMMARY);
  await page.click(MON);
  await page.waitForSelector('[data-testid="waiting-decided"]');
  assert.equal(plain(await page.textContent('[data-testid="waiting-decided"]')), real.detail.message);
  assert.equal(await page.locator('[data-testid="waiting-outcomes"]').count(), 0);
  assert.equal(plain(await page.textContent('[data-testid="confirm-cancel"]')), "Закрыть");
  await until(() => reads(calls, (c) => LIST.test(c.path)) > list, "the list is read again");
  await until(() => reads(calls, (c) => c.path === SUMMARY) > summary, "the counter of the menu is read again");
  assert.equal(await page.locator('[role="status"]').count(), 0, "no green toast");
  await page.close();
});

test("409 at the press (the other person was first): the window turns into «Отмена уже решена», NO green toast, the lists are read again", async () => {
  const run = await open(centreServer((r) => (r.method === "PUT" && KIND_PATH.test(r.path) && !isDry(r) ? { status: 409, json: ALREADY } : null)));
  const { page, calls } = run;
  await chooseCentre(page);
  const list = reads(calls, (c) => LIST.test(c.path));
  await page.click('[data-testid="waiting-confirm"]');
  await page.waitForSelector('[data-testid="waiting-decided"]');
  assert.equal(plain(await page.textContent('[data-testid="waiting-decided"]')), ALREADY.detail.message);
  assert.equal(await page.locator('[role="status"]').count(), 0, "no «Отмена подтверждена»: THIS person did not decide it");
  await until(() => reads(calls, (c) => LIST.test(c.path)) > list, "the list is read again");
  await page.close();
});

test("the lesson sheet: «решил я» = onDecided(outcome); «решил другой» = onAlreadyDecided - the sheet is NOT closed with a green toast, the person reads who and when", async () => {
  const preview = (r) => (r.method === "PUT" && KIND_PATH.test(r.path) && isDry(r) ? { json: answer("dry_run_confirm_centre") } : null);
  const mount = async (real) => {
    const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", (r) => preview(r) || (r.method === "PUT" && KIND_PATH.test(r.path) ? real : null), { width: 1280, height: 900, today: WORLD_DAY });
    await run.page.evaluate(([who]) => window.mount("sheet-waiting", who, { kind: "unconfirmed", moneyRight: true }), [OWNER]);
    await run.page.click('[data-testid="sheet-decide-waiting"]');
    await run.page.click('[data-testid="waiting-outcome-holiday"]');
    return run;
  };
  const mine = await mount({ json: { ok: true, changed: true, cancellationKind: "holiday", version: 3 } });
  await mine.page.click('[data-testid="waiting-confirm"]');
  await mine.page.waitForFunction(() => window.__log.includes("decided:holiday"));
  assert.deepEqual(await mine.page.evaluate(() => window.__log), ["decided:holiday"]);
  await mine.page.close();
  const other = await mount({ status: 409, json: ALREADY });
  await other.page.click('[data-testid="waiting-confirm"]');
  await other.page.waitForSelector('[data-testid="waiting-decided"]');
  assert.deepEqual(await other.page.evaluate(() => window.__log), ["already-decided"], "never «decided»");
  assert.equal(plain(await other.page.textContent('[data-testid="waiting-decided"]')), ALREADY.detail.message);
  assert.equal(await other.page.locator('[role="dialog"]').count(), 1, "the window stays with the sentence");
  await other.page.close();
});

test("the journal: 409 from «Решить» - the window says who and when, the journal is read again, no green toast", async () => {
  const JOURNAL = answer("journal_teacher");
  const students = answer("dry_run_confirm_centre").deductions.map((d, index) => {
    const [last, first] = d.name.split(" ");
    return { id: d.studentId, first_name: first, last_name: last, full_name: d.name, class_level: 7, status: "active", display_id: `AL7-00${index + 1}`, student_phone: null, joined_at: "2026-09-01", last_theta: null, last_level: null };
  });
  const unconfirmed = { ...JOURNAL, cancellationKinds: { ...JOURNAL.cancellationKinds, "2026-11-23_lesson-mon": "unconfirmed" } };
  let journalReads = 0, readsAtRefusal = -1;
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", (r) => {
    if (r.method === "PUT" && KIND_PATH.test(r.path)) { if (isDry(r)) readsAtRefusal = journalReads; return isDry(r) ? { status: 409, json: ALREADY } : null; }
    if (/\/attendance(\?|$)/.test(r.path + (r.query ? `?${r.query}` : ""))) { journalReads += 1; return { json: unconfirmed }; }
    return null;
  }, { width: 1280, height: 900, today: WORLD_DAY });
  await run.page.evaluate(([user, props]) => window.mount("journal", user, props), [OWNER, { groupId: JOURNAL.groupId, students, adminMode: true }]);
  await run.page.waitForSelector('th[data-lesson-key="2026-11-23_lesson-mon"]');
  // the journal draws twice (the first draw and a second reading): a menu opened between them is closed by the second one - press until the item stays
  await until(() => journalReads >= 1, "the journal was read");
  let pressed = false;
  for (let attempt = 0; attempt < 20 && !pressed; attempt += 1) {
    await run.page.evaluate(() => { if (!document.querySelector('[data-testid="menu-decide-waiting"]')) document.querySelector('th[data-lesson-key="2026-11-23_lesson-mon"] [data-column-menu-trigger]')?.click(); });
    pressed = await run.page.evaluate(() => { const item = document.querySelector('[data-testid="menu-decide-waiting"]'); if (item) item.click(); return Boolean(item); });
    if (!pressed) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(pressed, "«Решить» was in the menu of the lesson");
  await run.page.waitForSelector('[data-testid="waiting-decided"]');
  assert.equal(plain(await run.page.textContent('[data-testid="waiting-decided"]')), ALREADY.detail.message);
  await until(() => journalReads > readsAtRefusal, "the journal is read again after «уже решено»");
  assert.equal(await run.page.locator('[role="status"]').count(), 0);
  await run.page.close();
});

test("the withdraw fails (409 ALREADY_DECIDED / a broken network): the teacher reads WHY in words, the block is read again, the button of the other lesson is untouched", async () => {
  const mine = answer("mine_teacher");
  for (const [label, result] of [["409", { status: 409, json: ALREADY }], ["500", { status: 500, json: { detail: { code: "INTERNAL", message: "Сервис временно недоступен" } } }]]) {
    let mineReads = 0;
    const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", (r) => {
      if (r.path === "/auth/org/substitutions/mine") { mineReads += 1; return { json: mine }; }
      if (r.method === "POST" && WITHDRAW.test(r.path)) return result;
      return null;
    }, { width: 375, height: 800, today: WORLD_DAY });
    await run.page.evaluate(() => window.mount("teacher-block", { role: "teacher", org_role: "teacher" }, {}));
    await run.page.waitForSelector('[data-testid="withdraw-cancellation"]');
    await run.page.click('[data-testid="withdraw-cancellation"]');
    await run.page.waitForSelector('section[aria-label] p[role="alert"]');
    const said = plain(await run.page.textContent('section[aria-label] p[role="alert"]'));
    assert.ok(said.length > 10, `${label}: the person is told`);
    if (label === "409") assert.equal(said, ALREADY.detail.message);
    assert.ok(mineReads >= 2, `${label}: the block is read again`);
    assert.equal(await run.page.locator('[data-testid="withdraw-cancellation"]').count(), 1, `${label}: the cancellation is still his to take back`);
    assert.equal(await run.page.evaluate(() => window.__log.includes("changed")), false, `${label}: the dashboard is not told «changed»`);
    await run.page.close();
  }
});

test("the names of the two «Отозвать» of the block are different: the request and the cancellation of the lesson", async () => {
  const mine = answer("mine_teacher");
  const request = { ...answer("history").items.find((r) => r.source === "request"), status: "pending", outcome: null, decision: null };
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", (r) => (r.path === "/auth/org/substitutions/mine" ? { json: { ...mine, items: [request, ...mine.items] } } : null), { width: 1280, height: 900, today: WORLD_DAY });
  await run.page.evaluate(() => window.mount("teacher-block", { role: "teacher", org_role: "teacher" }, {}));
  await run.page.waitForSelector('[data-testid="withdraw-cancellation"]');
  const names = await run.page.locator("button").evaluateAll((list) => list.map((b) => b.getAttribute("aria-label") || "").filter((name) => /^Отозвать/.test(name)));
  assert.equal(names.length, 2);
  assert.ok(names.some((n) => /^Отозвать запрос на замену: /.test(n)), names.join(" | "));
  assert.ok(names.some((n) => /^Отозвать отмену урока: пн, 23\.11 · Математика 7$/.test(n)), names.join(" | "));
  assert.equal(new Set(names).size, 2);
  await run.page.close();
});

test("the numbers are the server's: the tab says waitingTotal (not rows + tallies of its own), the line «Решает владелец» says unconfirmedTotal (not the length of the page)", async () => {
  const owner = answer("pending_owner");
  const ownerRun = await open(listServer({ pending: { ...owner, waitingTotal: 7 } }));
  assert.match(plain(await ownerRun.page.textContent('[role="tablist"]')), /Ждут решения \(7\)/);
  await ownerRun.page.close();
  const noNumber = { ...owner };
  delete noNumber.waitingTotal;
  const quiet = await open(listServer({ pending: noNumber }));
  assert.match(plain(await quiet.page.textContent('[role="tablist"]')), /Ждут решения \(0\)/, "no number from the server - no number of the screen's own");
  await quiet.page.close();
  const admin = answer("pending_admin");
  const adminRun = await open(listServer({ pending: { ...admin, unconfirmedTotal: 5 } }), { user: { ...ADMIN, payments_access: false } });
  assert.equal(plain(await adminRun.page.textContent('[data-testid="one-off-decisions-title"]')), "Решает владелец: 5 отмен урока");
  assert.equal(await adminRun.page.locator('[data-testid="waiting-reported-row"]').count(), 0, "the rows are hidden until the line is opened");
  await adminRun.page.close();
});

test("an administrator takes back HIS cancellation from «Замены»: one POST, the list and the counter of the menu are read again; a failure says why and reads again too", async () => {
  const author = answer("pending_admin_author");
  let withdrawn = false;
  const run = await open((r) => {
    if (r.method === "POST" && WITHDRAW.test(r.path)) { withdrawn = true; return { json: { ok: true, restored: true, lessonId: "lesson-mon", lessonDate: "2026-11-23", previousKind: "unconfirmed", returnedToReview: true } }; }
    return listServer({ pending: withdrawn ? { ...author, items: [], total: 0, unconfirmedTotal: 0, waitingTotal: 0 } : author })(r);
  }, { user: { ...ADMIN, payments_access: false } });
  const { page, calls } = run;
  await page.click('[data-testid="one-off-decisions-toggle"]');
  const list = reads(calls, (c) => LIST.test(c.path)), summary = reads(calls, (c) => c.path === SUMMARY);
  await page.click('[data-testid="withdraw-cancellation"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="withdraw-cancellation"]').length === 0);
  assert.equal(calls.filter((c) => WITHDRAW.test(c.path)).length, 1);
  await until(() => reads(calls, (c) => LIST.test(c.path)) > list, "the list is read again");
  await until(() => reads(calls, (c) => c.path === SUMMARY) > summary, "the counter of the menu is read again");
  await page.close();
});
