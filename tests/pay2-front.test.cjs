// PAY-2 («деньги покупают дни»): the front reads the frozen contract (tests/fixtures/pay2 = pay2_fixtures of the backend) and
// words it: the payment dialog's due block and live preview, the balance of a group, the statement with its running balance,
// the receipts report with its reconciliation, write-off / refund forms, errors, the screens and their routes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/pay2", `${name}.json`), "utf8"));
const P = require(path.join(root, "src/lib/payments.ts"));
const L = require(path.join(root, "src/lib/payments-ledger.ts"));
const I = require(path.join(root, "src/lib/payments-income.ts"));
const hook = require(path.join(root, "src/lib/use-payment-preview.ts"));
const { createRequestSequence } = require(path.join(root, "src/lib/request-sequence.ts"));
/** Normal spaces instead of the non-breaking ones: what the user reads. */
const plain = (text) => text.replace(/\u00A0/g, " ");
const tick = () => new Promise((resolve) => setImmediate(resolve));

// ── the contract: every fixture is read by the front without surprises ──────────────────────────

test("the contract has 21 operations; the front has a helper for each one it uses", () => {
  const contract = fixture("_contract");
  const operations = Object.entries(contract.paths).flatMap(([route, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${route}`));
  assert.equal(operations.length, 21); // the retired quote is among them: the front never calls it
  const api = read("src/lib/api.ts");
  const needed = {
    "payments/preview": /payments\/preview/, "/writeoffs": /writeoffs`/, "/refunds": /refunds`/, "/statement": /statement`|statement\$\{/,
    "statement/export": /statement\/export/, "receipts": /payments\/receipts\?/, "receipts/items": /receipts\/items\?/, "balances": /payments\/balances\?/,
    "writeoffs void": /writeoffs\/\$\{encodePathId\(writeoffId\)\}\/void/, "refunds void": /refunds\/\$\{encodePathId\(refundId\)\}\/void/,
    "Idempotency-Key": /"Idempotency-Key"/, "dry_run": /dry_run=true/,
  };
  for (const [name, pattern] of Object.entries(needed)) assert.match(api, pattern, name);
  assert.doesNotMatch(api, /payments\/quote/);
});

test("every response fixture reads through the tolerant parsers without NaN or missing lists", () => {
  for (const name of fs.readdirSync(path.join(__dirname, "fixtures/pay2")).map((file) => file.replace(/\.json$/, ""))) {
    if (name.includes("preview")) {
      const preview = L.normalizePreview(fixture(name));
      assert.ok(Number.isInteger(preview.due.debt) && Array.isArray(preview.due.segments) && Array.isArray(preview.warnings), name);
      if (preview.result) assert.ok(Array.isArray(preview.result.allocations) && Number.isInteger(preview.result.debt_after), name);
    }
    if (name.includes("statement")) {
      const statement = L.normalizeStatement(fixture(name));
      assert.ok(Array.isArray(statement.rows) && Array.isArray(statement.upcoming) && Array.isArray(statement.voided), name);
      for (const row of statement.rows) assert.ok(Number.isInteger(row.debit) && Number.isInteger(row.credit) && Number.isInteger(row.outflow), name);
    }
  }
  // the documented nulls: an older server sends none of the PAY-2 numbers, a tolerant reader makes them 0
  const row = L.normalizeRow({ membership_id: "m", student_id: "s", student_name: "A", group_id: "g", group_name: "G", is_primary: true, is_active: true, status: "none" });
  assert.deepEqual([row.debt, row.advance, row.past_debt, row.current_due, row.refundable, row.lessons_unpaid], [0, 0, 0, 0, 0, 0]);
  assert.equal(L.balanceView(row).kind, "none");
  const bare = L.normalizePreview({ as_of: "2026-10-21", due: {}, result: null });
  assert.deepEqual([bare.suggested_amount, bare.due.debt, bare.result, bare.warnings], [0, 0, null, []]);
  assert.equal(L.sum(null), 0);
  assert.equal(L.sum("12"), 12);
  assert.equal(L.sum(Number.NaN), 0);
});

// ── the payment dialog: what is due, and where the money goes ───────────────────────────────────

test("E1: the top block of the dialog is «Долг … · Текущий период … · Всего к оплате …»", () => {
  const preview = L.normalizePreview(fixture("e1_preview_due"));
  const due = L.dueView(preview);
  assert.equal(due.total, 769000);
  assert.equal(due.pastDebt, 269000);
  assert.equal(due.currentDue, 500000);
  assert.equal(plain(due.text), "Долг 269 000 сум (15.09–14.10, оплачено 231 000 из 500 000) · Текущий период 15.10–14.11: 500 000 сум · Всего к оплате 769 000 сум");
  assert.deepEqual(due.rows.map((row) => [row.key, row.amount]), [["debt", 269000], ["current", 500000]]);
  assert.equal(L.defaultAmount(preview), 769000); // the amount starts as everything that is due
  // nothing asked yet: no calculation
  assert.equal(L.previewView(preview), null);
});

test("E1: previews of 250 000 / 300 000 / 769 000 / 790 000 show exactly where the money goes", () => {
  const view = (name) => L.previewView(L.normalizePreview(fixture(name)));

  const part = view("e1_preview_250000");
  assert.equal(part.headline, "Погасит 250 000 из долга 269 000 → оплачено до 12.10 · останется 519 000");
  assert.deepEqual(part.lines.map((line) => [line.bucket, line.amount]), [["past_debt", 250000]]);
  assert.equal(part.paidUntil, "Оплачено до: 27.09.2026 → 12.10.2026");
  assert.deepEqual(part.remaining, { kind: "debt", text: `Останется долг ${P.formatMoney(519000)}` });

  const mid = view("e1_preview_300000");
  assert.equal(mid.headline, "Закроет долг 269 000 · на текущий период 31 000 → оплачено до 15.10 · останется 469 000");
  assert.deepEqual(mid.lines.map((line) => [line.label, line.amount]), [["Закрыла долг 15.09–14.10", 269000], ["На текущий период 15.10–14.11", 31000]]);
  assert.equal(mid.paidUntil, "Оплачено до: 27.09.2026 → 15.10.2026");
  assert.equal(mid.remaining.kind, "debt");
  assert.equal(plain(mid.remaining.text), "Останется долг 469 000 сум");

  const full = view("e1_preview_769000");
  assert.equal(full.headline, "Закроет долг 269 000 · на текущий период 500 000 → оплачено до 14.11");
  assert.deepEqual(full.lines.map((line) => line.amount), [269000, 500000]);
  assert.deepEqual(full.remaining, { kind: "none", text: "Долг закрыт" });
  assert.equal(full.paidUntil, "Оплачено до: 27.09.2026 → 14.11.2026");

  const over = view("e1_preview_790000");
  assert.deepEqual(over.lines.map((line) => [line.bucket, line.amount]), [["past_debt", 269000], ["current", 500000], ["advance", 21000]]);
  assert.equal(over.remaining.kind, "advance");
  assert.equal(plain(over.remaining.text), "Переплата → аванс 21 000 сум");
  assert.match(over.headline, /Переплата 21 000 → аванс на следующий период/); // the server's own words are shown as they come
  // the lines of every preview add up to the amount asked about
  for (const [name, amount] of [["e1_preview_250000", 250000], ["e1_preview_300000", 300000], ["e1_preview_769000", 769000], ["e1_preview_790000", 790000]]) {
    assert.equal(L.previewView(L.normalizePreview(fixture(name))).lines.reduce((a, line) => a + line.amount, 0), amount, name);
  }
});

test("E2/E3: a student who joined mid-month pays a part of the period; an overpayment becomes an advance", () => {
  const e2 = L.normalizePreview(fixture("e2_preview_323000"));
  assert.equal(L.dueView(e2).total, 323000);
  assert.deepEqual(L.dueView(e2).rows.map((row) => row.key), ["current"]);
  assert.equal(L.previewView(e2).remaining.kind, "none");
  const e2over = L.previewView(L.normalizePreview(fixture("e2_preview_900000")));
  assert.deepEqual(e2over.lines.map((line) => line.bucket), ["current", "advance"]);
  assert.equal(plain(e2over.remaining.text), "Переплата → аванс 577 000 сум");
  const e3 = L.previewView(L.normalizePreview(fixture("e3_preview_100000")));
  assert.equal(plain(e3.remaining.text), "Останется долг 113 000 сум");
});

test("E5: the lessons variant: lessons paid, no «оплачено до»", () => {
  const view = L.previewView(L.normalizePreview(fixture("e5_preview_630000_held12")));
  assert.equal(view.paidUntil, null);
  assert.equal(view.lessons, "Уроков оплачено: 0 → 12, осталось 0");
  assert.deepEqual(view.lines.map((line) => [line.bucket, line.amount]), [["past_debt", 600000], ["advance", 30000]]);
  assert.equal(plain(L.dueView(L.normalizePreview(fixture("e5_preview_630000_held12"))).text).includes("Долг 600 000"), true);
  const partial = L.previewView(L.normalizePreview(fixture("e5_preview_650000_held14")));
  assert.equal(partial.lessons, "Уроков оплачено: 0 → 13, осталось 0, не оплачено 1"); // 14 held lessons, 13 paid: the unpaid one is said
  assert.equal(L.dueView(L.normalizePreview(fixture("e5_preview_650000_held14"))).rows.length, 2); // a package that is a debt, the lessons after it
});

test("E9: a price rise ahead is a warning of its own, the other warnings stay a list", () => {
  const view = L.previewView(L.normalizePreview(fixture("e9_preview_price_ahead_1069000")));
  assert.equal(view.priceAhead.length, 1);
  assert.match(view.priceAhead[0], /600 000 сум \(сейчас 500 000 сум\)/);
  assert.deepEqual(view.warnings, []);
  assert.equal(view.paidUntil, "Оплачено до: 27.09.2026 → 29.11.2026");
});

test("the amount: 1..10^10, the method is chosen, the body is money only", () => {
  assert.equal(L.validateAmount(""), "Укажите сумму");
  assert.equal(L.validateAmount("0"), "Сумма должна быть больше нуля");
  assert.equal(L.validateAmount("10 000 000 000"), null);
  assert.equal(L.validateAmount("10 000 000 001"), "Сумма слишком большая");
  assert.equal(L.previewAmount("300 000"), 300000);
  assert.equal(L.previewAmount("0"), null);
  assert.equal(L.previewAmount("10 000 000 001"), null);
  const values = { amount: "300 000", paidOn: "2026-10-21", method: "cash", note: " за октябрь ", reason: "" };
  assert.equal(L.validatePaymentForm(values, "2026-10-21"), null);
  assert.equal(L.validatePaymentForm({ ...values, method: null }, "2026-10-21"), "Выберите способ оплаты");
  assert.equal(L.validatePaymentForm({ ...values, paidOn: "2026-10-22" }, "2026-10-21"), "Дата оплаты не может быть в будущем");
  assert.equal(L.validatePaymentForm({ ...values, paidOn: "2022-10-20" }, "2026-10-21"), "Дата оплаты старше 3 лет");
  assert.deepEqual(L.buildPaymentPayload(values), { amount: 300000, paid_on: "2026-10-21", method: "cash", note: "за октябрь" });
  // no period, no lessons: the server distributes the money
  assert.deepEqual(Object.keys(L.buildPaymentPayload({ ...values, note: "" })).sort(), ["amount", "method", "paid_on"]);
  // a correction starts from the payment it replaces (the method of an old record is not guessed)
  const from = L.paymentFormFrom({ amount: 300000, paid_on: "2026-10-21", method: "card", note: "x" });
  assert.deepEqual({ ...from, amount: plain(from.amount) }, { amount: "300 000", paidOn: "2026-10-21", method: "card", note: "x", reason: "" });
  assert.equal(L.paymentFormFrom({ amount: 5, paid_on: "2026-10-21", method: "unknown", note: null }).method, null);
  assert.deepEqual(L.METHODS.map((m) => m.key), ["cash", "card", "bank_transfer", "click", "payme", "other"]);
});

test("a saved payment says where the money went", () => {
  const created = fixture("e1_create_300000");
  assert.deepEqual(L.savedPaymentDetails(created.allocation).map(plain), [
    "Закрыла долг 15.09–14.10 · 269 000 сум",
    "На текущий период 15.10–14.11 · 31 000 сум",
    "Останется долг 469 000 сум",
  ]);
  assert.deepEqual(L.savedPaymentDetails(null), []);
  const replaced = L.normalizeSaveResult(fixture("e8_replace_300000_by_250000"));
  assert.ok(replaced.payment.replaces_payment_id);
  assert.equal(replaced.row.debt >= 0, true);
});

test("a stale preview never overwrites a newer one; the old request is aborted", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  const fetchPreview = (query, signal) => new Promise((resolve, reject) => {
    calls.push({ query, resolve, reject, signal });
    signal.addEventListener("abort", () => reject(new Error("aborted")));
  });
  const sequence = createRequestSequence();
  let screen = "A";
  const accepted = [];
  const run = (key, delayMs) => hook.startPreviewRun({
    query: { amount: Number(key) }, key, delayMs, sequence, fetchPreview,
    currentKey: () => screen, onPreview: (preview, k) => accepted.push([k, preview.tag]), onFailed: (message) => accepted.push(["failed", message]),
  });
  const cancelA = run("A", 0);
  t.mock.timers.tick(0);
  assert.equal(calls.length, 1);
  // the user types on: the cleanup cancels A (and aborts its request), the new ask waits for the debounce
  screen = "B";
  cancelA();
  assert.equal(calls[0].signal.aborted, true);
  const cancelB = run("B", hook.PREVIEW_DEBOUNCE_MS);
  t.mock.timers.tick(hook.PREVIEW_DEBOUNCE_MS - 1);
  assert.equal(calls.length, 1);
  t.mock.timers.tick(1);
  assert.equal(calls.length, 2);
  calls[1].resolve({ tag: "answer for B" });
  await tick();
  calls[0].resolve({ tag: "answer for A" });
  await tick();
  assert.deepEqual(accepted, [["B", "answer for B"]]);
  cancelB();
});

test("a preview that fails says why (the server's own sentence); a silent one times out once", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const events = [];
  const make = (fetchPreview) => hook.startPreviewRun({
    query: { amount: 1 }, key: "A", delayMs: 0, sequence: createRequestSequence(), fetchPreview,
    currentKey: () => "A", onPreview: () => events.push("preview"), onFailed: (message) => events.push(message),
  });
  const error = Object.assign(new Error("Сумма оплаты: от 1 до 10 000 000 000."), { code: "AMOUNT_RANGE", detail: { code: "AMOUNT_RANGE", message: "Сумма оплаты: от 1 до 10 000 000 000" } });
  make(() => Promise.reject(error));
  t.mock.timers.tick(0);
  await tick();
  assert.deepEqual(events, ["Сумма оплаты: от 1 до 10 000 000 000"]);
  let late;
  make((query, signal) => new Promise((resolve) => { late = { resolve, signal }; }));
  t.mock.timers.tick(0);
  t.mock.timers.tick(hook.PREVIEW_TIMEOUT_MS);
  assert.equal(events.length, 2);
  assert.match(events[1], /Расчёт не отвечает/);
  assert.equal(late.signal.aborted, true);
  late.resolve({});
  await tick();
  assert.equal(events.length, 2);
});

test("the preview hook: the first ask is immediate, later ones wait 250 ms, the effect restarts only with the question", () => {
  const source = read("src/lib/use-payment-preview.ts");
  assert.equal(hook.PREVIEW_DEBOUNCE_MS, 250);
  assert.match(source, /first\.current \|\| immediate \? 0 : PREVIEW_DEBOUNCE_MS/);
  assert.match(source, /\}, \[enabled, membershipId, key\]\);/);
  assert.match(source, /return startPreviewRun\(/);
  assert.equal(hook.previewKey({ amount: 300000, paid_on: "2026-10-21" }), "300000|2026-10-21|");
  assert.equal(hook.previewKey(null), "");
});

