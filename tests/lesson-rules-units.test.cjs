// LESSON-RULES: the pure rules of the screens - the words and the small decisions (lib/lesson-rules.ts and the readers of the kind of a cancellation).  The numbers of days are NEVER a copy here: they come from the answer.
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
const L = require(path.join(root, "src/lib/lesson-rules.ts"));
const Ops = require(path.join(root, "src/lib/attendance-ops.ts"));
const Err = require(path.join(root, "src/lib/ops-errors.ts"));
const Subs = require(path.join(root, "src/lib/substitutions.ts"));
const Pay = require(path.join(root, "src/lib/payroll.ts"));
const TL = require(path.join(root, "src/lib/substitution-timeline.ts"));
const O = require(path.join(root, "src/lib/substitution-outcome.ts"));
const answers = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "lessonRules", `${name}.json`), "utf8"));
/** What `api()` throws for a refusal of the server: an Error with the `code` and the whole `detail`. */
const refusalOf = (detail) => Object.assign(new Error(detail.message), { code: detail.code, detail });
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("the window of the teacher: the sentence says the number of the ANSWER (windowDays), never a copy; without a number it names none", () => {
  assert.equal(Err.lessonTooOldText(14), "Урок старше 14 дн. — его закрывает администратор или владелец");
  assert.equal(Err.lessonTooOldText(1), "Урок старше 1 дн. — его закрывает администратор или владелец");
  assert.equal(Err.lessonTooOldText(30), "Урок старше 30 дн. — его закрывает администратор или владелец");
  assert.equal(Err.lessonTooOldText(undefined), "Урок старше срока центра — его закрывает администратор или владелец");
  assert.equal(Err.lessonTooOldText(0), "Урок старше срока центра — его закрывает администратор или владелец");
  // the refusal of the server (the real answer, window 7): the screen shows the server's sentence as it is
  const refusal = answers("refusals").lesson_too_old.detail;
  const failure = Ops.lessonFailure(refusalOf(refusal), "finish", "x");
  assert.deepEqual([failure.kind, failure.text], ["too_old", refusal.message]);
  // a refusal without the sentence: the number still comes from the detail
  assert.equal(Ops.lessonFailure(refusalOf({ code: "LESSON_TOO_OLD", message: "", windowDays: 3 }), "finish", "x").text, "Урок старше 3 дн. — его закрывает администратор или владелец");
  assert.equal(Subs.substitutionErrorText(refusalOf({ code: "LESSON_TOO_OLD", message: "", windowDays: 30 })), "Урок старше 30 дн. — его закрывает администратор или владелец");
});

test("no copy of the number of days of the window is left in the screens (the number is the server's: LESSON-RULES 6.11)", () => {
  assert.doesNotMatch(read("src/lib/attendance-ops.ts"), /TEACHER_WINDOW_DAYS|isLessonTooOld/);
  assert.doesNotMatch(read("src/lib/attendance-excuses.ts"), /isLessonTooOld/);
  assert.doesNotMatch(read("src/lib/use-teacher-lesson-panel.ts"), /isLessonTooOld|LESSON_TOO_OLD_TEXT/);
  assert.doesNotMatch(read("src/lib/ops-errors.ts"), /старше 7 дней/);
  assert.doesNotMatch(read("src/lib/substitutions.ts"), /Урок старше 7 дней/);
  assert.doesNotMatch(read("src/lib/lesson-panel-view.ts"), /в течение 7 дней/);
});

test("a lesson is locked for the teacher by the SERVER's flag (requiresAdmin), not by the date; the owner and the administrator never", () => {
  assert.deepEqual(Ops.openLessonAccess({ requiresAdmin: true }, "teacher"), { locked: true, hint: "Обратитесь к администратору" });
  assert.deepEqual(Ops.openLessonAccess({ requiresAdmin: false }, "teacher"), { locked: false, hint: null });
  assert.deepEqual(Ops.openLessonAccess({}, "teacher"), { locked: false, hint: null }, "an older answer says nothing: nothing is guessed from the date");
  assert.deepEqual(Ops.openLessonAccess({ requiresAdmin: true }, "owner"), { locked: false, hint: null });
  assert.deepEqual(Ops.openLessonAccess({ requiresAdmin: true }, "admin"), { locked: false, hint: null });
});

