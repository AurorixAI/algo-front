// «Деньги-1», пакет А, R3: the two lists of the round in a real DOM - «Требует разбора» by month (item 8, m6) and the decided additional lessons (item 14, n7).
const assert = require("node:assert/strict");
const test = require("node:test");
const { launch, openPage } = require("./helpers/dom-page.cjs");

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

const lesson = (over) => ({ actionType: "missed", groupId: "g1", groupName: "7-А Алгебра", classLevel: 7, lessonId: "l1", lessonDate: "2026-09-14", subject: "Алгебра", startTime: "10:00", endTime: "11:00", markedCount: 0, rosterCount: 8, remainingCount: 8, teacherId: "11111111-2222-3333-4444-555555555555", teacherName: "Каримова К.", ...over });
const BY_MONTH = { total: 3, since: "2026-09-01", months: [
  { month: "2026-09", title: "Сентябрь 2026", count: 2, missed: 1, inProgress: 1, items: [lesson({}), lesson({ lessonId: "l2", groupName: "9-Б Геометрия", actionType: "in_progress", lessonDate: "2026-09-20", markedCount: 3, remainingCount: 5, teacherId: "22222222-2222-3333-4444-555555555555", teacherName: "Рахимов Т." })] },
  { month: "2026-10", title: "Октябрь 2026", count: 1, missed: 1, inProgress: 0, items: [lesson({ lessonId: "l3", lessonDate: "2026-10-05" })] },
] };
const server = (request) => (request.path === "/auth/org/attendance/open-actions/by-month" ? { json: BY_MONTH } : null);

test("item 8: the months in the order of the server, the counters, the day the list starts from, the group in the row; «Отметить» leads to the journal with the teacher of the row", async () => {
  const { page, calls } = await openPage(browser, "money.entry.tsx", server);
  await page.evaluate(() => window.mount("openLessons"));
  await page.waitForSelector('[data-testid="open-month"]');
  const text = (await page.textContent("body")).replace(/\s+/g, " ");
  assert.match(text, /Показаны неразобранные уроки с 01\.09\.2026/);
  assert.ok(text.indexOf("Сентябрь 2026 · 2 урока") < text.indexOf("Октябрь 2026 · 1 урок"), "the oldest month first");
  assert.match(text, /не отмечено 1 · не завершено 1/);
  assert.match(text, /7-А Алгебра/);
  assert.match(text, /9-Б Геометрия/);
  const hrefs = await page.$$eval('[data-testid="open-lesson-action"]', (links) => links.map((link) => link.getAttribute("href")));
  assert.equal(hrefs.length, 3);
  assert.match(hrefs[0], /^\/owner\/groups\/g1\?tab=attendance&month=2026-09&lesson=l1&date=2026-09-14&teacher=11111111-2222-3333-4444-555555555555$/);
  assert.ok(calls.some((call) => call.path === "/auth/org/attendance/open-actions/by-month"));
  await page.close();
});

test("m6: an administrator WITHOUT the money right sees why a lesson nobody started has no «Отметить»; the lesson that is going on keeps «Открыть»", async () => {
  const { page } = await openPage(browser, "money.entry.tsx", server);
  await page.evaluate(() => window.mount("openLessons", { role: "admin", org_role: "admin", payments_access: false }));
  await page.waitForSelector('[data-testid="open-month"]');
  const reasons = await page.$$eval('[data-testid="open-lesson-no-right"]', (nodes) => nodes.map((node) => node.textContent));
  assert.deepEqual(reasons, ["Оформить прошедший урок может владелец или администратор с правом на деньги", "Оформить прошедший урок может владелец или администратор с правом на деньги"], "one for each lesson nobody started");
  const buttons = await page.$$eval('[data-testid="open-lesson-action"]', (links) => links.map((link) => link.textContent));
  assert.equal(buttons.length, 1, "only the lesson that is going on");
  await page.close();
  const withRight = await openPage(browser, "money.entry.tsx", server);
  await withRight.page.evaluate(() => window.mount("openLessons", { role: "admin", org_role: "admin", payments_access: true }));
  await withRight.page.waitForSelector('[data-testid="open-month"]');
  assert.equal(await withRight.page.locator('[data-testid="open-lesson-no-right"]').count(), 0);
  assert.equal(await withRight.page.locator('[data-testid="open-lesson-action"]').count(), 3);
  await withRight.page.close();
});

const DECIDED = { lessonId: "l9", groupId: "g1", groupName: "7-А Алгебра", lessonDate: "2026-10-27", startTime: "16:00", endTime: "17:00", purpose: "extra", title: "…", teacher: { id: "t1", name: "Каримова К." }, createdBy: null,
  studentsPresent: 2, studentsTotal: 3, payrollSheet: null, money: "paid", decidedAt: "2026-10-28T09:30:00", decidedBy: { id: "o1", name: "Арслан", role: "owner" }, canUndo: true, periodClosed: false };

test("item 14 / n7: the decided lessons of the month; «Отменить решение» is labelled with a Russian date; after the undo the list is read again and the waiting list too", async () => {
  let undone = false;
  const { page, calls } = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.path === "/auth/org/one-off-decisions/decided") return { json: { total: undone ? 0 : 1, items: undone ? [] : [DECIDED] } };
    if (request.path === "/auth/org/one-off-lessons/l9/money-decision") { undone = true; return { json: { lessonId: "l9", money: "wait", payrollSheet: null } }; }
    return null;
  });
  await page.evaluate(() => window.mount("decided"));
  await page.waitForSelector('[data-testid="decided-row"]');
  const label = await page.getAttribute('[data-testid="decided-undo"]', "aria-label");
  assert.match(label, /Отменить решение: 7-А Алгебра, 27\.10\.2026/, "a date a screen reader can read");
  assert.doesNotMatch(label, /2026-10-27/);
  assert.match((await page.textContent('[data-testid="decided-by"]')).replace(/\s+/g, " "), /Оплачен преподавателю · решил Арслан · 28\.10\.2026 09:30/);
  await page.click('[data-testid="decided-undo"]');
  await page.click('[data-testid="undo-decision-submit"]');
  await page.waitForFunction(() => window.__log.includes("changed"));
  // D-5: the window asks first what taking the decision back does (the dry run), the button waits for it, then the real request goes - the same body both times
  const decisionCalls = calls.filter((call) => call.path.endsWith("/money-decision"));
  assert.deepEqual(decisionCalls.map((call) => [/dry_run=true/.test(call.query), call.body]), [[true, { decision: "undo" }], [false, { decision: "undo" }]]);
  await page.waitForSelector('[data-testid="decided-empty"]');
  await page.close();
});
