// UX-2 «Зарплата» (frontend): the rate of a teacher is set in «Сотрудники» (one place), the month page is a read-only table with ONE
// status and ONE action per row, the sheet has a card with the total, the price is text, the dates are behind «По датам».
// Helpers (units, status -> action, the summary line, the rate line, the month select), the API routes, the rendered card and the source contracts.
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
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const R = require(path.join(root, "src/lib/payroll.ts"));
/** Normal spaces instead of the non-breaking ones: what the user reads. */
const plain = (text) => text.replace(/[\u00a0\u202f]/g, " ");
const textOf = (html) => plain(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

// ── units: a lesson is held once, a visit is a student at it ─────────────────────────────────

test("units: «посещений» for what is counted per student, «уроков» for the lessons held, «учеников» for who lacks a price", () => {
  assert.equal(R.visitsText(1), "1 посещение");
  assert.equal(R.visitsText(2), "2 посещения");
  assert.equal(R.visitsText(5), "5 посещений");
  assert.equal(R.visitsText(11), "11 посещений");
  assert.equal(R.visitsText(21), "21 посещение");
  assert.equal(R.visitsText(140), "140 посещений");
  assert.equal(R.lessonsOfMonthText(1), "1 урок за месяц");
  assert.equal(R.lessonsOfMonthText(21), "21 урок за месяц");
  assert.equal(R.lessonsOfMonthText(22), "22 урока за месяц");
  assert.equal(R.lessonsOfMonthText(25), "25 уроков за месяц");
  // the month row never says «уроков» about the visits, nor the other way round
  const line = R.warningViews({ open_lessons: 1, pending_excused: 0, no_fee: 3, unpaid: 140 }).map((v) => v.text).join(" · ");
  assert.equal(line, "1 незакрытый урок · у 3 учеников нет цены · 140 посещений без оплаты");
});

// ── status -> chip -> action ─────────────────────────────────────────────────────────────────

test("status: one chip («Не рассчитано» / «Сохранено 16.10» / «Есть изменения») and one action by it", () => {
  const none = R.sheetStatus(null);
  assert.deepEqual([none.tone, none.label], ["none", "Не рассчитано"]);
  const saved = R.sheetStatus({ stale: false, updated_at: "2026-10-16T03:56:00" });
  assert.deepEqual([saved.tone, saved.label], ["saved", "Сохранено 16.10"]);
  // the business calendar, not the device's: 20:30 UTC is already the next day in Tashkent
  assert.equal(R.sheetStatus({ stale: false, updated_at: "2026-10-16T20:30:00" }).label, "Сохранено 17.10");
  assert.equal(R.sheetStatus({ stale: false, updated_at: null }).label, "Сохранено");
  const changed = R.sheetStatus({ stale: true, updated_at: "2026-10-16T03:56:00" });
  assert.deepEqual([changed.tone, changed.label], ["changed", "Есть изменения"]);
  for (const status of [none, saved, changed]) assert.ok(!("detail" in status), "no second line under the chip");
  assert.deepEqual([R.rowAction(null).kind, R.rowAction({ stale: false }).kind, R.rowAction({ stale: true }).kind], ["calculate", "open", "open"]);
  assert.deepEqual([R.rowAction(null).label, R.rowAction({ stale: false }).label, R.rowAction({ stale: true }).label], ["Рассчитать", "Открыть", "Открыть"]);
  assert.equal(R.versionLabel(3), "версия 3");
});

// ── the summary line of the month ────────────────────────────────────────────────────────────

test("«Рассчитать всех» computes only the teachers WITHOUT a saved sheet; the rate gate applies to them alone", () => {
  const t = (id, sheet, missing = []) => ({ teacher_id: id, missing_rates: missing, sheet: sheet ? { stale: sheet === "stale" } : null });
  const teachers = [t("a", "clean"), t("b", "stale"), t("c", null), t("d", null, ["group"])];
  assert.deepEqual(R.calculationScope(teachers).map((x) => x.teacher_id), ["c", "d"]);
  // a saved teacher with a missing rate does not block; an unsaved one does
  const gate = R.calculationGate(teachers);
  assert.deepEqual([gate.ready, gate.missing, gate.total, gate.text], [false, 1, 2, "Не задана ставка у 1 преподавателя"]);
  assert.equal(R.calculationGate([t("a", "clean", ["group"]), t("c", null)]).ready, true);
  // everybody has a saved sheet (clean or changed): off, with the one line
  const saved = R.calculationGate([t("a", "clean"), t("b", "stale")]);
  assert.deepEqual([saved.ready, saved.total, saved.text], [false, 0, "Все ведомости месяца сохранены"]);
  assert.equal(R.ALL_SAVED_TEXT, "Все ведомости месяца сохранены");
  // nobody at all: off, no hint
  assert.deepEqual(R.calculationGate([]), { ready: false, missing: 0, total: 0, text: null });
  // the page sends exactly this scope
  assert.match(read("src/components/payroll/payroll-month-page.tsx"), /calculate\(calculationScope\(teachers\)\.map\(\(teacher\) => teacher\.teacher_id\), true\)/);
});

test("the summary line: «К выплате за сентябрь: N сум · сохранено X из Y» (the sum of the SAVED sheets)", () => {
  const sheet = (total, stale = false) => ({ sheet: { total_amount: total, stale } });
  const teachers = [sheet(900000), sheet(510415, true), { sheet: null }];
  assert.equal(plain(R.monthSummaryText("2026-09", teachers)), "К выплате за сентябрь: 1 410 415 сум · сохранено 2 из 3");
  assert.equal(R.monthSummaryText("2026-03", [{ sheet: null }, { sheet: null }]), "К выплате за март: — · сохранено 0 из 2");
  assert.equal(plain(R.monthSummaryText("2026-08", [sheet(1)])), "К выплате за август: 1 сум · сохранено 1 из 1");
  assert.deepEqual(R.monthSummary("2026-09", teachers), { label: "К выплате за сентябрь:", amount: 1410415, saved: "сохранено 2 из 3" });
});

// ── the rate: the month row and the card in «Сотрудники» ─────────────────────────────────────

test("the rate line of «Сотрудники»: «Ставка: Группа 50% · Индивидуально 40%», «Ставка не задана», a scheduled rate in brackets", () => {
  const item = (rates, lessonTypes, next) => ({ teacher_id: "t1", teacher_name: "Иванов", lesson_types: lessonTypes, rates, next });
  const set = (percent) => ({ percent, valid_from: "2026-09-01", set_by_name: "Владелец", set_at: "2026-09-02T05:00:00" });
  assert.deepEqual(R.rateItemLine(item({ group: set("50"), individual: set("40") }, ["group", "individual"])), { text: "Ставка: Группа 50% · Индивидуально 40%", missing: false });
  assert.deepEqual(R.rateItemLine(item({ group: null }, ["group"])), { text: "Ставка не задана", missing: true });
  assert.deepEqual(R.rateItemLine(item({}, [])), { text: "Ставка не задана", missing: true });
  assert.deepEqual(R.rateItemLine(item({ group: set("50"), individual: null }, ["group", "individual"])), { text: "Ставка: Группа 50% · Индивидуально не задана", missing: true });
  assert.equal(R.rateItemLine(item({ group: set("33.5") }, ["group"])).text, "Ставка: Группа 33,5%");
  // the order is the forms' («Группа» before «Индивидуально»), whatever the server's order is
  assert.equal(R.rateItemLine(item({ individual: set("40"), group: set("50") }, ["individual", "group"])).text, "Ставка: Группа 50% · Индивидуально 40%");
  // a rate that starts later is said with the month: «(с ноября 45%)»
  const later = R.rateItemLine(item({ group: set("50") }, ["group"], { group: { percent: "45", valid_from: "2026-11-01" } }));
  assert.equal(later.text, "Ставка: Группа 50% (с ноября 45%)");
  assert.equal(later.missing, false);
  assert.deepEqual(R.rateItemTypes(item({ group: set("50") }, ["individual"])), ["group", "individual"]);
  assert.equal(R.percentShort("50.00"), "50%");
  assert.equal(R.percentShort(null), "—");
  assert.equal(R.teacherRateHref("t 1"), "/owner/teachers?teacher=t%201");
});

test("the month select of the rate dialog: «С самого начала» on top, then half a year back, the current month, three ahead", () => {
  assert.equal(R.defaultRateMonth("2026-10-21"), "2026-10");
  const options = R.rateMonthOptions("2026-10-21");
  assert.equal(options.length, 11);
  assert.deepEqual(options[0], { value: "2020-01", label: "С самого начала" });
  assert.deepEqual([options[1].value, options[7].value, options[10].value], ["2026-04", "2026-10", "2027-01"]);
  assert.equal(options[7].label, "Октябрь 2026 г.");
  assert.ok(options.some((option) => option.value === R.defaultRateMonth("2026-10-21")), "the default is one of the options");
  assert.deepEqual(options.map((o) => o.value), [...options.map((o) => o.value)].sort());
  assert.match(R.RATE_PAST_NOTE, /Сохранённые ведомости не изменятся/);
  assert.equal(R.RATE_FIRST_NOTE, "Первая ставка действует и для прошлых месяцев");
  // the month the owner came from joins the list when it is older than half a year
  const old = R.rateMonthOptions("2026-10-21", "2025-12");
  assert.deepEqual(old.slice(0, 2).map((o) => o.value), ["2020-01", "2025-12"]);
  assert.equal(R.rateMonthOptions("2026-10-21", "2026-09").length, 11); // already there
  assert.equal(R.rateMonthOptions("2026-10-21", "junk").length, 11);
});

test("the default of «Действует с»: the first rate reaches the past; otherwise the current month, or the payroll month the owner came from", () => {
  const today = "2026-10-21";
  // no rate of ANY kind yet: from the very beginning, whatever month the link carries
  assert.equal(R.defaultRateFrom({ hasAnyRate: false, today }), "2020-01");
  assert.equal(R.defaultRateFrom({ hasAnyRate: false, today, month: "2026-09" }), "2020-01");
  // a rate of another kind exists: the current month, or the month of the page that sent the owner
  assert.equal(R.defaultRateFrom({ hasAnyRate: true, today }), "2026-10");
  assert.equal(R.defaultRateFrom({ hasAnyRate: true, today, month: "2026-09" }), "2026-09");
  assert.equal(R.defaultRateFrom({ hasAnyRate: true, today, month: "junk" }), "2026-10");
  // what counts as «has a rate»: in force or scheduled, any type
  const set = { percent: "50", valid_from: "2026-09-01" };
  assert.equal(R.hasAnyRate({ rates: { group: null, individual: null }, next: {} }), false);
  assert.equal(R.hasAnyRate({ rates: {}, next: null }), false);
  assert.equal(R.hasAnyRate({ rates: { group: set } }), true);
  assert.equal(R.hasAnyRate({ rates: { group: null }, next: { group: { percent: "45", valid_from: "2026-11-01" } } }), true);
  // the payroll links carry the month
  assert.equal(R.teacherRateHref("t1", "2026-09"), "/owner/teachers?teacher=t1&month=2026-09");
  assert.equal(R.teacherRateHref("t1"), "/owner/teachers?teacher=t1");
  assert.equal(R.teacherRateHref("t1", "junk"), "/owner/teachers?teacher=t1");
});

test("a rate that starts in 2020-01 reads «с самого начала» everywhere (the line, the scheduled one, the history, the sheet card)", () => {
  assert.equal(R.isRateFromStart("2020-01-01"), true);
  assert.equal(R.isRateFromStart("2020-01"), true);
  assert.equal(R.isRateFromStart("2020-02-01"), false);
  assert.equal(R.isRateFromStart(null), false);
  assert.equal(R.rateSinceText("2020-01-01"), "с самого начала");
  assert.equal(R.rateSinceText("2026-11-01"), "с ноября");
  assert.deepEqual(R.rateHistoryView({ lesson_type: "group", percent: "50", valid_from: "2020-01-01", set_by_name: "Владелец", set_at: "2026-10-02T05:00:00" }),
    { title: "Группа 50%", detail: "с самого начала · Владелец · 02.10.2026" });
  assert.doesNotMatch(R.rateHistoryView({ lesson_type: "group", percent: "50", valid_from: "2020-01-01" }).detail, /2020|января/);
  const item = { teacher_id: "t1", teacher_name: "И", lesson_types: ["group"], rates: { group: null }, next: { group: { percent: "45", valid_from: "2020-01-01" } } };
  assert.equal(R.rateItemLine(item).text, "Ставка: Группа не задана (с самого начала 45%)");
  const sheet = { lines: [{ lesson_type: "group" }], percents: { group: "50" }, counted_total: 1, unpaid_total: 0 };
  assert.equal(R.sheetRateLine(sheet, { group: { percent: "45", valid_from: "2020-01-01" } }), "Ставка: Группа 50% (в «Сотрудниках» с самого начала 45% — пересчитайте)");
});

test("the rate form: only the typed types, a comma is a dot, a rate cannot be emptied, nothing changed sends nothing", () => {
  const types = ["group", "individual"];
  const current = { group: "50", individual: null };
  const same = R.checkRateForm(types, { group: "50", individual: "" }, current);
  assert.deepEqual([same.errors, same.changed, same.percents], [{}, 0, { group: "50" }]);
  const both = R.checkRateForm(types, { group: "45,5", individual: "40" }, current);
  assert.deepEqual([both.errors, both.changed, both.percents], [{}, 2, { group: "45.5", individual: "40" }]);
  assert.deepEqual(R.ratePutBody("2026-10", both, current), { valid_from: "2026-10", percents: { group: "45.5", individual: "40" } });
  // the same value again is no change: it is not sent
  assert.deepEqual(R.ratePutBody("2026-10", R.checkRateForm(types, { group: "50.0", individual: "40" }, current), current).percents, { individual: "40" });
  assert.equal(R.ratePutBody("2026-11", both, current, "  с ноября ").note, "с ноября");
  // a rate that exists cannot be emptied; a wrong one says why
  assert.deepEqual(R.checkRateForm(types, { group: "", individual: "" }, current).errors, { group: R.RATE_REQUIRED_TEXT });
  assert.equal(R.RATE_REQUIRED_TEXT, "Укажите ставку");
  assert.equal(R.checkRateForm(types, { group: "101" }, current).errors.group, R.PERCENT_MAX_TEXT);
  assert.equal(R.checkRateForm(types, { group: "1,234" }, current).errors.group, R.PERCENT_FORMAT_TEXT);
});

test("the rate dialog offers all four kinds to a teacher with no groups; the diff names the rate change once", () => {
  assert.deepEqual(R.rateDialogTypes({ lesson_types: [], rates: {} }), ["group", "mini_group", "pair", "individual"]);
  assert.deepEqual(R.rateDialogTypes({ lesson_types: ["individual"], rates: { group: { percent: "50", valid_from: "2026-09-01" } } }), ["group", "individual"]);
  const diff = { reasons: ["ставка 50% → 45%"], rate_changes: [{ lesson_type: "group", saved_percent: "50", fresh_percent: "45", message: "ставка 50% → 45%" }, { lesson_type: "pair", saved_percent: "40", fresh_percent: null, message: "ставка Парный 40% больше не действует" }] };
  assert.deepEqual(R.diffReasons(diff), ["ставка 50% → 45%", "ставка Парный 40% больше не действует"]);
  assert.deepEqual(R.diffReasons({}), []);
});

test("the history of a rate: «Группа 50%» and «с 01.09.2026 · who · when · note»", () => {
  const view = R.rateHistoryView({ lesson_type: "group", percent: "50", valid_from: "2026-09-01", set_by_name: "Владелец", set_at: "2026-09-02T05:00:00", note: "из ведомости" });
  assert.deepEqual(view, { title: "Группа 50%", detail: "с 01.09.2026 · Владелец · 02.09.2026 · из ведомости" });
  assert.deepEqual(R.rateHistoryView({ lesson_type: "individual", percent: "33.5", valid_from: "2026-10-01" }), { title: "Индивидуально 33,5%", detail: "с 01.10.2026" });
});

// ── the card on top of the sheet ─────────────────────────────────────────────────────────────

test("the card status: unsaved edits, not saved yet, changed data with the difference, «Сохранено 16.10.2026 в 08:56»", () => {
  const base = { saved: true, stale: false, dirty: false, updatedAt: "2026-10-16T03:56:00", delta: null };
  const card = (input) => { const status = R.sheetCardStatus(input); return { ...status, text: plain(status.text) }; };
  assert.deepEqual(card(base), { tone: "saved", text: "Сохранено 16.10.2026 в 08:56", action: null });
  assert.deepEqual(R.sheetCardStatus({ ...base, saved: false, updatedAt: null }), { tone: "preview", text: "Не сохранено", action: "save" });
  assert.deepEqual(card({ ...base, stale: true, delta: -16666 }), { tone: "changed", text: "После сохранения изменились данные: −16 666 сум", action: "recalculate" });
  assert.equal(plain(R.sheetCardStatus({ ...base, stale: true, delta: 4000 }).text), "После сохранения изменились данные: +4 000 сум");
  assert.equal(R.sheetCardStatus({ ...base, stale: true, delta: 0 }).text, "После сохранения изменились данные, сумма та же");
  assert.equal(R.sheetCardStatus({ ...base, stale: true, delta: null }).text, "После сохранения изменились данные");
  // unsaved edits come first: the floating bar saves them, the card has no button then
  assert.deepEqual(R.sheetCardStatus({ ...base, stale: true, dirty: true }), { tone: "dirty", text: "Есть несохранённые правки", action: null });
  assert.deepEqual(R.sheetCardStatus({ ...base, saved: false, dirty: true }).action, null);
  // exactly one main action at any time
  for (const input of [base, { ...base, saved: false }, { ...base, stale: true }, { ...base, dirty: true }]) {
    assert.ok([null, "save", "recalculate"].includes(R.sheetCardStatus(input).action));
  }
});

test("the facts line: rate · counted · unpaid (accrued), in visits", () => {
  const sheet = { lines: [{ lesson_type: "group" }], percents: { group: "50" }, counted_total: 38, unpaid_total: 92 };
  assert.equal(R.sheetRateLine(sheet), "Ставка: Группа 50%");
  assert.deepEqual(R.sheetFactsParts(sheet, 7), ["Ставка: Группа 50%", "засчитано 38 посещений", "без оплаты 92 посещения (начислено 7)"]);
  assert.deepEqual(R.sheetFactsParts(sheet, 0), ["Ставка: Группа 50%", "засчитано 38 посещений", "без оплаты 92 посещения"]);
  assert.deepEqual(R.sheetFactsParts({ ...sheet, unpaid_total: 0 }, 0), ["Ставка: Группа 50%", "засчитано 38 посещений"]);
  assert.deepEqual(R.sheetFactsParts({ lines: [{ lesson_type: "group" }, { lesson_type: "individual" }], percents: { group: "50", individual: "40" }, counted_total: 1, unpaid_total: 1 }, 0),
    ["Ставка: Группа 50% · Индивидуально 40%", "засчитано 1 посещение", "без оплаты 1 посещение"]);
  assert.equal(R.sheetRateLine({ lines: [], percents: {} }), null);
  assert.equal(plain(R.formatSignedMoney(-16666)), "−16 666 сум");
});

test("the facts line says when the rate in force for the month is not the saved one", () => {
  const sheet = { lines: [{ lesson_type: "group" }, { lesson_type: "individual" }], percents: { group: "50", individual: "40" }, counted_total: 3, unpaid_total: 0 };
  const now = (group, individual) => ({ group: { percent: group, valid_from: "2026-10-01" }, individual: { percent: individual, valid_from: "2026-09-01" } });
  assert.equal(R.sheetRateLine(sheet, now("50", "40")), "Ставка: Группа 50% · Индивидуально 40%"); // equal: as before
  assert.equal(R.sheetRateLine(sheet, now("50.00", "40")), "Ставка: Группа 50% · Индивидуально 40%");
  assert.equal(R.sheetRateLine(sheet, now("45", "40")), "Ставка: Группа 50% (в «Сотрудниках» с октября 45% — пересчитайте) · Индивидуально 40%");
  assert.equal(R.sheetRateLine(sheet, { group: null }), "Ставка: Группа 50% · Индивидуально 40%"); // no rate in force known: nothing to say
  assert.equal(R.sheetRateLine(sheet, null), "Ставка: Группа 50% · Индивидуально 40%");
  assert.deepEqual(R.sheetFactsParts(sheet, 0, now("45", "40"))[0].includes("пересчитайте"), true);
  const page = read("src/components/payroll/payroll-sheet-page.tsx");
  assert.match(page, /orgApi\.getPayrollRates\(sheet\.month\)/);
  assert.match(page, /ratesNow=\{ratesNow\}/);
});

test("the page «Сотрудники» is called «Сотрудники», like the menu", () => {
  const page = read("src/app/owner/teachers/page.tsx");
  assert.match(page, /<h1[^>]*>Сотрудники<\/h1>/);
  assert.doesNotMatch(page, /Команда/);
});

test("unpaid says WHO: «9 учеников не оплатили часть уроков · 140 посещений»; without the number of students the old words", () => {
  assert.equal(R.unpaidWarningText(140, 9), "9 учеников не оплатили часть уроков · 140 посещений");
  assert.equal(R.unpaidWarningText(1, 1), "1 ученик не оплатил часть уроков · 1 посещение");
  assert.equal(R.unpaidWarningText(7, 3), "3 ученика не оплатили часть уроков · 7 посещений");
  assert.equal(R.unpaidWarningText(30, 21), "21 ученик не оплатил часть уроков · 30 посещений");
  assert.equal(R.unpaidWarningText(140), "140 посещений без оплаты");
  assert.equal(R.unpaidWarningText(140, 0), "140 посещений без оплаты");
  assert.equal(R.warningViews({ open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 140, unpaid_students: 9 })[0].text, "9 учеников не оплатили часть уроков · 140 посещений");
  assert.equal(R.warningViews({ open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 140 })[0].text, "140 посещений без оплаты");
  const sheet = { lines: [{ lesson_type: "group" }], percents: { group: "50" }, counted_total: 38, unpaid_total: 140, warnings: { unpaid_students: 9 } };
  assert.deepEqual(R.sheetFactsParts(sheet, 7).slice(1), ["засчитано 38 посещений", "без оплаты 140 посещений у 9 учеников (начислено 7)"]);
  assert.equal(R.sheetFactsParts({ ...sheet, warnings: { unpaid_students: 1 } }, 0)[2], "без оплаты 140 посещений у 1 ученика");
  assert.equal(R.sheetFactsParts({ ...sheet, warnings: {} }, 0)[2], "без оплаты 140 посещений");
});

test("a line saved with no price shows the price the recalculation will use (from the diff); the card's warnings are the fresh ones", () => {
  const brief = (fee) => ({ monthly_fee: fee, percent: "50", counted: 1, unpaid: 0, pending_excused: 0, amount: 0 });
  const diff = { lines: [
    { membership_id: "m1", status: "changed", changes: ["оплата"], saved: brief(null), fresh: brief(500000), delta_amount: 20833 },
    { membership_id: "m2", status: "changed", changes: ["оплата"], saved: brief(450000), fresh: brief(480000), delta_amount: 1 },
    { membership_id: "m3", status: "added", changes: [], saved: null, fresh: brief(400000), delta_amount: 1 },
    { membership_id: "m4", status: "changed", changes: [], saved: brief(null), fresh: brief(null), delta_amount: 0 },
  ] };
  assert.deepEqual(R.freshPricesOf(diff), { m1: 500000 });
  assert.deepEqual(R.freshPricesOf(null), {});
  const { PayrollSheetTable } = require(path.join(root, "src/components/payroll/sheet-table.tsx"));
  const { SheetSummaryCard } = require(path.join(root, "src/components/payroll/sheet-summary.tsx"));
  const mark = { date: "2026-09-01", lesson_id: "l1", mark: 1, state: "counted", divisor: 12 };
  const line = { membership_id: "m1", student_id: "s1", student_name: "Алиева", display_id: null, group_id: "g1", group_name: "Алгебра 7А", lesson_type: "group", lesson_time: null,
    monthly_fee: null, source_fee: null, percent: "50", divisor: 12, marks: [mark], counted: 1, unpaid: 0, pending_excused: 0, include_unpaid: false, amount: 0, warnings: [] };
  const sheet = { id: "s", saved: true, month: "2026-09", period_start: "2026-09-01", period_end: "2026-09-30", month_open: false, teacher_id: "t1", teacher_name: "К", revision: 1,
    percents: { group: "50" }, divisor_default: 12, lines: [line], groups: [{ group_id: "g1", group_name: "Алгебра 7А", lesson_type: "group", lesson_time: null, percent: "50", dates: [{ date: mark.date, lesson_id: "l1" }], line_count: 1, counted: 1, unpaid: 0, total_amount: 0 }],
    total_amount: 0, counted_total: 1, unpaid_total: 0, pending_excused_total: 0, warnings: { open_lessons: null, pending_excused: 0, no_fee: 2, unpaid: 0 },
    source_fingerprint: "f", stale: true, note: null, created_by_name: null, created_at: null, updated_by_name: null, updated_at: "2026-10-01T05:00:00" };
  const plainTable = textOf(renderToStaticMarkup(React.createElement(PayrollSheetTable, { sheet, edits: R.EMPTY_EDITS, editable: true, onEdits: () => {} })));
  assert.ok(plainTable.includes("нет цены") && plainTable.includes("задать"));
  const fresh = textOf(renderToStaticMarkup(React.createElement(PayrollSheetTable, { sheet, edits: R.EMPTY_EDITS, editable: true, onEdits: () => {}, freshPrices: { m1: 500000 } })));
  assert.ok(fresh.includes("после пересчёта: 500 000 сум"));
  assert.ok(!fresh.includes("задать"), "the price exists today: nothing to set");
  const status = R.sheetCardStatus({ saved: true, stale: true, dirty: false, updatedAt: sheet.updated_at, delta: 1 });
  const card = (warnings) => textOf(renderToStaticMarkup(React.createElement(SheetSummaryCard, { sheet, total: 0, accrued: 0, status, busy: false, onPrimary: () => {}, onPrint: () => {}, warnings })));
  assert.ok(card(undefined).includes("у 2 учеников нет цены"), "a calculation not saved: the sheet's own counters");
  assert.ok(!card({ open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 }).includes("нет цены"), "today both have a price: no warning");
  assert.ok(!card(null).includes("нет цены"), "not known yet: nothing is said");
  assert.ok(card({ open_lessons: 0, pending_excused: 0, no_fee: 1, unpaid: 0 }).includes("у 1 ученика нет цены"));
  const page = read("src/components/payroll/payroll-sheet-page.tsx");
  assert.match(page, /orgApi\.getPayrollMonth\(sheet\.month\)/);
  assert.match(page, /warnings=\{warningsFailed \? undefined : freshWarnings\}/);
  assert.match(page, /freshPrices=\{diff\?\.stale \? freshPricesOf\(diff\) : undefined\}/);
});

test("the group block: the total of the group is the last row of its table, not the header; the «?» of the warnings stays with the last one", () => {
  const { PayrollSheetTable } = require(path.join(root, "src/components/payroll/sheet-table.tsx"));
  const { WarningLinks } = require(path.join(root, "src/components/payroll/sheet-controls.tsx"));
  const mark = (date) => ({ date, lesson_id: `l${date}`, mark: 1, state: "counted", divisor: 12 });
  const line = (id, name, counted, unpaid, amount) => ({ membership_id: id, student_id: id, student_name: name, display_id: null, group_id: "g1", group_name: "Алгебра", lesson_type: "group", lesson_time: null,
    monthly_fee: 500000, source_fee: 500000, percent: "50", divisor: 12, marks: [mark("2026-09-01")], counted, unpaid, pending_excused: 0, include_unpaid: false, amount, warnings: [] });
  const lines = [line("a", "Алиева", 2, 0, 1000), line("b", "Назаров", 1, 3, 500)];
  const sheet = { id: "s", saved: true, month: "2026-09", period_start: "2026-09-01", period_end: "2026-09-30", month_open: false, teacher_id: "t1", teacher_name: "К", revision: 1,
    percents: { group: "50" }, divisor_default: 12, lines, groups: [{ group_id: "g1", group_name: "Алгебра", lesson_type: "group", lesson_time: "17:00", percent: "50", dates: [{ date: "2026-09-01", lesson_id: "l2026-09-01" }], line_count: 2, counted: 3, unpaid: 3, total_amount: 1500 }],
    total_amount: 1500, counted_total: 3, unpaid_total: 3, pending_excused_total: 0, warnings: { open_lessons: null, pending_excused: 0, no_fee: 0, unpaid: 3 },
    source_fingerprint: "f", stale: false, note: null, created_by_name: null, created_at: null, updated_by_name: null, updated_at: null };
  for (const forceDates of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(PayrollSheetTable, { sheet, edits: R.EMPTY_EDITS, editable: true, onEdits: () => {}, forceDates }));
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    assert.doesNotMatch(header, /Итого по группе/, "the header keeps the name, the tag, the time and «По датам»");
    assert.ok(textOf(header).includes("Алгебра") && textOf(header).includes("17:00"));
    const foot = html.slice(html.indexOf("<tfoot"), html.indexOf("</tfoot>"));
    assert.ok(textOf(foot).includes("Итого по группе"));
    assert.ok(textOf(foot).includes("1 500 сум"), "the sum under «Начислено»");
    assert.match(foot, /text-right[^>]*>1\s500/);
    assert.match(foot, /text-center[^>]*>3</); // counted
  }
  const links = renderToStaticMarkup(React.createElement(WarningLinks, { views: R.warningViews({ open_lessons: 1, pending_excused: 2, no_fee: 0, unpaid: 0 }), label: "x" }));
  const lastItem = links.slice(links.lastIndexOf("<li"));
  assert.match(lastItem, /whitespace-nowrap/);
  assert.ok(lastItem.includes("уважительные ждут решения") && lastItem.includes('aria-label="Что это значит"'), "the «?» is inside the last warning's item");
  assert.equal((links.match(/<li/g) || []).length, 2);
});