test("the refusals that are RULES are an information, the other ones stay errors: NOBODY_CAME_BACKDATED and LESSON_TOO_OLD (the real answers)", () => {
  const refusals = answers("refusals");
  const nobody = Ops.lessonFailure(refusalOf(refusals.nobody_came_backdated.detail), "finish", "x");
  assert.deepEqual([nobody.kind, nobody.text, Ops.isRuleRefusal(nobody)], ["nobody_came_backdated", refusals.nobody_came_backdated.detail.message, true]);
  assert.equal(Ops.isRuleRefusal(Ops.lessonFailure(refusalOf({ code: "LESSON_TOO_OLD", message: "m", windowDays: 7 }), "finish", "x")), true);
  assert.equal(Ops.isRuleRefusal(Ops.lessonFailure(refusalOf({ code: "NOBODY_CAME", message: "m" }), "finish", "x")), false, "the old question stays a question");
  assert.equal(Ops.isRuleRefusal(Ops.lessonFailure(refusalOf(refusals.attendance_conflict.detail), "save", "x")), false);
  // a decided excuse (K8b) is said in the server's own sentence, nothing is added
  const decided = Ops.lessonFailure(refusalOf({ code: "EXCUSE_DECIDED", message: "Уважительную причину уже рассмотрели — изменить отметку может администратор или владелец" }), "save", "x");
  assert.equal(decided.text, "Уважительную причину уже рассмотрели — изменить отметку может администратор или владелец");
  assert.equal(Ops.isRuleRefusal(decided), false);
});

test("the correction of the marks is offered to the teacher of his OWN held lesson - the window is judged by the server (the journal has no flag for it: said in the report)", () => {
  const A = require(path.join(root, "src/lib/attendance-excuses.ts"));
  assert.deepEqual(A.lessonTeacherActions("completed", true), ["correct"]);
  assert.deepEqual(A.lessonTeacherActions("completed", false), []);
  assert.deepEqual(A.lessonTeacherActions("cancelled", true), []);
  assert.deepEqual(A.lessonTeacherActions("scheduled", true), []);
});

test("outcomes of a waiting cancellation: the sentence of the chosen outcome comes from the numbers of the real dry run (9 × 50 000 = 450 000)", () => {
  const dry = answers("dry_run_confirm_centre");
  assert.equal(L.outcomeCaption("centre", dry), "Перерасчёт 9 ученикам по 50 000 сум, всего 450 000 сум. Преподавателю урок не оплачивается.");
  assert.equal(L.outcomeCaption("holiday", dry), "Ученикам: без перерасчёта. Преподавателю урок не оплачивается.");
  assert.equal(L.outcomeCaption("held", dry), "Отмена снимается, преподаватель отметит посещаемость. Деньги считаются как за обычный урок.");
  // the real answer for a holiday: no students, no sum
  const holiday = answers("dry_run_confirm_holiday");
  assert.deepEqual([holiday.students, holiday.total, holiday.per_student], [0, 0, null]);
  // the other shapes of the same answer (the server's fields): the recalculation of the centre is off; unequal amounts; one student; no recalculation; the lesson is older than the window
  assert.equal(L.outcomeCaption("centre", { ...dry, recalc_off: true }), "Перерасчёт за отмены в центре выключен — ученикам ничего не изменится. Преподавателю урок не оплачивается.");
  assert.equal(L.outcomeCaption("centre", { ...dry, per_student: null, students: 2, total: 90000 }), "Перерасчёт 2 ученикам, всего 90 000 сум. Преподавателю урок не оплачивается.");
  assert.equal(L.outcomeCaption("centre", { ...dry, students: 1, per_student: 50000, total: 50000 }), "Перерасчёт 1 ученику по 50 000 сум, всего 50 000 сум. Преподавателю урок не оплачивается.");
  assert.equal(L.outcomeCaption("centre", { ...dry, students: 0, total: 0, per_student: null }), "Ученикам: без перерасчёта. Преподавателю урок не оплачивается.");
  assert.equal(L.outcomeCaption("held", { ...dry, teacher_can_mark: false, window_days: 14 }), "Отмена снимается. Урок старше 14 дн.: отметит администратор или владелец.");
  assert.equal(L.outcomeCaption("centre", null), null, "nothing is promised before the numbers come");
});

