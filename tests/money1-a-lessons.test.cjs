// «Деньги-1», пакет А (front), part 3 - the lessons (items 2-7, 9, 10): «Вернуть урок» / «Вернуть на отметку», the money of a correction and of a decision on an excuse BEFORE the button,
// «кто провёл», «Завершить» when nobody came, the archive, the journal «было → стало», the pause, the rights.  Contract: MONEY1_A_SERVER_REPORT.md.
const assert = require("node:assert/strict");
const test = require("node:test");
const env = require("./helpers/money1-env.cjs");
const { React, html, textOf, lib, component, read, fixture, signIn, plain } = env;
const E = lib("money-effects.ts");
const RET = lib("lesson-return.ts");
const SCA = lib("schedule-card-actions.ts");
const OPS = lib("attendance-ops.ts");
const COR = lib("attendance-corrections.ts");
const REC = lib("lesson-reconcile.ts");
const ARC = lib("group-archive.ts");
const PAY = lib("payments-logica.ts");
const OO = lib("one-off.ts");
const CP = lib("closed-period.ts");
const XD = lib("excuse-decision.ts");
const AX = lib("attendance-excuses.ts");
const OPEN = lib("open-lessons.ts");

const PERIOD_ERROR = { status: 409, code: "PERIOD_CLOSED", message: "Месяц октябрь 2026 у преподавателя Каримова К. закрыт: ведомость сохранена 03.11.2026. Чтобы исправить урок, владелец или администратор с правом оплат сначала переоткрывает месяц",
  detail: { month: "2026-10", teacherId: "t1", teacherName: "Каримова К.", closedOn: "2026-11-03" } };
const DRY = { students: [{ studentId: "s1", name: "Иванов Иван", delta: 1 }, { studentId: "s2", name: "Петрова Мария", delta: 1 }],
  payroll: [{ month: "2026-10", state: "open", sheetId: "sh1", teacherId: "t1", teacherName: "Каримова К.", savedTotal: 475000, paid: 475000 }], text: "…", dryRun: true };

// ── who sees what (I-6) ──────────────────────────────────────────────────────────────────────────

test("the lesson sheet: a held lesson offers «Вернуть урок» and a lesson cancelled by mistake «Вернуть на отметку» - to the money right only", () => {
  const base = { role: "owner", archived: false, today: "2026-11-05", hasTeacherInfo: true, startTime: "10:00", now: new Date("2026-11-05T09:00:00Z") };
  const completed = { ...base, state: "completed", date: "2026-10-28" };
  assert.deepEqual(SCA.scheduleCardActions({ ...completed, moneyRight: true }), ["journal", "returnHeld"]);
  assert.deepEqual(SCA.scheduleCardActions({ ...completed, moneyRight: false }), ["journal"]);
  assert.deepEqual(SCA.scheduleCardActions({ ...completed }), ["journal"], "an absent flag is no right");
  assert.deepEqual(SCA.scheduleCardActions({ ...completed, moneyRight: true, archived: true }), []);
  assert.deepEqual(SCA.scheduleCardActions({ ...completed, moneyRight: true, role: "teacher" }), []);
  const cancelled = { ...base, state: "cancelled", date: "2026-10-28" };
  assert.deepEqual(SCA.scheduleCardActions({ ...cancelled, moneyRight: true }), ["returnReview"]);
  assert.deepEqual(SCA.scheduleCardActions({ ...cancelled, moneyRight: false }), []);
  assert.deepEqual(SCA.scheduleCardActions({ ...cancelled, moneyRight: true, moved: true }), [], "the original of a move is not returned");
  assert.deepEqual(SCA.scheduleCardActions({ ...cancelled, moneyRight: true, cancelKind: "day_off" }), [], "a day off is undone by the day off itself");
  assert.deepEqual(SCA.scheduleCardActions({ ...cancelled, date: "2026-11-20", moneyRight: true }), ["restore"], "a lesson that has not begun goes back to the schedule, as before");
  assert.deepEqual(SCA.scheduleCardActions({ ...completed, moneyRight: true, undoDecision: true }), ["journal", "returnHeld", "undoDecision"]);
  assert.deepEqual(SCA.scheduleCardActions({ ...completed, moneyRight: false, undoDecision: true }), ["journal"]);
  assert.equal(SCA.SCHEDULE_ACTION_LABEL.returnHeld, "Вернуть урок");
  assert.equal(SCA.SCHEDULE_ACTION_LABEL.returnReview, "Вернуть на отметку");
  assert.equal(SCA.SCHEDULE_ACTION_LABEL.undoDecision, "Отменить решение");
});

test("the journal column: «Исправить отметки» and «Вернуть урок» of a held lesson, «Вернуть на отметку», «Отметить посещаемость» (who taught it) - the money right; «Урока не было» and «Завершить» - not", () => {
  const today = "2026-11-05";
  const withRight = (state, date, extra = {}) => AX.lessonAdminActions(state, date, today, { moneyRight: true, ...extra });
  const without = (state, date) => AX.lessonAdminActions(state, date, today, { moneyRight: false });
  assert.deepEqual(withRight("completed", "2026-10-28"), ["correct", "return"]);
  assert.deepEqual(withRight("completed", "2026-10-28", { undoDecision: true }), ["correct", "return", "undo_decision"]);
  assert.deepEqual(without("completed", "2026-10-28"), []);
  assert.deepEqual(withRight("cancelled", "2026-10-28"), ["return_review"]);
  assert.deepEqual(without("cancelled", "2026-10-28"), []);
  assert.deepEqual(withRight("scheduled", "2026-10-28"), ["reconcile", "cancel_missed"]);
  assert.deepEqual(without("scheduled", "2026-10-28"), ["cancel_missed"]);
  assert.deepEqual(without("in_progress", today), ["finish"]);
  // R2-4 (re-walk of 05.11): a mistaken «Урока не было» of TODAY is returned as soon as the lesson has begun - the server tells them apart by the start of the lesson (`starts_at <= now`), not by the date
  assert.deepEqual(withRight("cancelled", today, { started: true }), ["return_review"], "today, begun");
  assert.deepEqual(withRight("cancelled", today, { started: false }), [], "today, not begun: it is taken back from the schedule («Вернуть урок»)");
  assert.deepEqual(withRight("cancelled", today), [], "the start is not known: nothing is guessed");
  assert.deepEqual(without("cancelled", today, { started: true }), [], "without the money right nothing");
  assert.deepEqual(withRight("cancelled", today, { started: true, cancelKind: "day_off" }), [], "a day off is undone by the day off");
  assert.deepEqual(withRight("cancelled", today, { started: true, moved: true }), [], "the original of a move is not returned");
  assert.deepEqual(withRight("cancelled", "2026-11-20", { started: true }), [], "a future day is never begun, whatever is said");
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /const started = lessonHasStarted\(\{ date: lesson\.date, today, startTime: lesson\.startTime \|\| lesson\.start_time \}\);/);
  assert.match(journal, /const actionsFor = \(lesson: Lesson, key: string, lessonStatus: string\): AdminLessonAction\[\] => \{\s*if \(!canEdit\) return \[\];\s*if \(!adminMode\) return lessonTeacherActions\(lessonStatus, lesson\.date, today, !lessonIsOthers\(key\)\);/);
  assert.match(journal, /const reviewable = adminMode && moneyRight && !inCorrection && Boolean\(excuse\);/);
  assert.match(journal, /canReplaceTeacher\("admin", lessonStatus\) && \(moneyRight \|\| lessonStatus !== "completed"\)/);
});

