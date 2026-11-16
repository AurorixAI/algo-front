// Money-2 wave 2, Э6 (Т14): the window «Простить долг» says what the forgiveness does to the pay of the teacher - «Зарплата преподавателя · +125 000 сум» from `money_effects.forgiveness.teacher_pay` of the dry
// run (the owner only: the administrator gets null and sees no line); the sentence of the server is under «Подробнее»; the write is not held by it.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, isDry, mount, F, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");

const ctx = setup(test);
const TEXT = "Долг 190 000 сум будет прощён. Эти уроки будут оплачены преподавателю: зарплата за ноябрь вырастет на 125 000 сум";
const wo = { id: "w1", membership_id: "m-a", amount: 190000, reason: "Болезнь", effective_on: "2026-11-16", created_by_name: null, created_at: null, voided_at: null };
const answer = (forgiveness) => (request) => {
  if (request.method === "POST" && request.path === "/auth/org/memberships/m-a/writeoffs") {
    return { status: 201, json: { writeoff: wo, closes: null, debt_before: 190000, debt_after: 0, row: { membership_id: "m-a", debt: 0, advance: 0 }, money_effects: { text: "", students: [], payroll: [], dryRun: isDry(request), forgiveness } } };
  }
  return null;
};
const open = (forgiveness, user = OWNER, width = 1280) => mount(ctx, F.baseServer(answer(forgiveness), F.SHORT), "writeoff", user, { moneyAvailable: true }, width);
const posts = (run) => run.calls.filter((call) => call.method === "POST" && /writeoffs$/.test(call.path));

test("Э6: the owner sees «Зарплата преподавателя +125 000 сум» from the dry run; the sentence is folded; nothing is written by the dry run", async () => {
  const run = await open({ teacher_pay: 125000, text: TEXT });
  await run.page.waitForSelector('[data-testid="forgiveness-row"]');
  assert.match(plain(await run.page.locator('[data-testid="forgiveness-row"]').textContent()), /^Зарплата преподавателя\s*\+125 000 сум$/);
  assert.ok(!plain(await run.page.locator('[role="dialog"]').evaluate((el) => el.innerText)).includes("зарплата за ноябрь вырастет"), "the sentence is folded");
  await run.page.locator('[data-testid="forgiveness-full"] summary').click();
  assert.ok(plain(await run.page.locator('[data-testid="forgiveness"]').evaluate((el) => el.innerText)).includes(plain(TEXT)));
  const asked = posts(run);
  assert.ok(asked.length >= 1 && asked.every((call) => isDry(call)), "only dry runs before the press");
  assert.equal(asked[0].body.reason, "Проверка последствий");
  assert.ok(!("expected_debt" in asked[0].body), "the dry run is not a check of the debt");
  await run.page.close();
});

test("Э6: the write goes with the reason and is not held by the line; after it the page is told", async () => {
  const run = await open({ teacher_pay: 125000, text: TEXT });
  await run.page.waitForSelector('[data-testid="forgiveness-row"]');
  await run.page.fill("#writeoff-reason", "Болезнь ученика");
  await run.page.locator('[role="dialog"] button[type="submit"]').click();
  await run.page.waitForFunction(() => window.__log.includes("done"));
  const writes = posts(run).filter((call) => !isDry(call));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.reason, "Болезнь ученика");
  await run.page.close();
});

test("Э6: the administrator (the server sends null) and a debt without a pay effect - no line, no dead end", async () => {
  for (const [forgiveness, user] of [[null, ADMIN], [{ teacher_pay: 0, text: "" }, OWNER]]) {
    const run = await open(forgiveness, user);
    await run.page.waitForFunction(() => document.querySelectorAll("[data-testid=forgiveness-loading]").length === 0);
    assert.equal(await run.page.locator('[data-testid="forgiveness"]').count(), 0);
    assert.equal(await run.page.locator('[role="dialog"] button[type="submit"]').isDisabled(), false);
    await run.page.close();
  }
});

test("Э6 (375): the line fits the window", async () => {
  const run = await open({ teacher_pay: 125000, text: TEXT }, OWNER, 375);
  await run.page.waitForSelector('[data-testid="forgiveness-row"]');
  const facts = await run.page.evaluate(layoutProbe, '[role="dialog"]');
  assert.equal(facts.scroll, 0);
  assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
  await run.page.close();
});
