// Money-2 wave 2, Э2 (Т13): the window «Зачислить в группу» (mode add) says, from `past_balances[]` of the dry run, what the student left in his PAST groups - a debt or an advance of each stay - with a link to
// the statement of that stay.  No such rows - nothing is drawn; a role without money - the fact without a sum; a transfer asks no such thing (the server sends it for `mode=add` only).
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, isDry, mount, F, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");

const ctx = setup(test);
const BALANCES = (money) => [
  { group_id: "gb", group_name: F.SHORT.B, membership_id: "m-old-1", left_on: "2026-11-10", kind: "debt", ...(money ? { amount: 120000 } : {}), text: money ? `${F.SHORT.B} (ушёл 10.11): долг 120 000 сум` : `${F.SHORT.B} (ушёл 10.11): есть долг` },
  { group_id: "gc", group_name: F.SHORT.C, membership_id: "m-old-2", left_on: "2026-10-28", kind: "advance", ...(money ? { amount: 80000 } : {}), text: money ? `${F.SHORT.C} (ушёл 28.10): аванс 80 000 сум` : `${F.SHORT.C} (ушёл 28.10): есть аванс` },
];
const server = (pastBalances) => F.baseServer((request) => (request.method === "POST" && request.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(request), past_balances: pastBalances, leave_undo: null } } : null), F.SHORT);
const props = (extra = {}) => ({ moneyAvailable: true, mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], groupsBasePath: "/owner/groups", ...extra });
const pick = (page) => page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
const rows = (page) => page.locator('[data-testid="past-balance"]').evaluateAll((items) => items.map((li) => ({ text: li.innerText.replace(/\s+/g, " ").trim(), href: li.querySelector("a")?.getAttribute("href") ?? null })));

test("Э2: a debt and an advance of past groups - a row each with the sum and a link to its statement", async () => {
  const run = await mount(ctx, server(BALANCES(true)), "assign", OWNER, props());
  await pick(run.page);
  await run.page.waitForSelector('[data-testid="past-balances"]');
  const found = await rows(run.page);
  assert.equal(found.length, 2);
  assert.match(found[0].text, /^Долг · «Геометрия 8» · ушёл 10\.11\s+120 000 сум\s+Выписка$/);
  assert.equal(found[0].href, "/owner/payments/statement/m-old-1");
  assert.match(found[1].text, /^Аванс · «Английский 6» · ушёл 28\.10\s+80 000 сум\s+Выписка$/);
  assert.equal(found[1].href, "/owner/payments/statement/m-old-2");
  assert.equal((plain(await run.page.locator('[data-testid="past-balances"]').evaluate((el) => el.innerText)).match(/120 000/g) ?? []).length, 1, "one sum once");
  await run.page.close();
});

test("Э2: nothing left behind - nothing is drawn; the admin workspace links into /admin", async () => {
  const empty = await mount(ctx, server([]), "assign", OWNER, props());
  await pick(empty.page);
  await empty.page.waitForSelector('[data-testid="assign-submit"]:not([disabled])');
  assert.equal(await empty.page.locator('[data-testid="past-balances"]').count(), 0);
  await empty.page.close();
  const admin = await mount(ctx, server(BALANCES(true)), "assign", OWNER, props({ groupsBasePath: "/admin/groups" }));
  await pick(admin.page);
  await admin.page.waitForSelector('[data-testid="past-balances"]');
  assert.equal((await rows(admin.page))[0].href, "/admin/payments/statement/m-old-1");
  await admin.page.close();
});

test("Э2: a role without the right to money - the same rows without a sum; the button is not stopped", async () => {
  const run = await mount(ctx, server(BALANCES(false)), "assign", ADMIN, props({ moneyAvailable: false }));
  await pick(run.page);
  await run.page.waitForSelector('[data-testid="past-balances"]');
  const found = await rows(run.page);
  assert.equal(found.length, 2);
  assert.ok(found.every((row) => !/сум/.test(row.text)), JSON.stringify(found));
  assert.equal(await run.page.locator('[data-testid="assign-submit"]').isDisabled(), false);
  await run.page.close();
});

test("Э2 (375): the block fits, no horizontal scroll", async () => {
  const run = await mount(ctx, server(BALANCES(true)), "assign", OWNER, props(), 375);
  await pick(run.page);
  await run.page.waitForSelector('[data-testid="past-balances"]');
  const facts = await run.page.evaluate(layoutProbe, '[role="dialog"]');
  assert.equal(facts.scroll, 0);
  assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
  await run.page.close();
});