test("the card renders: the total big, one line of facts, the status and ONE main button; Excel and print are quiet", () => {
  const { SheetSummaryCard } = require(path.join(root, "src/components/payroll/sheet-summary.tsx"));
  const mark = (date, state) => ({ date, lesson_id: `l-${date}`, mark: 1, state, divisor: 12 });
  const line = {
    membership_id: "m1", student_id: "s1", student_name: "Каримова", display_id: null, group_id: "g1", group_name: "Алгебра", lesson_type: "group", lesson_time: null,
    monthly_fee: 450000, source_fee: 450000, percent: "50", divisor: 12, marks: [mark("2026-09-01", "counted")], counted: 38, unpaid: 92, pending_excused: 0, include_unpaid: false, amount: 1410415, warnings: [],
  };
  const sheet = {
    id: "s", saved: true, month: "2026-09", period_start: "2026-09-01", period_end: "2026-09-30", month_open: false, teacher_id: "t1", teacher_name: "Каримова", revision: 2,
    percents: { group: "50" }, divisor_default: 12, lines: [line], groups: [], total_amount: 1410415, counted_total: 38, unpaid_total: 92, pending_excused_total: 0,
    warnings: { open_lessons: 1, pending_excused: 0, no_fee: 0, unpaid: 92 }, source_fingerprint: "f", stale: false, note: null,
    created_by_name: null, created_at: null, updated_by_name: "Владелец", updated_at: "2026-10-16T03:56:00",
  };
  const props = (status, over = {}) => ({ sheet, total: 1410415, accrued: 7, status, busy: false, onPrimary: () => {}, onExcel: () => {}, exporting: false, onPrint: () => {}, ...over });
  const saved = renderToStaticMarkup(React.createElement(SheetSummaryCard, props(R.sheetCardStatus({ saved: true, stale: false, dirty: false, updatedAt: sheet.updated_at, delta: null }), { savedBy: "Владелец" })));
  const text = textOf(saved);
  for (const part of ["К выплате", "1 410 415 сум", "Ставка: Группа 50% · засчитано 38 посещений · без оплаты 92 посещения (начислено 7)", "Сохранено 16.10.2026 в 08:56", "Владелец", "Скачать Excel", "Печать", "1 незакрытый урок"]) {
    assert.ok(text.includes(part), `the card shows «${part}»`);
  }
  assert.equal((text.match(/без оплаты/g) || []).length, 1, "the unpaid count is said once (in the line of facts)");
  assert.match(saved, /data-testid="payroll-total"/);
  assert.equal(R.sheetMonthNote(true), "месяц ещё идёт, расчёт предварительный");
  assert.equal(R.sheetMonthNote(false), null);
  assert.ok(!/(Пересчитать|>Сохранить<)/.test(saved), "a saved sheet has no main button");
  const changed = renderToStaticMarkup(React.createElement(SheetSummaryCard, props(R.sheetCardStatus({ saved: true, stale: true, dirty: false, updatedAt: sheet.updated_at, delta: -16666 }), {
    diff: { sheet_id: "s", revision: 2, stale: true, saved_total: 1, fresh_total: 0, delta_amount: -16666, reasons: ["ставка 50% → 45%"], lines: [] },
  })));
  assert.ok(textOf(changed).includes("После сохранения изменились данные: −16 666 сум"));
  assert.equal((changed.match(/bg-primary-600/g) || []).length, 1, "exactly one main button");
  assert.match(changed, /Пересчитать/);
  assert.ok(textOf(changed).includes("Что изменилось"));
  assert.match(changed, /border-amber-200/);
  // a calculation not saved yet: «Сохранить» with the note, no Excel (there is no file yet)
  const preview = renderToStaticMarkup(React.createElement(SheetSummaryCard, props(R.sheetCardStatus({ saved: false, stale: null, dirty: false, updatedAt: null, delta: null }), { onExcel: undefined, onNote: () => {}, note: "" })));
  assert.ok(textOf(preview).includes("Не сохранено"));
  assert.ok(textOf(preview).includes("Сохранить"));
  assert.ok(!textOf(preview).includes("Скачать Excel"));
  assert.match(preview, /id="payroll-card-note"/);
  assert.equal((preview.match(/bg-primary-600/g) || []).length, 1);
  // unsaved edits: no button here, the floating bar has it
  const dirty = renderToStaticMarkup(React.createElement(SheetSummaryCard, props(R.sheetCardStatus({ saved: true, stale: true, dirty: true, updatedAt: sheet.updated_at, delta: null }))));
  assert.ok(textOf(dirty).includes("Есть несохранённые правки"));
  assert.equal((dirty.match(/bg-primary-600/g) || []).length, 0);
  // a blocked save says why
  const blocked = renderToStaticMarkup(React.createElement(SheetSummaryCard, props(R.sheetCardStatus({ saved: false, stale: null, dirty: false, updatedAt: null, delta: null }), { blockedReason: R.EMPTY_SHEET_REASON })));
  assert.match(blocked, /disabled=""[^>]*title="Нет уроков для расчёта"|title="Нет уроков для расчёта"[^>]*disabled=""/);
});