test("an archived group cannot give the lesson back (restore_allowed false): the window offers TWO outcomes; otherwise three", () => {
  assert.deepEqual(L.offeredOutcomes(null).map((o) => o.key), ["centre", "holiday", "held"]);
  assert.deepEqual(L.offeredOutcomes({ restore_allowed: true }).map((o) => o.key), ["centre", "holiday", "held"]);
  assert.deepEqual(L.offeredOutcomes({ restore_allowed: false }).map((o) => o.key), ["centre", "holiday"]);
  assert.deepEqual(L.WAITING_OUTCOMES.map((o) => o.button), ["Подтвердить: по вине центра", "Подтвердить: праздник, выходной", "Вернуть урок на отметку"]);
});

test("the words of the row and of the window, from the real answer pending_owner", () => {
  const item = answers("pending_owner").items[0];
  assert.equal(L.waitingChipText(item.waitingDays), "сообщено сегодня");
  assert.equal(L.waitingChipText(1), "ждёт 1 день");
  assert.equal(L.waitingChipText(2), "ждёт 2 дня");
  assert.equal(L.waitingChipText(5), "ждёт 5 дней");
  assert.equal(L.waitingChipText(11), "ждёт 11 дней");
  assert.equal(L.waitingReasonText({ reason: "Отключили свет" }), "Урока не было: отключили свет");
  assert.equal(L.waitingReasonText(item), "Урока не было");
  assert.equal(L.waitingDialogTitle(item), "Преподаватель сообщил: урока не было");
  assert.equal(L.waitingDialogTitle({ cancelledBy: { role: "admin" } }), "Администратор сообщил: урока не было");
  assert.equal(L.waitingDialogSubtitle(item), "Г · пн, 23.11 · 10:00–11:30");
  assert.equal(L.ownerDecidesLine({ oneOffs: 1, cancellations: 1 }), "Решает владелец: 1 дополнительный урок, 1 отмена урока");
  assert.equal(L.ownerDecidesLine({ oneOffs: 0, cancellations: 3 }), "Решает владелец: 3 отмены урока");
  assert.equal(L.ownerDecidesLine({ oneOffs: 2, cancellations: 0 }), "Решает владелец: 2 дополнительных урока");
  assert.equal(L.waitingDecidedToast("centre"), "Отмена подтверждена: по вине центра");
  assert.equal(L.notClosedText(2), "Не закрыт 2 дня");
  assert.equal(L.notClosedText(1), "Не закрыт 1 день");
  assert.equal(L.notClosedText(7), "Не закрыт 7 дней");
  assert.equal(L.notClosedText(0), null);
  assert.equal(L.notClosedText(undefined), null);
  assert.equal(L.pastCancelQuestion("23 ноября"), "Урок 23 ноября не отмечен. Что произошло?");
  assert.equal(L.PAST_CANCEL_BUTTON, "Сообщить, что урока не было");
});

