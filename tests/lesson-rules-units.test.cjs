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
const TC = require(path.join(root, "src/lib/teacher-cancel.ts"));
const O = require(path.join(root, "src/lib/substitution-outcome.ts"));
const answers = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "lessonRules", `${name}.json`), "utf8"));
/** What `api()` throws for a refusal of the server: an Error with the `code` and the whole `detail`. */
const refusalOf = (detail) => Object.assign(new Error(detail.message), { code: detail.code, detail });
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("the window of the teacher: the sentence says the number of the ANSWER (windowDays), never a copy; without a number it names none", () => {
  assert.equal(Err.lessonTooOldText(14), "Урок старше 14 дн. — его закрывает администратор или владелец.");
  assert.equal(Err.lessonTooOldText(1), "Урок старше 1 дн. — его закрывает администратор или владелец.");
  assert.equal(Err.lessonTooOldText(30), "Урок старше 30 дн. — его закрывает администратор или владелец.");
  assert.equal(Err.lessonTooOldText(undefined), "Урок старше срока центра — его закрывает администратор или владелец.");
  assert.equal(Err.lessonTooOldText(0), "Урок старше срока центра — его закрывает администратор или владелец.");
  // the refusal of the server (the real answer, window 7): the screen shows the server's sentence as it is
  const refusal = answers("refusals").withdraw_too_old.detail;   // the real LESSON_TOO_OLD (refusals.lesson_too_old_save of the new unload is an ATTENDANCE_CONFLICT)
  const failure = Ops.lessonFailure(refusalOf(refusal), "finish", "x");
  assert.deepEqual([failure.kind, failure.text], ["too_old", refusal.message]);
  // the real ATTENDANCE_CONFLICT of a save: a conflict, in the words of the server
  const conflict = answers("attendance_conflict_save").detail;
  const clash = Ops.lessonFailure(refusalOf(conflict), "save", "x");
  assert.deepEqual([clash.kind, clash.text], ["conflict", conflict.message]);
  // a refusal without the sentence: the number still comes from the detail
  assert.equal(Ops.lessonFailure(refusalOf({ code: "LESSON_TOO_OLD", message: "", windowDays: 3 }), "finish", "x").text, "Урок старше 3 дн. — его закрывает администратор или владелец.");
  assert.equal(Subs.substitutionErrorText(refusalOf({ code: "LESSON_TOO_OLD", message: "", windowDays: 30 })), "Урок старше 30 дн. — его закрывает администратор или владелец.");
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
  assert.equal(Ops.isRuleRefusal(Ops.lessonFailure(refusalOf(refusals.withdraw_too_old.detail), "finish", "x")), true);
  assert.equal(Ops.isRuleRefusal(Ops.lessonFailure(refusalOf({ code: "NOBODY_CAME", message: "m" }), "finish", "x")), false, "the old question stays a question");
  // the real ATTENDANCE_CONFLICT (save and return) is a conflict to refresh, not a rule: it stays an error
  for (const name of ["attendance_conflict_save", "attendance_conflict_return"]) assert.equal(Ops.isRuleRefusal(Ops.lessonFailure(refusalOf(answers(name).detail), "save", "x")), false, name);
  // a decided excuse (K8b) is said in the server's own sentence and belongs to ONE student (C10: studentId, studentName)
  const decided = Ops.lessonFailure(refusalOf(refusals.excuse_decided.detail), "save", "x");
  assert.deepEqual([decided.kind, decided.text, decided.studentId, decided.studentName], ["excuse_decided", refusals.excuse_decided.detail.message, refusals.excuse_decided.detail.studentId, "Абдуллаев Азиз"]);
  assert.equal(Ops.isRuleRefusal(decided), true, "an information, not a red error");
  assert.equal(Ops.failureLine(decided), `Абдуллаев Азиз. ${refusals.excuse_decided.detail.message}`, "a panel without a table names the student first");
  assert.equal(Ops.failureLine(nobody), nobody.text);
});

