// «Деньги-1», пакет А, R3 K1 / m5: «Внести оплату» in a real DOM - the REAL window, the REAL hooks, the server answered by the test.
// The button waits for the answer about money (the block says «Считаем…» meanwhile); a calculation that FAILED or could not count lets it go, with a line next to the button.
// The dry run is the request of the payment with `?dry_run=true`, the same body, no Idempotency-Key; the real request has the key of the window, and a repeat after a failure keeps THAT key.
const assert = require("node:assert/strict");
const test = require("node:test");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { fixture, OWNER_EFFECTS, deferred } = require("./helpers/dom-answers.cjs");

let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

const SUBMIT = 'button[form="payment-form"]';
const isDry = (call) => /dry_run=true/.test(call.query);
const isPay = (call) => call.method === "POST" && call.path === "/auth/org/memberships/m1/payments";

/** The server of the till: the plan of the payment, the dry run (`dry`), the real request (`real`). */
function server({ dry, real }) {
  return (request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m1/payments/preview") return { json: fixture("e1_preview_300000") };
    if (isPay(request)) return isDry(request) ? dry(request) : real(request);
    return null;
  };
}

/** The window resets its form once, right after it opens (the effect that makes it `ready` also asks the plan of the payment): the form is filled only after that first request, never before. */
async function fill(page, calls) {
  for (let waited = 0; !calls.some((call) => call.path.endsWith("/payments/preview")) && waited < 5000; waited += 25) await page.waitForTimeout(25);
  await page.fill("#payment-amount", "300000");
  await page.click('[data-testid="payment-methods"] >> text=Наличные');
}

test("K1: «Внести» waits while the effects are counted; then it works; the dry run has no key, the real request has the key of the window and the SAME body", async () => {
  const hold = deferred();
  const created = { ...fixture("e1_create_300000"), money_effects: { ...OWNER_EFFECTS, dryRun: false } };
  const { page, calls, errors } = await openPage(browser, "money.entry.tsx", server({
    dry: async () => { await hold.promise; return { status: 200, json: { ...created, dry_run: true, money_effects: OWNER_EFFECTS } }; },
    real: () => ({ status: 201, json: created }),
  }));
  await page.evaluate(() => window.mount("till"));
  await fill(page, calls);
  await page.waitForFunction(() => document.querySelector('[data-testid="money-effects"][data-state="loading"]'));
  assert.equal(await page.isDisabled(SUBMIT), true, "the answer about money is not here: the button waits");
  assert.match(await page.textContent('[data-testid="money-effects"]'), /Считаем, что изменится с деньгами/, "and the block says why - once");
  hold.open();
  await page.waitForFunction(() => document.querySelector('[data-testid="money-effects"][data-state="ready"]'));
  assert.match(await page.textContent('[data-testid="money-effects"]'), /475\s000\sсум\s→\s425\s000\sсум/);
  assert.equal(await page.isDisabled(SUBMIT), false);
  await page.click(SUBMIT);
  await page.waitForFunction(() => window.__log.includes("saved") || window.__log.includes("close"));
  const dry = calls.find((call) => isPay(call) && isDry(call));
  const real = calls.find((call) => isPay(call) && !isDry(call));
  assert.ok(dry && real, "both requests were made");
  assert.equal(dry.headers["idempotency-key"], undefined, "a dry run has no key");
  assert.ok(real.headers["idempotency-key"], "the real request has the key of the window");
  assert.deepEqual(real.body, dry.body, "the same body");
  assert.deepEqual(errors.filter((text) => !/404|Failed to load resource/.test(text)), []);
  await page.close();
});

