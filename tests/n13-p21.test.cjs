// N13 P2.1 - the payment follows the student on a transfer: carry-over rows, notes, hints.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const payments = require(path.join(root, "src/lib/payments.ts"));
const { enrolToast } = require(path.join(root, "src/lib/group-enrol.ts"));
/** Normal spaces instead of the non-breaking ones: what the user reads. */
const plain = (text) => text.replace(/\u00a0/g, " ");

const real = { paid_on: "2026-10-05", amount: 450000, carried_from: null };
const carried = { paid_on: "2026-10-05", amount: 0, carried_from: { payment_id: "p1", group_name: "Алгебра 7А" } };

test("a carry-over reads «перенос из «Группа»», never «0 сум»", () => {
  assert.equal(payments.isCarryOver(carried), true);
  assert.equal(payments.isCarryOver(real), false);
  assert.equal(payments.isCarryOver({ amount: 5 }), false); // an older server sends no carried_from
  assert.equal(payments.isCarryOver(null), false);
  assert.equal(payments.carryOverLabel(carried), "перенос из «Алгебра 7А»");
  assert.equal(payments.paymentAmountLabel(carried), "перенос из «Алгебра 7А»");
  assert.equal(plain(payments.paymentAmountLabel(real)), "450 000 сум");
  assert.equal(plain(payments.paymentAmountLabel({ amount: 0, carried_from: null })), "0 сум"); // a real zero payment stays money
});

test("a carry-over without a group name still reads sensibly", () => {
  assert.equal(payments.carryOverLabel({ carried_from: { payment_id: "p", group_name: "  " } }), "перенос из другой группы");
});

test("last payment label shows the carry-over instead of an amount", () => {
  assert.equal(plain(payments.lastPaymentLabel(carried)), "05.10.2026 · перенос из «Алгебра 7А»");
  assert.equal(plain(payments.lastPaymentLabel(real)), "05.10.2026 · 450 000 сум");
  assert.equal(payments.lastPaymentLabel(null), "—");
});

test("the original that moved reads «перенесено в «Группа» дата»", () => {
  const moved = { carried_out: { date: "2026-10-15", group_name: "Алгебра 9Б" } };
  assert.equal(payments.carriedOutLabel(moved), "перенесено в «Алгебра 9Б» 15.10.2026");
  assert.equal(payments.carriedOutLabel({ carried_out: { date: "2026-10-15", group_name: null } }), "перенесено в другую группу 15.10.2026");
  for (const none of [{ carried_out: null }, {}, null, undefined]) assert.equal(payments.carriedOutLabel(none), "");
});

test("the hint appears only for a transfer and only for users who see money", () => {
  assert.equal(payments.transferPaymentHint({ transfer: true, moneyAvailable: true }), "Действующая оплата перейдёт в новую группу");
  assert.equal(payments.transferPaymentHint({ transfer: true, moneyAvailable: false }), null);
  assert.equal(payments.transferPaymentHint({ transfer: false, moneyAvailable: true }), null); // «Добавить ещё»
  assert.equal(payments.transferPaymentHint({ transfer: false, moneyAvailable: false }), null);
});

test("server notes: the carry-over message is information, the rest stays a warning", () => {
  const notes = [
    { code: "class_mismatch", message: "Класс ученика (8) не совпадает с классом группы (9)" },
    { code: "payment_carried_over", message: "Оплата до 10.11 перенесена в «Алгебра 9Б»" },
  ];
  assert.deepEqual(payments.splitTransferNotes(notes), {
    warnings: ["Класс ученика (8) не совпадает с классом группы (9)"],
    infos: ["Оплата до 10.11 перенесена в «Алгебра 9Б»"],
  });
  assert.deepEqual(payments.splitTransferNotes(undefined), { infos: [], warnings: [] });
  assert.deepEqual(payments.splitTransferNotes([{ code: "x", message: "" }]), { infos: [], warnings: [] });
});

test("bulk notes are prefixed with the student", () => {
  const names = { s1: "Каримова Алия" };
  const out = payments.splitTransferNotes(
    [{ code: "payment_carried_over", message: "Действующая оплата ученика перенесена в новую группу", student_id: "s1" }],
    (id) => names[id],
  );
  assert.deepEqual(out.infos, ["Каримова Алия — Действующая оплата ученика перенесена в новую группу"]);
});

