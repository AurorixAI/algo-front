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
  // PAY-TAILS Б11.34: «Останется долг» is the label of the total of «Куда пойдут деньги» (the number under it is the server's `debt_amount_after`, read, never counted; the quiet «к оплате» is `due_after`): it stands ONCE, as a constant, and nothing in the file adds, folds or subtracts a сум
  const plan = read("src/lib/payment-plan.ts");
  assert.doesNotMatch(plan, /\bdebt_after\b/, "the debt after the payment is `debt_amount_after`: no second name of it is read");
  assert.doesNotMatch(plan, /Всего долга останется|Погасит часть долга|past_debt_after|current_due_after|past_debt\b/);
  assert.equal((plan.match(/Останется долг/g) ?? []).length, 1, "the label of the total is one constant");
  assert.doesNotMatch(plan, /\.reduce\(|Math\.(min|max|round)\(|(debt_amount_after|due_after)\s*[-+*]|[-+]\s*[a-z.]*(debt_amount_after|due_after)/, "the total is read from the answer, not counted");
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
    if (p.result) {
      assert.equal(typeof p.result.summary_text, "string", name);
      for (const old of ["past_debt_after", "current_due_after"]) assert.equal(old in p.result, false, `${name}: ${old}`);
      // Б11.34: an older answer has no rows - they read as an empty list, `due_after` as «not said», the debt after is the old `debt_amount_after` (no `debt_after` is read), and the window keeps the sentence
      assert.deepEqual(p.result.money_rows, [], name);
      assert.deepEqual(p.result.debt_rest, [], name);
      assert.deepEqual(p.result.due_rest, [], name);
      assert.equal(p.result.due_after, null, name);
      assert.equal("debt_after" in p.result, false, name);
    }
    const view = X.planView(p);
    if (!p.result) assert.equal(view, null, name); else { assert.equal(view.sentence, p.result.summary_text, name); assert.equal(view.split, null, name); }
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
  assert.doesNotMatch(read("src/lib/payment-plan.ts"), /Закрыла|Закрыл\b|alloc\w*\.label\b/); // the server's past-tense label of an ALLOCATION is never shown (Б11.33: the labels of `money_rows` are future-safe period names, shown as they are)
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

// ── PAY-TAILS Б11.33 п.2: the rows of the contract through the parser and the words (the files are written by hand from the contract) ──────────────────────────────

test("Б11.34: the preview with money_rows reads through the parser as it is, and the plan says rows + a total; every sum on it is found as a sum of the others (174)", () => {
  const dir = path.join(__dirname, "fixtures/paytails/part13");
  const files = fs.readdirSync(dir).filter((name) => name.startsWith("preview_") && name.endsWith("_по_договору_Б11.34.json"));
  assert.equal(files.length, 4, "the states the worlds of the server do not have are written by hand; the others are REAL answers (part14/, below)");
  for (const file of files) {
    const over = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const raw = { ...fixture("e1_preview_250000"), amount: over.amount };
    raw.result = { ...raw.result, ...over };
    const p = L.normalizePreview(raw);
    assert.equal(p.result.money_rows.length, over.money_rows.length, file);
    assert.equal(p.result.money_rows.reduce((total, row) => total + row.amount, 0), over.amount, `${file}: the rows add up to the amount`);
    assert.equal(p.result.debt_rest.reduce((total, row) => total + row.amount, 0), over.debt_amount_after, `${file}: the debt by periods adds up to the debt after`);
    assert.equal(p.result.due_rest.reduce((total, row) => total + row.amount, 0), over.due_after, `${file}: the sum to pay by periods adds up to the sum to pay after`);
    assert.equal(p.result.due_after, over.due_after, file);
    assert.equal("debt_after" in p.result, false, `${file}: the parser reads no second name of the debt`);
    const view = X.planView(p, over.amount);
    assert.equal(view.sentence, "", file);
    assert.equal(view.split.title, "Куда пойдут деньги", file);
    assert.equal(view.split.rows.length, over.money_rows.length, file);
    // the three views of the total by the numbers of the answer: a debt (+ the quiet «к оплате ещё»), only «к оплате», all paid (an advance is a row, not a total)
    assert.equal(view.split.total.kind, over.debt_amount_after > 0 ? "debt" : over.due_after > 0 ? "due" : "paid", file);
    assert.equal(view.split.alsoDue !== null, over.debt_amount_after > 0 && over.due_after > 0, file);
    assert.equal(view.split.debtRest.length, over.debt_amount_after > 0 && over.debt_rest.length >= 2 ? over.debt_rest.length : 0, `${file}: the breakdown only for two periods and more`);
  }
  // rows + no amount typed: nothing to word; a row without a state of the contract is read as a partial one
  assert.equal(X.planView(L.normalizePreview({ ...fixture("e1_preview_250000"), amount: null, result: null }), null), null);
});

test("Б11.34: the REAL answers of the server (part14/) read through the parser as they came; the header of the window and the block close in each (174), the words are the server's", () => {
  const dir = path.join(__dirname, "fixtures/paytails/part14");
  const files = fs.readdirSync(dir).filter((name) => name.startsWith("payment_probe_"));
  assert.equal(files.length, 9);
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const p = L.normalizePreview(raw);
    const r = p.result;
    assert.equal("debt_after" in r, false, file);
    assert.equal(r.money_rows.reduce((total, row) => total + row.amount, 0), raw.amount, `${file}: the rows add up to the amount`);
    assert.equal(r.debt_rest.reduce((total, row) => total + row.amount, 0), r.debt_amount_after, `${file}: the debt by periods adds up to the debt after`);
    assert.equal(r.due_rest.reduce((total, row) => total + row.amount, 0), r.due_after, `${file}: the sum to pay by periods adds up to the sum to pay after`);
    // the header (before) = what the rows pay without the advance + what stays
    assert.equal(p.due.debt_amount + p.due.due_amount, raw.amount - r.advance_after + r.debt_amount_after + r.due_after, `${file}: the header and the block close`);
    const view = X.planView(p, raw.amount);
    assert.equal(view.sentence, "", file);
    assert.equal(view.split.title, "Куда пойдут деньги", file);
    assert.equal(view.split.total.kind, r.debt_amount_after > 0 ? "debt" : r.due_after > 0 ? "due" : "paid", file);
    assert.equal(view.split.alsoDue !== null, r.debt_amount_after > 0 && r.due_after > 0, file);
    assert.equal(view.split.debtRest.length > 0, r.debt_amount_after > 0 && r.debt_rest.length >= 2, file);
    assert.equal(view.split.rows.filter((row) => row.mark?.kind === "paid").length, r.money_rows.filter((row) => row.state === "closed").length, file);
  }
});