// ── errors of the PAY-2 routes ──────────────────────────────────────────────────────────────────

test("errors.json: every documented code is told apart and keeps the server's text", () => {
  const errors = fixture("errors");
  const apiError = (body, status) => Object.assign(new Error(body.detail.message), { status, code: body.detail.code, detail: body.detail });
  const expected = {
    WRITEOFF_EXCEEDS_DEBT: "writeoff_exceeds", REFUND_EXCEEDS_ADVANCE: "refund_exceeds", DUPLICATE_PAYMENT: "duplicate",
    VOID_BREAKS_REFUND: "void_breaks_refund", AMOUNT_RANGE: "amount_range",
  };
  for (const [code, kind] of Object.entries(expected)) {
    const failure = L.payError(apiError(errors[code].body, errors[code].status));
    assert.equal(failure.kind, kind, code);
    assert.equal(failure.message, errors[code].body.detail.message.replace(/[.\s]+$/, ""), code);
  }
  assert.equal(L.payError(apiError(errors.DUPLICATE_PAYMENT.body, 409)).paymentId, "00000000-0000-4000-8000-000000000018");
  assert.equal(L.payError(apiError(errors.WRITEOFF_EXCEEDS_DEBT.body, 422)).debt, 60000);
  assert.equal(L.payError(apiError(errors.REFUND_EXCEEDS_ADVANCE.body, 422)).refundable, 344000);
  assert.equal(L.payError(new Error("Не удалось подключиться")).kind, "other");
  assert.equal(L.payError(undefined, "запасной текст").message, "запасной текст");
});

