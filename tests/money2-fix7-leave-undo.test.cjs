// Money-2 fix 7 (LESSONS 139: one action - one rule at every entrance): a student who comes back the day of the leaving (`leave_undo.undone` in the dry run) sees the SAME note of the server
// at every entrance of the enrolment - the card of a student with groups and without, the drawer «Зачислить учеников» of the group page (one and several chosen) - and none of the fields the
// server refuses then (`LEAVE_UNDO_NO_START`): the conditions («Оплата с», the opening balance, the individual price) are not offered at all.  The mock-up of 19.11: the words of the server stand in the student's row before the action.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, OWNER } = require("./helpers/money2-w2.cjs");
const H = require("./helpers/enrol-v2.cjs");
const X = require("./helpers/money2-fix7.cjs");
const { F } = X;

const ctx = setup(test);
/** The dry run has been asked and answered. */
const settled = async (run, probes = 1) => {
  for (let i = 0; i < 60 && run.calls.filter((c) => c.method === "POST" && X.isDry(c)).length < probes; i += 1) await run.page.waitForTimeout(100);
  await run.page.waitForTimeout(600);
};
const FIXED = '[data-testid="leave-undo-fixed"]';
const pick = (page) => page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
const posts = (calls) => calls.filter((c) => c.method === "POST" && !X.isDry(c));
const UNDO_START = "Ученика убрали сегодня — возвращаем как было";

for (const [label, props] of [
  ["a student with groups (mode add)", { mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"] }],
  ["a student WITHOUT groups (first enrolment)", { mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] }],
]) {
  test(`card of a student, ${label}: the note of the server stands in a row, the fields that do not act are not offered, nothing of them is sent`, async () => {
    const run = await mount(ctx, X.modalServer({ undone: true }), "assign", OWNER, { moneyAvailable: true, groupsBasePath: "/owner/groups", ...props });
    await pick(run.page);
    await settled(run);
    const dialog = plain(await run.page.locator('[role="dialog"]').evaluate((el) => el.innerText));
    assert.equal(await run.page.locator('[data-testid="leave-undo"]').count(), 0, "no plate of the old kind");
    assert.equal(await run.page.locator('[data-testid="enrol-note-undone"]').count(), 1, "the words of the server stand in ONE row before the action (the mock-up)");
    assert.equal((dialog.match(/возвращаем как было/g) ?? []).length, 1, "once");
    assert.equal(await run.page.locator('[data-testid="enrol-terms"]').count(), 0, "no conditions: nothing here is set");
    assert.equal(await run.page.locator("#assign-group-pay-from, [data-testid=\"pay-from\"]").count(), 0, "no «Оплата с»");
    assert.equal(await run.page.locator('[id^="assign-group-opening"]').count(), 0, "no opening balance");
    assert.equal(await run.page.locator("#assign-group-price-amount").count(), 0, "no individual price");
    assert.doesNotMatch(dialog, /Остаток на начало|Изменить/);
    await run.page.waitForSelector('[data-testid="assign-submit"]:not([disabled])');
    await run.page.click('[data-testid="assign-submit"]');
    await run.page.waitForSelector('[role="status"]');
    const done = plain(await run.page.locator('[role="status"]').evaluate((el) => el.innerText));
    assert.ok(done.includes(UNDO_START) && done.includes("Долг снова за учеником"), `after the action the server's words: ${done}`);
    assert.equal(await run.page.locator('[role="status"]').filter({ hasText: "возвращаем как было" }).count(), 1, "read by a screen reader (role=status); no second window");
    assert.equal(await run.page.locator('[data-testid="assign-done"]').count(), 0, "no success window (fix10В)");
    const body = posts(run.calls).find((c) => c.path === "/auth/org/groups/gt/students/st1").body ?? {};
    for (const key of ["pay_from", "opening_balance", "price_override"]) assert.equal(body[key], undefined, `${key} is not sent`);
    await run.page.close();
  });
}

test("card of a student WITHOUT groups: an ordinary first enrolment keeps «Оплата с» and the price (nothing changed for it), no note", async () => {
  const run = await mount(ctx, X.modalServer({ undone: false }), "assign", OWNER, { moneyAvailable: true, mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] });
  await pick(run.page);
  await run.page.waitForSelector('[data-testid="enrol-terms-toggle"]');
  await run.page.click('[data-testid="enrol-terms-toggle"]');
  await run.page.waitForSelector('[data-testid="pay-from"]');
  await settled(run);
  assert.equal(await run.page.locator('[data-testid="leave-undo"]').count(), 0);
  assert.equal(await run.page.locator(FIXED).count(), 0);
  assert.equal(await run.page.locator('[data-testid="enrol-note-undone"], [data-testid="enrol-note-rewrite"]').count(), 0, "no note");
  assert.equal(await run.page.locator("#assign-group-price-amount").count(), 1, "the price stays");
  await run.page.close();
});