test("the correction of the marks is offered to the teacher of his OWN held lesson - the window is judged by the flags of the server for THIS lesson", () => {
  const A = require(path.join(root, "src/lib/attendance-excuses.ts"));
  assert.deepEqual(A.lessonTeacherActions("completed", true), ["correct"]);
  assert.deepEqual(A.lessonTeacherActions("completed", false), []);
  assert.deepEqual(A.lessonTeacherActions("cancelled", true), []);
  assert.deepEqual(A.lessonTeacherActions("scheduled", true), []);
  // C10: the server's flags of THIS lesson (journal_teacher: 02.11 held, window over; 23.11 may be acted on)
  const lessons = answers("journal_teacher").lessons;
  const old = lessons.find((l) => l.date === "2026-11-02");
  const fresh = lessons.find((l) => l.date === "2026-11-23");
  assert.deepEqual([old.canActSelf, old.monthClosed, old.windowDays], [false, false, 7]);
  assert.deepEqual(A.lessonTeacherActions("completed", true, old), [], "older than the window: nothing for the teacher");
  assert.deepEqual(A.lessonTeacherActions("completed", true, fresh), ["correct"]);
  assert.deepEqual(A.lessonTeacherActions("completed", true, { canActSelf: true, monthClosed: true, windowDays: 7 }), [], "a closed month closes it whatever the window says");
  assert.equal(Err.lessonWindowLock(old), "Урок старше 7 дн. — его закрывает администратор или владелец.");
  assert.equal(Err.lessonWindowLock({ canActSelf: true, monthClosed: true }), "Месяц закрыт — обратитесь к владельцу");
  assert.equal(Err.lessonWindowLock({ canActSelf: false, monthClosed: true, windowDays: 7 }), "Месяц закрыт — обратитесь к владельцу", "a closed month is said first");
  assert.equal(Err.lessonWindowLock(fresh), null);
  assert.equal(Err.lessonWindowLock({}), null, "no flags: the server judges");
  // the schedule carries the same three flags on EVERY occurrence (schedule_teacher): the lessons older than the window are closed
  const occurrences = answers("schedule_teacher");
  assert.ok(occurrences.every((o) => typeof o.canActSelf === "boolean" && typeof o.monthClosed === "boolean" && o.windowDays === 7));
  // by hand: today is 26.11, the window is 7 days, so the teacher acts on a lesson from 19.11 on (18.11 is 8 days old)
  assert.ok(occurrences.every((o) => o.canActSelf === (o.occurrenceDate >= "2026-11-19")));
});

const spaced = (text) => String(text).replace(/\s+/g, " ");
const cap = (outcome, answer) => { const text = L.outcomeCaption(outcome, answer); return text === null ? null : spaced(text); };
test("outcomes of a waiting cancellation: the sentence of the chosen outcome is the SERVER's sentence for that outcome (the real dry runs; the screen adds and counts nothing)", () => {
  const dry = answers("dry_run_confirm_centre");
  // by hand: 9 students × 50 000 = 450 000
  assert.equal(cap("centre", dry), "Перерасчёт 9 ученикам по 50 000 сум, всего 450 000 сум. Преподавателю урок не оплачивается.");
  assert.equal(cap("holiday", dry), "Ученикам: без перерасчёта. Преподавателю урок не оплачивается.");
  assert.equal(cap("held", dry), "Отмена снимается, преподаватель отметит посещаемость. Деньги считаются как за обычный урок.");
  // every other real shape: the caption of each outcome is EXACTLY the field of the answer (no copy of a rule on the screen)
  for (const name of ["dry_run_confirm_centre", "dry_run_confirm_holiday", "dry_run_confirm_old_lesson", "dry_run_confirm_different_sums", "dry_run_confirm_recalc_off", "dry_run_confirm_archived",
    "dry_run_zero_packages", "dry_run_zero_nobody_charged", "dry_run_zero_one_off"]) {
    const answer = answers(name);
    assert.deepEqual(["centre", "holiday", "held"].map((outcome) => L.outcomeCaption(outcome, answer)), [answer.centre_text, answer.holiday_text, answer.held_text], name);
  }
  // by hand: 7 × 50 000 + 40 000 + 30 000 = 420 000 (two students with a personal price)
  assert.equal(cap("centre", answers("dry_run_confirm_different_sums")), "Перерасчёт 9 ученикам, всего 420 000 сум. Преподавателю урок не оплачивается.");
  assert.match(cap("centre", answers("dry_run_confirm_recalc_off")), /^Перерасчёт за отмены в центре выключен/);
  for (const name of ["dry_run_zero_packages", "dry_run_zero_nobody_charged", "dry_run_zero_one_off"]) {
    const zero = answers(name);
    assert.ok(cap("centre", zero).startsWith(spaced(zero.zero_text)), `${name}: the reason of the zero is the first words`);
  }
  assert.equal(cap("held", answers("dry_run_confirm_old_lesson")), "Отмена снимается. Урок старше 7 дн.: отметит администратор или владелец.");
  assert.equal(cap("centre", null), null, "nothing is promised before the numbers come");
});