// ── the API: the rates, nothing but the teachers on calculate ────────────────────────────────

test("the API: the rates of a month, the PUT of one teacher, his history; calculate sends no percents", async () => {
  const { orgApi } = require(path.join(root, "src/lib/api.ts"));
  const original = global.fetch;
  const calls = [];
  const answer = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  let next = null;
  global.fetch = async (url, init) => { calls.push({ url: String(url), method: init && init.method, body: init && init.body }); return next(); };
  try {
    next = () => answer(200, { month: "2026-10", items: [{ teacher_id: "t1", teacher_name: "Иванов", lesson_types: ["group"], rates: { group: { percent: "50", valid_from: "2026-09-01" } }, next: {} }] });
    const rates = await orgApi.getPayrollRates("2026-10");
    assert.equal(rates.items[0].rates.group.percent, "50");
    assert.ok(calls.at(-1).url.endsWith("/auth/org/payroll/rates?month=2026-10"));
    next = () => answer(200, { teacher_id: "t1", teacher_name: "Иванов", lesson_types: ["group"], rates: { group: { percent: "45", valid_from: "2026-10-01" } }, next: {} });
    const saved = await orgApi.putPayrollRates("t1", { valid_from: "2026-10", percents: { group: "45" } });
    assert.equal(saved.rates.group.percent, "45");
    assert.ok(calls.at(-1).url.endsWith("/auth/org/payroll/rates/t1"));
    assert.equal(calls.at(-1).method, "PUT");
    assert.deepEqual(JSON.parse(calls.at(-1).body), { valid_from: "2026-10", percents: { group: "45" } });
    next = () => answer(200, [{ lesson_type: "group", percent: "45", valid_from: "2026-10-01", set_by_name: "Владелец", set_at: "2026-10-02T05:00:00", note: null }]);
    const history = await orgApi.getPayrollRateHistory("t1");
    assert.equal(history[0].percent, "45");
    assert.ok(calls.at(-1).url.endsWith("/auth/org/payroll/rates/t1/history"));
    next = () => answer(200, { month: "2026-10", month_open: true, sheets: [] });
    await orgApi.calculatePayroll("2026-10", {});
    assert.deepEqual(JSON.parse(calls.at(-1).body), {});
    // a refused PUT: the server's words
    next = () => answer(422, { detail: { code: "PERCENT_INVALID", message: "Процент не может быть больше 100" } });
    const refused = await orgApi.putPayrollRates("t1", { valid_from: "2026-10", percents: { group: "101" } }).then(() => null, (e) => e);
    assert.equal(R.payrollErrorText(refused), "Процент не может быть больше 100");
  } finally {
    global.fetch = original;
  }
});

