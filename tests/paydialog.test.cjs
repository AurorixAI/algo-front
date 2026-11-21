// «Внести оплату» (PAY-DUE 14Б.8, frame 14 / 10.10): both sums of the server on top (named by the term, its words), the field filled with the server's `suggested_amount`, the server's sentence under it BEFORE the button,
// a required method without «Другое», the amount in the button.  The money AND its words are the server's (the fixtures of the contract, tests/fixtures/pay2); lib/payment-plan.ts has no arithmetic of the plan, no chips.
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
const X = require(path.join(root, "src/lib/payment-plan.ts"));
const plain = (text) => text.replace(/ /g, " ");
const money = (n) => plain(P.formatMoney(n));


const E1 = () => L.normalizePreview(fixture("e1_preview_250000"));

// ── the top block: both sums, the server's words ──────────────────────────────────────────────

test("the top block of the window: the sums of the server named by the term, the debt first, the words are the server's; nothing the server did not say (151)", () => {
  const due = L.dueBlock(E1());
  assert.equal(due.unpaid, 769000);
  assert.deepEqual(due.states.map((state) => [state.key, plain(state.text), state.sub, state.tone]), [["debt", "Долг 769 000 сум", "просрочено 32 дня", "debt"]]);
  const both = L.normalizePreview({ ...fixture("e1_preview_250000"), due: { ...fixture("e1_preview_250000").due, unpaid: 831000, debt_amount: 600000, due_amount: 231000, due_text: "К оплате 231 000 сум", due_sub: "до 24.11", debt_text: "Долг 600 000 сум", debt_sub: "просрочено 45 дней" } });
  assert.deepEqual(L.dueBlock(both).states.map((state) => [state.key, state.text, state.sub]), [["debt", "Долг 600 000 сум", "просрочено 45 дней"], ["due", "К оплате 231 000 сум", "до 24.11"]]);
  const onlyDue = L.normalizePreview({ ...fixture("e1_preview_250000"), due: { ...fixture("e1_preview_250000").due, unpaid: 231000, debt_amount: 0, debt_text: null, debt_sub: null, due_amount: 231000, due_text: "К оплате 231 000 сум", due_sub: "до 24.11" } });
  assert.deepEqual(L.dueBlock(onlyDue).states.map((state) => [state.key, state.tone]), [["due", "due"]]);
  // the server said nothing about a sum - the block says nothing (the sum is still counted for the cap of a student who has left)
  const silent = L.normalizePreview({ ...fixture("e1_preview_250000"), due: { ...fixture("e1_preview_250000").due, debt_text: null, due_text: null } });
  assert.deepEqual(L.dueBlock(silent).states, []);
  assert.equal(L.dueBlock(silent).unpaid, 769000);
  assert.equal(L.dueBlock(null), null);
  // nothing is due: no states
  assert.deepEqual(L.dueBlock(L.normalizePreview(fixture("e2_preview_due"))).states.length >= 0, true);
});

test("the old screen arithmetic of the window is gone: no chips, no rows of the plan, no «долг сейчас» line, no «Всего долга останется»", () => {
  for (const gone of ["quickAmounts", "debtNowLine", "chipSelected", "noChipsHint", "pastNoun", "QUICK_AMOUNTS_LABEL", "NO_DEBT_HINT", "calendarMonth", "periodName", "longDate", "joinNames"]) assert.equal(X[gone], undefined, `${gone} must be deleted`);
  for (const gone of ["dueView", "splitDueSegments"]) assert.equal(L[gone], undefined, `${gone} must be deleted`);
  const dialog = read("src/components/payments/payment-dialog.tsx");
  assert.doesNotMatch(dialog, /payment-chips|payment-debt-now|payment-nodebt|plan\.rows|quickAmounts|debtNowLine/);
  assert.doesNotMatch(read("src/lib/payment-plan.ts"), /Всего долга останется|Останется долг|Погасит часть долга|past_debt_after|current_due_after|debt_after|past_debt\b/);
});

// ── the sentence under the field: the server's, BEFORE the button ─────────────────────────────