test("the answer of the dry run is CHECKED, not assumed: the real preview is a preview; the answer of somebody's decision (`changed: false`) is «decided»; a broken one is not trusted", () => {
  for (const name of ["dry_run_confirm_centre", "dry_run_confirm_holiday", "dry_run_confirm_old_lesson", "dry_run_confirm_archived", "dry_run_zero_packages"]) {
    const verdict = L.previewVerdict(answers(name));
    assert.equal(verdict.kind, "preview", name);
    assert.deepEqual([verdict.preview.centre_text, verdict.preview.holiday_text, verdict.preview.held_text], [answers(name).centre_text, answers(name).holiday_text, answers(name).held_text]);
  }
  assert.equal(L.previewVerdict(answers("dry_run_confirm_archived")).preview.restore_allowed, false);
  assert.equal(L.previewVerdict(answers("dry_run_confirm_old_lesson")).preview.teacher_can_mark, false);
  const real = answers("dry_run_confirm_centre");
  assert.deepEqual(L.previewVerdict({ ok: true, changed: false, message: "Отмену уже решили" }), { kind: "decided", text: "Отмену уже решили" });
  assert.equal(L.previewVerdict({ ...real, dry_run: undefined }).kind, "broken", "no dry_run and no `changed: false`: the answer of a write, not a preview and not «decided» - a broken one (М1)");
  assert.equal(L.previewVerdict({ ok: true, changed: true }).kind, "broken", "М1");
  assert.deepEqual(L.previewVerdict({ ...real, changed: false, message: "Отмену уже решили" }), { kind: "decided", text: "Отмену уже решили" }, "`changed: false` is the one word of «решил другой»");
  assert.equal(L.previewVerdict({ ...real, centre_text: "" }).kind, "broken", "a preview without the words of the server is not shown");
  assert.equal(L.previewVerdict({ ...real, students: "9" }).kind, "broken");
  assert.equal(L.previewVerdict(null).kind, "broken");
  assert.equal(L.previewVerdict("x").kind, "broken");
});

test("an archived group cannot give the lesson back (restore_allowed false): the window offers TWO outcomes; otherwise three", () => {
  assert.deepEqual(L.offeredOutcomes(null).map((o) => o.key), ["centre", "holiday", "held"]);
  assert.deepEqual(L.offeredOutcomes({ restore_allowed: true }).map((o) => o.key), ["centre", "holiday", "held"]);
  assert.deepEqual(L.offeredOutcomes(answers("dry_run_confirm_archived")).map((o) => o.key), ["centre", "holiday"], "the real answer of an archived group");
  assert.deepEqual(L.offeredOutcomes(answers("dry_run_confirm_centre")).map((o) => o.key), ["centre", "holiday", "held"]);
  assert.deepEqual(L.WAITING_OUTCOMES.map((o) => o.button), ["Подтвердить: по вине центра", "Подтвердить: праздник, выходной", "Вернуть урок на отметку"]);
});

