// «Деньги-1 / В» in a real browser: the windows of the refund, the forgiveness and the three cancels - the reason is the person's, the window sends the sum it SHOWED
// (`expected_*`) and one `Idempotency-Key`, a double press is ONE request, `BALANCE_CHANGED` goes on with the new number, `DUPLICATE_*` and `ALREADY_VOIDED` are told in words.
const assert = require("node:assert/strict");
const test = require("node:test");
const { deferred } = require("./helpers/dom-answers.cjs");
const { start, plain, conflict, ROW, open } = require("./helpers/money1-v.cjs");

let browser;
test.before(async () => { browser = await start(); });
test.after(async () => { await browser.close(); });

const NB = " ";
const done = { json: { refund: { id: "r1", receipt_no: 12, amount: 344000 }, advance_before: 344000, advance_after: 0, row: ROW } };

async function refund(width = 1280, answer = () => done) {
  const run = await open(browser, "money-v.entry.tsx", "refund", { width, server: (request) => (request.method === "POST" && request.path === "/auth/org/memberships/m1/refunds" ? answer(request) : null) });
  await run.page.waitForSelector("#refund-form");
  return run;
}
const fillRefund = async (page, reason = "ученик ушёл") => {
  await page.click('[data-testid="refund-methods"] >> text=Наличные');
  await page.fill("#refund-reason", reason);
};

test("refund: the reason is required - no «(необязательно)», the button is off with the line «почему» until it has 3 characters", async () => {
  const { page } = await refund();
  assert.match(plain(await page.textContent('label[for="refund-reason"]')), /^Причина \(обязательно\)$/);
  assert.doesNotMatch(plain(await page.textContent("#refund-form")), /необязательно/);
  await page.click('[data-testid="refund-methods"] >> text=Наличные');
  const submit = page.locator('[data-testid="refund-submit"]');
  assert.equal(await submit.isDisabled(), true);
  assert.match(plain(await page.textContent('[data-testid="refund-why"]')), /Укажите причину/);
  await page.fill("#refund-reason", "уш");
  assert.equal(await submit.isDisabled(), true);
  await page.fill("#refund-reason", "ушёл");
  assert.equal(await submit.isDisabled(), false);
  assert.equal(plain(await submit.textContent()), `Вернуть аванс 344${NB}000 сум`.replace(NB, " "));
  assert.ok((await submit.textContent()).includes(`344${NB}000${NB}сум`), "NBSP in the sum of the button");
  await page.close();
});

