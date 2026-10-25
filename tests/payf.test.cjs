// PAY-F (payments): the forecast of a package, «Выходной день центра», the recalculation for the lessons the centre cancelled, the names of the ways to count.
// Spec: artifacts/payf/PAY_F_SPEC.md (parts 1-4, scenarios 1-17); the server side is tested in auth-service (tests/test_payf_*.py).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const compile = (jsx) => (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText, filename);
};
require.extensions[".ts"] = compile(false);
require.extensions[".tsx"] = compile(true);
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const F = require(path.join(root, "src/lib/payf.ts"));
const P = require(path.join(root, "src/lib/payments.ts"));
const L = require(path.join(root, "src/lib/payments-ledger.ts"));
const S = require(path.join(root, "src/lib/settings-sections.ts"));
const plain = (text) => text.replace(/[  ]/g, " ");

const PACKAGE = { status: "active", period_mode: "lessons", lessons_total: 12, lessons_left: 12, paid_until: null, paid_through_forecast: "2026-10-30" };

// ---- part 1: the forecast ---------------------------------------------------------------------------------------------------------------------------------

test("1. a package says «хватит до ~30.10 (по расписанию)» next to «осталось 12 уроков из 12»", () => {
  assert.equal(F.forecastText(PACKAGE), "хватит до ~30.10 (по расписанию)");
  assert.equal(P.statusDetail(PACKAGE), "осталось 12 уроков из 12 · хватит до ~30.10 (по расписанию)");
  assert.equal(P.statusDetail({ ...PACKAGE, paid_through_forecast: "2026-11-02" }), "осталось 12 уроков из 12 · хватит до ~02.11 (по расписанию)");      // scenario 2
  assert.equal(P.statusDetail({ ...PACKAGE, paid_through_forecast: "2026-11-06" }), "осталось 12 уроков из 12 · хватит до ~06.11 (по расписанию)");      // scenario 3
  const chip = P.membershipChip({ ...PACKAGE, debt: 0, last_payment: { id: "p" } });
  assert.equal(chip.label, "Оплачено · осталось 12 уроков из 12 · хватит до ~30.10 (по расписанию)");
  assert.equal(chip.tone, "ok");
});

test("1. N = 0: «пакет закончился»; no forecast from an older server; a monthly mode never has one", () => {
  assert.equal(F.forecastText({ ...PACKAGE, lessons_left: 0, paid_through_forecast: null }), "пакет закончился");
  assert.equal(P.statusDetail({ ...PACKAGE, status: "expired", lessons_left: 0, paid_through_forecast: null }), "пакет закончился");
  assert.equal(F.forecastText({ ...PACKAGE, paid_through_forecast: undefined }), "");
  assert.equal(P.statusDetail({ ...PACKAGE, paid_through_forecast: undefined }), "осталось 12 уроков из 12");          // as before
  assert.equal(F.forecastText({ status: "active", period_mode: "calendar", paid_through_forecast: "2026-10-30" }), "");
  assert.equal(P.statusDetail({ status: "active", period_mode: "calendar", paid_until: "2026-11-04" }), "оплачено до 04.11.2026");
});

test("1. the amber chip of a package that runs out keeps the forecast too", () => {
  const chip = P.membershipChip({ ...PACKAGE, status: "expiring", lessons_left: 2, debt: 0, last_payment: { id: "p" }, paid_through_forecast: "2026-10-23" });
  assert.equal(chip.label, "Осталось 2 урока из 12 · хватит до ~23.10 (по расписанию)");
  assert.equal(chip.tone, "warning");
});

test("1. the forecast is on the list, the group tab and the student's block, and not on the receipt or the statement", () => {
  assert.match(read("src/components/payments/payments-page.tsx"), /statusDetail\(row\)/);
  assert.match(read("src/lib/group-payments.ts"), /chip: membershipChip\(row\)/);
  assert.match(read("src/components/payments/membership-payments.tsx"), /membershipChip\(row\)/);
  for (const file of ["src/components/payments/receipt-view.tsx", "src/lib/payments-ledger.ts"]) assert.doesNotMatch(read(file), /paid_through_forecast|forecastText/, file);
});

// ---- part 4: the names -----------------------------------------------------------------------------------------------------------------------------------------

