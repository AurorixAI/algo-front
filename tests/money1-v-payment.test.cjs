// «Деньги-1 / В», the payment windows: the method is chosen by the person EVERY time (no «как в прошлый раз»), the reason of a correction is required, the cheque photo is said to move,
// «Оплата уже отменена · кем, когда» ends in «Понятно».
const assert = require("node:assert/strict");
const test = require("node:test");
const { start, plain, conflict, ROW, open } = require("./helpers/money1-v.cjs");
const { toshmatovPreview, TOSHMATOV } = require("./helpers/stage-numbers.cjs");

let browser;
test.before(async () => { browser = await start(); });
test.after(async () => { await browser.close(); });

const saved = { json: { payment: { id: "p2", amount: 200000 }, allocation: null, warnings: [], row: ROW } };
const server = (post) => (request) => {
  if (request.method === "GET" && /payments\/preview$/.test(request.path)) return { json: toshmatovPreview(Number(/amount=(\d+)/.exec(request.query)?.[1]) || null) };
  if (request.method === "POST") return post ? post(request) : saved;
  return null;
};
async function mount(name, { width = 1280, post, props } = {}) {
  const run = await open(browser, "money-v.entry.tsx", name, { width, props: { membership: TOSHMATOV, ...props }, server: server(post) });
  await run.page.waitForSelector("#payment-form");
  return run;
}

test("a new payment: no method is chosen, even if this browser used one before; the button is off with «Выберите способ оплаты»", async () => {
  const run = await open(browser, "money-v.entry.tsx", "till", { props: { membership: TOSHMATOV }, server: server() });
  await run.page.evaluate(() => { try { localStorage.setItem("algo.payments.lastMethod", "payme"); } catch {} });
  await run.page.close();
  const { page, calls } = await mount("till");
  assert.equal(await page.locator('[data-testid="payment-methods"] [aria-checked="true"]').count(), 0);
  await page.fill("#payment-amount", "200 000");
  const submit = page.locator('button[form="payment-form"]');
  assert.equal(await submit.isDisabled(), true);
  assert.match(plain(await page.textContent('[data-testid="payment-blocker"]')), /Выберите способ оплаты/);
  await page.click('[data-testid="payment-methods"] >> text=Карта');
  assert.equal(await submit.isDisabled(), false);
  await submit.click();
  await page.waitForFunction(() => window.__log.includes("saved"));
  assert.equal(calls.find((call) => call.method === "POST").body.method, "card");
  assert.ok(!JSON.stringify(calls.map((call) => call.body)).includes('"other"'));
  await page.close();
});

test("«Исправить оплату»: the reason is required (no «необязательно»), the button is off with the line «почему», the body carries the reason; the method stays the corrected payment's", async () => {
  const { page, calls } = await mount("replace");
  assert.match(plain(await page.textContent('label[for="payment-reason"]')), /^Причина исправления \(обязательно\)$/);
  assert.doesNotMatch(plain(await page.textContent("#payment-form")), /необязательно/);
  assert.equal(await page.locator('[data-testid="payment-methods"] [aria-checked="true"]').innerText(), "Наличные");
  const submit = page.locator('button[form="payment-form"]');
  await page.fill("#payment-amount", "200 000");
  assert.equal(await submit.isDisabled(), true);
  assert.match(plain(await page.textContent('[data-testid="payment-blocker"]')), /Укажите причину/);
  await page.fill("#payment-reason", "ошибся в сумме");
  assert.equal(await submit.isDisabled(), false);
  await submit.click();
  await page.waitForFunction(() => window.__log.includes("saved"));
  const post = calls.find((call) => call.method === "POST");
  assert.equal(post.body.reason, "ошибся в сумме");
  assert.equal(post.body.method, "cash");
  assert.ok(post.headers["idempotency-key"]);
  await page.close();
});

test("«Исправить оплату»: the line «Фото чека перенесётся…» only when the payment has a photo", async () => {
  {
    const { page } = await mount("replace");
    assert.equal(await page.locator('[data-testid="payment-replace-files"]').count(), 0);
    await page.close();
  }
  {
    const payment = { id: "p1", amount: 400000, paid_on: "2026-11-05", method: "cash", note: null, files: [{ id: "f1", filename: "cheque.jpg" }] };
    const { page } = await mount("replace", { props: { payment } });
    assert.equal(plain(await page.textContent('[data-testid="payment-replace-files"]')), "Фото чека перенесётся в исправленную оплату");
    await page.close();
  }
});

test("«Исправить оплату»: a server 422 REASON_REQUIRED stands under the reason; ALREADY_VOIDED says who and when and ends in «Понятно»", async () => {
  {
    const { page } = await mount("replace", { post: () => ({ status: 422, json: { detail: { code: "REASON_REQUIRED", message: "Причина: от 3 до 500 символов" } } }) });
    await page.fill("#payment-amount", "200 000");
    await page.fill("#payment-reason", "ошибся");
    await page.click('button[form="payment-form"]');
    await page.waitForSelector('[data-testid="payment-reason-error"]');
    assert.equal(plain(await page.textContent('[data-testid="payment-reason-error"]')), "Причина: от 3 до 500 символов");
    await page.close();
  }
  {
    const { page } = await mount("replace", { post: () => conflict("ALREADY_VOIDED", "Оплата уже отменена", { voided_at: "2026-11-05T09:20:00", voided_by_name: "Иванова Д." }) });
    await page.fill("#payment-amount", "200 000");
    await page.fill("#payment-reason", "ошибся");
    await page.click('button[form="payment-form"]');
    await page.waitForSelector('[data-testid="already-voided"]');
    assert.match(plain(await page.textContent('[data-testid="already-voided"]')), /^Оплата уже отменена · Иванова Д\., 05\.11\.2026 14:20$/);
    await page.click("text=Понятно");
    assert.deepEqual(await page.evaluate(() => window.__log), ["stale", "close"]);
    await page.close();
  }
});