test("refund: no method is chosen for the person; the body carries the method, the reason, expected_refundable and the Idempotency-Key", async () => {
  const { page, calls } = await refund();
  await page.fill("#refund-reason", "ученик ушёл");
  assert.equal(await page.locator('[data-testid="refund-submit"]').isDisabled(), true, "no method - off");
  assert.match(plain(await page.textContent('[data-testid="refund-why"]')), /Выберите способ возврата/);
  await page.click('[data-testid="refund-methods"] >> text=Карта');
  await page.click('[data-testid="refund-submit"]');
  await page.waitForFunction(() => window.__log.includes("close"));
  const post = calls.find((call) => call.method === "POST");
  assert.equal(post.body.method, "card");
  assert.equal(post.body.reason, "ученик ушёл");
  assert.equal(post.body.expected_refundable, 344000);
  assert.equal(post.body.amount, 344000);
  assert.match(post.headers["idempotency-key"], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(await page.evaluate(() => window.__log), ["done:12", "close"]);
  await page.close();
});

test("refund: two quick presses are ONE request", async () => {
  const hold = deferred();
  const { page, calls } = await refund(1280, async () => { await hold.promise; return done; });
  await fillRefund(page);
  await page.evaluate(() => { const form = document.querySelector("#refund-form"); form.requestSubmit(); form.requestSubmit(); });
  await page.waitForTimeout(150);
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  hold.open();
  await page.waitForFunction(() => window.__log.includes("close"));
  await page.close();
});

test("refund: 409 BALANCE_CHANGED says «было … сейчас …», goes on with the new number and the SAME key", async () => {
  let n = 0;
  const { page, calls } = await refund(1280, () => (++n === 1 ? conflict("BALANCE_CHANGED", `Сумма к возврату изменилась: было 344${NB}000${NB}сум, сейчас 244${NB}000${NB}сум`, { refundable: 244000, advance: 244000 }) : done));
  await fillRefund(page);
  await page.click('[data-testid="refund-submit"]');
  const notice = page.locator('[data-testid="balance-changed"]');
  await notice.waitFor();
  assert.match(plain(await notice.textContent()), /Сумма к возврату изменилась: было 344 000 сум, сейчас 244 000 сум/);
  assert.match(plain(await page.textContent('[data-testid="balance-changed-continue"]')), /^Продолжить с 244 000 сум$/);
  assert.equal(await page.locator('[data-testid="refund-submit"]').isDisabled(), true, "the person goes on first");
  assert.deepEqual(await page.evaluate(() => window.__log), [], "the window stays open, nothing is written by the notice");
  await page.click('[data-testid="balance-changed-continue"]');
  assert.equal(plain(await page.inputValue("#refund-amount")), "244 000");
  assert.match(plain(await page.textContent("#refund-form")), /Сумма уменьшена до 244 000 сум/);
  assert.equal(plain(await page.textContent('[data-testid="refund-refundable"]')), "244 000 сум");
  await page.click('[data-testid="refund-submit"]');
  await page.waitForFunction(() => window.__log.includes("close"));
  const posts = calls.filter((call) => call.method === "POST");
  assert.equal(posts[1].body.expected_refundable, 244000);
  assert.equal(posts[1].body.amount, 244000);
  assert.equal(posts[1].headers["idempotency-key"], posts[0].headers["idempotency-key"]);
  await page.close();
});

test("refund: BALANCE_CHANGED to 0 - «Возвращать нечего» and «Закрыть»; DUPLICATE_REFUND closes the window with no red error", async () => {
  {
    const { page } = await refund(1280, () => conflict("BALANCE_CHANGED", "Сумма к возврату изменилась: было 344 000 сум, сейчас 0 сум", { refundable: 0, advance: 0 }));
    await fillRefund(page);
    await page.click('[data-testid="refund-submit"]');
    await page.waitForSelector('[data-testid="balance-changed-close"]');
    assert.match(plain(await page.textContent('[data-testid="balance-changed"]')), /Возвращать нечего/);
    await page.close();
  }
  {
    const { page } = await refund(1280, () => conflict("DUPLICATE_REFUND", "Этот возврат уже внесён", { refund_id: "r9" }));
    await fillRefund(page);
    await page.click('[data-testid="refund-submit"]');
    await page.waitForFunction(() => window.__log.includes("close"));
    assert.deepEqual(await page.evaluate(() => window.__log), ["duplicate", "close"]);
    await page.close();
  }
});

test("refund: 422 REASON_REQUIRED stands under the reason field", async () => {
  const { page } = await refund(1280, () => ({ status: 422, json: { detail: { code: "REASON_REQUIRED", message: "Причина: от 3 до 500 символов" } } }));
  await fillRefund(page);
  await page.click('[data-testid="refund-submit"]');
  await page.waitForSelector('[data-testid="refund-reason-error"]');
  assert.equal(plain(await page.textContent('[data-testid="refund-reason-error"]')), "Причина: от 3 до 500 символов");
  await page.close();
});

test("refund on 375: the window is usable, methods are tap zones of 40 px, nothing leaves the screen", async () => {
  const { page } = await refund(375);
  const geometry = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-testid="refund-methods"] button')].map((el) => el.getBoundingClientRect().height);
    return { min: Math.min(...buttons), scroll: document.documentElement.scrollWidth, width: window.innerWidth };
  });
  assert.ok(geometry.min >= 40, JSON.stringify(geometry));
  assert.ok(geometry.scroll <= geometry.width, JSON.stringify(geometry));
  await page.close();
});

// ── forgiveness ───────────────────────────────────────────────────────────────

const writeoffDone = { json: { writeoff: { id: "w1" }, debt_before: 350000, debt_after: 0, row: ROW } };
async function writeoff(answer = () => writeoffDone) {
  const run = await open(browser, "money-v.entry.tsx", "writeoff", { server: (request) => (request.method === "POST" && request.path === "/auth/org/memberships/m1/writeoffs" ? answer(request) : null) });
  await run.page.waitForSelector("#writeoff-form");
  return run;
}

test("forgiveness: the body carries expected_debt and the key; the button names the sum; the reason is required", async () => {
  const { page, calls } = await writeoff();
  const submit = page.locator('[data-testid="writeoff-submit"]');
  assert.ok((await submit.textContent()).includes(`350${NB}000${NB}сум`));
  await page.fill("#writeoff-reason", "болезнь");
  await submit.click();
  await page.waitForFunction(() => window.__log.includes("close"));
  const post = calls.find((call) => call.method === "POST");
  assert.deepEqual([post.body.all, post.body.expected_debt, post.body.reason], [true, 350000, "болезнь"]);
  assert.ok(post.headers["idempotency-key"]);
  await page.close();
});

test("forgiveness: a short reason is told under its field and nothing is sent; two presses are one request", async () => {
  const hold = deferred();
  const { page, calls } = await writeoff(async () => { await hold.promise; return writeoffDone; });
  await page.fill("#writeoff-reason", "бо");
  await page.click('[data-testid="writeoff-submit"]');
  await page.waitForSelector('[data-testid="writeoff-reason-error"]');
  assert.equal(calls.filter((call) => call.method === "POST").length, 0);
  await page.fill("#writeoff-reason", "болезнь");
  await page.evaluate(() => { const form = document.querySelector("#writeoff-form"); form.requestSubmit(); form.requestSubmit(); });
  await page.waitForTimeout(150);
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  hold.open();
  await page.waitForFunction(() => window.__log.includes("close"));
  await page.close();
});