test("the words of the history: the chip of every entry of the journal (the real answer history)", () => {
  const entries = answers("history").items.filter((row) => row.source === "audit");
  assert.deepEqual(entries.map((e) => L.auditChipText(e)), ["Задним числом · 1 дн.", "Отметки исправлены"]);
  assert.equal(L.auditChipText({ kind: "lesson_added", lateDays: null }), "Добавил урок в расписание");
  assert.equal(L.auditChipText({ kind: "backdated", lateDays: 12 }), "Задним числом · 12 дн.");
  assert.equal(L.auditByLine(entries[0]), null, "the teacher closed his own lesson");
  assert.equal(L.auditByLine(entries[1]), "оформление: Усманов У.");
  assert.equal(L.teacherWordsOf(answers("history").items[0]), "Урока не было");
  assert.equal(L.teacherWordsOf({ trigger: "manager_cancel", decision: { note: "x" } }), null, "only the teacher's own words");
  assert.equal(L.BACKDATED_EMPTY_TEXT, "За 30 дней уроки задним числом не оформлялись");
  assert.equal(Subs.tabLabel("decided", 3), "История");
});

test("the list of «Замены» asks the server's own parameter (backdated_only) and keeps the three kinds of rows apart", () => {
  assert.match(Subs.listQuery({ status: "decided", backdatedOnly: true }), /(^|&)backdated_only=true(&|$)/);
  assert.doesNotMatch(Subs.listQuery({ status: "decided" }), /backdated/);
  const rows = [...answers("pending_owner").items, ...answers("history").items];
  const split = L.splitRows(rows);
  assert.deepEqual([split.waiting.length, split.audit.length, split.requests.length], [1, 2, 1]);
});

test("the salary line of the panel: «В зарплате за ноябрь: +25 000 сум» from the dry run of the return; no sheet, nothing", () => {
  assert.equal(L.salaryLineOf({ payroll: [{ month: "2026-11", changedBy: -25000 }] }, "2026-11-26"), "В зарплате за ноябрь: +25 000 сум");
  assert.equal(L.salaryLineOf({ payroll: [{ month: "2026-11", changedBy: 0 }] }, "2026-11-26"), null);
  assert.equal(L.salaryLineOf({ payroll: [] }, "2026-11-26"), null);
  assert.equal(L.salaryLineOf(null, "2026-11-26"), null);
});

test("the teacher's block: the waiting cancellation first (the nearest lesson), the decided ones after; the chips of the real answer mine_teacher", () => {
  const mine = answers("mine_teacher");
  const NOW = Date.parse("2026-11-26T07:00:00Z");
  const ordered = Subs.recentRequests(mine.items, NOW);
  assert.deepEqual(ordered.map((i) => i.outcome), ["cancel_waiting", "cancelled_centre"]);
  assert.deepEqual(ordered.map((i) => O.outcomeOf(i, "teacher").text), ["Отмена ждёт подтверждения", "Отменён: по вине центра"]);
  assert.equal(Subs.myRequestLine(ordered[0]), "пн, 23.11 · Г");
  assert.equal(Subs.MY_REQUESTS_TITLE, "Запросы и изменения уроков");
  // a returned lesson: the teacher marks it (the window of the centre says so) or the administrator does
  assert.equal(O.outcomeOf({ ...mine.items[1], outcome: "lesson_restored", teacherCanMark: true }, "teacher").text, "Урок был — отметьте посещаемость");
  assert.equal(O.outcomeOf({ ...mine.items[1], outcome: "lesson_restored", teacherCanMark: false }, "teacher").text, "Урок был — отметит администратор");
  assert.equal(O.outcomeOf({ ...mine.items[1], outcome: "lesson_restored", teacherCanMark: true }, "manager").text, "Урок возвращён");
});