test("the predicates: a held lesson of an active group; a started cancelled lesson that is not a move and not a day off", () => {
  assert.equal(RET.canReturnHeld({ moneyRight: true, archived: false, state: "completed" }), true);
  assert.equal(RET.canReturnHeld({ moneyRight: false, archived: false, state: "completed" }), false);
  assert.equal(RET.canReturnHeld({ moneyRight: true, archived: false, state: "in_progress" }), false);
  assert.equal(RET.canReturnToReview({ moneyRight: true, archived: false, state: "cancelled", started: true }), true);
  assert.equal(RET.canReturnToReview({ moneyRight: true, archived: false, state: "cancelled", started: false }), false);
  assert.equal(RET.canReturnToReview({ moneyRight: false, archived: false, state: "cancelled", started: true }), false);
  assert.equal(RET.canReturnToReview({ moneyRight: true, archived: true, state: "cancelled", started: true }), false);
});

// ── the block «Что будет с деньгами» ─────────────────────────────────────────────────────────────

test("UX round of the owner: the block of money by month - the heading, a line per teacher, and ONLY for a closed month the amber sentence of what to do; an open month is a plain information block", () => {
  signIn({ org_role: "owner" });
  const { MoneyEffectsBlock } = component("money/money-effects-block.tsx");
  const line = (state) => ({ month: "2026-09", state, sheetId: "s1", teacherId: "t1", teacherName: "Эргашев К.", savedTotal: 860000, paid: 0, freshBefore: 860000, freshAfter: 993333, freshTotal: 993333, changedBy: 133333, driftAfter: 133333 });
  const show = (state) => html(React.createElement(MoneyEffectsBlock, { preview: { status: "ready", effects: E.normalizeMoneyEffects({ students: [], payroll: [line(state)], text: "", dryRun: true }) }, onRetry() {} }));
  const closed = show("closed");
  const closedText = plain(textOf(closed));
  assert.match(closedText, /Зарплата за сентябрь(?: 2026)? вырастет:\s*Эргашев К\. — \+133 333 сум \(было 860 000, станет 993 333\)/);
  assert.match(closed, /data-testid="effect-note"/);
  assert.match(closedText, /Сентябрь(?: 2026)? закрыт: сохраните новую сумму, чтобы она вошла в выплату\./);
  assert.match(closed, /border-amber-200/, "something has to be done: amber");
  const open = show("open");
  assert.doesNotMatch(open, /effect-note|border-amber-200/, "an ordinary change is information, not amber");
  assert.match(plain(textOf(open)), /Зарплата за сентябрь(?: 2026)? вырастет:/);
});

test("the block by state: loading says so; ready lists the packs and the sheets; nothing moves says «Деньги не изменятся»; no block from the server says nothing; a failure repeats", () => {
  signIn({ org_role: "owner" });
  const { MoneyEffectsBlock } = component("money/money-effects-block.tsx");
  const show = (preview) => html(React.createElement(MoneyEffectsBlock, { preview, onRetry() {} }));
  assert.equal(show({ status: "idle" }), "");
  assert.ok(textOf(show({ status: "loading" })).includes("Считаем, что изменится…"));
  assert.match(show({ status: "loading" }), /data-testid="money-effects-skeleton"/, "a skeleton of the same size and colour, no spinner sentence");
  const ready = textOf(show({ status: "ready", effects: E.normalizeMoneyEffects(DRY) }));
  for (const part of ["Что изменится", "Иванов Иван: занятие вернётся в пакет", "Петрова Мария: занятие вернётся в пакет", "Изменится зарплата за"]) assert.ok(ready.includes(part), part);
  assert.match(ready, /Изменится зарплата за (октябрь|[а-я]+ 2026) — Каримова К\./);
  const none = show({ status: "ready", effects: E.normalizeMoneyEffects({ students: [], payroll: [], text: "", dryRun: true }) });
  assert.equal(textOf(none), "Деньги не изменятся");
  assert.doesNotMatch(none, /<section/, "nothing moves: ONE grey line, no block");
  assert.equal(show({ status: "ready", effects: null }), "");
  const failed = show({ status: "failed", error: Object.assign(new Error("Internal"), { status: 500 }) });
  assert.ok(textOf(failed).includes("Не удалось посчитать, что изменится. Без этого подтвердить нельзя."));
  assert.match(failed, /data-testid="money-effects-retry"[^>]*>Повторить</);
  assert.match(failed, /role="alert"/);
  const explained = textOf(show({ status: "failed", error: Object.assign(new Error("Проведённого урока нет"), { status: 404 }) }));
  assert.ok(explained.includes("Проведённого урока нет"));
  const closed = show({ status: "failed", error: PERIOD_ERROR });
  assert.ok(textOf(closed).includes("переоткройте месяц"), "an amber block of its own, not a part of «Что изменится»");
  assert.doesNotMatch(closed, /data-testid="money-effects"/);
  assert.match(closed, /period-closed-reopen/, "the owner may reopen it from here");
  signIn({ org_role: "admin", payments_access: false });
  assert.doesNotMatch(show({ status: "failed", error: PERIOD_ERROR }), /period-closed-reopen/, "an administrator without the right reads the sentence only");
  assert.match(show({ status: "ready", effects: E.normalizeMoneyEffects({ students: [], payroll: [{ month: "2026-10", state: "closed", teacherName: "Каримова К.", sheetId: "s" }], dryRun: true }) }), /border-amber-200/, "a closed month is amber");
});

// ── «Вернуть урок» (a held lesson) and «Вернуть на отметку» ──────────────────────────────────────────

test("«Вернуть урок»: the dialog says what happens, has the reason and the one button; the button waits for the money (the live behaviour is in tests/dom-windows.test.cjs)", () => {
  signIn({ org_role: "owner" });
  const { LessonReturnDialog } = component("groups/lesson-return-dialogs.tsx");
  const markup = html(React.createElement(LessonReturnDialog, { target: { groupId: "g1", lessonId: "l1", lessonDate: "2026-10-28" }, onClose() {}, onDone() {} }));
  const text = textOf(markup);
  for (const part of ["Вернуть урок 28.10?", "Урок станет «не проведён»: отметки сохранятся, а завершить его можно будет заново.", "не входит в зарплату преподавателя", "Причина (обязательно)", "Причина и ваше имя останутся в журнале урока.", "Отмена"]) assert.ok(text.includes(part), part);
  assert.match(markup, /<button[^>]*data-testid="lesson-return-submit"[^>]*disabled=""|<button[^>]*disabled=""[^>]*data-testid="lesson-return-submit"/, "no answer about money yet - the button waits");
  assert.match(text, /Считаем, что изменится…/, "and says why (rule 3: an off button has its line «почему»)");
  assert.equal(html(React.createElement(LessonReturnDialog, { target: null, onClose() {}, onDone() {} })), "");
  // the dry run, the version, the conflict and the real request are read LIVE in tests/dom-windows.test.cjs
});

