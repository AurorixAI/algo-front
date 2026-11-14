// Money-1 / Г, круг G3M (FIX_FRONT.md): каждый пункт — поведение настоящего окна в настоящем браузере, ответ сервера даёт тест.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { start, plain, invalid, ROW, open } = require("./helpers/money1-v.cjs");
const { toshmatovPreview, TOSHMATOV } = require("./helpers/stage-numbers.cjs");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let browser;
test.before(async () => { browser = await start(); });
test.after(async () => { await browser.close(); });

// ── Ф1 ──
test("Ф1: «Исправить оплату» в выписке стоит и у ушедшего ученика (нет условия is_active)", () => {
  const src = read("src/components/payments/statement-view.tsx");
  const menu = src.slice(src.indexOf("key: \"correct\"") - 200, src.indexOf("key: \"correct\"") + 100);
  assert.doesNotMatch(menu, /is_active/);
});

test("Ф1: отказ PAYMENT_EXCEEDS_DEBT при исправлении показан словами сервера, без своего текста и без «Повторить»", async () => {
  const text = "Ученик ушёл из группы: при исправлении сумма не может быть больше 347 000 сум";
  const server = (request) => {
    if (request.method === "GET" && /payments\/preview$/.test(request.path)) return { json: toshmatovPreview(Number(/amount=(\d+)/.exec(request.query)?.[1]) || null) };
    if (request.method === "POST") return invalid("PAYMENT_EXCEEDS_DEBT", text, { debt: 347000 });
    return null;
  };
  const payment = { id: "p1", amount: 300000, paid_on: "2026-11-05", method: "cash", note: null };
  const run = await open(browser, "money-v.entry.tsx", "replace", { props: { membership: TOSHMATOV, payment }, server });
  const page = run.page;
  await page.waitForSelector("#payment-form");
  await page.fill("#payment-amount", "400 000");
  await page.fill("#payment-reason", "ошибся в сумме");
  await page.waitForSelector('[data-testid="money-effects"][data-state="failed"]');
  assert.ok(plain(await page.textContent("#payment-form")).includes(text));
  assert.equal(await page.locator('[data-testid="money-effects-retry"]').count(), 0);
  assert.ok(plain(await page.textContent('[data-testid="payment-blocker"]')).includes(text));
  await page.close();
});