// ── balance of a group: «Долг» / «Аванс» ────────────────────────────────────────────────────────

test("a row says «Долг N сум» or «Аванс N сум»; the actions follow the server's flags", () => {
  const debtRow = { ...fixture("e1_row_after_790000"), debt: 469000, advance: 0, refundable: 0, writeoff_allowed: true };
  const view = L.balanceView(debtRow);
  assert.equal(view.kind, "debt");
  assert.equal(plain(view.text), "Долг 469 000 сум");
  assert.match(view.className, /rose/);
  assert.equal(L.canWriteOff(debtRow), true);
  assert.equal(L.canRefund(debtRow), false);
  const advanceRow = L.normalizeRow(fixture("e1_row_after_790000"));
  assert.equal(plain(L.balanceView(advanceRow).text), "Аванс 21 000 сум");
  assert.match(L.balanceView(advanceRow).className, /emerald/);
  assert.equal(L.canWriteOff(advanceRow), false); // writeoff_allowed: false, and no debt
  assert.equal(L.canRefund(advanceRow), true); // refundable 21 000
  assert.equal(L.balanceView({ debt: 0, advance: 0 }).text, "");
  assert.equal(L.signedBalanceText(-269000), `Долг ${P.formatMoney(269000)}`);
  assert.equal(L.signedBalanceText(0), "Нет долга");
  // the tab semantics are kept: «Без оплат» stays the name of the tab, the debt is shown on its rows
  assert.equal(P.PAYMENT_BUCKETS.find((bucket) => bucket.key === "none").label, "Без оплат");
  assert.equal(P.payIsDue({ status: "active", last_payment: { id: "p" }, debt: 1000 }), true); // a debt keeps the main button filled
  assert.equal(P.payIsDue({ status: "active", last_payment: { id: "p" }, debt: 0 }), false);
});

