// Money-2 fix 9 (walk M12, defect 2): the remark «общие цена и дата на него не действуют» in the row of a student who comes back as he was (Money-2 fix 10B -> the mock-up of 19.11) of the drawer «Зачислить учеников» was drawn from the answer of the CURRENT key of the probe, and the key changes with every
// press (price, reason, day) and is null while the form of the price or the day is half filled - so the plate flickered away for the time of each new probe (a slow answer, a field being typed) and a look
// at the wrong moment saw none.  Who comes back the day of the leaving depends on the group and the chosen students only: the last answer of THIS set stays while a new probe runs or the form is half filled;
// another set of students - the old plate is not shown.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain } = require("./helpers/money2-w2.cjs");
const H = require("./helpers/enrol-v2.cjs");
const X = require("./helpers/money2-fix7.cjs");

const ctx = setup(test);
const PLATE = '[data-testid="enrol-note-shared"]';
const NAMES = ["Новый", "Второй", "Третий", "Четвёртый"];
const PEOPLE = NAMES.map((first, i) => H.STUDENT(`st${9 - i}`, first, "Ученик"));
const SLOW_MS = 700;

// the bulk dry run answers slowly (like a real network under load); everything else at once
function slowServer(undoneIds) {
  const base = H.server({ people: PEOPLE, undone: undoneIds });
  return async (request) => {
    if (request.method === "POST" && /\/students\/bulk$/.test(request.path) && /dry_run=true/.test(request.query)) await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    return base(request);
  };
}
async function open(undoneIds, chosen) {
  const run = await H.openDrawer(ctx, slowServer(undoneIds));
  for (const first of chosen) await H.pick(run.page, first);
  for (let i = 0; i < 60 && X.bulkProbes(run.calls).length < 1; i += 1) await run.page.waitForTimeout(100);
  await run.page.waitForTimeout(SLOW_MS + 300);
  await run.page.click('[data-testid="enrol-terms-toggle"]');
  return run;
}
const plates = (page) => page.locator(PLATE).count();

test("the remark stays while the price form is filled: a price entered shows it at once from the last answer of this set, the new probe does not blink it", async () => {
  const run = await open(["st9"], NAMES);
  assert.equal(await plates(run.page), 0, "nothing common entered: no remark");
  assert.equal(await run.page.locator('[data-testid="enrol-note-undone"]').count(), 1, "the row of the returning student is there all the time");
  const before = X.bulkProbes(run.calls).length;
  await run.page.fill("#add-student-price-amount", "380000");
  // Money-2 fix 11 (F5): a price entered without its reason is asked at once (stand-in reason) and IS a common price on the screen: the remark is there, from the last answer of this set
  assert.equal(await plates(run.page), 1, "an amount is a price entered: the remark stays from the last answer of this set");
  await run.page.locator("#add-student-price-reason").pressSequentially("Скидка", { delay: 40 });
  await run.page.waitForTimeout(150);
  assert.equal(await plates(run.page), 1, "the new probe is running (the key changed): the remark is from the last answer");
  assert.equal(await run.page.locator('[data-testid="enrol-note-undone"]').count(), 1, "the row does not blink either");
  await run.page.waitForTimeout(SLOW_MS + 300);
  assert.equal(await plates(run.page), 1, "the new answer came");
  assert.equal(X.bulkProbes(run.calls).length - before, 1, "ONE probe for the finished form, none for the half filled one");
  await run.page.fill("#add-student-price-reason", "");
  assert.equal(await plates(run.page), 1, "the reason erased: the price is still entered - the remark stays (the write will ask for the reason at its field)");
  await run.page.fill("#add-student-price-amount", "");
  assert.equal(await plates(run.page), 0, "the price erased: no common price - no remark");
  assert.equal(X.singleProbes(run.calls).length, 0);
  await run.page.close();
});

test("the remark follows «Оплата с»: a changed day shows it, a half typed or the default day does not", async () => {
  const run = await open(["st9"], NAMES.slice(0, 3));
  await run.page.waitForSelector("#add-student-pay-from");
  await run.page.fill("#add-student-pay-from", "17.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForTimeout(150);
  assert.equal(await plates(run.page), 1, "a new day, the probe runs, the remark is from the last answer");
  await run.page.waitForTimeout(SLOW_MS + 300);
  assert.equal(await plates(run.page), 1);
  await run.page.fill("#add-student-pay-from", "17.1");
  assert.equal(await plates(run.page), 0, "half typed day: not a day");
  await run.page.fill("#add-student-pay-from", "19.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForTimeout(150);
  assert.equal(await plates(run.page), 0, "the default day again: nothing common is entered");
  await run.page.close();
});

test("another set of students: the remark of the old set is NOT shown for the new one; it comes with the answer", async () => {
  const run = await open(["st9"], NAMES.slice(0, 2));
  await run.page.fill("#add-student-pay-from", "17.11.2026");
  await run.page.keyboard.press("Tab");
  await run.page.waitForTimeout(SLOW_MS + 300);
  assert.equal(await plates(run.page), 1);
  await run.page.click('[data-testid="enrol-terms-toggle"]');          // the list comes back from under the labels
  await H.pick(run.page, "Третий");
  assert.equal(await plates(run.page), 0, "the set changed - nothing of the old set is shown while the new probe runs");
  await run.page.waitForSelector(PLATE, { timeout: 4000 });
  // the one who comes back is taken off: the new set has nobody who comes back - no remark while the probe runs, none after it
  await run.page.getByRole("button", { name: "Убрать: Новый Ученик" }).click();
  assert.equal(await plates(run.page), 0, "the set without the returning student: no remark for the time of the probe");
  await run.page.waitForTimeout(SLOW_MS + 600);
  assert.equal(await plates(run.page), 0, "and after the answer");
  await run.page.close();
});
