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
  assert.deepEqual(O.previewWarnings(preview), [{ id: "m1", student: "Иванов", text: WARNING.message, code: "OPENING_OVER_PAYMENTS" }]);
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

// ── walk of stage Д4: the page of the openings - a warning is ticked on its row, the button says the REAL reason it is off ─────────────

test("batch review: OPENING_OVER_PAYMENTS has a tick on the row; «Сохранить» is off with THAT line, not «Исправьте строки с ошибками»; ticked - on", async () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "openings", "O04_preview_ok.json"), "utf8"));
  raw.items[0].warnings = [WARNING];
  const { page } = await open(browser, "money-v.entry.tsx", "openingsReview", { props: { preview: raw } });
  await page.waitForSelector('[data-testid="openings-over-payments"]');
  assert.match(plain(await page.textContent('[data-testid="openings-over-payments"]')), /У ученика уже есть оплаты на 600 000 сум — покрытие станет до 20\.01\s?Понятно, покрытие изменится/);
  assert.doesNotMatch(plain(await page.locator('[data-testid="openings-review-warnings"]').allTextContents().then((t) => t.join(" "))), /покрытие станет до/, "not repeated in the plain list of warnings");
  const save = page.locator('[data-testid="openings-review-save"]');
  assert.equal(await save.isDisabled(), true);
  const why = plain(await page.textContent('[data-testid="openings-review-why"]'));
  assert.match(why, /Отметьте «Понятно, покрытие изменится»/);
  assert.doesNotMatch(why, /Исправьте строки/);
  assert.equal(await page.locator("#openings-reason").count(), 0, "no reason is asked for a warning");
  await page.check('[data-testid="openings-over-payments-ok"]');
  assert.equal(await save.isDisabled(), false);
  await save.click();
  await page.waitForFunction(() => window.__log.includes("save"));
  await page.close();
});