test("write-off: an amount up to the debt (or all of it) and a reason; refund: up to the refundable sum and a method", () => {
  assert.equal(L.validateWriteoff({ amount: "", all: true, reason: "болезнь" }, 100000), null);
  assert.equal(L.validateWriteoff({ amount: "", all: true, reason: "ab" }, 100000), "Укажите причину (не короче 3 символов)");
  assert.equal(L.validateWriteoff({ amount: "", all: false, reason: "болезнь" }, 100000), "Укажите сумму или выберите «Весь долг»");
  assert.equal(plain(L.validateWriteoff({ amount: "100 001", all: false, reason: "болезнь" }, 100000)), "Списать можно не больше долга: 100 000 сум");
  assert.equal(L.validateWriteoff({ amount: "40 000", all: false, reason: "болезнь" }, 0), "Долга нет — списывать нечего");
  assert.deepEqual(L.buildWriteoffPayload({ amount: "40 000", all: false, reason: " болезнь " }, "2026-10-21"), { reason: "болезнь", amount: 40000, effective_on: "2026-10-21" });
  assert.deepEqual(L.buildWriteoffPayload({ amount: "", all: true, reason: "болезнь" }), { reason: "болезнь", all: true });
  assert.equal(plain(L.writeoffPreviewText({ amount: "40 000", all: false, reason: "" }, 100000)), "Долг станет 60 000 сум");
  assert.equal(L.writeoffPreviewText({ amount: "", all: true, reason: "" }, 100000), "Долг будет списан полностью");
  const writeoff = fixture("e6_writeoff_40000");
  assert.equal(writeoff.debt_before - writeoff.debt_after, writeoff.writeoff.amount);

  assert.equal(L.validateRefund({ amount: "344 000", method: "cash", reason: "" }, 344000), null);
  assert.equal(L.validateRefund({ amount: "344 000", method: null, reason: "" }, 344000), "Выберите, как вернули деньги");
  assert.equal(plain(L.validateRefund({ amount: "344 001", method: "cash", reason: "" }, 344000)), "Вернуть можно не больше 344 000 сум");
  assert.equal(L.validateRefund({ amount: "1", method: "cash", reason: "" }, 0), "Возвращать нечего");
  assert.deepEqual(L.buildRefundPayload({ amount: "344 000", method: "cash", reason: " ученик ушёл " }, "2026-10-25"), { amount: 344000, method: "cash", reason: "ученик ушёл", effective_on: "2026-10-25" });
  assert.equal(plain(L.refundPreviewText({ amount: "100 000", method: null, reason: "" }, 344000)), "Останется аванс 244 000 сум");
  const refund = fixture("e7_refund_344000");
  assert.equal(refund.advance_before - refund.advance_after, refund.refund.amount);
});

// ── the statement ───────────────────────────────────────────────────────────────────────────────

test("E1 statement: one timeline with the running balance, the header adds up and says «сходится»", () => {
  const statement = L.normalizeStatement(fixture("e1_statement_790000"));
  assert.deepEqual(statement.rows.map((row) => row.type), ["charge", "payment", "charge", "payment"]);
  assert.deepEqual(statement.rows.map((row) => row.balance_after), [-500000, -269000, -769000, 21000]);
  assert.equal(L.statementRunningConsistent(statement.rows), true);
  assert.equal(L.statementEndsAtBalance(statement), true); // the last balance is advance − debt of the header
  assert.equal(L.statementDiff(statement.summary), 0);
  assert.equal(L.statementReconciles(statement.summary), true);
  const views = statement.rows.map(L.statementRowView);
  assert.deepEqual(views.map((view) => plain(view.effect)), ["−500 000", "+231 000", "−500 000", "+790 000"]);
  assert.deepEqual(views.map((view) => view.balance), ["Долг 500 000", "Долг 269 000", "Долг 769 000", "Аванс 21 000"]);
  assert.deepEqual(views.map((view) => view.balanceKind), ["debt", "debt", "debt", "advance"]);
  // a charge says the price and where it comes from; a payment says the method and who entered it
  assert.match(plain(views[0].notes.join(" · ")), /500 000 сум · цена группы/);
  assert.match(views[1].notes.join(" · "), /внёс: /);
  // the payment row carries its allocation lines; they add up to the money of the row
  const last = views[3];
  assert.equal(last.allocations.reduce((a, line) => a + line.amount, 0), 790000);
  assert.deepEqual(last.allocations.map((line) => line.bucket), ["past_debt", "current", "advance"]);
  // header: начислено · оплачено · списано · возвращено · долг/аванс
  const totals = L.statementTotals(statement.summary);
  assert.deepEqual(totals.map((total) => total.label), ["Начислено", "Оплачено", "Списано", "Возвращено", "Аванс"]);
  assert.deepEqual(totals.map((total) => total.amount), [1000000, 1021000, 0, 0, 21000]);
  assert.equal(totals.at(-1).tone, "advance");
  // paid ahead: the upcoming period is listed
  assert.equal(statement.upcoming.length, 1);
  assert.match(plain(L.upcomingLine(statement.upcoming[0])), /^15\.11–14\.12: оплачено 21 000 сум из 500 000 сум$/);
});

test("E4 statements of a transfer: the money leaves one group and arrives in the other, both reconcile", () => {
  const a = L.normalizeStatement(fixture("e4_statement_A"));
  const b = L.normalizeStatement(fixture("e4_statement_B"));
  assert.equal(a.rows.at(-1).type, "transfer_out");
  assert.equal(plain(L.effectText(a.rows.at(-1))), "−323 000");
  assert.equal(b.rows[0].type, "transfer_in");
  assert.equal(plain(L.effectText(b.rows[0])), "+323 000");
  for (const statement of [a, b]) {
    assert.equal(L.statementRunningConsistent(statement.rows), true);
    assert.equal(L.statementEndsAtBalance(statement), true);
    assert.equal(L.statementReconciles(statement.summary), true);
  }
  // transfers show up in the header only when there are some
  assert.ok(L.statementTotals(a.summary).some((total) => total.key === "transferred_out"));
  assert.ok(L.statementTotals(b.summary).some((total) => total.key === "transferred_in"));
  assert.equal(L.statementTotals(L.normalizeStatement(fixture("e1_statement_790000")).summary).some((total) => /transferred/.test(total.key)), false);
  // the server's «Нет долга» for an empty balance is kept
  assert.equal(L.statementRowView(a.rows.at(-1)).balance, "Нет долга");
});

test("a statement that does not add up is called out, not hidden", () => {
  const statement = L.normalizeStatement(fixture("e1_statement_790000"));
  const broken = { ...statement.summary, paid: statement.summary.paid - 1000 };
  assert.equal(L.statementDiff(broken), 1000);
  assert.equal(L.statementReconciles(broken), false);
  assert.equal(L.statementReconciles({ ...statement.summary, reconciles: false }), false); // the server's own flag counts too
  const tampered = statement.rows.map((row, index) => (index === 2 ? { ...row, balance_after: -700000 } : row));
  assert.equal(L.statementRunningConsistent(tampered), false);
  // a cancelled row has no balance and is skipped by the running check
  const withVoided = [...statement.rows.slice(0, 2), { ...statement.rows[2], balance_after: null, voided_at: "2026-10-22T10:00:00", void_reason: "ошибка", voided_by_name: "Рустам" }, statement.rows[3]];
  assert.equal(L.statementRunningConsistent(withVoided), false); // 790 000 no longer follows -269 000 + 790 000 ... (the cancelled charge would have been -500 000)
  const view = L.statementRowView(withVoided[2]);
  assert.equal(view.cancelled, true);
  assert.equal(view.balance, "");
  assert.equal(view.cancelNote, "Отменено: ошибка · Рустам");
  assert.equal(L.validateStatementRange("2026-10-10", "2026-10-01"), "Конец периода раньше начала");
  assert.equal(L.validateStatementRange("", ""), null);
  assert.match(L.statementFileName(statement), /^Выписка_Хасанов_Азиз_Математика_7А_2026-10-21\.xlsx$/);
});

// ── receipts report «Поступления» ───────────────────────────────────────────────────────────────

