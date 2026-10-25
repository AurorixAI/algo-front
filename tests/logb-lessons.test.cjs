// LOGIC-B O1 / O11 (the schedule), O5 / F6 (the teacher of a lesson), O6 / O7 / O8 (the marks of a lesson), decision 7 (the window of 7 days).
// Read against the frozen contract (tests/fixtures/logB = artifacts/partner_doc_check/logicB_fixtures).
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
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/logB", `${name}.json`), "utf8"));
const Slots = require(path.join(root, "src/lib/schedule-slots.ts"));
const Err = require(path.join(root, "src/lib/ops-errors.ts"));
const LT = require(path.join(root, "src/lib/lesson-teacher.ts"));
const Ops = require(path.join(root, "src/lib/attendance-ops.ts"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { LessonTeacherBody } = require(path.join(root, "src/components/groups/lesson-teacher-dialog.tsx"));
const { AttendanceConflictBody, LiveExamConfirmBody } = require(path.join(root, "src/components/attendance/attendance-ops-dialogs.tsx"));
const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const refusal = (status, body) => Object.assign(new Error(body.detail.message), { status, code: body.detail.code, detail: body.detail });
const TODAY = "2026-10-21";

// ── O1 / O11: the schedule ─────────────────────────────────────────────────────────────────────

test("[O1.R1][O1.R5] «Действует с»: from today, up to a year; a date in the past is refused before the request, with the words of the spec", () => {
  assert.deepEqual(Slots.validFromBounds(TODAY), { min: "2026-10-21", max: "2027-10-21" });
  assert.equal(Slots.validFromError("2026-10-21", TODAY), null);
  assert.equal(Slots.validFromError("2026-10-26", TODAY), null);
  assert.equal(Slots.validFromError("", TODAY), null, "blank is «today»: the server default");
  assert.equal(Slots.validFromError("2026-10-14", TODAY), "Дата начала не может быть в прошлом");
  assert.match(Slots.validFromError("2028-01-01", TODAY), /не позже чем через год/);
  assert.equal(Slots.VALID_FROM_HINT, "До этой даты уроков в журнале не будет.");
});

test("[O1.R1] a slot that starts in the future carries the badge «с 26.10»; a slot already acting, or an older server, none", () => {
  const created = fixture("c4_schedule_lesson_created");
  assert.equal(created.validFrom, TODAY);
  assert.equal(Slots.validFromBadge(created.validFrom, TODAY), null);
  assert.equal(Slots.validFromBadge("2026-10-26", TODAY), "с 26.10");
  assert.equal(Slots.validFromBadge(null, TODAY), null);
  assert.equal(Slots.validFromBadge(undefined, TODAY), null);
});

test("[O11.R1][O11.R3] no invented room: blank is null on the wire, «Кабинет не указан» on the screen, «Онлайн» for an online lesson", () => {
  assert.equal(Slots.roomForSave(""), null);
  assert.equal(Slots.roomForSave("   "), null);
  assert.equal(Slots.roomForSave(" 12 "), "12");
  const occurrence = fixture("x_occurrence_substitution");
  assert.equal(occurrence.room, null);
  assert.equal(Slots.roomLabel(occurrence), "Кабинет не указан");
  assert.equal(Slots.roomLabel({ format: "online", room: "204" }), "Онлайн");
  assert.equal(Slots.roomLabel({ format: "offline", room: "12" }), "12");
  assert.equal(Slots.ROOM_LABEL, "Кабинет (необязательно)");
  assert.equal(Slots.ROOM_PLACEHOLDER, "Например: 12");
});

test("[O1.R2][O1.R5][O11.R4] the refusals and the warning of a schedule write in the words of the spec", () => {
  assert.equal(Err.scheduleErrorText(refusal(409, fixture("x_duplicate_slot").body), "x"), "Такой урок уже есть в расписании группы");
  assert.equal(Err.scheduleErrorText(refusal(422, fixture("x_valid_from_past").body), "x"), "Дата начала не может быть в прошлом");
  assert.equal(Err.scheduleErrorText(refusal(409, fixture("c2_start_archived").body), "x"), "Группа в архиве: изменить расписание нельзя. Верните её из архива");
  assert.equal(Err.scheduleErrorText(new Error("network"), "fallback"), "network");
  assert.equal(Err.scheduleErrorText({}, "fallback"), "fallback");
  // ROOM_BUSY is not a refusal: the lines of `warnings` are shown after the save
  assert.deepEqual(Err.warningTexts({ warnings: [{ code: "ROOM_BUSY", message: "Кабинет «12» в это время занят группой «7-Б»" }] }), ["Кабинет «12» в это время занят группой «7-Б»"]);
  assert.deepEqual(Err.warningTexts({}), []);
  assert.deepEqual(Err.warningTexts(fixture("c4_schedule_lesson_created")), []);
});

test("[O5.R7] a busy teacher at a schedule write: the server head and the first clashes", () => {
  const busy = fixture("c1_handover_busy");
  const text = Err.scheduleErrorText(refusal(busy.status, busy.body), "x");
  assert.match(text, /26\.10 10:00–11:30: «9-А» пересекается с «8-В»/);
  assert.match(text, /и ещё \d+/);
});

test("the schedule page is wired: «Действует с», the optional room without «Кабинет 204», the errors inside the dialogs, the notices", () => {
  // P1: the fields of the weekly lesson (room label / placeholder) live in the shared component, used by the teacher's add and edit forms
  const page = read("src/app/teacher/schedule/page.tsx") + read("src/components/schedule/lesson-slot-fields.tsx") + read("src/lib/weekly-lessons.ts");
  for (const needle of [/Действует с/, /VALID_FROM_HINT/, /ROOM_LABEL/, /ROOM_PLACEHOLDER/, /roomForSave\(draft\.room\)/, /validFrom: newValidFrom/, /scheduleErrorText\(err/, /warningTexts\(created\)/, /validFromBadge\(l\.validFrom/, /placeText\(l\)/, /placeText\(activeLesson\)/]) {
    assert.match(page, needle, String(needle));
  }
  assert.doesNotMatch(page, /Кабинет 204/);
  assert.doesNotMatch(page, /Аудитория не указана/);
  assert.doesNotMatch(read("src/app/teacher/dashboard/page.tsx"), /\{l\.room\}/);
});

// ── O5 / F6: the teacher of a lesson ───────────────────────────────────────────────────────────

test("[O5.R1] the lesson of a substitute: «Замена: Рахимов Т.» for a manager, «Заменяет Рахимов Т.» for the replaced teacher, «Замена» for the substitute himself", () => {
  const info = fixture("c7_journal_extras").lessonTeachers["2026-10-26_lesson-l1"];
  assert.equal(info.isSubstitution, true);
  assert.equal(LT.substituteLabel(info), "Замена: Рахимов Т.");
  assert.equal(LT.replacedByLabel(info, info.defaultTeacherId), "Заменяет Рахимов Т.");
  assert.equal(LT.replacedByLabel(info, "somebody-else"), null);
  assert.equal(LT.occurrenceTeacherChip(info, "a-manager"), "Замена: Рахимов Т.");
  assert.equal(LT.occurrenceTeacherChip(info, info.defaultTeacherId), "Заменяет Рахимов Т.");
  assert.equal(LT.occurrenceTeacherChip(info, info.teacherId), "Замена");
  assert.equal(LT.occurrenceTeacherChip({ ...info, isSubstitution: false }, "x"), null);
  assert.equal(LT.occurrenceTeacherChip(null, "x"), null);
  // the occurrence of the contract carries the same facts
  const occurrence = fixture("x_occurrence_substitution");
  assert.equal(LT.occurrenceTeacherChip(occurrence, "a-manager"), "Замена: Рахимов Т.");
});

test("[O5.R7] a lesson without a teacher says so and offers «Назначить»; the owner and the administrator replace, nobody else", () => {
  assert.equal(LT.NO_LESSON_TEACHER_TEXT, "У урока нет преподавателя");
  assert.equal(LT.lacksTeacher({ teacherId: null, teacherName: null }), true);
  assert.equal(LT.lacksTeacher({ teacherId: "t" }), false);
  assert.equal(LT.lacksTeacher(null), false);
  assert.equal(LT.canReplaceTeacher("owner", "in_progress"), true);
  assert.equal(LT.canReplaceTeacher("admin", "scheduled"), true);
  assert.equal(LT.canReplaceTeacher("teacher", "scheduled"), false);
  assert.equal(LT.canReplaceTeacher("admin", "cancelled"), false, "LESSON_CANCELLED");
  assert.equal(LT.ASSIGN_TEACHER_ACTION, "Назначить");
  assert.equal(LT.REPLACE_TEACHER_ACTION, "Заменить преподавателя");
  assert.equal(LT.RETURN_GROUP_TEACHER_ACTION, "Вернуть преподавателя группы");
});

test("[O5.R8] a teacher does not mark somebody else's lesson: «Этот урок ведёт Рахимов Т.»", () => {
  const info = fixture("c7_journal_extras").lessonTeachers["2026-10-26_lesson-l1"];
  assert.equal(LT.lessonBelongsToOther(info, info.defaultTeacherId), true);
  assert.equal(LT.lessonBelongsToOther(info, info.teacherId), false);
  assert.equal(LT.lessonBelongsToOther(undefined, "x"), false, "an older server: no verdict");
  assert.equal(LT.notYourLessonText(info), "Этот урок ведёт Рахимов Т.");
  assert.equal(fixture("c4_not_lesson_teacher").body.detail.code, "NOT_LESSON_TEACHER");
});

test("[O5.R7] the dialog «Преподаватель урока»: title, candidates, the busy one off with where he is busy, the current marked, the reason field", () => {
  const list = fixture("x_lesson_teacher_candidates");
  assert.equal(LT.lessonTeacherDialogTitle(list.lessonDate, list.startTime, list.endTime), "Преподаватель урока 26.10, 10:00–11:30");
  const html = renderToStaticMarkup(React.createElement(LessonTeacherBody, {
    list, loadError: null, current: LT.currentCandidate(list), pick: null, reason: "", reasonProblem: null, busy: false, error: null,
    onPick() {}, onReason() {}, onRetry() {},
  }));
  const text = textOf(html);
  assert.match(text, /Рахимов Т\./);
  assert.match(text, /Петров П\./);
  assert.match(text, /Занят: 8-В, 10:00–11:30/);
  assert.match(text, /Причина замены/);
  // the busy candidate cannot be picked
  assert.equal((html.match(/disabled=""/g) || []).length, 1);
  assert.equal(LT.isSelectable(list.candidates[1], null), false);
  assert.equal(LT.isSelectable(list.candidates[0], null), true);
  assert.equal(LT.isSelectable(list.candidates[0], list.candidates[0].teacherId), false, "the current teacher is not a change");
});

test("[O5.R1] the reason is 3..300; «Вернуть преподавателя группы» takes the substitute off; the PUT body carries the teacher the dialog was opened with", () => {
  assert.match(LT.reasonError("ab"), /не менее 3/);
  assert.equal(LT.reasonError("Болезнь"), null);
  assert.match(LT.reasonError("x".repeat(301)), /не более 300/);
  assert.deepEqual(
    LT.buildAssign({ lessonDate: "2026-10-26", lessonId: "lesson-l1" }, "T", " Болезнь ", "C"),
    { lessonDate: "2026-10-26", lessonId: "lesson-l1", teacherId: "T", reason: "Болезнь", expectedTeacherId: "C" },
  );
  assert.deepEqual(
    LT.buildAssign({ lessonDate: "2026-10-26", lessonId: "lesson-l1" }, null, "Вернули", null),
    { lessonDate: "2026-10-26", lessonId: "lesson-l1", teacherId: null, reason: "Вернули" },
  );
  assert.equal(LT.canReturnToGroupTeacher({ isSubstitution: true }), true);
  assert.equal(LT.canReturnToGroupTeacher({ isSubstitution: false }), false);
});

test("[O5.R4] the refusals of a replacement in the words of the spec", () => {
  assert.equal(Err.lessonTeacherErrorText({ code: "TARGET_NOT_TEACHER", message: "x" }), "Выберите преподавателя центра");
  assert.equal(Err.lessonTeacherErrorText(refusal(409, fixture("x_lesson_teacher_changed").body)), "Преподаватель урока уже изменён: Рахимов Т. Обновите страницу");
  assert.equal(Err.lessonTeacherErrorText(refusal(409, fixture("x_payroll_locked").body)), "Ведомость за этот месяц уже утверждена: смена преподавателя недоступна");
  assert.match(Err.lessonTeacherErrorText(refusal(409, fixture("c1_handover_busy").body)), /^Преподаватель занят: /);
});

test("[O5.R4] the name of the current teacher comes from `teacher_name` when the server sends it (no double dot)", () => {
  const body = { detail: { code: "LESSON_TEACHER_CHANGED", message: "x", teacher_name: "Рахимов Т." } };
  assert.equal(Err.lessonTeacherErrorText(refusal(409, body)), "Преподаватель урока уже изменён: Рахимов Т. Обновите страницу");
  assert.equal(Err.lessonTeacherErrorText(refusal(409, { detail: { ...body.detail, teacher_name: "Рахимов Тимур" } })), "Преподаватель урока уже изменён: Рахимов Тимур. Обновите страницу");
});

test("[O5.R1] the result of the PUT of chain 1 reads: the substitute, the group's teacher, nothing paid changed", () => {
  const result = fixture("c1_lesson_teacher_L1_D");
  assert.equal(result.isSubstitution, true);
  assert.equal(result.teacherName, "Рахимов Т.");
  assert.deepEqual(result.payrollSheetsAffected, []);
});

// ── O6: an empty roster ────────────────────────────────────────────────────────────────────────

test("[O6.R1][O6.R3] the words of an empty roster: the start and the finish are different sentences; both codes of the finish are read", () => {
  const start = fixture("x_no_students_start").body;
  assert.equal(Err.NO_STUDENTS_START_TEXT, start.detail.message);
  assert.equal(Err.NO_STUDENTS_FINISH_TEXT, "В составе урока нет учеников — завершить нельзя. Отметьте «Урока не было».");
  assert.equal(Ops.lessonFailure(refusal(409, start), "start", "x").text, Err.NO_STUDENTS_START_TEXT);
  assert.equal(Ops.lessonFailure(refusal(409, start), "finish", "x").text, Err.NO_STUDENTS_FINISH_TEXT);
  const complete = { detail: { code: "NO_STUDENTS_COMPLETE", message: "x" } };
  assert.equal(Ops.lessonFailure(refusal(409, complete), "save", "x").text, Err.NO_STUDENTS_FINISH_TEXT);
  assert.equal(Ops.lessonFailure(refusal(409, complete), "save", "x").kind, "no_students");
});

// ── O7: versions and the conflict ──────────────────────────────────────────────────────────────

test("[O7.R1] the version of each lesson comes with the journal and with every answer of a write; an older server sends none and nothing is sent", () => {
  const extras = fixture("c7_journal_extras");
  assert.equal(Ops.expectedVersionFor(extras.versions, "2026-10-26_lesson-l1"), 5);
  assert.equal(Ops.expectedVersionFor(extras.versions, "2026-10-27_other"), undefined);
  assert.equal(Ops.expectedVersionFor(undefined, "k"), undefined);
  let versions = Ops.mergeVersions({}, extras.versions);
  assert.equal(versions["2026-10-26_lesson-l1"], 5);
  versions = Ops.withSavedVersion(versions, "2026-10-26_lesson-l1", fixture("c7_save_v3"));
  assert.equal(versions["2026-10-26_lesson-l1"], 3, "the answer of a save wins");
  assert.deepEqual(Ops.withSavedVersion(versions, "k", { ok: true }), versions, "an answer without a version changes nothing");
  // a read does not overwrite a lesson whose save is on its way
  assert.equal(Ops.mergeVersions({ k: 7 }, { k: 9 }, ["k"]).k, 7);
  assert.equal(Ops.mergeVersions({ k: 7 }, { k: 9 }, []).k, 9);
});

test("[O7.R4] chain 7: the conflict says who and when (on the Tashkent clock), lists my edit against theirs, and «Оставить мои» merges to {s1: present, s2: absent}", () => {
  const body = fixture("c7_conflict");
  const detail = Ops.conflictDetailOf(refusal(body.status, body.body));
  assert.equal(detail.currentVersion, 2);
  const s1 = Object.keys(detail.records)[0];
  const s2 = "s2-student";
  assert.equal(Ops.conflictHeadline(detail), "Отметки уже изменил(а) Рахимов Т. в 10:42."); // 05:42 UTC
  const base = {};
  const mine = { [s2]: "absent" };
  const rows = Ops.conflictRows(base, mine, detail.records);
  assert.deepEqual(rows, [{ studentId: s2, mine: "absent", current: "", differs: true }]);
  assert.deepEqual(Ops.mergeKeepMine(base, mine, detail.records), { [s1]: "present", [s2]: "absent" });
  // the same student marked by both: mine wins over theirs; a mark I took off is taken off
  assert.deepEqual(Ops.mergeKeepMine({ a: "present" }, { a: "late" }, { a: "absent" }), { a: "late" });
  assert.deepEqual(Ops.mergeKeepMine({ a: "present" }, {}, { a: "present", b: "late" }), { b: "late" });
  assert.equal(Ops.sameRecords({ a: "present" }, { a: "present", b: "" }), true);
  assert.equal(Ops.sameRecords({ a: "present" }, { a: "late" }), false);
  assert.equal(Ops.CONFLICT_KEEP_MINE, "Оставить мои");
  assert.equal(Ops.CONFLICT_TAKE_THEIRS, "Принять чужие");
  assert.equal(Ops.CONFLICT_EXPLAIN, "Ваши несохранённые изменения сохранятся в окне, пока вы не выберете");
  const failure = Ops.lessonFailure(refusal(body.status, body.body), "save", "x");
  assert.equal(failure.kind, "conflict");
  assert.equal(failure.text, "Отметки уже изменил(а) Рахимов Т. в 10:42.");
  const html = renderToStaticMarkup(React.createElement(AttendanceConflictBody, { conflict: { detail, base, mine }, names: { [s2]: "Каримов Азиз" }, error: null }));
  const text = textOf(html);
  assert.match(text, /Отметки уже изменил\(а\) Рахимов Т\. в 10:42\./);
  assert.match(text, /Каримов Азиз/);
  assert.match(text, /Не был/);
  assert.match(text, /не отмечен/);
  assert.match(text, /Ваши несохранённые изменения сохранятся в окне, пока вы не выберете/);
});

test("[O7.R4] a conflict without a name still has a headline; other 409s are not conflicts", () => {
  assert.equal(Ops.conflictHeadline({ currentVersion: 3, updatedBy: {}, message: "" }), "Отметки уже изменил другой сотрудник.");
  assert.equal(Ops.conflictHeadline({ currentVersion: 3, updatedBy: { name: "Петров П." }, message: "" }), "Отметки уже изменил(а) Петров П.");
  assert.equal(Ops.conflictDetailOf(refusal(409, { detail: { code: "NO_STUDENTS", message: "x" } })), null);
  assert.equal(Ops.isAttendanceConflict(new Error("x")), false);
});

// ── O8: a running exam at the finish ───────────────────────────────────────────────────────────

test("[O8.R1] the live exam of chain 5: the sentence of the spec with the minutes left, the question, the two buttons", () => {
  const body = fixture("c5_live_exam_conflict");
  const failure = Ops.lessonFailure(refusal(body.status, body.body), "finish", "x");
  assert.equal(failure.kind, "live_exam");
  assert.equal(failure.exams.length, 1);
  assert.equal(Ops.minutesLeft(900), 15);
  assert.equal(Ops.minutesLeft(61), 2, "rounded up: never «0 мин» while seconds remain");
  assert.equal(Ops.liveExamSentence(failure.exams[0]), "Экзамен «Контрольная №3» ещё идёт (осталось 15 мин). Он продолжится по своему таймеру и закроется сам.");
  const text = textOf(renderToStaticMarkup(React.createElement(LiveExamConfirmBody, { exams: failure.exams })));
  assert.equal(text, "Экзамен «Контрольная №3» ещё идёт (осталось 15 мин). Он продолжится по своему таймеру и закроется сам. Завершить урок?");
  assert.equal(Ops.FINISH_LESSON_ACTION, "Завершить урок");
  assert.equal(Ops.FINISH_LESSON_BACK, "Вернуться");
});

test("[O8.R1] an exam in the lobby: «не запущен», the waiting students, goes back to the draft", () => {
  const lobby = { examId: "E", title: "Контрольная №3", status: "lobby", remainingSeconds: null, waitingCount: 4 };
  assert.equal(Ops.liveExamSentence(lobby), "Экзамен «Контрольная №3» не запущен; ожидают учеников: 4. После завершения урока он вернётся в черновик.");
  assert.equal(Ops.liveExamSentence({ ...lobby, waitingCount: 0 }), "Экзамен «Контрольная №3» не запущен. После завершения урока он вернётся в черновик.");
  assert.equal(Ops.liveExamConfirmText([lobby, { ...lobby, examId: "F", title: "Другая" }]).lines.length, 2);
});

test("[O8.R7] the finish after which the exam service did not answer: the notice «Урок завершён, но проверить экзамены не удалось.»; the answers of chain 5 are read", () => {
  assert.equal(Ops.examSyncNotice({ released: [], leftRunning: [], warning: "EXAM_SERVICE_UNAVAILABLE" }), "Урок завершён, но проверить экзамены не удалось.");
  assert.equal(Ops.examSyncNotice(fixture("c5_save_completed_ack").examSync), null);
  assert.equal(Ops.examSyncNotice(null), null);
  assert.deepEqual(fixture("c5_save_completed_ack").examSync.leftRunning, ["EX_123"]);
  assert.deepEqual(fixture("c5_save_lobby_released").examSync.released, ["EX_123"]);
});

// ── decision 7: the window of 7 days ───────────────────────────────────────────────────────────

test("[R7.R1][R7.R6] a teacher closes the last 7 days: Wed 21.10 -> 14.10 is still open, 13.10 is not; the day changes at midnight", () => {
  assert.equal(Ops.isLessonTooOld("2026-10-19", TODAY), false);
  assert.equal(Ops.isLessonTooOld("2026-10-14", TODAY), false);
  assert.equal(Ops.isLessonTooOld("2026-10-13", TODAY), true);
  assert.equal(Ops.isLessonTooOld("2026-10-14", "2026-10-22"), true, "00:00:30 on Thursday 22.10: 14.10 is 8 days old");
  assert.equal(Ops.isLessonTooOld("not a date", TODAY), false);
});

test("[R7.R5] the open lesson of chain 4: for a teacher it is grey with «Обратитесь к администратору», for an administrator an ordinary one", () => {
  const row = fixture("x_open_action_requires_admin");
  assert.equal(row.requiresAdmin, true);
  assert.equal(row.ageDays, 8);
  assert.deepEqual(Ops.openLessonAccess(row, "teacher", TODAY), { locked: true, hint: "Обратитесь к администратору" });
  assert.deepEqual(Ops.openLessonAccess(row, "admin", TODAY), { locked: false, hint: null });
  assert.deepEqual(Ops.openLessonAccess(row, "owner", TODAY), { locked: false, hint: null });
  // an older server sends no `requiresAdmin`: the date decides
  assert.equal(Ops.openLessonAccess({ lessonDate: "2026-10-13" }, "teacher", TODAY).locked, true);
  assert.equal(Ops.openLessonAccess({ lessonDate: "2026-10-14" }, "teacher", TODAY).locked, false);
  assert.equal(Ops.openLessonAccess({ lessonDate: "2026-10-14", requiresAdmin: true }, "teacher", TODAY).locked, true, "the server's word wins");
});

test("[R7.R1] the refusal LESSON_TOO_OLD is shown in the words of the spec", () => {
  const body = fixture("c4_lesson_too_old");
  assert.equal(body.status, 403);
  const failure = Ops.lessonFailure(refusal(body.status, body.body), "save", "x");
  assert.equal(failure.kind, "too_old");
  assert.equal(failure.text, "Урок старше 7 дней — его закрывает администратор или владелец.");
  assert.equal(Err.LESSON_TOO_OLD_HINT, "Обратитесь к администратору");
});

test("the lesson panels, the journal and the lists are wired for the pack", () => {
  for (const file of ["src/app/teacher/dashboard/page.tsx", "src/app/teacher/schedule/page.tsx"]) {
    const page = read(file);
    for (const needle of [/useLessonMarksOps/, /marksOps\.versionBody\(\)/, /acknowledgeLiveExam/, /AttendanceConflictDialog/, /LiveExamConfirmDialog/, /NO_STUDENTS_START_TEXT/, /NO_STUDENTS_FINISH_TEXT/, /examSyncNotice/, /aboveLessonPanel/]) {
      assert.match(page, needle, `${file} ${needle}`);
    }
    // ROADMAP #114: one row of buttons while the marks are entered, no «Закрыть» that repeats the cross
    assert.match(page, /\{!isMarkingAttendance && \(\s*<div className="flex[^"]*(pt-4 border-t|border-t border-slate-100 pt-4)/, file);
    assert.doesNotMatch(page, /Завершить без отметок/, file);
    assert.doesNotMatch(page, /\n\s+Закрыть\n\s+<\/button>\n\s+\)\}\n\s+<\/div>\n\s+<\/div>\n\s+<\/motion\.div>/, file);
  }
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  for (const needle of [/expectedVersion/, /AttendanceConflictDialog/, /LiveExamConfirmDialog/, /LessonTeacherDialog/, /assignActionLabel\(/, /lessonIsOthers/, /mergeKeepMine/]) assert.match(journal, needle, String(needle));
  // «Оставить мои» repeats the ORIGINAL action (save / finish / cancel), not a plain save
  for (const file of ["src/app/teacher/dashboard/page.tsx", "src/app/teacher/schedule/page.tsx"]) {
    const page = read(file);
    assert.match(page, /marksOps\.keepMine\(async \(operation, merged\)/, file);
    assert.match(page, /operation === "finish"\) await handleFinishLesson\(false, marks\)/, file);
    assert.match(page, /operation === "cancel"\) await handleCancelLesson\(\)/, file);
  }
  assert.match(journal, /kind: "finish"/);
  assert.match(read("src/lib/use-lesson-marks-ops.ts"), /operation: LessonOperation/);
  assert.match(read("src/lib/api.ts"), /expectedVersion\?: number/);
  assert.match(read("src/lib/api.ts"), /acknowledgeLiveExam\?: boolean/);
  const list = read("src/components/attendance/open-lessons-view.tsx");
  assert.match(list, /openLessonAccess/);
  assert.match(read("src/components/ui/modal.tsx"), /aboveLessonPanel/);
});
