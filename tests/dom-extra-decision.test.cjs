// «Деньги-1», обход stage 05.11, D-4 / D-5: the windows of an additional lesson - «Оплатить», «Не оплачивать», «Отменить решение» - in a real DOM.  The REAL components and hooks; the server
// answers through `route` in the shape of its contract (`MONEY1_A_SERVER_REPORT.md`, «Контракт для фронта»): the dry run `?dry_run=true`, `moneyEffects.payroll[]`, `periodClosed`, 409 `PERIOD_CLOSED`.
const assert = require("node:assert/strict");
const test = require("node:test");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { deferred } = require("./helpers/dom-answers.cjs");

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

const noise = (errors) => errors.filter((text) => !/404|Failed to load resource|409|422|500/.test(text));
const PERIOD_CLOSED = { code: "PERIOD_CLOSED", message: "Месяц ноябрь 2026 у преподавателя Каримова К. закрыт: ведомость сохранена 02.11.2026. Чтобы изменить урок, владелец или администратор с правом оплат сначала переоткрывает месяц", month: "2026-11", teacherId: "t1", teacherName: "Каримова К.", closedOn: "2026-11-02" };
const ITEM = (over = {}) => ({ lessonId: "l1", groupId: "g1", groupName: "7-А Алгебра", lessonDate: "2026-11-03", startTime: "16:00", endTime: "17:00", purpose: "extra", title: "Дополнительный урок — оплатить преподавателю?",
  teacher: { id: "t1", name: "Каримова К." }, createdBy: { id: "o1", name: "Арслан", role: "owner" }, studentsPresent: 2, studentsTotal: 3, studentsPaid: 3,
  moneyEstimate: { amount: 125000, reason: null }, payrollSheet: { month: "2026-11", status: "unpaid" }, periodClosed: false, ...over });
const SHEET = (over = {}) => ({ month: "2026-11", state: "open", sheetId: "sh1", teacherId: "t1", teacherName: "Каримова К.", savedTotal: 0, paid: 0, freshBefore: 0, freshAfter: 125000, freshTotal: 125000, changedBy: 125000, driftAfter: 125000, ...over });
const answerOf = (payroll, dryRun) => ({ lessonId: "l1", money: "paid", month: "2026-11", dryRun, payrollSheet: { month: "2026-11", status: "unpaid" }, moneyEffects: { students: [], payroll, text: "", dryRun } });
const isDry = (call) => /dry_run=true/.test(call.query);
const decisionCalls = (calls) => calls.filter((call) => call.path.endsWith("/money-decision"));
const flat = async (page, selector) => (await page.textContent(selector)).replace(/\s+/g, " ").replace(/ /g, " ");

async function open(answer, props, user) {
  const run = await openPage(browser, "money.entry.tsx", answer);
  await run.page.evaluate(([who, p]) => window.mount("decisions", who, p), [user, props]);
  await run.page.waitForSelector('[data-testid="one-off-decision-row"]');
  return run;
}
const OWNER = { role: "owner", org_role: "owner" };
const ADMIN_RIGHT = { role: "admin", org_role: "admin", payments_access: true };

