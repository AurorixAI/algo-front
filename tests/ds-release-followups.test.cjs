// After the merge of package B with the design system: «К оплате» for a waiting student, the break-down `immediate.parts` of the enrolment window (with and without it), the namesakes of the list.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const opts = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: opts }).outputText, f);
require.extensions[".tsx"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: opts }).outputText, f);
const src = (p) => path.join(__dirname, "..", "src", p);
const ledger = require(src("lib/payments-ledger.ts"));
const payFrom = require(src("lib/pay-from.ts"));
const { namesakeDetail } = require(src("lib/student-namesake.ts"));
const nb = (text) => text.replace(/[\s ]+/g, " ");

test("a waiting student's balance says «К оплате 350 000 сум», a debtor's «Долг …»", () => {
  assert.equal(nb(ledger.balanceView({ debt: 350000, advance: 0, tab: "waiting" }).text), "К оплате 350 000 сум");
  assert.match(nb(ledger.balanceView({ debt: 350000, advance: 0, tab: "debtors" }).text), /^Долг 350 000 сум$/);
});

const PARTS = [
  { label: "Октябрь", from: "2026-10-27", amount: 89000, lessons: 2, lessons_in_period: 9, whole: false },
  { label: "Ноябрь", from: "2026-11-01", amount: 400000, lessons: 8, lessons_in_period: 8, whole: true },
];

test("immediate.parts: the break-down lines in the words of the owner; no parts (an older server) - the sentence alone", () => {
  assert.deepEqual(payFrom.immediatePartLines(payFrom.normalizeParts(PARTS)).map(nb), ["Октябрь, с 27.10 — 89 000 сум · 2 урока из 9", "Ноябрь, весь месяц — 400 000 сум"]);
  assert.match(nb(payFrom.immediatePartLines([{ ...PARTS[0], lessons: 5 }])[0]), /5 уроков из 9/);
  assert.match(nb(payFrom.immediatePartLines([{ ...PARTS[0], lessons: 1 }])[0]), /1 урок из 9/);
  const withParts = payFrom.normalizeBilling({ pay_from: "2026-10-27", text: "t", immediate: { amount: 489000, lessons: 10, text: "Сразу начислится 489 000 сум", parts: PARTS } });
  assert.equal(withParts.immediate.parts.length, 2);
  const without = payFrom.normalizeBilling({ pay_from: "2026-10-27", text: "t", immediate: { amount: 489000, lessons: 10, text: "Сразу начислится 489 000 сум" } });
  assert.deepEqual(without.immediate.parts, []);
  assert.equal(payFrom.normalizeBulkImmediate({ billing: { pay_from: "2026-10-27", immediate: { amount: 1, lessons: 1, text: "x", parts: PARTS } } }).students[0].parts.length, 2);
  assert.deepEqual(payFrom.normalizeBulkImmediate({ billing: { pay_from: "2026-10-27", immediate: { amount: 1, lessons: 1, text: "x" } } }).students[0].parts, []);
  assert.deepEqual(payFrom.normalizeParts("junk"), []);
});

test("the block «Сразу начислится»: rows with the caption on the left and the sum on the right; the line beside the big number of a sheet is short and says больше / меньше", () => {
  const rows = payFrom.immediatePartRows(payFrom.normalizeParts(PARTS)).map((r) => ({ label: nb(r.label), amount: nb(r.amount) }));
  assert.deepEqual(rows, [{ label: "Октябрь, с 27.10 · 2 урока из 9", amount: "89 000 сум" }, { label: "Ноябрь, весь месяц", amount: "400 000 сум" }]);
  const Y = require(src("lib/payroll-logica.ts"));
  const moved = { saved_total: 120834, fresh_total: 75834, target: 75834, paid: 0, balance: 75834, state: "unpaid", basis: "fresh", changed_by: -45000, text: "" };
  assert.equal(nb(Y.sheetVersionLine({ payout: moved, updatedAt: "2026-11-05T05:00:00" })), "В таблице ниже — сохранённая версия 05.11: 120 834 сум (на 45 000 сум больше)");
  assert.equal(nb(Y.sheetVersionLine({ payout: { ...moved, saved_total: 45000, fresh_total: 120834, changed_by: 75834 }, updatedAt: "2026-11-05T05:00:00" })), "В таблице ниже — сохранённая версия 05.11: 45 000 сум (на 75 834 сум меньше)");
  assert.equal(Y.sheetVersionLine({ payout: { ...moved, changed_by: 0 } }), null);
  assert.doesNotMatch(nb(Y.sheetVersionLine({ payout: moved })), /сохраните/, "the call to save is said by «Что нужно сделать» only");
});

test("the server sends the month in lower case («ноябрь»): the caption of a row starts with a capital; a period label «06.10–05.11» is untouched", () => {
  const lower = [{ label: "октябрь", from: "2026-10-27", amount: 89000, lessons: 2, lessons_in_period: 9, whole: false }, { label: "ноябрь", from: "2026-11-01", amount: 400000, lessons: 8, lessons_in_period: 8, whole: true }, { label: "06.10–05.11", from: "2026-10-06", amount: 1000, lessons: 0, lessons_in_period: 0, whole: true }];
  assert.deepEqual(payFrom.immediatePartRows(lower).map((r) => nb(r.label)), ["Октябрь, с 27.10 · 2 урока из 9", "Ноябрь, весь месяц", "06.10–05.11, весь месяц"]);
  assert.match(nb(payFrom.immediatePartLines(lower)[0]), /^Октябрь, с 27\.10/);
});

test("namesakes get a telling detail: the end of the phone, else the day added, else the ID; a unique name gets nothing", () => {
  const a = { id: "1", full_name: "Иванов Иван", student_phone: "+998901231234" };
  const b = { id: "2", full_name: "Иванов  Иван", student_phone: null, joined_at: "2026-10-12T05:00:00" };
  const c = { id: "3", full_name: "Иванов Иван", display_id: "AL15-007" };
  const d = { id: "4", full_name: "Петров Пётр" };
  const all = [a, b, c, d];
  assert.equal(namesakeDetail(a, all), "тел. …12 34");
  assert.equal(namesakeDetail(b, all), "добавлен 12.10.2026");
  assert.equal(namesakeDetail(c, all), "ID AL15-007");
  assert.equal(namesakeDetail(d, all), null);
});

test("a NEW student gets no sentence about the previous group (only a real transfer does)", () => {
  const text = fs.readFileSync(src("components/groups/add-student-drawer.tsx"), "utf8");
  assert.match(text, /mode === "transfer" && transfers\.length === 0 \? null : enrolPriceHint/);
});
