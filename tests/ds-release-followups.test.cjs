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

test("the rounding line exists for a part of a month and says 1 000 сум", () => {
  assert.equal(nb(payFrom.IMMEDIATE_ROUNDING_NOTE), "Неполный месяц округляется до 1 000 сум");
  const text = fs.readFileSync(src("components/groups/pay-from-field.tsx"), "utf8");
  assert.match(text, /parts\.some\(\(part\) => !part\.whole\) && <p data-testid="pay-from-rounding-note"/, "only where a month is not whole");
});

test("namesakes: the day added is `created_at` of the answer (the first), `joined_at` only when there is none", () => {
  const a = { id: "1", full_name: "Иванов Иван", student_phone: "+998901231234", created_at: "2026-10-12T05:00:00", joined_at: "2026-11-01T05:00:00" };
  const b = { id: "2", full_name: "Иванов Иван", student_phone: "+998907771234", created_at: "2026-11-03T05:00:00" };
  assert.equal(namesakeDetail(a, [a, b]), "добавлен 12.10.2026");
  assert.equal(namesakeDetail(b, [a, b]), "добавлен 03.11.2026");
});

test("namesakes with the SAME end of the phone are told apart by the day added, then by the ID (the detail really tells them apart)", () => {
  const a = { id: "1", full_name: "Иванов Иван", student_phone: "+998901231234", joined_at: "2026-10-12T05:00:00", display_id: "AL15-001" };
  const b = { id: "2", full_name: "Иванов Иван", student_phone: "+998907771234", joined_at: "2026-11-03T05:00:00", display_id: "AL15-002" };
  assert.equal(namesakeDetail(a, [a, b]), "добавлен 12.10.2026");
  assert.equal(namesakeDetail(b, [a, b]), "добавлен 03.11.2026");
  const c = { ...b, joined_at: "2026-10-12T09:00:00" };
  assert.equal(namesakeDetail(a, [a, c]), "ID AL15-001", "same phone end and same day: the ID");
  assert.equal(namesakeDetail(c, [a, c]), "ID AL15-002");
  const d = { id: "4", full_name: "Иванов Иван", student_phone: "+998905559900" };
  assert.equal(namesakeDetail(a, [a, d]), "тел. …12 34", "different ends: the phone");
  assert.equal(namesakeDetail(d, [a, d]), "тел. …99 00");
});

test("namesakes get a telling detail: the end of the phone when the ends differ; a unique name gets nothing; without a phone the day, without a day the ID", () => {
  const a = { id: "1", full_name: "Иванов Иван", student_phone: "+998901231234" };
  const b = { id: "2", full_name: "Иванов  Иван", student_phone: "+998907775599" };
  const d = { id: "4", full_name: "Петров Пётр" };
  assert.equal(namesakeDetail(a, [a, b, d]), "тел. …12 34");
  assert.equal(namesakeDetail(b, [a, b, d]), "тел. …55 99");
  assert.equal(namesakeDetail(d, [a, b, d]), null);
  const x = { id: "5", full_name: "Сидоров Сидор", joined_at: "2026-10-12T05:00:00" };
  const y = { id: "6", full_name: "Сидоров Сидор", joined_at: "2026-11-03T05:00:00" };
  assert.equal(namesakeDetail(x, [x, y]), "добавлен 12.10.2026");
  const z = { id: "7", full_name: "Орлов Олег", display_id: "AL15-007" };
  const w = { id: "8", full_name: "Орлов Олег", display_id: "AL15-008" };
  assert.equal(namesakeDetail(z, [z, w]), "ID AL15-007");
});

test("a NEW student gets no sentence about the previous group (only a real transfer does)", () => {
  const text = fs.readFileSync(src("components/groups/add-student-drawer.tsx"), "utf8");
  assert.match(text, /mode === "transfer" && transfers\.length === 0 \? null : enrolPriceHint/);
});

test("the owner's panel shows a skeleton until the centre is known - no made-up name, status or type; no dark glass block", () => {
  const text = fs.readFileSync(src("app/owner/dashboard/page.tsx"), "utf8");
  assert.match(text, /!org \? \(\s*<div[^>]*data-testid="org-skeleton"/);
  assert.doesNotMatch(text, /org\?\.name \|\| "Моя организация"|org\?\.status/, "no fallback values");
  assert.doesNotMatch(text, /bg-slate-900|backdrop-blur|bg-white\/5|text-white/, "a light card of the system");
});

test("a ONE-OFF lesson of today with NO time: not «прошедшее время» (that rule works only on a filled time); the fields say «Укажите время …»", () => {
  const F = require(src("lib/lesson-slot-form.ts"));
  assert.equal(F.pastTimeProblem("", 14 * 60 + 53), null);
  const plan = F.pastDayPlan({ scope: "one_off", times: [{ day: 0, startTime: "", endTime: "" }], validFrom: "", date: "2026-11-10", today: "2026-11-10", todayDay: 2, nowMinutes: 14 * 60 + 53 });
  assert.equal(plan.pastOneOff, null);
  assert.ok(F.pastDayPlan({ scope: "one_off", times: [{ day: 0, startTime: "09:00", endTime: "10:00" }], validFrom: "", date: "2026-11-10", today: "2026-11-10", todayDay: 2, nowMinutes: 14 * 60 + 53 }).pastOneOff, "a filled past time is still refused");
  assert.equal(F.timeRangeProblem("", ""), F.START_REQUIRED_TEXT);
});

test("namesakes: EVERY namesake shows the same kind of detail; the same phone and the same day give an ID to both (the public ID is given at the enrolment: while one has none, the minute of adding tells them apart)", () => {
  const a = { id: "u-1", full_name: "Ученик 2 Б-тест", student_phone: "+998901112233", created_at: "2026-11-06T13:26:00", display_id: "DS-011" };
  const b = { id: "u-2", full_name: "Ученик 2 Б-тест", student_phone: "+998901112233", created_at: "2026-11-06T13:27:00" };
  assert.equal(namesakeDetail(a, [a, b]), "добавлен 06.11.2026 13:26");
  assert.equal(namesakeDetail(b, [a, b]), "добавлен 06.11.2026 13:27");
  const b2 = { ...b, display_id: "DS-012" };
  assert.equal(namesakeDetail(a, [a, b2]), "ID DS-011");
  assert.equal(namesakeDetail(b2, [a, b2]), "ID DS-012");
  const c = { ...b, student_phone: "+998901115544" };
  assert.match(namesakeDetail(a, [a, c]), /^тел\./);
  assert.match(namesakeDetail(c, [a, c]), /^тел\./);
  const d = { ...b, created_at: "2026-11-08T10:00:00" };
  assert.equal(namesakeDetail(a, [a, d]), "добавлен 06.11.2026");
  assert.equal(namesakeDetail(d, [a, d]), "добавлен 08.11.2026");
});
