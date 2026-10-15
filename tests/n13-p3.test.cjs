// N13 P3 - «Зарплата преподавателей»: percent / month / divisor parsing, the cells of the sheet, the preview formula
// (the partner's table), edits and what goes to the server, reading the answers, owner-only visibility, the lesson type.
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
// .tsx too (server-side render of the sheet) and the "@/" alias of the app
require.extensions[".tsx"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const R = require(path.join(root, "src/lib/payroll.ts"));
const sections = require(path.join(root, "src/lib/settings-sections.ts"));
/** Normal spaces instead of the non-breaking ones: what the user reads. */
const plain = (text) => text.replace(/ /g, " ");

// ---- sample data in the shape of the contract (spec §3) ------------------------------------------------------

function rawMark(date, mark, state, lessonId) {
  return { date, lesson_id: lessonId ?? `l-${date}`, mark, state };
}
function rawLine(over = {}) {
  return {
    membership_id: "m1", student_id: "s1", student_name: "Каримова Дилноза", display_id: "A-0012",
    group_id: "g1", group_name: "Алгебра 8А", lesson_type: "group", lesson_time: "Пн, Ср 17:00",
    monthly_fee: 450000, fee_overridden: false, percent: "50", divisor: 12,
    marks: [rawMark("2026-09-01", 1, "counted"), rawMark("2026-09-03", 0, "excused_confirmed"), rawMark("2026-09-08", 1, "excused_pending"), rawMark("2026-09-10", 1, "unpaid")],
    counted: 2, unpaid: 1, pending_excused: 1, include_unpaid: false, amount: 37500, warnings: [],
    ...over,
  };
}
function rawSheet(over = {}) {
  return {
    id: "sheet-1", month: "2026-09", teacher_id: "t1", teacher_name: "Иванов Пётр",
    percent_inputs: { group: "50", individual: "60" }, divisor_default: 12, revision: 3, total_amount: 0,
    lines: [
      rawLine(),
      rawLine({ membership_id: "m2", student_id: "s2", student_name: "Абдуллаев Жасур", display_id: null, monthly_fee: null, counted: 0, unpaid: 0, pending_excused: 0, amount: 0, marks: [rawMark("2026-09-01", null, "not_in_group"), rawMark("2026-09-03", 1, "counted")], warnings: ["не задана оплата"] }),
      rawLine({ membership_id: "m3", student_id: "s3", student_name: "Сидоров Олег", group_id: "g2", group_name: "Индивидуально Сидоров", lesson_type: "individual", lesson_time: "Вт 18:00", percent: "60", monthly_fee: 600000, divisor: 12, counted: 4, unpaid: 0, pending_excused: 0, amount: 120000, marks: [rawMark("2026-09-02", 1, "counted")] }),
    ],
    ...over,
  };
}
const sheetOf = (over) => {
  const raw = rawSheet(over);
  if (raw.total_amount === 0) raw.total_amount = raw.lines.reduce((sum, line) => sum + line.amount, 0);
  return R.normalizeSheet(raw);
};

// ---- 1. lesson types ---------------------------------------------------------------------------------------

test("lesson types: Группа · Мини-группа · Парный · Индивидуально, an unknown one is a plain group", () => {
  assert.deepEqual(R.LESSON_TYPES.map((t) => [t.key, t.label]), [
    ["group", "Группа"], ["mini_group", "Мини-группа"], ["pair", "Парный"], ["individual", "Индивидуально"],
  ]);
  assert.equal(R.lessonTypeLabel("pair"), "Парный");
  for (const bad of [undefined, null, "", "Group", "solo", 5]) assert.equal(R.normalizeLessonType(bad), "group", String(bad));
  assert.equal(R.lessonTypeLabel(undefined), "Группа");
});

// ---- 2. percent ------------------------------------------------------------------------------------------------

test("percent: 0…100, up to two decimals, comma accepted, canonical decimal string", () => {
  const ok = (text, value, hundredths) => {
    const parsed = R.parsePercent(text);
    assert.equal(parsed.error, null, `«${text}» is valid`);
    assert.equal(parsed.value, value, `«${text}» -> ${value}`);
    assert.equal(parsed.hundredths, hundredths);
  };
  ok("50", "50", 5000);
  ok("50,5", "50.5", 5050);
  ok("33.33", "33.33", 3333);
  ok("33,30", "33.3", 3330);
  ok("0", "0", 0);
  ok("0,05", "0.05", 5);
  ok("100", "100", 10000);
  ok("100,00", "100", 10000);
  ok("  50 % ", "50", 5000);
  ok("007", "7", 700);
  ok(".5", "0.5", 50);
  ok("5.", "5", 500);
  ok(5, "5", 500);
});

test("percent: empty, junk, more than 100 and a third decimal are refused with the reason", () => {
  assert.equal(R.parsePercent("").error, R.PERCENT_REQUIRED_TEXT);
  assert.equal(R.parsePercent("   ").error, R.PERCENT_REQUIRED_TEXT);
  assert.equal(R.parsePercent(null).error, R.PERCENT_REQUIRED_TEXT);
  for (const bad of ["abc", "-1", "1e2", "5%5", "1,2,3", "1.2.3", ",", ".", "5 5 5x", "٥٠", "+5", "0x10"]) {
    assert.equal(R.parsePercent(bad).error, R.PERCENT_FORMAT_TEXT, bad);
    assert.equal(R.parsePercent(bad).value, null, bad);
  }
  for (const big of ["100.01", "100,5", "101", "999", "1000", "10000"]) assert.equal(R.parsePercent(big).error, R.PERCENT_MAX_TEXT, big);
  assert.equal(R.parsePercent("33.333").error, R.PERCENT_FORMAT_TEXT);
  assert.equal(R.parsePercent("0,001").error, R.PERCENT_FORMAT_TEXT);
});

test("percent typing keeps digits, one separator, two decimals, three digits before it", () => {
  const typed = R.sanitizePercentTyping;
  assert.equal(typed("50"), "50");
  assert.equal(typed("5a0"), "50");
  assert.equal(typed("33,333"), "33,33");
  assert.equal(typed("33.3.3"), "33.33");
  assert.equal(typed("1234"), "123");
  assert.equal(typed("-5"), "5");
  assert.equal(typed("1e2"), "12");
  assert.equal(typed(",5"), ",5");
  assert.equal(typed("50 %"), "50");
  assert.equal(typed(""), "");
});

test("percent for display: «50 %», «33,5 %», a missing one is a dash", () => {
  assert.equal(plain(R.percentLabel("50.00")), "50 %");
  assert.equal(plain(R.percentLabel(33.5)), "33,5 %");
  assert.equal(R.percentLabel(null), "—");
  assert.equal(R.percentLabel(""), "—");
  assert.equal(R.percentInputText("50.00"), "50");
  assert.equal(R.percentInputText("33.50"), "33,5");
  assert.equal(R.percentInputText("abc"), "");
  assert.equal(R.percentInputText("120"), "");
  assert.equal(R.serverPercentHundredths("33.33"), 3333);
  assert.equal(R.serverPercentHundredths(null), null);
});

// ---- 3. divisor -------------------------------------------------------------------------------------------------

test("divisor of the center: a whole number 1…31, 12 by default", () => {
  assert.equal(R.DEFAULT_DIVISOR, 12);
  assert.deepEqual(R.parseDivisor("12"), { value: 12, error: null });
  assert.equal(R.parseDivisor(" 1 ").value, 1);
  assert.equal(R.parseDivisor("31").value, 31);
  for (const bad of ["", "0", "32", "-1", "1.5", "1,5", "abc", "012x", "1000"]) assert.equal(R.parseDivisor(bad).value, null, bad);
  assert.match(R.parseDivisor("0").error, /от 1 до 31/);
  assert.equal(R.normalizePayrollSettings({ divisor: 10 }).divisor, 10);
  assert.equal(R.normalizePayrollSettings({ divisor: 99 }).divisor, 12);
  assert.equal(R.normalizePayrollSettings(null).divisor, 12);
  assert.equal(R.payrollFormulaText(12), "Оплата в месяц × % ÷ 12 × засчитанные уроки");
  assert.match(R.PAYROLL_PACKAGE_TEXT, /размер пакета/);
});

// ---- 4. month ----------------------------------------------------------------------------------------------------

test("?month= : a real month up to the current one, anything else is the previous month", () => {
  const today = "2026-10-15";
  assert.equal(R.parseMonthParam("2026-09", today), "2026-09");
  assert.equal(R.parseMonthParam("2026-10", today), "2026-10"); // the current month is a preview, allowed
  assert.equal(R.parseMonthParam("2020-02", today), "2020-02");
  for (const bad of [null, undefined, "", "2026-13", "2026-00", "2026-9", "26-09", "2026-09-01", "abc", "2026/09", "1999-12", "2026-11", "2027-01", " 2026-09"]) {
    assert.equal(R.parseMonthParam(bad, today), "2026-09", String(bad));
  }
  // January: the previous month is December of the previous year
  assert.equal(R.parseMonthParam("nope", "2027-01-05"), "2026-12");
  assert.equal(R.previousMonth("2026-03-31"), "2026-02");
});

test("month switcher: shift across a year, the next button stops at the current month, the title is in Russian", () => {
  assert.equal(R.shiftMonth("2026-01", -1), "2025-12");
  assert.equal(R.shiftMonth("2026-12", 1), "2027-01");
  assert.equal(R.shiftMonth("2026-05", 0), "2026-05");
  assert.equal(R.shiftMonth("bad", 1), "bad");
  assert.equal(R.canGoToNextMonth("2026-09", "2026-10-15"), true);
  assert.equal(R.canGoToNextMonth("2026-10", "2026-10-15"), false);
  assert.equal(R.isOpenMonth("2026-10", "2026-10-15"), true);
  assert.equal(R.isOpenMonth("2026-09", "2026-10-15"), false);
  assert.equal(R.monthTitle("2026-09"), "Сентябрь 2026 г.");
  assert.equal(R.monthTitle("2026-01"), "Январь 2026 г.");
  assert.equal(R.formatDayMonth("2026-09-03"), "03.09");
  assert.equal(R.formatDayMonth(""), "");
});

// ---- 5. the cells of the sheet ----------------------------------------------------------------------------------

test("cells: 1 counted, 0 red, «Ув.?» yellow, empty not in the group, grey unpaid", () => {
  const counted = R.markCell(1, "counted");
  assert.deepEqual([counted.tone, counted.label], ["counted", "1"]);
  const zero = R.markCell(0, "excused_confirmed");
  assert.deepEqual([zero.tone, zero.label], ["zero", "0"]);
  assert.match(zero.className, /rose-600/);
  assert.match(zero.title, /подтверждена/);
  const pending = R.markCell(1, "excused_pending");
  assert.deepEqual([pending.tone, pending.label], ["pending", "Ув.?"]);
  assert.match(pending.className, /amber/);
  const empty = R.markCell(null, "not_in_group");
  assert.deepEqual([empty.tone, empty.label], ["empty", ""]);
  const unpaid = R.markCell(1, "unpaid");
  assert.deepEqual([unpaid.tone, unpaid.label], ["unpaid", "1"]);
  assert.match(unpaid.className, /slate-400/);
  assert.match(unpaid.className, /border-dashed/); // not colour alone: it prints
  const included = R.markCell(1, "unpaid", { includeUnpaid: true });
  assert.equal(included.tone, "unpaid_included");
  assert.notEqual(included.title, unpaid.title);
  // the state wins; without a state the mark decides
  assert.equal(R.markCell(0, "counted").tone, "counted");
  assert.equal(R.markCell(1, undefined).tone, "counted");
  assert.equal(R.markCell(0, undefined).tone, "zero");
  assert.equal(R.markCell(null, undefined).tone, "empty");
  assert.equal(R.markCell(1, "something-new").tone, "counted");
});

// ---- 6. the formula (must match the backend) ---------------------------------------------------------------------

test("the partner's table: 450 000, 50 %, D = 12: 11 -> 206 250, 13 -> 243 750, 5 -> 93 750", () => {
  const amount = (lessons) => R.lineAmount({ fee: 450000, percentHundredths: 5000, divisor: 12, lessons });
  assert.equal(amount(11), 206250);
  assert.equal(amount(13), 243750);
  assert.equal(amount(5), 93750);
  assert.equal(amount(0), 0);
  assert.equal(plain(require(path.join(root, "src/lib/payments.ts")).formatMoney(amount(11))), "206 250 сум");
});

test("rounding is half up to a whole sum, exactly (no float)", () => {
  const amount = (fee, hundredths, divisor, lessons) => R.lineAmount({ fee, percentHundredths: hundredths, divisor, lessons });
  assert.equal(amount(1, 5000, 1, 1), 1);            // 0.5 -> 1
  assert.equal(amount(3, 5000, 1, 1), 2);            // 1.5 -> 2
  assert.equal(amount(1, 4999, 1, 1), 0);            // 0.4999 -> 0
  assert.equal(amount(100, 5000, 12, 1), 4);         // 4.1667 -> 4
  assert.equal(amount(100, 5000, 12, 3), 13);        // 12.5 -> 13
  assert.equal(amount(450001, 5000, 12, 1), 18750);  // 18750.04
  assert.equal(amount(1000, 3333, 7, 1), 48);        // 47.61
  // the same number as an exact fraction, computed another way, on awkward inputs
  const exact = (fee, hundredths, divisor, lessons) => {
    const numerator = BigInt(fee) * BigInt(hundredths) * BigInt(lessons);
    const denominator = BigInt(10000) * BigInt(divisor);
    const quotient = numerator / denominator;
    const remainder = numerator % denominator;
    return Number(remainder * BigInt(2) >= denominator ? quotient + BigInt(1) : quotient);
  };
  for (const [fee, hundredths, divisor, lessons] of [[9_999_999_999, 3333, 7, 31], [10_000_000_000, 10000, 31, 60], [123457, 1, 12, 13], [799999, 9999, 11, 17], [250000, 3350, 5, 9]]) {
    assert.equal(amount(fee, hundredths, divisor, lessons), exact(fee, hundredths, divisor, lessons), `${fee} ${hundredths} ${divisor} ${lessons}`);
  }
  // the package: D is the package size
  assert.equal(amount(800000, 5000, 8, 3), 150000);
});

test("nothing to count gives 0, never NaN", () => {
  const base = { fee: 450000, percentHundredths: 5000, divisor: 12, lessons: 3 };
  assert.equal(R.lineAmount({ ...base, fee: null }), 0);
  assert.equal(R.lineAmount({ ...base, fee: 0 }), 0);
  assert.equal(R.lineAmount({ ...base, fee: -5 }), 0);
  assert.equal(R.lineAmount({ ...base, percentHundredths: null }), 0);
  assert.equal(R.lineAmount({ ...base, percentHundredths: 0 }), 0);
  assert.equal(R.lineAmount({ ...base, divisor: 0 }), 0);
  assert.equal(R.lineAmount({ ...base, lessons: -1 }), 0);
  assert.equal(R.lineAmount({ ...base, lessons: 1.5 }), 0);
  assert.equal(R.lineLessons({ counted: 4, unpaid: 2, include_unpaid: false }), 4);
  assert.equal(R.lineLessons({ counted: 4, unpaid: 2, include_unpaid: true }), 6);
  assert.equal(R.lineLessons({ counted: 4, unpaid: 2, include_unpaid: false }, true), 6);
});

// ---- 7. reading the answers ---------------------------------------------------------------------------------------

test("a sheet is read into one shape; lesson type, percent and month have fallbacks", () => {
  const sheet = R.normalizeSheet(rawSheet({ month: undefined, period_month: "2026-09-01" }));
  assert.equal(sheet.month, "2026-09");
  assert.equal(sheet.id, "sheet-1");
  assert.equal(sheet.revision, 3);
  assert.deepEqual(sheet.percents, { group: "50", individual: "60" });
  assert.equal(sheet.lines.length, 3);
  const line = sheet.lines[0];
  assert.equal(line.monthly_fee, 450000);
  assert.equal(line.percent, "50");
  assert.equal(line.marks.length, 4);
  assert.equal(line.marks[1].state, "excused_confirmed");
  assert.equal(sheet.lines[1].monthly_fee, null);
  assert.deepEqual(sheet.lines[1].warnings, ["не задана оплата"]);
  // percents missing in the sheet come from its lines; a line without a type is a «Группа»
  const bare = R.normalizeSheet({ id: "x", month: "2026-09", teacher_id: "t", lines: [{ membership_id: "m", percent: "40.00", amount: "1000" }] });
  assert.deepEqual(bare.percents, { group: "40" });
  assert.equal(bare.lines[0].lesson_type, "group");
  assert.equal(bare.lines[0].amount, 1000);
  assert.equal(bare.total_amount, 1000); // no total sent: the lines' sum
  assert.equal(bare.id, "x");
  // a calculation that is not saved has no id and no revision
  const preview = R.normalizeSheet({ month: "2026-09", teacher_id: "t", lines: [] });
  assert.equal(preview.id, null);
  assert.equal(preview.revision, null);
  // junk does not throw
  assert.equal(R.normalizeSheet(null).lines.length, 0);
  assert.equal(R.normalizeSheet("x").teacher_name, "Преподаватель");
});

test("marks: a state that is not known is derived from the mark; a date that is not a date is dropped", () => {
  const line = R.normalizeLine(rawLine({ marks: [
    { date: "2026-09-01", mark: 1 },
    { date: "2026-09-02", mark: 0 },
    { date: "2026-09-03", mark: null },
    { date: "nope", mark: 1, state: "counted" },
    { date: "2026-09-05T10:00:00", mark: 1, state: "unpaid", lesson_id: 7 },
  ] }));
  assert.deepEqual(line.marks.map((m) => m.state), ["counted", "excused_confirmed", "not_in_group", "unpaid"]);
  assert.equal(line.marks[3].date, "2026-09-05");
  assert.equal(line.marks[3].lesson_id, "7");
  assert.equal(R.normalizeLine({ student_name: "no membership" }), null);
});

test("the answer of calculate: a bare list, or {sheets} / {items}", () => {
  const one = rawSheet({ id: null });
  assert.equal(R.normalizeSheetList([one]).length, 1);
  assert.equal(R.normalizeSheetList({ sheets: [one, one] }).length, 2);
  assert.equal(R.normalizeSheetList({ items: [one] }).length, 1);
  assert.equal(R.normalizeSheetList(null).length, 0);
  assert.equal(R.normalizeSheetList([one])[0].id, null);
  assert.equal(R.normalizeSheetList({ month: "2026-08", sheets: [{ teacher_id: "t", lines: [] }] })[0].month, "2026-08");
});

test("the month overview: teachers by name, types with the suggested percent, the saved sheet, warnings", () => {
  const overview = R.normalizeMonthOverview({
    month: "2026-09", month_open: false,
    teachers: [
      { teacher_id: "t2", teacher_name: "Зайцев", lesson_types: [{ lesson_type: "individual", suggested_percent: "60.00" }, { lesson_type: "group", suggested_percent: null }],
        sheet: { id: "s9", revision: 3, total_amount: 1250000, data_changed: true }, warnings: [{ code: "open_lessons", count: 2, message: "Незавершённые уроки" }] },
      { teacher_id: "t1", teacher_name: "Абдуллаев", lesson_types: ["pair", "group"], suggested_percents: { group: "45" }, sheet: null, warnings: [] },
    ],
  });
  assert.equal(overview.month, "2026-09");
  assert.equal(overview.month_open, false);
  assert.deepEqual(overview.teachers.map((t) => t.teacher_name), ["Абдуллаев", "Зайцев"]);
  const [abd, zai] = overview.teachers;
  assert.deepEqual(abd.lesson_types, [{ lesson_type: "group", suggested_percent: "45" }, { lesson_type: "pair", suggested_percent: "" }]);
  assert.deepEqual(zai.lesson_types, [{ lesson_type: "group", suggested_percent: "" }, { lesson_type: "individual", suggested_percent: "60" }]);
  assert.deepEqual(zai.sheet, { id: "s9", revision: 3, total_amount: 1250000, data_changed: true });
  assert.equal(abd.sheet, null);
  assert.deepEqual(zai.warnings, [{ code: "open_lessons", count: 2, message: "Незавершённые уроки" }]);
  // the flat spelling of the saved sheet
  const flat = R.normalizeMonthOverview({ teachers: [{ teacher_id: "t", teacher_name: "X", sheet_id: "s1", sheet_revision: 2, sheet_total: 5000, data_changed: false }] }, "2026-08");
  assert.deepEqual(flat.teachers[0].sheet, { id: "s1", revision: 2, total_amount: 5000, data_changed: false });
  assert.equal(flat.month, "2026-08");
  assert.equal(R.normalizeMonthOverview(null).teachers.length, 0);
});

test("revisions: newest first, an author that is only an id is not shown; the diff reads nested and flat lines", () => {
  const revisions = R.normalizeRevisions([
    { revision: 1, total_amount: 100, changed_by_name: "Владелец", changed_at: "2026-10-01T05:00:00", percent_inputs: { group: "50" } },
    { revision: 2, total_amount: "150", changed_by: "3f2b8d52-1c3a-4b0f-9d5e-0a6f1b2c3d4e", change_note: "после справки" },
  ]);
  assert.deepEqual(revisions.map((r) => r.revision), [2, 1]);
  assert.equal(revisions[0].changed_by_name, null);
  assert.equal(revisions[0].total_amount, 150);
  assert.equal(revisions[0].change_note, "после справки");
  assert.deepEqual(revisions[1].percents, { group: "50" });
  assert.equal(R.normalizeRevisions({ revisions: [{ revision: 1 }] }).length, 1);

  const diff = R.normalizeDiff({
    changed: true, total_before: 100000, total_after: 120000,
    lines: [
      { membership_id: "m1", student_name: "А", group_name: "Г", before: { counted: 3, unpaid: 1, amount: 50000 }, after: { counted: 4, unpaid: 0, amount: 62500 } },
      { membership_id: "m2", student_name: "Б", counted_before: 2, counted_after: 2, amount_before: 1000, amount_after: 1100 },
      { membership_id: "m3", student_name: "В", before: null, after: { counted: 1, amount: 100 } },
      { membership_id: "m4", student_name: "Г", before: { counted: 1, amount: 100 }, after: null },
    ],
  });
  assert.equal(diff.changed, true);
  assert.deepEqual(diff.lines.map((l) => l.kind), ["changed", "changed", "added", "removed"]);
  assert.deepEqual([diff.lines[0].counted_before, diff.lines[0].counted_after, diff.lines[0].amount_after], [3, 4, 62500]);
  assert.equal(diff.lines[1].amount_after, 1100);
  assert.equal(R.normalizeDiff({ lines: [] }).changed, false);
  assert.equal(R.normalizeDiff(null).changed, false);
});

// ---- 8. editing an open sheet -----------------------------------------------------------------------------------

test("an untouched line shows the server's amount, an edited one the formula's preview", () => {
  const sheet = sheetOf();
  const clean = R.buildLineViews(sheet, R.EMPTY_EDITS);
  assert.deepEqual(clean.map((v) => v.amount), [37500, 0, 120000]);
  assert.deepEqual(clean.map((v) => v.edited), [false, false, false]);

  // fee 450 000 -> 600 000 for the first student: 600000 x 50 % / 12 x 2 = 50 000
  let edits = R.setFeeEdit(R.EMPTY_EDITS, sheet, "m1", 600000);
  let views = R.buildLineViews(sheet, edits);
  assert.equal(views[0].amount, 50000);
  assert.equal(views[0].edited, true);
  assert.equal(views[2].amount, 120000);
  // include unpaid: 3 lessons now
  edits = R.setIncludeEdit(R.EMPTY_EDITS, sheet, "m1", true);
  views = R.buildLineViews(sheet, edits);
  assert.equal(views[0].lessons, 3);
  assert.equal(views[0].amount, 56250);
  // a fee for the student who had none
  edits = R.setFeeEdit(R.setFeeEdit(R.EMPTY_EDITS, sheet, "m2", 400000), sheet, "m2", 400000);
  assert.equal(R.buildLineViews(sheet, edits)[1].amount, 0); // 0 lessons: still 0
  edits = R.setFeeEdit(R.EMPTY_EDITS, sheet, "m1", null);
  assert.equal(R.buildLineViews(sheet, edits)[0].amount, 0);
});

test("a percent edit changes only the lines of its lesson type", () => {
  const sheet = sheetOf();
  const edits = R.setPercentEdit(R.EMPTY_EDITS, sheet, "individual", "30");
  const views = R.buildLineViews(sheet, edits);
  assert.equal(views[0].amount, 37500);        // «Группа» untouched
  assert.equal(views[2].amount, 60000);        // 600000 x 30 % / 12 x 4
  assert.equal(views[2].percent, "30");
  assert.equal(R.percentFieldText(sheet, edits, "individual"), "30");
  assert.equal(R.percentFieldText(sheet, edits, "group"), "50");
  // typing the old value back is no edit
  assert.equal(R.editsDirty(R.setPercentEdit(edits, sheet, "individual", "60")), false);
  assert.equal(R.editsDirty(R.setPercentEdit(R.EMPTY_EDITS, sheet, "group", "50,00")), false);
  // a comma is fine
  assert.equal(R.buildLineViews(sheet, R.setPercentEdit(R.EMPTY_EDITS, sheet, "group", "33,5"))[0].percent, "33.5");
});

test("a percent that is not a percent blocks saving and keeps the preview on the last good value", () => {
  const sheet = sheetOf();
  const emptied = R.setPercentEdit(R.EMPTY_EDITS, sheet, "group", "");
  assert.equal(R.editsDirty(emptied), true);
  assert.match(R.editsProblem(sheet, emptied), /^Группа: укажите процент/);
  assert.equal(R.buildLineViews(sheet, emptied)[0].amount, 37500);
  assert.match(R.editsProblem(sheet, R.setPercentEdit(R.EMPTY_EDITS, sheet, "group", "150")), /не может быть больше 100/);
  assert.match(R.editsProblem(sheet, R.setPercentEdit(R.EMPTY_EDITS, sheet, "individual", "5,555")), /^Индивидуально:/);
  assert.equal(R.editsProblem(sheet, R.EMPTY_EDITS), null);
  assert.equal(R.editsProblem(sheet, R.setPercentEdit(R.EMPTY_EDITS, sheet, "group", "40")), null);
});

test("edits drop themselves when they return to the saved value; a stranger's id is ignored", () => {
  const sheet = sheetOf();
  let edits = R.setFeeEdit(R.EMPTY_EDITS, sheet, "m1", 500000);
  assert.equal(R.editsDirty(edits), true);
  edits = R.setFeeEdit(edits, sheet, "m1", 450000);
  assert.equal(R.editsDirty(edits), false);
  edits = R.setIncludeEdit(R.EMPTY_EDITS, sheet, "m1", true);
  assert.equal(R.editsDirty(R.setIncludeEdit(edits, sheet, "m1", false)), false);
  assert.equal(R.setFeeEdit(R.EMPTY_EDITS, sheet, "nope", 1), R.EMPTY_EDITS);
  assert.equal(R.setIncludeEdit(R.EMPTY_EDITS, sheet, "nope", true), R.EMPTY_EDITS);
  // a missing fee cleared again stays a missing fee
  assert.equal(R.editsDirty(R.setFeeEdit(R.EMPTY_EDITS, sheet, "m2", null)), false);
});

test("blocks per group, the dates as columns, students by name, subtotals and «ИТОГО»", () => {
  const sheet = sheetOf();
  const views = R.buildLineViews(sheet, R.EMPTY_EDITS);
  const blocks = R.buildBlocks(views);
  assert.deepEqual(blocks.map((b) => b.groupName), ["Алгебра 8А", "Индивидуально Сидоров"]);
  const [first, second] = blocks;
  assert.equal(first.lessonType, "group");
  assert.equal(first.lessonTime, "Пн, Ср 17:00");
  assert.deepEqual(first.columns.map((c) => c.date), ["2026-09-01", "2026-09-03", "2026-09-08", "2026-09-10"]);
  assert.deepEqual(first.lines.map((v) => v.line.student_name), ["Абдуллаев Жасур", "Каримова Дилноза"]);
  assert.equal(first.counted, 2);
  assert.equal(first.unpaid, 1);
  assert.equal(first.amount, 37500);
  assert.equal(second.lessonType, "individual");
  assert.equal(second.amount, 120000);
  assert.equal(R.markFor(first.lines[1].line, first.columns[1]).state, "excused_confirmed");
  assert.equal(R.markFor(first.lines[0].line, first.columns[2]), undefined); // not in the group that day
  // the total: the server's while clean, the sum of the lines once edited
  assert.equal(R.sheetTotal(sheet, views, R.EMPTY_EDITS), 157500);
  const edits = R.setFeeEdit(R.EMPTY_EDITS, sheet, "m1", 600000);
  assert.equal(R.sheetTotal(sheet, R.buildLineViews(sheet, edits), edits), 170000);
  // two lessons of a group on one day are two columns
  const twice = R.normalizeLine(rawLine({ marks: [rawMark("2026-09-01", 1, "counted", "a"), rawMark("2026-09-01", 1, "counted", "b")] }));
  assert.equal(R.buildBlocks(R.buildLineViews({ ...sheet, lines: [twice] }, R.EMPTY_EDITS))[0].columns.length, 2);
});

// ---- 9. what goes to the server -----------------------------------------------------------------------------------

test("save body: percents of every type of the sheet as {teacher_id, lesson_type, percent}, only the changed lines", () => {
  const sheet = sheetOf();
  assert.deepEqual(R.buildPercentsPayload(sheet, R.EMPTY_EDITS), [
    { teacher_id: "t1", lesson_type: "group", percent: "50" },
    { teacher_id: "t1", lesson_type: "individual", percent: "60" },
  ]);
  let edits = R.setPercentEdit(R.EMPTY_EDITS, sheet, "group", "33,5");
  edits = R.setFeeEdit(edits, sheet, "m1", 500000);
  edits = R.setIncludeEdit(edits, sheet, "m2", true);
  assert.deepEqual(R.buildLineOverrides(sheet, edits), [
    { membership_id: "m1", monthly_fee: 500000 },
    { membership_id: "m2", include_unpaid: true },
  ]);
  const body = R.buildSaveBody(sheet, edits, "  после справки  ", null);
  assert.deepEqual(body, {
    month: "2026-09", teacher_id: "t1",
    percents: [{ teacher_id: "t1", lesson_type: "group", percent: "33.5" }, { teacher_id: "t1", lesson_type: "individual", percent: "60" }],
    line_overrides: [{ membership_id: "m1", monthly_fee: 500000 }, { membership_id: "m2", include_unpaid: true }],
    note: "после справки",
  });
  // nothing edited, no note, no sheet yet: only the required fields
  assert.deepEqual(Object.keys(R.buildSaveBody(sheet, R.EMPTY_EDITS, "", null)), ["month", "teacher_id", "percents"]);
  // a sheet that already exists travels with the revision the owner saw
  assert.equal(R.buildSaveBody(sheet, R.EMPTY_EDITS, "", 3).revision, 3);
  // a cleared fee is sent as null (the fee is removed), not left out
  assert.deepEqual(R.buildLineOverrides(sheet, R.setFeeEdit(R.EMPTY_EDITS, sheet, "m1", null)), [{ membership_id: "m1", monthly_fee: null }]);
  // the note is cut to 300 characters; blank is none
  assert.equal(R.cleanNote("x".repeat(400)).length, 300);
  assert.equal(R.cleanNote("   "), undefined);
});

test("patch body: the revision the owner saw, percents only when edited, recalculate on request", () => {
  const sheet = sheetOf();
  assert.deepEqual(R.buildPatchBody(sheet, R.EMPTY_EDITS, ""), { revision: 3 });
  assert.deepEqual(R.buildPatchBody(sheet, R.EMPTY_EDITS, "", { recalculate: true }), { revision: 3, recalculate: true });
  const edits = R.setPercentEdit(R.setFeeEdit(R.EMPTY_EDITS, sheet, "m1", 500000), sheet, "individual", "70");
  const body = R.buildPatchBody(sheet, edits, "правка");
  assert.equal(body.revision, 3);
  assert.equal(body.note, "правка");
  assert.deepEqual(body.line_overrides, [{ membership_id: "m1", monthly_fee: 500000 }]);
  assert.deepEqual(body.percents.map((p) => [p.lesson_type, p.percent]), [["group", "50"], ["individual", "70"]]);
});

test("a percent that is not valid yet is not sent (the save is blocked before that)", () => {
  const sheet = sheetOf();
  const edits = R.setPercentEdit(R.EMPTY_EDITS, sheet, "group", "");
  assert.deepEqual(R.buildPercentsPayload(sheet, edits).map((p) => p.lesson_type), ["individual"]);
});

// ---- 10. the page of a month --------------------------------------------------------------------------------------

function overview() {
  return R.normalizeMonthOverview({
    month: "2026-09",
    teachers: [
      { teacher_id: "t1", teacher_name: "Абдуллаев", lesson_types: [{ lesson_type: "group", suggested_percent: "45" }, { lesson_type: "pair", suggested_percent: "" }], sheet: null, warnings: [] },
      { teacher_id: "t2", teacher_name: "Зайцев", lesson_types: [{ lesson_type: "individual", suggested_percent: "60" }], sheet: { id: "s", revision: 2, total_amount: 900000, data_changed: false }, warnings: [] },
    ],
  });
}

test("calculate: every type needs a percent (the suggestion or what is typed), comma becomes a dot", () => {
  const { teachers } = overview();
  const all = new Set();
  // «Парный» of Абдуллаев has no suggestion: no calculation
  assert.equal(R.buildCalculateBody(teachers, {}, all), null);
  assert.deepEqual(R.percentProblems(teachers, {}).map((p) => [p.teacherId, p.lessonType]), [["t1", "pair"]]);
  const typed = { [R.percentKey("t1", "pair")]: "40,5" };
  const body = R.buildCalculateBody(teachers, typed, all);
  assert.deepEqual(body, {
    percents: [
      { teacher_id: "t1", lesson_type: "group", percent: "45" },
      { teacher_id: "t1", lesson_type: "pair", percent: "40.5" },
      { teacher_id: "t2", lesson_type: "individual", percent: "60" },
    ],
  });
  assert.equal("teacher_ids" in body, false); // everybody: no list
  // a typed value wins over the suggestion; junk and over 100 are refused
  assert.equal(R.monthPercentText({ [R.percentKey("t1", "group")]: "50" }, teachers[0], "group"), "50");
  assert.equal(R.monthPercentText({}, teachers[0], "group"), "45");
  assert.equal(R.buildCalculateBody(teachers, { ...typed, [R.percentKey("t2", "individual")]: "101" }, all), null);
  assert.equal(R.buildCalculateBody(teachers, { ...typed, [R.percentKey("t2", "individual")]: "" }, all), null);
  assert.equal(R.buildCalculateBody([], {}, all), null);
});

test("calculate for the selected only: their percents and teacher_ids; others' missing percents do not block", () => {
  const { teachers } = overview();
  const body = R.buildCalculateBody(teachers, {}, new Set(["t2"]));
  assert.deepEqual(body, { percents: [{ teacher_id: "t2", lesson_type: "individual", percent: "60" }], teacher_ids: ["t2"] });
  assert.equal(R.buildCalculateBody(teachers, {}, new Set(["t1"])), null); // t1 is incomplete
  assert.deepEqual(R.calculationScope(teachers, new Set(["t2"])).map((t) => t.teacher_id), ["t2"]);
  assert.deepEqual(R.calculationScope(teachers, new Set()).map((t) => t.teacher_id), ["t1", "t2"]);
  assert.equal(R.calculateButtonLabel(teachers, new Set()), "Рассчитать всех");
  assert.equal(R.calculateButtonLabel(teachers, new Set(["t2"])), "Рассчитать выбранных (1)");
  assert.equal(R.calculateButtonLabel(teachers, new Set(["t1", "t2"])), "Рассчитать всех");
});

test("status of a teacher: not calculated / saved · revision · sum / data changed", () => {
  assert.deepEqual(R.sheetStatus(null), { tone: "none", label: "не рассчитано", detail: "" });
  const saved = R.sheetStatus({ id: "s", revision: 3, total_amount: 1250000, data_changed: false });
  assert.equal(saved.tone, "saved");
  assert.equal(plain(saved.label), "сохранено · редакция 3 · 1 250 000 сум");
  const changed = R.sheetStatus({ id: "s", revision: 3, total_amount: 1250000, data_changed: true });
  assert.equal(changed.tone, "changed");
  assert.equal(changed.label, "данные изменились");
  assert.equal(plain(changed.detail), "редакция 3 · 1 250 000 сум");
});

test("warnings link to the screen where they are fixed", () => {
  const view = (code, count) => R.warningView({ code, count, message: "m" });
  assert.deepEqual(view("open_lessons", 1), { text: "1 незакрытый урок", href: "/owner/attendance?tab=open", tone: "warning" });
  assert.equal(view("open_lessons", 3).text, "3 незакрытых урока");
  assert.equal(view("open_lessons", 7).text, "7 незакрытых уроков");
  assert.equal(view("pending_excuses", 2).href, "/owner/attendance?tab=excuses");
  assert.equal(view("pending_excuses", 1).text, "1 уважительная ждёт решения");
  assert.equal(view("pending_excuses", 5).text, "5 уважительных ждут решения");
  assert.equal(view("no_fee", 4).href, "/owner/payments?bucket=none");
  assert.equal(view("no_fee", 4).text, "не задана оплата: 4");
  assert.equal(view("unpaid_lessons", 5).href, "/owner/payments?bucket=due");
  assert.equal(view("unpaid_lessons", 5).tone, "info");
  // a code the screen does not know shows the server's words, with no link
  assert.deepEqual(view("something_new", 1), { text: "m", href: null, tone: "warning" });
  assert.deepEqual(R.warningView({ code: "", count: 0, message: "Только текст" }), { text: "Только текст", href: null, tone: "warning" });
});

// ---- 11. errors and files -------------------------------------------------------------------------------------------

test("errors: 403 is «Недостаточно прав», 409 asks to reload, the codes carry the server's words", () => {
  assert.match(R.payrollErrorText({ status: 403 }), /^Недостаточно прав/);
  assert.equal(R.payrollErrorText({ status: 409, code: "SHEET_REVISION_CONFLICT" }), "Ведомость изменил другой пользователь — обновите");
  assert.equal(R.payrollErrorText({ status: 409 }), R.REVISION_CONFLICT_TEXT);
  assert.equal(R.isRevisionConflict({ status: 409 }), true);
  assert.equal(R.isRevisionConflict({ status: 422, code: "SHEET_REVISION_CONFLICT" }), true);
  assert.equal(R.isRevisionConflict({ status: 500 }), false);
  assert.equal(R.isRevisionConflict(null), false);
  assert.equal(R.payrollErrorText({ status: 422, code: "PERCENT_REQUIRED", message: "Укажите % для «Группа»" }), "Укажите % для «Группа»");
  assert.equal(R.payrollErrorText({ status: 422, code: "MONTH_INVALID" }), "Некорректный месяц");
  assert.match(R.payrollErrorText({ status: 404 }), /не найдена/);
  assert.equal(R.payrollErrorText({ status: 500, message: "Сервис временно недоступен" }), "Сервис временно недоступен");
  assert.equal(R.payrollErrorText(null), "Не удалось выполнить действие");
});

test("file name: Content-Disposition (UTF-8 and quoted), else the fallback; no paths in a name", () => {
  const name = R.filenameFromContentDisposition;
  assert.equal(name(`attachment; filename*=UTF-8''%D0%97%D0%B0%D1%80%D0%BF%D0%BB%D0%B0%D1%82%D0%B0_2026-09.xlsx`, "x.xlsx"), "Зарплата_2026-09.xlsx");
  assert.equal(name('attachment; filename="payroll_2026-09.xlsx"', "x.xlsx"), "payroll_2026-09.xlsx");
  assert.equal(name("attachment; filename=payroll.xlsx", "x.xlsx"), "payroll.xlsx");
  assert.equal(name(`attachment; filename="a.xlsx"; filename*=UTF-8''b.xlsx`, "x.xlsx"), "b.xlsx"); // the extended form wins
  assert.equal(name(null, "fallback.xlsx"), "fallback.xlsx");   // a cross-origin answer hides the header
  assert.equal(name("", "fallback.xlsx"), "fallback.xlsx");
  assert.equal(name("attachment", "fallback.xlsx"), "fallback.xlsx");
  assert.equal(name('attachment; filename=""', "fallback.xlsx"), "fallback.xlsx");
  assert.equal(name(`attachment; filename*=UTF-8''%E0%A4%A`, "fallback.xlsx"), "fallback.xlsx"); // a broken escape
  assert.equal(name('attachment; filename="../../etc/passwd"', "x.xlsx"), ".._.._etc_passwd");
  assert.equal(R.monthFileName("2026-09"), "Зарплата_2026-09.xlsx");
  assert.equal(R.sheetFileName("Иванов Пётр", "2026-09"), "Зарплата_Иванов_Пётр_2026-09.xlsx");
  assert.equal(R.sheetFileName('  A/B:"C"  ', "2026-09"), "Зарплата_A_B_C_2026-09.xlsx");
  assert.equal(R.sheetFileName("", "2026-09"), "Зарплата_преподаватель_2026-09.xlsx");
});

// ---- 12. the sheet on the screen -------------------------------------------------------------------------------------

test("the sheet table: the partner's layout, accessible names, sticky name column, print rules", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { PayrollSheetTable } = require(path.join(root, "src/components/payroll/sheet-table.tsx"));
  const sheet = sheetOf();
  const html = (edits = R.EMPTY_EDITS, editable = true) =>
    renderToStaticMarkup(React.createElement(PayrollSheetTable, { sheet, edits, editable, onEdits: () => {} }));
  const markup = html();
  const text = plain(markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  for (const part of ["Алгебра 8А", "Группа", "Пн, Ср 17:00", "Индивидуально Сидоров", "Вт 18:00", "Ученик", "Оплата в месяц", "Засчитано", "Не оплачено", "Начислено",
    "01.09", "03.09", "08.09", "10.09", "Ув.?", "ожидает: 1", "не задана оплата", "Итого по группе", "ИТОГО", "157 500 сум", "37 500 сум", "120 000 сум", "включить"]) {
    assert.ok(text.includes(part), `the sheet shows «${part}»`);
  }
  // accessible names of the editable cells
  assert.match(markup, /aria-label="Оплата в месяц: Каримова Дилноза, Алгебра 8А"/);
  assert.match(markup, /aria-label="Включить неоплаченные уроки \(1\): Каримова Дилноза, Алгебра 8А"/);
  // the first column keeps its place on a phone; the table scrolls sideways inside its block, not the page
  assert.match(markup, /sticky left-0/);
  assert.match(markup, /overflow-x-auto/);
  assert.match(markup, /print:overflow-visible/);
  assert.match(markup, /print:static/);
  // inputs do not print: a plain text stands in for them
  assert.match(markup, /print:hidden/);
  assert.match(markup, /hidden print:inline/);
  // the red zero and the yellow marker
  assert.match(markup, /text-rose-600/);
  assert.match(markup, /bg-amber-100/);
  // an edit shows in the line, the subtotal and the total at once
  const edited = plain(html(R.setFeeEdit(R.EMPTY_EDITS, sheet, "m1", 600000)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  assert.ok(edited.includes("50 000 сум"));
  assert.ok(edited.includes("170 000 сум"));
  assert.ok(edited.includes("изменена"));
  // read-only: no inputs
  assert.doesNotMatch(html(R.EMPTY_EDITS, false), /<input/);
  // a sheet with no lines says so
  const empty = renderToStaticMarkup(React.createElement(PayrollSheetTable, { sheet: { ...sheet, lines: [] }, edits: R.EMPTY_EDITS, onEdits: () => {} }));
  assert.match(empty, /нет учеников с засчитанными уроками/);
});

// ---- 13. owner only, the menu, the settings, the groups -------------------------------------------------------------

test("the menu item «Зарплата» is the owner's alone; the pages sit under /owner, behind its guard", () => {
  const sidebar = read("src/components/layout/sidebar.tsx");
  const ownerNav = sidebar.slice(sidebar.indexOf("const ownerNav"), sidebar.indexOf("const teacherNav"));
  const adminNav = sidebar.slice(sidebar.indexOf("const adminNav"), sidebar.indexOf("const ownerNav"));
  const teacherNav = sidebar.slice(sidebar.indexOf("const teacherNav"), sidebar.indexOf("const navItems"));
  assert.match(ownerNav, /href: "\/owner\/payroll", label: "Зарплата"/);
  assert.match(ownerNav, /!DEMO_MODE && rawRole === "owner"/);
  assert.doesNotMatch(adminNav, /payroll|Зарплата/);
  assert.doesNotMatch(teacherNav, /payroll|Зарплата/);
  assert.match(read("src/app/owner/layout.tsx"), /allowedRoles=\{\["owner"\]\}/);
  for (const role of ["admin", "teacher"]) {
    assert.equal(fs.existsSync(path.join(root, "src/app", role, "payroll")), false, `no payroll route under /${role}`);
  }
  assert.ok(fs.existsSync(path.join(root, "src/app/owner/payroll/page.tsx")));
  assert.ok(fs.existsSync(path.join(root, "src/app/owner/payroll/[sheetId]/page.tsx")));
  // the second line behind the layout: a non-owner who gets there sees «Недостаточно прав», nothing is requested
  for (const file of ["payroll-month-page.tsx", "payroll-sheet-page.tsx"]) {
    const source = read(`src/components/payroll/${file}`);
    assert.match(source, /effectiveRole\(user\) !== "owner"/, file);
    assert.match(source, /<PayrollForbidden \/>/, file);
    assert.match(source, /if \(denied/, file);
  }
  assert.match(read("src/components/payroll/sheet-controls.tsx"), /Недостаточно прав/);
});

test("the month page: latest answer wins, a month switch drops previews, leaving a dirty sheet asks", () => {
  const month = read("src/components/payroll/payroll-month-page.tsx");
  assert.match(month, /createRequestSequence\(\)/);
  assert.match(month, /loads\.current\.isCurrent\(token\)/);
  assert.match(month, /calcs\.current\.isCurrent\(token\)/);
  assert.match(month, /monthRef\.current !== requestedMonth/);
  assert.match(month, /useUnsavedGuard\(dirty, UNSAVED_TEXT\)/);
  assert.match(month, /confirmLeave\(dirty, UNSAVED_TEXT\)/);
  assert.match(month, /parseMonthParam\(searchParams\?\.get\("month"\), today\)/);
  assert.match(month, /Скачать Excel за месяц/);
  assert.match(month, /disabled=\{savedCount === 0 \|\| exporting\}/);
  assert.match(month, /Месяц ещё не закончился/);
  assert.match(month, /aria-label=\{`Выбрать: \$\{teacher\.teacher_name\}`\}/);
  assert.match(month, /aria-label=\{`Процент для \$\{teacher\.teacher_name\}, \$\{lessonTypeLabel\(type\.lesson_type\)\}`\}/);
  assert.match(month, /label=\{`Действия: \$\{teacher\.teacher_name\}`\}/);
  const sheetPage = read("src/components/payroll/payroll-sheet-page.tsx");
  assert.match(sheetPage, /useUnsavedGuard\(dirty, UNSAVED_TEXT\)/);
  assert.match(sheetPage, /История редакций/);
  assert.match(sheetPage, /window\.print\(\)/);
  assert.match(sheetPage, /isRevisionConflict/);
  assert.match(sheetPage, /size: A4 landscape/);
  assert.match(read("src/components/payroll/sheet-controls.tsx"), /Данные изменились после сохранения — пересчитать\?/);
  assert.match(read("src/components/payroll/sheet-controls.tsx"), /Пересчитать/);
  // a window.print() page hides the chrome
  assert.match(read("src/app/owner/layout.tsx"), /print:ml-0 print:p-0/);
  assert.match(read("src/components/layout/sidebar.tsx"), /print:hidden/);
});

test("the unsaved-changes guard covers closing the tab, links and the Back button", () => {
  const guard = read("src/lib/use-unsaved-guard.ts");
  assert.match(guard, /beforeunload/);
  assert.match(guard, /document\.addEventListener\("click", onClick, true\)/);
  assert.match(guard, /popstate/);
  assert.match(guard, /event\.stopPropagation\(\)/);
  assert.match(R.UNSAVED_TEXT, /несохранённые правки/);
});

test("the API helpers sit on the contract's routes", () => {
  const api = read("src/lib/api.ts");
  for (const route of [
    "/auth/org/payroll/settings",
    "/auth/org/payroll/months/${encodePathId(month)}`",
    "/auth/org/payroll/months/${encodePathId(month)}/calculate",
    "/auth/org/payroll/sheets\"",
    "/auth/org/payroll/sheets?month=${encodeURIComponent(month)}",
    "/auth/org/payroll/sheets/${encodePathId(sheetId)}`",
    "/auth/org/payroll/sheets/${encodePathId(sheetId)}/revisions",
    "/auth/org/payroll/sheets/${encodePathId(sheetId)}/diff",
    "/auth/org/payroll/sheets/${encodePathId(sheetId)}/export.xlsx",
    "/auth/org/payroll/months/${encodePathId(month)}/export.xlsx",
  ]) assert.ok(api.includes(route), route);
  assert.match(api, /method: "PATCH", body/);
  assert.match(api, /method: "PUT", body: data/);
  // the file comes with the session cookie and the name of the header
  assert.match(api, /async function fetchFile/);
  assert.match(api, /filenameFromContentDisposition\(res\.headers\.get\("Content-Disposition"\)/);
  assert.match(api, /lesson_type\?: LessonType/);
  assert.match(api, /max_students\?: number; lesson_type\?: LessonType/);
});

test("settings: the owner's section «Зарплата» with the divisor and the formula", () => {
  assert.deepEqual(sections.visibleSettingsSections({ isOwner: true, paymentSettingsReadable: false }).filter((s) => s === "payroll"), ["payroll"]);
  assert.equal(sections.visibleSettingsSections({ isOwner: false, paymentSettingsReadable: true }).includes("payroll"), false);
  assert.equal(sections.parseSettingsSection("payroll"), "payroll");
  assert.equal(sections.parseSettingsSection("payroll", ["organization"]), "organization");
  assert.equal(sections.settingsSectionHref("payroll"), "?section=payroll");
  const page = read("src/app/owner/settings/page.tsx");
  assert.match(page, /section === "payroll"/);
  assert.match(page, /orgApi\.getPayrollSettings\(\)/);
  assert.match(page, /orgApi\.updatePayrollSettings\(\{ divisor: parsed\.value \}\)/);
  assert.match(page, /payrollFormulaText\(divisor\)/);
  assert.match(page, /PAYROLL_PACKAGE_TEXT/);
  assert.match(R.PAYROLL_PACKAGE_TEXT, /Для оплаты пакетом уроков делитель — размер пакета/);
  // the example is the partner's: 450 000 x 50 % / 12 x 11 = 206 250
  assert.equal(R.lineAmount({ fee: 450000, percentHundredths: 5000, divisor: 12, lessons: 11 }), 206250);
  assert.equal(R.lineAmount({ fee: 450000, percentHundredths: 5000, divisor: 10, lessons: 11 }), 247500);
});

test("groups: «Тип занятий» in the create and edit forms, shown on the card and the group page", () => {
  const modal = read("src/components/groups/group-create-modal.tsx");
  assert.match(modal, /Тип занятий/);
  assert.match(modal, /LESSON_TYPES\.map/);
  assert.match(modal, /lesson_type: form\.lesson_type/);
  for (const role of ["owner", "admin"]) {
    const page = read(`src/app/${role}/groups/[id]/page.tsx`);
    assert.match(page, /label="Тип занятий"/, role);
    assert.match(page, /options=\{LESSON_TYPES\.map/, role);
    assert.match(page, /lesson_type: editState\.lesson_type/, role);
    assert.match(page, /lessonTypeLabel\(group\.lesson_type\)/, role);
    assert.match(page, /lesson_type: normalizeLessonType\(g\.lesson_type\)/, role);
  }
  assert.match(read("src/components/groups/group-card.tsx"), /lessonTypeLabel\(group\.lesson_type\)/);
  assert.match(read("src/app/teacher/groups/[id]/page.tsx"), /lessonTypeLabel\(group\.lesson_type\)/);
});
