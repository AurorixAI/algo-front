// Money-2 wave 2, А7 (owner 16.11): «Что изменится» of a pause and of «Восстановить оплату» is SHORT ROWS «что → значение» from the structure of the server's answer (`advance_drops`, `new_debts`,
// `other_gains`); the whole sentence of the server is under «Подробнее».  The sums are the server's; a role without money gets the sentence without digits as the one row.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, F, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");

const ctx = setup(test);
const day = (shift) => new Date(Date.now() + shift * 86400000).toISOString().slice(0, 10);
const SHORT = F.SHORT;
const visible = async (page, selector) => plain(await page.locator(selector).evaluate((el) => el.innerText));
const rowsOf = async (page, selector) => page.locator(`${selector} [data-testid="effect-row"]`).evaluateAll((items) => items.map((li) => [...li.children].map((child) => child.textContent.replace(/[\s ]+/g, " ").trim())));
const pause = (id, first, last) => ({ id, membership_id: "m-a", first_day: first, last_day: last, days: 4, reason: null, created_by_name: null, created_at: null, voided_at: null, void_reason: null });
const OTHER = `В группе «${SHORT.T}» аванс уменьшится на 30 000 сум — до 410 000 сум`;
const drops = [{ membership_id: "m-b", group_id: "gt", group_name: SHORT.T, amount: 30000, total: 410000 }];

function pauseServer({ money = true } = {}) {
  const future = pause("pf", day(10), day(13));
  return F.baseServer((request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m-a/pauses") return { json: [future] };
    if (request.method === "POST" && request.path === "/auth/org/pauses/pf/void") return { json: { pause: future, impact: null, row: null, dry_run: true, advance_drops: money ? drops : [], new_debts: [], other_gains: [], other_groups_text: money ? OTHER : `В группе «${SHORT.T}» аванс уменьшится` } };
    return null;
  }, SHORT);
}

test("А7 (пауза): cancelling a pause says the other group as ONE short row «Аванс в «Физика 9» · −30 000 сум»; the sentence of the server is under «Подробнее»", async () => {
  const run = await mount(ctx, pauseServer(), "pause", OWNER, { moneyAvailable: true, groupName: SHORT.A });
  await run.page.waitForSelector('section[aria-label="Паузы ученика"]');
  await run.page.getByRole("button", { name: "Снять паузу", exact: true }).click();      // a pause that has not begun: «Снять паузу» (Б11.39 Э2)
  await run.page.waitForSelector('[data-testid="pause-act-effects"]');
  assert.deepEqual(await rowsOf(run.page, '[data-testid="pause-act-effects"]'), [["Аванс в «Физика 9»", "−30 000 сум"]]);
  assert.ok(!(await visible(run.page, '[data-testid="pause-act-effects"]')).includes("уменьшится"), "the whole sentence is folded");
  await run.page.locator('[data-testid="pause-act-effects-full"] summary').click();
  assert.ok((await visible(run.page, '[data-testid="pause-act-effects"]')).includes(plain(OTHER)));
  await run.page.close();
});

test("А7 (пауза): a role without money - the sentence of the server (no digits) is the one row", async () => {
  const run = await mount(ctx, pauseServer({ money: false }), "pause", ADMIN, { moneyAvailable: false, groupName: SHORT.A });
  await run.page.waitForSelector('section[aria-label="Паузы ученика"]');
  await run.page.getByRole("button", { name: "Снять паузу", exact: true }).click();      // a pause that has not begun: «Снять паузу» (Б11.39 Э2)
  await run.page.waitForSelector('[data-testid="pause-act-effects"]');
  assert.deepEqual(await rowsOf(run.page, '[data-testid="pause-act-effects"]'), [[`В группе «${SHORT.T}» аванс уменьшится`]]);
  await run.page.close();
});

const GAIN = { group_name: SHORT.T, group_id: "gt", membership_id: "m-b", debt_fell: 0, debt: 0, advance_grew: 390000, advance: 390000 };
const WILL = `В группе «${SHORT.T}» аванс вырастет на 390 000 сум — до 390 000 сум`;
const PAYROLL = "Зарплата Эргашева К. за ноябрь изменится на +24 000 сум";
function restoreServer() {
  return F.baseServer((request) => {
    if (request.path === "/auth/org/memberships/m-a/statement") return { json: F.statementWithVoided(SHORT) };
    if (request.path === "/auth/org/memberships/m-a/payments") return { json: F.paymentsList() };
    if (request.method === "POST" && request.path === "/auth/org/payments/p3/restore") return { status: 201, json: { payment: { ...F.paymentsList()[2], id: "p4", restored_from_receipt_no: 3 }, other_gains: [GAIN], money_effects: { dryRun: true, text: `${WILL}; ${PAYROLL}`, students: [], payroll: [] } } };
    return null;
  }, SHORT);
}
async function openRestore(width) {
  const run = await mount(ctx, restoreServer(), "statement", OWNER, { moneyAvailable: true }, width);
  await run.page.waitForSelector('[data-testid="statement-months"]');
  await run.page.getByText("Показать отменённые").click();
  await run.page.waitForSelector('[data-testid="statement-restore"]');
  await run.page.getByRole("button", { name: "Восстановить оплату" }).first().click();
  await run.page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  return run;
}

test("А7 (восстановить оплату): the other group is a row from `other_gains` with the sum of the payment once; the pay of the teacher stays as the server says it; the whole sentence is folded", async () => {
  const run = await openRestore(1280);
  assert.deepEqual(await rowsOf(run.page, '[data-testid="money-effects"]'), [["Аванс в «Физика 9»", "+390 000 сум"]]);
  const shown = await visible(run.page, '[role="dialog"]');
  assert.ok(shown.includes(PAYROLL), "the pay is the server's sentence");
  assert.ok(!shown.includes("вырастет"), "the sentence about the group is folded");
  assert.equal((shown.match(/390 000 сум/g) ?? []).length, 2, "the payment in the title and the advance in the row; nothing else");
  await run.page.close();
});

test("А7 (восстановить оплату) 375: the block fits, no horizontal scroll", async () => {
  const run = await openRestore(375);
  const facts = await run.page.evaluate(layoutProbe, '[role="dialog"]');
  assert.equal(facts.scroll, 0);
  assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
  await run.page.close();
});