test("the words of the row and of the window, from the real answer pending_owner", () => {
  const item = answers("pending_owner").items.find((row) => row.lesson.date === "2026-11-18");   // the two rows were written at the same moment: their order is the server's tie-break, so the row is found by its lesson
  assert.equal(L.waitingChipText(item.waitingDays), "сообщено сегодня");
  assert.equal(L.waitingChipText(1), "ждёт 1 день");
  assert.equal(L.waitingChipText(2), "ждёт 2 дня");
  assert.equal(L.waitingChipText(5), "ждёт 5 дней");
  assert.equal(L.waitingChipText(11), "ждёт 11 дней");
  assert.equal(L.waitingReasonText({ reason: "Отключили свет" }), "Урока не было: Отключили свет");
  assert.equal(L.waitingReasonText(item), "Урока не было: Отключили свет", "the words of the teacher in the real answer");
  assert.equal(L.waitingReasonText({ reason: null }), "Урока не было");
  assert.equal(L.waitingReasonText({ reason: "М23 — Эргашев К. заболел" }), "Урока не было: М23 — Эргашев К. заболел", "FIX4-B2: the first letter, a name or a short form is never changed");
  // who wrote it: the two words of the server (`reportedBy`, `reportedByRole`), not a guess from the person
  assert.deepEqual([item.reportedBy, item.reportedByRole], ["Эргашев К.", "teacher"]);
  assert.equal(L.waitingDialogTitle(item), "Преподаватель сообщил: урока не было");
  assert.equal(L.waitingDialogTitle({ reportedByRole: "admin" }), "Администратор сообщил: урока не было");
  assert.equal(L.waitingDialogTitle({ cancelledBy: { role: "admin" } }), "Отмена урока ждёт подтверждения", "the role of the person is not the word of the server: nothing is guessed");
  assert.equal(L.reportedByText("Эргашев К.", "teacher"), "Сообщил: Эргашев К., преподаватель");
  assert.equal(L.reportedByText("Каримова Д.", "admin"), "Сообщил: Каримова Д., администратор");
  assert.equal(L.reportedByText(null, "teacher"), null);
  assert.equal(L.waitingLessonHint({ reportedBy: "Эргашев К.", reportedByRole: "teacher" }), "Сообщил: Эргашев К., преподаватель. Отмену подтвердит владелец или администратор с доступом к деньгам");
  assert.equal(L.waitingDialogSubtitle(item), "Математика 7 · ср, 18.11 · 10:00–11:30");
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
  // the entries were all written at one moment: their order is the server's tie-break (it changes with the ids), so they are compared as a set
  assert.deepEqual(entries.map((e) => L.auditChipText(e)).sort(), ["Задним числом · 24 дн.", "Добавил урок в расписание", "Задним числом · 14 дн.", "Отметки исправлены", "Задним числом · 2 дн.", "Задним числом · 6 дн.", "Задним числом · 12 дн."].sort());
  assert.equal(L.auditChipText({ kind: "lesson_added", lateDays: null }), "Добавил урок в расписание");
  assert.equal(L.auditChipText({ kind: "backdated", lateDays: 12 }), "Задним числом · 12 дн.");
  assert.equal(L.auditByLine(entries.find((e) => e.lateDays === 24)), "оформление: Валиев Р.", "the owner wrote it over the lesson of the teacher");
  assert.equal(L.auditByLine(entries.find((e) => e.lateDays === 2)), null, "the teacher closed his own lesson");
  assert.equal(L.teacherWordsOf(answers("history").items.find((row) => row.trigger === "teacher_cancel")), "Отключили свет");
  assert.equal(L.teacherWordsOf({ trigger: "manager_cancel", decision: { note: "x" } }), null, "only the teacher's own words");
  assert.equal(L.BACKDATED_EMPTY_TEXT, "За 30 дней уроки задним числом не оформлялись");
  assert.equal(Subs.tabLabel("decided", 3), "История");
});

