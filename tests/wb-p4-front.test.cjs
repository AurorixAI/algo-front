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
  assert.deepEqual(Y.buildPayoutBody(values, false), { amount: 500000, paid_on: "2026-11-02", method: "cash" });
  assert.deepEqual(Y.buildPayoutBody(values, true), { amount: 500000, paid_on: "2026-11-02", method: "cash", confirm_overpay: true });
});

test("the error reader tells the overpay question from the other refusals", () => {
  const ask = Y.payoutError({ status: 409, code: "OVERPAY_CONFIRM_REQUIRED", message: "Выплата больше остатка на 25 000 сум", detail: { code: "OVERPAY_CONFIRM_REQUIRED", overpay: 25000, balance: 475000 } });
  assert.equal(ask.kind, "overpay_confirm");
  assert.equal(ask.overpay, 25000);
  // a question without a usable number is not a question: the message is shown as an error
  assert.equal(Y.payoutError({ code: "OVERPAY_CONFIRM_REQUIRED", message: "x", detail: { overpay: 0 } }).overpay, null);
  assert.equal(Y.payoutError({ code: "OVERPAY_CONFIRM_REQUIRED", message: "x", detail: {} }).overpay, null);
  for (const [code, kind] of [["DUPLICATE_PAYOUT", "duplicate"], ["SHEET_NOT_SAVED", "not_saved"], ["AMOUNT_RANGE", "amount_range"], ["SOMETHING", "other"]]) {
    const failure = Y.payoutError({ code, message: "m", detail: { overpay: 5 } });
    assert.equal(failure.kind, kind);
    assert.equal(failure.overpay, null, "only the overpay question carries the number");
  }
});

test("the words of the owner", () => {
  assert.equal(plain(Y.payoutOverpayQuestion(25000)), "Выплата больше остатка на 25 000 сум — записать как аванс?");
  assert.equal(Y.PAYOUT_ADVANCE_LABEL, "Записать как аванс");
});

test("the dialog asks only what the server asked, and sends the flag only on «Записать как аванс»", () => {
  const dialog = read("src/components/payroll/payout-dialog.tsx");
  assert.doesNotMatch(dialog, /payoutOverpay\(/, "no client-side pre-question: the screen's balance may be stale, the server counts under the lock");
  assert.doesNotMatch(dialog, /confirming/, "the old client-side confirmation state is gone");
  assert.match(dialog, /failure\.kind === "overpay_confirm" && failure\.overpay !== null\) setOverpay\(failure\.overpay\)/);
  assert.match(dialog, /void send\(false\)/, "the first send never carries the flag");
  assert.match(dialog, /onClick=\{overpay !== null \? \(\) => void send\(true\) : undefined\}/, "only the button of the question confirms");
  assert.match(dialog, /overpay !== null \? PAYOUT_ADVANCE_LABEL : "Сохранить"/);
  assert.match(dialog, /overpay !== null \? \(\) => setOverpay\(null\) : onClose/, "«Отмена» of the question returns to the form, of the form closes");
  assert.match(dialog, /if \(sending\.current\) return;\s+sending\.current = true;/, "a second Enter / click before the next render (LESSONS 27)");
  assert.match(dialog, /payoutOverpayQuestion\(overpay\)/);
});

test("MUTATIONS: the guards removed from a copy of the dialog are caught by the same pins", () => {
  const dialog = read("src/components/payroll/payout-dialog.tsx");
  const variants = [
    dialog.replace("void send(false)", "void send(true)"),                                  // the flag from the first send
    dialog.replace("if (sending.current) return;", ""),                                     // no ref guard
    dialog.replace("overpay !== null ? PAYOUT_ADVANCE_LABEL : \"Сохранить\"", "\"Сохранить\""),   // no advance button
  ];
  const pins = [/void send\(false\)/, /if \(sending\.current\) return;/, /overpay !== null \? PAYOUT_ADVANCE_LABEL : "Сохранить"/];
  variants.forEach((mutated, i) => {
    assert.notEqual(mutated, dialog);
    assert.doesNotMatch(mutated, pins[i], `mutation ${i} must break its pin`);
  });
});