test("enrolment toast: info alone keeps a success toast, warnings turn it amber", () => {
  const base = { added: 2, skipped: 0, skippedLines: [], warnings: [], infos: [] };
  assert.deepEqual(enrolToast(base), { text: "Добавлено учеников: 2", type: "success" });
  assert.deepEqual(enrolToast({ ...base, infos: ["Оплата перенесена"] }), {
    text: "Добавлено учеников: 2", type: "success", details: ["Оплата перенесена"],
  });
  assert.deepEqual(enrolToast({ ...base, warnings: ["Ученик состоит в 3 группах"], infos: ["Оплата перенесена"] }), {
    text: "Добавлено учеников: 2", type: "warning", details: ["Ученик состоит в 3 группах", "Оплата перенесена"],
  });
});

test("enrolment toast: partial and failed batches", () => {
  const partial = enrolToast({ added: 1, skipped: 1, skippedLines: ["Иванов — группа полна"], warnings: [], infos: ["Оплата перенесена"] });
  assert.deepEqual(partial, { text: "Добавлено: 1, не добавлено: 1", type: "warning", details: ["Иванов — группа полна", "Оплата перенесена"] });
  const none = enrolToast({ added: 0, skipped: 2, skippedLines: ["a", "b"], warnings: [], infos: [] });
  assert.deepEqual(none, { text: "Ни одного ученика не добавлено", type: "error", details: ["a", "b"] });
  // an older caller without `infos` still works
  assert.equal(enrolToast({ added: 1, skipped: 0, skippedLines: [], warnings: [] }).type, "success");
});

// ---- the screens use the helpers ----------------------------------------------------

test("payment history, payments page and the void dialog never print «0 сум» for a carry-over", () => {
  const history = read("src/components/payments/membership-payments.tsx");
  assert.match(history, /paymentAmountLabel\(payment\)/);
  assert.doesNotMatch(history, /formatMoney\(payment\.amount\)/);
  assert.match(history, /payment\.note && !carried/);
  assert.match(history, /carriedOutLabel\(payment\)/);
  // a carry-over can only be cancelled: no «Исправить» for it, neither in the history nor on the payments page
  assert.match(history, /\.\.\.\(carried \? \[\] : \[\{ key: "correct"/);
  assert.match(read("src/components/payments/payments-page.tsx"), /if \(!isCarryOver\(last\)\) menu\.push\(\{ key: "correct"/);
  const page = read("src/components/payments/payments-page.tsx");
  assert.match(page, /paymentAmountLabel\(last\)/);
  assert.doesNotMatch(page, /formatMoney\(last\.amount\)/);
  const voidModal = read("src/components/payments/payment-void-modal.tsx");
  assert.match(voidModal, /paymentAmountLabel\(payment\)/);
  assert.match(voidModal, /!isCarryOver\(payment\)/);
  assert.match(voidModal, /снова начнёт действовать/);
});

test("transfer hint: drawer and «Перевести» modal, only via transferPaymentHint", () => {
  const drawer = read("src/components/groups/add-student-drawer.tsx");
  assert.match(drawer, /transferPaymentHint\(\{ transfer: mode === "transfer", moneyAvailable \}\)/);
  assert.match(drawer, /splitTransferNotes\(result\.warnings, nameOf\)/);
  const modal = read("src/components/groups/assign-group-modal.tsx");
  assert.match(modal, /transferPaymentHint\(\{ transfer: isTransfer, moneyAvailable \}\)/);
  assert.match(modal, /usePaymentsSummary\(\(state\) => state\.available\)/);
  assert.match(modal, /splitTransferNotes\(result\.warnings\)/);
  for (const text of [drawer, modal]) assert.doesNotMatch(text, /Действующая оплата перейдёт/); // the wording lives in the lib only
});

test("both group pages build the add-students toast with enrolToast", () => {
  for (const file of ["src/app/owner/groups/[id]/page.tsx", "src/app/admin/groups/[id]/page.tsx"]) {
    const page = read(file);
    assert.match(page, /enrolToast\(result\)/, file);
    assert.doesNotMatch(page, /Ни одного ученика не добавлено/, file);
  }
});