test("4. ONE dictionary of the names: settings, hints and the statement read the same words", () => {
  assert.deepEqual(P.PAYMENT_MODELS.map((m) => [m.key, m.title]), [
    ["payment_date", "Свой месяц у каждого ученика"], ["fixed_day", "Общий месяц для всех"], ["lessons", "Пакет уроков"]]);
  assert.equal(P.PAYMENT_MODELS[0].hint, "Месяц считается с первого занятия ученика: 05.10 → 04.11");
  assert.equal(P.PAYMENT_MODELS[1].hint, "У всех один период, например с 1-го по последнее число; первый неполный месяц — по урокам");
  assert.match(P.PAYMENT_MODELS[2].hint, /отменённые уроки не списываются/);
  assert.equal(P.paymentModelTitle("fixed_day"), "Общий месяц для всех");
  // the statement's title of a package is taken from the dictionary, not typed again
  const words = L.chargeWords({ kind: "package", period_from: "2026-09-25", period_to: "2026-10-21", price: { amount: 500000, source: "group" }, days_text: null, lessons: { in_part: 12, in_period: 12 }, basis: "lessons" });
  assert.equal(words.title, `${P.paymentModelTitle("lessons")} 25.09–21.10 (12 из 12 уроков)`);
  // the old names are gone from every screen text
  const screens = ["src/lib/payments.ts", "src/lib/payments-ledger.ts", "src/app/owner/settings/page.tsx", "src/components/payments/centre-cancel-setting.tsx"].map(read).join("\n");
  assert.doesNotMatch(screens, /От даты оплаты|Единый день оплаты/);
  assert.match(P.validatePaymentSettings({ ...P.DEFAULT_PAYMENT_SETTINGS, billing_day: 40 }), /^День, с которого начинается общий месяц/);
});

// ---- part 3: the setting, the kind of a cancellation, the deduction -----------------------------------------------------------------------------

test("3. the setting «Уроки, отменённые центром» belongs to the monthly modes only, off by default, sent as a PATCH", () => {
  assert.equal(P.DEFAULT_PAYMENT_SETTINGS.centre_cancel_recalc, false);
  assert.ok(P.paymentsScopeKeys("payment_date").includes("centre_cancel_recalc") && P.paymentsScopeKeys("fixed_day").includes("centre_cancel_recalc"));
  assert.ok(!P.paymentsScopeKeys("lessons").includes("centre_cancel_recalc"));                     // a package never charges a cancelled lesson
  const on = { ...P.DEFAULT_PAYMENT_SETTINGS, centre_cancel_recalc: true };
  assert.deepEqual(P.diffPaymentSettings(P.DEFAULT_PAYMENT_SETTINGS, on, P.paymentsScopeKeys("payment_date")), { centre_cancel_recalc: true });
  const settings = read("src/lib/payf-settings.ts");
  assert.match(settings, /Уроки, отменённые центром, при помесячной оплате/);
  assert.match(settings, /label: "Не пересчитывать"/);
  assert.match(settings, /label: "Вычитать из следующей оплаты"/);
  assert.match(read("src/app/owner/settings/page.tsx"), /model !== "lessons" && <CentreCancelSetting/);
});

test("3. the dialog of a cancellation asks «По вине центра» (default) or «Праздник, выходной» and sends it", () => {
  assert.deepEqual(F.CANCELLATION_KINDS.map((k) => [k.key, k.label]), [["centre", "По вине центра"], ["holiday", "Праздник, выходной"]]);
  assert.equal(F.DEFAULT_CANCELLATION_KIND, "centre");
  for (const file of ["src/components/groups/lesson-action-sheet.tsx", "src/app/teacher/schedule/page.tsx", "src/app/teacher/dashboard/page.tsx", "src/components/attendance/cancel-missed-lesson-modal.tsx"]) {
    const source = read(file);
    assert.match(source, /<CancellationKindField/, file);
    assert.match(source, /cancellationKind/, file);
    assert.match(source, /DEFAULT_CANCELLATION_KIND/, file);
  }
  const api = read("src/lib/api.ts");
  assert.equal((api.match(/cancellationKind\?: CancellationKind/g) || []).length, 2);              // the lesson cancel and «Урока не было»
});

