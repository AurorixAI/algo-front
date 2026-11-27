// LESSON-RULES пачка 4 (Opus-проверка экранов, 27.11): the BEHAVIOUR of the window of the decision and of the withdraw, in a real DOM on the server's own answers.
//  В1  the sheet inside a parent that draws again and reads its schedule after «уже решено»: the preview is asked ONCE, the window stays and says who and when
//  В2  the preview is needed for ALL THREE outcomes: no button until the sentence of the server has come; a failed preview - the error and «Повторить», no button
//  Э8  the sheet hands who reported to the window (the title); no name - the neutral sentence, never «Сообщили сообщил»
//  Э6  a refused withdraw in the panel of the teacher: the lessons are read again      М2  the refusal of the sheet stays after the schedule is read again
//  М1  an answer that is no preview and no `changed: false` is a broken one            М3  200 `changed: false` at the press: «Уже было решено так же», not «решил я»
//  М4  one road and one set of words of «Отозвать отмену» (the page «Замены», the block of the teacher, the sheet)      М5  the right lost at the press: the list and the badge are read again
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, isDry, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { answer, listServer, WORLD_DAY, WORLD_TEACHER_ID, plain } = require("./helpers/lesson-rules-answers.cjs");

const ctx = setup(test);
const KIND_PATH = /\/attendance\/cancellation-kind$/;
const RESTORE = /\/lessons\/restore$/;
const WITHDRAW = /\/lessons\/withdraw-cancellation$/;
const ALREADY = answer("refusals").already_decided;
const TEACHER = { id: WORLD_TEACHER_ID, role: "teacher", org_role: "teacher" };
const PREVIEW = answer("dry_run_confirm_centre");
const STUDENTS = PREVIEW.deductions.map((d, index) => {
  const [last, first] = d.name.split(" ");
  return { id: d.studentId, first_name: first, last_name: last, full_name: d.name, class_level: 7, status: "active", display_id: `AL7-00${index + 1}`, student_phone: "" };
});
const WITHDRAWN_BODY = { ok: true, restored: true, lessonId: "lesson-mon", lessonDate: "2026-11-23", previousKind: "unconfirmed", returnedToReview: true };
const noise = (errors) => errors.filter((text) => !/404|Failed to load resource|403|409|422|500/.test(text));
const dry = (calls) => calls.filter((c) => c.method === "PUT" && KIND_PATH.test(c.path) && isDry(c));
const real = (calls) => calls.filter((c) => (c.method === "PUT" && KIND_PATH.test(c.path) && !isDry(c)) || (c.method === "POST" && RESTORE.test(c.path)));
const reads = (calls, matcher) => calls.filter((c) => c.method === "GET" && matcher(c)).length;

async function mount(name, who, props, width = 1280, server = () => null) {
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", server, { width, height: width === 375 ? 800 : 900, today: WORLD_DAY });
  await run.page.evaluate(([n, u, p]) => window.mount(n, u, p), [name, who, props]);
  return run;
}
/** Waits for N more draws of the parent: the proof that the screen was drawn again - no fixed pause. */
async function redraws(page, count) {
  const from = await page.evaluate(() => window.__renders ?? 0);
  await page.waitForFunction((target) => (window.__renders ?? 0) >= target, from + count);
}
async function until(condition, what, limitMs = 6000) {
  const stop = Date.now() + limitMs;
  while (!condition() && Date.now() < stop) await new Promise((resolve) => setTimeout(resolve, 25));
  assert.ok(condition(), `not reached: ${what}`);
}
const previewServer = (extra) => (r) => (extra && extra(r)) || (r.method === "PUT" && KIND_PATH.test(r.path) && isDry(r) ? { json: PREVIEW } : null);

// ── В1 ──────────────────────────────────────────────────────────────────────────────────────────────

test("В1: the sheet in a parent that draws again and reads its schedule after «уже решено» - the preview is asked ONCE, the window stays with the sentence of the server", async () => {
  const run = await mount("sheet-waiting-parent", OWNER, { moneyRight: true }, 1280, (r) => (r.method === "PUT" && KIND_PATH.test(r.path) && isDry(r) ? { status: 409, json: ALREADY } : null));
  const { page, calls } = run;
  await page.click('[data-testid="sheet-decide-waiting"]');
  await page.waitForSelector('[data-testid="waiting-decided"]');
  await page.waitForFunction(() => window.__log.includes("schedule-read"));
  await redraws(page, 8);   // the parent drew eight times more, the lesson behind is no longer waiting (the schedule was read again)
  assert.equal(dry(calls).length, 1, "one preview, not one per draw");
  assert.equal(plain(await page.textContent('[data-testid="waiting-decided"]')), ALREADY.detail.message);
  assert.equal(await page.locator('[role="dialog"]').count(), 1, "the window stands");
  assert.equal(await page.evaluate(() => window.__log.filter((line) => line === "schedule-read").length), 1, "the schedule is read once");
  assert.equal(real(calls).length, 0);
  assert.deepEqual(noise(run.errors), []);
  await page.close();
});

