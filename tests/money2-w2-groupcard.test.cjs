// Money-2 wave 2, А6 (owner 16.11): the card of a group in «Зачислить в группу» / «Перевести в другую группу» - the name (two lines at most, no ellipsis), ONE line of the schedule, the filling;
// the teacher and the price (money roles) are in that line (mock-up of 19.11); room / format are not a criterion of the choice and are not on the card.  The schedule comes from the list of the groups the window already asks (one request).
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, F, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");

const ctx = setup(test);
const props = (extra = {}) => ({ moneyAvailable: true, sourceGroups: [F.SOURCES[0]], excludeGroupIds: ["ga"], mode: "add", currentGroupName: "Алгебра 7", ...extra });
const card = (page, id) => page.locator(`[data-testid="assign-group-card"][data-group="${id}"]`);

test("the card shows the name, ONE line of what the choice is made by - the schedule, the teacher, the price - and the filling", async () => {
  const run = await mount(ctx, F.baseServer(() => null, F.SHORT), "assign", OWNER, props());
  await run.page.waitForSelector('[data-testid="assign-group-card"]');
  const lines = { gb: "Пн · 16:00" , gt: "Пн · Ср · Пт · 16:00–17:00", gc: "расписание не задано" };
  assert.equal(plain(await card(run.page, "gt").locator('[data-testid="group-schedule-line"]').textContent()), lines.gt);
  assert.equal(plain(await card(run.page, "gc").locator('[data-testid="group-schedule-line"]').textContent()), lines.gc);
  assert.equal(plain(await card(run.page, "gb").locator('[data-testid="group-schedule-line"]').textContent()), "Пн 16:00 · Ср 17:30", "the time differs by day");
  const gt = card(run.page, "gt");
  const text = plain(await gt.evaluate((el) => el.innerText));
  assert.ok(text.includes("Физика 9"));
  assert.match(text, /Пн · Ср · Пт · 16:00–17:00 · Камол Эргашев · 400 000 сум\/мес · другой класс/, "the teacher and the price are IN the line, not folded");
  assert.match(text, /0 из 30$/, "the filling at the right edge");
  assert.equal(await gt.locator('[data-testid="group-pick-fill"]').count(), 1);
  assert.equal(await gt.locator("details, summary").count(), 0, "nothing is folded: no «Подробнее»");
  assert.equal(run.calls.filter((call) => call.method === "GET" && call.path === "/auth/org/groups").length, 1, "one request of the groups per window");
  await run.page.close();
});

test("a tap on the card (its name or its line) chooses the group, one at a time; the card is a radio with the name of the group", async () => {
  const run = await mount(ctx, F.baseServer(() => null, F.SHORT), "assign", OWNER, props());
  await run.page.waitForSelector('[data-testid="assign-group-card"]');
  assert.equal(await card(run.page, "gt").getAttribute("data-selected"), "no");
  await card(run.page, "gt").locator('[data-testid="group-card-name"]').click();
  assert.equal(await card(run.page, "gt").getAttribute("data-selected"), "yes");
  assert.equal(await run.page.getByRole("radio", { name: F.SHORT.T }).isChecked(), true);
  await card(run.page, "gb").locator('[data-testid="group-schedule-line"]').click();
  assert.equal(await card(run.page, "gb").getAttribute("data-selected"), "yes");
  assert.equal(await card(run.page, "gt").getAttribute("data-selected"), "no", "the choice moved");
  await run.page.close();
});

test("a transfer window has the same card; a role without money sees the teacher but no price in the line", async () => {
  const run = await mount(ctx, F.baseServer(() => null, F.SHORT), "assign", ADMIN, props({ mode: "transfer", moneyAvailable: false }));
  await run.page.waitForSelector('[data-testid="assign-group-card"]');
  assert.equal(plain(await card(run.page, "gt").locator('[data-testid="group-schedule-line"]').textContent()), "Пн · Ср · Пт · 16:00–17:00");
  const text = plain(await card(run.page, "gt").evaluate((el) => el.innerText));
  assert.doesNotMatch(text, /сум/);
  assert.match(text, /Камол Эргашев/);
  await run.page.close();
});

test("a long name wraps with no ellipsis; no horizontal scroll at 375", async () => {
  const run = await mount(ctx, F.baseServer(() => null, F.LONG), "assign", OWNER, props(), 375);
  await run.page.waitForSelector('[data-testid="assign-group-card"]');
  const facts = await run.page.evaluate(layoutProbe, "body");
  assert.equal(facts.scroll, 0);
  assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
  const name = card(run.page, "gt").locator('[data-testid="group-card-name"]');
  assert.ok(await name.evaluate((el) => !/truncate|ellipsis/.test(el.className) && getComputedStyle(el).textOverflow !== "ellipsis"));
  assert.ok(await name.evaluate((el) => el.getClientRects().length >= 1 && el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) * 5 + 1), "the longest name wraps in five lines at most (the set «long» judges wraps only)");
  await run.page.close();
});