test("«Вернуть на отметку»: the dialog says the lesson comes back to «Уроки без отметки»; the general deduction line is gone (the dry run names whose deduction it is); the reason is required", () => {
  const { ReturnToReviewDialog } = component("groups/lesson-return-dialogs.tsx");
  const show = () => textOf(html(React.createElement(ReturnToReviewDialog, { target: { groupId: "g1", lessonId: "l1", lessonDate: "2026-10-28" }, onClose() {}, onDone() {} })));
  const centre = show();
  for (const part of ["Вернуть урок на отметку?", "Урок снова появится в «Уроки без отметки»: отметьте на нём посещаемость или отмените его заново.", "В зарплату преподавателя урок войдёт, когда его проведут.", "Причина (обязательно)"]) assert.ok(centre.includes(part), part);
  assert.ok(!centre.includes("исчезнет вычет"), "the general line is gone: the dry run says whose deduction it is");
  assert.match(textOf(html(React.createElement(ReturnToReviewDialog, { target: { groupId: "g1", lessonId: "l1", lessonDate: "2026-10-28" }, onClose() {}, onDone() {} }))), /Вернуть на отметку/);
});

test("the words of the returns: the toast, the reason rules, the refusals in the server's own sentence", () => {
  assert.equal(RET.returnTitle("2026-10-28"), "Вернуть урок 28.10?");
  assert.equal(RET.returnDoneText("2026-10-28", true), "Урок 28.10 возвращён: он снова не проведён");
  assert.equal(RET.returnDoneText("2026-10-28", false), "Урок 28.10 уже не проведён");          // a repeat: nothing is done twice (I-7)
  assert.equal(RET.returnReviewDoneText("2026-10-28"), "Урок 28.10 возвращён в «Уроки без отметки»");
  assert.match(RET.validateReturnReason("ab"), /не короче 3/);
  assert.equal(RET.validateReturnReason("abc"), null);
  assert.match(RET.validateReturnReason("x".repeat(501)), /не длиннее 500/);
  // R3 #11: the lesson was changed after the window read it - the server's sentence, then what the window did about it
  assert.equal(RET.returnErrorText({ code: "ATTENDANCE_CONFLICT", message: "Отметки урока уже изменили. Обновите страницу" }), "Отметки урока уже изменили. Обновите страницу. Мы прочитали урок заново: проверьте последствия и нажмите ещё раз.");
  assert.match(RET.returnErrorText({ code: "ATTENDANCE_CONFLICT" }), /^Отметки урока уже изменили/);
  assert.equal(RET.returnErrorText(Object.assign(new Error("Слова сервера про версию"), { code: "VERSION_REQUIRED" })), "Слова сервера про версию", "a new code: the server's own sentence");
  assert.equal(RET.returnErrorText(Object.assign(new Error("Этот урок был раньше начала учёта центра: вернуть его на разбор нельзя"), { code: "RESTORE_BEFORE_START" })), "Этот урок был раньше начала учёта центра: вернуть его на разбор нельзя");
  assert.equal(RET.returnErrorText(Object.assign(new Error("Сейчас идёт урок группы"), { code: "LESSON_IN_PROGRESS" })), "Сейчас идёт урок группы");
  assert.equal(RET.returnErrorText(Object.assign(new Error("Отметки урока уже изменили"), { code: "ATTENDANCE_CONFLICT" })), "Отметки урока уже изменили. Мы прочитали урок заново: проверьте последствия и нажмите ещё раз.");
  assert.equal(RET.returnErrorText({ code: "LESSON_NOT_HELD" }), "Проведённого урока нет: возвращать нечего. Обновите страницу");
  // R3 m7: ONE helper makes the toast of every return / correction / decision
  const toast = E.toastWithEffects({ moneyEffects: { students: [], payroll: [{ month: "2026-10", state: "open", teacherName: "Каримова К.", sheetId: "s", changedBy: -50000 }], dryRun: false } });
  assert.match(toast.details.map(plain).join(" | "), /^Зарплата за [а-я0-9 ]+ уменьшилась: \| Каримова К\. — −50 000 сум$/);
  assert.equal(toast.tone, "success", "an open month: an ordinary change, not a call to act");
  assert.deepEqual(E.toastWithEffects(null), { tone: "success", details: [] });
  assert.equal(RET.returnDoneDetails, undefined, "no second way to word the toast");
});

// ── the money of a correction and of a decision on an excuse, BEFORE ──────────────────────────────────

