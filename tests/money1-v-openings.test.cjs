// «Деньги-1 / В», the opening balance over payments: `OPENING_OVER_PAYMENTS` is told in the server's words and has to be ticked («Понятно, покрытие изменится») before «Сохранить»;
// the batch review does not filter it out.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { start, plain, open, root } = require("./helpers/money1-v.cjs");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
};
const O = require(path.join(root, "src/lib/openings.ts"));

let browser;
test.before(async () => { browser = await start(); });
test.after(async () => { await browser.close(); });

const NB = " ";
const WARNING = { code: "OPENING_OVER_PAYMENTS", message: `У ученика уже есть оплаты на 600${NB}000${NB}сум — покрытие станет до 20.01` };
const row = { membership_id: "m1", student_id: "st1", student_name: "Иванов", group_id: "g1", group_name: "7-А", is_primary: true, is_active: true, status: "ok", debt: 0, refundable: 0 };
const server = (warnings) => (request) => {
  if (request.method === "PUT" && request.path === "/auth/org/memberships/m1/opening-balance") {
    return { json: { opening: /dry_run/.test(request.query) ? null : { id: "o1" }, impact: { before: {}, after: {} }, dry_run: /dry_run/.test(request.query), row, warnings } };
  }
  return null;
};

test("the batch review keeps OPENING_OVER_PAYMENTS in the warnings", () => {
  const preview = { items: [{ membership_id: "m1", student_name: "Иванов", warnings: [{ code: "HAS_MONEY", message: "x" }, WARNING] }] };
  assert.deepEqual(O.previewWarnings(preview), [{ id: "m1", student: "Иванов", text: WARNING.message }]);
});

test("single window: the warning and the box; «Сохранить» waits for the tick; without a warning there is no box", async () => {
  {
    const { page, calls } = await open(browser, "money-v.entry.tsx", "opening", { server: server([WARNING]) });
    await page.waitForSelector("#opening-form");
    await page.fill("#opening-paid-until", "20.12.2026");
    await page.waitForSelector('[data-testid="opening-over-payments"]', { timeout: 5000 });
    assert.match(plain(await page.textContent('[data-testid="opening-over-payments"]')), /У ученика уже есть оплаты на 600 000 сум — покрытие станет до 20\.01\s?Понятно, покрытие изменится/);
    const save = page.locator('[data-testid="opening-save"]');
    assert.equal(await save.isDisabled(), true);
    assert.match(plain(await page.textContent('[data-testid="opening-why"]')), /Понятно, покрытие изменится/);
    await page.check('[data-testid="opening-over-payments-ok"]');
    assert.equal(await save.isDisabled(), false);
    await save.click();
    await page.waitForFunction(() => window.__log.includes("saved"));
    assert.ok(calls.some((call) => call.method === "PUT" && !/dry_run/.test(call.query)));
    await page.close();
  }
  {
    const { page } = await open(browser, "money-v.entry.tsx", "opening", { server: server([]) });
    await page.waitForSelector("#opening-form");
    await page.fill("#opening-paid-until", "20.12.2026");
    await page.waitForFunction(() => /Что изменится|Считаем/.test(document.body.innerText) || true);
    await page.waitForTimeout(900);
    assert.equal(await page.locator('[data-testid="opening-over-payments"]').count(), 0);
    await page.close();
  }
});