test("В1: a draw of the parent does not reset the chosen outcome and does not ask the preview again", async () => {
  const run = await mount("sheet-waiting-parent", OWNER, { moneyRight: true }, 1280, previewServer());
  const { page, calls } = run;
  await page.click('[data-testid="sheet-decide-waiting"]');
  await page.click('[data-testid="waiting-outcome-holiday"]');
  await page.waitForFunction((text) => (document.querySelector('[data-testid="waiting-caption"]')?.textContent ?? "").replace(/\s+/g, " ").includes(text), PREVIEW.holiday_text.replace(/\s+/g, " "));
  await redraws(page, 8);
  assert.equal(await page.isChecked('[data-testid="waiting-outcome-holiday"] input'), true, "the outcome stays chosen");
  assert.equal(await page.isDisabled('[data-testid="waiting-confirm"]'), false);
  assert.equal(dry(calls).length, 1);
  await page.close();
});

// ── В2 ──────────────────────────────────────────────────────────────────────────────────────────────

for (const outcome of ["centre", "holiday", "held"]) {
  test(`В2: «${outcome}» - no button while the sentence of the server has not come (nothing is written); when it has, one press writes once`, async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const run = await mount("sheet-waiting", OWNER, { kind: "unconfirmed", moneyRight: true }, 1280, (r) => {
      if (r.method === "PUT" && KIND_PATH.test(r.path) && isDry(r)) return gate.then(() => ({ json: PREVIEW }));
      if ((r.method === "PUT" && KIND_PATH.test(r.path)) || (r.method === "POST" && RESTORE.test(r.path))) return { json: { ok: true, changed: true, restored: true, cancellationKind: outcome, version: 3 } };
      return null;
    });
    const { page, calls } = run;
    await page.click('[data-testid="sheet-decide-waiting"]');
    await page.click(`[data-testid="waiting-outcome-${outcome}"]`);
    assert.equal(await page.isDisabled('[data-testid="waiting-confirm"]'), true, "the preview has not come: no button");
    await page.evaluate(() => document.querySelector('[data-testid="waiting-confirm"]')?.click());
    assert.equal(real(calls).length, 0, "nothing is written without the preview");
    release();
    await page.waitForFunction(() => !document.querySelector('[data-testid="waiting-confirm"]')?.hasAttribute("disabled"));
    await page.click('[data-testid="waiting-confirm"]');
    await until(() => real(calls).length === 1, "one write after the preview");
    await page.close();
  });
}

test("В2: a FAILING preview (a 500 without a code) for every outcome - the error and «Повторить», the button stays off, nothing is written; after «Повторить» the button works", async () => {
  for (const outcome of ["centre", "holiday", "held"]) {
    let broken = true;
    const run = await mount("sheet-waiting", OWNER, { kind: "unconfirmed", moneyRight: true }, 1280, (r) => {
      if (r.method === "PUT" && KIND_PATH.test(r.path) && isDry(r)) return broken ? { status: 500, json: { detail: "Internal Server Error" } } : { json: PREVIEW };
      if ((r.method === "PUT" && KIND_PATH.test(r.path)) || (r.method === "POST" && RESTORE.test(r.path))) return { json: { ok: true, changed: true, restored: true } };
      return null;
    });
    const { page, calls } = run;
    await page.click('[data-testid="sheet-decide-waiting"]');
    await page.click(`[data-testid="waiting-outcome-${outcome}"]`);
    await page.waitForSelector('[data-testid="waiting-caption"] button');
    assert.equal(await page.isDisabled('[data-testid="waiting-confirm"]'), true, outcome);
    assert.equal(real(calls).length, 0, outcome);
    broken = false;
    await page.click('[data-testid="waiting-caption"] button');
    await page.waitForFunction(() => !document.querySelector('[data-testid="waiting-confirm"]')?.hasAttribute("disabled"));
    await page.click('[data-testid="waiting-confirm"]');
    await until(() => real(calls).length === 1, `${outcome}: written after the retry`);
    await page.close();
  }
});