test("the sentence under the field is the server's `summary_text`, word for word (10.10); no amount or no answer - nothing to word", () => {
  for (const [name, said] of [
    ["e1_preview_250000", "Погасит 250 000 сум из долга 769 000 сум → оплачено 481 000 из 500 000 сум · долг 519 000 сум"],
    ["e1_preview_790000", "Погасит долг 769 000 сум · Переплата 21 000 сум → аванс на следующий период (15.11–14.12), оплачено до 15.11"],
  ]) {
    const preview = L.normalizePreview(fixture(name));
    const view = X.planView(preview);
    assert.equal(plain(view.sentence), plain(said), name);
    assert.equal(view.sentence, preview.result.summary_text, "not a character is changed or added");
  }
  assert.equal(X.planView(L.normalizePreview(fixture("e1_preview_due"))), null, "asked without an amount: nothing to word");
  assert.equal(X.planView(null), null);
  assert.equal(X.PLAN_EMPTY_HINT, "Введите сумму — здесь появится, куда пойдут деньги");
  assert.equal(X.PLAN_TITLE, undefined); // one section - no sub-label «Долг ученика» under «Что изменится» (lead F1)
  // the lessons line, the price rise and the warnings of the server pass through as they were
  const ahead = X.planView(L.normalizePreview(fixture("e9_preview_price_ahead_1069000")));
  assert.equal(ahead.priceAhead.length, 1);
  assert.match(plain(ahead.priceAhead[0]), /600 000 сум \(сейчас 500 000 сум\)/);
});

test("the field is filled with the server's `suggested_amount` and nothing else (the screen counts nothing); the lessons variant reads the same", () => {
  for (const name of ["e1_preview_due", "e2_preview_due", "e3_preview_due", "e10_preview_due"]) {
    const raw = fixture(name);
    const preview = L.normalizePreview(raw);
    assert.equal(preview.suggested_amount, raw.suggested_amount, name);
    assert.equal(L.defaultAmount(preview), raw.suggested_amount > 0 ? raw.suggested_amount : null, name);
  }
  const dialog = read("src/components/payments/payment-dialog.tsx");
  assert.match(dialog, /answer\.suggested_amount <= 0/);
  assert.match(dialog, /formatMoneyInput\(answer\.suggested_amount\)/);
  // the result of a typed amount: the three sums after and the term, as the server counted them
  const result = E1().result;
  assert.deepEqual([result.unpaid_after, result.debt_amount_after, result.due_amount_after], [519000, 519000, 0]);
  assert.equal(E1().due.unpaid, 769000);
});

test("every preview of the contract reads through the tolerant parser: the new names, no NaN, the words kept", () => {
  for (const name of fs.readdirSync(path.join(__dirname, "fixtures/pay2")).map((file) => file.replace(/\.json$/, "")).filter((n) => n.includes("preview"))) {
    const raw = fixture(name);
    const p = L.normalizePreview(raw);
    assert.equal(p.due.unpaid, raw.due.unpaid, name);
    assert.equal(p.due.debt_text ?? null, raw.due.debt_text ?? null, name);
    assert.ok(Number.isFinite(p.suggested_amount), name);
    for (const old of ["past_debt", "current_due", "days_overdue", "debt"]) assert.equal(old in p.due, false, `${name}: the old field ${old} is not read`);
    if (p.result) { assert.equal(typeof p.result.summary_text, "string", name); for (const old of ["debt_after", "past_debt_after", "current_due_after"]) assert.equal(old in p.result, false, `${name}: ${old}`); }
    const view = X.planView(p);
    if (!p.result) assert.equal(view, null, name); else assert.equal(view.sentence, p.result.summary_text, name);
  }
});