const BALANCE = [{ group_id: "gt", group_name: F.SHORT.T, membership_id: "m-old-t", left_on: "2026-11-17", same_group: true, kind: "debt", amount: 38000, text: "Уже был в этой группе, ушёл 17.11.2026 — остался долг 38 000 сум" },
  { group_id: "gb", group_name: F.SHORT.B, membership_id: "m-old-b", left_on: "2026-11-10", kind: "debt", amount: 120000, text: "Был в группе «Геометрия 8», ушёл 10.11.2026 — остался долг 120 000 сум" }];
test("the debt of THIS group from the last time is a row like the rows of the other groups (the structure, the sum, the link)", async () => {
  const run = await mount(ctx, X.modalServer({ undone: false, pastBalances: BALANCE }), "assign", OWNER, { moneyAvailable: true, mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], groupsBasePath: "/owner/groups" });
  await pick(run.page);
  await run.page.waitForSelector('[data-testid="enrol-note-past"]');
  const rows = await run.page.locator('[data-testid="enrol-note-past"]').evaluateAll((items) => items.map((li) => ({ text: li.innerText.replace(/\s+/g, " ").trim(), href: li.querySelector("a")?.getAttribute("href") })));
  assert.equal(rows.length, 2);
  assert.match(rows[0].text, /^Долг с прошлого раза 38 000 сум · в этой же группе, ушёл 17\.11\s+Выписка$/);
  assert.match(rows[1].text, /^Долг с прошлого раза 120 000 сум · в «Геометрия 8», ушёл 10\.11\s+Выписка$/);
  assert.equal(rows[0].href, "/owner/payments/statement/m-old-t");
  await run.page.close();
});

// ---- the drawer «Зачислить в группу» of the group page
const NAMES = ["Новый", "Второй", "Третий"];
const PEOPLE = [H.STUDENT("st9", "Новый", "Ученик"), H.STUDENT("st8", "Второй", "Ученик"), H.STUDENT("st7", "Третий", "Ученик")];
async function openDrawer(undoneIds, names, width = 1280, past = {}) {
  const run = await H.openDrawer(ctx, H.server({ people: PEOPLE, undone: undoneIds, past }), { width });
  for (const name of names) await H.pick(run.page, name);
  return run;
}
const added = async (page) => { await page.waitForFunction(() => window.__log.some((line) => line.startsWith("added:")), null, { timeout: 4000 }); return JSON.parse((await page.evaluate(() => window.__log)).filter((line) => line.startsWith("added:")).pop().slice(6)); };
const writes = (calls) => calls.filter((c) => c.method === "POST" && !X.isDry(c)).map((c) => ({ path: c.path, body: c.body ?? {} }));
const noFields = async (page) => {
  assert.equal(await page.locator('[data-testid="enrol-terms"], [data-testid="pay-from"], [data-testid="pay-from-line"]').count(), 0);
  assert.equal(await page.locator("#add-student-price-amount").count(), 0);
};

test("drawer, ONE chosen student who comes back the day of the leaving: the server's note from the ONE bulk probe in his row, no fields, ONE write without them", async () => {
  const run = await openDrawer(["st9"], ["Новый"]);
  await settled(run);
  assert.equal(await run.page.locator('[data-testid="leave-undo"], [data-testid="leave-undo-many"], [data-testid="leave-shared-note"]').count(), 0, "no plate of the old kind");
  assert.equal(plain(await run.page.locator('[data-testid="enrol-note-undone"]').innerText()), plain(H.UNDO));
  await noFields(run.page);
  assert.equal(X.bulkProbes(run.calls).length, 1, "one bulk probe");
  assert.equal(X.singleProbes(run.calls).length, 0, "no probe per student");
  await run.page.click('[data-testid="enrol-submit"]');
  await run.page.waitForTimeout(300);
  const sent = writes(run.calls);
  assert.equal(sent.length, 1, JSON.stringify(sent));
  for (const key of ["pay_from", "opening_balance", "price_override"]) assert.equal(sent[0].body[key], undefined, key);
  const summary = await added(run.page);
  assert.ok(summary.infos[0].startsWith(UNDO_START), JSON.stringify(summary.infos));
  await run.page.close();
});

