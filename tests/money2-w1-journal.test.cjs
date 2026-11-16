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

const LINES = ["в «Физика 9»", "«Алгебра 7»", "оплата № 1", "в «Физика 9»"];
const CHIPS = ["Перевод", "Уход отменён", "Оплата восстановлена", "Пауза перенесена"];

test("Э7 / А8: each new kind is a SHORT chip and ONE line from the structure of the row (the group, the receipt); the sum is in its column once; the whole sentence of the server is in the opened row", async () => {
  const page = F.decisionsPage(F.SHORT);
  const run = await open(1280, (request) => (request.path === "/auth/org/payments/decisions" ? { json: page } : null));
  const rows = run.page.locator('[data-testid="decision-row"]');
  assert.equal(await rows.count(), 5);
  for (let index = 0; index < 4; index += 1) {
    const text = plain(await rows.nth(index).evaluate((el) => el.innerText));
    assert.equal(plain(await rows.nth(index).locator('[data-testid="decision-kind"]').textContent()), CHIPS[index]);
    assert.equal(plain(await rows.nth(index).locator('[data-testid="decision-line"]').textContent()), LINES[index]);
    const whole = plain(await rows.nth(index).textContent());
    assert.ok(whole.includes("Каримов Фарход Абдуллаевич") && whole.includes("Рустам Каримов"), "who");
    assert.ok(!text.includes(plain(page.rows[index].text)), "the whole sentence is not in the line");
  }
  assert.equal(plain(await rows.nth(0).locator('[data-testid="decision-amount"]').textContent()), "440 000 сум", "the transfer: the carried sum is in the column");
  assert.equal(plain(await rows.nth(2).locator('[data-testid="decision-amount"]').textContent()), "600 000 сум");
  const old = plain(await rows.nth(4).textContent());
  assert.ok(old.includes("600 000 сум"), old);
  assert.equal(await run.page.locator('[data-testid="decision-line"]').count(), 4, "the old row has no line");
  await rows.nth(0).click();
  assert.equal(plain(await run.page.locator('[data-testid="decision-text"]').textContent()), plain(page.rows[0].text), "the whole sentence in the opened row");
  assert.equal(run.errors.length, 0, run.errors.join("|"));
  await run.page.close();
});

test("А8: without the group in the structure the sentence of the server stands as the line (nothing is guessed)", async () => {
  const page = F.decisionsPage(F.SHORT);
  page.rows[0].group_name = null;
  const run = await open(1280, (request) => (request.path === "/auth/org/payments/decisions" ? { json: page } : null));
  assert.equal(plain(await run.page.locator('[data-testid="decision-line"]').first().textContent()), plain(page.rows[0].text));
  await run.page.close();
});

test("Б1 (375): the card shows only the cells that have a value - no «Сумма —», «Долг —», «Кто —»", async () => {
  const page = F.decisionsPage(F.SHORT);
  page.rows[1].actor_name = null;
  const run = await openPage(browser, "money2.entry.tsx", F.baseServer((request) => (request.path === "/auth/org/payments/decisions" ? { json: page } : null)), { width: 375, height: 900 });
  await run.page.evaluate(() => window.mount("decisions", { role: "owner", org_role: "owner" }));
  await run.page.waitForSelector('[data-testid="decision-row"]');
  const dashes = await run.page.evaluate(() => [...document.querySelectorAll('[data-testid="decision-row"]')].map((row) => [...row.querySelectorAll(".dt-cell")].filter((cell) => getComputedStyle(cell).display !== "none" && /—/.test(cell.textContent ?? "")).map((cell) => cell.getAttribute("data-col"))));
  assert.deepEqual(dashes, [[], [], [], [], []], JSON.stringify(dashes));
  await run.page.close();
  const wide = await open(1280, (request) => (request.path === "/auth/org/payments/decisions" ? { json: page } : null));
  assert.ok((await wide.page.locator('[data-testid="decision-row"]').nth(1).locator("[data-testid=decision-debt]").evaluate((el) => el.textContent.includes("—"))), "the table keeps the dash in its column");
  await wide.page.close();
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

test("Э7 (375): a long kind label wraps inside the card (the chip never leaves it), no horizontal scroll", async () => {
  const run = await openPage(browser, "money2.entry.tsx", F.baseServer(answer), { width: 375, height: 900 });
  await run.page.evaluate(() => window.mount("decisions", { role: "owner", org_role: "owner" }));
  await run.page.waitForSelector('[data-testid="decision-row"]');
  await run.page.waitForTimeout(300);
  const out = await run.page.evaluate(() => [...document.querySelectorAll('[data-testid="decision-row"]')].flatMap((row) => { return [...row.querySelectorAll('[data-testid="decision-kind"]')].filter((chip) => chip.scrollWidth > chip.clientWidth + 1 || chip.getBoundingClientRect().right > chip.parentElement.getBoundingClientRect().right + 1).map((chip) => chip.textContent); }));
  assert.deepEqual(out, [], "a chip leaves its card");
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  await run.page.close();
});
