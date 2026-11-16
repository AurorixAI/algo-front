// Money-2 wave 1, Э7: the journal of decisions reads «перевод», «уход отменён», «оплата восстановлена», «пауза перенесена» as a person - the line (`text`) of the server says who/what/from which group to which and
// the sum, ONCE (the sum column does not repeat it); the filter «Вид» has the new kinds; an old row keeps its sum and has no line.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const F = require("./helpers/money2-fixture.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => text.replace(/\s+/g, " ").replace(/ /g, " ").trim();
const answer = (request) => (request.path === "/auth/org/payments/decisions" ? { json: F.decisionsPage() } : null);

async function open(width, handler = answer) {
  const run = await openPage(browser, "money2.entry.tsx", F.baseServer(handler), { width, height: 900 });
  await run.page.evaluate(() => window.mount("decisions", { role: "owner", org_role: "owner" }));
  await run.page.waitForSelector('[data-testid="decision-row"]');
  return run;
}

test("Э7: each new kind says its line in words once; the sum of such a line is not repeated in the sum column; the old row keeps its sum", async () => {
  const run = await open(1280);
  const page = F.decisionsPage();
  const rows = run.page.locator('[data-testid="decision-row"]');
  assert.equal(await rows.count(), 5);
  for (let index = 0; index < 4; index += 1) {
    const text = plain(await rows.nth(index).textContent());
    const line = plain(page.rows[index].text);
    assert.equal(text.split(line).length - 1, 1, `${page.rows[index].kind}: ${text}`);
    assert.ok(text.includes("Каримов Фарход Абдуллаевич") && text.includes("Рустам Каримов"), "who");
    assert.equal(plain(await rows.nth(index).locator('[data-testid="decision-amount"]').textContent()).includes("сум"), false, "the sum is in the line, not in the column");
  }
  const old = plain(await rows.nth(4).textContent());
  assert.ok(old.includes("600 000 сум"), old);
  assert.equal(await run.page.locator('[data-testid="decision-line"]').count(), 4, "the old row has no line");
  assert.equal(run.errors.length, 0, run.errors.join("|"));
  await run.page.close();
});

test("Э7: the filter «Вид» offers the new kinds and sends the `kind` of the server", async () => {
  const run = await open(1280);
  await run.page.click('[data-testid="decisions-kind"]');
  const options = (await run.page.locator('[role="option"]').allTextContents()).map(plain);
  for (const label of ["Перевод", "Уход отменён", "Оплата восстановлена", "Пауза перенесена"]) assert.ok(options.some((item) => item.includes(label)), `${label} in ${options.join("|")}`);
  await run.page.locator('[role="option"]', { hasText: "Оплата восстановлена" }).click();
  await run.page.waitForFunction(() => true);
  await run.page.waitForTimeout(300);
  assert.ok(run.calls.some((call) => call.path === "/auth/org/payments/decisions" && /kind=payment_restored/.test(call.query)), JSON.stringify(run.calls.map((call) => call.query)));
  await run.page.close();
});

test("Э7: a role without the right to money gets the sentence of no access, not a broken list", async () => {
  const run = await openPage(browser, "money2.entry.tsx", F.baseServer((request) => (request.path === "/auth/org/payments/decisions" ? { status: 403, json: { detail: { code: "MONEY_RIGHT_REQUIRED", message: "Нет права" } } } : null)), { width: 375, height: 800 });
  await run.page.evaluate(() => window.mount("decisions", { role: "admin", org_role: "admin" }));
  await run.page.waitForSelector('[data-testid="income-decisions"] [role="alert"], [data-testid="income-decisions"] p');
  assert.equal(await run.page.locator('[data-testid="decision-row"]').count(), 0);
  await run.page.close();
});