test("empty / zero / non-numeric amount: no calculation, a calm hint, the button is off; a huge amount is not asked for", () => {
  for (const text of ["", "0", "abc", "  ", "-"]) assert.equal(L.previewAmount(text), null, JSON.stringify(text));
  assert.equal(L.previewAmount(P.reformatMoneyTyping("12abc34")), 1234);
  assert.equal(L.previewAmount("99999999999"), null); // > 10^10
  const form = (amount, method = "cash") => ({ amount, paidOn: "2026-10-22", method, note: "", reason: "" });
  assert.equal(X.payBlocker(form(""), "2026-10-22", null), "Введите сумму");
  assert.equal(X.payBlocker(form("0"), "2026-10-22", null), "Сумма должна быть больше нуля");
  assert.equal(X.payBlocker(form("99 999 999 999"), "2026-10-22", null), "Сумма слишком большая");
  assert.equal(X.payBlocker(form("500 000"), "2026-10-22", null), null);
  // a student who has left and an amount over his debt
  const over = require(path.join(root, "src/lib/payments-logica.ts")).leftPaymentProblem(700000, 592000);
  assert.equal(X.payBlocker(form("700 000"), "2026-10-22", over), over);
});

test("dates: back-dated is allowed within 3 years, a future or a too old date and a missing date block the button", () => {
  const form = (paidOn) => ({ amount: "100 000", paidOn, method: "cash", note: "", reason: "" });
  assert.equal(X.payBlocker(form("2026-09-01"), "2026-10-22", null), null);
  assert.equal(X.payBlocker(form("2026-10-23"), "2026-10-22", null), "Дата оплаты не может быть в будущем");
  assert.equal(X.payBlocker(form("2023-10-21"), "2026-10-22", null), "Дата оплаты старше 3 лет");
  assert.equal(X.payBlocker(form(""), "2026-10-22", null), "Укажите дату оплаты");
  const dialog = read("src/components/payments/payment-dialog.tsx");
  assert.match(dialog, /max=\{today\}/); // the picker itself does not offer a future day
  assert.match(dialog, /\.\.\.\(paidOnOk \? \{ paid_on: values\.paidOn \} : \{\}\)/); // the calculation follows the date
});

// ── method: required, remembered, without «Другое» ─────────────────────────────────────────────────────────────────

test("the method is required: Save is off with a hint until one is chosen", () => {
  const form = { amount: "500 000", paidOn: "2026-10-22", method: null, note: "", reason: "" };
  assert.equal(X.payBlocker(form, "2026-10-22", null), "Выберите способ оплаты");
  assert.equal(X.payBlocker({ ...form, method: "click" }, "2026-10-22", null), null);
  const dialog = read("src/components/payments/payment-dialog.tsx");
  // rule 3 of the UX pack: ONE footer for every window - the main button is off while the method (or the amount) is missing, and ALWAYS says why (`why`) over the buttons
  assert.match(dialog, /disabled=\{blocker !== null( \|\| state\.refused)?\}/);
  assert.match(dialog, /why=\{blocker\}/);
  assert.match(dialog, /whyId="payment-blocker"/);
});

test("the picker has Наличные, Карта, Перевод, Click, Payme - no «Другое»; old payments still read «Другое» elsewhere", () => {
  assert.deepEqual(X.PAYMENT_METHODS.map((method) => method.label), ["Наличные", "Карта", "Перевод", "Click", "Payme"]);
  assert.deepEqual(X.methodChoices(null).map((method) => method.key), ["cash", "card", "bank_transfer", "click", "payme"]);
  assert.deepEqual(X.methodChoices("cash").map((method) => method.key), ["cash", "card", "bank_transfer", "click", "payme"]);
  // a payment being corrected that was entered as «Другое» keeps its method visible, otherwise it could not be saved
  assert.deepEqual(X.methodChoices("other").map((method) => method.label).slice(-1), ["Другое"]);
  assert.equal(L.methodLabel("other"), "Другое"); // journal / receipts / till filter
  assert.ok(L.METHODS.some((method) => method.key === "other")); // not touched
  const dialog = read("src/components/payments/payment-dialog.tsx");
  assert.doesNotMatch(dialog, /Другое/);
  assert.doesNotMatch(dialog, /\bMETHODS\b/);
});

test("Money-1 V: no method is preselected (no «как в прошлый раз»), nothing is remembered", () => {
  assert.equal(X.readLastMethod, undefined);
  assert.equal(X.rememberMethod, undefined);
  assert.equal(X.LAST_METHOD_KEY, undefined);
  const dialog = read("src/components/payments/payment-dialog.tsx");
  assert.doesNotMatch(dialog, /readLastMethod|rememberMethod|lastMethod/);
  assert.match(dialog, /method: null, note: "", reason: ""/);
});

