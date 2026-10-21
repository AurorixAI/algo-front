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

// ---- sample data in the shape of the real API (auth-service payroll_schemas.py) ----------------------------------

const mark = (date, markValue, state, divisor, lessonId) => ({ date, lesson_id: lessonId ?? `l-${date}`, mark: markValue, state, divisor });
const counted = (date, divisor = 12) => mark(date, 1, "counted", divisor);
const unpaid = (date, divisor = 12) => mark(date, 1, "unpaid", divisor);
const pending = (date, divisor = 12) => mark(date, 1, "excused_pending", divisor);
const excused = (date) => mark(date, 0, "excused_confirmed", null);
const absent = (date) => mark(date, null, "not_in_group", null);

function line(over = {}) {
  return {
    membership_id: "m1", student_id: "s1", student_name: "Каримова Дилноза", display_id: "A-0012",
    group_id: "g1", group_name: "Алгебра 8А", lesson_type: "group", lesson_time: "Пн, Ср 17:00",
    monthly_fee: 450000, source_fee: 450000, fee_overridden: false, percent: "50", divisor: 12,
    marks: [counted("2026-09-01"), excused("2026-09-03"), pending("2026-09-08"), unpaid("2026-09-10")],
    counted: 2, unpaid: 1, pending_excused: 1, include_unpaid: false, amount: 37500, warnings: [],
    ...over,
  };
}
/** The blocks of the sheet as the engine's group_blocks builds them. */
function blocksOf(lines) {
  const blocks = new Map();
  for (const l of lines) {
    if (!blocks.has(l.group_id)) blocks.set(l.group_id, { group_id: l.group_id, group_name: l.group_name, lesson_type: l.lesson_type, lesson_time: l.lesson_time, percent: l.percent, dates: new Map(), line_count: 0, counted: 0, unpaid: 0, total_amount: 0 });
    const b = blocks.get(l.group_id);
    for (const m of l.marks) b.dates.set(`${m.date}|${m.lesson_id}`, { date: m.date, lesson_id: m.lesson_id });
    b.line_count += 1; b.counted += l.counted; b.unpaid += l.unpaid; b.total_amount += l.amount;
  }
  return [...blocks.values()].map((b) => ({ ...b, dates: [...b.dates.values()].sort((x, y) => x.date.localeCompare(y.date)) }));
}
function makeSheet(over = {}) {
  const lines = over.lines ?? [
    line(),
    line({ membership_id: "m2", student_id: "s2", student_name: "Абдуллаев Жасур", display_id: null, monthly_fee: null, source_fee: null, counted: 3, unpaid: 0, pending_excused: 0, amount: 0,
      marks: [absent("2026-09-01"), counted("2026-09-03"), counted("2026-09-08"), counted("2026-09-10")] }),
    line({ membership_id: "m3", student_id: "s3", student_name: "Сидоров Олег", group_id: "g2", group_name: "Индивидуально Сидоров", lesson_type: "individual", lesson_time: "Вт 18:00",
      percent: "60", monthly_fee: 600000, source_fee: 600000, counted: 4, unpaid: 0, pending_excused: 0, amount: 120000,
      marks: [counted("2026-09-02"), counted("2026-09-04"), counted("2026-09-09"), counted("2026-09-11")] }),
    // a package (D = 8) and a month (D = 12) in one line: no single divisor
    line({ membership_id: "m4", student_id: "s4", student_name: "Юсупов Тимур", group_id: "g3", group_name: "Пара: Али и Вали", lesson_type: "pair", lesson_time: "Чт 19:00",
      percent: "50", monthly_fee: 800000, source_fee: 800000, divisor: null, counted: 3, unpaid: 0, pending_excused: 0, amount: 133333,
      marks: [counted("2026-09-05", 8), counted("2026-09-12", 8), counted("2026-09-19", 12)] }),
  ];
  return {
    id: "sheet-1", saved: true, month: "2026-09", period_start: "2026-09-01", period_end: "2026-09-30", month_open: false,
    teacher_id: "t1", teacher_name: "Иванов Пётр", revision: 3, percents: { group: "50", individual: "60", pair: "50" }, divisor_default: 12,
    lines, groups: blocksOf(lines), total_amount: lines.reduce((sum, l) => sum + l.amount, 0),
    counted_total: lines.reduce((sum, l) => sum + l.counted, 0), unpaid_total: lines.reduce((sum, l) => sum + l.unpaid, 0), pending_excused_total: 1,
    warnings: { open_lessons: null, pending_excused: 1, no_fee: 1, unpaid: 1 }, source_fingerprint: "abc", stale: false, note: null,
    created_by_name: "Владелец", created_at: "2026-10-01T05:00:00", updated_by_name: "Владелец", updated_at: "2026-10-01T05:00:00",
    ...over,
  };
}
const sheetOf = makeSheet;

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
  assert.deepEqual(R.DEFAULT_PAYROLL_SETTINGS, { divisor: 12 });
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

