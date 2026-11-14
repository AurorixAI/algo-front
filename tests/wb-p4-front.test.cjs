// Wave B / P4 (MN-32): a payout above the balance. The SERVER refuses with 409 OVERPAY_CONFIRM_REQUIRED (+ `overpay`), the window asks
// «Выплата больше остатка на N сум — записать как аванс?» and only «Записать как аванс» sends `confirm_overpay: true`.
//  - the body carries the flag ONLY after the confirmation;
//  - the error reader tells the question from every other refusal and reads the by-how-much;
//  - the dialog: no client-side pre-question (the screen's balance may be stale), the first send never carries the flag, «Отмена» of the question
//    returns to the form, one send at a time (a ref, not only `busy`).
// The behaviour on the real stack (window -> advance -> the sheet) is the E2E `e2e/tests/payout-overpay.spec.ts`.
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
const Y = require(path.join(root, "src/lib/payroll-logica.ts"));
const plain = (text) => text.replace(/[\u00a0\u202f]/g, " ");

const values = { amount: "500 000", paidOn: "2026-11-02", method: "cash", note: "" };

test("the body carries confirm_overpay only after the confirmation", () => {
  assert.deepEqual(Y.buildPayoutBody(values), { amount: 500000, paid_on: "2026-11-02", method: "cash" });
  assert.deepEqual(Y.buildPayoutBody(values, null), { amount: 500000, paid_on: "2026-11-02", method: "cash" });
  // R3 7: the confirmation carries THE SUM that was shown - the server compares it with the real overpay
  assert.deepEqual(Y.buildPayoutBody(values, 25000), { amount: 500000, paid_on: "2026-11-02", method: "cash", confirm_overpay: true, overpay: 25000 });
});

test("the error reader tells the overpay question from the other refusals", () => {
  const ask = Y.payoutError({ status: 409, code: "OVERPAY_CONFIRM_REQUIRED", message: "Выплата больше остатка на 25 000 сум", detail: { code: "OVERPAY_CONFIRM_REQUIRED", overpay: 25000, balance: 475000 } });
  assert.equal(ask.kind, "overpay_confirm");
  assert.equal(ask.overpay, 25000);
  // a question without a usable number is not a question: the message is shown as an error
  assert.equal(Y.payoutError({ code: "OVERPAY_CONFIRM_REQUIRED", message: "x", detail: { overpay: 0 } }).overpay, null);
  assert.equal(Y.payoutError({ code: "OVERPAY_CONFIRM_REQUIRED", message: "x", detail: {} }).overpay, null);
  for (const [code, kind] of [["DUPLICATE_PAYOUT", "duplicate"], ["AMOUNT_RANGE", "amount_range"], ["SOMETHING", "other"]]) {
    const failure = Y.payoutError({ code, message: "m", detail: { overpay: 5 } });
    assert.equal(failure.kind, kind);
    assert.equal(failure.overpay, null, "only the overpay question carries the number");
  }
});

test("the words of the owner", () => {
  assert.equal(plain(Y.payoutOverpayQuestion(25000)), "Это на 25 000 сум больше, чем осталось выплатить: эти 25 000 сум запишем как выплату вперёд и вычтем из следующей выплаты.");
  assert.equal(Y.PAYOUT_ADVANCE_LABEL, undefined, "one name of the action: the button says «Записать выплату N» (re-audit С6)");
  assert.equal(Y.PAYOUT_ACTION_LABEL, "Записать выплату");
  assert.equal(Y.PAYOUT_SUBTITLE, "Запись о выплате — деньги ALGO не переводит.");
});

test("the dialog asks only what the server asked, and sends the flag only on the button of the question", () => {
  const dialog = read("src/components/payroll/payout-dialog.tsx");
  assert.doesNotMatch(dialog, /payoutOverpay\(/, "no client-side pre-question: the screen's balance may be stale, the server counts under the lock");
  assert.doesNotMatch(dialog, /confirming/, "the old client-side confirmation state is gone");
  assert.match(dialog, /failure\.kind === "overpay_confirm" && failure\.overpay !== null\) \{[^}]*firstSend\.current = null;[^}]*setOverpay\(failure\.overpay\)/);
  assert.match(dialog, /void send\(null\)/, "the first send never carries the flag");
  assert.match(dialog, /onPrimary=\{overpay !== null \? \(\) => void send\(overpay\) : undefined\}/, "only the button of the question confirms, with the sum it showed");
  assert.match(dialog, /primary=\{`\$\{PAYOUT_ACTION_LABEL\}\$\{amountText\}`\}/, "the button of the question is named like the form (the part that goes ahead is said by the plaque)");
  assert.match(dialog, /onCancel=\{overpay !== null \? \(\) => setOverpay\(null\) : onClose\}/, "«Отмена» of the question returns to the form, of the form closes");
  assert.match(dialog, /if \(sending\.current\) return;\s+sending\.current = true;/, "a second Enter / click before the next render (LESSONS 27)");
  assert.match(dialog, /payoutOverpayQuestion\(overpay, state\?\.basis, monthHasEnded\(month\)\)/);
});