test("K1: a repeat after a lost answer keeps the SAME Idempotency-Key (one payment, never two)", async () => {
  let attempts = 0;
  const created = fixture("e1_create_300000");
  const { page, calls } = await openPage(browser, "money.entry.tsx", server({
    dry: () => ({ json: { ...created, dry_run: true, money_effects: OWNER_EFFECTS } }),
    real: () => { attempts += 1; return attempts === 1 ? { status: 500, json: { detail: { code: "SERVER_ERROR", message: "Сервер не ответил" } } } : { status: 201, json: created }; },
  }));
  await page.evaluate(() => window.mount("till"));
  await fill(page, calls);
  await page.waitForFunction(() => document.querySelector('[data-testid="money-effects"][data-state="ready"]'));
  await page.click(SUBMIT);
  await page.waitForSelector('[role="alert"]:has-text("Сервер не ответил")');
  await page.waitForFunction(() => !document.querySelector('button[form="payment-form"]').disabled);
  await page.click(SUBMIT);
  await page.waitForFunction(() => window.__log.includes("saved") || window.__log.includes("close"));
  const reals = calls.filter((call) => isPay(call) && !isDry(call));
  assert.equal(reals.length, 2);
  assert.equal(reals[0].headers["idempotency-key"], reals[1].headers["idempotency-key"], "one key for the one payment");
  assert.deepEqual(reals[0].body, reals[1].body);
  await page.close();
});

test("K1: the calculation FAILED - the button is free and the line next to it says the effects were not counted (once; the block is not shown)", async () => {
  const created = fixture("e1_create_300000");
  const { page, calls } = await openPage(browser, "money.entry.tsx", server({
    dry: () => ({ status: 500, json: { detail: { code: "SERVER_ERROR", message: "Расчёт не удался" } } }),
    real: () => ({ status: 201, json: created }),
  }));
  await page.evaluate(() => window.mount("till"));
  await fill(page, calls);
  await page.waitForSelector('[data-testid="till-effects-notice"]');
  assert.match(await page.textContent('[data-testid="till-effects-notice"]'), /Последствия для денег не удалось посчитать/);
  assert.equal(await page.locator('[data-testid="money-effects"]').count(), 0, "the same fact is not said twice");
  assert.equal(await page.isDisabled(SUBMIT), false, "money is taken in whether the calculation answers or not");
  await page.click(SUBMIT);
  await page.waitForFunction(() => window.__log.includes("saved") || window.__log.includes("close"));
  assert.equal(calls.filter((call) => isPay(call) && !isDry(call)).length, 1);
  await page.close();
});

test("K1: the calculation could not COUNT (`unavailable: true`) - the same: a free button and the line next to it", async () => {
  const created = fixture("e1_create_300000");
  const { page, calls } = await openPage(browser, "money.entry.tsx", server({
    dry: () => ({ json: { ...created, dry_run: true, money_effects: { students: [], payroll: [], unavailable: true, text: "", dryRun: true } } }),
    real: () => ({ status: 201, json: created }),
  }));
  await page.evaluate(() => window.mount("till"));
  await fill(page, calls);
  await page.waitForSelector('[data-testid="till-effects-notice"]');
  assert.equal(await page.locator('[data-testid="money-effects"]').count(), 0);
  assert.equal(await page.isDisabled(SUBMIT), false);
  await page.close();
});

test("K1: a change of the amount asks the dry run again - the old answer is never the answer to the new amount (the button waits again)", async () => {
  const created = fixture("e1_create_300000");
  const holds = [deferred(), deferred()];
  let n = 0;
  const { page, calls } = await openPage(browser, "money.entry.tsx", server({
    dry: async () => { const hold = holds[n++]; await hold.promise; return { json: { ...created, dry_run: true, money_effects: OWNER_EFFECTS } }; },
    real: () => ({ status: 201, json: created }),
  }));
  await page.evaluate(() => window.mount("till"));
  await fill(page, calls);
  await page.waitForFunction(() => document.querySelector('[data-testid="money-effects"][data-state="loading"]'));
  holds[0].open();
  await page.waitForFunction(() => document.querySelector('[data-testid="money-effects"][data-state="ready"]'));
  await page.fill("#payment-amount", "250000");
  await page.waitForFunction(() => document.querySelector('[data-testid="money-effects"][data-state="loading"]'));
  assert.equal(await page.isDisabled(SUBMIT), true, "the new amount has no answer yet");
  holds[1].open();
  await page.waitForFunction(() => document.querySelector('[data-testid="money-effects"][data-state="ready"]'));
  assert.equal(await page.isDisabled(SUBMIT), false);
  const dries = calls.filter((call) => isPay(call) && isDry(call));
  assert.equal(dries.length, 2);
  assert.deepEqual(dries.map((call) => call.body.amount), [300000, 250000]);
  await page.close();
});
