// Money-2 fix 9 (walk M12, defect 2): the plate «возвращается в день ухода — уход отменяется» of the drawer «Зачислить учеников» was drawn from the answer of the CURRENT key of the probe, and the key changes with every
// press (price, reason, day) and is null while the form of the price or the day is half filled - so the plate flickered away for the time of each new probe (a slow answer, a field being typed) and a look
// at the wrong moment saw none.  Who comes back the day of the leaving depends on the group and the chosen students only: the last answer of THIS set stays while a new probe runs or the form is half filled;
// another set of students - the old plate is not shown.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const X = require("./helpers/money2-fix7.cjs");

const ctx = setup(test);
const PLATE = '[data-testid="leave-undo"], [data-testid="leave-undo-many"]';
const PEOPLE = [["st9", "Новый"], ["st8", "Второй"], ["st7", "Третий"], ["st6", "Четвёртый"]];
const SLOW_MS = 700;

// the bulk dry run answers slowly (like a real network under load); everything else at once
function slowServer(undoneIds) {
  const base = X.drawerServer(undoneIds, (r) => (r.method === "GET" && r.path === "/auth/org/students" ? { json: { items: PEOPLE.map(([id, last]) => X.STUDENT(id, last)), total: 4 } } : null));
  return async (request) => {
    if (request.method === "POST" && /\/students\/bulk$/.test(request.path) && X.isDry(request)) await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    return base(request);
  };
}
async function open(undoneIds, chosen) {
  const run = await openPage(ctx.browser, "money-b.entry.tsx", slowServer(undoneIds), { width: 1280, height: 900 });
  await run.page.evaluate(() => window.mount("addDrawer", { role: "owner", org_role: "owner" }, { summary: { accountingStart: "2026-09-01" }, refresh: false }));
  await run.page.fill('input[placeholder^="Поиск по имени"]', "ье");
  await run.page.waitForTimeout(500);
  await run.page.fill('input[placeholder^="Поиск по имени"]', "");
  await run.page.fill('input[placeholder^="Поиск по имени"]', "ов");
  for (const last of chosen) await run.page.click(`button:has-text("${last} Ученик")`);
  await run.page.waitForSelector(PLATE, { timeout: 4000 });
  return run;
}
const plates = (page) => page.locator(PLATE).count();

test("the plate stays while the price form is filled (the key changes on every press and is null while the reason is empty)", async () => {
  const run = await open(["st9"], ["Новый", "Второй", "Третий", "Четвёртый"]);
  const before = X.bulkProbes(run.calls).length;
  await run.page.click('button[role="switch"]:has-text("Индивидуальная цена")');
  assert.equal(await plates(run.page), 1, "the form of the price opened (the key is null)");
  await run.page.fill("#add-student-price-amount", "380000");
  assert.equal(await plates(run.page), 1, "an amount without a reason (the key is null)");
  await run.page.locator("#add-student-price-reason").pressSequentially("Скидка", { delay: 40 });
  await run.page.waitForTimeout(350);
  assert.equal(await plates(run.page), 1, "the new probe is running (the key changed)");
  await run.page.waitForTimeout(SLOW_MS + 300);
  assert.equal(await plates(run.page), 1, "the new answer came");
  assert.equal(X.bulkProbes(run.calls).length - before, 1, "ONE probe for the finished form, none for the half filled one");
  await run.page.fill("#add-student-price-reason", "");
  assert.equal(await plates(run.page), 1, "the reason erased");
  assert.equal(X.singleProbes(run.calls).length, 0);
  await run.page.close();
});

test("the plate stays while «Оплата с» is retyped (a half typed day is not a day: the key is null)", async () => {
  const run = await open(["st9"], ["Новый", "Второй", "Третий"]);
  await run.page.waitForSelector("#add-student-pay-from");
  await run.page.fill("#add-student-pay-from", "08.1");
  assert.equal(await plates(run.page), 1, "half typed day");
  await run.page.fill("#add-student-pay-from", "");
  assert.equal(await plates(run.page), 1, "empty day");
  await run.page.fill("#add-student-pay-from", "08.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForTimeout(400);
  assert.equal(await plates(run.page), 1, "a new day, the probe runs");
  await run.page.waitForTimeout(SLOW_MS + 300);
  assert.equal(await plates(run.page), 1);
  await run.page.close();
});

test("another set of students: the plate of the old set is NOT shown for the new one; it comes with the answer", async () => {
  const run = await open(["st9"], ["Новый", "Второй"]);
  await run.page.click('button:has-text("Третий Ученик")');
  assert.equal(await plates(run.page), 0, "the set changed - nothing of the old set is shown while the new probe runs");
  await run.page.waitForSelector(PLATE, { timeout: 4000 });
  // the one who comes back is taken off: the new set has nobody who comes back - after its answer no plate at all, while it runs none either
  await run.page.click('button:has-text("Новый Ученик")');
  assert.equal(await plates(run.page), 0, "the set without the returning student: no plate for the time of the probe");
  await run.page.waitForTimeout(SLOW_MS + 600);
  assert.equal(await plates(run.page), 0, "and after the answer");
  await run.page.close();
});