test("the list of «Замены» asks the server's own parameter (backdated_only) and keeps the three kinds of rows apart", () => {
  assert.match(Subs.listQuery({ status: "decided", backdatedOnly: true }), /(^|&)backdated_only=true(&|$)/);
  assert.doesNotMatch(Subs.listQuery({ status: "decided" }), /backdated/);
  const rows = [...answers("pending_owner").items, ...answers("history").items];
  const split = L.splitRows(rows);
  assert.deepEqual([split.waiting.length, split.audit.length, split.requests.length], [2, 7, 7]);
});

test("the salary line of the panel: «В зарплате за ноябрь: +25 000 сум» from the dry run of the return; no sheet, nothing", () => {
  assert.equal(L.salaryLineOf({ payroll: [{ month: "2026-11", changedBy: -25000 }] }, "2026-11-26"), "В зарплате за ноябрь: +25 000 сум");
  assert.equal(L.salaryLineOf({ payroll: [{ month: "2026-11", changedBy: 0 }] }, "2026-11-26"), null);
  assert.equal(L.salaryLineOf({ payroll: [] }, "2026-11-26"), null);
  assert.equal(L.salaryLineOf(null, "2026-11-26"), null);
  // the real dry run of the return of the lesson of 02.11 (the draft of November: 168 750 -> 0)
  assert.equal(L.salaryLineOf(answers("dry_run_return_payroll").moneyEffects, "2026-11-26"), "В зарплате за ноябрь: +168\u00a0750\u00a0сум");
});

test("the teacher's block: the waiting cancellations first (the nearest lesson), the decided ones after; ONE row per lesson; the chips of the real answer mine_teacher", () => {
  const mine = answers("mine_teacher");
  const NOW = Date.parse("2026-11-26T07:00:00Z");
  assert.equal(mine.items.length, 12);
  const ordered = Subs.recentRequests(mine.items, NOW);
  // the three system records `closed` of the returned lessons (02.11, 09.11, 25.11) are hidden: each of the lessons has its own cancellation of the teacher - ONE row per lesson
  // all the rows of the unload were decided at the same moment: the order inside the decided ones is the server's (stable), the waiting ones - the nearest lesson first; the two one-off rows (14.11, 17.11) are older than the cancellations
  assert.deepEqual(ordered.slice(0, 2).map((i) => `${i.lesson.date}:${i.outcome}`), ["2026-11-18:cancel_waiting", "2026-11-23:cancel_waiting"], "the waiting ones first, the nearest lesson first (by the date of the lesson, not by the order of the server)");
  const decidedRows = ordered.slice(2).map((i) => `${i.lesson.date}:${i.outcome}`);
  assert.deepEqual(decidedRows.slice().sort(), [
    "2026-11-02:included_in_payroll", "2026-11-09:lesson_restored", "2026-11-11:cancelled_centre", "2026-11-14:one_off_added", "2026-11-16:cancelled_holiday", "2026-11-17:one_off_added", "2026-11-25:lesson_restored",
  ], "the seven decided ones - one row per lesson (the order among rows decided at one moment is the server's tie-break)");
  assert.deepEqual(Subs.oneRowPerReturnedLesson(mine.items).filter((i) => i.status === "closed" && i.outcome === "lesson_restored").map((i) => i.lesson.date), []);
  assert.deepEqual(ordered.map((i) => O.outcomeOf(i, "teacher").text).sort(), [
    "Отмена ждёт подтверждения", "Отмена ждёт подтверждения", "Включён в зарплату", "Отменён: по вине центра",
    "Урок был — отметьте посещаемость", "Урок был — отметит администратор", "Отменён: праздник", "Разовый урок", "Разовый урок",
  ].sort());
  assert.deepEqual(ordered.filter((i) => i.outcome === "cancel_waiting").map((i) => i.canWithdraw), [false, true], "«Отозвать» only where the server says so");
  assert.equal(Subs.myRequestLine(ordered[1]), "пн, 23.11 · Математика 7");
  assert.equal(Subs.MY_REQUESTS_TITLE, "Запросы и изменения уроков");
  // a returned lesson: the teacher marks it (the window of the centre says so) or the administrator does
  const cancelOf = (date) => mine.items.find((i) => i.lesson.date === date && i.status === "cancelled");
  assert.deepEqual([cancelOf("2026-11-25").teacherCanMark, cancelOf("2026-11-09").teacherCanMark], [true, false]);
  assert.equal(O.outcomeOf(cancelOf("2026-11-25"), "teacher").text, "Урок был — отметьте посещаемость");
  assert.equal(O.outcomeOf(cancelOf("2026-11-09"), "teacher").text, "Урок был — отметит администратор");
  assert.equal(O.outcomeOf(cancelOf("2026-11-25"), "manager").text, "Урок возвращён");
});