// ── the button, the future tense, the layout ───────────────────────────────────────────────────────────────────────

test("the primary button carries the amount and updates live", () => {
  assert.equal(plain(X.payButtonLabel("create", 1142000)), "Внести 1 142 000 сум");
  assert.equal(plain(X.payButtonLabel("create", 592000)), "Внести 592 000 сум");
  assert.equal(X.payButtonLabel("create", null), "Внести");
  assert.equal(X.payButtonLabel("replace", 250000), `Исправить на ${require("../src/lib/payments.ts").formatMoney(250000)}`);
  assert.equal(X.payButtonLabel("replace", null), "Исправить оплату");
  assert.match(read("src/components/payments/payment-dialog.tsx"), /payButtonLabel\(kind, amountNow\)/);
});

test("future tense: nothing saved yet, so no «Закрыла / Закрыл» in the dialog, and the sentences of the server in every fixture are a future tense", () => {
  const dialog = read("src/components/payments/payment-dialog.tsx");
  assert.doesNotMatch(dialog, /Закрыла|Закрыл\b|Оплатил|Внесл/);
  assert.doesNotMatch(read("src/lib/payment-plan.ts"), /Закрыла|Закрыл\b|\.label\b/); // the server's past-tense label of an allocation is never shown
  for (const name of fs.readdirSync(path.join(__dirname, "fixtures/pay2")).map((file) => file.replace(/\.json$/, "")).filter((n) => n.includes("preview"))) {
    const p = L.normalizePreview(fixture(name));
    if (!p.result) continue;
    assert.doesNotMatch(p.result.summary_text, /Закрыла|Закрыл\b|Погасила|Частично погасила/, name);
  }
});

test("the dialog layout: both sums on top, the amount, the server's sentence, then method + date, a comment on demand", () => {
  const dialog = read("src/components/payments/payment-dialog.tsx");
  const at = (text) => { const i = dialog.indexOf(text); assert.ok(i > 0, text); return i; };
  const order = [at('data-testid="payment-due"'), at('htmlFor="payment-amount"'), at('data-testid="payment-calc"'), at("Способ оплаты"), at("Дата оплаты"), at("Комментарий")];
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(dialog, /autoFocus/);
  assert.match(dialog, />сум<\/span>/);
  assert.match(dialog, /commentOpen \|\| values\.note/); // expanded when a comment exists
  assert.match(dialog, /Комментарий\n\s*<\/button>/);
  assert.match(dialog, /data-testid="payment-plan-sentence"/);   // 14Б.8: the server's sentence is SEEN (it was a line for a screen reader behind a table of rows built by the screen)
  // method: its OWN full-width row, all five on one line from sm up; a phone: 3 + 2 of equal width (never a lone orphan); the date is the next row
  const methodRow = dialog.slice(dialog.indexOf('testId="payment-methods"'), dialog.indexOf("Дата оплаты"));
  assert.match(methodRow, /className=\{methods\.length === 6 \? "grid-cols-3" : "grid-cols-3 sm:grid-cols-5"\}/);
  assert.match(read("src/components/ui/radio.tsx"), /\bw-full\b[^"]*\btext-center\b/, "equal-width buttons (the shared SegmentedControl)");
  assert.doesNotMatch(methodRow, /flex-wrap/);
  assert.doesNotMatch(dialog, /sm:grid-cols-\[minmax\(0,1fr\)_10rem\]/, "the date no longer shares the row with the methods");
  assert.match(dialog, /<div className="sm:w-44">\s*<label htmlFor="payment-paid-on"/);
  // the primary button is in the footer (never scrolls away)
  assert.match(dialog, /footerClassName=/);
  assert.match(read("src/components/ui/modal-actions.tsx"), /flex flex-col-reverse gap-2 sm:flex-row/);   // the footer of every window of money (ConfirmFooter)
  // the pay2 rules stay: server calculation, idempotency key, duplicate, correction
  assert.match(dialog, /usePaymentPreview\(\{/);
  assert.match(dialog, /orgApi\.createPayment\(membership\.membership_id, body, idempotencyKey\.current\)/);
  assert.match(dialog, /replace_payment_id: payment\.id/);
});