test("D-4: «Оплатить» - the window first asks the server what the decision does (dry run), shows «Ведомость …: A → B» with the sum once, and the real request goes only after it", async () => {
  const hold = deferred();
  const { page, calls, errors } = await open((request) => {
    if (!request.path.endsWith("/money-decision")) return null;
    return isDry(request) ? hold.promise.then(() => ({ json: answerOf([SHEET()], true) })) : { json: { ...answerOf([SHEET()], false), dryRun: false } };
  }, { items: [ITEM()] }, OWNER);
  await page.click('button[aria-label^="Оплатить"]');
  await page.waitForSelector('[data-testid="money-effects"][data-state="loading"]');
  assert.equal(await page.isDisabled('[data-testid="one-off-decision-confirm"]'), true, "the button waits for the answer about the money");
  assert.equal(decisionCalls(calls).filter((call) => !isDry(call)).length, 0);
  hold.open();
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  const effects = await flat(page, '[data-testid="money-effects"]');
  assert.match(effects, /Ведомость Каримова К\., ноябрь 2026: 0 сум → 125 000 сум \(\+125 000 сум\)/);
  const dialog = await flat(page, '[role="dialog"]');
  assert.equal((dialog.match(/125\s000/g) || []).length, 2, "the sum of the sheet (after, change) - the estimate of the row is not said a third time");
  assert.ok(!dialog.includes("Преподавателю ≈"), "the estimate is the line of the sheet now");
  assert.match(dialog, /Оплата — по числу учеников: 3/);
  assert.ok(!dialog.includes("Ведомость за ноябрь 2026 г. уже"), "an unpaid sheet: no extra warning");
  await page.click('[data-testid="one-off-decision-confirm"]');
  await page.waitForFunction(() => window.__log.includes("decided:l1"));
  const sent = decisionCalls(calls);
  assert.deepEqual(sent.map((call) => [isDry(call), call.body]), [[true, { decision: "pay" }], [false, { decision: "pay" }]], "the same body, the dry run first; the real one is not a dry run");
  assert.deepEqual(noise(errors), []);
  await page.close();
});

test("D-4: a month with no saved sheet - the block says so (not «деньги не изменятся») and the estimate of the row stays; «Не оплачивать» moves nothing", async () => {
  const { page, calls } = await open((request) => (request.path.endsWith("/money-decision") ? { json: answerOf([], true) } : null), { items: [ITEM()] }, OWNER);
  await page.click('button[aria-label^="Оплатить"]');
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  assert.match(await flat(page, '[data-testid="money-effects-none"]'), /Ведомость за этот месяц ещё не сохранена: урок войдёт в неё при сохранении/);
  assert.match(await flat(page, '[role="dialog"]'), /Преподавателю ≈ 125 000 сум/);
  assert.ok(!(await flat(page, '[role="dialog"]')).includes("Деньги не изменятся"));
  await page.click('[role="dialog"] >> text=Отмена');
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
  await page.click('button[aria-label^="Не оплачивать"]');
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  assert.match(await flat(page, '[data-testid="money-effects-none"]'), /Деньги не изменятся/);
  assert.deepEqual(decisionCalls(calls).map((call) => call.body.decision), ["pay", "skip"], "only dry runs: nothing was decided");
  await page.close();
});

test("D-4: an administrator with the right sees the month and the state of the sheet, no sum and no estimate (LESSONS 45)", async () => {
  const sheet = { month: "2026-11", state: "open" };
  const { page } = await open((request) => (request.path.endsWith("/money-decision") ? { json: answerOf([sheet], true) } : null), { items: [ITEM({ moneyEstimate: undefined, payrollSheet: { month: "2026-11", status: null } })] }, ADMIN_RIGHT);
  await page.click('button[aria-label^="Оплатить"]');
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  const dialog = await flat(page, '[role="dialog"]');
  assert.match(dialog, /Изменится ведомость: ноябрь 2026/);
  assert.ok(!/[\d]\s?\d{3}\s*сум/.test(dialog), `no sum for an administrator: ${dialog}`);
  assert.ok(!dialog.includes("Ведомость за ноябрь 2026 г. уже сохранена"), "the administrator's «уже сохранена» is the block above, not said twice");
  await page.close();
});

test("D-4: the owner is told that the sheet is already paid (the one fact the block does not carry)", async () => {
  const { page } = await open((request) => (request.path.endsWith("/money-decision") ? { json: answerOf([SHEET({ savedTotal: 125000, freshBefore: 125000, freshAfter: 250000, changedBy: 125000 })], true) } : null),
    { items: [ITEM({ payrollSheet: { month: "2026-11", status: "settled" } })] }, OWNER);
  await page.click('button[aria-label^="Оплатить"]');
  await page.waitForSelector('[data-testid="one-off-decision-warning"]');
  assert.match(await flat(page, '[data-testid="one-off-decision-warning"]'), /Ведомость за ноябрь 2026 г\. выплачена — изменится сумма/);
  await page.close();
});