test("the history of a confirmed cancellation (the real detail_confirmed): «Сообщено, что урока не было» (the author is the line under it) and «Отмена подтверждена: по вине центра» with who (the events of the server)", () => {
  const detail = answers("detail_confirmed");
  assert.deepEqual(detail.item.confirmedBy && [detail.item.confirmedBy.name, detail.item.confirmedBy.role], ["Валиев Р.", "owner"], "the confirmation is in the detail answer");
  const timeline = TL.timelineOf(detail, "manager");
  const rows = timeline.rows.map((r) => [r.title, r.author]);
  assert.deepEqual(rows.slice(-2), [["Сообщено, что урока не было", "Эргашев К., преподаватель"], ["Отмена подтверждена: по вине центра", "Валиев Р., владелец"]]);
  const holiday = detail.events.map((e) => (e.action === "confirmed" ? { ...e, snapshot: { cancellationKind: { from: "unconfirmed", to: "holiday" } } } : e));
  assert.ok(TL.timelineOf({ ...detail, events: holiday }, "manager").rows.some((r) => r.title === "Отмена подтверждена: праздник"), "the other outcome reads in its own words");
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
  const gate = answers("payroll_gate_409").detail;
  assert.deepEqual([gate.code, gate.count], ["UNCONFIRMED_CANCELLATIONS", 2]);
  const message = gate.message;
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

test("the three models of the list are told apart by the `source` of the server: every row of the real answers is exactly one of request / unconfirmed / audit, the request has its own `source`", () => {
  for (const name of ["pending_owner", "pending_admin", "pending_admin_author", "history", "history_backdated_only", "history_evening_not_late", "history_admin_with_right"]) {
    const rows = answers(name).items;
    const split = L.splitRows(rows);
    assert.equal(split.requests.length + split.waiting.length + split.audit.length, rows.length, `${name}: nothing lost, nothing counted twice`);
    assert.equal(split.waiting.length, rows.filter((r) => r.source === "unconfirmed").length, name);
    assert.equal(split.audit.length, rows.filter((r) => r.source === "audit").length, name);
    assert.equal(split.requests.length, rows.filter((r) => r.source === "request").length, `${name}: a request row says source:"request"`);
  }
});

test("С11.19: the lessons that were given back (02.11 held, 09.11 and 25.11 waiting for a mark) are NOT out of plan in the schedule of the real answer - no «Отменён» chip; the lessons that are cancelled are (11.11, 16.11, 18.11, 23.11)", () => {
  const { outOfPlan } = require(path.join(root, "src/lib/schedule-plan.ts"));
  const math = answers("schedule_teacher").filter((o) => o.groupName === "Математика 7");
  const journal = answers("journal_teacher");
  const statusOf = (date) => journal.lessons.find((l) => l.date === date)?.status;
  for (const date of ["2026-11-02", "2026-11-09", "2026-11-25"]) {
    const occurrence = math.find((o) => o.occurrenceDate === date);
    assert.equal(occurrence.substitutionOutcome, null, `${date}: the schedule says nothing about a cancellation`);
    assert.equal(outOfPlan({ status: statusOf(date), outcome: occurrence.substitutionOutcome }), null, date);
  }
  for (const date of ["2026-11-11", "2026-11-16", "2026-11-18", "2026-11-23"]) {
    const occurrence = math.find((o) => o.occurrenceDate === date);
    assert.equal(outOfPlan({ status: statusOf(date), outcome: occurrence.substitutionOutcome }), "cancelled", date);
  }
});

test("the toast of «Урока не было» said from the journal: `waiting` of the server's answer - «Отмена урока … ждёт подтверждения» with the sentence; otherwise «Урок … отмечен как не состоявшийся»", () => {
  const real = answers("cancel_admin_without_right_waiting");
  assert.equal(real.waiting, true);
  const notes = TC.notesOf(real);
  assert.deepEqual([...notes], [real.consequence], "the sentence of the server is the first note");
  assert.equal(notes.waiting, true);
  assert.deepEqual(TC.missedCancelToast("пн, 9 ноября", notes), { title: "Отмена урока пн, 9 ноября ждёт подтверждения", tone: "warning" });
  const teacher = TC.notesOf(answers("cancel_teacher_waiting"));
  assert.equal(teacher.waiting, true);
  assert.deepEqual(TC.missedCancelToast("пн, 9 ноября", TC.notesOf({ ok: true, cancelled: true, warnings: [] })), { title: "Урок пн, 9 ноября отмечен как не состоявшийся", tone: "success" }, "waiting is absent: the cancellation is done");
  assert.deepEqual(TC.missedCancelToast("пн, 9 ноября", TC.notesOf({ ok: true, waiting: false, warnings: [{ message: "Замена снята" }] })).tone, "warning", "notes of the server make the toast a warning");
  assert.equal(TC.cancelToastTitle(notes), "Отмена ждёт подтверждения");
});

test("FIX4-B3: foldRequests keeps every waiting row and the last 5 decided ones, the rest is folded", () => {
  const row = (id, status, outcome) => ({ id, status, outcome });
  const rows = [row("w1", "pending", null), row("w2", "closed", "cancel_waiting"), ...[1, 2, 3, 4, 5, 6, 7].map((n) => row(`d${n}`, "closed", "cancelled_centre"))];
  const { shown, folded } = Subs.foldRequests(rows);
  assert.deepEqual(shown.map((r) => r.id), ["w1", "w2", "d1", "d2", "d3", "d4", "d5"]);
  assert.equal(folded, 2);
  assert.deepEqual(Subs.foldRequests(rows.slice(0, 4)), { shown: rows.slice(0, 4), folded: 0 });
});

test("FIX4-B1: ONE border of «Запланирован» / «Не отмечен» - the END of the lesson in the clock of the centre (the minute of the end is still not over)", () => {
  const C = require(path.join(root, "src/lib/schedule-card-actions.ts"));
  const at = (iso) => new Date(iso);   // 07:00Z = 12:00 in Tashkent
  const over = (endTime, now) => C.lessonHasEnded({ date: "2026-11-26", today: "2026-11-26", endTime, now: at(now) });
  assert.equal(over("10:00", "2026-11-26T07:00:00Z"), true, "today, after the end");
  assert.equal(over("15:00", "2026-11-26T07:00:00Z"), false, "today, before the end");
  assert.equal(over("12:00", "2026-11-26T07:00:30Z"), false, "the minute of the end");
  assert.equal(over("12:00", "2026-11-26T07:01:00Z"), true, "the next minute");
  assert.equal(C.lessonHasEnded({ date: "2026-11-25", today: "2026-11-26", endTime: "23:00" }), true, "a past day");
  assert.equal(C.lessonHasEnded({ date: "2026-11-27", today: "2026-11-26", endTime: "08:00" }), false, "a later day");
});