test("forgiveness: BALANCE_CHANGED - «Весь долг» takes the new debt by itself and the next try carries it as expected_debt", async () => {
  let n = 0;
  const { page, calls } = await writeoff(() => (++n === 1 ? conflict("BALANCE_CHANGED", "Долг изменился: было 350 000 сум, сейчас 200 000 сум", { debt: 200000, advance: 0 }) : writeoffDone));
  await page.fill("#writeoff-reason", "болезнь");
  await page.click('[data-testid="writeoff-submit"]');
  await page.waitForSelector('[data-testid="balance-changed"]');
  assert.match(plain(await page.textContent('[data-testid="balance-changed"]')), /Долг изменился: было 350 000 сум, сейчас 200 000 сум/);
  assert.match(plain(await page.textContent('[data-testid="balance-changed-continue"]')), /Продолжить с 200 000 сум/);
  await page.click('[data-testid="balance-changed-continue"]');
  assert.equal(plain(await page.textContent('[data-testid="writeoff-debt"]')), "200 000 сум");
  assert.ok((await page.textContent('[data-testid="writeoff-submit"]')).includes(`200${NB}000${NB}сум`));
  await page.click('[data-testid="writeoff-submit"]');
  await page.waitForFunction(() => window.__log.includes("close"));
  const posts = calls.filter((call) => call.method === "POST");
  assert.equal(posts[1].body.expected_debt, 200000);
  assert.equal(posts[1].headers["idempotency-key"], posts[0].headers["idempotency-key"]);
  await page.close();
});

test("forgiveness: «Часть долга» above the new debt is set to the new debt and said in one line; DUPLICATE_WRITEOFF is a success", async () => {
  let n = 0;
  const { page } = await writeoff(() => (++n === 1 ? conflict("BALANCE_CHANGED", "Долг изменился: было 350 000 сум, сейчас 100 000 сум", { debt: 100000, advance: 0 }) : conflict("DUPLICATE_WRITEOFF", "Это прощение уже внесено", { writeoff_id: "w9" })));
  await page.click("text=Часть долга");
  await page.fill('input[aria-label="Сумма прощения"]', "300 000");
  await page.fill("#writeoff-reason", "болезнь");
  await page.click('[data-testid="writeoff-submit"]');
  await page.click('[data-testid="balance-changed-continue"]');
  assert.match(plain(await page.textContent("#writeoff-form")), /Сумма уменьшена до 100 000 сум/);
  await page.click('[data-testid="writeoff-submit"]');
  await page.waitForFunction(() => window.__log.includes("close"));
  assert.deepEqual(await page.evaluate(() => window.__log), ["duplicate", "close"]);
  await page.close();
});

// ── the cancels ───────────────────────────────────────────────────────────────

async function cancel(name, answer) {
  const run = await open(browser, "money-v.entry.tsx", name, { server: (request) => (request.method === "POST" ? answer(request) : null) });
  await run.page.waitForSelector("#record-void-form");
  return run;
}

test("cancel of a forgiveness: expected_debt of the window goes with the reason; BALANCE_CHANGED continues with the new debt", async () => {
  let n = 0;
  const { page, calls } = await cancel("voidWriteoff", () => (++n === 1 ? conflict("BALANCE_CHANGED", "Долг изменился: было 100 000 сум, сейчас 70 000 сум", { debt: 70000, advance: 0 }) : { json: { writeoff: { id: "w1" }, row: ROW } }));
  await page.fill("#record-void-reason", "ошиблись");
  await page.click("text=Отменить прощение >> nth=-1");
  await page.waitForSelector('[data-testid="balance-changed"]');
  assert.match(plain(await page.textContent('[data-testid="balance-changed-continue"]')), /^Продолжить с 70 000 сум$/);
  await page.click('[data-testid="balance-changed-continue"]');
  assert.deepEqual(await page.evaluate(() => window.__log), ["stale"]);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.__log.includes("voided"));
  const posts = calls.filter((call) => call.method === "POST");
  assert.deepEqual(posts.map((call) => call.body.expected_debt), [100000, 70000]);
  await page.close();
});