test("3. the deduction: «−46 000 сум: урок 21.10 отменён центром»; the statement row, the tile and the identity know it", () => {
  const line = { lesson_date: "2026-10-21", lesson_id: "lesson-wed", amount: 46000, text: "−46 000 сум: урок 21.10 отменён центром" };
  assert.equal(F.recalcText(line), line.text);
  assert.equal(plain(F.recalcText({ lesson_date: "2026-10-21", amount: 46000 })), "−46 000 сум: урок 21.10 отменён центром");        // built here when an older answer has no text
  assert.deepEqual(F.recalcLines([line, { ...line, lesson_id: "x", lesson_date: "2026-10-23", amount: 46000, text: "" }]).total, 92000);
  assert.deepEqual(F.recalcLines(undefined), { texts: [], total: 0 });
  const summary = { charged: 600000, paid: 0, transferred_in: 0, written_off: 0, recalculated: 46000, refunded: 0, transferred_out: 0, debt: 554000, advance: 0, paid_until: null, status: "none", reconciles: true };
  assert.equal(L.statementDiff(summary), 0);                                                         // charged - recalculated = debt
  assert.equal(L.statementReconciles(summary), true);
  assert.equal(L.statementReconciles({ ...summary, recalculated: 0 }), false);
  const tiles = L.statementTotals(summary);
  assert.deepEqual(tiles.map((t) => t.key), ["charged", "paid", "recalculated", "balance"]);
  assert.equal(tiles.find((t) => t.key === "recalculated").label, "Перерасчёт");
  assert.equal(L.statementTotals({ ...summary, recalculated: 0 }).some((t) => t.key === "recalculated"), false);       // only when there is something
  const row = { seq: 2, date: "2026-10-21", type: "recalc", title: "Перерасчёт: урок 21.10 отменён центром", debit: 0, credit: 46000, outflow: 0, balance_after: -554000, balance_text: "Долг 554 000",
    details: { allocations: [], recalc: line }, voided_at: null, voided_by_name: null, void_reason: null };
  assert.equal(L.STATEMENT_TYPE_LABEL.recalc, "Перерасчёт");
  assert.equal(plain(L.effectText(row)), "+46 000");
  assert.deepEqual(L.statementRowNotes(row), [line.text]);
  const norm = L.normalizeStatement({ membership: {}, as_of: "2026-10-25", mode: "calendar", accounting_start: "2026-09-01", summary, rows: [row], voided: [], upcoming: [] });
  assert.equal(norm.summary.recalculated, 46000);
  assert.equal(norm.rows[0].details.recalc.text, line.text);
  const entries = L.buildStatementItems(norm, null).filter((item) => item.kind === "row");
  assert.equal(entries[0].title, "Перерасчёт: урок 21.10 отменён центром");
  assert.equal(entries[0].tag, "перерасчёт");
  assert.equal(entries[0].paid, 46000);
  assert.equal(L.statementIconKind({ type: "recalc", cancelled: false, replaced: null }), "writeoff");
});

test("3. the preview keeps the deductions; the dialog and the receipt show them", () => {
  const raw = { as_of: "2026-10-25", mode: "calendar", price: {}, due: {}, suggested_amount: 554000, amount: null, result: null, warnings: [],
    recalc: [{ lesson_date: "2026-10-21", lesson_id: "lesson-wed", amount: 46000, text: "−46 000 сум: урок 21.10 отменён центром" }] };
  assert.equal(L.normalizePreview(raw).recalc.length, 1);
  assert.deepEqual(L.normalizePreview({ ...raw, recalc: undefined }).recalc, []);                    // an older server
  assert.match(read("src/components/payments/payment-dialog.tsx"), /<RecalcNote lines=\{latest\?\.recalc\}/);
  assert.match(read("src/components/payments/receipt-view.tsx"), /<RecalcNote lines=\{receipt\.recalc\}/);
  const note = read("src/components/payments/recalc-note.tsx");
  assert.match(note, /RECALC_HEADING/);
  assert.equal(F.RECALC_HEADING, "Перерасчёт за уроки, отменённые центром");
});

// ---- part 2: «Выходной день центра» ---------------------------------------------------------------------------------------------------------------------

