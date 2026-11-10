// «Деньги-1 / В», the transfer of a student: an individual price does not follow him - the server's sentence (`closing_prices[].text`) is one amber line per student under «Что изменится»;
// a bulk transfer names the student, more than five lines are «и ещё N»; no field - no block (a role without money), no «цен нет».
const assert = require("node:assert/strict");
const test = require("node:test");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { start, plain, open } = require("./helpers/money1-v.cjs");

let browser;
test.before(async () => { browser = await start(); });
test.after(async () => { await browser.close(); });

const NB = " ";
const TEXT = `У ученика индивидуальная цена 300${NB}000${NB}сум в группе «Алгебра 7»: в новой группе она не действует — будет цена группы 400${NB}000${NB}сум`;
const closing = (text = TEXT) => [{ membership_id: "m1", group_name: "Алгебра 7", amount: 300000, since: "2026-10-01", reason: "сестра", new_group_amount: 400000, text }];
const ready = (answer) => ({ status: "ready", answer });

async function block(preview, width = 1280, names) {
  const run = await open(browser, "money-v.entry.tsx", "transferBlock", { width, props: { preview, names } });
  await run.page.waitForSelector('[data-testid="transfer-preview"]');
  return run;
}

test("a single transfer: the sentence of the server stands as ONE amber line under the money of the transfer, once, with NBSP", async () => {
  const { page } = await block(ready({ carried: [], closing_prices: closing(), individual_price_ends: true }));
  const lines = page.locator('[data-testid="transfer-closing-price"]');
  assert.equal(await lines.count(), 1);
  assert.match(plain(await lines.first().textContent()), /^У ученика индивидуальная цена 300 000 сум в группе «Алгебра 7»: в новой группе она не действует — будет цена группы 400 000 сум$/);
  assert.ok((await lines.first().textContent()).includes(`300${NB}000${NB}сум`));
  assert.equal(await lines.first().getAttribute("data-variant"), "warning");
  assert.equal(await page.locator("input[type=checkbox]").count(), 0, "a warning, not a fork: nothing to tick");
  await page.close();
});

test("no closing_prices (or an empty list): no line and no «цен нет»", async () => {
  for (const answer of [{ carried: [] }, { carried: [], closing_prices: [] }]) {
    const { page } = await block(ready(answer));
    assert.equal(await page.locator('[data-testid="transfer-closing-prices"]').count(), 0);
    assert.doesNotMatch(plain(await page.textContent("body")), /цен нет|нет индивидуальной/i);
    await page.close();
  }
});

test("a bulk transfer: a line per student with the name; more than five - «и ещё N» opens the rest", async () => {
  const students = Array.from({ length: 7 }, (_, i) => ({ student_id: `s${i}`, billing: null, individual_price_ends: true, closing_prices: closing(`индивидуальная цена ${i + 1}00${NB}000${NB}сум не действует в новой группе`) }));
  const names = Object.fromEntries(students.map((s, i) => [s.student_id, `Ученик ${i + 1}`]));
  const { page } = await block(ready({ students, warnings: [] }), 1280, names);
  const lines = page.locator('[data-testid="transfer-closing-price"]');
  assert.equal(await lines.count(), 5);
  assert.match(plain(await lines.first().textContent()), /^Ученик 1: индивидуальная цена 100 000 сум не действует/);
  assert.equal(plain(await page.textContent('[data-testid="transfer-closing-more"]')), "и ещё 2");
  await page.click('[data-testid="transfer-closing-more"]');
  assert.equal(await lines.count(), 7);
  assert.equal(await page.locator('[data-testid="transfer-closing-more"]').count(), 0);
  await page.close();
});

for (const width of [1280, 375]) {
  test(`${width}: the lines fit the block`, async () => {
    const { page } = await block(ready({ carried: [], closing_prices: closing() }), width);
    const facts = await page.evaluate(layoutProbe, "body");
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    await page.close();
  });
}