test("cancel of a refund sends expected_advance; ALREADY_VOIDED says who and when and the only button is «Понятно»", async () => {
  const { page, calls } = await cancel("voidRefund", () => conflict("ALREADY_VOIDED", "Возврат уже отменён", { voided_at: "2026-11-05T09:20:00", voided_by_name: "Иванова Д." }));
  await page.fill("#record-void-reason", "ошиблись");
  await page.click('button[type="submit"]');
  await page.waitForSelector('[data-testid="already-voided"]');
  assert.equal(calls.find((call) => call.method === "POST").body.expected_advance, 0);
  assert.match(plain(await page.textContent('[data-testid="already-voided"]')), /^Возврат уже отменён · Иванова Д\., 05\.11\.2026 14:20$/);
  assert.equal(await page.locator('button[type="submit"]').count(), 0);
  await page.click("text=Понятно");
  assert.deepEqual(await page.evaluate(() => window.__log), ["stale", "close"]);
  await page.close();
});

test("cancel of a payment: ALREADY_VOIDED is told with the author; two presses are one request", async () => {
  const hold = deferred();
  const { page, calls } = await open(browser, "money-v.entry.tsx", "voidPayment", { server: async (request) => { if (request.method !== "POST") return null; if (/dry_run=true/.test(request.query)) return { json: { payment: {}, row: {}, dry_run: true, money_effects: { students: [], payroll: [], text: "", dryRun: true } } }; await hold.promise; return conflict("ALREADY_VOIDED", "Оплата уже отменена", { voided_at: "2026-11-05T09:20:00", voided_by_name: "Иванова Д." }); } });
  await page.waitForSelector("#record-void-form");
  await page.waitForFunction(() => !document.querySelector('button[form="record-void-form"]').disabled);      // Money-1 Г: the dry run answered first
  await page.fill("#record-void-reason", "ошиблись");
  await page.evaluate(() => { const form = document.querySelector("#record-void-form"); form.requestSubmit(); form.requestSubmit(); });
  await page.waitForTimeout(150);
  const real = calls.filter((call) => call.method === "POST" && !/dry_run=true/.test(call.query));
  assert.equal(real.length, 1);
  assert.equal(JSON.stringify(real[0].body), JSON.stringify({ reason: "ошиблись" }), "a payment cancel has no expected_*");
  hold.open();
  await page.waitForSelector('[data-testid="already-voided"]');
  assert.match(plain(await page.textContent('[data-testid="already-voided"]')), /Оплата уже отменена · Иванова Д\./);
  await page.close();
});

// ── walk of stage Д1: «Продолжить с N» puts N into the field, up as well as down ─────────────────────

test("refund: the debt GREW (250 000 -> 300 000): «Продолжить с 300 000» puts 300 000 into the field and the button names it", async () => {
  const row = { ...ROW, refundable: 250000 };
  let n = 0;
  const run = await open(browser, "money-v.entry.tsx", "refund", { props: { row }, server: (request) => (request.method === "POST" ? (++n === 1 ? conflict("BALANCE_CHANGED", "Сумма к возврату изменилась: было 250 000 сум, сейчас 300 000 сум", { refundable: 300000, advance: 300000 }) : done) : null) });
  const { page, calls } = run;
  await page.waitForSelector("#refund-form");
  await fillRefund(page);
  assert.equal(plain(await page.inputValue("#refund-amount")), "250 000");
  await page.click('[data-testid="refund-submit"]');
  await page.click('[data-testid="balance-changed-continue"]');
  assert.equal(plain(await page.inputValue("#refund-amount")), "300 000");
  assert.match(plain(await page.textContent('[data-testid="refund-submit"]')), /^Вернуть аванс 300 000 сум$/);
  await page.click('[data-testid="refund-submit"]');
  await page.waitForFunction(() => window.__log.includes("close"));
  assert.deepEqual(calls.filter((call) => call.method === "POST").map((call) => [call.body.amount, call.body.expected_refundable]), [[250000, 250000], [300000, 300000]]);
  await page.close();
});

test("forgiveness «Часть долга»: the debt changed - the field takes the new sum, the button names it", async () => {
  let n = 0;
  const { page } = await open(browser, "money-v.entry.tsx", "writeoff", { server: (request) => (request.method === "POST" ? (++n === 1 ? conflict("BALANCE_CHANGED", "Долг изменился: было 350 000 сум, сейчас 400 000 сум", { debt: 400000, advance: 0 }) : { json: { writeoff: { id: "w1", amount: 400000 }, debt_before: 400000, debt_after: 0, row: ROW } }) : null) });
  await page.waitForSelector("#writeoff-form");
  await page.click("text=Часть долга");
  await page.fill('input[aria-label="Сумма прощения"]', "350 000");
  await page.fill("#writeoff-reason", "болезнь");
  await page.click('[data-testid="writeoff-submit"]');
  await page.click('[data-testid="balance-changed-continue"]');
  assert.equal(plain(await page.inputValue('input[aria-label="Сумма прощения"]')), "400 000");
  assert.match(plain(await page.textContent('[data-testid="writeoff-submit"]')), /^Простить долг 400 000 сум$/);
  await page.close();
});