// ── Э8 ──────────────────────────────────────────────────────────────────────────────────────────────

test("Э8: the window from the sheet names who reported (reportedByRole of the lesson); «Сообщили сообщил» is gone: a row without a name says «Сообщено …»", async () => {
  const run = await mount("sheet-waiting", OWNER, { kind: "unconfirmed", moneyRight: true, lesson: { reportedBy: "Каримова Д.", reportedByRole: "admin" } }, 1280, previewServer());
  await run.page.click('[data-testid="sheet-decide-waiting"]');
  await run.page.waitForSelector('[role="dialog"]');
  assert.match(plain(await run.page.textContent('[role="dialog"]')), /^Администратор сообщил: урока не было/);
  await run.page.close();
  const bare = await mount("sheet-waiting", OWNER, { kind: "unconfirmed", moneyRight: true }, 1280, previewServer());
  await bare.page.click('[data-testid="sheet-decide-waiting"]');
  await bare.page.waitForSelector('[role="dialog"]');
  assert.match(plain(await bare.page.textContent('[role="dialog"]')), /^Отмена урока ждёт подтверждения/, "no role - the neutral title");
  await bare.page.close();
  const pending = answer("pending_admin");
  const nameless = { ...pending, items: pending.items.map((row) => (row.source === "request" || !row.lesson ? row : { ...row, reportedBy: null, reportedByRole: null, cancelledBy: null })) };
  const rows = await (async () => {
    const page = await openPage(ctx.browser, "lesson-rules.entry.tsx", listServer({ pending: nameless }), { width: 1280, height: 900, today: WORLD_DAY });
    await page.page.evaluate(([who]) => window.mount("substitutions", who, { role: "admin" }), [{ ...ADMIN, payments_access: false }]);
    await page.page.waitForSelector('[data-testid="one-off-decisions-toggle"]');
    await page.page.click('[data-testid="one-off-decisions-toggle"]');
    await page.page.waitForSelector('[data-testid="waiting-reported-row"]');
    const text = plain(await page.page.locator('[data-testid="waiting-reported-row"]').first().textContent());
    await page.page.close();
    return text;
  })();
  assert.doesNotMatch(rows, /Сообщили/);
  assert.match(rows, /^Сообщено \d\d\.\d\d, что урока не было/);
});

// ── Э6 / М2 ─────────────────────────────────────────────────────────────────────────────────────────

test("Э6: the withdraw refused in the panel of the teacher (409) - the lessons are read again; a success does not read them a second time (the screen does it in its toast step)", async () => {
  const schedule = answer("schedule_teacher");
  const lesson = schedule.find((o) => o.occurrenceDate === "2026-11-23");
  const groups = [{ id: lesson.groupId, name: lesson.groupName, status: "active", teacher_id: TEACHER.id, class_level: 7, student_count: 9, subject: "math" }];
  const server = (post) => (r) => {
    if (r.method === "POST" && WITHDRAW.test(r.path)) return post;
    if (r.path === `/auth/org/groups/${lesson.groupId}`) return { json: { id: lesson.groupId, name: lesson.groupName, status: "active", teacher_id: TEACHER.id, class_level: 7, student_count: STUDENTS.length, students: STUDENTS } };
    return /\/attendance(\?|$)/.test(r.path + (r.query ? `?${r.query}` : "")) ? { json: answer("journal_teacher") } : null;
  };
  for (const [label, post, reloaded] of [["409", { status: 409, json: ALREADY }, true], ["200", { json: WITHDRAWN_BODY }, false]]) {
    const run = await mount("lesson-panel", TEACHER, { lesson, groups }, 1280, server(post));
    await run.page.waitForSelector('[data-testid="panel-withdraw"]', { timeout: 8000 });
    await run.page.click('[data-testid="panel-withdraw"]');
    await run.page.waitForFunction(() => window.__log.some((line) => /^(withdrawn|refused):/.test(line)));
    if (reloaded) await run.page.waitForFunction(() => window.__log.includes("lessons-reloaded"));
    else assert.equal(await run.page.evaluate(() => window.__log.includes("lessons-reloaded")), false, label);
    assert.equal(await run.page.evaluate(() => window.__log.some((line) => line.startsWith("refused:"))), reloaded, label);
    await run.page.close();
  }
});