test("cells: 1 counted, 0 red, «Ждёт» yellow, empty not in the group, grey unpaid", () => {
  const counted = R.markCell(1, "counted");
  assert.deepEqual([counted.tone, counted.label], ["counted", "1"]);
  const zero = R.markCell(0, "excused_confirmed");
  assert.deepEqual([zero.tone, zero.label], ["zero", "0"]);
  assert.match(zero.className, /rose-600/);
  assert.match(zero.title, /подтверждена/);
  const pending = R.markCell(1, "excused_pending");
  assert.deepEqual([pending.tone, pending.label], ["pending", "Ждёт"]);
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

/** The backend's rule in other words: exact fractions, multiply first, divide last, round half up. */
function exactAmount(fee, hundredths, parts) {
  let numerator = BigInt(0);
  let denominator = BigInt(1);
  for (const [divisor, lessons] of parts) {
    // numerator / denominator + lessons / divisor
    numerator = numerator * BigInt(divisor) + BigInt(lessons) * denominator;
    denominator *= BigInt(divisor);
  }
  numerator *= BigInt(fee) * BigInt(hundredths);
  denominator *= BigInt(10000);
  const quotient = numerator / denominator;
  return Number((numerator % denominator) * BigInt(2) >= denominator ? quotient + BigInt(1) : quotient);
}

test("rounding is half up to a whole sum, exactly (no float)", () => {
  const amount = (fee, hundredths, divisor, lessons) => R.lineAmount({ fee, percentHundredths: hundredths, divisor, lessons });
  assert.equal(amount(1, 5000, 1, 1), 1);            // 0.5 -> 1
  assert.equal(amount(3, 5000, 1, 1), 2);            // 1.5 -> 2
  assert.equal(amount(1, 4999, 1, 1), 0);            // 0.4999 -> 0
  assert.equal(amount(100, 5000, 12, 1), 4);         // 4.1667 -> 4
  assert.equal(amount(100, 5000, 12, 3), 13);        // 12.5 -> 13
  assert.equal(amount(450001, 5000, 12, 1), 18750);  // 18750.04
  assert.equal(amount(1000, 3333, 7, 1), 48);        // 47.61
  for (const [fee, hundredths, divisor, lessons] of [[9_999_999_999, 3333, 7, 31], [10_000_000_000, 10000, 31, 60], [123457, 1, 12, 13], [799999, 9999, 11, 17], [250000, 3350, 5, 9]]) {
    assert.equal(amount(fee, hundredths, divisor, lessons), exactAmount(fee, hundredths, [[divisor, lessons]]), `${fee} ${hundredths} ${divisor} ${lessons}`);
  }
  // the package: D is the package size
  assert.equal(amount(800000, 5000, 8, 3), 150000);
});

test("lessons with different divisors in one line: each by its own D, ONE rounding at the end", () => {
  // a package of 8 (2 lessons) and a month (1 lesson): 800 000 x 50 % x (2/8 + 1/12) = 133 333.33
  assert.equal(R.amountByDivisors(800000, 5000, [[8, 2], [12, 1]]), 133333);
  // rounding once is not rounding per lesson: 100 x 50 % / 12 = 4.1667 per lesson, 3 lessons = 12.5 -> 13 (3 x round = 12)
  assert.equal(R.amountByDivisors(100, 5000, [[12, 3]]), 13);
  assert.equal(R.amountByDivisors(100, 5000, [[12, 1], [12, 1], [12, 1]]), 13);
  // the order of the parts does not matter, equal divisors merge
  assert.equal(R.amountByDivisors(800000, 5000, [[12, 1], [8, 2]]), 133333);
  for (const parts of [[[8, 3], [12, 5], [10, 2]], [[31, 7], [30, 1]], [[1, 2], [2, 3], [3, 4], [5, 7]], [[12, 11]]]) {
    for (const [fee, hundredths] of [[450000, 5000], [333333, 3333], [1, 5000], [10_000_000_000, 9999]]) {
      assert.equal(R.amountByDivisors(fee, hundredths, parts), exactAmount(fee, hundredths, parts), JSON.stringify([fee, hundredths, parts]));
    }
  }
  // junk parts are ignored, never NaN
  assert.equal(R.amountByDivisors(450000, 5000, [[0, 3], [12, 0], [12, -1], [1.5, 2]]), 0);
});

test("the amount of a line from its marks: counted and pending count, unpaid only when included, null D is the default", () => {
  const base = { fee: 450000, percentHundredths: 5000, defaultDivisor: 12 };
  const marks = [counted("2026-09-01"), excused("2026-09-03"), pending("2026-09-08"), unpaid("2026-09-10"), absent("2026-09-12")];
  assert.equal(R.marksAmount({ ...base, marks, includeUnpaid: false }), 37500);   // 2 lessons
  assert.equal(R.marksAmount({ ...base, marks, includeUnpaid: true }), 56250);    // 3 lessons
  // a mark without its own D uses the sheet's
  assert.equal(R.marksAmount({ ...base, marks: [mark("2026-09-01", 1, "counted", null)], includeUnpaid: false }), 18750);
  assert.equal(R.marksAmount({ ...base, defaultDivisor: 10, marks: [mark("2026-09-01", 1, "counted", null)], includeUnpaid: false }), 22500);
  // mixed D
  assert.equal(R.marksAmount({ fee: 800000, percentHundredths: 5000, defaultDivisor: 12, includeUnpaid: false,
    marks: [counted("2026-09-05", 8), counted("2026-09-12", 8), counted("2026-09-19", 12)] }), 133333);
  assert.equal(R.marksAmount({ ...base, marks: [], includeUnpaid: true }), 0);
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
});

// ---- 7. the real shapes of the month, the warnings, the status ------------------------------------------------------

function month() {
  return {
    month: "2026-09", period_start: "2026-09-01", period_end: "2026-09-30", month_open: false, divisor: 12, lessons_without_teacher: 0,
    teachers: [
      { teacher_id: "t1", teacher_name: "Абдуллаев", lessons_count: 14,
        lesson_types: [{ lesson_type: "pair", groups: 1 }, { lesson_type: "group", groups: 2 }], rates: { group: "45" }, missing_rates: ["pair"], sheet: null,
        warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 } },
      { teacher_id: "t2", teacher_name: "Зайцев", lessons_count: 9,
        lesson_types: [{ lesson_type: "individual", groups: 3 }], rates: { individual: "60" }, missing_rates: [],
        sheet: { id: "s", revision: 2, total_amount: 900000, stale: false, updated_at: "2026-10-02T08:00:00" },
        warnings: { open_lessons: 2, pending_excused: 3, no_fee: 1, unpaid: 5 } },
    ],
  };
}

test("warnings are counts: one unit each (lessons, visits, students), the links lead where it is fixed, a zero shows nothing", () => {
  const views = (counts, options) => R.warningViews(counts, options);
  assert.deepEqual(views({ open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 }), []);
  assert.deepEqual(views({ open_lessons: null, pending_excused: 0, no_fee: 0, unpaid: 0 }), []);
  const all = views({ open_lessons: 1, pending_excused: 2, no_fee: 4, unpaid: 5 });
  assert.deepEqual(all.map((v) => [v.key, v.text, v.href, v.tone]), [
    ["open_lessons", "1 незакрытый урок", "/owner/attendance?tab=open", "warning"],
    ["pending_excused", "2 уважительные ждут решения", "/owner/attendance?tab=excuses", "warning"],
    ["no_fee", "у 4 учеников нет цены", "/owner/payments/prices", "warning"],
    ["unpaid", "5 посещений без оплаты", "/owner/payments?bucket=debt", "info"],
  ]);
  assert.equal(views({ open_lessons: 3, pending_excused: 1, no_fee: 1, unpaid: 2 }).map((v) => v.text).join("|"), "3 незакрытых урока|1 уважительная ждёт решения|у 1 ученика нет цены|2 посещения без оплаты");
  assert.equal(views({ open_lessons: 7, pending_excused: 5, no_fee: 21, unpaid: 1 }).map((v) => v.text).join("|"), "7 незакрытых уроков|5 уважительных ждут решения|у 21 ученика нет цены|1 посещение без оплаты");
  // «140 посещений без оплаты», not «140 уроков не оплачено»: a lesson is held once, a visit is a student at it
  assert.equal(views({ open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 140 })[0].text, "140 посещений без оплаты");
  // a sheet that knows the one group it lacks a price in leads to that group's row
  assert.equal(views({ open_lessons: 0, pending_excused: 0, no_fee: 1, unpaid: 0 }, { noFeeHref: "/owner/payments/prices?group=g1" })[0].href, "/owner/payments/prices?group=g1");
  // the same words on a sheet (its counters are the same four)
  assert.equal(views(makeSheet().warnings).length, 3);
});

test("lessons without a teacher: a month-level warning, nothing at 0", () => {
  assert.equal(R.lessonsWithoutTeacherText(0), null);
  assert.equal(R.lessonsWithoutTeacherText(1), "1 урок без преподавателя — не войдёт в расчёт");
  assert.equal(R.lessonsWithoutTeacherText(3), "3 урока без преподавателя — не войдут в расчёт");
  assert.equal(R.lessonsWithoutTeacherText(12), "12 уроков без преподавателя — не войдут в расчёт");
  assert.equal(R.lessonsWithoutTeacherText(21), "21 урок без преподавателя — не войдёт в расчёт");
});

// ---- 8. editing an open sheet -----------------------------------------------------------------------------------

test("an untouched line shows the server's amount, an edited one the formula's preview", () => {
  const sheet = sheetOf();
  const clean = R.buildLineViews(sheet, R.EMPTY_EDITS);
  assert.deepEqual(clean.map((v) => v.amount), [37500, 0, 120000, 133333]);
  assert.deepEqual(clean.map((v) => v.edited), [false, false, false, false]);
  // include unpaid: 3 lessons now (450 000 x 50 % / 12 x 3)
  const edits = R.setIncludeEdit(R.EMPTY_EDITS, sheet, "m1", true);
  const views = R.buildLineViews(sheet, edits);
  assert.equal(views[0].amount, 56250);
  assert.equal(views[0].include, true);
  assert.equal(views[0].edited, true);
  assert.equal(views[2].amount, 120000);
  // the rate is the line's (the server's): a package line keeps its own divisors
  assert.equal(R.buildLineViews(sheet, R.setIncludeEdit(R.EMPTY_EDITS, sheet, "m4", true))[3].amount, 133333); // nothing unpaid there: no change
  // a sheet saved before UX-2 may carry a hand-set price: it still replaces the price of every lesson
  const manual = sheetOf({ lines: [line({ fee_overridden: true, monthly_fee: 600000, source_fee: 450000, amount: 50000 })] });
  assert.equal(R.buildLineViews(manual, R.setIncludeEdit(R.EMPTY_EDITS, manual, "m1", true))[0].amount, 75000); // 600 000 x 50 % / 12 x 3
  assert.equal(R.accruedUnpaid(R.buildLineViews(sheet, edits)), 1);
  assert.equal(R.accruedUnpaid(clean), 0);
});

test("edits drop themselves when they return to the saved value; a stranger's id is ignored", () => {
  const sheet = sheetOf();
  let edits = R.setIncludeEdit(R.EMPTY_EDITS, sheet, "m1", true);
  assert.equal(R.editsDirty(edits), true);
  edits = R.setIncludeEdit(edits, sheet, "m1", false);
  assert.equal(R.editsDirty(edits), false);
  assert.equal(R.setIncludeEdit(R.EMPTY_EDITS, sheet, "nope", true), R.EMPTY_EDITS);
  assert.deepEqual(Object.keys(R.EMPTY_EDITS), ["include"]); // UX-2: nothing else is edited on a sheet
});

test("blocks come from the server's groups (their date columns), students by name, sums follow the edits", () => {
  const sheet = sheetOf();
  const views = R.buildLineViews(sheet, R.EMPTY_EDITS);
  const blocks = R.buildBlocks(sheet, views);
  assert.deepEqual(blocks.map((b) => b.groupName), ["Алгебра 8А", "Индивидуально Сидоров", "Пара: Али и Вали"]);
  const [first, second, third] = blocks;
  assert.equal(first.lessonType, "group");
  assert.equal(first.lessonTime, "Пн, Ср 17:00");
  assert.deepEqual(first.columns.map((c) => c.date), ["2026-09-01", "2026-09-03", "2026-09-08", "2026-09-10"]);
  assert.deepEqual(first.lines.map((v) => v.line.student_name), ["Абдуллаев Жасур", "Каримова Дилноза"]);
  assert.equal(first.counted, 5);   // 3 + 2: «засчитано» is the server's `counted`
  assert.equal(first.unpaid, 1);
  assert.equal(first.amount, 37500);
  assert.equal(second.lessonType, "individual");
  assert.equal(third.lessonType, "pair");
  assert.equal(third.amount, 133333);
  assert.equal(R.markFor(first.lines[1].line, first.columns[1]).state, "excused_confirmed");
  assert.equal(R.markFor(first.lines[0].line, first.columns[0]).state, "not_in_group");
  // the total: the server's while clean, the sum of the lines once edited
  assert.equal(R.sheetTotal(sheet, views, R.EMPTY_EDITS), 290833);
  const edits = R.setIncludeEdit(R.EMPTY_EDITS, sheet, "m1", true);
  assert.equal(R.sheetTotal(sheet, R.buildLineViews(sheet, edits), edits), 309583);
  assert.equal(R.buildBlocks(sheet, R.buildLineViews(sheet, edits))[0].amount, 56250);
  // two lessons of a group in one day are two columns
  const twice = line({ marks: [counted("2026-09-01", 12), { ...counted("2026-09-01", 12), lesson_id: "other" }] });
  const doubled = sheetOf({ lines: [twice] });
  assert.equal(R.buildBlocks(doubled, R.buildLineViews(doubled, R.EMPTY_EDITS))[0].columns.length, 2);
});

// ---- 9. what goes to the server -----------------------------------------------------------------------------------

test("save body: only the lines whose «начислить» changed, a note, the revision and the fingerprint; no percent and no price", () => {
  const sheet = sheetOf();
  const edits = R.setIncludeEdit(R.setIncludeEdit(R.EMPTY_EDITS, sheet, "m1", true), sheet, "m2", true);
  assert.deepEqual(R.buildLineOverrides(sheet, edits), [
    { membership_id: "m1", include_unpaid: true },
    { membership_id: "m2", include_unpaid: true },
  ]);
  const body = R.buildSaveBody(sheet, edits, "  после справки  ", null);
  assert.deepEqual(body, {
    month: "2026-09", teacher_id: "t1",
    line_overrides: [{ membership_id: "m1", include_unpaid: true }, { membership_id: "m2", include_unpaid: true }],
    note: "после справки",
    expected_fingerprint: "abc", // the preview the owner is looking at
  });
  assert.equal("percents" in body, false); // the rate is the server's (set in «Сотрудники»)
  assert.equal(JSON.stringify(body).includes("monthly_fee"), false); // the price is not sent: the server rejects it
  // nothing edited, no note, no sheet yet: only the required fields, and no `revision` (the server answers 409 to one without a sheet)
  assert.deepEqual(Object.keys(R.buildSaveBody(sheet, R.EMPTY_EDITS, "", null)), ["month", "teacher_id", "expected_fingerprint"]);
  assert.equal("expected_fingerprint" in R.buildSaveBody({ ...sheet, source_fingerprint: "" }, R.EMPTY_EDITS, "", null), false);
  // a sheet that already exists travels with the revision the owner saw (required then)
  assert.equal(R.buildSaveBody(sheet, R.EMPTY_EDITS, "", 3).revision, 3);
  // the note is cut to 300 characters; blank is none
  assert.equal(R.cleanNote("x".repeat(400)).length, 300);
  assert.equal(R.cleanNote("   "), undefined);
});

test("patch body: the revision the owner saw, «начислить» only when edited, «Пересчитать» is recalculate: true, no percents", () => {
  const sheet = sheetOf();
  assert.deepEqual(R.buildPatchBody(sheet, R.EMPTY_EDITS, ""), { revision: 3 });
  assert.deepEqual(R.buildPatchBody(sheet, R.EMPTY_EDITS, "", { recalculate: true }), { revision: 3, recalculate: true });
  const body = R.buildPatchBody(sheet, R.setIncludeEdit(R.EMPTY_EDITS, sheet, "m1", true), "правка");
  assert.equal(body.revision, 3);
  assert.equal(body.note, "правка");
  assert.deepEqual(body.line_overrides, [{ membership_id: "m1", include_unpaid: true }]);
  assert.equal("percents" in body, false);
  assert.equal("recalculate" in body, false);
});

// ---- 10. errors and files -------------------------------------------------------------------------------------------

test("errors: detail {code, message}: 403 is «Недостаточно прав», the revision conflict asks to reload, the rest show detail.message", () => {
  assert.match(R.payrollErrorText({ status: 403 }), /^Недостаточно прав/);
  assert.equal(R.payrollErrorText({ status: 409, code: "SHEET_REVISION_CONFLICT", message: "Ведомость уже изменили. Обновите страницу и повторите правку." }), "Ведомость изменил другой пользователь — обновите");
  assert.equal(R.isRevisionConflict({ status: 409, code: "SHEET_REVISION_CONFLICT" }), true);
  assert.equal(R.isRevisionConflict({ status: 409 }), false); // branches on detail.code
  assert.equal(R.isRevisionConflict({ status: 500 }), false);
  assert.equal(R.isRevisionConflict(null), false);
  assert.equal(R.isRateRequired({ status: 422, code: "RATE_REQUIRED" }), true);
  assert.equal(R.isRateRequired({ status: 422, code: "PERCENT_REQUIRED" }), true);
  assert.equal(R.isRateRequired({ status: 422, code: "MONTH_INVALID" }), false);
  const rate = "Не задана ставка преподавателя: укажите её в «Сотрудниках»";
  assert.equal(R.payrollErrorText({ status: 422, code: "RATE_REQUIRED", message: rate }), rate);
  assert.equal(R.payrollErrorText({ status: 422, code: "MONTH_INVALID", message: "Месяц указывается в формате ГГГГ-ММ" }), "Месяц указывается в формате ГГГГ-ММ");
  assert.equal(R.payrollErrorText({ status: 422, code: "NOTHING_TO_CHANGE", message: "Нечего менять" }), "Нечего менять");
  assert.match(R.payrollErrorText({ status: 404 }), /не найдена/);
  assert.equal(R.payrollErrorText({ status: 404, code: "X", message: "Ведомость не найдена" }), "Ведомость не найдена");
  assert.equal(R.payrollErrorText({ status: 500, message: "Сервис временно недоступен" }), "Сервис временно недоступен");
  assert.equal(R.payrollErrorText(null), "Не удалось выполнить действие");
});

test("file name: Content-Disposition (UTF-8 and quoted), else the fallback; no paths in a name", () => {
  const name = R.filenameFromContentDisposition;
  assert.equal(name(`attachment; filename*=UTF-8''%D0%97%D0%B0%D1%80%D0%BF%D0%BB%D0%B0%D1%82%D0%B0_2026-09.xlsx`, "x.xlsx"), "Зарплата_2026-09.xlsx");
  assert.equal(name('attachment; filename="payroll_2026-09.xlsx"', "x.xlsx"), "payroll_2026-09.xlsx");
  assert.equal(name("attachment; filename=payroll.xlsx", "x.xlsx"), "payroll.xlsx");
  // what the server really sends: an ASCII name and the UTF-8 one; the UTF-8 one wins
  assert.equal(name(`attachment; filename="payroll.xlsx"; filename*=UTF-8''%D0%97%D0%B0%D1%80%D0%BF%D0%BB%D0%B0%D1%82%D0%B0.xlsx`, "x.xlsx"), "Зарплата.xlsx");
  assert.equal(name(null, "fallback.xlsx"), "fallback.xlsx");
  assert.equal(name("", "fallback.xlsx"), "fallback.xlsx");
  assert.equal(name("attachment", "fallback.xlsx"), "fallback.xlsx");
  assert.equal(name('attachment; filename=""', "fallback.xlsx"), "fallback.xlsx");
  assert.equal(name(`attachment; filename*=UTF-8''%E0%A4%A`, "fallback.xlsx"), "fallback.xlsx"); // a broken escape
  assert.equal(name('attachment; filename="../../etc/passwd"', "x.xlsx"), ".._.._etc_passwd");
  assert.equal(R.monthFileName("2026-09"), "Зарплата_2026-09.xlsx");
  assert.equal(R.sheetFileName("Иванов Пётр", "2026-09"), "Зарплата_Иванов_Пётр_2026-09.xlsx");
  assert.equal(R.sheetFileName('  A/B:"C"  ', "2026-09"), "Зарплата_A_B_C_2026-09.xlsx");
  assert.equal(R.sheetFileName(null, "2026-09"), "Зарплата_преподаватель_2026-09.xlsx");
});

// ---- 11. the sheet on the screen -------------------------------------------------------------------------------------

test("the sheet table: a block per group with its total, the price as text, the dates behind «По датам», nothing to type but «начислить»", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { PayrollSheetTable } = require(path.join(root, "src/components/payroll/sheet-table.tsx"));
  const sheet = sheetOf();
  const html = (props = {}) => renderToStaticMarkup(React.createElement(PayrollSheetTable, { sheet, edits: R.EMPTY_EDITS, editable: true, onEdits: () => {}, ...props }));
  const textOf = (markup) => plain(markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  const markup = html();
  const text = textOf(markup);
  for (const part of ["Алгебра 8А", "Группа", "Пн, Ср 17:00", "Индивидуально Сидоров", "Вт 18:00", "Пара: Али и Вали", "Парный", "Ученик", "Цена в месяц", "Засчитано", "Без оплаты", "Начислено",
    "ожидает: 1", "нет цены", "задать", "Итого по группе", "37 500 сум", "120 000 сум", "133 333 сум", "450 000 сум", "начислить", "По датам"]) {
    assert.ok(text.includes(part), `the sheet shows «${part}»`);
  }
  // no percent column, no «Итого» bar at the bottom (the card on top has the total), no capitals
  assert.doesNotMatch(markup, /<th[^>]*>\s*%\s*<\/th>/);
  assert.doesNotMatch(markup, /ИТОГО|uppercase|payroll-total/);
  // the dates are folded: no date columns, no legend, no marks
  for (const part of ["01.09", "03.09", "Ждёт"]) assert.ok(!text.includes(part), `«${part}» is behind «По датам»`);
  assert.doesNotMatch(markup, /aria-label="Обозначения"/);
  assert.doesNotMatch(markup, /sticky left-0/);
  // the only inputs are the «начислить» checkboxes; the price is not typed any more
  const inputs = markup.match(/<input[^>]*>/g) || [];
  assert.ok(inputs.length > 0 && inputs.every((tag) => /type="checkbox"/.test(tag)), "only checkboxes");
  assert.doesNotMatch(markup, /placeholder=|изменена|aria-label="Оплата в месяц/);
  assert.match(markup, /aria-label="Начислить за неоплаченные уроки \(1\): Каримова Дилноза, Алгебра 8А"/);
  // «нет цены» leads to the price page of that group
  assert.match(markup, /href="\/owner\/payments\/prices\?group=g1"/);
  // the individual price is a tag, the group's is not
  const priced = html({ sheet: sheetOf({ lines: [line({ price_source: "override" }), line({ membership_id: "m5", student_name: "Яковлев", price_source: "group" })] }) });
  assert.equal((priced.match(/>индивидуальная</g) || []).length, 2); // the price cell and the phone line under the name
  // the toggle opens the grid: dates, marks and the legend appear, the first column sticks, the table scrolls inside its block
  const open = html({ forceDates: true });
  const openText = textOf(open);
  for (const part of ["01.09", "03.09", "08.09", "10.09", "Ждёт", "засчитан", "не оплачен"]) assert.ok(openText.includes(part), `the grid shows «${part}»`);
  assert.match(open, /aria-label="Обозначения"/);
  assert.match(open, /sticky left-0/);
  assert.match(open, /overflow-x-auto/);
  assert.match(open, /print:overflow-visible/);
  assert.match(open, /text-rose-600/);
  assert.match(open, /bg-amber-100/);
  // «начислить» shows in the line and the group at once
  const edited = textOf(html({ edits: R.setIncludeEdit(R.EMPTY_EDITS, sheet, "m1", true) }));
  assert.ok(edited.includes("56 250 сум"));
  // read-only: no inputs
  assert.doesNotMatch(html({ editable: false }), /<input/);
  // a sheet with no lines says so
  const empty = renderToStaticMarkup(React.createElement(PayrollSheetTable, { sheet: { ...sheet, lines: [], groups: [] }, edits: R.EMPTY_EDITS, onEdits: () => {} }));
  assert.match(empty, /нет учеников с засчитанными уроками/);
});

test("the warnings, the diff details and the history render the real shapes", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { DiffDetails, WarningLinks, RevisionList } = require(path.join(root, "src/components/payroll/sheet-controls.tsx"));
  const text = (node) => plain(renderToStaticMarkup(node).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  const links = renderToStaticMarkup(React.createElement(WarningLinks, { views: R.warningViews({ open_lessons: 2, pending_excused: 0, no_fee: 1, unpaid: 0 }), label: "Предупреждения" }));
  assert.match(links, /href="\/owner\/attendance\?tab=open"/);
  assert.match(links, /href="\/owner\/payments\/prices"/);
  assert.doesNotMatch(links, /tab=excuses/);
  assert.equal((links.match(/<ul/g) || []).length, 1); // one line, one list
  assert.match(links, /aria-label="Что это значит"/); // one «?» for all of them
  assert.equal(renderToStaticMarkup(React.createElement(WarningLinks, { views: R.warningViews({ open_lessons: null, pending_excused: 0, no_fee: 0, unpaid: 0 }), label: "x" })), "");

  const brief = (over) => ({ monthly_fee: 450000, percent: "50", counted: 3, unpaid: 1, pending_excused: 0, amount: 50000, ...over });
  const diff = {
    sheet_id: "s", revision: 3, stale: true, saved_total: 100000, fresh_total: 120000, delta_amount: 20000,
    reasons: ["ставка 50% → 45%", "цена из «Цен групп» вместо ручной 450 000"],
    lines: [
      { membership_id: "m1", student_name: "Абдуллаев", group_name: "Алгебра 8А", status: "changed", changes: ["засчитано", "начислено"], saved: brief({}), fresh: brief({ counted: 4, unpaid: 0, amount: 62500 }), delta_amount: 12500 },
      { membership_id: "m2", student_name: "Новый", group_name: "Алгебра 8А", status: "added", changes: [], saved: null, fresh: brief({ amount: 100 }), delta_amount: 100 },
      { membership_id: "m3", student_name: "Ушёл", group_name: "Алгебра 8А", status: "removed", changes: [], saved: brief({}), fresh: null, delta_amount: -50000 },
    ],
  };
  const details = text(React.createElement(DiffDetails, { diff }));
  for (const part of ["Что изменилось", "ставка 50% → 45%", "цена из «Цен групп» вместо ручной 450 000", "Абдуллаев", "изменилось: засчитано, начислено", "новая строка", "строки больше нет", "+12 500 сум", "−50 000 сум", "Без оплаты"]) {
    assert.ok(details.includes(part), `the details show «${part}»`);
  }
  assert.match(renderToStaticMarkup(React.createElement(DiffDetails, { diff })), /<details/); // closed until asked
  assert.equal(renderToStaticMarkup(React.createElement(DiffDetails, { diff: { ...diff, reasons: [], lines: [] } })), "");
  const revisions = text(React.createElement(RevisionList, { currentRevision: 3, revisions: [
    { revision: 3, total_amount: 150, percents: { group: "50" }, line_count: 4, changed_by: "u", changed_by_name: "Владелец", changed_at: "2026-10-15T08:55:00", change_note: "после справки" },
    { revision: 2, total_amount: 100, percents: {}, line_count: 4, changed_by: "u", changed_by_name: null, changed_at: null, change_note: null },
  ] }));
  for (const part of ["Версия 3", "текущая", "15.10.2026 13:55", "Владелец", "строк: 4", "после справки", "Ставка: Группа 50%", "Версия 2"]) assert.ok(revisions.includes(part), `the history shows «${part}»`);
  assert.ok(!revisions.includes("Редакция") && !revisions.includes("редакция"), "«редакция» is not a word of the owner");
  assert.ok(text(React.createElement(RevisionList, { currentRevision: 1, revisions: [] })).includes("Сохранений пока нет"));
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
  assert.match(month, /<PayrollMonthSummary summary=\{summary\} month=\{month\} open=\{monthOpen\} payoutText=\{monthPayoutText\(month, teachers\)\} \/>/);
  assert.match(month, /<PayrollPageMenu divisor=\{overview\.divisor\} \/>/);
  assert.match(month, /aria-label=\{`\$\{action\.label\}: \$\{teacher\.teacher_name\}`\}/);
  assert.doesNotMatch(month, /type="checkbox"|Процент для|sanitizePercentTyping/); // no selection, no percent field
  assert.equal((month.match(/<RowMenu/g) || []).length, 1); // one button per row; the only «⋯» is «Отметить выплату» (LOGIC-A); Excel of a sheet is inside the sheet
  const sheetPage = read("src/components/payroll/payroll-sheet-page.tsx");
  assert.match(sheetPage, /useUnsavedGuard\(dirty, UNSAVED_TEXT\)/);
  assert.match(sheetPage, /История сохранений/);
  assert.match(sheetPage, /usePrintWithDates\(\)/);
  assert.match(sheetPage, /isRevisionConflict/);
  assert.match(sheetPage, /size: A4 landscape/);
  assert.match(read("src/components/payroll/sheet-summary.tsx"), /Пересчитать/);
  assert.match(read("src/components/payroll/sheet-controls.tsx"), /window\.print\(\)/);
  // a window.print() page hides the chrome
  assert.match(read("src/app/owner/layout.tsx"), /print:ml-0 print:p-0/);
  assert.match(read("src/components/layout/sidebar.tsx"), /print:hidden/);
});

test("the unsaved-changes guard covers closing the tab, links and the Back button", () => {
  const guard = read("src/lib/use-unsaved-guard.ts");
  assert.match(guard, /beforeunload/);
  assert.match(guard, /env\.document\.addEventListener\("click", onClick, true\)/);
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
  assert.match(page, /orgApi\.setPayrollDivisor\(buildDivisorBody\(parsed\.value, validFrom\)\)/);
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

// ---- 14. the API helpers against the real answers (fetch is stubbed) ---------------------------------------------------

test("the API helper: detail {code, message, ...} gives ApiError.message and .code; calculate returns the sheets; the file keeps its name", async () => {
  const { orgApi, ApiError } = require(path.join(root, "src/lib/api.ts"));
  const original = global.fetch;
  const calls = [];
  const answer = (status, body, headers = {}) => new Response(body instanceof Buffer ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
  let next = null;
  global.fetch = async (url, init) => { calls.push({ url: String(url), method: init && init.method, body: init && init.body }); return next(); };
  try {
    // 422 RATE_REQUIRED (the rate is set in «Сотрудники»)
    next = () => answer(422, { detail: { code: "RATE_REQUIRED", message: "Не задана ставка преподавателя: укажите её в «Сотрудниках»", missing: [{ teacher_id: "t1", lesson_type: "group", lesson_type_label: "Группа" }] } });
    const rate = await orgApi.calculatePayroll("2026-09", {}).then(() => null, (e) => e);
    assert.ok(rate instanceof ApiError);
    assert.equal(rate.status, 422);
    assert.equal(rate.code, "RATE_REQUIRED");
    assert.match(rate.message, /^Не задана ставка преподавателя/);
    assert.equal(R.isRateRequired(rate), true);
    assert.equal(R.payrollErrorText(rate), rate.message);
    assert.deepEqual(JSON.parse(calls.at(-1).body), {}); // no percents travel: the server takes the stored rates
    // 409 SHEET_REVISION_CONFLICT with current_revision
    next = () => answer(409, { detail: { code: "SHEET_REVISION_CONFLICT", message: "Ведомость уже изменили. Обновите страницу и повторите правку.", current_revision: 4 } });
    const conflict = await orgApi.patchPayrollSheet("s1", { revision: 3, recalculate: true }).then(() => null, (e) => e);
    assert.equal(conflict.status, 409);
    assert.equal(R.isRevisionConflict(conflict), true);
    assert.equal(R.payrollErrorText(conflict), "Ведомость изменил другой пользователь — обновите");
    assert.equal(calls.at(-1).method, "PATCH");
    assert.deepEqual(JSON.parse(calls.at(-1).body), { revision: 3, recalculate: true });
    // a 403 with a plain-string detail
    next = () => answer(403, { detail: "Недостаточно прав" });
    const forbidden = await orgApi.getPayrollMonth("2026-09").then(() => null, (e) => e);
    assert.equal(forbidden.status, 403);
    assert.match(R.payrollErrorText(forbidden), /^Недостаточно прав/);
    // calculate -> {month, month_open, sheets[]}: the sheets come out
    next = () => answer(200, { month: "2026-09", month_open: false, sheets: [makeSheet({ id: null, saved: false, revision: null })] });
    const sheets = await orgApi.calculatePayroll("2026-09", { teacher_ids: ["t1"] });
    assert.equal(sheets.length, 1);
    assert.equal(sheets[0].id, null);
    assert.equal(calls.at(-1).url.endsWith("/auth/org/payroll/months/2026-09/calculate"), true);
    assert.equal(calls.at(-1).method, "POST");
    // save: POST /org/payroll/sheets, the body as built
    next = () => answer(201, makeSheet());
    const saved = await orgApi.savePayrollSheet(R.buildSaveBody(makeSheet(), R.EMPTY_EDITS, "", 3));
    assert.equal(saved.revision, 3);
    assert.equal(calls.at(-1).url.endsWith("/auth/org/payroll/sheets"), true);
    assert.equal(JSON.parse(calls.at(-1).body).revision, 3);
    // the xlsx: bytes and the name from Content-Disposition (what the server sends: ASCII name + UTF-8 name)
    next = () => new Response(Buffer.from("PK"), { status: 200, headers: { "Content-Disposition": `attachment; filename="payroll_2026-09.xlsx"; filename*=UTF-8''%D0%97%D0%B0%D1%80%D0%BF%D0%BB%D0%B0%D1%82%D0%B0_2026-09.xlsx` } });
    const file = await orgApi.downloadPayrollMonth("2026-09", "fallback.xlsx");
    assert.equal(file.filename, "Зарплата_2026-09.xlsx");
    assert.equal((await file.blob.arrayBuffer()).byteLength, 2);
    assert.equal(calls.at(-1).url.endsWith("/auth/org/payroll/months/2026-09/export.xlsx"), true);
    next = () => new Response(Buffer.from("PK"), { status: 200 });
    assert.equal((await orgApi.downloadPayrollSheet("s1", "fallback.xlsx")).filename, "fallback.xlsx");
    // an xlsx that is refused: detail.message again
    next = () => answer(404, { detail: { code: "SHEET_NOT_FOUND", message: "Ведомость не найдена" } });
    const missing = await orgApi.downloadPayrollSheet("s1", "x.xlsx").then(() => null, (e) => e);
    assert.equal(missing.status, 404);
    assert.equal(missing.code, "SHEET_NOT_FOUND");
    assert.equal(missing.message, "Ведомость не найдена");
  } finally {
    global.fetch = original;
  }
});

test("the screens read the real shapes: stale, warnings as counts, lessons_without_teacher, groups with dates, no guessing layer", () => {
  const lib = read("src/lib/payroll.ts");
  assert.doesNotMatch(lib, /normalizeSheet|normalizeMonthOverview|normalizeDiff|normalizeRevisions|data_changed|readSheetSummary/);
  assert.doesNotMatch(read("src/lib/api.ts"), /normalizeSheet|normalizeMonthOverview|normalizeDiff|normalizeRevisions|normalizePayrollSettings/);
  const month = read("src/components/payroll/payroll-month-page.tsx");
  assert.match(month, /lessonsWithoutTeacherText\(overview\.lessons_without_teacher\)/);
  assert.match(read("src/components/payroll/how-it-works.tsx"), /payrollFormulaText\(divisor, priceLabel\)/);
  assert.match(month, /<WarningLinks views=\{warnings\}/);
  assert.match(month, /isRateRequired\(cause as PayrollErrorLike\)\) void load\(true\)/);
  const sheetPage = read("src/components/payroll/payroll-sheet-page.tsx");
  assert.match(sheetPage, /diff\?\.stale/);
  assert.match(sheetPage, /patchPayrollSheet\(sheet\.id, buildPatchBody\(sheet, edits, note, \{ recalculate, expectedFingerprint:/);
  assert.match(read("src/components/payroll/sheet-table.tsx"), /buildBlocks\(sheet, views\)/);
  // the types are the server's field names
  for (const field of ["lessons_without_teacher", "lessons_count", "period_start", "stale: boolean", "source_fee", "groups: PayrollGroupBlock[]", "dates: PayrollBlockDate[]",
    "saved_total", "fresh_total", "delta_amount", "line_count", "changes: string[]", "created_by_name"]) {
    assert.ok(lib.includes(field), `payroll.ts has «${field}»`);
  }
});

// ---- 15. PERCENT_REQUIRED on the sheet page: ask for the missing percents in the banner, retry with them ----------------

// ---- 16. R3 fixes ----------------------------------------------------------------------------------------------------

test("a teacher who creates a group for himself does not choose the kind: no select, no lesson_type in the request", () => {
  const modal = read("src/components/groups/group-create-modal.tsx");
  assert.match(modal, /\{!selfAssignTeacher && \(\s*<div>\s*<label htmlFor="group-lesson-type"/);
  assert.match(modal, /\.\.\.\(selfAssignTeacher \? \{\} : \{ lesson_type: form\.lesson_type \}\)/);
  assert.doesNotMatch(modal, /^\s+lesson_type: form\.lesson_type,/m);
  // the owner's and the administrator's forms keep it (the modal is shared)
  assert.match(modal, /LESSON_TYPES\.map/);
});

test("the revision-conflict banners carry the owner's text, with or without a code in the answer", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { ConflictBanner } = require(path.join(root, "src/components/payroll/sheet-controls.tsx"));
  for (const file of ["payroll-month-page.tsx", "payroll-sheet-page.tsx"]) {
    const source = read(`src/components/payroll/${file}`);
    assert.doesNotMatch(source, /payrollErrorText\(\{ status: 409 \}\)/, file);
    assert.match(source, /message=\{REVISION_CONFLICT_TEXT\}/, file);
  }
  const banner = (props) => plain(renderToStaticMarkup(React.createElement(ConflictBanner, { message: R.REVISION_CONFLICT_TEXT, onReload: () => {}, reloading: false, ...props })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  assert.ok(banner({}).includes("Ведомость изменил другой пользователь — обновите"));
  assert.ok(banner({}).includes("Обновить"));
  assert.ok(banner({ message: "Данные изменились после расчёта — пересчитайте и проверьте суммы", actionLabel: "Пересчитать" }).includes("Пересчитать"));
  // a 409 with no code is not claimed to be a conflict by the helper: the banners never ask it
  assert.equal(R.isRevisionConflict({ status: 409 }), false);
});

/** A browser's history for the guard: a stack, an asynchronous back(), popstate, listeners. */
function fakeBrowser() {
  const entries = [{ url: "https://app.test/owner/payroll?month=2026-09", state: { n: 0 } }, { url: "https://app.test/owner/payroll/s1", state: { n: 1 } }];
  let index = 1;
  const listeners = { popstate: new Set(), beforeunload: new Set() };
  const clicks = new Set();
  const queue = [];
  const confirms = [];
  const answers = [];
  const location = (key) => new URL(entries[index].url)[key];
  const traverse = (delta) => { index += delta; for (const listener of [...listeners.popstate]) listener({}); };
  const env = {
    window: {
      history: {
        get state() { return entries[index].state; },
        pushState(state, _unused, url) { entries.splice(index + 1); entries.push({ url: url ?? entries[index].url, state }); index = entries.length - 1; },
        back() { queue.push(-1); },
      },
      location: { get href() { return entries[index].url; }, get pathname() { return location("pathname"); }, get search() { return location("search"); }, get origin() { return location("origin"); } },
      confirm(message) { confirms.push(message); return answers.length ? answers.shift() : true; },
      addEventListener(type, listener) { listeners[type].add(listener); },
      removeEventListener(type, listener) { listeners[type].delete(listener); },
    },
    document: {
      addEventListener(type, listener) { if (type === "click") clicks.add(listener); },
      removeEventListener(type, listener) { if (type === "click") clicks.delete(listener); },
    },
  };
  return {
    env, entries, listeners, clicks, confirms, answers,
    get index() { return index; },
    get url() { return entries[index].url; },
    /** What the browser does with the queued history.back() calls. */
    flush() { while (queue.length) traverse(queue.shift()); },
    /** The user presses Back. */
    userBack() { traverse(-1); },
    click(href, over = {}) {
      const event = {
        defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
        target: { closest: () => ({ href, target: "", hasAttribute: () => false, ...(over.anchor ?? {}) }) }, stopped: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...over.event,
      };
      for (const listener of [...clicks]) listener(event);
      return event;
    },
  };
}
const { createUnsavedGuard } = require(path.join(root, "src/lib/use-unsaved-guard.ts"));

test("save, then Back: one press goes back (the sentinel is taken off when the page is clean)", () => {
  const browser = fakeBrowser();
  const guard = createUnsavedGuard(browser.env, () => "unsaved");
  guard.update(true);
  assert.equal(browser.entries.length, 3);                       // the sentinel sits on top of the page
  assert.equal(browser.index, 2);
  guard.update(false);                                           // saved
  assert.equal(browser.index, 2);                                // the back is on its way...
  browser.flush();
  assert.equal(browser.index, 1);                                // ...and has landed on the page
  assert.equal(browser.url, "https://app.test/owner/payroll/s1");
  assert.equal(browser.confirms.length, 0);                      // nobody was asked about our own back
  browser.userBack();
  assert.equal(browser.index, 0);                                // ONE press: on the previous page
  assert.equal(browser.url, "https://app.test/owner/payroll?month=2026-09");
  assert.equal(browser.confirms.length, 0);
  assert.equal(browser.listeners.beforeunload.size, 0);
  assert.equal(browser.clicks.size, 0);
});

test("dirty again after a save: Back is guarded again, «Остаться» keeps the page, «Уйти» leaves in one go", () => {
  const browser = fakeBrowser();
  const guard = createUnsavedGuard(browser.env, () => "unsaved");
  guard.update(true);
  guard.update(false);
  browser.flush();
  assert.equal(browser.index, 1);
  guard.update(true);                                            // edited again
  assert.equal(browser.entries.length, 3);
  assert.equal(browser.index, 2);
  assert.equal(browser.listeners.beforeunload.size, 1);
  browser.answers.push(false);                                   // «Остаться»
  browser.userBack();
  assert.deepEqual(browser.confirms, ["unsaved"]);
  assert.equal(browser.url, "https://app.test/owner/payroll/s1"); // still here
  assert.equal(browser.index, 2);                                 // the sentinel is back
  browser.answers.push(true);                                    // «Уйти»
  browser.userBack();
  assert.equal(browser.confirms.length, 2);
  browser.flush();
  assert.equal(browser.url, "https://app.test/owner/payroll?month=2026-09");
  assert.equal(browser.index, 0);
  // it asked once per press, and nothing more after leaving
  assert.equal(browser.confirms.length, 2);
});

test("discard edits also takes the sentinel off; a page that was never dirty never touches the history", () => {
  const browser = fakeBrowser();
  const guard = createUnsavedGuard(browser.env, () => "unsaved");
  guard.update(false);
  assert.equal(browser.entries.length, 2);
  browser.userBack();
  assert.equal(browser.confirms.length, 0);                      // a clean page is never asked about
  assert.equal(browser.index, 0);
  const second = fakeBrowser();
  const other = createUnsavedGuard(second.env, () => "unsaved");
  other.update(true);
  other.update(false);                                           // «Отменить правки»
  second.flush();
  assert.equal(second.index, 1);
  second.userBack();
  assert.equal(second.index, 0);
  assert.equal(second.confirms.length, 0);
  // dirty, clean, dirty before the browser has finished the first back: still exactly one sentinel, still guarded
  const third = fakeBrowser();
  const quick = createUnsavedGuard(third.env, () => "unsaved");
  quick.update(true);
  quick.update(false);
  quick.update(true);
  third.flush();
  assert.equal(third.entries.length, 3);
  assert.equal(third.index, 2);
  third.answers.push(false);
  third.userBack();
  assert.equal(third.confirms.length, 1);
  assert.equal(third.index, 2);
  assert.equal(third.confirms.length, 1);
  // dirty, clean, then clean again in the middle: no second back
  const fourth = fakeBrowser();
  const idle = createUnsavedGuard(fourth.env, () => "unsaved");
  idle.update(true);
  idle.update(false);
  idle.update(false);
  fourth.flush();
  assert.equal(fourth.index, 1);
});

test("links and closing the tab are asked about only while the page is dirty", () => {
  const browser = fakeBrowser();
  const guard = createUnsavedGuard(browser.env, () => "unsaved");
  assert.equal(browser.clicks.size, 0);
  guard.update(true);
  assert.equal(browser.clicks.size, 1);
  // another page: «Остаться» cancels the click before the router sees it, «Уйти» lets it through
  browser.answers.push(false);
  const stay = browser.click("https://app.test/owner/groups");
  assert.equal(stay.defaultPrevented, true);
  assert.equal(stay.stopped, true);
  browser.answers.push(true);
  const go = browser.click("https://app.test/owner/groups");
  assert.equal(go.defaultPrevented, false);
  assert.equal(browser.confirms.length, 2);
  // not a way out: the same page and query, another site, a new tab, a download, a modified click, a click on no link
  const asked = () => browser.confirms.length;
  const before = asked();
  assert.equal(browser.click("https://app.test/owner/payroll/s1#top").defaultPrevented, false);
  assert.equal(browser.click("https://elsewhere.test/x").defaultPrevented, false);
  assert.equal(browser.click("https://app.test/owner/groups", { anchor: { target: "_blank" } }).defaultPrevented, false);
  assert.equal(browser.click("https://app.test/owner/groups", { anchor: { hasAttribute: () => true } }).defaultPrevented, false);
  assert.equal(browser.click("https://app.test/owner/groups", { event: { ctrlKey: true } }).defaultPrevented, false);
  assert.equal(browser.click("https://app.test/owner/groups", { event: { button: 1 } }).defaultPrevented, false);
  assert.equal(browser.click("https://app.test/owner/groups", { event: { target: {} } }).defaultPrevented, false);
  assert.equal(asked(), before);
  // the tab: the browser's own question
  assert.equal(browser.listeners.beforeunload.size, 1);
  const unload = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
  [...browser.listeners.beforeunload][0](unload);
  assert.equal(unload.prevented, true);
  assert.equal(unload.returnValue, "");
  // clean: no listeners; disposing removes the popstate one too
  guard.update(false);
  assert.equal(browser.clicks.size, 0);
  assert.equal(browser.listeners.beforeunload.size, 0);
  assert.equal(browser.listeners.popstate.size, 1);
  guard.dispose();
  assert.equal(browser.listeners.popstate.size, 0);
  assert.match(read("src/lib/use-unsaved-guard.ts"), /createUnsavedGuard\(/);
});

test("the data moved after the preview / the diff: the fingerprint is sent, a 409 SHEET_DATA_CHANGED asks to recalculate (stubbed fetch)", async () => {
  const { orgApi } = require(path.join(root, "src/lib/api.ts"));
  const original = global.fetch;
  const bodies = [];
  const answer = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const message = "Данные изменились после расчёта — пересчитайте и проверьте суммы";
  let step = 0;
  global.fetch = async (url, init) => {
    bodies.push({ url: String(url), body: JSON.parse(init.body) });
    step += 1;
    return step <= 2 ? answer(409, { detail: { code: "SHEET_DATA_CHANGED", message, source_fingerprint: "fresh-fp" } }) : answer(200, makeSheet({ revision: 4, source_fingerprint: "fresh-fp" }));
  };
  try {
    const preview = makeSheet({ id: null, saved: false, revision: null, source_fingerprint: "old-fp" });
    // the preview save always carries the fingerprint of the preview the owner looks at (and the revision of an existing sheet)
    const refused = await orgApi.savePayrollSheet(R.buildSaveBody(preview, R.EMPTY_EDITS, "", 3)).then(() => null, (e) => e);
    assert.equal(bodies[0].body.expected_fingerprint, "old-fp");
    assert.equal(bodies[0].body.revision, 3);
    assert.equal(R.isDataChanged(refused), true);
    assert.equal(R.isRevisionConflict(refused), false);
    assert.equal(R.payrollErrorText(refused), message);              // the server's words
    assert.equal(R.freshFingerprintOf(refused), "fresh-fp");
    // «Пересчитать»: only with recalculate, and only when there is a fingerprint to expect
    const sheet = makeSheet();
    assert.equal(R.buildPatchBody(sheet, R.EMPTY_EDITS, "", { recalculate: true, expectedFingerprint: "diff-fp" }).expected_fingerprint, "diff-fp");
    assert.equal("expected_fingerprint" in R.buildPatchBody(sheet, R.EMPTY_EDITS, "", { expectedFingerprint: "diff-fp" }), false);
    assert.equal("expected_fingerprint" in R.buildPatchBody(sheet, R.EMPTY_EDITS, "", { recalculate: true }), false);
    assert.equal("expected_fingerprint" in R.buildPatchBody(sheet, R.EMPTY_EDITS, "", { recalculate: true, expectedFingerprint: null }), false);
    const recalculated = await orgApi.patchPayrollSheet("sheet-1", R.buildPatchBody(sheet, R.EMPTY_EDITS, "", { recalculate: true, expectedFingerprint: "diff-fp" })).then(() => null, (e) => e);
    assert.deepEqual(bodies[1].body, { revision: 3, recalculate: true, expected_fingerprint: "diff-fp" });
    assert.equal(R.freshFingerprintOf(recalculated), "fresh-fp");
    // the retry expects what the 409 reported
    const retried = await orgApi.patchPayrollSheet("sheet-1", R.buildPatchBody(sheet, R.EMPTY_EDITS, "", { recalculate: true, expectedFingerprint: R.freshFingerprintOf(recalculated) }));
    assert.equal(bodies[2].body.expected_fingerprint, "fresh-fp");
    assert.equal(retried.revision, 4);
    assert.equal(R.freshFingerprintOf({ status: 409, code: "SHEET_DATA_CHANGED", detail: {} }), null);
    assert.equal(R.freshFingerprintOf(null), null);
  } finally {
    global.fetch = original;
  }
  // the screens: a data-changed banner with «Пересчитать» on both, the carry-over words on the month page
  const month = read("src/components/payroll/payroll-month-page.tsx");
  assert.match(month, /isDataChanged\(error\)\) patchPreview\(teacherId, \{ saving: false, dataChanged: payrollErrorText\(error\) \}\)/);
  assert.match(month, /actionLabel="Пересчитать"/);
  assert.match(month, /savedRevisionLine\(activeExisting\.revision\)/); // one compact line (#104); the words are tested in n13-p4-price
  const page = read("src/components/payroll/payroll-sheet-page.tsx");
  assert.match(page, /isDataChanged\(error\)\) setDataChanged/);
  assert.match(page, /expectedFingerprint: fingerprint/);
  assert.match(page, /actionLabel=\{dataChanged\.actionLabel \?\? "Пересчитать"\}/);
  assert.match(page, /await loadDiff\(\)/);
});

test("a sheet with no lines cannot be saved: the button is off and says why; the bar exists only while there is something to save", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { SaveBar } = require(path.join(root, "src/components/payroll/sheet-controls.tsx"));
  const render = (props) => renderToStaticMarkup(React.createElement(SaveBar, {
    dirty: true, problem: null, saving: false, note: "", onNote: () => {}, onSave: () => {}, onDiscard: () => {}, ...props,
  }));
  const button = (markup) => /<button[^>]*>(?:(?!<\/button>).)*Сохранить/.exec(markup.replace(/\n/g, " "))[0];
  assert.equal(render({ dirty: false }), ""); // nothing edited: no bar
  const blocked = render({ blockedReason: R.EMPTY_SHEET_REASON });
  assert.equal(R.EMPTY_SHEET_REASON, "Нет уроков для расчёта");
  assert.match(button(blocked), /disabled=""/);
  assert.match(button(blocked), /title="Нет уроков для расчёта"/);
  const ready = render({});
  assert.doesNotMatch(button(ready), /disabled=""/);
  assert.doesNotMatch(button(ready), /title=/);
  assert.match(ready, /Примечание к версии/);
  for (const file of ["payroll-month-page.tsx", "payroll-sheet-page.tsx"]) {
    assert.match(read(`src/components/payroll/${file}`), /blockedReason=\{[a-z.]*sheet\.lines\.length === 0 \? EMPTY_SHEET_REASON : null\}/, file);
  }
});
