// «Деньги-1», повторный обход stage 05.11, R2-4: a mistaken «Урока не было» of TODAY's lesson (its start has passed) is returned to the review at once - the column of the journal has «⋯» with
// «Вернуть в разбор», the same window (deductions, month) and the same right as for an earlier day; a lesson of today that has not begun is not offered it (it is taken back from the schedule).
// The REAL journal in a real DOM; the server answers through `route`; the clock of the page is fixed (LESSONS 37, 76: the test does not depend on the hour it is run).
const assert = require("node:assert/strict");
const test = require("node:test");
const { launch, openPage } = require("./helpers/dom-page.cjs");

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

// 06.11.2026 09:00 in Tashkent (UTC+5)
const NOW = new Date("2026-11-06T09:00:00+05:00");
const TODAY = "2026-11-06";
const STUDENT = { id: "st1", first_name: "Иван", last_name: "Иванов", full_name: "Иванов Иван", class_level: 7, status: "active", group_id: "g1", current_group_id: "g1", groups_count: 1 };
const lesson = (id, date, startTime, endTime) => ({ id, instanceKey: `${date}_${id}`, date, startTime, endTime, status: "cancelled" });
const LESSONS = [
  lesson("a", "2026-11-05", "10:00", "11:00"),       // an earlier day: always was offered
  lesson("b", TODAY, "08:00", "09:00"),               // today, begun
  lesson("c", TODAY, "18:00", "19:00"),               // today, not begun
];
const attendance = (extra = {}) => ({ groupId: "g1", month: "2026-11", lessons: LESSONS, records: {}, statuses: Object.fromEntries(LESSONS.map((item) => [item.instanceKey, "cancelled"])),
  cancellationKinds: Object.fromEntries(LESSONS.map((item) => [item.instanceKey, "centre"])), cancellationReasons: {}, versions: {}, excuses: {}, corrections: {}, lessonTeachers: {}, rosterStudentIds: {}, ...extra });
const DEDUCTIONS = [{ studentId: "st1", name: "Иванов Иван", amount: 40000 }];
const RESTORE_DRY = { ok: true, restored: true, dryRun: true, returnedToReview: true, lessonId: "b", lessonDate: TODAY, previousKind: "centre", deductions: DEDUCTIONS,
  moneyEffects: { students: [], payroll: [{ month: "2026-11", state: "open" }], text: "У 1 ученика исчезнет вычет за этот урок: 40 000 сум", dryRun: true } };

async function open(user, answer) {
  const run = await openPage(browser, "money.entry.tsx", (request) => {
    if (request.method === "GET" && /\/auth\/org\/groups\/g1\/attendance$/.test(request.path)) return { json: attendance() };
    return answer ? answer(request) : null;
  });
  await run.page.clock.setFixedTime(NOW);
  await run.page.evaluate(([who, props]) => window.mount("journal", who, props), [user, { students: [STUDENT], month: "2026-11" }]);
  await run.page.waitForSelector('button[aria-label^="Действия с уроком"]', { timeout: 15000 }).catch(() => null);
  return run;
}
const menuOf = async (page, ddmm) => {
  const trigger = page.locator(`button[aria-label="Действия с уроком ${ddmm}"]`);
  if (await trigger.count() === 0) return null;
  await trigger.first().click();
  const items = (await page.locator('[role="menuitem"]').allTextContents()).map((text) => text.replace(/\s+/g, " ").trim());
  await page.keyboard.press("Escape");
  return items;
};

test("R2-4: the owner - «Вернуть в разбор» of a mistaken «Урока не было» of today (begun) as well as of an earlier day; a lesson of today that has not begun has no menu", async () => {
  const { page } = await open({ role: "owner", org_role: "owner" });
  await page.waitForSelector("table");
  assert.deepEqual(await menuOf(page, "05.11.2026"), ["Вернуть в разбор"], "an earlier day, as before");
  const today = await page.locator('button[aria-label^="Действия с уроком 06.11.2026"]').count();
  assert.equal(today, 1, "today: one column has the menu (the lesson that has begun), the other (not begun) has none");
  assert.deepEqual(await menuOf(page, "06.11.2026"), ["Вернуть в разбор"]);
  await page.close();
});

test("R2-4: the window is the same as for an earlier day - the deductions of the students and the month - and «Вернуть в разбор» of today's lesson goes to the server (restore) with the dry run first", async () => {
  const seen = [];
  const { page } = await open({ role: "admin", org_role: "admin", payments_access: true }, (request) => {
    if (request.method === "POST" && request.path === "/auth/org/groups/g1/lessons/restore") {
      seen.push(request.body);
      return { json: request.body.dryRun ? RESTORE_DRY : { ...RESTORE_DRY, dryRun: false, moneyEffects: { ...RESTORE_DRY.moneyEffects, dryRun: false } } };
    }
    return null;
  });
  await page.waitForSelector("table");
  await page.locator('button[aria-label^="Действия с уроком 06.11.2026"]').first().click();
  await page.click('[data-testid="menu-return-review"]');
  await page.waitForSelector('[data-testid="return-review-deductions"]');
  assert.match((await page.textContent('[data-testid="return-review-deductions"]')).replace(/\s+/g, " "), /Иванов Иван/);
  assert.equal(seen[0].dryRun, true);
  assert.equal(seen[0].lessonDate, TODAY);
  await page.fill("#return-review-reason", "ошибочно нажали «Урока не было»");
  await page.click('[data-testid="return-review-submit"]');
  await page.waitForTimeout(400);
  assert.equal(seen.length, 2, "the dry run and the real request");
  assert.equal(seen[1].dryRun, undefined, "the real request is not a dry run");
  await page.close();
});

test("R2-4: without the money right there is no menu at all (a day off and the original of a move are not returned either)", async () => {
  const { page } = await open({ role: "admin", org_role: "admin", payments_access: false });
  await page.waitForSelector("table");
  assert.equal(await page.locator('button[aria-label^="Действия с уроком"]').count(), 0);
  await page.close();
  const dayOff = await openPage(browser, "money.entry.tsx", (request) => (/\/attendance$/.test(request.path) ? { json: attendance({ cancellationKinds: Object.fromEntries(LESSONS.map((item) => [item.instanceKey, "day_off"])) }) } : null));
  await dayOff.page.clock.setFixedTime(NOW);
  await dayOff.page.evaluate(([who, props]) => window.mount("journal", who, props), [{ role: "owner", org_role: "owner" }, { students: [STUDENT], month: "2026-11" }]);
  await dayOff.page.waitForSelector("table");
  assert.equal(await dayOff.page.locator('button[aria-label^="Действия с уроком"]').count(), 0, "a day off is undone by the day off itself");
  await dayOff.page.close();
});