test("М2: the refusal of «Отозвать отмену» in the sheet stays on the screen AFTER the schedule behind is read again (the lesson is no longer waiting)", async () => {
  const run = await mount("sheet-waiting-parent", ADMIN, { moneyRight: false, canWithdraw: true, reportedBy: "Каримова Д.", reportedByRole: "admin" }, 375, (r) => (r.method === "POST" && WITHDRAW.test(r.path) ? { status: 409, json: ALREADY } : null));
  const { page } = run;
  await page.click('[data-testid="sheet-withdraw"]');
  await page.waitForFunction(() => window.__log.includes("schedule-read"));
  await page.waitForFunction(() => !document.querySelector('[data-testid="sheet-waiting"]'));
  await redraws(page, 4);
  assert.equal(plain(await page.textContent('[data-testid="sheet-withdraw-problem"]')), ALREADY.detail.message, "the sentence did not disappear with the block");
  await page.close();
});

// ── М1 / М3 ─────────────────────────────────────────────────────────────────────────────────────────

test("М1: «решил другой» is only 409 or `changed: false`; an answer with no `dry_run` and no `changed: false` is a broken one - the error and «Повторить», no «Отмена уже решена»", async () => {
  for (const [label, body, decided] of [["ok without dry_run", { ok: true, changed: true, cancellationKind: "centre", version: 3 }, false], ["empty", {}, false], ["changed false", { ok: true, changed: false, cancellationKind: "centre" }, true]]) {
    const run = await mount("sheet-waiting", OWNER, { kind: "unconfirmed", moneyRight: true }, 1280, (r) => (r.method === "PUT" && KIND_PATH.test(r.path) && isDry(r) ? { json: body } : null));
    await run.page.click('[data-testid="sheet-decide-waiting"]');
    if (decided) {
      await run.page.waitForSelector('[data-testid="waiting-decided"]');
    } else {
      await run.page.click('[data-testid="waiting-outcome-centre"]');
      await run.page.waitForSelector('[data-testid="waiting-caption"] button');
      assert.match(plain(await run.page.textContent('[data-testid="waiting-caption"]')), /Не удалось посчитать последствия/, label);
      assert.equal(await run.page.locator('[data-testid="waiting-decided"]').count(), 0, label);
      assert.equal(await run.page.evaluate(() => window.__log.length), 0, `${label}: nobody is told «already decided»`);
    }
    await run.page.close();
  }
});

test("М3: the press the server answers with 200 `changed: false` - «Уже было решено так же», the lists are read again, NO «решил я» (no toast, no onDecided)", async () => {
  const run = await mount("sheet-waiting", OWNER, { kind: "unconfirmed", moneyRight: true }, 1280, previewServer((r) => (r.method === "PUT" && KIND_PATH.test(r.path) && !isDry(r) ? { json: { ok: true, changed: false, cancellationKind: "holiday", version: 3 } } : null)));
  const { page } = run;
  await page.click('[data-testid="sheet-decide-waiting"]');
  await page.click('[data-testid="waiting-outcome-holiday"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="waiting-confirm"]')?.hasAttribute("disabled"));
  await page.click('[data-testid="waiting-confirm"]');
  await page.waitForSelector('[data-testid="waiting-decided"]');
  assert.equal(plain(await page.textContent('[data-testid="waiting-decided"]')), "Уже было решено так же.");
  assert.deepEqual(await page.evaluate(() => window.__log), ["already-decided"], "never «decided:holiday»");
  await page.close();
});

// ── М4 ──────────────────────────────────────────────────────────────────────────────────────────────

const WITHDRAWN_TEXT = "Отмена отозвана: урок снова ждёт отметки";
const BROKEN_500 = { status: 500, json: { detail: "Internal Server Error" } };   // the real 500 of the server: no code
const NOT_SENT = "Не удалось отозвать отмену. Проверьте соединение и повторите попытку.";