test("the receipts report: totals, where the money went, the days the server leaves out, «сходится»", () => {
  const report = I.normalizeReport(fixture("receipts_report_2026-10"));
  const totals = report.totals;
  assert.equal(totals.received, 1540000);
  assert.equal(totals.refunded_from_received, 324000);
  assert.equal(totals.net_received, 1216000);
  // received − returned = what went to past debts + running periods + advance
  assert.equal(I.distributionAddsUp(totals), true);
  assert.deepEqual(I.distributionRows(totals).map((row) => [row.column, row.amount]), [["to_past_debt", 269000], ["to_current", 926000], ["to_advance", 21000]]);
  assert.equal(I.sharePercent(926000, totals.net_received), 76);
  assert.equal(I.sharePercent(1, 0), 0);
  // by method adds up to the received money, by group and by teacher too
  assert.equal(report.by_method.reduce((a, item) => a + item.amount, 0), totals.received);
  assert.equal(report.by_group.reduce((a, item) => a + item.received, 0), totals.received);
  assert.equal(report.by_teacher.reduce((a, item) => a + item.received, 0), totals.received);
  assert.equal(report.by_group.reduce((a, item) => a + item.to_past_debt + item.to_current + item.to_advance, 0), totals.net_received);
  assert.equal(report.by_group.reduce((a, item) => a + item.written_off, 0), totals.written_off);
  // the position of the whole center today
  assert.deepEqual([report.position.debt_total, report.position.advance_total, report.position.students_with_debt], [70000, 21000, 1]);
  // the series lists only the days with money: the front fills the other days of the month with zeros
  assert.equal(report.series.length, 5);
  const days = I.fillSeries(report);
  assert.equal(days.length, 31);
  assert.deepEqual([days[0].bucket, days[30].bucket], ["2026-10-01", "2026-10-31"]);
  assert.equal(days.reduce((a, day) => a + day.received, 0), totals.received);
  assert.equal(days.reduce((a, day) => a + day.refunded, 0), totals.refunded);
  assert.equal(days[1].received, 0);
  assert.equal(days[1].count, 0);
  // the reconciliation line
  const check = I.reconciliationView(report.reconciliation);
  assert.equal(check.ok, true);
  assert.equal(check.text, "Сходится");
  assert.equal(check.lines.length, 3);
  assert.ok(check.lines.every((line) => line.ok));
});

test("the report does not hide a discrepancy", () => {
  const report = I.normalizeReport(fixture("receipts_report_2026-10"));
  const broken = { ...report.reconciliation, ok: false, checks: report.reconciliation.checks.map((check, index) => (index === 0 ? { ...check, right: check.right - 1000, diff: 1000 } : check)) };
  const view = I.reconciliationView(broken);
  assert.equal(view.ok, false);
  assert.equal(plain(view.text), "Не сходится: расхождение 1 000 сум");
  assert.equal(view.failed.length, 1);
  assert.match(view.failed[0].label, /Поступило = распределено/);
  assert.equal(I.distributionAddsUp({ ...report.totals, to_advance: report.totals.to_advance + 1 }), false);
});

test("a month by months: the monthly series has every month, the empty ones are zero", () => {
  const fake = { from: "2026-08-15", to: "2026-10-31", group_by: "month", series: [{ bucket: "2026-09", received: 5, refunded: 0, to_past_debt: 0, to_current: 5, to_advance: 0, written_off: 0, count: 1, by_method: {} }] };
  assert.deepEqual(I.fillSeries(fake).map((point) => [point.bucket, point.received]), [["2026-08", 0], ["2026-09", 5], ["2026-10", 0]]);
  assert.equal(I.bucketLabel("2026-10-21"), "21.10");
  assert.equal(I.bucketLabel("2026-10"), "Октябрь 2026 г.");
});

test("the period picker: a day, a month, a range; the query is the server's", () => {
  const month = I.periodOf("month", "2026-10-21");
  assert.deepEqual([month.from, month.to], ["2026-10-01", "2026-10-31"]);
  const next = I.stepPeriod(month, 1);
  assert.deepEqual([next.from, next.to], ["2026-11-01", "2026-11-30"]);
  const prev = I.stepPeriod(I.periodOf("month", "2026-01-15"), -1);
  assert.deepEqual([prev.from, prev.to], ["2025-12-01", "2025-12-31"]);
  const leap = I.periodOf("month", "2028-02-10");
  assert.equal(leap.to, "2028-02-29");
  const day = I.periodOf("day", "2026-10-21");
  assert.deepEqual(I.stepPeriod(day, -1), { kind: "day", from: "2026-10-20", to: "2026-10-20" });
  // switching from a month to a day keeps the date; a range keeps its own dates
  assert.deepEqual(I.periodOf("range", "2026-10-21", { kind: "range", from: "2026-10-05", to: "2026-10-12" }), { kind: "range", from: "2026-10-05", to: "2026-10-12" });
  assert.deepEqual(I.stepPeriod({ kind: "range", from: "2026-10-01", to: "2026-10-10" }, 1), { kind: "range", from: "2026-10-11", to: "2026-10-20" });
  assert.equal(I.periodTitle(month), "Октябрь 2026 г.");
  assert.equal(I.periodTitle(day), "21.10.2026");
  assert.deepEqual(I.reportQuery(month, I.NO_FILTERS), { from: "2026-10-01", to: "2026-10-31", group_by: "day" });
  assert.deepEqual(I.reportQuery(month, { method: "cash", groupId: "g1", teacherId: "t1" }), { from: "2026-10-01", to: "2026-10-31", group_by: "day", method: "cash", group_id: "g1", teacher_id: "t1" });
  // the server: a day-by-day series is at most 92 days, a range at most 366
  assert.equal(I.groupByFor({ kind: "range", from: "2026-01-01", to: "2026-06-30" }), "month");
  assert.equal(I.validatePeriod({ kind: "range", from: "2026-01-01", to: "2027-01-02" }), "Период не длиннее года");
  assert.equal(I.validatePeriod({ kind: "range", from: "2026-01-01", to: "2026-12-31" }), null);
  assert.equal(I.validatePeriod({ kind: "range", from: "2026-10-10", to: "2026-10-01" }), "Конец периода раньше начала");
});