test("the correction of a held lesson: the dry run (impact) is asked for the money right, the button waits for it, a closed month has the way out; the teacher reads the rule in words", () => {
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  // R3 #24 (item 12): the teacher of the lesson asks the dry run too - his block has the month and the state of the sheet, no sums
  assert.match(journal, /const impactKey = correctionDialog && correcting && correctingLesson\s*\?/);
  assert.doesNotMatch(journal, /const impactKey = [^;]*moneyRight/);
  assert.match(journal, /orgApi\.attendanceCorrectionImpact\(groupId, \{ lessonDate: correctingLesson\.date, lessonId: correctingLesson\.id, records: correcting\.draft \}, signal\)/);
  assert.match(journal, /if \(!effectsAllowConfirm\(impact\)\) return;/);
  assert.match(journal, /disabled=\{correctionSaving \|\| correctionChanges\.length === 0 \|\| !effectsAllowConfirm\(impact\)\}/);
  assert.match(journal, /<MoneyEffectsBlock preview=\{impact\} onRetry=\{retryImpact\} \/>/);
  assert.doesNotMatch(journal, /correction-money-note/, "no general note instead of the block");
  assert.match(journal, /closed: periodClosedOf\(err\)/);
  assert.match(journal, /<PeriodClosedNotice\s+info=\{correctionDialog\.closed\}/);
  assert.match(journal, /const money = toastWithEffects\(saved\);\s*showToast\(`Урок \$\{date\} исправлен`, money\.tone, money\.details\)/);
  assert.doesNotMatch(journal, /returnDoneDetails|effectLines\(moneyEffectsOf/, "one helper for the toasts of money");
  assert.equal(COR.TEACHER_CORRECTION_MONEY_NOTE, undefined, "the rule in words is replaced by the real block");
  assert.match(read("src/lib/api.ts"), /attendanceCorrectionImpact: \(groupId: string, body: \{ lessonDate: string; lessonId: string; records: Record<string, string> \}, signal\?: AbortSignal\) =>\s*api<\{ ok: boolean; moneyEffects: unknown \}>\(`\/auth\/org\/groups\/\$\{encodePathId\(groupId\)\}\/attendance\/impact`/);
});

test("the decision on an excuse: ONE excuse asks the dry run and its button waits; «Сбросить решение» asks first with the money of THIS reset", () => {
  const dialog = read("src/components/attendance/excuse-decision-dialog.tsx");
  assert.match(dialog, /const single = target && target\.items\.length === 1 \? target\.items\[0\] : null;/);
  assert.match(dialog, /const moneyReady = !single \|\| effectsAllowConfirm\(preview\);/);
  assert.match(dialog, /const canSubmit = canSubmitExcuseDecision\(noteMode, note, busy\) && moneyReady;/);
  assert.match(dialog, /\{single && <MoneyEffectsBlock preview=\{preview\} onRetry=\{retry\} className="mt-3" \/>\}/);
  const q = XD.resetDecisionQuestion(["Иванов Иван: занятие вернётся в пакет", "Изменится ведомость: Каримова К., октябрь 2026"]);
  assert.equal(q.title, "Сбросить решение по пропуску?");
  assert.equal(q.confirmLabel, "Сбросить решение");
  assert.equal(q.cancelLabel, "Отмена");
  assert.equal(q.message.split("\n").slice(-2).join(" | "), "Иванов Иван: занятие вернётся в пакет | Изменится ведомость: Каримова К., октябрь 2026");
  assert.match(q.message, /Что изменится:/);
  assert.match(XD.resetDecisionQuestion([]).message, /деньги не изменятся: пакеты учеников и сохранённая зарплата не затронуты/);
  assert.doesNotMatch(XD.resetDecisionQuestion(null).message, /деньги/, "an older server: nothing is claimed about the money");
  const helper = read("src/components/attendance/confirm-excuse-reset.ts");
  assert.match(helper, /orgApi\.resetAttendanceExcuse\(excuse\.id, \{ expected_status: excuse\.status \}, \{ dryRun: true \}\)/);
  for (const file of ["src/components/attendance/excuses-page.tsx", "src/components/groups/group-attendance-journal.tsx"]) {
    const source = read(file);
    assert.match(source, /confirmExcuseReset\(/, file);
    assert.ok(source.indexOf("confirmExcuseReset(") < source.indexOf("orgApi.resetAttendanceExcuse(") , `${file}: asked before the reset is sent`);
  }
  const api = read("src/lib/api.ts");
  assert.match(api, /\/review\$\{options\?\.dryRun \? "\?dry_run=true" : ""\}/);
  assert.match(api, /\/reset\$\{options\?\.dryRun \? "\?dry_run=true" : ""\}/);
});

test("the list of excuses: without the money right no «Подтвердить» / «Отклонить» / «Сбросить», one line says why, the certificate stays", () => {
  const page = read("src/components/attendance/excuses-page.tsx");
  assert.match(page, /const moneyRight = canManageMoney\(user\);/);
  assert.match(page, /if \(!moneyRight\) return \[attach\];/);
  assert.match(page, /\{pendingTab && moneyRight && \(/);
  assert.match(page, /\{tab === "rejected" && moneyRight && \(/);
  assert.match(page, /\{!moneyRight && <p data-testid="excuses-no-money-right"[^>]*>\{MONEY_RIGHT_TEXT\}\. Вы можете прикладывать справки и смотреть решения\.<\/p>\}/);
  assert.equal(E.MONEY_RIGHT_TEXT, "Это действие меняет деньги: его выполняет владелец или администратор с доступом к деньгам");
});

// ── «кто провёл» ───────────────────────────────────────────────────────────────────────────────────────

test("who taught: the planned teacher by default (nothing is sent), `taughtBy` only for another one; the pay note names both", () => {
  assert.equal(REC.plannedTeacherId({ currentTeacherId: "sub", defaultTeacherId: "main" }), "sub");
  assert.equal(REC.plannedTeacherId({ currentTeacherId: null, defaultTeacherId: "main" }), "main");
  assert.equal(REC.plannedTeacherId(null), null);
  assert.equal(REC.taughtByOf("main", "main"), undefined);
  assert.equal(REC.taughtByOf("other", "main"), "other");
  assert.equal(REC.taughtByOf(null, "main"), undefined);
  assert.equal(REC.taughtByOf("other", null), "other", "a lesson with no planned teacher: the chosen one is named");
  assert.equal(REC.reconcilePayNote({ lessonDate: "2026-10-12", pickName: "Рахимов Т.", plannedName: "Каримова К." }), "Оплата за урок 12.10 пойдёт Рахимов Т., а не Каримова К.");
  assert.equal(REC.reconcilePayNote({ lessonDate: "2026-10-12", pickName: "Рахимов Т.", plannedName: "Каримова" }), "Оплата за урок 12.10 пойдёт Рахимов Т., а не Каримова.");
  assert.equal(REC.reconcilePayNote({ lessonDate: "2026-10-12", pickName: "Каримова К.", plannedName: "Каримова К." }), null);
  const { ReconcileLessonDialog } = component("groups/reconcile-lesson-dialog.tsx");
  const text = textOf(html(React.createElement(ReconcileLessonDialog, { target: { groupId: "g1", lessonId: "l1", lessonDate: "2026-10-12" }, onClose() {}, onDone() {} })));
  for (const part of ["Отметить посещаемость", "оформляется задним числом", "Оплата за урок пойдёт тому, кто его провёл", "Оформить урок"]) assert.ok(text.includes(part), part);
  const src = read("src/components/groups/reconcile-lesson-dialog.tsx");
  assert.match(src, /\.\.\.\(taughtBy \? \{ taughtBy \} : \{\}\)/);
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  // R3 #25: «Кто провёл» starts with the teacher of the row of «Уроки без отметки» (the link carries `teacher=`), only for the lesson the person came for
  assert.match(journal, /if \(action === "reconcile"\) \{[\s\S]*?setReconcileTarget\(\{ groupId, lessonId: lesson\.id, lessonDate: lesson\.date, topic: lesson\.topic, teacherId: fromRow \}\);\s*return;/);
  assert.match(journal, /highlightTarget && highlightTarget\.lessonId === lesson\.id && highlightTarget\.date === lesson\.date \? highlightTeacherId : null/);
  assert.match(read("src/components/groups/group-detail-view.tsx"), /highlightTeacherId=\{searchParams\?\.get\("teacher"\)\}/);
  assert.match(src, /setPick\(fromRow \?\? plannedTeacherId\(result\)\)/);
  assert.match(src, /const planned = \(target\?\.teacherId && candidates\.some\(\(candidate\) => candidate\.teacherId === target\.teacherId\) \? target\.teacherId : null\) \?\? plannedTeacherId\(list\);/);
  const href = OPEN.journalHref("/owner/groups", { groupId: "g1", lessonDate: "2026-10-12", lessonId: "l1", teacherId: "11111111-2222-3333-4444-555555555555" });
  assert.match(href, /&lesson=l1&date=2026-10-12&teacher=11111111-2222-3333-4444-555555555555$/);
  assert.doesNotMatch(OPEN.journalHref("/owner/groups", { groupId: "g1", lessonDate: "2026-10-12", lessonId: "l1" }), /teacher=/);
  assert.doesNotMatch(OPEN.journalHref("/owner/groups", { groupId: "g1", lessonDate: "2026-10-12", lessonId: "l1", teacherId: "bad value" }), /teacher=/, "a teacher that is not an id is left out");
});

// ── «Завершить», когда никто не пришёл ────────────────────────────────────────────────────────────────

test("nobody came: 409 NOBODY_CAME is its own kind of refusal; the question says the lesson will be PAID and where the other road is; `confirmNobodyCame` goes only after the yes", () => {
  const failure = OPS.lessonFailure({ status: 409, code: "NOBODY_CAME", message: "Никто не пришёл. Если завершить, урок будет считаться проведённым и оплачен преподавателю. Если урока не было, нажмите «Урока не было»" }, "finish", "x");
  assert.equal(failure.kind, "nobody_came");
  assert.match(failure.text, /оплачен преподавателю|войдёт в зарплату/);
  assert.equal(OPS.isNobodyCame, undefined, "dead code is gone: the kind of the failure is `nobody_came`");
  // UX pack №21: the title says «Никто не пришёл?», the text does not repeat it: the sentence of the SERVER about the money (when it came) + the other road
  assert.equal(OPS.nobodyCameQuestion("Никто не пришёл. Если завершить, урок будет считаться проведённым и войдёт в зарплату преподавателя").message, "Если завершить, урок будет считаться проведённым и войдёт в зарплату преподавателя.\n" + OPS.NOBODY_CAME_OTHER_ROAD);
  assert.equal(OPS.nobodyCameQuestion("Никто не пришёл. Слова сервера.").message, "Слова сервера.\n" + OPS.NOBODY_CAME_OTHER_ROAD);
  assert.equal(OPS.nobodyCameQuestion("  ").message, OPS.NOBODY_CAME_FALLBACK_QUESTION + "\n" + OPS.NOBODY_CAME_OTHER_ROAD);
  assert.equal(OPS.nobodyCameQuestion().message, OPS.NOBODY_CAME_FALLBACK_QUESTION + "\n" + OPS.NOBODY_CAME_OTHER_ROAD);
  assert.equal(OPS.nobodyCameQuestion("Никто не пришёл. Урок войдёт в зарплату. Если урока не было, нажмите «Урока не было»").message, "Урок войдёт в зарплату. Если урока не было, нажмите «Урока не было».", "the server already names the other road - it is not said twice");
  const q = OPS.nobodyCameQuestion();
  assert.equal(q.title, "Никто не пришёл?");
  assert.doesNotMatch(q.message, /^Никто не пришёл/, "the text does not repeat the title");
  assert.equal(q.confirmLabel, "Завершить урок");
  assert.equal(q.cancelLabel, "Отмена");
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /if \(failure\.kind === "nobody_came"\) \{ nobodyCame = failure\.text; return false; \}/);
  // R3 #8: the FIRST request already says `confirmNobodyCame: false`; only the second one, after the yes, says true
  assert.match(journal, /status: "completed",[\s\S]{0,400}?\n\s*confirmNobodyCame,/);
  assert.match(journal, /if \(nobodyCame !== null\) \{\s*if \(!\(await askConfirm\(nobodyCameQuestion\(nobodyCame\)\)\)\) return "stopped";\s*return finishLesson\(lesson, acknowledgeLiveExam, true\);/);
  const panel = read("src/lib/use-teacher-lesson-panel.ts");
  assert.match(panel, /if \(failure\.kind === "nobody_came"\) askNobody = failure\.text;/);
  assert.match(panel, /if \(askNobody !== null && \(await askConfirm\(nobodyCameQuestion\(askNobody\)\)\)\) await handleFinishLesson\(acknowledgeLiveExam, marks, true\);/);
  assert.match(panel, /\n\s*confirmNobodyCame,\s*\/\/ R3 #8/, "the first request carries the flag too (false)");
  assert.equal((panel.match(/handleFinishLesson\(acknowledgeLiveExam, marks, true\)/g) || []).length, 1, "true goes only with the second try");
  assert.equal((journal.match(/finishLesson\(lesson, acknowledgeLiveExam, true\)/g) || []).length, 1, "true goes only with the second try");
  assert.match(journal, /confirmNobodyCame = false\): Promise/, "the default is false");
});

// ── the journal: «было → стало», «оформлен задним числом» ──────────────────────────────────────────────

const NAMES = { s1: "Иванов Иван", s2: "Петрова Мария" };
const nameOf = (id) => NAMES[id] || "Ученик";

test("«Исправлено» tells the whole fate of the lesson: the last correction with «было → стало», then the earlier corrections and a return, newest first", () => {
  const correction = {
    by_name: "Арслан", at: "2026-11-05T05:30:00", reason: "преподаватель ошибся, ученик был", changes: [{ studentId: "s1", from: "absent", to: "present" }, { studentId: "s2", from: null, to: "late" }],
    history: [
      { kind: "returned", by_name: "Лола", at: "2026-11-04T08:00:00", reason: "нажали по ошибке", changes: [] },
      { kind: "corrected", by_name: "Лола", at: "2026-11-03T08:00:00", reason: "опечатка", changes: [{ studentId: "s1", from: "present", to: "absent" }] },
    ],
  };
  const lines = COR.correctionHintLines(correction, nameOf);
  assert.equal(lines[0], "Исправлено: Арслан, 05.11.2026 10:30");
  assert.equal(lines[1], "Причина: преподаватель ошибся, ученик был");
  assert.equal(lines[2], "Иванов Иван: Не был → Был");
  assert.equal(lines[3], "Петрова Мария: нет отметки → Опоздал");
  assert.deepEqual(lines.slice(4, 8), ["", "Возвращён в «не проведён»: Лола, 04.11.2026 13:00", "Причина: нажали по ошибке", ""]);
  assert.ok(lines.includes("Иванов Иван: Был → Не был"));
  assert.ok(lines.indexOf("Возвращён в «не проведён»: Лола, 04.11.2026 13:00") < lines.indexOf("Исправлено: Лола, 03.11.2026 13:00"), "newest first");
  // an older server sends neither: the head and the reason only
  assert.deepEqual(COR.correctionHintLines({ by_name: "А", at: null, reason: null }, nameOf), ["Исправлено: А"]);
  assert.equal(COR.markWord("excused"), "Уважительная");
  assert.equal(COR.markWord(undefined), "нет отметки");
  assert.equal(COR.changeLine({ studentId: "zz", from: "late", to: null }, nameOf), "Ученик: Опоздал → нет отметки");
});

test("R3 item 13: `corrections[key].kind` - a lesson that was only RETURNED says «Урок возвращали», a corrected one «Исправлено»; an older server (no kind) is «Исправлено»", () => {
  assert.equal(COR.correctionChipLabel({ kind: "returned" }), "Урок возвращали");
  assert.equal(COR.correctionChipLabel({ kind: "corrected" }), "Исправлено");
  assert.equal(COR.correctionChipLabel({}), "Исправлено");
  const lines = COR.correctionHintLines({ kind: "returned", by_name: "Лола", at: "2026-11-04T08:00:00", reason: "нажали по ошибке", changes: [] }, nameOf);
  assert.deepEqual(lines, ["Возвращён в «не проведён»: Лола, 04.11.2026 13:00", "Причина: нажали по ошибке"]);
  assert.match(read("src/components/groups/group-attendance-journal.tsx"), /\{correctionChipLabel\(correction\)\}/);
});

test("«Оформлен задним числом»: who and when, and who taught it when that is not the planned teacher; the chip is in the head of the column", () => {
  assert.deepEqual(COR.backdatedHintLines({ by_name: "Арслан", at: "2026-11-05T05:30:00", taught_by_name: null }), ["Оформлен задним числом: Арслан, 05.11.2026 10:30"]);
  assert.deepEqual(COR.backdatedHintLines({ by_name: "Арслан", at: "2026-11-05T05:30:00", taught_by_name: "Рахимов Т." }), ["Оформлен задним числом: Арслан, 05.11.2026 10:30", "Провёл: Рахимов Т."]);
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /\{attendanceData\?\.backdated\?\.\[key\] && chipPlan\.backdated && \(\s*<div>\s*<Hint\s+text=\{backdatedHintLines\(attendanceData\.backdated\[key\]\)\.join\("\\n"\)\}/);
  assert.match(journal, /\{BACKDATED_LABEL\}/);
  assert.equal(COR.BACKDATED_LABEL, "Оформлен задним числом");
});

test("the journal words the teacher's panel: the teacher corrects his OWN held lesson in the journal within 7 days; older - the administrator", () => {
  const near = lib("lesson-panel-view.ts").completedLessonNote({ tooOld: false });
  assert.equal(near.text, "Отметки зафиксированы. Если ошиблись, исправьте их в журнале группы — в течение 7 дней, с причиной.");
  assert.equal(near.journalLink, true);
  const old = lib("lesson-panel-view.ts").completedLessonNote({ tooOld: true });
  assert.equal(old.text, "Отметки зафиксированы. Исправить их может только администратор — с причиной.");
  assert.equal(old.journalLink, false);
});

// ── the archive ───────────────────────────────────────────────────────────────────────────────────────

test("the archive (C2, the server's fixture): the missed lessons are LISTED and what the cancellation does to the money is said BEFORE the choice, ticked or not (UX pack №6)", () => {
  const impact = fixture("logB", "c2_archive_blocked").body.detail;
  const view = ARC.archiveDialogView({ ...impact, groupId: "g", groupName: "7-А", status: "active", canArchive: false }, false);
  assert.deepEqual(view.missedLessons, ["пн, 19 октября · 10:00–11:30 · Петров П."]);
  assert.equal(view.cancelConsequence, "Если отменить эти уроки при архивации, ученикам перерасчёта не будет, а в зарплату преподавателей они не войдут. Если уроки были — сначала отметьте посещаемость");
  assert.equal(view.canSubmit, false);
  const ticked = ARC.archiveDialogView({ ...impact, groupId: "g", groupName: "7-А", status: "active", canArchive: false }, true);
  assert.equal(ticked.cancelConsequence, view.cancelConsequence, "also after the tick: the confirmation carries it");
  const { ArchiveDialogBody } = component("groups/group-archive-dialog.tsx");
  const draw = (cancelMissed) => html(React.createElement(ArchiveDialogBody, {
    impact: { ...impact, groupId: "g", groupName: "7-А", status: "active", canArchive: false }, view: ARC.archiveDialogView({ ...impact, groupId: "g", groupName: "7-А", status: "active", canArchive: false }, cancelMissed),
    loadError: null, cancelMissed, reason: "", reasonProblem: null, busy: false, error: null, onRetry() {}, onCancelMissed() {}, onReason() {}, onTransfer() {}, onArchiveStudent() {},
  }));
  for (const markup of [draw(false), draw(true)]) {
    const text = textOf(markup);
    assert.ok(text.includes("пн, 19 октября · 10:00–11:30 · Петров П."));
    assert.ok(text.includes("Ученикам перерасчёта не будет, а в зарплату преподавателей они не войдут."));
    assert.ok(text.includes("Если урок был — сначала отметьте посещаемость."), "the advice is a whole sentence, in the amber block");
    assert.ok(text.indexOf("Если урок был") < text.indexOf("Урока не было — отменить его при архивации"), "the advice stands above the choice, the consequence under it");
    assert.match(markup, /data-testid="archive-missed-consequence"/);
  }
  // a long list is capped, the rest is counted; a group with nothing missed says nothing
  const many = Array.from({ length: 11 }, (_, i) => ({ lessonId: `l${i}`, lessonDate: `2026-10-${String(i + 1).padStart(2, "0")}`, startTime: "10:00", endTime: "11:00", teacherName: null }));
  const lines = ARC.missedLessonLines(many, 11);
  assert.equal(lines.length, 9);
  assert.equal(lines[8], "и ещё 3");
  assert.equal(ARC.missedLessonLine({ lessonDate: "2026-10-05" }), "пн, 5 октября");
  const clean = ARC.archiveDialogView({ groupId: "g", groupName: "x", status: "active", canArchive: true, blockers: [] }, false);
  assert.deepEqual([clean.missedLessons, clean.cancelConsequence], [[], null]);
});

// ── the pause ──────────────────────────────────────────────────────────────────────────────────────────

test("the pause: the 30 days are gone from the form (the closed month is the rule); a lesson in progress and a closed month are said in the server's words, with the way out", () => {
  assert.equal(PAY.validatePause({ first: "2026-08-01", last: "2026-08-10", reason: "" }, "2026-11-05"), null);
  assert.equal(PAY.pauseEarliest, undefined);
  assert.equal(PAY.PAUSE_BACKDATE_HINT, "Задним числом можно, пока месяц не закрыт");
  assert.match(PAY.validatePause({ first: "2026-10-10", last: "2028-01-01", reason: "" }, "2026-11-05"), /не длиннее 366 дней/);
  const inProgress = { status: 409, code: "LESSON_IN_PROGRESS", message: "Сейчас идёт урок группы: поставить паузу можно после его завершения или отмены", detail: { code: "LESSON_IN_PROGRESS", message: "Сейчас идёт урок группы: поставить паузу можно после его завершения или отмены" } };
  assert.equal(PAY.logicaError(inProgress).message, "Сейчас идёт урок группы: поставить паузу можно после его завершения или отмены");
  assert.equal(CP.periodClosedOf(inProgress), null, "an idle lesson is not a closed month");
  const locked = { status: 422, code: "PAUSE_LOCKED", message: "Месяц преподавателя закрыт ведомостью: паузу за эти дни не изменить. Владелец или администратор с правом оплат может переоткрыть месяц", detail: { code: "PAUSE_LOCKED", month: "2026-10", teacherId: "t1", teacherName: "Каримова К.", message: "Месяц октябрь 2026 у преподавателя Каримова К. закрыт" } };
  assert.equal(CP.periodClosedOf(locked).teacherId, "t1");
  const dialog = read("src/components/payments/pause-dialog.tsx");
  assert.doesNotMatch(dialog, /min=\{pauseEarliest/);
  assert.match(dialog, /\{PAUSE_BACKDATE_HINT\}\. Дни паузы не входят/);
  assert.match(dialog, /closed: periodClosedOf\(cause\)/);
  assert.match(dialog, /setErrorClosed\(periodClosedOf\(cause\)\)/);
  assert.match(dialog, /<PeriodClosedNotice info=\{errorClosed\}/);
});

// ── the decision on an additional lesson ───────────────────────────────────────────────────────────────

test("a decision on an additional lesson: the rule in ONE sentence (for HOW MANY students it counts - «Не был» too), the owner's estimate only where the month has no saved sheet, nothing for «Не включать»; reversible while the month is open", () => {
  const item = { studentsPaid: 3, moneyEstimate: { amount: 38000, reason: null } };
  assert.deepEqual(OO.decisionPayLines(item, "pay").map(plain), ["Преподавателю ≈ 38 000 сум"]);
  assert.deepEqual(OO.decisionPayLines({ studentsPaid: 5 }, "pay"), [], "the administrator has no sum (LESSONS 45)");
  assert.deepEqual(OO.decisionPayLines({ studentsPaid: 0, moneyEstimate: { amount: null, reason: "NO_STUDENTS" } }, "pay"), ["У урока нет учеников — суммы нет"]);
  assert.deepEqual(OO.decisionPayLines({ studentsPaid: 2, moneyEstimate: { amount: null, reason: "RATE_MISSING" } }, "pay"), ["Ставка преподавателя не задана — сумму посчитать нельзя"]);
  assert.deepEqual(OO.decisionPayLines(item, "skip"), []);
  assert.deepEqual(OO.decisionPayLines(item, "pay", false), [], "the sheet names its own sum: the estimate is not said twice");
  assert.deepEqual(OO.decisionPayLines({}, "pay"), [], "an older server: nothing is claimed");
  assert.equal(OO.decisionNote("pay", 3), "Ученикам урок бесплатный. В зарплату входят все 3 ученика, включая «Не был». Решение можно отменить, пока месяц не закрыт.");
  assert.equal(OO.decisionNote("pay"), "Ученикам урок бесплатный. В зарплату входят все ученики, включая «Не был». Решение можно отменить, пока месяц не закрыт.");
  assert.equal(OO.decisionNote("skip"), "Ученикам урок бесплатный. В зарплату преподавателя он не войдёт. Решение можно отменить, пока месяц не закрыт.");
  assert.equal(OO.decisionQuestion({ teacher: { name: "Эргашев К." } }, "pay"), "Включить урок в зарплату Эргашева К.?");
  assert.equal(OO.decisionQuestion({ teacher: { name: "Ким А." } }, "skip"), "Не включать урок в зарплату преподавателя?", "a surname that does not decline reliably is not guessed");
  assert.equal(OO.canUndoDecision({ purpose: "extra", money: "paid" }, true), true);
  assert.equal(OO.canUndoDecision({ purpose: "extra", money: "none" }, true), true);
  assert.equal(OO.canUndoDecision({ purpose: "extra", money: "wait" }, true), false, "nothing was decided");
  assert.equal(OO.canUndoDecision({ purpose: "makeup", money: "paid" }, true), false);
  assert.equal(OO.canUndoDecision({ purpose: "extra", money: "paid" }, false), false);
  const { UndoDecisionDialog } = component("groups/undo-decision-dialog.tsx");
  const paid = textOf(html(React.createElement(UndoDecisionDialog, { target: { lessonId: "l1", lessonDate: "2026-10-28", money: "paid" }, onClose() {}, onDone() {} })));
  for (const part of ["Исключить урок из зарплаты преподавателя?", "Дополнительный урок · ", "Урок снова будет ждать решения «Включить в зарплату / Не включать» в «Заменах».", "Отменить решение"]) assert.ok(paid.includes(part), part);
  // D-5: what it does to the sheet is the block of the dry run (not a sentence of the window that says it without the numbers)
  assert.ok(!paid.includes("Сейчас урок оплачивается преподавателю"), "the fixed sentence is the block of the preview now");
  assert.equal(OO.UNDO_DECISION_PAID_NOTE, undefined);
  const none = textOf(html(React.createElement(UndoDecisionDialog, { target: { lessonId: "l1", lessonDate: "2026-10-28", money: "none" }, onClose() {}, onDone() {} })));
  assert.ok(!none.includes("Сейчас урок оплачивается"));
  const block = read("src/components/substitutions/one-off-decisions.tsx");
  assert.match(block, /decisionPayLines\(dialog\.item, dialog\.decision, /);
  assert.match(block, /ConfirmFooter/, "rule 3: one footer");
  assert.match(read("src/components/groups/undo-decision-dialog.tsx"), /orgApi\.decideOneOffMoney\(target\.lessonId, "undo", \{ dryRun: true, signal \}\)/);
  assert.match(read("src/components/groups/undo-decision-dialog.tsx"), /orgApi\.decideOneOffMoney\(target\.lessonId, "undo"\)/);
  // R2-2б: the toast of the undo carries the money of it - in all three places that take a decision back (the decided list, the journal, the sheet of the lesson)
  assert.match(read("src/components/substitutions/decided-one-offs.tsx"), /showToast\(undoToastText\(done\.money, done\.teacherName, movedByOf\(result\)\), "success"\)/);
  assert.match(read("src/components/groups/group-attendance-journal.tsx"), /showToast\(undoToastText\(done\.money, done\.teacherName, movedByOf\(result\)\), "success"\)/);
  assert.match(read("src/components/groups/lesson-action-sheet.tsx"), /onChanged\(undoToastText\(done\.money, done\.teacherName, movedByOf\(result\)\), \[\]\)/);
  assert.match(read("src/components/groups/group-attendance-journal.tsx"), /undoDecision: canUndoDecision\(lesson, moneyRight\)/);
});

// ── the payments: what they did to the sheets ──────────────────────────────────────────────────────────

test("payments, forgiveness, refunds: the toast is the STUDENT's (UX pack §5.1-тер); rates and the divisor show `money_effects` of the answer through ONE helper", () => {
  for (const file of ["src/components/payments/payments-page.tsx", "src/components/payments/statement-view.tsx", "src/components/payments/membership-row-actions.tsx", "src/components/payments/membership-payments.tsx", "src/components/groups/group-payments-tab.tsx"]) {
    assert.match(read(file), /studentToast\(/, file);
    assert.doesNotMatch(read(file), /toastWithEffects/, `${file}: the pay of the teachers is not in a toast of a payment`);
  }
  assert.match(read("src/app/owner/teachers/page.tsx"), /toastWithEffects\(/);
  assert.match(read("src/app/owner/settings/page.tsx"), /effectLines\(moneyEffectsOf\(updated\), \{ done: true \}\)/);
  const statement = read("src/components/payments/statement-view.tsx");
  assert.equal((statement.match(/studentToast\(/g) || []).length, 5, "create, correct, cancel a payment; cancel a write-off; cancel a refund");
  const { DivisorEffects } = component("payroll/divisor-effects.tsx");
  assert.equal(html(React.createElement(DivisorEffects, { lines: [] })), "");
  assert.ok(textOf(html(React.createElement(DivisorEffects, { lines: ["Ведомость Каримова К., октябрь 2026: +50 000 сум к сохранённой — пересохраните её"] }))).includes("+50 000 сум к сохранённой"));
  // the answers in the shape of the server (pay2 fixtures + the new block)
  const voided = { payment: { id: "p" }, row: {}, money_effects: { students: [], payroll: [{ month: "2026-10", state: "closed", teacherName: "Каримова К.", sheetId: "s", teacherId: "t", changedBy: -125000 }], text: "", dryRun: false } };
  const note = E.toastWithEffects(voided);
  assert.equal(note.tone, "warning", "a closed month: the sheet is to be saved again");
  assert.match(plain(note.details[0]), /^Зарплата за [а-я0-9 ]+ уменьшилась:$/);
  assert.equal(plain(note.details[1]), "Каримова К. — −125 000 сум");
  assert.match(plain(note.details[2]), /закрыт: сохраните новую сумму, чтобы она вошла в выплату\.$/);
});

// ── the rights in the rest of the screens ──────────────────────────────────────────────────────────────

test("an administrator without the money right: «Перевести в другую группу» is OFF with its reason (UX pack №7), no «Пауза…», a read-only «Тип занятий»; the owner and an administrator with the right keep them on", () => {
  const { StudentGroupsBlock } = component("students/student-groups-block.tsx");
  const profile = { student: { status: "active", full_name: "Иванов Иван" }, groups: [{ membership_id: "m1", group_id: "g1", group_name: "7-А", teacher_id: "t", teacher_name: "К", class_level: 7, is_primary: true, joined_at: "2026-09-01" }] };
  const draw = (moneyRight) => html(React.createElement(StudentGroupsBlock, { profile, groupsBasePath: "/owner/groups", isTeacher: false, moneyRight, onAssign() {} }));
  assert.match(draw(true), /data-testid="enrol-transfer"/);
  assert.doesNotMatch(draw(true), /enrol-transfer-why/, "the owner is not told why");
  assert.match(draw(false), /data-testid="enrol-transfer"[^>]*>|<button[^>]*disabled=""[^>]*data-testid="enrol-transfer"/, "off, not hidden");
  assert.match(draw(false), /disabled=""[^>]*aria-describedby="enrol-transfer-why"|aria-describedby="enrol-transfer-why"[^>]*disabled=""/);
  assert.match(textOf(draw(false)), /Перевод переносит деньги ученика — его делает владелец или администратор с доступом к деньгам\./);
  assert.match(draw(false), /data-testid="enrol-add"/, "adding to a group moves no money");
  assert.match(html(React.createElement(StudentGroupsBlock, { profile, groupsBasePath: "/owner/groups", isTeacher: false, onAssign() {} })), /data-testid="enrol-add"/);
  assert.match(html(React.createElement(StudentGroupsBlock, { profile, groupsBasePath: "/owner/groups", isTeacher: false, onAssign() {} })), /enrol-transfer-why/, "an absent flag is no right: off, with the reason");
  const block = read("src/components/students/student-groups-block.tsx");
  assert.match(block, /\.filter\(\(entry\) => moneyRight \|\| entry\.key !== "pause"\)/);
  const group = read("src/components/groups/group-detail-view.tsx");
  assert.match(group, /disabled=\{!moneyRight\}/);
  assert.match(group, /\{moneyRight \? LESSON_TYPE_EDIT_NOTE : LESSON_TYPE_NO_RIGHT_NOTE\}/);
  assert.equal(lib("group-lesson-type.ts").LESSON_TYPE_NO_RIGHT_NOTE, "Тип занятий меняет зарплату преподавателя: его меняет владелец или администратор с доступом к деньгам");
  assert.match(read("src/components/groups/group-student-table.tsx"), /canTransfer: Boolean\(canRemove && onTransfer && !isTeacher\)/);
  assert.match(read("src/components/groups/group-student-table.tsx"), /disabled: !moneyRight, hint: moneyRight \? undefined : TRANSFER_NO_RIGHT_TEXT/, "the roster: the item is off with its reason");
  assert.match(read("src/components/groups/lesson-action-sheet.tsx"), /canChangeKind\(canChooseKind && moneyRight, cancellationKind\)/);
  assert.match(read("src/components/students/student-profile-view.tsx"), /moneyRight=\{canManageMoney\(user\)\}/);
});

// ── R3 #1 (item 4): the days off, the money right only ───────────────────────────────────────────────────

test("R3 item 4: the days off are given, cancelled and continued only with the money right; the journal is for every manager; an administrator without the flag and a teacher see the reason", () => {
  const { DaysOffPanel } = component("schedule/days-off-panel.tsx");
  const draw = (user) => { signIn(user); return html(React.createElement(DaysOffPanel)); };
  assert.match(draw({ org_role: "owner" }), /data-testid="day-off-new"/);
  assert.match(draw({ org_role: "admin", payments_access: true }), /data-testid="day-off-new"/);
  for (const user of [{ org_role: "admin", payments_access: false }, { org_role: "admin" }]) {
    const markup = draw(user);
    assert.doesNotMatch(markup, /data-testid="day-off-new"/);
    assert.match(markup, /data-testid="day-off-no-right"/);
    assert.match(markup, /Журнал выходных вы видите/);
    assert.match(markup, /Выходной день центра/, "the journal is there");
  }
  const src = read("src/components/schedule/days-off-panel.tsx");
  assert.match(src, /\{moneyRight && day\.active && day\.dateTo >= formatBusinessDate\(\) && <button/, "no «Отменить» without the right");
  assert.match(src, /\{moneyRight && <button type="button" onClick=\{\(\) => void proceed\(\)\}/, "no «Продолжить» without the right");
});
