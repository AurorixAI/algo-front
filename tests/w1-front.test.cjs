// W1 (front, F1-F9): one road of the cancellation, «Вернуть урок», the kind of a cancellation in the decision, «Ставка не задана» / the estimate / «ведомость изменится»,
// the later revisions of a weekly lesson, the notes of the server, the ref flags, «Вам назначена замена» for the owner / administrator.
// Spec: artifacts/analysis/W1_SPEC.md (F1-F9), contract: W1_API.md.  Every rule runs on the real helper; the dates are PASSED (rule 37: nothing reads the real clock).
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
// the api module is a recorder: the call of the teacher's cancellation is run against it (no network)
const apiPath = path.join(root, "src/lib/api.ts");
const calls = [];
require.cache[apiPath] = {
  id: apiPath, filename: apiPath, loaded: true,
  exports: {
    orgApi: {
      cancelMissedGroupAttendance: async (groupId, body) => { calls.push(["missed", groupId, body]); return { ok: true, cancelled: true, warnings: [{ code: "SUBSTITUTE_RELEASED", message: "Замена снята: Рахимов Т." }] }; },
      saveGroupAttendance: async (groupId, body) => { calls.push(["attendance", groupId, body]); return { ok: true, saved: true, warnings: [] }; },
      getScheduleOccurrences: async () => [],
    },
  },
};
const A = require(path.join(root, "src/lib/schedule-card-actions.ts"));
const S = require(path.join(root, "src/lib/substitutions.ts"));
const T = require(path.join(root, "src/lib/lesson-teacher.ts"));
const W = require(path.join(root, "src/lib/weekly-lessons.ts"));
const O = require(path.join(root, "src/lib/attendance-ops.ts"));
const { sendTeacherCancel } = require(path.join(root, "src/lib/teacher-cancel.ts"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const coded = (code, message, extra = {}) => Object.assign(new Error(message ?? ""), { code, status: 409, detail: { code, ...(message ? { message } : {}), ...extra } });

// ── F1 ────────────────────────────────────────────────────────────────────────────────────────────────────────────

test("F1: a teacher is offered «Урока не было» only for a lesson that has passed and was never started (or started with an empty roster); never «Отменить этот урок»", () => {
  const today = "2026-10-22";
  const after = new Date("2026-10-22T06:00:00Z");   // 11:00 in Tashkent
  const before = new Date("2026-10-22T04:30:00Z");  // 09:30
  const offer = (patch) => A.teacherCancelOffer({ role: "teacher", state: "scheduled", date: "2026-10-20", today, startTime: "10:00", endTime: "10:45", now: after, ...patch });
  assert.deepEqual(offer({}), { route: "missed", variant: "not_held", label: "Урока не было" }, "a past lesson nobody started: one line, no second line in the menu");
  assert.equal(offer({ date: "2026-10-24" }), null, "a lesson to come: he asks «Не смогу провести», the administrator cancels");
  assert.equal(offer({ date: today, now: before }), null, "today, not started yet");
  assert.equal(offer({ date: today, now: after })?.route, "missed", "today, the lesson is over (10:45 passed)");
  assert.equal(offer({ state: "completed" }), null);
  assert.equal(offer({ state: "cancelled" }), null);
  assert.equal(offer({ state: "in_progress" }), null, "a started lesson with a roster is finished, not cancelled");
  assert.equal(offer({ state: "in_progress", rosterEmpty: true })?.route, "attendance", "the one road the server leaves: started, nobody on the roster (O6)");
  assert.equal(offer({ state: undefined })?.route, "missed", "no state = scheduled");
  assert.ok(!A.SCHEDULE_ACTION_LABEL.cancel.includes("этот урок"));
});

test("F1: the call of the teacher goes through the right road and gives back the notes of the server", async () => {
  calls.length = 0;
  const target = { groupId: "g1", lessonId: "l1", lessonDate: "2026-10-20", topic: "T" };
  const notes = await sendTeacherCancel("missed", target, "Болел", {});
  assert.deepEqual(notes, ["Замена снята: Рахимов Т."]);
  assert.deepEqual(calls[0], ["missed", "g1", { lessonDate: "2026-10-20", lessonId: "l1", cancellationReason: "Болел" }], "no kind: a teacher always cancels «по вине центра»");
  await sendTeacherCancel("attendance", target, "Пусто", { expectedVersion: 3 });
  assert.equal(calls[1][0], "attendance");
  assert.deepEqual(calls[1][2], { lessonDate: "2026-10-20", lessonId: "l1", topic: "T", status: "cancelled", records: {}, cancellationReason: "Пусто", expectedVersion: 3 });
  assert.ok(!("cancellationKind" in calls[0][2]) && !("cancellationKind" in calls[1][2]));
});

test("F1: ONE panel for both pages (no copy), no «Отменить этот урок» anywhere in the teacher's code, the menu is hidden when it would be empty", () => {
  const { LessonCancelPanel } = require(path.join(root, "src/components/substitutions/lesson-cancel-panel.tsx"));
  const html = textOf(renderToStaticMarkup(React.createElement(LessonCancelPanel, { date: "2026-10-20", binding: { loading: false, attached: true, canCancel: true, examTitle: "К3" }, reason: "", onReason() {}, busy: false, onConfirm() {}, onBack() {} })));
  assert.match(html, /Урока не было: 20 октября/);
  assert.match(html, /Экзамен «К3» вернётся в черновик/);
  assert.doesNotMatch(html, /По вине центра|Праздник/, "a teacher is not asked for the kind");
  for (const file of ["src/app/teacher/schedule/page.tsx", "src/app/teacher/dashboard/page.tsx"]) {
    const page = read(file);
    assert.match(page, /<LessonCancelPanel/, file);
    assert.match(page, /teacherCancelOffer\(/, file);
    assert.match(page, /sendTeacherCancel\(/, file);
    assert.match(page, /cancelSending\.current/, `${file}: the ref flag against a double press`);
    assert.doesNotMatch(page, /Отменить этот урок|Подтвердить отмену/, file);
  }
  assert.doesNotMatch(read("src/components/substitutions/teacher-lesson-controls.tsx"), /Отменить этот урок/);
  assert.match(read("src/app/teacher/schedule/page.tsx"), /lessonMenuGroups\.some\(\(group\) => group\.items\.length > 0\)/, "no empty «⋯»");
  assert.match(read("src/app/teacher/dashboard/page.tsx"), /lessonMenuItems\.length > 0/, "no empty «⋯»");
});

test("F1/F4: the refusals of a cancellation have one wording on every screen", () => {
  const text = (code, message) => S.substitutionErrorText(coded(code, message));
  assert.equal(text("TEACHER_CANNOT_CANCEL"), "Отменить урок может администратор. Нажмите «Не смогу провести»");
  assert.equal(text("ALREADY_CANCELLED"), "Урок уже отменён. Обновите страницу");
  assert.equal(text("ALREADY_MOVED", "Урок уже перенесён на 29.10: отменить его нельзя. Отмените урок на новой дате"), "Урок уже перенесён на 29.10: отменить его нельзя. Отмените урок на новой дате");
  assert.match(text("ALREADY_MOVED"), /Отмените урок на новой дате/);
  assert.equal(text("LESSON_HAS_MARKS"), "У урока есть отметки или справки. Сначала снимите отметки");
  assert.equal(text("LESSON_CHANGED"), "Урок уже изменили: обновите страницу и повторите");
  assert.equal(text("REQUEST_REJECTED"), "Администратор отклонил заявку по этому уроку");
  assert.equal(text("LESSON_IN_PROGRESS"), "Урок идёт: сначала завершите его, затем назначьте того, кто провёл");
  assert.equal(text("LESSON_TOO_OLD"), "Урок старше 7 дней — его закрывает администратор или владелец.");
  assert.match(text("SERIES_ENDED", "Постоянный урок прекращается с 05.11 — перенесите на более раннюю дату"), /прекращается с 05\.11/);
  for (const code of ["TEACHER_CANNOT_CANCEL", "ALREADY_CANCELLED", "LESSON_HAS_MARKS", "LESSON_CHANGED", "LESSON_ALREADY_STARTED"]) {
    const failure = O.lessonFailure(coded(code, "x"), "cancel", "fallback");
    assert.equal(failure.kind, "other");
    assert.equal(failure.text, S.substitutionErrorText(coded(code, "x")), `${code}: the lesson panel says the same`);
  }
  // no technical words or ISO dates in the sentences
  for (const code of ["TEACHER_CANNOT_CANCEL", "ALREADY_CANCELLED", "LESSON_HAS_MARKS", "LESSON_CHANGED", "REQUEST_REJECTED", "RESTORE_PAST", "RESTORE_DAY_OFF", "RESTORE_LESSON_GONE", "RESTORE_NOT_CANCELLED"]) assert.doesNotMatch(text(code), /[A-Z_]{6,}|\d{4}-\d{2}-\d{2}/, code);
  // a pack: the refused item says it in the same words
  assert.equal(S.bulkSkippedLine({ id: "a", code: "LESSON_HAS_MARKS", message: "x" }), "У урока есть отметки или справки. Сначала снимите отметки");
});

// ── F2 / F7 ───────────────────────────────────────────────────────────────────────────────────────────────────────

test("F2: after the administrator rejected the request, «Перенести урок» is off with the reason; the other rules stay", () => {
  const NOW = Date.UTC(2026, 9, 26, 5, 0);
  const base = { role: "teacher", userId: "t1", lessonTeacherId: "t1", isSubstitution: false, lessonStatus: "scheduled", startsAtMs: NOW + 5 * 3600_000, nowMs: NOW };
  assert.equal(S.teacherMoveControl({ ...base, mark: { status: "rejected" } }).kind, "rejected");
  assert.equal(S.teacherMoveControl({ ...base, mark: { status: "pending" } }).kind, "button");
  assert.equal(S.teacherMoveControl({ ...base, mark: null }).kind, "button");
  assert.equal(S.teacherMoveControl({ ...base, mark: { status: "rejected" }, startsAtMs: NOW - 1 }).kind, "none", "a started lesson is not movable whatever the request says");
  assert.equal(S.MOVE_REJECTED_HINT, "Администратор отклонил заявку по этому уроку");
  // the live check of the move says the same when the server refuses (REQUEST_REJECTED / SERIES_ENDED with its own date)
  const refused = A.lessonMoveCheckLines({ ok: false, code: "REQUEST_REJECTED", message: "Администратор отклонил заявку по этому уроку", teacherConflicts: [], groupConflicts: [], warnings: [] });
  assert.deepEqual([refused.ok, refused.lines, refused.stale], [false, ["Администратор отклонил заявку по этому уроку"], false]);
  const ended = A.lessonMoveCheckLines({ ok: false, code: "SERIES_ENDED", message: "Постоянный урок прекращается с 05.11 — перенесите на более раннюю дату", teacherConflicts: [], groupConflicts: [], warnings: [] });
  assert.match(ended.lines[0], /прекращается с 05\.11/);
  const controls = read("src/components/substitutions/teacher-move-control.tsx");
  assert.match(controls, /mark,\n\s+\}\);|nowMs: now,\n\s+mark,/, "the control passes the request to the rule");
});

test("F7: «ученик занят» is a note, never a block: it is shown in the live check and after the save", () => {
  const busy = { code: "STUDENT_BUSY", message: "У учеников пересечение: Иванов А., Петров Б. и ещё 2", students: [{ id: "s1", name: "Иванов А.", groupName: "9-А", startTime: "10:00", endTime: "11:00" }] };
  const check = A.lessonMoveCheckLines({ ok: true, teacherConflicts: [], groupConflicts: [], warnings: [busy] });
  assert.equal(check.ok, true);
  assert.deepEqual(check.warnings, ["У учеников пересечение: Иванов А., Петров Б. и ещё 2"]);
  assert.equal(A.moveConfirmDisabled({ checking: false, failed: false, check: { ok: true } }), false, "a warning does not block the move");
  assert.deepEqual(S.moveCheckLines({ ok: true, teacherName: "Иванов И.", teacherConflicts: [], groupConflicts: [], warnings: [busy] }, "9-А").warnings, ["У учеников пересечение: Иванов А., Петров Б. и ещё 2"]);
  assert.deepEqual(S.assignmentNotes({ warnings: [busy] }), ["У учеников пересечение: Иванов А., Петров Б. и ещё 2"], "the toast after the decision / the move shows it");
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  assert.match(sheet, /onChanged\("Урок перенесён", warningTexts\(moved\?\.result\)\)/);
});

// ── F3 ────────────────────────────────────────────────────────────────────────────────────────────────────────────

test("F3: «Вернуть урок» - the owner / administrator, a cancelled lesson that has not started, not a moved original, not a day off", () => {
  const base = { role: "owner", archived: false, today: "2026-10-22", state: "cancelled", date: "2026-10-24", startTime: "10:00", now: new Date("2026-10-22T06:00:00Z") };
  assert.equal(A.canRestoreLesson(base), true);
  assert.equal(A.canRestoreLesson({ ...base, role: "admin" }), true);
  assert.equal(A.canRestoreLesson({ ...base, role: "teacher" }), false);
  assert.equal(A.canRestoreLesson({ ...base, archived: true }), false);
  assert.equal(A.canRestoreLesson({ ...base, state: "scheduled" }), false);
  assert.equal(A.canRestoreLesson({ ...base, moved: true }), false, "its copy is cancelled instead");
  assert.equal(A.canRestoreLesson({ ...base, cancelKind: "day_off" }), false, "the day off is undone itself");
  assert.equal(A.canRestoreLesson({ ...base, cancelKind: "centre" }), true);
  assert.equal(A.canRestoreLesson({ ...base, cancelKind: "holiday" }), true);
  assert.equal(A.canRestoreLesson({ ...base, date: "2026-10-20" }), false, "a lesson that has passed");
  assert.equal(A.canRestoreLesson({ ...base, date: "2026-10-22", startTime: "10:00" }), false, "today, started (11:00 in Tashkent)");
  assert.equal(A.canRestoreLesson({ ...base, date: "2026-10-22", startTime: "18:00" }), true, "today, not started yet");
  assert.equal(A.SCHEDULE_ACTION_LABEL.restore, "Вернуть урок");
  assert.deepEqual(A.scheduleCardActions({ ...base, hasTeacherInfo: true }), ["restore"]);
});

test("F3: the words and the call of «Вернуть урок»; every RESTORE_* refusal in plain language", () => {
  const R = require(path.join(root, "src/lib/lesson-restore.ts"));
  assert.equal(R.RESTORE_REASON_LABEL, "Причина возврата");
  assert.match(R.RESTORE_NOTE_CENTRE, /вычет у учеников \(если он был\) исчезнет/);
  assert.match(R.RESTORE_NOTE, /Экзамены, снятые с него при отмене, не вернутся/);
  const text = (code, message) => S.substitutionErrorText(coded(code, message));
  assert.match(text("RESTORE_NOT_CANCELLED"), /уже не отменён/);
  assert.match(text("RESTORE_MOVED", "Урок перенесён на 29.10: чтобы вернуть его, отмените урок на новой дате и перенесите его обратно"), /перенесён на 29\.10/);
  assert.match(text("RESTORE_MOVED"), /отмените урок на новой дате/);
  assert.match(text("RESTORE_PAST"), /вернуть его нельзя/);
  assert.match(text("RESTORE_DAY_OFF"), /отмените сам выходной/);
  assert.match(text("RESTORE_LESSON_GONE"), /больше нет в расписании/);
  assert.equal(text("REASON_REQUIRED"), "Укажите причину (не менее 3 символов)");
  assert.equal(text("TEACHER_BUSY", "Преподаватель занят").length > 0, true);
  const api = read("src/lib/api.ts");
  assert.match(api, /restoreLesson: \(groupId: string, body: \{ lessonId: string; lessonDate: string; reason: string \}\) =>\s+api<RestoreLessonResult>\(`\/auth\/org\/groups\/\$\{encodePathId\(groupId\)\}\/lessons\/restore`, \{ method: "POST", body \}\)/);
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  assert.match(sheet, /orgApi\.restoreLesson\(groupId, \{ lessonId: lesson\.id, lessonDate: lesson\.date, reason: trimmed \}\)/);
  assert.match(sheet, /onChanged\("Урок возвращён", warningTexts\(restored\)\)/, "the toast; the note about the exams is under the form's field, not repeated as a warning");
  assert.doesNotMatch(sheet.replace(/\/\/.*$/gm, ""), /examsNote/, "R3 9: no examsNote toast after a restore");
  assert.match(sheet, /data-testid="sheet-restore"/);
  assert.match(read("src/lib/cancel-sheet.ts"), /"restore"/);
  assert.match(read("src/components/groups/group-schedule-overview.tsx"), /moved, cancelKind: attendance\?\.cancellationKinds\?\.\[key\] \?\? null/, "the card and the sheet pass the same facts to the one rule");
});

// ── F4 ────────────────────────────────────────────────────────────────────────────────────────────────────────────

test("F4: the decision «Отменить» sends its kind (default «по вине центра»), says the truth about money, asks it in the pack too", () => {
  assert.deepEqual(S.buildDecide("cancel", { reason: " Болен " }), { decision: "cancel", reason: "Болен", cancellationKind: "centre", expectedStatus: "pending" });
  assert.equal(S.buildDecide("cancel", { reason: "Праздник", cancellationKind: "holiday" }).cancellationKind, "holiday");
  assert.equal("cancellationKind" in S.buildDecide("reject", { reason: "Нет" }), false);
  assert.equal("cancellationKind" in S.buildDecide("substitute", { teacherId: "t" }), false);
  assert.doesNotMatch(S.CANCEL_CONSEQUENCES, /стоимость месяца не меняется/, "D18: the old hint contradicted PAY-F");
  const dialog = read("src/components/substitutions/decision-dialog.tsx");
  assert.match(dialog, /useState<CancellationKind>\(DEFAULT_CANCELLATION_KIND\)/);
  assert.match(dialog, /buildDecide\(kind, \{ teacherId: pick, note, reason, move, cancellationKind: cancelKind \}\)/);
  const bulk = read("src/components/substitutions/bulk-dialog.tsx");
  assert.match(bulk, /cancellationKind: cancelKind/);
  // the toast of a decision shows what the server said besides (a date under a day off became a holiday)
  const out = { item: { id: "r" }, result: { kind: "cancel", cancellationKind: "holiday", warnings: [{ code: "CANCELLED_AS_HOLIDAY", message: "Дата под выходным: отменено как праздник" }] } };
  assert.deepEqual(S.assignmentNotes(out.result), ["Дата под выходным: отменено как праздник"]);
  assert.equal(S.decisionToast(out), "Урок отменён");
});

// ── F5 ────────────────────────────────────────────────────────────────────────────────────────────────────────────

test("F5: «Ставка не задана» in EVERY window of assigning (each role in his words), the estimate only when the server counted one, «ведомость изменится»", () => {
  assert.match(T.rateMissingText("owner"), /пока вы её не зададите/);
  assert.match(T.rateMissingText("admin"), /пока владелец не задаст ставку/);
  assert.deepEqual(T.candidateMoneyLines({ rateMissing: true }, "admin"), [T.rateMissingText("admin")]);
  assert.deepEqual(T.candidateMoneyLines({ rateMissing: true, busy: true }, "owner"), [], "a busy candidate says only that he is busy");
  assert.deepEqual(T.candidateMoneyLines({ rateMissing: null }, "owner"), []);
  assert.deepEqual(T.candidateMoneyLines({}, "owner"), [], "an older server: nothing");
  assert.equal(T.substitutePayLine({ substitutePayEstimate: 46000 }), "≈ 46 000 сум за урок, ориентировочно".replace(/ (?=\d{3} сум)/, " ").replace(" сум", " сум"));
  assert.equal(T.substitutePayLine({ substitutePayEstimate: null, substitutePayEstimateReason: "RATE_MISSING" }), null);
  assert.equal(T.substitutePayLine({ substitutePayEstimate: 0, substitutePayEstimateReason: "NO_STUDENTS" }), null);
  assert.equal(T.substitutePayLine({}), null);
  assert.equal(T.substitutePayLine({ rateMissing: true, substitutePayEstimate: 5000 }), null, "no estimate beside «нет ставки»");
  assert.equal(T.payrollSheetsNote([{ month: "2026-10", status: "approved" }]), "Ведомость за октябрь изменится");
  assert.equal(T.payrollSheetsNote([{ month: "2026-10" }, { month: "2026-11" }, { month: "2026-10" }]), "Ведомости за октябрь и ноябрь изменятся");
  assert.equal(T.payrollSheetsNote([]), null);
  assert.equal(T.payrollSheetsNote(undefined), null);
  assert.deepEqual(S.assignmentNotes({ payrollSheetsAffected: [{ month: "2026-09" }], warnings: [{ message: "Кабинет занят" }] }), ["Кабинет занят", "Ведомость за сентябрь изменится"]);
  assert.deepEqual(S.assignmentNotes({ payrollSheetsAffected: [] }), []);
  // both lists use the same helper (rule 38), and the three screens that assign show the notes
  for (const file of ["src/components/groups/lesson-teacher-dialog.tsx", "src/components/substitutions/decision-dialog.tsx"]) assert.match(read(file), /candidateMoneyLines\(candidate, role\)/, file);
  for (const file of ["src/components/groups/group-schedule-overview.tsx", "src/components/groups/group-attendance-journal.tsx", "src/app/teacher/schedule/page.tsx"]) assert.match(read(file), /assignmentNotes\(result\)/, file);
  assert.match(read("src/components/substitutions/substitutions-page.tsx"), /assignmentNotes\(out\.result \?\? \{\}\)/);
});

test("F5: the list of the assign dialog shows the rate and the estimate lines (render)", () => {
  const { LessonTeacherBody } = require(path.join(root, "src/components/groups/lesson-teacher-dialog.tsx"));
  const list = { lessonId: "l", lessonDate: "2026-10-28", startTime: "10:00", endTime: "11:00", currentTeacherId: "t0", defaultTeacherId: "t0", candidates: [
    { teacherId: "t1", name: "Рахимов Т.", orgRole: "teacher", rateMissing: true },
    { teacherId: "t2", name: "Сидоров С.", orgRole: "admin", substitutePayEstimate: 120000 },
    { teacherId: "t3", name: "Занят З.", orgRole: "teacher", busy: true, busyWith: { groupName: "8-В", startTime: "10:00", endTime: "11:00" }, rateMissing: true },
  ] };
  const html = textOf(renderToStaticMarkup(React.createElement(LessonTeacherBody, { list, loadError: null, current: "t0", pick: null, reason: "", reasonProblem: null, busy: false, error: null, role: "admin", onPick() {}, onReason() {}, onRetry() {} })));
  assert.match(html, /Рахимов Т\.[^]*Ставка не задана — заработок за урок не будет посчитан, пока владелец не задаст ставку/);
  assert.match(html, /≈ 120.000.сум за урок, ориентировочно/);
  assert.equal((html.match(/Ставка не задана/g) || []).length, 1, "the busy one has no rate line");
});

// ── F6 ────────────────────────────────────────────────────────────────────────────────────────────────────────────

test("F6: the later revisions are named after the save and before it; «Применить также» has no local filter; a coded «nothing to change» is done", () => {
  assert.deepEqual(W.laterRevisionNotes({ laterRevisions: [{ effectiveFrom: "2026-11-12", fields: ["room", "startTime", "endTime"] }] }), ["Есть изменение с 12.11 — оно тоже обновлено (кабинет, время)"]);
  assert.deepEqual(W.laterRevisionNotes({ laterRevisions: [] }), []);
  assert.deepEqual(W.laterRevisionNotes(null), []);
  // BEFORE the save only from the server's list of the later revisions (no guessing from the schedule)
  assert.equal(W.laterChangeNote([{ effectiveFrom: "2026-11-12" }]), "С 12.11 у этого урока уже есть своё изменение — оно тоже обновится");
  assert.equal(W.laterChangeNote([{ effectiveFrom: "2026-11-12" }, { effectiveFrom: "2026-11-20" }]), "С 12.11 и 20.11 у этого урока уже есть своё изменение — оно тоже обновится");
  assert.equal(W.laterChangeNote([]), null);
  assert.equal(W.laterChangeNote(undefined), null);
  assert.equal(typeof W.weeklyLaterChange, "undefined", "R3 5/7: the 11-week schedule heuristic is gone");
  assert.equal(typeof W.laterChangeDate, "undefined");
  assert.equal(W.isNoChanges(coded("NO_CHANGES", "Укажите хотя бы одно изменение постоянного расписания")), true);
  assert.equal(W.isNoChanges(new Error("Укажите хотя бы одно изменение постоянного расписания")), true, "an older server: the sentence");
  assert.equal(W.isNoChanges(coded("TEACHER_BUSY")), false);
  const dialogs = read("src/components/schedule/weekly-lesson-dialogs.tsx");
  assert.match(dialogs, /laterRevisionNotes\(revised\)/);
  assert.match(dialogs, /data-testid="later-change-note"/);
  assert.match(dialogs, /orgApi\.getRecurrenceRevisions\(lesson\.id, effectiveFrom\)/, "the note comes from the server's revisions");
  assert.match(read("src/lib/api.ts"), /recurrence\/revisions\$\{after \?/);
  assert.match(dialogs, /disabled=\{busy \|\| mainSaved\} className=\{SLOT_FIELD_CLASS\}/, "after a partial refusal the date is locked");
  assert.match(dialogs, /disabled=\{busy \|\| mainSaved\}\s+placeholder="Например: постоянная смена аудитории"/, "... and the reason");
  assert.doesNotMatch(read("src/lib/weekly-lessons.ts"), /patchFor\(/, "no local filter of «Применить также»");
});

test("F6: a change of day / time with exams asks a tick (the server's EXAMS_NEED_CONFIRMATION), and the stop says what it closed", () => {
  const exams = [{ examId: "e1", title: "К3", lessonDate: "2026-11-12", status: "draft" }];
  assert.deepEqual(W.examsToConfirm(coded("EXAMS_NEED_CONFIRMATION", "x", { exams })), exams);
  assert.equal(W.examsToConfirm(coded("LESSON_HAS_LIVE_EXAM")), null, "a running exam is not asked: the server blocks");
  assert.equal(W.examsToConfirm(new Error("x")), null);
  assert.deepEqual(W.endSeriesNotes({ closedRequests: 2, releasedSubstitutes: 1, removedCancellations: 3 }), ["Закрыто запросов на замену: 2", "Снято замен: 1", "Снято отмен, поставленных заранее: 3"]);
  assert.deepEqual(W.endSeriesNotes({ closedRequests: 0 }), []);
  assert.deepEqual(W.endSeriesNotes(undefined), []);
  const dialogs = read("src/components/schedule/weekly-lesson-dialogs.tsx");
  assert.match(dialogs, /releaseAffectedExams: true/);
  assert.match(dialogs, /data-testid="exams-confirm"/);
  assert.match(read("src/components/groups/group-schedule-overview.tsx"), /onEnded=\{\(notes\) =>/);
  assert.match(read("src/app/teacher/schedule/page.tsx"), /onEnded=\{async \(notes\) =>/);
});

// ── F8 ────────────────────────────────────────────────────────────────────────────────────────────────────────────

test("F8: every dialog that cancels / decides / assigns / stops closes a second press with a ref, not only with the state", () => {
  const files = [
    "src/components/groups/lesson-action-sheet.tsx", "src/components/groups/lesson-teacher-dialog.tsx", "src/components/substitutions/decision-dialog.tsx",
    "src/components/substitutions/bulk-dialog.tsx", "src/components/schedule/weekly-lesson-dialogs.tsx", "src/components/attendance/cancel-missed-lesson-modal.tsx",
    "src/components/substitutions/request-dialog.tsx", "src/components/substitutions/request-control.tsx", "src/components/substitutions/teacher-requests-block.tsx",
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /sending = useRef\(false\)/, file);
    assert.match(source, /sending\.current\) return/, `${file}: the guard`);
    assert.match(source, /sending\.current = true/, file);
    assert.match(source, /sending\.current = false/, `${file}: released in finally`);
  }
  // the stop of a weekly lesson sits in the same file as the edit: both guard
  assert.equal((read("src/components/schedule/weekly-lesson-dialogs.tsx").match(/sending = useRef\(false\)/g) || []).length >= 3, true);
});

// ── F9 ────────────────────────────────────────────────────────────────────────────────────────────────────────────

test("F9: «Вам назначена замена» is one block for the teacher and for the owner / administrator (the page «Замены»)", () => {
  const { AssignedLessons } = require(path.join(root, "src/components/substitutions/teacher-requests-block.tsx"));
  const entries = [{ groupId: "g", groupName: "9-А", lessonId: "l", lessonDate: "2026-10-28", startTime: "10:00", endTime: "11:30", replacing: { id: "t", name: "Иванов Иван" } }];
  const html = textOf(renderToStaticMarkup(React.createElement(AssignedLessons, { entries })));
  assert.match(html, /Вам назначена замена/);
  assert.match(html, /Замена: 9-А — /);
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /<ManagerAssignedBlock \/>/);
  assert.match(read("src/components/substitutions/teacher-requests-block.tsx"), /export function ManagerAssignedBlock\(\)/);
  assert.match(read("src/components/substitutions/teacher-requests-block.tsx"), /<AssignedLessons entries=\{assigned\} \/>/, "the teacher's block is the same one");
  const types = read("src/lib/substitution-types.ts");
  assert.match(types, /assignedToMe: AssignedToMe\[\]/);
});

// ── the rest of the notes: nothing the server says is lost silently ──────────────────────────────────────────────

test("the notes of the server (warnings) reach the person on every road of a cancellation / move / assignment / stop", () => {
  const notes = (file, needle) => assert.match(read(file), needle, file);
  notes("src/components/groups/lesson-action-sheet.tsx", /onChanged\("Урок отменён", warningTexts\(cancelled\)\)/);
  notes("src/components/groups/group-schedule-overview.tsx", /onChanged=\{\(text, notes\) => \{ setSheetLesson\(null\); showToast\(text, notes\?\.length \? "warning" : "success", notes\)/);
  notes("src/components/attendance/cancel-missed-lesson-modal.tsx", /onCancelled\(target, warningTexts\(out\)\)/);
  notes("src/components/attendance/open-lessons-view.tsx", /notes\.length \? "warning" : "success", notes/);
  notes("src/components/groups/group-attendance-journal.tsx", /done\.lessonDate\)\} отмечен как не состоявшийся`, notes\.length \? "warning" : "success", notes/);
  notes("src/lib/api.ts", /cancelMissedGroupAttendance[\s\S]*warnings\?: OpsWarning\[\]/);
  notes("src/lib/ops-b-types.ts", /warnings\?: OpsWarning\[\];\n  \/\*\* Version of the lesson record/);
  assert.equal(S.CLOSED_REASON_TEXT.LESSON_RESTORED, "Урок возвращён", "the journal «Замены» knows the new closing");
});

// ── the addendum 27.10 (F10-F12, S20, S22, S25-S27, day off) ─────────────────────────────────────────────────────

test("F10: the main teacher's lesson with a substitute shows «Замена: <имя>» (the same words for every viewer who is not the substitute)", () => {
  const occ = { groupName: "9-А", isSubstitution: true, teacherId: "sub", teacherName: "Рахимов Т.", defaultTeacherId: "main" };
  assert.deepEqual(S.occurrenceChips(occ, "main").map((c) => c.text), ["Замена: Рахимов Т."]);
  assert.deepEqual(S.occurrenceChips(occ, "sub").map((c) => c.text), ["Замена: 9-А"], "the substitute himself sees the group");
  assert.deepEqual(S.occurrenceChips(occ, "boss", { manager: true }).map((c) => c.text), ["Замена: Рахимов Т."]);
  assert.equal(T.replacedByLabel({ isSubstitution: true, teacherName: "Рахимов Т.", defaultTeacherId: "main" }, "main"), "Замена: Рахимов Т.");
  assert.equal(T.replacedByLabel({ isSubstitution: true, teacherName: "", defaultTeacherId: "main" }, "main"), "Замена: другой преподаватель");
});

test("F11: «Вам назначена замена» stays until the lesson STARTS; «Замена снята» is a new line from clearedForMe", () => {
  const parse = (date, time) => new Date(`${date}T${time}:00+05:00`);
  const entries = [{ lessonDate: "2026-10-28", startTime: "10:00" }, { lessonDate: "2026-10-28", startTime: "15:00" }, { lessonDate: "2026-10-29", startTime: null }];
  const at = (hhmm) => parse("2026-10-28", hhmm).getTime();
  assert.equal(S.assignedAhead(entries, at("09:00"), parse).length, 3);
  assert.deepEqual(S.assignedAhead(entries, at("10:00"), parse).map((e) => e.startTime), ["15:00", null], "10:00 exactly = started");
  assert.deepEqual(S.assignedAhead(entries, at("16:00"), parse).map((e) => e.startTime), [null], "no readable start: the server decides");
  const line = S.clearedForMeLine({ groupName: "9-А", lessonDate: "2026-10-28", startTime: "10:00", endTime: "11:30", clearedAt: "2026-10-27T04:30:00", clearedBy: { name: "Каримова Н." } });
  assert.match(line, /^Замена снята: 9-А — .*28\.10, 10:00–11:30 \(снял\(а\) Каримова Н\., 27\.10 09:30\)$/);
  assert.equal(S.clearedForMeLine({ groupName: "9-А", lessonDate: "2026-10-28" }).endsWith("28.10"), true, "no author, no time: nothing invented");
  const { AssignedLessons } = require(path.join(root, "src/components/substitutions/teacher-requests-block.tsx"));
  const { ClearedLessons } = require(path.join(root, "src/components/substitutions/teacher-requests-block.tsx"));
  const cleared = [{ groupId: "g", groupName: "9-А", lessonId: "l", lessonDate: "2026-10-28", startTime: "10:00", endTime: "11:30", clearedAt: "2026-10-27T04:30:00", clearedBy: { id: "x", name: "Каримова Н." } }];
  const eventHtml = renderToStaticMarkup(React.createElement(ClearedLessons, { entries: cleared }));
  assert.match(textOf(eventHtml), /Замена снята: 9-А/);
  assert.doesNotMatch(eventHtml, /<details/, "the event is a line of its own, not inside the card of the lessons he still has");
  assert.equal(renderToStaticMarkup(React.createElement(AssignedLessons, { entries: [] })), "", "nothing assigned - no card");
});

test("F12: an emptied room / topic the lesson had is REMOVED (explicit null) and said so; one never had is no change", () => {
  const F = require(path.join(root, "src/lib/lesson-slot-form.ts"));
  const snap = { id: "a", dayOfWeek: 1, startTime: "14:00", endTime: "15:30", room: "12", format: "offline", color: "blue", topic: "Дроби" };
  const form = { day: 1, startTime: "14:00", endTime: "15:30", room: "", format: "offline", topic: "", color: "blue" };
  assert.deepEqual(F.revisionPatch(snap, form), { room: null, topic: null });
  assert.deepEqual(F.revisionPatch({ ...snap, room: null, topic: "" }, form), {}, "never had them: nothing to remove");
  assert.deepEqual(F.revisionPatch(snap, { ...form, room: " 12 ", topic: "Дроби" }), {});
  assert.deepEqual(F.sharedRevisionPatch({ room: null }, { startTime: "14:00", endTime: "15:30" }), { room: null }, "the pack gets the same removal");
  assert.equal(W.removalNote({ room: null }, "2026-11-12"), "Кабинет будет убран с 12.11");
  assert.equal(W.removalNote({ topic: null }, "2026-11-12"), "Тема будет убрана с 12.11");
  assert.equal(W.removalNote({ room: null, topic: null }, "2026-11-12"), "Кабинет и тема будут убраны с 12.11");
  assert.equal(W.removalNote({ room: "5" }, "2026-11-12"), null);
  assert.match(read("src/components/schedule/weekly-lesson-dialogs.tsx"), /data-testid="removed-note"/);
});

test("S20: the requests that drop out on the 1st are named («истекают через ≤3 дня»); the closing is «Не решено вовремя»", () => {
  assert.equal(S.expiringLine(0), null);
  assert.equal(S.expiringLine(undefined), null);
  assert.match(S.expiringLine(3), /^Истекают через ≤3 дня: 3\./);
  assert.equal(S.badgeTitle({ pendingTotal: 4, urgentTotal: 1, expiringTotal: 2 }), "Ждут решения: 4, срочных: 1, истекают через ≤3 дня: 2");
  assert.equal(S.CLOSED_REASON_TEXT.LESSON_OUTSIDE_WINDOW, "Не решено вовремя");
  assert.match(read("src/components/substitutions/substitutions-page.tsx"), /data-testid="expiring-note"/);
});

test("S26 / S27: «Добавил: <имя>» on a one-off lesson; the teacher cancels ONLY the one-off lesson he added himself, a lesson to come", () => {
  assert.equal(A.addedByLine({ createdBy: { name: "Каримов Р.", role: "teacher" } }), "Добавил: Каримов Р., преподаватель");
  assert.equal(A.addedByLine({ createdBy: { name: "Юсупова Н.", role: "admin" } }), "Добавил: Юсупова Н., администратор");
  assert.equal(A.addedByLine({ createdBy: null }), null);
  assert.equal(A.addedByLine({}), null);
  const mine = { isOneOff: true, createdBy: { id: "t1" } };
  assert.equal(A.isOwnOneOff(mine, "t1"), true);
  assert.equal(A.isOwnOneOff(mine, "t2"), false);
  assert.equal(A.isOwnOneOff({ ...mine, movedFrom: { date: "2026-10-20" } }, "t1"), false, "the copy of a move: only the administrator");
  assert.equal(A.isOwnOneOff({ ...mine, isOneOff: false }, "t1"), false);
  assert.equal(A.isOwnOneOff(mine, null), false);
  const base = { role: "teacher", state: "scheduled", date: "2026-10-24", today: "2026-10-22", startTime: "10:00", now: new Date("2026-10-22T06:00:00Z") };
  assert.equal(A.teacherCancelOffer({ ...base }), null, "every other lesson to come: no cancel item (F1)");
  assert.deepEqual(A.teacherCancelOffer({ ...base, ownOneOff: true }), { route: "attendance", variant: "own_one_off", label: "Отменить разовый урок" });
  assert.equal(A.teacherCancelOffer({ ...base, ownOneOff: true, date: "2026-10-20" })?.variant, "not_held", "once it has passed it is «Урока не было» like any lesson");
  assert.equal(A.teacherCancelOffer({ ...base, ownOneOff: true, state: "completed" }), null);
  const { LessonCancelPanel } = require(path.join(root, "src/components/substitutions/lesson-cancel-panel.tsx"));
  const html = textOf(renderToStaticMarkup(React.createElement(LessonCancelPanel, { date: "2026-10-24", oneOff: true, binding: { loading: false, attached: false, canCancel: true }, reason: "x", onReason() {}, busy: false, onConfirm() {}, onBack() {} })));
  assert.match(html, /Отменить разовый урок: 24 октября/);
  assert.match(html, /Разовый урок будет отменён/);
  assert.doesNotMatch(html, /исчезнет/, "R3 10: the lesson is cancelled, it does not «vanish»");
  for (const file of ["src/app/teacher/schedule/page.tsx", "src/app/teacher/dashboard/page.tsx"]) assert.match(read(file), /ownOneOff: isOwnOneOff\(activeLesson, user\?\.id\)/, file);
  assert.match(read("src/components/groups/group-schedule-overview.tsx"), /addedByLine\(lesson\)/);
});

test("day off: «не завершён» is kept on the server; the lessons that came back WITHOUT their substitute are listed", () => {
  const panel = read("src/components/schedule/days-off-panel.tsx");
  assert.match(panel, /find\(\(day\) => day\.active && day\.incomplete\)/);
  assert.match(panel, /data-testid="day-off-not-restored"/);
  assert.match(panel, /data-testid="day-off-notice-lines"/);
  assert.match(panel, /result\.warnings \?\? \[\]/);
  const payf = read("src/lib/payf.ts");
  assert.match(payf, /incomplete\?: boolean/);
  assert.match(payf, /warnings\?: Array<\{ code: string; message: string/);
});

test("R3 round: an administrator's estimate is hidden (null / HIDDEN) - nothing but the yes / no of the rate; a teacher's «ученик занят» is shown as the server wrote it; the day-off / too-old reasons", () => {
  assert.equal(T.substitutePayLine({ substitutePayEstimate: null, substitutePayEstimateReason: "HIDDEN" }), null);
  assert.deepEqual(T.candidateMoneyLines({ rateMissing: false, substitutePayEstimate: null, substitutePayEstimateReason: "HIDDEN" }, "admin"), [], "no hint beyond rateMissing");
  assert.deepEqual(T.candidateMoneyLines({ rateMissing: true, substitutePayEstimate: null, substitutePayEstimateReason: "HIDDEN" }, "admin"), [T.rateMissingText("admin")]);
  const own = { code: "STUDENT_BUSY", message: "У 2 учеников в это время другой урок: Иванов А., Петров Б." };
  assert.deepEqual(A.lessonMoveCheckLines({ ok: true, teacherConflicts: [], groupConflicts: [], warnings: [own] }).warnings, [own.message], "as is: no names of other groups are added or invented");
  assert.equal(S.substitutionErrorText(coded("CANCELLED_BY_DAY_OFF")), "Урок отменён выходным днём: чтобы изменить причину, измените сам выходной");
  assert.match(S.substitutionErrorText(coded("REASON_CHANGE_TOO_OLD")), /Причину можно изменить только у недавней отмены/);
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  assert.match(sheet, /substitutionErrorText\(cause, mode === "restore"/, "the sheet words both through the one function");
});

// ── the fix round after the front R3 (27.10) ─────────────────────────────────────────────────────────────────────

const J = (item) => ({ origin: "system", status: "cancelled", teacher: { id: "t1", name: "Иванов И." }, decision: { kind: "cancel", by: { id: "m", name: "Каримова Н." }, at: "2026-10-22T04:30:00" }, ...item });

test("R3 2: the journal «Замены» understands EVERY W1 trigger - who did it, in human words (one assertion block per trigger)", () => {
  const lines = (item) => ({ origin: S.originLine(item), by: S.decidedByLine(item), chip: S.reasonChipText(item), result: S.decisionResultText(item) });
  // manager_cancel
  assert.deepEqual(lines(J({ trigger: "manager_cancel" })), { origin: "Без запроса", by: "Отменил администратор Каримова Н., 22.10 09:30", chip: "Отмена", result: "Урок отменён" });
  assert.equal(S.decidedByLine(J({ trigger: "manager_cancel", decision: { kind: "cancel", by: { id: "o", name: "Юсупова Н.", role: "owner" }, at: "2026-10-22T04:30:00" } })), "Отменил владелец Юсупова Н., 22.10 09:30");
  // teacher_cancel
  assert.deepEqual(lines(J({ trigger: "teacher_cancel", decision: { kind: "cancel", via: "teacher_cancel", by: { id: "t1", name: "Иванов И." }, at: "2026-10-22T04:30:00" } })), { origin: "Без запроса", by: "Урока не было — преподаватель Иванов И., 22.10 09:30", chip: "Урока не было", result: "Урока не было" });
  // manager_restore
  const restored = J({ trigger: "manager_restore", status: "closed", decision: { kind: "closed", via: "manager_restore", closedReason: "LESSON_RESTORED", by: { id: "m", name: "Каримова Н." }, at: "2026-10-22T04:30:00" } });
  assert.deepEqual(lines(restored), { origin: "Без запроса", by: "Вернул урок администратор Каримова Н., 22.10 09:30", chip: "Возврат", result: "Урок возвращён" });
  // manager_reason_change
  const kind = J({ trigger: "manager_reason_change", status: "closed", decision: { kind: "closed", via: "reason_change", closedReason: "KIND_CHANGED", by: { id: "m", name: "Каримова Н." }, at: "2026-10-22T04:30:00" } });
  assert.deepEqual(lines(kind), { origin: "Без запроса", by: "Вид отмены изменил администратор Каримова Н., 22.10 09:30", chip: "Вид отмены", result: "Вид отмены изменён" });
  // teacher_one_off: WHO added it is the teacher of the record
  const oneOff = J({ trigger: "teacher_one_off", status: "closed", teacher: { id: "t9", name: "Рахимов Т." }, decision: { kind: "closed", closedReason: "ONE_OFF_ADDED", at: "2026-10-22T04:30:00" } });
  assert.deepEqual(lines(oneOff), { origin: "Без запроса", by: "Разовый урок добавил преподаватель Рахимов Т., 22.10 09:30", chip: "Разовый урок", result: "Разовый урок добавлен" });
  // window_expired (a request of the teacher the month border closed)
  const expired = { origin: "teacher", trigger: "window_expired", status: "closed", teacher: { id: "t1", name: "Иванов И." }, reasonCode: "illness", decision: { kind: "closed", closedReason: "LESSON_OUTSIDE_WINDOW", at: "2026-11-01T00:05:00" } };
  assert.equal(S.decisionResultText(expired), "Не решено вовремя");
  assert.equal(S.decidedByLine(expired), "Закрыто системой, 01.11 05:05");
  assert.equal(S.originLine(expired), null, "a request of the teacher keeps no origin line");
  // day_off (a waiting request decided by the cancellation of a day off)
  const dayOff = { origin: "teacher", trigger: "day_off", status: "cancelled", teacher: { id: "t1", name: "Иванов И." }, reasonCode: "illness", decision: { kind: "cancel", by: { id: "o", name: "Юсупова Н." }, at: "2026-10-22T04:30:00" } };
  assert.equal(S.decisionResultText(dayOff), "Отменено выходным днём");
  assert.equal(S.decidedByLine(dayOff), "Отменено выходным днём, назначил(а) Юсупова Н., 22.10 09:30");
  // role_changed
  const role = { origin: "teacher", trigger: "role_changed", status: "closed", teacher: { id: "t1", name: "Иванов И." }, reasonCode: "illness", decision: { kind: "closed", closedReason: "ROLE_CHANGED", at: "2026-10-22T04:30:00" } };
  assert.equal(S.decisionResultText(role), "Закрыт: Сотрудник стал администратором");
  assert.equal(S.decidedByLine(role), "Закрыто системой, 22.10 09:30");
  // the old triggers keep their words
  assert.equal(S.originLine({ origin: "system", trigger: "manager_move", status: "rescheduled" }), "Перенёс администратор, без запроса");
  // a technical code never reaches the screen
  for (const item of [J({ trigger: "manager_cancel" }), restored, kind, oneOff, expired, dayOff, role]) for (const text of Object.values(lines(item))) assert.doesNotMatch(String(text ?? ""), /[a-z]+_[a-z_]+|[A-Z]{3,}_[A-Z_]+/);
});

test("R3 3 / 4: «Урока не было» belongs to whoever LEADS the lesson now (the substitute too), never to the replaced teacher or a non-teacher; managers do not come to the teacher's pages", () => {
  const base = { role: "teacher", state: "scheduled", date: "2026-10-20", today: "2026-10-22", startTime: "10:00", now: new Date("2026-10-22T06:00:00Z") };
  assert.equal(A.teacherCancelOffer({ ...base, otherLeads: true }), null, "the replaced main teacher: the substitute leads");
  assert.equal(A.teacherCancelOffer({ ...base, otherLeads: false })?.route, "missed", "the substitute (leads it) and the main teacher alike");
  assert.equal(A.teacherCancelOffer({ ...base, role: "admin" }), null);
  assert.equal(A.teacherCancelOffer({ ...base, role: "owner" }), null, "rule 38: managers cancel from the lesson sheet, with the kind");
  assert.equal(A.teacherCancelOffer({ ...base, role: null }), null);
  const lt = require(path.join(root, "src/lib/lesson-teacher.ts"));
  assert.equal(lt.lessonBelongsToOther({ teacherId: "sub" }, "main"), true);
  assert.equal(lt.lessonBelongsToOther({ teacherId: "sub" }, "sub"), false);
  // how managers reach /teacher/*: they do not (the workspace is the teacher's; AuthGuard sends them to their own home)
  const { WORKSPACE_ROLES, isRoleAllowed } = require(path.join(root, "src/lib/role-home.ts"));
  assert.deepEqual([...WORKSPACE_ROLES.teacher], ["teacher"]);
  assert.equal(isRoleAllowed(["teacher"], { org_role: "owner", role: "teacher" }), false);
  assert.equal(isRoleAllowed(["teacher"], { org_role: "admin", role: "teacher" }), false);
  assert.match(read("src/app/teacher/layout.tsx"), /allowedRoles=\{\["teacher"\]\}/);
  for (const file of ["src/app/teacher/schedule/page.tsx", "src/app/teacher/dashboard/page.tsx"]) assert.match(read(file), /role: user\?\.org_role \?\? user\?\.role \?\? null, otherLeads: ledByOther/, file);
});

test("R3 6: F9 is ONE compact row with a count that opens; «Замена снята» is its own line; the request list stays on the first screen of a phone", () => {
  const { AssignedLessons, ClearedLessons, assignedTitle } = require(path.join(root, "src/components/substitutions/teacher-requests-block.tsx"));
  const entries = [1, 2].map((n) => ({ groupId: `g${n}`, groupName: `9-${n}`, lessonId: `l${n}`, lessonDate: "2026-10-28", startTime: "10:00", endTime: "11:30", replacing: { id: "t", name: "Иванов Иван" } }));
  assert.equal(assignedTitle(1), "Вам назначена замена");
  assert.equal(assignedTitle(2), "Вам назначены замены: 2");
  const html = renderToStaticMarkup(React.createElement(AssignedLessons, { entries }));
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /<details[^>]* open/, "closed by default: one row");
  assert.match(textOf(html), /^Вам назначены замены: 2/);
  assert.match(html, /<summary/);
  assert.equal(renderToStaticMarkup(React.createElement(ClearedLessons, { entries: [] })), "");
  assert.match(read("src/components/substitutions/teacher-requests-block.tsx"), /<AssignedLessons entries=\{entries\} \/>\s+<ClearedLessons entries=\{cleared\} \/>/);
  assert.ok(S.expiringLine(2).length < 80, "one line on a phone, not a paragraph");
});

test("R3 8: a required field switches the button off and says why in a short line (restore, kind, cancel, the exams tick, the cancel panel)", () => {
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  assert.match(sheet, /disabled=\{busy \|\| Boolean\(reasonProblem\)/, "restore / kind / cancel / move: no reason - no button");
  assert.match(sheet, /data-testid="reason-hint"/);
  const dialogs = read("src/components/schedule/weekly-lesson-dialogs.tsx");
  assert.match(dialogs, /Boolean\(exams && !releaseExams\)/, "the exams tick switches «Изменить расписание» off");
  assert.match(dialogs, /data-testid="exams-confirm-hint"/);
  const { LessonCancelPanel } = require(path.join(root, "src/components/substitutions/lesson-cancel-panel.tsx"));
  const render = (reason, binding) => renderToStaticMarkup(React.createElement(LessonCancelPanel, { date: "2026-10-20", binding, reason, onReason() {}, busy: false, onConfirm() {}, onBack() {} }));
  const empty = render("", { loading: false, attached: false, canCancel: true });
  assert.match(empty, /data-testid="reason-hint"/);
  assert.match(empty, /<button[^>]*disabled=""[^>]*>Урока не было<\/button>/, "empty reason: the button is off");
  assert.doesNotMatch(render("Болел", { loading: false, attached: false, canCancel: true }), /<button[^>]*disabled=""[^>]*>Урока не было<\/button>/);
  assert.match(render("Болел", { loading: false, attached: false, canCancel: false, message: "Идёт экзамен" }), /<button[^>]*disabled=""[^>]*>Урока не было<\/button>/, "a blocking exam: off");
  assert.doesNotMatch(render("Болел", undefined), /<button[^>]*disabled=""[^>]*>Урока не было<\/button>/, "the list of missed lessons asks no exam: the button waits for nothing");
  const T2 = require(path.join(root, "src/lib/teacher-cancel.ts"));
  assert.equal(T2.cancelReasonProblem(""), "Укажите причину — не менее 3 символов");
  assert.equal(T2.cancelReasonProblem("ок"), "Укажите причину — не менее 3 символов");
  assert.equal(T2.cancelReasonProblem(" abc "), null);
  assert.match(T2.cancelReasonProblem("x".repeat(501)), /не более 500/);
});

test("R3 10 / 13 / 12: the panel keeps the variant in state; the menu item is one line; the consequences sit under a «?»", () => {
  for (const file of ["src/app/teacher/schedule/page.tsx", "src/app/teacher/dashboard/page.tsx"]) {
    const page = read(file);
    assert.match(page, /setCancelVariant\(offer\.variant\)/, file);
    assert.match(page, /oneOff=\{cancelVariant === "own_one_off"\}/, file);
  }
  const C = require(path.join(root, "src/components/substitutions/teacher-lesson-controls.tsx"));
  const act = { moveKind: "none", requestKind: "none", setMoveOpen() {}, setRequestOpen() {} };
  const [row] = C.teacherLessonMenuItems(act, () => {}, { offer: { route: "missed", variant: "not_held", label: "Урока не было" }, open() {} });
  assert.deepEqual([row.label, row.hint], ["Урока не было", undefined], "no 3-line hint in the menu");
  const { CancellationKindField } = require(path.join(root, "src/components/attendance/cancellation-kind-field.tsx"));
  const html = renderToStaticMarkup(React.createElement(CancellationKindField, { value: "centre", onChange() {}, canChooseKind: true, help: S.CANCEL_CONSEQUENCES }));
  assert.match(textOf(html), /Как учесть в оплате/);
  assert.doesNotMatch(html, /Причина отмены с точки зрения оплаты/);
  assert.doesNotMatch(textOf(html), /из пакета урок не списывается/, "the long explanation is closed until the «?» is pressed");
  assert.match(html, /aria-label="Подробнее"/);
});

test("R3 14 / 15: the dialogs of a day off close a second press with a ref; a created day off names the lessons it did NOT cancel, with the reasons", () => {
  assert.match(read("src/components/schedule/day-off-dialog.tsx"), /sending\.current = true/);
  const panel = read("src/components/schedule/days-off-panel.tsx");
  assert.match(panel, /sending\.current = true/, "void");
  assert.match(panel, /continuingRef\.current = true/, "«Продолжить»");
  assert.match(panel, /setNoticeLines\(result\.blocked\.map\(dayOffLessonLine\)\)/);
  const P = require(path.join(root, "src/lib/payf.ts"));
  assert.equal(P.dayOffLessonLine({ groupId: "g", groupName: "9-А", lessonId: "l", date: "2026-10-30", startTime: "10:00", endTime: "11:00", reason: "Урок уже начался" }), "9-А · 30.10 · 10:00–11:00 — Урок уже начался");
});

test("R3 16: a pack decision shows what the server said about each DECIDED item (a holiday instead of «по вине центра», a released substitute)", () => {
  const items = [{ id: "a", group: { name: "9-А" }, lesson: { date: "2026-10-28", startTime: "10:00" } }, { id: "b", group: { name: "8-Б" }, lesson: { date: "2026-10-29", startTime: "11:00" } }];
  const out = { updated: 2, skipped: [], results: [
    { id: "a", kind: "cancel", cancellationKind: "holiday", warnings: [{ code: "CANCELLED_AS_HOLIDAY", message: "Дата под выходным: отменено как праздник" }] },
    { id: "b", kind: "cancel", cancellationKind: "centre", warnings: [{ code: "SUBSTITUTE_RELEASED", message: "Замена снята: Рахимов Т." }] },
  ] };
  const toast = S.bulkToast(out, items);
  assert.equal(toast.type, "warning");
  assert.equal(toast.text, "Решено: 2. Не удалось: 0");
  assert.deepEqual(toast.details.map((line) => line.replace(/ср|чт|пн|вт|пт|сб|вс/, "")).length, 2);
  assert.match(toast.details[0], /^9-А, .*28\.10 10:00: Дата под выходным: отменено как праздник$/);
  assert.match(toast.details[1], /^8-Б, .*29\.10 11:00: Замена снята: Рахимов Т\.$/);
  assert.equal(S.bulkToast({ updated: 1, skipped: [], results: [{ id: "a", kind: "cancel", warnings: [] }] }, items).type, "success");
  assert.equal(S.bulkToast({ updated: 1, skipped: [] }, items).type, "success", "an older server: as before");
});

test("R3 17: the move dialog runs lesson-move-check, and REQUEST_REJECTED switches «Перенести» off with the reason", () => {
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  assert.match(sheet, /substitutionsApi\.lessonMoveCheck\(groupId, \{ lessonId: lesson\.id, lessonDate: lesson\.date, newDate, startTime: from, endTime: to \}\)/);
  const lines = A.lessonMoveCheckLines({ ok: false, code: "REQUEST_REJECTED", message: "Администратор отклонил заявку по этому уроку", teacherConflicts: [], groupConflicts: [], warnings: [] });
  assert.equal(lines.ok, false);
  assert.deepEqual(lines.lines, ["Администратор отклонил заявку по этому уроку"]);
  assert.equal(A.moveConfirmDisabled({ checking: false, failed: false, check: { ok: false } }), true, "the button is off on an answer that is not ok");
  assert.match(sheet, /disabled=\{busy \|\| Boolean\(reasonProblem\) \|\| \(\(mode === "cancel" \|\| mode === "reschedule"\) && examState\.blocked\) \|\| \(mode === "reschedule" && confirmDisabled\)\}/);
});

test("R3 18 / 20: the rate hint reads the org role only; every code has words of its own", () => {
  assert.doesNotMatch(read("src/components/groups/lesson-teacher-dialog.tsx"), /org_role \?\? user\?\.role/);
  assert.equal(T.rateMissingText("teacher"), T.rateMissingText("admin"), "anything but the owner is told to ask the owner");
  assert.match(T.rateMissingText(null), /владелец/);
  const text = (code, message) => S.substitutionErrorText(coded(code, message));
  assert.match(text("DAY_OFF_EXISTS"), /уже назначен выходной/);
  assert.equal(text("DAY_OFF_EXISTS", "На эти даты уже назначен выходной «Хайит»"), "На эти даты уже назначен выходной «Хайит»", "the server's own sentence names the day off");
  assert.equal(text("NO_CHANGES"), "Укажите хотя бы одно изменение постоянного расписания");
  assert.match(text("DECISION_FAILED"), /Не удалось выполнить это решение/);
  assert.match(text("GROUP_NOT_FOUND"), /Группа не найдена/);
  assert.match(text("EXAMS_NEED_CONFIRMATION"), /подтвердите, что они вернутся в черновики/);
  assert.equal(W.refusalText(coded("EXAMS_NEED_CONFIRMATION"), "x"), text("EXAMS_NEED_CONFIRMATION"));
  assert.equal(S.bulkSkippedLine({ id: "a", code: "DECISION_FAILED", message: "server text" }), "server text", "a pack line keeps the server's sentence");
});

test("R3 19: ONE panel and ONE reason check for the dashboard's missed-lesson dialog, the lesson panel and the manager's modal", () => {
  const dash = read("src/app/teacher/dashboard/page.tsx");
  assert.equal((dash.match(/<LessonCancelPanel/g) || []).length, 2, "the lesson panel and the missed-lesson dialog");
  assert.doesNotMatch(dash, /Причина отмены<\/p>/, "the built-in copy is gone");
  assert.match(dash, /cancelReasonProblem\(reason\)/);
  const modal = read("src/components/attendance/cancel-missed-lesson-modal.tsx");
  assert.match(modal, /cancelReasonProblem\(text\)/);
  assert.match(modal, /Boolean\(cancelReasonProblem\(reason\)\)/);
  assert.match(read("src/app/teacher/schedule/page.tsx"), /cancelReasonProblem\(reason\)/);
});

test("R3 11 / F10: the dashboard summary carries createdBy, the request mark and replacedBy - the panel and the rules use them (a fixture of the real shape)", () => {
  const summary = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/w1/dashboard_summary.json"), "utf8"));
  const [own, rejected, replaced, copy] = summary.todayLessons;
  const now = Date.UTC(2026, 9, 28, 4, 0);
  const lt = require(path.join(root, "src/lib/lesson-teacher.ts"));
  // S27: only the one-off he added himself, not the copy of a move
  assert.equal(A.isOwnOneOff(own, "t-main"), true);
  assert.equal(A.isOwnOneOff(copy, "t-main"), false);
  assert.equal(A.isOwnOneOff(rejected, "t-main"), false);
  const offer = (lesson, ledByOther = false) => A.teacherCancelOffer({ role: "teacher", otherLeads: ledByOther, state: "scheduled", date: lesson.occurrenceDate, today: "2026-10-27", startTime: lesson.startTime, ownOneOff: A.isOwnOneOff(lesson, "t-main") });
  assert.equal(offer(own)?.variant, "own_one_off");
  assert.equal(offer(copy), null);
  assert.equal(offer(rejected), null);
  // F2: the request mark of the summary switches «Перенести» off
  const mark = (lesson) => S.teacherMoveControl({ role: "teacher", userId: "t-main", lessonTeacherId: lesson.teacherId, isSubstitution: lesson.isSubstitution, lessonStatus: "scheduled", startsAtMs: now + 10 * 3600_000, nowMs: now, mark: lesson.substitutionRequest }).kind;
  assert.equal(mark(rejected), "rejected");
  assert.equal(mark(own), "button");
  // F10: the lesson of the main teacher that a substitute leads: stays, says «Замена: имя», is not his to start / move / cancel
  const info = lt.teacherInfoOfOccurrence(replaced);
  assert.deepEqual([info.teacherId, info.isSubstitution, info.defaultTeacherId], ["t-sub", true, "t-main"]);
  assert.equal(lt.lessonBelongsToOther(info, "t-main"), true);
  assert.deepEqual(S.occurrenceChips(replaced, "t-main").map((c) => c.text), ["Замена: Рахимов Т."]);
  assert.equal(A.teacherCancelOffer({ role: "teacher", otherLeads: lt.lessonBelongsToOther(info, "t-main"), state: "scheduled", date: "2026-10-20", today: "2026-10-27", startTime: "10:00" }), null);
  assert.equal(S.teacherMoveControl({ role: "teacher", userId: "t-main", lessonTeacherId: replaced.teacherId, isSubstitution: true, lessonStatus: "scheduled", startsAtMs: now + 10 * 3600_000, nowMs: now }).kind, "none");
  assert.equal(lt.teacherInfoOfOccurrence({}), null, "an older server: nothing to say");
  for (const file of ["src/app/teacher/schedule/page.tsx", "src/app/teacher/dashboard/page.tsx"]) {
    const page = read(file);
    assert.match(page, /setActiveTeacherInfo\(teacherInfoOfOccurrence\(activeLesson\)\)/, file);
    assert.match(page, /setActiveRequestMark\(activeLesson\.substitutionRequest \?\? null\)/, file);
    assert.match(page, /data-testid="led-by-other"/, file);
    assert.match(page, /Boolean\(activeLesson\?\.replacedBy\) \|\| lessonBelongsToOther\(activeTeacherInfo, user\?\.id\)/, file);
  }
  assert.match(read("src/app/teacher/dashboard/page.tsx"), /if \(lesson\.replacedBy\) return \[\];/, "no «Начните урок» for a lesson a substitute leads");
});

test("lead notes: the state of the lesson is a badge, «каб. 12» does not break; the kind of the decision is brought into view on a phone", () => {
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  assert.match(sheet, /data-testid="sheet-badge"/);
  const overview = read("src/components/groups/group-schedule-overview.tsx");
  assert.match(overview, /room\.replace\(\/ \/g, "\\u00a0"\)/, "a non-breaking space inside the room");
  assert.doesNotMatch(overview, /presentation\.label, \.\.\.\(room/, "the state is not a word inside the line");
  assert.match(overview, /badge=\{presentation \? \{ label: presentation\.label, className: presentation\.badgeClassName \} : null\}/);
  const dialog = read("src/components/substitutions/decision-dialog.tsx");
  assert.match(dialog, /scrollIntoView\(\{ block: "nearest" \}\)/);
  assert.match(read("src/components/attendance/cancellation-kind-field.tsx"), /Как учесть в оплате/);
});

test("R3 ops: the group coming back from the archive shows the notes of the server (a day off that did not apply); the reason of a coded refusal reaches the person", () => {
  const dlg = read("src/components/groups/group-archive-dialog.tsx");
  assert.match(dlg, /onRestored\("Группа возвращена из архива", warningTexts\(restored\)\)/);
  assert.match(dlg, /sending\.current = true/);
  assert.match(read("src/components/groups/group-detail-view.tsx"), /showToast\(message, notes\?\.length \? "warning" : "success", notes\)/);
});

test("R3 6 (phone): the filters are ONE row (search, «Срочные» chip, icon filter) and «Выбрать все» sits beside the tabs; the desktop table keeps its own rows", () => {
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /flex flex-nowrap items-center gap-2 sm:flex-wrap/, "one row on a phone");
  assert.match(page, /<CascadingFilter iconOnPhone /);
  assert.match(page, /<span className="sm:hidden">Срочные<\/span><span className="hidden sm:inline">Только срочные<\/span>/);
  assert.match(page, /data-testid="select-all-compact"[^>]*xl:hidden|xl:hidden[^>]*data-testid="select-all-compact"/, "beside the tabs below the wide table");
  assert.match(page, /className="hidden cursor-pointer items-center gap-2 px-1 text-xs font-medium text-slate-500 xl:flex/, "the wide table keeps its own «Выбрать все» row");
  const { CascadingFilter } = require(path.join(root, "src/components/ui/cascading-filter.tsx"));
  const props = { teachers: [], groups: [], value: { teacherId: "", groupId: "" }, onChange() {}, allLabel: "Все группы и преподаватели" };
  const phone = renderToStaticMarkup(React.createElement(CascadingFilter, { ...props, iconOnPhone: true }));
  assert.match(phone, /aria-label="Все группы и преподаватели"/, "an icon button still has its name");
  assert.match(phone, /class="min-w-0 truncate hidden sm:inline"/, "the label is for tablets and up");
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(CascadingFilter, props)), /hidden sm:inline/, "every other page keeps the full pill");
});

test("phone: the search placeholder is just «Поиск», the accessible name stays the full one", () => {
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /placeholder=\{phone \? "Поиск" : "Группа или преподаватель"\}/);
  assert.match(page, /aria-label="Группа или преподаватель"/);
  assert.match(page, /useMediaQuery\(PHONE_QUERY\)/);
  assert.match(read("src/lib/use-media-query.ts"), /\(max-width: 639px\)/, "below Tailwind's `sm`, like the other phone rules of the page");
});

test("stage 17: «Урока не было» only after the lesson END (business time) - the server's rule; during the lesson nothing new, O6 stays", () => {
  const today = "2026-10-22";
  // the lesson 10:00-10:45 Tashkent = 05:00-05:45 UTC; instants are injected, the real clock is never read
  const at = (hhmm) => new Date(`2026-10-22T${hhmm}:00+05:00`);
  const offer = (now, patch = {}) => A.teacherCancelOffer({ role: "teacher", state: "scheduled", date: today, today, startTime: "10:00", endTime: "10:45", now, ...patch });
  assert.equal(offer(at("09:59")), null, "before the start: nothing");
  assert.equal(offer(at("10:01")), null, "start + 1 min: the lesson is held, the teacher starts it as usual");
  assert.equal(offer(at("10:44")), null, "end - 1 min: still held");
  assert.equal(offer(at("10:45")), null, "the minute of the end is not over yet (the server: current minute <= end minute is refused)");
  assert.equal(offer(at("10:46"))?.route, "missed", "end + 1 min: «Урока не было»");
  assert.equal(offer(at("10:46"))?.label, "Урока не было");
  assert.equal(offer(at("10:01"), { endTime: null }), null, "no readable end today: nothing (the server decides)");
  assert.equal(offer(at("10:46"), { endTime: null }), null);
  assert.equal(offer(at("10:01"), { date: "2026-10-21" })?.route, "missed", "a past day is over whatever the clock says");
  assert.equal(offer(at("10:01"), { date: "2026-10-23" }), null, "a later day never");
  // O6 stays: a lesson started in the journal with an empty roster can still be cancelled during its time
  assert.equal(offer(at("10:20"), { state: "in_progress", rosterEmpty: true })?.route, "attendance");
  assert.equal(offer(at("10:20"), { state: "in_progress", rosterEmpty: false }), null);
  // one helper for «ended» (rule 38), next to «started»
  assert.equal(A.lessonHasEnded({ date: today, today, endTime: "10:45", now: at("10:45") }), false);
  assert.equal(A.lessonHasEnded({ date: today, today, endTime: "10:45", now: at("10:46") }), true);
  assert.equal(A.lessonHasEnded({ date: "2026-10-21", today, endTime: "10:45", now: at("00:00") }), true);
  assert.equal(A.lessonHasEnded({ date: "2026-10-23", today, endTime: "10:45", now: at("23:59") }), false);
  assert.equal(A.lessonHasStarted({ date: today, today, startTime: "10:00", now: at("10:01") }), true, "«started» is a different question and keeps its own answer");
  for (const file of ["src/app/teacher/schedule/page.tsx", "src/app/teacher/dashboard/page.tsx"]) assert.match(read(file), /endTime: activeLesson\.endTime, rosterEmpty/, file);
});

test("journal: PersonRef.role (owner / admin / teacher) from the server names the owner «владелец»; no role = «администратор» (a fixture of the server's shape)", () => {
  const items = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/w1/journal_items.json"), "utf8"));
  assert.equal(S.decidedByLine(items.ownerCancelled), "Отменил владелец Юсупова Н., 27.10 17:00");
  assert.equal(S.decidedByLine(items.adminRestored), "Вернул урок администратор Каримова Н., 27.10 17:05");
  assert.equal(S.decidedByLine(items.noRole), "Отменил администратор Старова С., 27.10 17:00", "an older answer without a role: the neutral word");
  assert.match(read("src/lib/substitution-types.ts"), /role\?: string \| null;\n\}/, "PersonRef carries the role");
});

test("lead note 375: the teacher's «Изменить постоянное расписание» button is never cut with an ellipsis: a short label on a phone, the full one from `sm`", () => {
  const page = read("src/app/teacher/schedule/page.tsx");
  assert.match(page, /<span className="sm:hidden">Изменить расписание<\/span><span className="hidden sm:inline">Изменить постоянное расписание<\/span>/);
  assert.doesNotMatch(page, /<span className="truncate">Изменить постоянное расписание<\/span>/, "no truncate on an action");
});
