// Money-2 fix 9 (walk M12, defect 1): an administrator WITHOUT the right to money.  (a) the windows of an enrolment show the balances of the last time without the link «Выписка» (it leads nowhere
// for him); (b) every page of the section «Оплаты» opened by a direct link says the refusal and never hangs on «Загрузка…» - the statement did (its effect returned early without ending the loading).
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, OWNER } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const X = require("./helpers/money2-fix7.cjs");
const { F } = X;

const ctx = setup(test);
const NO_MONEY_ADMIN = { role: "admin", org_role: "admin", payments_access: false };
const refuse = () => ({ status: 403, json: { detail: { code: "PAYMENTS_FORBIDDEN", message: "Нет доступа к оплатам" } } });

for (const [name, expected] of [["statement", /Нет доступа к выписке/], ["payments", /недоступен|Нет доступа|Доступ/], ["income", /доступ/i], ["openings", /доступ|недоступен/i], ["prices", /доступ|недоступен/i], ["receipt", /доступ/i], ["refund-receipt", /доступ/i]]) {
  for (const known of [true, false]) {
    test(`direct link «${name}», administrator without the right (${known ? "profile says payments_access=false" : "profile silent, the server answers 403"}): the refusal stands, no «Загрузка…», a way back`, async () => {
      const run = await openPage(ctx.browser, "money2-fix9.entry.tsx", refuse, { width: 1280, height: 800 });
      await run.page.evaluate(([n, user]) => window.mount(n, user), [name, known ? NO_MONEY_ADMIN : { role: "admin", org_role: "admin" }]);
      if (!known) await run.page.evaluate(() => window.__summary.setState({ available: false, loaded: true }));
      await run.page.waitForTimeout(900);
      const text = plain(await run.page.locator("#root").textContent());
      assert.ok(!/Загрузка/.test(text), `${name}: hangs on loading: ${text.slice(0, 160)}`);
      assert.match(text, expected, `${name}: no refusal: ${text.slice(0, 160)}`);
      assert.ok(await run.page.locator('button:has-text("Назад"), a:has-text("Назад"), a:has-text("На главную"), a:has-text("Оплаты"), a:has-text("Вернуться")').count() > 0, `${name}: no way back`);
      await run.page.close();
    });
  }
}

// ---- (a) the link «Выписка» of the block «Остатки с прошлого раза»: only for a person with the right to money (the same flag that hides the sums)
const ROW = { group_id: "gb", group_name: F.SHORT.B, membership_id: "m-old-b", left_on: "2026-11-10", kind: "debt", text: "Геометрия 8 (ушёл 10.11): остался долг" };
const withSum = (row) => ({ ...row, amount: 120000 });
const pick = (page) => page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
for (const [label, money] of [["without the right", false], ["with the right", true]]) {
  test(`card of a student, balances of the last time, ${label}: the link «Выписка» is ${money ? "there" : "absent"}`, async () => {
    const run = await mount(ctx, X.modalServer({ undone: false, pastBalances: [money ? withSum(ROW) : ROW] }), "assign", money ? OWNER : { role: "admin", org_role: "admin", payments_access: false }, { moneyAvailable: money, mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], groupsBasePath: money ? "/owner/groups" : "/admin/groups" });
    await pick(run.page);
    await run.page.waitForSelector('[data-testid="past-balance"]');
    assert.equal(await run.page.locator('[data-testid="past-balance-link"]').count(), money ? 1 : 0);
    assert.ok(!/Выписка/.test(plain(await run.page.locator('[data-testid="past-balances"]').textContent())) === !money);
    await run.page.close();
  });
  test(`drawer «Зачислить учеников», balances of the last time, ${label}: the link «Выписка» is ${money ? "there" : "absent"}`, async () => {
    const run = await openPage(ctx.browser, "money-b.entry.tsx", X.drawerServer([], undefined, false, { st9: [money ? withSum(ROW) : ROW] }), { width: 1280, height: 900 });
    await run.page.evaluate(([who, on]) => window.mount("addDrawer", who, on ? { summary: { accountingStart: "2026-09-01" }, refresh: false } : { refresh: false }), [money ? OWNER : { role: "admin", org_role: "admin", payments_access: false }, money]);
    await run.page.fill('input[placeholder^="Поиск по имени"]', "Уч");
    await run.page.click('button:has-text("Новый Ученик")');
    await run.page.waitForSelector('[data-testid="past-balance"]');
    assert.equal(await run.page.locator('[data-testid="past-balance-link"]').count(), money ? 1 : 0);
    await run.page.close();
  });
}
