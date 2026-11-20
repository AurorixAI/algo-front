// Money-2 wave 2, Э5 (Т12): the archive of a group with a debt or an advance that nobody settled (`OPEN_BALANCES`, the left students too) - a row per stay: who, «Долг · ушёл 20.11», the sum and the actions
// of the server as links to the statement of that stay; the button stays off and says why; a role without money - the fact without a sum and without links.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, F, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");

const ctx = setup(test);
const balances = (money) => [
  { student_id: "s1", membership_id: "m1", name: "Иванов Али", left_on: "2026-11-20", kind: "debt", ...(money ? { amount: 190000 } : {}), text: money ? "Иванов Али: долг 190 000 сум — принять оплату или простить его можно в выписке группы" : "Иванов Али: есть долг — принять оплату или простить его может владелец или администратор с доступом к деньгам", actions: money ? [{ code: "payment", label: "Принять оплату" }, { code: "writeoff", label: "Простить 190 000 сум" }] : [] },
  { student_id: "s2", membership_id: "m2", name: "Саидова Мадина", left_on: "2026-11-02", kind: "advance", ...(money ? { amount: 80000 } : {}), text: money ? "Саидова Мадина: аванс 80 000 сум — вернуть его можно в выписке группы" : "Саидова Мадина: есть аванс — вернуть его может владелец или администратор с доступом к деньгам", actions: money ? [{ code: "refund", label: "Вернуть аванс" }] : [] },
];
const impact = (money) => ({ groupId: "gz", groupName: F.SHORT.A, status: "active", canArchive: false, examService: "ok", blockers: [{ code: "OPEN_BALANCES", count: 2, balances: balances(money) }], autoActions: [], warnings: [] });
const server = (money) => F.baseServer((request) => (request.path === "/auth/org/groups/gz/archive-impact" ? { json: impact(money) } : null), F.SHORT);
const open = (money, width = 1280, user = OWNER, groupsBasePath = "/owner/groups") => mount(ctx, server(money), "group-archive", user, { moneyAvailable: money, groupsBasePath }, width);
const rows = (page) => page.locator('[data-testid="archive-balance"]').evaluateAll((items) => items.map((li) => ({ text: li.innerText.replace(/\s+/g, " ").trim(), links: [...li.querySelectorAll("a")].map((a) => [a.textContent.trim(), a.getAttribute("href")]) })));

test("Э5: every stay with an open balance is a row with the sum and the actions of the server as links to its statement; the archive button is off and says why", async () => {
  const run = await open(true);
  await run.page.waitForSelector('[data-testid="archive-open-balances"]');
  const found = await rows(run.page);
  assert.equal(found.length, 2);
  assert.match(found[0].text, /^Иванов Али\s+190 000 сум Долг · ушёл 20\.11/);
  assert.deepEqual(found[0].links, [["Принять оплату", "/owner/payments/statement/m1"], ["Простить 190 000 сум", "/owner/payments/statement/m1"]]);
  assert.match(found[1].text, /^Саидова Мадина\s+80 000 сум Аванс · ушёл 02\.11/);
  assert.deepEqual(found[1].links, [["Вернуть аванс", "/owner/payments/statement/m2"]]);
  assert.ok(!found[0].text.includes("принять оплату или простить"), "the sentence of the server is folded");
  assert.equal(await run.page.locator('[data-testid="group-archive-submit"]').isDisabled(), true);
  assert.match(plain(await run.page.textContent('[role="dialog"]')), /Есть остатки по оплатам/);
  assert.match(plain(await run.page.textContent('[data-testid="archive-open-balances"]')), /Закройте остатки по оплатам перед архивом: 2/);
  assert.equal((plain(await run.page.locator('[data-testid="archive-open-balances"]').evaluate((el) => el.innerText)).match(/190 000/g) ?? []).length, 2, "the sum of the row once and once in the name of the server's action «Простить 190 000 сум» (dictionary 3.3) - no third copy");
  await run.page.close();
});

test("Э5: the admin workspace links into /admin; a role without money - facts without sums and without links, the button is off with the same reason", async () => {
  const admin = await open(true, 1280, OWNER, "/admin/groups");
  await admin.page.waitForSelector('[data-testid="archive-balance"]');
  assert.equal((await rows(admin.page))[0].links[0][1], "/admin/payments/statement/m1");
  await admin.page.close();
  const run = await open(false, 1280, ADMIN);
  await run.page.waitForSelector('[data-testid="archive-balance"]');
  const found = await rows(run.page);
  assert.ok(found.every((row) => row.links.length === 0 && !/сум/.test(row.text)), JSON.stringify(found));
  await run.page.locator('[data-testid="archive-balance-full"] summary').first().click();
  assert.match(plain(await run.page.textContent('[data-testid="archive-open-balances"]')), /может владелец или администратор с доступом к деньгам/);
  assert.equal(await run.page.locator('[data-testid="group-archive-submit"]').isDisabled(), true);
  await run.page.close();
});

test("Э5 (375): the rows fit, no horizontal scroll", async () => {
  const run = await open(true, 375);
  await run.page.waitForSelector('[data-testid="archive-balance"]');
  const facts = await run.page.evaluate(layoutProbe, '[role="dialog"]');
  assert.equal(facts.scroll, 0);
  assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
  await run.page.close();
});