test("drawer, 2 of 3 come back: ONE probe, a row each with the words of the server, «Оплата с» stays for the third; ONE write with all three and the common day", async () => {
  const run = await openDrawer(["st9", "st7"], NAMES);
  await settled(run);
  assert.equal(await run.page.locator('[data-testid="enrol-note-shared"]').count(), 0, "nothing common entered: no remark");
  assert.equal(await run.page.locator('[data-testid="enrol-note-undone"]').count(), 2, "a row for each one who comes back");
  await run.page.click('[data-testid="enrol-terms-toggle"]');
  assert.ok(await run.page.locator('[data-testid="pay-from"]').count() > 0, "the others still have «Оплата с»");
  await run.page.fill("#add-student-pay-from", "17.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForTimeout(700);
  assert.equal(X.singleProbes(run.calls).length, 0, "no probe per student");
  await run.page.waitForSelector('[data-testid="enrol-note-shared"]');
  const mine = (name) => run.page.locator('[data-testid="enrol-note-undone"]', { hasText: name });
  assert.match(plain(await mine("Новый Ученик").innerText()), new RegExp(`^Новый Ученик ${UNDO_START}`));
  assert.equal(await mine("Третий Ученик").count(), 1);
  assert.equal(await mine("Второй Ученик").count(), 0);
  assert.equal(await run.page.locator('[data-testid="enrol-note-shared"]').count(), 2, "each of them hears that the common day does not apply");
  await run.page.fill("#add-student-pay-from", "19.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForTimeout(700);
  assert.equal(await run.page.locator('[data-testid="enrol-note-shared"]').count(), 0, "the day is the default again: the remark is gone");
  await run.page.fill("#add-student-pay-from", "17.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForTimeout(700);
  await H.settled(run.page);
  await run.page.click('[data-testid="enrol-submit"]');
  await run.page.waitForTimeout(400);
  const sent = writes(run.calls);
  assert.equal(sent.length, 1, JSON.stringify(sent));
  assert.match(sent[0].path, /students\/bulk$/);
  assert.deepEqual([...sent[0].body.student_ids].sort(), ["st7", "st8", "st9"]);
  assert.ok(JSON.stringify(sent[0].body).includes("2026-11-17"), JSON.stringify(sent[0].body));
  const summary = await added(run.page);
  assert.ok(summary.infos.some((line) => line.startsWith(`Новый Ученик: ${UNDO_START}`)) && summary.infos.some((line) => line.startsWith("Третий Ученик:")), JSON.stringify(summary.infos));
  await run.page.close();
});

// The product collects the choices into ONE probe with a pause of 300 ms after the last choice (src/lib/use-pay-from.ts: the timer of `usePayFromPreview`).
// The RULE (merged inside the window, one ask after each choice when the pause is longer) is proved WITHOUT clicks: the entry mounts the real hook with the real ask of the drawer, the test changes the
// choices by call and winds the page's own clock (Playwright's, paused) - nothing waits for a frame under a stopped clock, and the speed of the machine decides nothing.
// The tests WITH clicks run on the real clock and say only what does not depend on speed (LESSONS 144, 190).
const WINDOW_MS = 300;
const asked = (run) => X.bulkProbes(run.calls).length;
const idsOf = (call) => [...call.body.student_ids].sort();
const waitAsked = async (run, count) => { for (let i = 0; i < 100 && asked(run) < count; i += 1) await new Promise((resolve) => setTimeout(resolve, 50)); };
async function openWindow() {
  const run = await H.openPage(ctx.browser, "pay-from-window.entry.tsx", H.server({ people: H.PEOPLE, undone: [], past: {} }));
  await run.page.clock.install({ time: new Date("2026-11-20T07:00:00Z") });
  await run.page.clock.pauseAt(new Date("2026-11-20T07:00:01Z"));   // from here the time of the page moves ONLY when the test winds it (`runFor`)
  await run.page.evaluate(() => window.mount());
  return run;
}
const choose = (run, ids) => run.page.evaluate((next) => window.choose(next), ids);
test("the window of the probe: choices that come inside 300 ms are merged into ONE ask with all three, none per student (the real hook, no clicks)", async () => {
  const run = await openWindow();
  for (const ids of [["st7"], ["st7", "st8"], ["st7", "st8", "st9"]]) { await choose(run, ids); await run.page.clock.runFor(WINDOW_MS - 100); }   // every pause is shorter than the window
  assert.equal(asked(run), 0, "nothing is asked while the choices keep coming");
  await run.page.clock.runFor(WINDOW_MS);
  await waitAsked(run, 1);
  await run.page.clock.runFor(WINDOW_MS * 3);   // a second ask, if the product wanted one, would be made now
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(asked(run), 1, JSON.stringify(X.bulkProbes(run.calls).map((c) => c.body)));
  assert.deepEqual(idsOf(X.bulkProbes(run.calls)[0]), ["st7", "st8", "st9"]);
  assert.equal(X.singleProbes(run.calls).length, 0);
  await run.page.close();
});

test("the window of the probe: a pause LONGER than 300 ms after each choice - an ask after each, each about everybody chosen so far (the choices are not merged, the real hook, no clicks)", async () => {
  const run = await openWindow();
  const sizes = [];
  for (const ids of [["st7"], ["st7", "st8"], ["st7", "st8", "st9"]]) {
    await choose(run, ids);
    await run.page.clock.runFor(WINDOW_MS + 50);
    await waitAsked(run, sizes.length + 1);
    sizes.push(X.bulkProbes(run.calls).at(-1)?.body.student_ids.length);
  }
  assert.equal(asked(run), 3, JSON.stringify(X.bulkProbes(run.calls).map((c) => c.body)));
  assert.deepEqual(sizes, [1, 2, 3], "each ask is about everybody chosen so far");
  assert.equal(X.singleProbes(run.calls).length, 0);
  await run.page.close();
});

const lastAsked = (run) => X.bulkProbes(run.calls).at(-1);
const waitLastHas = async (run, count) => { for (let i = 0; i < 100 && (lastAsked(run)?.body.student_ids.length ?? 0) < count; i += 1) await run.page.waitForTimeout(50); };
test("drawer, picking three students by clicks (real clock): the last bulk ask holds all three, none per student - how many asks came before depends on the speed and is not counted", async () => {
  const run = await openDrawer([], []);
  for (const name of NAMES) await H.pick(run.page, name);
  await waitLastHas(run, 3);
  assert.deepEqual(idsOf(lastAsked(run)), ["st7", "st8", "st9"]);
  await settled(run, 1);
  assert.deepEqual(idsOf(lastAsked(run)), ["st7", "st8", "st9"], "nothing later changed the last ask");
  assert.ok(asked(run) >= 1);
  assert.equal(X.singleProbes(run.calls).length, 0);
  await run.page.close();
});

test("drawer, picking three students with a pause longer than the window (real clock): after each choice the last ask holds everybody chosen so far, none per student", async () => {
  const run = await openDrawer([], []);
  const sizes = [];
  for (const name of NAMES) {
    await H.pick(run.page, name);
    await run.page.waitForTimeout(WINDOW_MS + 150);
    await waitLastHas(run, sizes.length + 1);
    sizes.push(lastAsked(run)?.body.student_ids.length);
  }
  assert.deepEqual(sizes, [1, 2, 3], "each ask is about everybody chosen so far");
  assert.equal(X.singleProbes(run.calls).length, 0);
  await run.page.close();
});

test("drawer, all come back: a row each, no fields, no «Оплата с» anywhere, ONE write (one request)", async () => {
  const run = await openDrawer(["st9", "st8"], ["Новый", "Второй"]);
  await settled(run);
  assert.equal(await run.page.locator('[data-testid="leave-undo-many"], [data-testid="enrol-note-shared"]').count(), 0, "all come back: no plate, no remark");
  assert.equal(await run.page.locator('[data-testid="enrol-note-undone"]').count(), 2);
  await noFields(run.page);
  await run.page.click('[data-testid="enrol-submit"]');
  await run.page.waitForTimeout(400);
  const sent = writes(run.calls);
  assert.equal(sent.length, 1, JSON.stringify(sent));
  assert.ok(sent[0].body.pay_from === undefined && sent[0].body.price_override === undefined);
  const summary = await added(run.page);
  assert.ok(summary.infos.length === 2 && summary.infos.every((line) => line.includes("возвращаем как было")), JSON.stringify(summary.infos));
  await run.page.close();
});

const SAME = { group_id: "g2", group_name: "7-Б Геометрия", membership_id: "m-same", left_on: "2026-11-17", kind: "debt", amount: 38000, same_group: true, text: "Уже был в этой группе, ушёл 17.11.2026 — остался долг 38 000 сум" };
const OTHER = (n) => ({ group_id: "gx" + n, group_name: "Алгебра " + n, membership_id: "m-x" + n, left_on: "2026-11-1" + n, kind: n === 2 ? "advance" : "debt", amount: 10000 * n, text: "Был в группе «Алгебра " + n + "», ушёл 1" + n + ".11.2026 — остался " + (n === 2 ? "аванс " : "долг ") + 10 * n + " 000 сум" });
test("drawer, ONE student with a debt of THIS group: the row says «в этой же группе» and the sum of the debt, the bar says the term of the server «К оплате до …»", async () => {
  const run = await openDrawer([], ["Новый"], 1280, { st9: [SAME] });
  await run.page.waitForSelector('[data-testid="enrol-note-past"]');
  const row = (await run.page.locator('[data-testid="enrol-note-past"]').evaluate((li) => li.innerText)).replace(/\s+/g, " ").trim();
  assert.match(row, /^Долг с прошлого раза 38 000 сум · в этой же группе, ушёл 17\.11( Выписка)?$/);
  assert.ok(!row.includes("Геометрия"), row);
  await H.settled(run.page);
  assert.equal(plain(await run.page.locator('[data-testid="summary-bar"] p').first().innerText()), "К оплате до 24.11");
  await run.page.close();
});

test("drawer, THREE students with balances: a row with the name for each student, no summary line, no disclosure", async () => {
  const run = await openDrawer([], NAMES, 1280, { st9: [SAME], st8: [OTHER(2)], st7: [OTHER(3)] });
  await run.page.waitForSelector('[data-testid="enrol-note-past"]');
  assert.equal(await run.page.locator('[data-testid="enrol-note-past"]').count(), 3);
  assert.equal(await run.page.locator('[data-testid="past-balances"], [data-testid="past-balances"] summary, [role="dialog"] details').count(), 0);
  const of = (name) => run.page.locator('[data-testid="enrol-note-past"]', { hasText: name });
  assert.match(plain(await of("Новый Ученик").textContent()), /^Новый Ученик — Долг с прошлого раза 38 000 сум · в этой же группе/);
  assert.match(plain(await of("Второй Ученик").textContent()), /^Второй Ученик — Аванс с прошлого раза 20 000 сум · в «Алгебра 2»/);
  assert.match(plain(await of("Третий Ученик").textContent()), /^Третий Ученик — Долг с прошлого раза 30 000 сум · в «Алгебра 3»/);
  await run.page.close();
});

// the walk reported: on 375 the first tap on «⋯» of a roster row did not open the menu, the second did - not reproduced (12 touch taps, with and without waiting for the data); the guard stays
test("375, touch: ONE tap on «⋯» of a roster row opens the menu", async () => {
  const M = require("./helpers/money2-fix7-menu.cjs");
  const { openPage } = require("./helpers/dom-page.cjs");
  const touch = { newPage: (options) => ctx.browser.newPage({ ...options, hasTouch: true, isMobile: true }) };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const run = await openPage(touch, "money-b.entry.tsx", M.groupServer, { width: 375, height: 812 });
    await run.page.evaluate(() => window.mount("groupHeader", { role: "owner", org_role: "owner" }, { refresh: true }));
    const button = run.page.locator('button[aria-label^="Действия: Номер1"]');
    await button.waitFor({ timeout: 8000 });
    const box = await button.boundingBox();
    await run.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await run.page.waitForSelector('[role="menu"]', { timeout: 2000 });
    await run.page.close();
  }
});

// item 4 (server fix MONEY2_FIX_STAGE6): coming back into the SAME group - the row of its debt + «К оплате до 24.11: 187 000 сум (за 5 уроков)»: the lessons and the sum are the server's fields, the bar arranges them
test("return to the same group: the debt row of the group and the sum of the server reach the screen without being rebuilt from numbers", async () => {
  const immediate = { amount: 187000, lessons: 5, text: "К оплате до 24.11: 187 000 сум (за 5 уроков)", lines: ["К оплате до 24.11: 187 000 сум (за 5 уроков)"], parts: [{ label: "ноябрь", from: "2026-11-04", amount: 187000, lessons: 5, lessons_in_period: 12, whole: false }] };
  const server = F.baseServer((request) => {
    if (request.method === "GET" && request.path === "/auth/org/groups/gt/pay-from-default") return { json: { today: "2026-11-06", first_lesson: "2026-11-09", default_pay_from: "2026-11-09", text: "Оплата с 09.11.2026 — ближайшее занятие группы" } };
    if (request.method === "POST" && request.path === "/auth/org/groups/gt/students/st1") {
      const past = request.body && request.body.pay_from;
      return { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, leave_undo: null, past_balances: BALANCE.slice(0, 1), billing: past ? { pay_from: request.body.pay_from, explicit: true, default_pay_from: "2026-11-09", first_lesson: "2026-11-09", text: "Оплата с 04.11.2026", immediate } : null } };
    }
    return null;
  });
  const run = await mount(ctx, server, "assign", OWNER, { moneyAvailable: true, mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], groupsBasePath: "/owner/groups" });
  await pick(run.page);
  await run.page.waitForSelector('[data-testid="enrol-note-past"]');
  await run.page.click('[data-testid="enrol-terms-toggle"]');
  await run.page.fill("#assign-group-pay-from", "04.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForSelector('[data-testid="summary-bar-sum"]');
  await H.settled(run.page).catch(() => {});
  const bar = plain(await run.page.locator('[data-testid="summary-bar"]').innerText());
  assert.match(bar, /^К оплате до 24\.11 187 000 сум .*5 уроков из 12 в ноябре$/, bar);
  assert.ok(!/Сразу начислится|ещё|Неполный месяц/.test(bar), bar);
  const debtRow = plain(await run.page.locator('[data-testid="enrol-note-past"]').innerText());
  assert.ok(debtRow.includes("38 000") && !/187 000/.test(debtRow), "the debt is a row of its own, not part of the sum");
  assert.ok(!/долг/i.test(bar), "the sum is not called a debt");
  assert.equal(await run.page.locator('[role="dialog"] [aria-label="Пояснение"]').count(), 0, "no «?»");
  await run.page.close();
});

// ---- no empty container when the leaving is undone (fix9): nothing to show -> nothing is drawn
for (const [label, props] of [
  ["mode add", { mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"] }],
  ["mode transfer", { mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] }],
]) {
  test(`card, leaving undone (${label}): no conditions and no empty block where the fields were`, async () => {
    const run = await mount(ctx, X.modalServer({ undone: true }), "assign", OWNER, { moneyAvailable: true, groupsBasePath: "/owner/groups", ...props });
    await pick(run.page);
    await settled(run);
    assert.equal(await run.page.locator('[data-testid="enrol-terms"], [data-testid="assign-price"]').count(), 0, "the conditions are absent");
    assert.equal(await run.page.evaluate(() => [...document.querySelectorAll('[data-testid="enrol-exceptions"]')].filter((el) => el.textContent.trim() === "").length), 0, "no empty block of special rows");
    await run.page.close();
  });
}

test("drawer, all come back: no conditions, no empty block where the fields were", async () => {
  const run = await openDrawer(["st9", "st8"], ["Новый", "Второй"]);
  await settled(run);
  assert.equal(await run.page.locator('[data-testid="enrol-terms"], [data-testid="add-price-settings"]').count(), 0, "the conditions are absent");
  assert.equal(await run.page.evaluate(() => [...document.querySelectorAll('[data-testid="enrol-exceptions"]')].filter((el) => el.textContent.trim() === "").length), 0);
  await run.page.close();
});