test("every figure opens the list of payments behind it", () => {
  const month = I.periodOf("month", "2026-10-21");
  const filters = { method: "cash", groupId: "", teacherId: "t1" };
  const target = I.itemsDrill("to_past_debt", { bucket: "2026-10-01", of: "Математика 7А", groupId: "g1" });
  assert.equal(target.title, "На долги прошлых периодов · Математика 7А");
  assert.deepEqual(I.drillQuery(target, month, filters, 50, 50), {
    from: "2026-10-01", to: "2026-10-31", column: "to_past_debt", limit: 50, offset: 50, bucket: "2026-10-01", method: "cash", group_id: "g1", teacher_id: "t1",
  });
  // the filters on screen are kept; a figure of a method overrides the method filter
  assert.equal(I.drillQuery(I.itemsDrill("received", { method: "card" }), month, filters).method, "card");
  assert.equal(I.balancesDrill("debt").title, "Ученики с долгом");
  assert.equal(I.balancesDrill("advance").title, "Ученики с авансом");
  const items = I.normalizeItems(fixture("receipts_items_to_past_debt"));
  assert.ok(items.items.length > 0);
  // the column amount is the part of the record in the clicked column; the whole record is the note
  for (const item of items.items) {
    assert.ok(item.column_amount <= item.amount);
    if (item.column_amount !== item.amount) assert.match(plain(I.itemPartNote(item)), /^из [\d ]+ сум$/);
    else assert.equal(I.itemPartNote(item), null);
  }
  assert.equal(items.items.reduce((a, item) => a + item.column_amount, 0), 269000);
  assert.match(I.itemTitle(items.items[0]), /^Оплата № \d+ · /);
  assert.equal(I.itemTitle({ type: "writeoff", receipt_no: null, method: null }), "Списание");
  const balances = I.normalizeBalances(fixture("balances_debt"));
  assert.ok(balances.items.every((row) => row.debt > 0));
  assert.equal(L.balanceRowNote({ is_active: false }), " · ушёл из группы");
  assert.equal(L.balanceRowNote({ is_active: true, student_archived: true }), " · ученик в архиве");
  assert.equal(L.balanceRowNote({ is_active: true }), "");
});

// ── receipt: from the snapshot ──────────────────────────────────────────────────────────────────

test("receipt: what the money covered at the moment of payment comes from the snapshot; an old receipt keeps its period", () => {
  const receipt = fixture("e1_receipt_300000");
  const facts = L.receiptFacts(receipt);
  assert.equal(facts.legacy, false);
  assert.equal(facts.method, "Наличные");
  assert.deepEqual(facts.lines.map((line) => line.amount), [269000, 31000]);
  assert.equal(plain(facts.debtBefore), "Долг до оплаты: 769 000 сум");
  assert.equal(plain(facts.after), "Остаток долга: 469 000 сум");
  assert.equal(facts.paidUntil, "Оплачено до: 15.10.2026 (было 27.09.2026)");
  assert.equal(plain(facts.price), "Цена периода: 500 000 сум");
  const advance = L.receiptFacts({ ...receipt, debt_after: 0, advance_after: 21000 });
  assert.equal(plain(advance.after), "Аванс 21 000 сум на следующие периоды");
  assert.equal(L.receiptFacts({ ...receipt, debt_after: 0, advance_after: 0 }).after, "Долг закрыт");
  // an old receipt: no allocations
  const old = L.receiptFacts({ receipt_no: 5, valid_from: "2026-09-01", valid_to: "2026-09-30" });
  assert.equal(old.legacy, true);
  assert.deepEqual(old.lines, []);
  assert.equal(P.paymentPeriodLabel({ valid_from: "2026-09-01", valid_to: "2026-09-30", lessons_count: null }), "01.09.2026 — 30.09.2026");
  assert.equal(P.paymentPeriodLabel({ valid_from: null, valid_to: null, lessons_count: null }), ""); // a new payment has no period
});

test("the printed receipt of a new payment: method, where the money went, the rest of the debt", () => {
  require.extensions[".tsx"] = (mod, filename) => {
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
  };
  const Module = require("node:module");
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...rest);
  };
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { ReceiptSheet } = require(path.join(root, "src/components/payments/receipt-view.tsx"));
  const html = plain(renderToStaticMarkup(React.createElement(ReceiptSheet, { receipt: fixture("e1_receipt_300000") })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  for (const text of ["Квитанция № 18", "Триста тысяч сум", "Способ оплаты", "Наличные", "Куда пошли деньги", "Закрыла долг 15.09–14.10", "269 000 сум", "На текущий период 15.10–14.11", "31 000 сум", "Остаток долга: 469 000 сум", "оплачено до 15.10.2026"]) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(!html.includes("Период")); // the old «Период» row is for old receipts only
  Module._resolveFilename = resolveFilename;
});

// ── rendering contracts: the screens drawn from the fixtures (server-side render, no browser) ────

function renderer() {
  require.extensions[".tsx"] = (mod, filename) => {
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
  };
  const Module = require("node:module");
  if (!Module.__pay2Alias) {
    const resolveFilename = Module._resolveFilename;
    Module._resolveFilename = function (request, ...rest) {
      return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...rest);
    };
    Module.__pay2Alias = true;
  }
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  return {
    React,
    /** The text the user reads: tags dropped, spaces normal. */
    text: (element) => plain(renderToStaticMarkup(element).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ")),
    html: (element) => renderToStaticMarkup(element),
  };
}

test("the dialog draws the due block and the calculation of E1 / E9 / E5 as the contract says", () => {
  const { React, text, html } = renderer();
  const { DueBlock, PreviewBlock } = require(path.join(root, "src/components/payments/payment-dialog.tsx"));
  const preview = L.normalizePreview(fixture("e1_preview_300000"));
  const due = text(React.createElement(DueBlock, { due: L.dueView(preview), error: null, priceNote: null }));
  for (const part of ["Долг", "15.09–14.10, оплачено 231 000 из 500 000", "269 000 сум", "Текущий период", "15.10–14.11", "500 000 сум", "Всего к оплате", "769 000 сум"]) assert.ok(due.includes(part), part);
  const calc = text(React.createElement(PreviewBlock, { view: L.previewView(preview) }));
  for (const part of ["Закроет долг 269 000 · на текущий период 31 000 → оплачено до 15.10 · останется 469 000", "Закрыла долг 15.09–14.10", "На текущий период 15.10–14.11", "31 000 сум", "Оплачено до: 27.09.2026 → 15.10.2026", "Останется долг 469 000 сум"]) assert.ok(calc.includes(part), part);
  // E9: the price rise has its own amber note
  const rise = html(React.createElement(PreviewBlock, { view: L.previewView(L.normalizePreview(fixture("e9_preview_price_ahead_1069000"))) }));
  assert.match(rise, /role="note"/);
  assert.match(plain(rise), /Цена периода 15\.11–14\.12 — 600 000 сум \(сейчас 500 000 сум\)/);
  assert.match(rise, /Аванс на 15\.11–14\.12/);
  // E5: lessons
  const lessons = text(React.createElement(PreviewBlock, { view: L.previewView(L.normalizePreview(fixture("e5_preview_630000_held12"))) }));
  assert.ok(lessons.includes("Уроков оплачено: 0 → 12, осталось 0"));
  assert.ok(lessons.includes("Аванс на следующие уроки"));
  assert.ok(!lessons.includes("Оплачено до"));
  // nothing due: a calm sentence, with a way out when the group has no price
  assert.ok(text(React.createElement(DueBlock, { due: L.dueView(L.normalizePreview({ as_of: "2026-10-21", due: {} })), error: null, priceNote: null })).includes("Долга нет"));
  const noPrice = text(React.createElement(DueBlock, { due: L.dueView(L.normalizePreview({ as_of: "2026-10-21", due: {} })), error: null, priceNote: { text: L.PRICE_NOT_SET_TEXT, href: "/owner/payments/prices?group=g1" } }));
  assert.ok(noPrice.includes("Цена группы не задана — введите сумму вручную") && noPrice.includes("задать цену группы"));
});