test("2. the form: a date or a range of up to 14 days, a reason of 3 characters", () => {
  const ok = { dateFrom: "2026-10-21", dateTo: "", reason: "Хайит" };
  assert.equal(F.dayOffError(ok), null);
  assert.deepEqual(F.dayOffBody(ok), { dateFrom: "2026-10-21", dateTo: "2026-10-21", reason: "Хайит" });
  assert.deepEqual(F.dayOffBody({ ...ok, reason: "  Новый   год " }), { dateFrom: "2026-10-21", dateTo: "2026-10-21", reason: "Новый год" });
  assert.equal(F.dayOffError({ ...ok, dateTo: "2026-11-03" }), null);                                // 14 days
  assert.equal(F.dayOffError({ ...ok, dateTo: "2026-11-04" }), "Выходной — не больше 14 дней подряд");
  assert.equal(F.dayOffError({ ...ok, dateTo: "2026-10-20" }), "Конец выходного раньше его начала");
  assert.equal(F.dayOffError({ ...ok, reason: "ab" }), "Укажите причину: не короче 3 символов");
  assert.equal(F.dayOffError({ ...ok, dateFrom: "" }), "Укажите дату");
  assert.equal(F.dayOffError({ dateFrom: "2026-12-25", dateTo: "2027-01-07", reason: "Каникулы" }), null);                 // over a new year: 14 days
});

test("2. the words: the span, the line of the journal, the warning of a new lesson", () => {
  assert.equal(F.dayOffSpan({ dateFrom: "2026-10-21", dateTo: "2026-10-21" }), "21.10");
  assert.equal(F.dayOffSpan({ dateFrom: "2026-10-21", dateTo: "2026-10-23" }), "21.10–23.10");
  assert.equal(F.dayOffLine({ id: "d", dateFrom: "2026-10-21", dateTo: "2026-10-21", reason: "Хайит", createdAt: null, createdByName: null, voidedAt: null, active: true }), "Хайит · 21.10");
  assert.match(F.dayOffLine({ id: "d", dateFrom: "2026-10-21", dateTo: "2026-10-21", reason: "Хайит", createdAt: null, createdByName: null, voidedAt: "x", active: false }), /отменён$/);
  assert.equal(F.dayOffWarning({ reason: "Хайит" }), "Это выходной день центра («Хайит»). Урок всё равно можно добавить.");
  assert.equal(F.dayOffWarning(null), null);
  assert.equal(F.dayOffLessonLine({ groupId: "g", groupName: "Группа 5", lessonId: "l", date: "2026-10-21", startTime: "10:00", endTime: "11:00", reason: "У урока идёт экзамен" }), "Группа 5 · 21.10 10:00 — У урока идёт экзамен");
});

test("2. the student's card says «Урок отменён: выходной (Хайит)»; any other cancellation still has no reason", () => {
  const SUB = require(path.join(root, "src/lib/substitutions.ts"));
  assert.equal(SUB.studentNoticeLabel({ kind: "cancelled", holiday: "Хайит" }), "Урок отменён: выходной (Хайит)");
  assert.equal(SUB.studentNoticeLabel({ kind: "cancelled" }), "Урок отменён");
  assert.equal(SUB.studentNoticeLabel({ kind: "cancelled", holiday: null }), "Урок отменён");
  const rows = SUB.studentLessonRows([], [{ lessonId: "lesson-wed", date: "2026-10-21", groupId: "g", groupName: "Группа 1", kind: "cancelled", holiday: "Хайит" }], () => null);
  assert.equal(rows[0].noticeText, "Урок отменён: выходной (Хайит)");
});

test("2. where it lives: the owner's settings (a section), the administrator's settings, the hint under the date of a new lesson", () => {
  assert.ok(S.SETTINGS_SECTIONS.some((s) => s.key === "days_off" && s.label === "Выходные дни"));
  assert.ok(S.visibleSettingsSections({ isOwner: true, paymentSettingsReadable: true }).includes("days_off"));
  assert.ok(!S.visibleSettingsSections({ isOwner: false, paymentSettingsReadable: true }).includes("days_off"));
  assert.match(read("src/app/owner/settings/page.tsx"), /section === "days_off" && <DaysOffPanel/);
  assert.match(read("src/app/admin/settings/page.tsx"), /<DaysOffPanel \/>/);
  assert.match(read("src/components/schedule/lesson-slot-fields.tsx"), /<DayOffWarning date=\{date\} \/>/);
  const dialog = read("src/components/schedule/day-off-dialog.tsx");
  assert.match(dialog, /Отменить уроки/);                                                             // the button of the spec
  assert.match(dialog, /previewDayOff/);
  assert.match(dialog, /Не будут отменены/);
  const panel = read("src/components/schedule/days-off-panel.tsx");
  assert.match(panel, /Отменить выходной/);
  assert.match(panel, /voidDayOff\(day\.id, true\)/);                                                 // the lists first (dry run), then the action
  const api = read("src/lib/api.ts");
  for (const route of ["/auth/org/days-off/preview", "/auth/org/days-off\"", "/auth/org/days-off/for-date", "/void"]) assert.ok(api.includes(route), route);
});

