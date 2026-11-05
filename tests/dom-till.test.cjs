// «Деньги-1», пакет А: «Оплата от ученика» in a real DOM - the REAL window, the REAL hooks, the server answered by the test.
// UX pack §5.1-тер (decision of the owner 05.11): the window is about the STUDENT; it does not ask the dry run of the pay of the teachers and is held back by nothing but its form.  The real request has the
// Idempotency-Key of the window and the body of the form; a repeat after a lost answer keeps THAT key.
const assert = require("node:assert/strict");
const test = require("node:test");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { fixture } = require("./helpers/dom-answers.cjs");

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

const SUBMIT = 'button[form="payment-form"]';
const isPay = (call) => call.method === "POST" && call.path === "/auth/org/memberships/m1/payments";

function server(real) {
  return (request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m1/payments/preview") return { json: fixture("e1_preview_300000") };
    if (isPay(request)) return real(request);
    return null;
  };
}

/** The window resets its form once, right after it opens: the form is filled only after the first request for the plan. */
async function fill(page, calls) {
  for (let waited = 0; !calls.some((call) => call.path.endsWith("/payments/preview")) && waited < 5000; waited += 25) await page.waitForTimeout(25);
  await page.fill("#payment-amount", "300000");
  await page.click('[data-testid="payment-methods"] >> text=Наличные');
}

test("«Внести» is held back by nothing but the form: no dry run is asked, the real request has the key of the window and the body of the form", async () => {
  const created = fixture("e1_create_300000");
  const { page, calls, errors } = await openPage(browser, "money.entry.tsx", server(() => ({ status: 201, json: created })));
  await page.evaluate(() => window.mount("till"));
  await fill(page, calls);
  assert.equal(await page.isDisabled(SUBMIT), false, "nothing to wait for");
  await page.click(SUBMIT);
  await page.waitForFunction(() => window.__log.includes("saved") || window.__log.includes("close"));
  const pays = calls.filter(isPay);
  assert.equal(pays.length, 1, "ONE request: no dry run of the pay of the teachers");
  assert.ok(!/dry_run/.test(pays[0].query));
  assert.ok(pays[0].headers["idempotency-key"], "the real request has the key of the window");
  assert.deepEqual(pays[0].body, { amount: 300000, paid_on: pays[0].body.paid_on, method: "cash" });
  assert.deepEqual(errors.filter((text) => !/404|Failed to load resource/.test(text)), []);
  await page.close();
});

test("a repeat after a lost answer keeps the SAME Idempotency-Key (one payment, never two)", async () => {
  let attempts = 0;
  const created = fixture("e1_create_300000");
  const { page, calls } = await openPage(browser, "money.entry.tsx", server(() => {
    attempts += 1;
    return attempts === 1 ? { status: 500, json: { detail: { code: "SERVER_ERROR", message: "Сервер не ответил" } } } : { status: 201, json: created };
  }));
  await page.evaluate(() => window.mount("till"));
  await fill(page, calls);
  await page.click(SUBMIT);
  await page.waitForSelector('[role="alert"]:has-text("Сервер не ответил")');
  await page.waitForFunction(() => !document.querySelector('button[form="payment-form"]').disabled);
  await page.click(SUBMIT);
  await page.waitForFunction(() => window.__log.includes("saved") || window.__log.includes("close"));
  const reals = calls.filter(isPay);
  assert.equal(reals.length, 2);
  assert.equal(reals[0].headers["idempotency-key"], reals[1].headers["idempotency-key"], "one key for the one payment");
  assert.deepEqual(reals[0].body, reals[1].body);
  await page.close();
});

test("a change of the amount asks the plan of the student again, and only that; the button follows the form (the method), never the numbers of the teachers", async () => {
  const { page, calls } = await openPage(browser, "money.entry.tsx", server(() => ({ status: 201, json: fixture("e1_create_300000") })));
  await page.evaluate(() => window.mount("till"));
  for (let waited = 0; !calls.some((call) => call.path.endsWith("/payments/preview")) && waited < 5000; waited += 25) await page.waitForTimeout(25);
  await page.fill("#payment-amount", "250000");
  assert.equal(await page.isDisabled(SUBMIT), true, "no method yet");
  assert.match(await page.textContent('[data-testid="payment-blocker"]'), /Выберите способ оплаты/);
  await page.click('[data-testid="payment-methods"] >> text=Наличные');
  await page.waitForSelector('[data-testid="payment-plan-rows"]');
  await page.fill("#payment-amount", "300000");
  await page.waitForTimeout(700);
  const previews = calls.filter((call) => call.path.endsWith("/payments/preview"));
  assert.ok(previews.some((call) => /amount=\d+/.test(call.query)), "the plan of the student is asked for the amount");
  assert.deepEqual(calls.filter((call) => /dry_run=true/.test(call.query)), [], "no dry run at all");
  await page.close();
});