test("the statement draws E1 with the running balance after every row and the line «Сходится»", () => {
  const { React, text, html } = renderer();
  const { StatementHeader, StatementTimeline } = require(path.join(root, "src/components/payments/statement-view.tsx"));
  const statement = L.normalizeStatement(fixture("e1_statement_790000"));
  const head = text(React.createElement(StatementHeader, { statement }));
  for (const part of ["Хасанов Азиз", "Математика 7А", "Начислено", "1 000 000 сум", "Оплачено", "1 021 000 сум", "Списано", "Возвращено", "Аванс", "21 000 сум", "Сходится"]) assert.ok(head.includes(part), part);
  const body = text(React.createElement(StatementTimeline, { statement, menuFor: () => [], withVoided: false }));
  for (const part of ["Начисление 15.09–14.10", "−500 000", "Долг 500 000", "Оплата № 17", "+231 000", "Долг 269 000", "Долг 769 000", "Оплата № 18", "+790 000", "Аванс 21 000", "Закрыла долг 15.09–14.10", "Аванс на 15.11–14.12", "Следующие периоды"]) assert.ok(body.includes(part), part);
  // the order is the order of time
  const order = ["Начисление 15.09–14.10", "Оплата № 17", "Начисление 15.10–14.11", "Оплата № 18"].map((title) => body.indexOf(title));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  // a ledger: the money columns are headed right-aligned
  const markup = html(React.createElement(StatementTimeline, { statement, menuFor: () => [], withVoided: false }));
  assert.match(markup, /<span class="text-right">Сумма<\/span>/);
  assert.match(markup, /<span class="text-right">Долг \/ аванс после<\/span>/);
  // a statement that does not add up says so on the screen
  const broken = { ...statement, summary: { ...statement.summary, paid: statement.summary.paid - 1000 } };
  assert.match(text(React.createElement(StatementHeader, { statement: broken })), /Не сходится: расхождение 1 000 сум/);
  // an empty account invites to act
  assert.ok(text(React.createElement(StatementTimeline, { statement: { ...statement, rows: [], upcoming: [] }, menuFor: () => [], withVoided: false })).includes("В выписке пока нет записей"));
  // cancelled records are listed with their reason only when asked for
  const voided = { ...statement, voided: [{ ...statement.rows[1], balance_after: null, voided_at: "2026-10-22T09:00:00", void_reason: "ошибка", voided_by_name: "Рустам" }] };
  assert.ok(text(React.createElement(StatementTimeline, { statement: voided, menuFor: () => [], withVoided: true })).includes("Отменено: ошибка · Рустам"));
  assert.ok(!text(React.createElement(StatementTimeline, { statement: voided, menuFor: () => [], withVoided: false })).includes("Отменено: ошибка"));
});

test("the income report draws the totals, the distribution, the position, the tables and «Сходится»", () => {
  const { React, text } = renderer();
  const { IncomeReportView } = require(path.join(root, "src/components/payments/income-page.tsx"));
  const report = I.normalizeReport(fixture("receipts_report_2026-10"));
  const opened = [];
  const period = I.periodOf("month", "2026-10-21");
  const body = text(React.createElement(IncomeReportView, { report, period, open: (target) => opened.push(target) }));
  for (const part of [
    "3 оплаты", "Поступило", "1 540 000 сум", "Возвращено", "324 000 сум", "Списано долгов", "30 000 сум", "Остаётся в центре", "1 216 000 сум",
    "Куда ушли деньги", "На долги прошлых периодов", "269 000 сум", "На текущие периоды", "926 000 сум", "В аванс", "21 000 сум",
    "Как платили", "Наличные", "Карта", "1 340 000 сум", "200 000 сум",
    "Долг учеников", "70 000 сум", "Аванс — оплачено вперёд",
    "По группам", "Математика 7А", "Иванова Мария", "Алгебра 9Б", "По преподавателям", "Петров Олег", "По дням", "Сходится",
  ]) assert.ok(body.includes(part), part);
  assert.ok(!body.includes("NaN") && !body.includes("undefined"));
  // a single day has no «По дням» table
  assert.ok(!text(React.createElement(IncomeReportView, { report, period: I.periodOf("day", "2026-10-01"), open: () => {} })).includes("По дням"));
  // a report that does not add up says it
  const broken = { ...report, reconciliation: { ok: false, checks: report.reconciliation.checks.map((c, i) => (i === 1 ? { ...c, right: c.right - 500, diff: 500 } : c)) } };
  assert.match(text(React.createElement(IncomeReportView, { report: broken, period, open: () => {} })), /Не сходится: расхождение 500 сум/);
  // a quiet period: zeros, no empty tables, still «Сходится»
  const quiet = I.normalizeReport({ ...fixture("receipts_report_2026-10"), totals: {}, by_method: [], by_group: [], by_teacher: [], series: [], position: {}, reconciliation: { ok: true, checks: [] } });
  const quietText = text(React.createElement(IncomeReportView, { report: quiet, period: I.periodOf("day", "2026-10-21"), open: () => {} }));
  assert.ok(quietText.includes("0 сум") && quietText.includes("нет долгов") && quietText.includes("нет авансов") && quietText.includes("Сходится"));
  assert.ok(!quietText.includes("По группам") && !quietText.includes("Как платили"));
});

// ── the screens and their routes ────────────────────────────────────────────────────────────────

test("routes: the statement and the income report exist for the owner and the administrator", () => {
  for (const role of ["owner", "admin"]) {
    assert.match(read(`src/app/${role}/payments/statement/[id]/page.tsx`), new RegExp(`<StatementView paymentsHref="/${role}/payments" />`), role);
    assert.match(read(`src/app/${role}/payments/income/page.tsx`), new RegExp(`<IncomePage paymentsHref="/${role}/payments" studentProfileBasePath="/${role}/students" />`), role);
  }
  assert.equal(P.statementHref("/owner/payments/", "m 1"), "/owner/payments/statement/m%201");
  assert.equal(P.incomeHref("/admin/payments"), "/admin/payments/income");
  assert.equal(P.paymentsBaseOf("/owner/groups"), "/owner/payments");
});