test("М4: «Отозвать отмену» says the SAME words in the page «Замены», the block of the teacher and the sheet: the toast of success, the refusal of the server, a 500 without a code", async () => {
  const author = answer("pending_admin_author");
  const mine = answer("mine_teacher");
  const adminUser = { ...ADMIN, payments_access: false };
  const pageRun = async (post) => {
    const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", (r) => (r.method === "POST" && WITHDRAW.test(r.path) ? post : listServer({ pending: author })(r)), { width: 1280, height: 900, today: WORLD_DAY });
    await run.page.evaluate(([who]) => window.mount("substitutions", who, { role: "admin" }), [adminUser]);
    await run.page.waitForSelector('[data-testid="one-off-decisions-toggle"]');
    await run.page.click('[data-testid="one-off-decisions-toggle"]');
    await run.page.click('[data-testid="withdraw-cancellation"]');
    await run.page.waitForSelector('[role="status"], [role="alert"]');
    return run;
  };
  const blockRun = async (post) => {
    const run = await mount("teacher-block", { role: "teacher", org_role: "teacher" }, {}, 375, (r) => (r.path === "/auth/org/substitutions/mine" ? { json: mine } : r.method === "POST" && WITHDRAW.test(r.path) ? post : null));
    await run.page.waitForSelector('[data-testid="withdraw-cancellation"]');
    await run.page.click('[data-testid="withdraw-cancellation"]');
    return run;
  };
  // success: a toast with the same words on the page and in the block; the sheet hands them to its page
  const okPage = await pageRun({ json: WITHDRAWN_BODY });
  assert.equal(plain(await okPage.page.textContent('[role="status"]')), WITHDRAWN_TEXT);
  await okPage.page.close();
  const okBlock = await blockRun({ json: WITHDRAWN_BODY });
  await okBlock.page.waitForSelector('[role="status"]');
  assert.equal(plain(await okBlock.page.textContent('[role="status"]')), WITHDRAWN_TEXT);
  await okBlock.page.close();
  // a 500 with no code: the same phrase everywhere
  const badPage = await pageRun(BROKEN_500);
  assert.equal(plain(await badPage.page.textContent('[role="alert"]')), NOT_SENT);
  await badPage.page.close();
  const badBlock = await blockRun(BROKEN_500);
  await badBlock.page.waitForSelector('section[aria-label] p[role="alert"]');
  assert.equal(plain(await badBlock.page.textContent('section[aria-label] p[role="alert"]')), NOT_SENT);
  await badBlock.page.close();
  const badSheet = await mount("sheet-waiting", adminUser, { kind: "unconfirmed", moneyRight: false, lesson: { canWithdraw: true, reportedBy: "Каримова Д.", reportedByRole: "admin" } }, 1280, (r) => (r.method === "POST" && WITHDRAW.test(r.path) ? BROKEN_500 : null));
  await badSheet.page.click('[data-testid="sheet-withdraw"]');
  await badSheet.page.waitForSelector('[data-testid="sheet-withdraw-problem"]');
  assert.equal(plain(await badSheet.page.textContent('[data-testid="sheet-withdraw-problem"]')), NOT_SENT);
  await badSheet.page.close();
});

// ── М5 ──────────────────────────────────────────────────────────────────────────────────────────────

test("М5: the money right is lost at the press (403 MONEY_RIGHT_REQUIRED) - the list «Ждут решения» and the badge of the menu are read again", async () => {
  const item = { ...answer("one_off_decided").items[0], money: null, decidedAt: null, decidedBy: null, periodClosed: false };
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", (r) => {
    if (r.path === "/auth/org/one-off-decisions") return { json: { items: [item], total: 1 } };
    if (r.path.endsWith("/money-decision")) return isDry(r)
      ? { json: { lessonId: item.lessonId, money: "paid", month: "2026-11", dryRun: true, payrollSheet: null, moneyEffects: { students: [], payroll: [], text: "", dryRun: true } } }
      : { status: 403, json: { detail: { code: "MONEY_RIGHT_REQUIRED", message: "Решение по зарплате принимает владелец или администратор с доступом к деньгам" } } };
    return listServer()(r);
  }, { width: 1280, height: 900, today: WORLD_DAY });
  const { page, calls } = run;
  await page.evaluate(([who]) => window.mount("substitutions", who, { role: "owner" }), [OWNER]);
  await page.waitForSelector('[data-testid="one-off-decision-row"]');
  const list = reads(calls, (c) => /^\/auth\/org\/substitutions$/.test(c.path)), summary = reads(calls, (c) => c.path === "/auth/org/substitutions/summary");
  await page.click('button[aria-label^="Включить в зарплату"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="one-off-decision-confirm"]') && !document.querySelector('[data-testid="one-off-decision-confirm"]').hasAttribute("disabled"));
  await page.click('[data-testid="one-off-decision-confirm"]');
  await until(() => reads(calls, (c) => /^\/auth\/org\/substitutions$/.test(c.path)) > list, "the list is read again");
  await until(() => reads(calls, (c) => c.path === "/auth/org/substitutions/summary") > summary, "the badge of the menu is read again");
  await page.close();
});