test("the history of a confirmed cancellation: «Преподаватель сообщил, что урока не было» and «Отмена подтверждена: по вине центра» with who (the events of the server)", () => {
  const item = { ...answers("history").items[0], id: "r1" };
  const manager = { id: "o", name: "Усманов У.", role: "owner" };
  const timeline = TL.timelineOf({ item, events: [
    { requestId: "r1", action: "cancelled", actor: item.teacher && { id: "t", name: "Иванов И.", role: "teacher" }, at: "2026-11-24T09:50:00", snapshot: { reason: "Урока не было" } },
    { requestId: "r1", action: "confirmed", actor: manager, at: "2026-11-26T07:40:00", snapshot: { cancellationKind: { from: "unconfirmed", to: "centre" } } },
  ] }, "manager");
  assert.deepEqual(timeline.rows.map((r) => [r.title, r.author]), [["Преподаватель сообщил, что урока не было", "Иванов И., преподаватель"], ["Отмена подтверждена: по вине центра", "Усманов У., владелец"]]);
  assert.equal(TL.timelineOf({ item, events: [{ requestId: "r1", action: "confirmed", actor: manager, snapshot: { cancellationKind: { from: "unconfirmed", to: "holiday" } } }] }, "manager").rows[0].title, "Отмена подтверждена: праздник");
});

test("«без запроса» is gone from the history: nothing is said about who did not ask (LESSON-RULES Э3); «открыт заново» stays", () => {
  assert.equal(O.originBadge({ origin: "system", trigger: "manager_cancel" }), null);
  assert.equal(O.originBadge({ origin: "system", trigger: null }), "открыт заново");
  assert.equal(O.originBadge({ origin: "teacher", trigger: null }), null);
});

test("the sheet of a teacher: the waiting cancellations are the FIRST affair and say their number right (the keys of the server: unconfirmed_cancellations / unconfirmed_items)", () => {
  const base = { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 };
  assert.deepEqual(Pay.warningViews({ ...base, unconfirmed_cancellations: 1 }).map((v) => v.text), ["1 отмена ждёт подтверждения"]);
  assert.deepEqual(Pay.warningViews({ ...base, unconfirmed_cancellations: 3, pending_excused: 2 }).map((v) => v.text), ["3 отмены ждут подтверждения", "2 уважительные ждут решения"]);
  assert.deepEqual(Pay.warningViews(base), []);
  const view = Pay.warningViews({ ...base, unconfirmed_cancellations: 1 })[0];
  assert.deepEqual([view.href, view.button, view.target], ["/owner/substitutions", "Решить", "Замены → Ждут решения"]);
  // the refusal of the saving: the server's sentence is shown as it is
  const message = "Отмен уроков, которые ждут подтверждения владельца: 1. Решите их в «Замены → Ждут решения», затем сохраните зарплату";
  assert.equal(Pay.payrollErrorText(Object.assign(new Error(message), { status: 409, code: "UNCONFIRMED_CANCELLATIONS" })), message);
});

test("a stored kind is not a kind a person sends: the types keep them apart (a body never carries unconfirmed)", () => {
  const types = read("src/lib/payf.ts");
  assert.match(types, /export type CancellationKind = "centre" \| "holiday";/);
  assert.match(types, /export type StoredCancellationKind = CancellationKind \| "unconfirmed";/);
  const api = read("src/lib/api.ts");
  assert.match(api, /cancellationKind: CancellationKind; reason\?: string; expectedKind\?: StoredCancellationKind/);
  assert.match(api, /cancellationKinds\?: Record<string, StoredCancellationKind>/);
});