test("the dialog: amount first, due block, live calculation from the server, an idempotency key, a method to choose", () => {
  const dialog = read("src/components/payments/payment-dialog.tsx");
  assert.match(dialog, /create: PAY_ACTION_LABEL,/); // the title repeats the verb of the button
  assert.match(dialog, /usePaymentPreview\(\{/);
  assert.match(dialog, /orgApi\.createPayment\(membership\.membership_id, body, idempotencyKey\.current\)/);
  assert.match(dialog, /orgApi\.replacePayment\(payment\.id, \{ \.\.\.body, \.\.\.\(reason \? \{ reason \} : \{\}\) \}, idempotencyKey\.current\)/);
  assert.match(dialog, /replace_payment_id: payment\.id/);
  assert.match(dialog, /failure\.kind === "duplicate"/); // a repeated send is not an error: the payment is there
  assert.match(dialog, /view\.headline/); // the server's sentence, not a local one
  assert.match(dialog, /view\.priceAhead\.join/); // D8
  assert.match(dialog, /role="radiogroup"/);
  assert.match(dialog, /Прежняя запись будет отменена и останется в истории серым/);
  assert.match(dialog, /Деньги всей группы распределятся заново/); // the correction explains the re-allocation
  // no period pickers any more
  assert.doesNotMatch(dialog, /valid_from|valid_to|Оплачено до<|Период с|lessons_count/);
  // the business date, not the browser's, is today
  assert.match(dialog, /formatBusinessDate\(\)/);
  assert.doesNotMatch(dialog, /new Date\(/);
  // the void dialog explains it too
  assert.match(read("src/components/payments/payment-void-modal.tsx"), /Деньги группы распределятся заново/);
});

test("the list, the card and the statement: debt / advance shown, actions in «⋯», write-off and refund", () => {
  const page = read("src/components/payments/payments-page.tsx");
  assert.match(page, /<BalanceNote row=\{row\} className="w-full" \/>/);
  assert.match(page, /key: "statement"/);
  assert.match(page, /canWriteOff\(row\)/);
  assert.match(page, /canRefund\(row\)/);
  assert.match(page, /incomeHref\(paymentsBase\)/); // «Поступления» is one click from «Оплаты»
  assert.match(page, /usePaymentsSummary\(\(state\) => state\.debtTotal\)/);
  const card = read("src/components/payments/membership-payments.tsx");
  assert.match(card, /<BalanceNote row=\{row\} \/>/);
  assert.match(card, /label: "Выписка"/);
  assert.match(card, /canWriteOff\(row\)/);
  assert.match(card, /aria-label="Куда пошли деньги"/); // every payment of the history says where it went
  assert.match(card, /payment\.legacy_period/); // and an old one still shows its period
  const statement = read("src/components/payments/statement-view.tsx");
  assert.match(statement, /window\.print\(\)/);
  assert.match(statement, /orgApi\.exportStatement\(/);
  assert.match(statement, /orgApi\.voidWriteoff\(/);
  assert.match(statement, /orgApi\.voidRefund\(/);
  assert.match(statement, /Сходится/);
  // a money ledger: the digits are right-aligned over their column
  assert.match(statement, /<span className="text-right">Сумма<\/span>/);
  assert.match(statement, /<span className="text-right">Долг \/ аванс после<\/span>/);
  assert.match(statement, /<span className="text-center">Дата<\/span>/);
});

test("the income page: table rules (names left, digits right), period picker, drill-down, reconciliation", () => {
  const page = read("src/components/payments/income-page.tsx");
  assert.match(page, /<span>\{firstColumn\}<\/span>/); // identity column left
  assert.match(page, /<span key=\{column\.key\} className="text-right">/); // money columns right
  assert.match(page, /role="tablist" aria-label="Период"/);
  assert.match(page, /placement="right"/); // the list of payments opens in a side sheet
  assert.match(page, /data-testid="income-reconciliation"/);
  assert.match(page, /orgApi\.getReceiptItems\(/);
  assert.match(page, /orgApi\.getBalances\(/);
  assert.match(page, /id="position"/);
  assert.doesNotMatch(page, /uppercase|tracking-wider/);
});

test("the dead code of the period form is gone", () => {
  const payments = read("src/lib/payments.ts");
  for (const dead of ["defaultValidFrom", "fixedDayChips", "billingPeriodStart", "billingPeriodEndOf", "addMonthMinusDay", "paymentFormDefaults", "buildQuoteQuery", "quotePrefill", "quoteCaption", "isPartialPeriod", "fixedDayFallbackFrom", "PARTIAL_PERIOD_BADGE", "MAX_PERIOD_DAYS", "MAX_LESSONS", "PaymentQuote"]) {
    assert.ok(!payments.includes(dead), dead);
  }
  assert.ok(!fs.existsSync(path.join(root, "src/lib/use-payment-quote.ts")));
  assert.ok(!fs.existsSync(path.join(root, "src/components/payments/payment-form-modal.tsx")));
  // what the design keeps for compatibility: the settings of the center and the old period label of legacy payments
  for (const kept of ["BILLING_DAY_RANGE", "paymentPeriodLabel", "PARTIAL_PERIOD_TAG", "paymentModelOf"]) assert.ok(payments.includes(kept), kept);
});

test("the summary store keeps the debt and the advance of the center", () => {
  const { summaryToState } = require(path.join(root, "src/lib/payments-summary.ts"));
  const state = summaryToState({ as_of: "2026-10-21", due: 3, expired: 1, expiring: 0, none: 0, active: 4, tracked_total: 7, period_mode: "calendar", debt_total: 70000, advance_total: 21000, students_with_debt: 1 });
  assert.deepEqual([state.debtTotal, state.advanceTotal, state.studentsWithDebt], [70000, 21000, 1]);
  const old = summaryToState({ as_of: "2026-10-21", due: 3, expired: 1, expiring: 0, none: 0, active: 4, tracked_total: 7, period_mode: "calendar" });
  assert.deepEqual([old.debtTotal, old.advanceTotal, old.studentsWithDebt], [0, 0, 0]);
});

test("settings: the start of the accounting is an owner's date with the impact of the dry run", () => {
  assert.ok(P.PAYMENTS_SCOPE_KEYS.includes("accounting_start_date"));
  assert.equal(P.validatePaymentSettings({ ...P.DEFAULT_PAYMENT_SETTINGS, accounting_start_date: "2026-13-40" }, "payments"), "Укажите дату начала учёта оплат");
  assert.equal(P.validatePaymentSettings({ ...P.DEFAULT_PAYMENT_SETTINGS, accounting_start_date: "2026-09-01" }, "payments"), null);
  assert.deepEqual(P.diffPaymentSettings({ ...P.DEFAULT_PAYMENT_SETTINGS, accounting_start_date: "2026-09-01" }, { ...P.DEFAULT_PAYMENT_SETTINGS, accounting_start_date: "2026-08-01" }, P.paymentsScopeKeys("payment_date")), { accounting_start_date: "2026-08-01" });
  const dry = fixture("settings_dry_run");
  assert.equal(dry.dry_run, true);
  assert.equal(plain(P.accountingStartImpactText(dry.impact)), `Долг изменится у ${dry.impact.memberships_with_new_debt} ${dry.impact.memberships_with_new_debt === 1 ? "ученика" : "учеников"}: +${plain(P.formatMoney(dry.impact.debt_delta))}`);
  assert.equal(P.accountingStartImpactText({ memberships_with_new_debt: 0, debt_delta: 0 }), "Долг ни у кого не изменится");
  assert.equal(P.accountingStartImpactText(null), "");
  assert.match(read("src/app/owner/settings/page.tsx"), /orgApi\.previewPaymentSettings\(/);
});