// ── source contracts ─────────────────────────────────────────────────────────────────────────

test("«Сотрудники»: the rate line, «Изменить ставку», the dialog opens from ?teacher=, «Ставка сохранена»", () => {
  const page = read("src/app/owner/teachers/page.tsx");
  assert.match(page, /<Suspense fallback=\{null\}>/); // useSearchParams needs a boundary
  assert.match(page, /searchParams\?\.get\("teacher"\)/);
  assert.match(page, /orgApi\.getPayrollRates\(today\.slice\(0, 7\)\)/);
  assert.match(page, /Изменить ставку/);
  assert.match(page, /rateItemLine\(rates\[m\.user_id \|\| m\.id\]\)/);
  assert.match(page, /showToast\("Ставка сохранена"\)/);
  assert.match(page, /router\.replace\("\/owner\/teachers"/); // closing the dialog cleans the address
  assert.match(page, /openedFromLink/); // once per link: saving does not bring the dialog back
  const dialog = read("src/components/payroll/rate-dialog.tsx");
  assert.match(dialog, /import \{ Modal \} from "@\/components\/ui\/modal"/);
  assert.match(dialog, /Действует с/);
  assert.match(dialog, /История ставки/);
  assert.match(dialog, /rateMonthOptions\(today, month\)/);
  assert.match(dialog, /defaultRateFrom\(\{ hasAnyRate: hasAnyRate\(item\), today, month \}\)/);
  assert.match(dialog, /RATE_FIRST_NOTE/);
  assert.match(page, /searchParams\?\.get\("month"\)/);
  assert.match(page, /month=\{monthParam\}/);
  assert.match(dialog, /orgApi\.putPayrollRates\(item\.teacher_id, ratePutBody\(validFrom, checked, current\)\)/);
  assert.match(dialog, /orgApi\.getPayrollRateHistory\(item\.teacher_id\)/);
  assert.match(dialog, /disabled=\{saving \|\| checked\.changed === 0\}/);
});

test("the sheet page and the month page have no price field, no percent field, no «редакция»", () => {
  const files = ["payroll-month-page.tsx", "payroll-sheet-page.tsx", "sheet-table.tsx", "sheet-controls.tsx", "sheet-summary.tsx", "month-status.tsx"];
  for (const file of files) {
    const text = read(`src/components/payroll/${file}`);
    assert.doesNotMatch(text, /PercentEditor|MissingPercentBanner|FeeCell|setFeeEdit|setPercentEdit|percentFieldText|buildPercentsPayload|extraPercents/, file);
    assert.doesNotMatch(text, /редакци/i, file); // «версия N» lives in the history only; the tab is «История сохранений»
    assert.doesNotMatch(text, /изменена · было|Оплата в месяц: \$\{/, file);
  }
  assert.doesNotMatch(read("src/lib/payroll.ts"), /setFeeEdit|setPercentEdit|buildCalculateBody|percentFieldState|checkMissingPercents|missingTypesOf|suggested_percent|PERCENT_HINT_TEXT/);
  assert.doesNotMatch(read("src/lib/payroll-help.ts"), /priceFieldHint|priceStepsLines|priceSourceNote/);
  // the sheet page: the card, the groups, the history tab
  const sheetPage = read("src/components/payroll/payroll-sheet-page.tsx");
  assert.match(sheetPage, /<SheetSummaryCard/);
  assert.match(sheetPage, /label: "История сохранений"/);
  assert.match(sheetPage, /<RateRequiredNotice teacherId=\{sheet\.teacher_id\}/);
  // the date grid is behind a per-group toggle; the print opens it
  const table = read("src/components/payroll/sheet-table.tsx");
  assert.match(table, /showDates \? "Скрыть даты" : "По датам"/);
  assert.match(table, /forceDates \|\| openDates\.has\(key\)/);
  assert.match(read("src/components/payroll/sheet-controls.tsx"), /export function usePrintWithDates/);
  // the table: the shared header for the month, the ledger right-aligned in the sheet
  assert.match(table, /const HEAD = /);
  assert.match(table, /Цена в месяц|priceColumn/);
});