test("Э9: every reader of the kind of a cancellation knows `unconfirmed` - the journal, the schedule, the sheet, the history, the types (the list of the report)", () => {
  const Ex = require(path.join(root, "src/lib/attendance-excuses.ts"));
  const Card = require(path.join(root, "src/lib/schedule-card-actions.ts"));
  const Payf = require(path.join(root, "src/lib/payf.ts"));
  // the journal column: «Решить» for the money right, nothing for the rest, never «Вернуть на отметку» / «Изменить причину» (the window has «Урок был» inside)
  assert.deepEqual(Ex.lessonAdminActions("cancelled", "2026-11-23", "2026-11-26", { moneyRight: true, cancelKind: "unconfirmed" }), ["decide_waiting"]);
  assert.deepEqual(Ex.lessonAdminActions("cancelled", "2026-11-23", "2026-11-26", { moneyRight: false, cancelKind: "unconfirmed" }), []);
  assert.deepEqual(Ex.lessonAdminActions("cancelled", "2026-11-23", "2026-11-26", { moneyRight: true, cancelKind: "centre" }), ["return_review"], "a decided cancellation: as before");
  // the sheet: «Изменить причину отмены» is for a kind that was decided; the waiting one has «Решить»
  assert.equal(Payf.canChangeKind(true, "unconfirmed"), false);
  assert.equal(Payf.canChangeKind(true, "centre"), true);
  assert.equal(Payf.isWaitingKind("unconfirmed"), true);
  assert.equal(Payf.isWaitingKind("centre"), false);
  assert.equal(Payf.WAITING_CANCEL_LABEL, "Отмена ждёт подтверждения");
  // the card of the schedule does not offer «Вернуть урок» for a waiting cancellation (the sheet's «Решить» holds «Урок был»)
  const input = { role: "owner", archived: false, state: "cancelled", date: "2026-11-23", today: "2026-11-26", startTime: "10:00", now: new Date("2026-11-26T07:00:00Z"), moved: false };
  assert.equal(Card.canRestoreLesson({ ...input, cancelKind: "unconfirmed" }), false);
  // the history of a lesson names the kind it was before (the line «было … стало …»)
  const events = [{ requestId: "r1", action: "closed", actor: { id: "o", name: "Усманов У.", role: "owner" }, snapshot: { closedReason: "KIND_CHANGED", cancellationKind: { from: "unconfirmed", to: "centre" }, reason: "x" } }];
  const rows = TL.timelineOf({ item: { id: "r1", origin: "system", trigger: "manager_reason_change" }, events }, "manager").rows;
  assert.deepEqual(rows[0].details[0], "было: ждёт подтверждения, стало: по вине центра");
  // the readers that are types / strings (no logic to run): the list of the places and what each knows
  const sources = {
    "src/lib/payf.ts": /StoredCancellationKind/, "src/lib/api.ts": /cancellationKinds\?: Record<string, StoredCancellationKind>/, "src/lib/ops-b-types.ts": /previousKind: "centre" \| "holiday" \| "unconfirmed" \| null/,
    "src/lib/substitution-timeline.ts": /"unconfirmed" \? "ждёт подтверждения"/, "src/lib/attendance-excuses.ts": /decide_waiting/, "src/lib/schedule-card-actions.ts": /"unconfirmed"/,
    "src/components/groups/group-attendance-journal.tsx": /WAITING_CANCEL_LABEL/, "src/components/groups/group-schedule-overview.tsx": /WAITING_CANCEL_LABEL/, "src/components/groups/lesson-action-sheet.tsx": /SheetWaitingNotice/,
    "src/components/groups/sheet-waiting-notice.tsx": /WaitingCancelDialog/, "src/lib/substitution-outcome.ts": /cancel_waiting/,
  };
  for (const [file, pattern] of Object.entries(sources)) assert.match(read(file), pattern, file);
});

test("a decision of «Отменить урок» over a PAST lesson by a role without the money right: the answer says unconfirmed and the toast says the owner decides (the types keep the stored kind)", () => {
  assert.equal(Subs.decisionToast({ item: { decision: {} }, result: { kind: "cancel", cancellationKind: "unconfirmed" } }), "Отмена ждёт подтверждения");
  assert.equal(Subs.decisionToast({ item: { decision: {} }, result: { kind: "cancel", cancellationKind: "centre" } }), "Урок отменён");
  assert.equal(Subs.decisionToast({ item: { decision: {} }, result: { kind: "cancel", cancellationKind: null } }), "Урок отменён");
  assert.match(read("src/lib/substitution-types.ts"), /cancellationKind\?: StoredCancellationKind \| null;\n  teacherId/);
});
