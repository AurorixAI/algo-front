// Money-2 fix 10Г: the «⋯» of a statement row keeps a UNIQUE accessible name («Действия с записью: Оплата № 1», hover hint «Действия с записью»),
// and the summary carries data-reconciles for tests while the screen shows only a mismatch (LESSONS 143, 144, 148).
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { statementAllKinds } = require("./helpers/statement-all-kinds.cjs");
const F = require("./helpers/money2-fixture.cjs");
const { F: F7 } = require("./helpers/money2-fix7.cjs");

const ctx = setup(test);
function server(mutate) {
  return F.baseServer((r) => {
    if (r.path === "/auth/org/memberships/m-a/statement") { const data = statementAllKinds(F7.SHORT); data.summary = { ...data.summary, charged: 1800000, paid: 1800000, transferred_in: 0, written_off: 0, recalculated: 0, refunded: 0, transferred_out: 0, debt: 0, advance: 0, reconciles: true }; if (mutate) mutate(data); return { json: data }; }
    if (r.path === "/auth/org/memberships/m-a/payments") return { json: [] };
    return null;
  }, F7.SHORT);
}
async function open(width, mutate) {
  const run = await openPage(ctx.browser, "money2.entry.tsx", server(mutate), { width, height: 900 });
  await run.page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
  await run.page.waitForSelector('[data-testid="statement-row-payment"]');
  return run;
}

for (const width of [1280, 1024, 375]) {
  test(`statement ${width}: the «⋯» name is «Действия с записью: <операция>», unique per row; the hover hint is short`, async () => {
    const run = await open(width);
    const buttons = await run.page.evaluate(() => [...document.querySelectorAll('[data-testid^="statement-row-"] button[aria-haspopup="menu"]')].map((b) => [b.getAttribute("aria-label"), b.getAttribute("title")]));
    assert.ok(buttons.length >= 3, "the rows have menus");
    for (const [label, title] of buttons) { assert.match(label, /^Действия с записью: .+/); assert.equal(title, "Действия с записью"); }
    assert.equal(new Set(buttons.map(([l]) => l)).size, buttons.length, "names are unique per row");
    const pay = run.page.getByTestId("statement-row-payment").getByRole("button", { name: /^Действия с записью: Оплата № 1/ });
    assert.equal(await pay.count(), 1, `the payment row is reachable by its name: ${JSON.stringify(buttons)}`);
    await run.page.close();
  });
}

test("statement: the summary says data-reconciles=true and shows no line; a mismatch says false and shows the red line", async () => {
  let run = await open(1280);
  const ok = await run.page.evaluate(() => { const s = document.querySelector('[data-testid="statement-summary"]'); return [s && s.getAttribute("data-reconciles"), document.querySelectorAll('[data-testid="statement-reconciles"]').length, s && /Всё сходится/.test(s.textContent)]; });
  assert.deepEqual(ok, ["true", 0, false]);
  await run.page.close();
  run = await open(1280, (data) => { data.summary = { ...data.summary, reconciles: false }; });
  const bad = await run.page.evaluate(() => [document.querySelector('[data-testid="statement-summary"]').getAttribute("data-reconciles"), document.querySelectorAll('[data-testid="statement-reconciles"]').length]);
  assert.deepEqual(bad, ["false", 1]);
  await run.page.close();
});
