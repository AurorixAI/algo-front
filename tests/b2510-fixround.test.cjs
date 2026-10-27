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
const W = require(path.join(root, "src/lib/weekly-lessons.ts"));
const LT = require(path.join(root, "src/lib/lesson-teacher.ts"));
const F = require(path.join(root, "src/lib/payf.ts"));
const S = require(path.join(root, "src/lib/substitutions.ts"));
const API = read("src/lib/api.ts");

test("[2] the dialog «Преподаватель урока»: the role of everybody, the list scrolls inside its box, the reason is always in the window, a missing reason takes the cursor", () => {
  assert.equal(LT.roleLabel("owner"), "Владелец");
  assert.equal(LT.roleLabel("admin"), "Администратор");
  assert.equal(LT.roleLabel("teacher"), "Преподаватель");
  assert.equal(LT.roleLabel(undefined), "Преподаватель");
  const dialog = read("src/components/groups/lesson-teacher-dialog.tsx");
  assert.match(dialog, /max-h-\[min\(40vh,20rem\)\][^"]*overflow-y-auto/);                                      // the list has its own scroll, the reason stands under it
  assert.match(dialog, /roleLabel\(candidate\.orgRole\)/);
  assert.match(dialog, /if \(problem\) \{ reasonRef\.current\?\.focus\(\)/);                                    // «Вернуть преподавателя группы» without a reason says it, not silence
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { LessonTeacherBody } = require(path.join(root, "src/components/groups/lesson-teacher-dialog.tsx"));
  const list = { lessonId: "l", lessonDate: "2026-11-04", startTime: "10:00", endTime: "11:00", currentTeacherId: "t1", defaultTeacherId: "t1",
    candidates: [{ teacherId: "t1", name: "Иванов И.", orgRole: "teacher" }, { teacherId: "t2", name: "Иванов И.", orgRole: "owner" }, { teacherId: "t3", name: "Каримова Н.", orgRole: "admin" }] };
  const html = renderToStaticMarkup(React.createElement(LessonTeacherBody, { list, loadError: null, current: "t1", pick: null, reason: "", reasonProblem: "Укажите причину — не менее 3 символов", busy: false, error: null, onPick() {}, onReason() {}, onRetry() {} }));
  for (const word of ["Владелец", "Администратор", "Преподаватель", "Укажите причину — не менее 3 символов"]) assert.ok(html.includes(word), word);
  assert.match(html, /role="alert"[^>]*>Укажите причину/);
});

test("[5] the dry run of a day off: the sentence, then the lessons «группа · дата · время»; the blocked ones apart with the reason", () => {
  assert.equal(F.dayOffSummary({ text: "Будут отменены 4 урока в 4 группах: А, Б, В, Г" }), "Будут отменены 4 урока в 4 группах");
  const dialog = read("src/components/schedule/day-off-dialog.tsx");
  assert.match(dialog, /dayOffSummary\(plan\)/);
  assert.match(dialog, /title="Будут отменены" lessons=\{plan\.cancellable\}/);
  assert.match(dialog, /title="Не будут отменены" lessons=\{plan\.blocked\}/);
  assert.equal(F.dayOffLessonLine({ groupId: "g", groupName: "Группа 3", lessonId: "l", date: "2026-11-04", startTime: "10:00", endTime: "11:00", reason: null }), "Группа 3 · 04.11 · 10:00–11:00");
});

test("[6] the days off: the live ones first, the cancelled and gone by ones apart", () => {
  const day = (id, dateFrom, dateTo, active) => ({ id, dateFrom, dateTo, active, reason: id, createdAt: null, createdByName: null, voidedAt: null });
  const { current, past } = F.splitDaysOff([day("old", "2026-10-01", "2026-10-01", true), day("later", "2026-12-01", "2026-12-01", true), day("soon", "2026-11-03", "2026-11-04", true), day("void", "2026-11-10", "2026-11-10", false), day("today", "2026-10-26", "2026-10-26", true)], "2026-10-26");
  assert.deepEqual(current.map((d) => d.id), ["today", "soon", "later"]);
  assert.deepEqual(past.map((d) => d.id), ["void", "old"]);
  const panel = read("src/components/schedule/days-off-panel.tsx");
  assert.match(panel, /Действующие/);
  assert.match(panel, /Отменённые и прошедшие/);
  assert.match(panel, /<details/);
});

test("[7] the same warning of several weekdays is one line with the days", () => {
  const note = "Кабинет «12» в это время занят группой «Х»";
  assert.deepEqual(W.mergeNotices([{ note, day: 1 }, { note, day: 3 }, { note, day: 5 }], 3), [`${note}: пн, ср, пт`]);
  assert.deepEqual(W.mergeNotices([{ note, day: 5 }, { note, day: 1 }], 3), [`${note}: пн, пт`]);
  assert.deepEqual(W.mergeNotices([{ note, day: 1 }], 1), [note]);                                                  // one weekday: the server's sentence as it is
  assert.deepEqual(W.mergeNotices([{ note, day: 1 }, { note: "Другая", day: 3 }], 3), [`${note}: пн`, "Другая: ср"]);
  assert.deepEqual(W.mergeNotices([], 3), []);
});

test("[8] a receipt of «undefined» asks nothing; a submit of the add dialog is sent once", async () => {
  await assert.rejects(() => require(path.join(root, "src/lib/api.ts")).orgApi.getPaymentReceipt("undefined"), (error) => error.status === 404);
  assert.match(API, /paymentId === "undefined"/);
  assert.match(read("src/components/payments/receipt-view.tsx"), /orgApi\.getPaymentReceipt\(paymentId\)/);       // the view asks through the guarded call
  const dialogs = read("src/components/schedule/weekly-lesson-dialogs.tsx");
  assert.ok((dialogs.match(/if \(busy \|\| sending\.current\) return;/g) || []).length >= 2, "add and edit dialogs hold a ref against a second submit in the same tick");
});

test("[3][4] the words of a taken off / replaced substitution are the same in the owner's journal and in the teacher's list", () => {
  const AT = "2026-10-22T04:30:00";
  const person = (name) => ({ id: name, name });
  const base = { id: "r", origin: "system", trigger: "manager_assign", status: "substituted", teacher: person("Иванов А."), decision: { kind: "substitute", by: person("Каримова Н."), at: AT, substitute: person("Тарасов Т.") } };
  const replaced = { ...base, clearedAt: AT, clearedBy: person("Каримова Н."), clearedTo: person("Сидоров В."), clearedTrigger: "put" };
  assert.equal(S.clearedLine(replaced), "Заменена на Сидоров В. — решил(а) Каримова Н., 22.10 09:30");
  assert.equal(S.teacherStatusLine(replaced).text, S.clearedLine(replaced));
  const removed = { ...base, status: "closed", decision: { ...base.decision, kind: "closed", closedReason: "ASSIGNMENT_CLEARED" } };
  assert.equal(S.decisionResultText(removed), "Замену снял(а) Каримова Н., 22.10 09:30");
  assert.equal(S.teacherStatusLine(removed).text, S.decisionResultText(removed));
  assert.doesNotMatch(S.decisionResultText(removed), /Замена снята: Тарасов/);
});

test("the teacher's lesson panel: «Перенести урок» and «Не смогу провести» are rows of the «⋯» menu, grouped by meaning; no row of buttons any more", () => {
  const C = require(path.join(root, "src/components/substitutions/teacher-lesson-controls.tsx"));
  const act = (patch) => ({ moveKind: "none", requestKind: "none", setMoveOpen() {}, setRequestOpen() {}, ...patch });
  const labels = (items) => items.map((i) => [i.label, i.disabledReason ?? null]);
  assert.deepEqual(labels(C.teacherLessonMenuItems(act({ moveKind: "button", requestKind: "button" }), () => {})), [["Перенести урок", null], ["Не смогу провести", null]]);
  assert.deepEqual(labels(C.teacherLessonMenuItems(act({ moveKind: "late", requestKind: "button" }), () => {})), [["Перенести урок", "Перенести можно не позднее чем за 60 минут до начала"], ["Не смогу провести", null]]);
  assert.deepEqual(labels(C.teacherLessonMenuItems(act({ moveKind: "none", requestKind: "pending" }), () => {})), []);                       // a waiting request is a plate in the panel, not a row
  assert.deepEqual(labels(C.teacherLessonMenuItems(act({ moveKind: "button" }), () => {}, () => {})), [["Перенести урок", null], ["Отменить этот урок", null]]);
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const icon = () => null;
  const html = renderToStaticMarkup(React.createElement(C.LessonMenuGroups, { groups: [
    { label: "Этот урок", items: [{ key: "move", label: "Перенести урок", icon, disabledReason: "не позднее чем за 60 минут", onSelect() {} }, { key: "cancel", label: "Отменить этот урок", icon, tone: "danger", onSelect() {} }] },
    { label: "Постоянное расписание", items: [{ key: "end", label: "Прекратить регулярные занятия", icon, tone: "danger", onSelect() {} }] },
    { label: "Пустая", items: [] },
  ] }));
  assert.match(html, /Этот урок[\s\S]*Постоянное расписание/);
  assert.match(html, /aria-disabled="true"/);
  assert.doesNotMatch(html, /Пустая/);                                                                                   // a group with no rows is not drawn
  assert.match(html, /border-t border-slate-100/);                                                                       // the thin line between the groups
  for (const page of ["src/app/teacher/schedule/page.tsx", "src/app/teacher/dashboard/page.tsx"]) {
    const src = read(page);
    assert.match(src, /<TeacherLessonControls/);
    assert.match(src, /LessonActionsMenu/);
    assert.doesNotMatch(src, /data-testid="teacher-move"/);
  }
  assert.doesNotMatch(read("src/components/substitutions/request-control.tsx"), /REQUEST_ACTION/);
  assert.doesNotMatch(read("src/components/substitutions/teacher-move-control.tsx"), /<button/);
});

test("settings, package mode: «Уроки, отменённые центром» is not rendered, one quiet hint is (the words from payf-settings.ts)", () => {
  const { PACKAGE_CANCEL_HINT_TEXT, PACKAGE_CANCEL_HINT_TITLE } = require(path.join(root, "src/lib/payf-settings.ts"));
  assert.equal(PACKAGE_CANCEL_HINT_TITLE, "Отменённые уроки считаются автоматически");
  assert.equal(PACKAGE_CANCEL_HINT_TEXT, "Из пакета списываются только проведённые уроки. Урок, отменённый по вине центра или в праздник, пакет не тратит — пакет продлится на следующий урок.");
  const page = read("src/app/owner/settings/page.tsx");
  assert.match(page, /model === "lessons" \? <PackageCancelHint \/> : <CentreCancelSetting /);                // a package: the hint, not the block; the monthly modes: the block
  assert.doesNotMatch(page, /PACKAGE_CANCEL_HINT|Отменённые уроки считаются/, "the words are not typed into the page");
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { PackageCancelHint, CentreCancelSetting } = require(path.join(root, "src/components/payments/centre-cancel-setting.tsx"));
  const hint = renderToStaticMarkup(React.createElement(PackageCancelHint));
  assert.ok(hint.includes(PACKAGE_CANCEL_HINT_TITLE) && hint.includes(PACKAGE_CANCEL_HINT_TEXT));
  assert.ok(!hint.includes("Не пересчитывать") && !hint.includes('type="radio"'));
  assert.match(renderToStaticMarkup(React.createElement(CentreCancelSetting, { value: false, onChange() {} })), /data-testid="centre-cancel-setting"/);
});

test("settings «Оплаты» (calm): ONE line for the start of the accounting, «Изменить» opens the date, no duplicate block, the mode warning only on a change, the long words behind «?»", () => {
  const page = read("src/app/owner/settings/page.tsx");
  const S = require(path.join(root, "src/lib/payf-settings.ts"));
  assert.equal(S.accountingLineText("26.10.2026"), "ALGO ведёт оплаты центра с 26.10.2026");
  assert.equal(S.ACCOUNTING_CHANGE_LABEL, "Изменить");
  assert.equal(S.ACCOUNTING_HINT.before + S.ACCOUNTING_HINT.link + S.ACCOUNTING_HINT.after, "До этой даты ничего не начисляется. Что ученики оплатили или были должны раньше — внесите в «Остатки на начало» (по одному или одним файлом Excel).");
  // the duplicate is gone: neither the checklist line («Учёт оплат запущен … Подробнее») nor the old block «Начало учёта оплат»
  assert.doesNotMatch(page, /OpeningsChecklist|Начало учёта оплат|С этого дня центр считает деньги/);
  assert.equal((page.match(/<AccountingStartLine/g) || []).length, 1);
  assert.ok(page.indexOf("<AccountingStartLine") < page.indexOf("<fieldset>"), "the line is at the TOP of the section");
  // the warning about the new mode is for an unsaved change only
  assert.match(page, /\{regimeChanged && <p className="mt-2 text-xs text-slate-500" data-testid="regime-hint">\{REGIME_HINT\}<\/p>\}/);
  assert.doesNotMatch(page, /<p className="mt-2 text-xs text-slate-500" data-testid="regime-hint">\{REGIME_HINT\}<\/p>\n/);
  // the order: mode cards -> the parameters of the chosen mode -> the cancelled lessons (monthly) / the hint (package) -> the administrator
  const order = ["PAYMENT_MODEL_SHORT_HINT[option.key]", 'model === "fixed_day" && (', 'model === "lessons" ? (', "<PackageCancelHint />", "payments-admin-label"].map((marker) => page.indexOf(marker));
  assert.ok(order.every((at) => at > 0) && order.every((at, i) => i === 0 || at > order[i - 1]), `order ${order}`);
  // the cards say ONE short line each; the long hints are behind the «?»
  for (const key of ["payment_date", "fixed_day", "lessons"]) assert.ok(S.PAYMENT_MODEL_SHORT_HINT[key].length <= 60, key);
  assert.match(page, /<HelpToggle label=\{HELP_LABEL\} testId="payments-help">/);
  // the component: the line, «Изменить», the date with the hint and the link to the openings, «Не менять»
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { AccountingStartLine } = require(path.join(root, "src/components/payments/accounting-start-line.tsx"));
  const html = renderToStaticMarkup(React.createElement(AccountingStartLine, { loaded: "2026-10-26", value: "2026-10-26", onChange() {}, impact: null, openingsHref: "/owner/payments/openings", minDate: "2020-01-01", formatDate: (iso) => iso.split("-").reverse().join("."), inputClassName: "" }));
  assert.match(html, /ALGO ведёт оплаты центра с 26\.10\.2026/);
  assert.match(html, /data-testid="accounting-start-change"[^>]*>Изменить</);
  assert.doesNotMatch(html, /accounting-start-editor|Остатки на начало/);                                           // closed: nothing but the line
  const help = renderToStaticMarkup(React.createElement(require(path.join(root, "src/components/ui/help-toggle.tsx")).HelpToggle, null, "Подробности"));
  assert.match(help, /aria-expanded="false"/);
  assert.doesNotMatch(help, /Подробности/);                                                                          // closed: one short line stays
});

test("today's start has gone: the SAME rule for the owner and the teacher (pastDayPlan) - only today's weekday drops, a one-off of today is blocked", () => {
  const F = require(path.join(root, "src/lib/lesson-slot-form.ts"));
  const base = { scope: "recurring", days: [2, 4, 6], validFrom: "", date: "", startTime: "10:00", today: "2026-10-27", todayDay: 2, nowMinutes: 12 * 60 + 29 };
  assert.deepEqual(F.pastDayPlan(base), { pastDays: [2], sendDays: [4, 6], allPast: false, pastOneOff: null });
  assert.equal(F.pastDayPlan({ ...base, days: [2] }).allPast, true);
  assert.deepEqual(F.pastDayPlan({ ...base, validFrom: "2026-11-02" }).pastDays, [], "a weekly lesson that starts later loses nothing");
  assert.deepEqual(F.pastDayPlan({ ...base, startTime: "15:00" }).pastDays, [], "a later start loses nothing");
  assert.match(F.pastDayPlan({ ...base, scope: "one_off", date: "2026-10-27" }).pastOneOff, /прошедшее время/);
  assert.equal(F.pastDayPlan({ ...base, scope: "one_off", date: "2026-10-28" }).pastOneOff, null);
  const teacher = read("src/app/teacher/schedule/page.tsx"), owner = read("src/components/schedule/weekly-lesson-dialogs.tsx");
  for (const src of [teacher, owner]) assert.match(src, /pastDayPlan\(\{/, "both screens use the one rule");
  assert.match(teacher, /data-testid="add-past-day-note"/);
});

test("a move says what happens to the exam of the lesson BEFORE it is made: a draft is released (warning), a live one blocks the move", () => {
  const A = require(path.join(root, "src/lib/schedule-card-actions.ts"));
  const draft = A.examMoveState({ state: "ok", title: "Контрольная 7А", canCancel: true });
  assert.equal(draft.blocked, false);
  assert.match(draft.message, /привязан экзамен «Контрольная 7А».*вернётся в черновик.*новый урок/);
  const live = A.examMoveState({ state: "ok", title: "Контрольная 7А", canCancel: false });
  assert.equal(live.blocked, true);
  assert.match(live.message, /нельзя перенести/);
  assert.equal(A.examMoveState({ state: "none" }).message, null);
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  assert.match(sheet, /if \(next === "cancel" \|\| next === "reschedule"\) loadBinding\(\);/);
  assert.equal((sheet.match(/<ExamBindingNote state=\{examState\} onRetry=\{loadBinding\} \/>/g) || []).length, 2, "one note for the cancel and the move forms");
});