test("MUTATIONS: the guards removed from a copy of the dialog are caught by the same pins", () => {
  const dialog = read("src/components/payroll/payout-dialog.tsx");
  const variants = [
    dialog.replace("void send(null)", "void send(overpay ?? 1)"),                           // the flag from the first send
    dialog.replace("if (sending.current) return;", ""),                                     // no ref guard
    dialog.replace("onPrimary={overpay !== null ? () => void send(overpay) : undefined}", "onPrimary={undefined}"),   // no confirming button
  ];
  const pins = [/void send\(null\)/, /if \(sending\.current\) return;/, /onPrimary=\{overpay !== null \? \(\) => void send\(overpay\) : undefined\}/];
  variants.forEach((mutated, i) => {
    assert.notEqual(mutated, dialog);
    assert.doesNotMatch(mutated, pins[i], `mutation ${i} must break its pin`);
  });
});

test("R3 3: the advance of the earlier months is a part of the block, a line under it and a hint in the window", () => {
  const state = Y.normalizePayoutState({ saved_total: 100000, fresh_total: null, target: 70000, paid: 0, balance: 70000, state: "unpaid", basis: "saved", text: "Не выплачено", items: [], carry_in: 30000, carry_used: 30000, advance_out: 0 });
  assert.equal(Y.sheetPayoutParts, undefined, "UX pack №9/№10: the three figures of the window are one line (payoutHeadline)");
  assert.equal(plain(Y.payoutHeadline(state)), "К выплате 70 000 сум", "the window: ONE line");
  assert.deepEqual(Y.advanceLines(state).map(plain), ["Выплачено больше в прошлом месяце: 30 000 сум — вычтено, «К выплате» уменьшена на эту сумму"]);
  const over = Y.normalizePayoutState({ ...state, target: 100000, paid: 125000, balance: -25000, state: "overpaid", carry_in: 0, carry_used: 0, advance_out: 25000 });
  // D-3 (rule 87): the chip already says «Переплачено 25 000», so the line says only what happens to it
  assert.equal(plain(Y.sheetPayoutChip(over).text), "Выплачено больше на 25 000 сум");
  assert.deepEqual(Y.advanceLines(over).map(plain), ["Вычтем из следующей выплаты"]);
  // the advance that is not the chip's sum (earlier advances left over) keeps its number
  assert.deepEqual(Y.advanceLines({ ...over, advance_out: 40000 }).map(plain), ["Аванс 40 000 сум вычтем из следующей выплаты"]);
  assert.deepEqual(Y.advanceLines(null), []);
  // R3 #20: a CLOSED month hands the advance on as it is; an OPEN one hands nothing on yet - only what is left at the END of the month
  assert.equal(Y.payoutAdvanceHint, undefined, "UX pack №9: the question is one plaque with the whole sentence - no second hint line");
  assert.equal(Y.normalizePayoutState({ saved_total: 1, target: 1, paid: 0, balance: 1, state: "unpaid", items: [] }).carry_used, 0, "an older answer without the fields");
  const block = read("src/components/payroll/payout-block.tsx");
  assert.match(block, /advanceLines\(state, month\)\.map/);
});

test("the server's sentence shows only when it adds to the chip and the figures", () => {
  const base = { saved_total: 150000, fresh_total: 150000, target: 150000, paid: 175000, balance: -25000, state: "overpaid", basis: "saved",
    text: "Переплачено 25 000", items: [], carry_in: 0, carry_used: 0, advance_out: 25000 };
  assert.equal(Y.payoutNote(base), null);                                                          // the chip and «Переплачено» say it
  assert.equal(Y.payoutNote({ ...base, paid: 75000, balance: 75000, state: "due", text: "Выплачено 75 000 из 150 000 · осталось 75 000" }), null);
  assert.equal(Y.payoutNote({ ...base, paid: 0, balance: 0, state: "settled", carry_used: 150000, text: "Закрыто авансом прошлого месяца 150 000" }),
    "Закрыто авансом прошлого месяца 150 000");
  // Money-1 A1b: the payout is by the SAVED total; a change of the data after the saving is the line `payoutChangeLine` (month row) and the card's «Пересохранить» - the note under the figures stays silent
  assert.equal(Y.payoutNote({ ...base, paid: 75000, balance: 75000, state: "due", changed_by: 100000, change_text: "После сохранения ведомость изменилась на +100 000. Пересохраните ведомость, чтобы учесть", text: "Выплачено 75 000 из 150 000 · осталось 75 000" }), null);
  assert.equal(Y.payoutNote(null), null);
});

test("the hint under the amount says the same sum as the server's question, also when the month is already overpaid", () => {
  const over = { saved_total: 150000, fresh_total: 150000, target: 150000, paid: 175000, balance: -25000, state: "overpaid", basis: "saved",
    text: "", items: [], carry_in: 0, carry_used: 0, advance_out: 25000 };
  assert.equal(plain(Y.payoutAfterText(100000, over)), "Это на 100 000 сум больше, чем осталось выплатить");                 // server: left = max(balance, 0), excess = amount − left
  assert.equal(plain(Y.payoutAfterText(100000, { ...over, paid: 75000, balance: 75000, state: "due" })), "Это на 25 000 сум больше, чем осталось выплатить");
});
