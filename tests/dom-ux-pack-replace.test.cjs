// UX pack №13 in a real browser: the window «Исправить оплату».  The FIRST line says what it was and what it will be («Было: 400 000 сум · 05.11.2026 · наличные → станет: 200 000 сум»), the sentence about
// the history stands over the fields (not under them), the block «Что изменится» shows the skeleton while the calculation is on its way, the main button names the action and the sum.  The CSS is the project's tailwind.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { deferred } = require("./helpers/dom-answers.cjs");
const { toshmatovPreview, TOSHMATOV } = require("./helpers/stage-numbers.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => text.replace(/\s+/g, " ").trim();
const server = (hold) => async (request) => {
  if (request.method === "GET" && request.path === "/auth/org/memberships/m1/payments/preview") {
    if (hold) await hold.promise;
    return { json: toshmatovPreview(Number(/amount=(\d+)/.exec(request.query)?.[1]) || null) };
  }
  return null;
};
async function open(width, hold) {
  const run = await openPage(browser, "money.entry.tsx", server(hold), { width, height: 900 });
  await run.page.evaluate((membership) => window.mount("replace", undefined, { membership }), TOSHMATOV);
  await run.page.waitForSelector('[data-testid="payment-replace-change"]');
  return run;
}

test("№13: the first line is «Было: … → станет: …», it follows the amount, the date and the method live", async () => {
  const { page } = await open(1280);
  const change = page.locator('[data-testid="payment-replace-change"]');
  assert.equal(plain(await change.textContent()), "Было: 400 000 сум · 05.11.2026 · наличные → станет: 400 000 сум");
  await page.fill("#payment-amount", "200 000");
  assert.equal(plain(await change.textContent()), "Было: 400 000 сум · 05.11.2026 · наличные → станет: 200 000 сум");
  await page.click('[data-testid="payment-methods"] >> text=Карта');
  assert.equal(plain(await change.textContent()), "Было: 400 000 сум · 05.11.2026 · наличные → станет: 200 000 сум · карта");
  await page.fill("#payment-amount", "");
  assert.equal(plain(await change.textContent()), "Было: 400 000 сум · 05.11.2026 · наличные → станет: — · карта");
  // it is the FIRST thing of the form, over the amount
  const order = await page.evaluate(() => { const a = document.querySelector('[data-testid="payment-replace-change"]').getBoundingClientRect().top; const b = document.querySelector("#payment-amount").getBoundingClientRect().top; return a < b; });
  assert.equal(order, true);
  await page.close();
});

test("№13: the sentence about the history stands OVER the fields, once; the reason has no second explanation under it", async () => {
  const { page } = await open(1280);
  const note = page.locator('[data-testid="payment-replace-note"]');
  assert.equal(plain(await note.textContent()), "Прежняя запись будет отменена и останется в истории серым. Оплаты ученика в группе пересчитаются.");
  const geometry = await page.evaluate(() => ({ note: document.querySelector('[data-testid="payment-replace-note"]').getBoundingClientRect().top, amount: document.querySelector("#payment-amount").getBoundingClientRect().top, reason: document.querySelector("#payment-reason").getBoundingClientRect().top }));
  assert.ok(geometry.note < geometry.amount && geometry.amount < geometry.reason, JSON.stringify(geometry));
  assert.equal((plain(await page.textContent('[role="dialog"]')).match(/останется в истории серым/g) ?? []).length, 1);
  await page.close();
});

test("№13: while the calculation is asked the block «Что изменится» is a skeleton (no jump), then the rows; the button names the action and the sum", async () => {
  const hold = deferred();
  const { page } = await open(1280, hold);
  await page.waitForSelector('[data-testid="payment-plan-skeleton"]');
  assert.equal(await page.locator('[data-testid="payment-plan-rows"]').count(), 0);
  hold.open();
  await page.waitForSelector('[data-testid="payment-plan-rows"]');
  assert.equal(await page.locator('[data-testid="payment-plan-skeleton"]').count(), 0);
  assert.equal(plain(await page.textContent('button[form="payment-form"]')), "Исправить на 400 000 сум");
  await page.fill("#payment-amount", "200 000");
  assert.equal(plain(await page.textContent('button[form="payment-form"]')), "Исправить на 200 000 сум");
  assert.equal(plain(await page.textContent('[data-testid="confirm-cancel"]')), "Отмена");
  await page.close();
});

for (const width of [1280, 1024, 375]) {
  test(`${width}: nothing leaves its box, no horizontal scroll; the buttons are at least 40 px on a phone`, async () => {
    const { page } = await open(width);
    await page.waitForSelector('[data-testid="payment-plan-rows"]');
    await page.waitForTimeout(450);
    const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    if (width < 1024) {
      const heights = await page.evaluate(() => ['button[form="payment-form"]', '[data-testid="confirm-cancel"]'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().height)));
      assert.ok(heights.every((h) => h >= 40), heights.join(","));
    }
    await page.close();
  });
}