test("the pages grew by an import and a field each: the new screens are components", () => {
  const lines = (file) => read(file).split("\n").length;
  // measured on the production commit 7c616a1 (before PAY-F)
  const limits = { "src/app/owner/settings/page.tsx": 951 + 8, "src/app/teacher/schedule/page.tsx": 3210 + 8, "src/app/teacher/dashboard/page.tsx": 2841 + 12,
    "src/app/admin/settings/page.tsx": 107 + 6, "src/components/payments/payment-dialog.tsx": 459 + 3, "src/components/payments/receipt-view.tsx": 297 + 3,
    "src/components/groups/lesson-action-sheet.tsx": 338 + 5 };
  for (const [file, limit] of Object.entries(limits)) assert.ok(lines(file) <= limit, `${file}: ${lines(file)} > ${limit}`);
});

// ---- the new components render (server-side render: no browser, no network) ----------------------------------------------------------------------------

test("the small components render their words", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const html = (element) => renderToStaticMarkup(element).replace(/<!-- -->/g, "");
  const { RecalcNote } = require(path.join(root, "src/components/payments/recalc-note.tsx"));
  const line = { lesson_date: "2026-10-21", lesson_id: "l", amount: 46000, text: "−46 000 сум: урок 21.10 отменён центром" };
  const note = html(React.createElement(RecalcNote, { lines: [line] }));
  assert.match(note, /Перерасчёт за уроки, отменённые центром/);
  assert.match(note, /−46 000 сум: урок 21\.10 отменён центром/);
  assert.equal(html(React.createElement(RecalcNote, { lines: [] })), "");
  assert.equal(html(React.createElement(RecalcNote, { lines: undefined })), "");

  const { CancellationKindField } = require(path.join(root, "src/components/attendance/cancellation-kind-field.tsx"));
  const field = html(React.createElement(CancellationKindField, { value: "centre", onChange() {} }));
  assert.match(field, /По вине центра/);
  assert.match(field, /Праздник, выходной/);
  assert.match(field, /Перерасчёта не будет|заболел преподаватель/);
  assert.match(html(React.createElement(CancellationKindField, { value: "holiday", onChange() {} })), /Перерасчёта не будет/);

  const { CentreCancelSetting } = require(path.join(root, "src/components/payments/centre-cancel-setting.tsx"));
  const setting = html(React.createElement(CentreCancelSetting, { value: false, onChange() {} }));
  assert.match(setting, /Уроки, отменённые центром, при помесячной оплате/);
  assert.match(setting, /Не пересчитывать/);
  assert.match(setting, /Вычитать из следующей оплаты/);
  assert.equal((setting.match(/checked=""/g) || []).length, 1);

  const { DayOffWarning } = require(path.join(root, "src/components/schedule/day-off-warning.tsx"));
  assert.equal(html(React.createElement(DayOffWarning, { date: "2026-10-21" })), "");                      // nothing until the server says it is a day off
});

test("the panel of the days off renders (before the list arrives) and the dialog of a cancellation field is the same in every place", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { DaysOffPanel } = require(path.join(root, "src/components/schedule/days-off-panel.tsx"));
  const html = renderToStaticMarkup(React.createElement(DaysOffPanel));
  assert.match(html, /Выходной день центра/);
  assert.match(html, /Назначить выходной/);
  assert.match(html, /Загрузка…/);
  assert.match(html, /деньги по ним не пересчитываются/);
  const { DayOffDialog } = require(path.join(root, "src/components/schedule/day-off-dialog.tsx"));
  assert.equal(renderToStaticMarkup(React.createElement(DayOffDialog, { open: false, onClose() {}, onDone() {} })), "");              // closed: nothing
});