test("D-4: a closed month - the row has its buttons off and «Переоткрыть месяц» at once (periodClosed), nothing can be sent", async () => {
  const { page, calls } = await open(() => null, { items: [ITEM({ periodClosed: true })] }, OWNER);
  assert.equal(await page.getAttribute('[data-testid="one-off-decision-row"]', "data-period-closed"), "true");
  assert.equal(await page.isDisabled('button[aria-label^="Оплатить"]'), true);
  assert.equal(await page.isDisabled('button[aria-label^="Не оплачивать"]'), true);
  assert.match(await flat(page, '[data-testid="period-closed"]'), /Месяц закрыт ведомостью — сначала переоткройте его, потом решите/);
  assert.equal(await page.locator('[data-testid="period-closed-reopen"]').count(), 1, "the way out for who has the right");
  assert.equal(decisionCalls(calls).length, 0, "no request at all");
  await page.close();
  // an administrator WITHOUT the right sees the queue and no buttons (no notice either: it is not his task)
  const view = await openPage(browser, "money.entry.tsx", () => null);
  await view.page.evaluate(() => window.mount("decisions", { role: "admin", org_role: "admin", payments_access: false }, { items: [{ lessonId: "l1", groupId: "g1", groupName: "7-А Алгебра", lessonDate: "2026-11-03", startTime: "16:00", endTime: "17:00", purpose: "extra", title: "x", teacher: { id: "t1", name: "Каримова К." }, createdBy: null, studentsPresent: 2, studentsTotal: 3, payrollSheet: null, periodClosed: true }], canDecide: false }));
  await view.page.click('[data-testid="one-off-decisions-toggle"]');
  await view.page.waitForSelector('[data-testid="one-off-decision-row"]');
  assert.equal(await view.page.locator('[data-testid="period-closed"]').count(), 0);
  assert.equal(await view.page.locator("button[aria-label^='Оплатить']").count(), 0);
  await view.page.close();
});

test("D-4: 409 PERIOD_CLOSED of the dry run - the same refusal as an excuse («Переоткрыть месяц» inside the block), the button off, the real request never goes", async () => {
  const { page, calls } = await open((request) => (request.path.endsWith("/money-decision") ? { status: 409, json: { detail: PERIOD_CLOSED } } : null), { items: [ITEM()] }, OWNER);
  await page.click('button[aria-label^="Оплатить"]');
  await page.waitForSelector('[data-testid="period-closed"]');
  assert.match(await flat(page, '[data-testid="money-effects"]'), /Месяц ноябрь 2026 у преподавателя Каримова К\. закрыт/);
  assert.equal(await page.locator('[data-testid="period-closed-reopen"]').count(), 1);
  assert.equal(await page.isDisabled('[data-testid="one-off-decision-confirm"]'), true);
  assert.equal(decisionCalls(calls).filter((call) => !isDry(call)).length, 0);
  await page.close();
  // a person without the right of money reads the sentence and has no button to reopen (it is the owner's)
  const admin = await open((request) => (request.path.endsWith("/money-decision") ? { status: 409, json: { detail: PERIOD_CLOSED } } : null), { items: [ITEM()] }, { role: "admin", org_role: "admin", payments_access: true });
  await admin.page.click('button[aria-label^="Оплатить"]');
  await admin.page.waitForSelector('[data-testid="period-closed"]');
  assert.equal(await admin.page.isDisabled('[data-testid="one-off-decision-confirm"]'), true);
  await admin.page.close();
});

test("D-4: the month was closed between the preview and the press (409 on the real request) - the window asks again and shows the refusal; no «не удалось сохранить»", async () => {
  let closed = false;
  const { page, calls } = await open((request) => {
    if (!request.path.endsWith("/money-decision")) return null;
    if (closed) return { status: 409, json: { detail: PERIOD_CLOSED } };
    if (isDry(request)) return { json: answerOf([SHEET()], true) };
    closed = true;
    return { status: 409, json: { detail: PERIOD_CLOSED } };
  }, { items: [ITEM()] }, OWNER);
  await page.click('button[aria-label^="Оплатить"]');
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  await page.click('[data-testid="one-off-decision-confirm"]');
  await page.waitForSelector('[data-testid="period-closed"]');
  assert.equal(await page.locator('[data-testid="one-off-decision-error"]').count(), 0, "the refusal is told by the block, not as a failure of saving");
  assert.equal(await page.isDisabled('[data-testid="one-off-decision-confirm"]'), true);
  assert.deepEqual(decisionCalls(calls).map(isDry), [true, false, true], "preview, the real one (refused), the preview again");
  await page.close();
});

