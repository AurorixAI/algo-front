// Money-2 fix 9 (walk M12, defect 2): the line «На N ученика общие цена и дата не действуют» (Money-2 fix 10B: it replaced the plate «Ученика убрали сегодня — вернётся как был», which is gone) of the drawer «Зачислить учеников» was drawn from the answer of the CURRENT key of the probe, and the key changes with every
// press (price, reason, day) and is null while the form of the price or the day is half filled - so the plate flickered away for the time of each new probe (a slow answer, a field being typed) and a look
// at the wrong moment saw none.  Who comes back the day of the leaving depends on the group and the chosen students only: the last answer of THIS set stays while a new probe runs or the form is half filled;
// another set of students - the old plate is not shown.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const X = require("./helpers/money2-fix7.cjs");

const ctx = setup(test);
const PLATE = '[data-testid="leave-shared-note"]';
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
  for (let i = 0; i < 60 && X.bulkProbes(run.calls).length < 1; i += 1) await run.page.waitForTimeout(100);
  await run.page.waitForTimeout(SLOW_MS + 300);
  return run;
}
const plates = (page) => page.locator(PLATE).count();

test("the line stays while the price form is filled: a valid price shows it at once from the last answer of this set, the new probe does not blink it", async () => {
  const run = await open(["st9"], ["Новый", "Второй", "Третий", "Четвёртый"]);
  assert.equal(await plates(run.page), 0, "nothing common entered: no line");
  const before = X.bulkProbes(run.calls).length;
  await run.page.click('button[role="switch"]:has-text("Индивидуальная цена")');
  await run.page.fill("#add-student-price-amount", "380000");
  assert.equal(await plates(run.page), 0, "an amount without a reason is not a price yet");
  await run.page.locator("#add-student-price-reason").pressSequentially("Скидка", { delay: 40 });
  await run.page.waitForTimeout(150);
  assert.equal(await plates(run.page), 1, "the new probe is running (the key changed): the line is from the last answer");
  await run.page.waitForTimeout(SLOW_MS + 300);
  assert.equal(await plates(run.page), 1, "the new answer came");
  assert.equal(X.bulkProbes(run.calls).length - before, 1, "ONE probe for the finished form, none for the half filled one");
  await run.page.fill("#add-student-price-reason", "");
  assert.equal(await plates(run.page), 0, "the reason erased: no common price - no line");
  assert.equal(X.singleProbes(run.calls).length, 0);
  await run.page.close();
});

test("the line follows «Оплата с»: a changed day shows it, a half typed or the default day does not", async () => {
  const run = await open(["st9"], ["Новый", "Второй", "Третий"]);
  await run.page.waitForSelector("#add-student-pay-from");
  await run.page.fill("#add-student-pay-from", "08.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForTimeout(150);
  assert.equal(await plates(run.page), 1, "a new day, the probe runs, the line is from the last answer");
  await run.page.waitForTimeout(SLOW_MS + 300);
  assert.equal(await plates(run.page), 1);
  await run.page.fill("#add-student-pay-from", "08.1");
  assert.equal(await plates(run.page), 0, "half typed day: not a day");
  await run.page.fill("#add-student-pay-from", "09.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForTimeout(150);
  assert.equal(await plates(run.page), 0, "the default day again: nothing common is entered");
  await run.page.close();
});

test("another set of students: the line of the old set is NOT shown for the new one; it comes with the answer", async () => {
  const run = await open(["st9"], ["Новый", "Второй"]);
  await run.page.fill("#add-student-pay-from", "08.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForTimeout(SLOW_MS + 300);
  assert.equal(await plates(run.page), 1);
  await run.page.click('button:has-text("Третий Ученик")');
  assert.equal(await plates(run.page), 0, "the set changed - nothing of the old set is shown while the new probe runs");
  await run.page.waitForSelector(PLATE, { timeout: 4000 });
  // the one who comes back is taken off: the new set has nobody who comes back - no line while the probe runs, none after it
  await run.page.click('button:has-text("Новый Ученик")');
  assert.equal(await plates(run.page), 0, "the set without the returning student: no line for the time of the probe");
  await run.page.waitForTimeout(SLOW_MS + 600);
  assert.equal(await plates(run.page), 0, "and after the answer");
  await run.page.close();
});