test("D-4: a failed dry run (not a closed month) holds the button and offers «Повторить»; after it the decision can be taken", async () => {
  let fail = true;
  const { page } = await open((request) => {
    if (!request.path.endsWith("/money-decision")) return null;
    if (isDry(request)) return fail ? { status: 500, json: { detail: { code: "BOOM", message: "boom" } } } : { json: answerOf([SHEET()], true) };
    return { json: answerOf([SHEET()], false) };
  }, { items: [ITEM()] }, OWNER);
  await page.click('button[aria-label^="Оплатить"]');
  await page.waitForSelector('[data-testid="money-effects-retry"]');
  assert.equal(await page.isDisabled('[data-testid="one-off-decision-confirm"]'), true);
  fail = false;
  await page.click('[data-testid="money-effects-retry"]');
  await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  assert.equal(await page.isDisabled('[data-testid="one-off-decision-confirm"]'), false);
  await page.close();
});

const DECIDED = { lessonId: "l9", groupId: "g1", groupName: "7-А Алгебра", lessonDate: "2026-11-03", startTime: "16:00", endTime: "17:00", purpose: "extra", title: "…", teacher: { id: "t1", name: "Каримова К." }, createdBy: null,
  studentsPresent: 2, studentsTotal: 3, payrollSheet: null, money: "paid", decidedAt: "2026-11-04T09:30:00", decidedBy: { id: "o1", name: "Арслан", role: "owner" }, canUndo: true, periodClosed: false };

test("D-5: «Отменить решение» - the window says what the sheet loses («125 000 → 0») before the press; in a closed month it is off at once with «Переоткрыть месяц»", async () => {
  const month = new Date().toISOString().slice(0, 7);
  const undo = { payroll: [SHEET({ savedTotal: 125000, freshBefore: 125000, freshAfter: 0, freshTotal: 0, changedBy: -125000, driftAfter: -125000 })], text: "", dryRun: true, students: [] };
  const run = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.path === "/auth/org/one-off-decisions/decided") return { json: { total: 1, items: [{ ...DECIDED, lessonDate: `${month}-03` }] } };
    if (request.path.endsWith("/money-decision")) return isDry(request) ? { json: { lessonId: "l9", money: "wait", dryRun: true, payrollSheet: null, moneyEffects: undo } } : { json: { lessonId: "l9", money: "wait", dryRun: false, payrollSheet: null } };
    return null;
  });
  await run.page.evaluate(() => window.mount("decided"));
  await run.page.waitForSelector('[data-testid="decided-undo"]');
  await run.page.click('[data-testid="decided-undo"]');
  await run.page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  assert.match(await flat(run.page, '[data-testid="money-effects"]'), /Ведомость Каримова К\., ноябрь 2026: 125 000 сум → 0 сум \(−125 000 сум\)/);
  assert.ok(!(await flat(run.page, '[role="dialog"]')).includes("Сейчас урок оплачивается преподавателю"), "no second telling of the same");
  await run.page.close();

  const closed = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.path === "/auth/org/one-off-decisions/decided") return { json: { total: 1, items: [DECIDED] } };
    if (request.path.endsWith("/money-decision")) return { status: 409, json: { detail: PERIOD_CLOSED } };
    return null;
  });
  await closed.page.evaluate(() => window.mount("decided"));
  await closed.page.waitForSelector('[data-testid="decided-undo"]');
  await closed.page.click('[data-testid="decided-undo"]');
  await closed.page.waitForSelector('[data-testid="period-closed"]');
  assert.equal(await closed.page.isDisabled('[data-testid="undo-decision-submit"]'), true, "off at once - no refusal after the press");
  assert.equal(await closed.page.locator('[data-testid="period-closed-reopen"]').count(), 1);
  assert.equal(decisionCalls(closed.calls).filter((call) => !isDry(call)).length, 0);
  await closed.page.close();
});
