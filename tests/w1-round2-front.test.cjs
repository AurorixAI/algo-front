// W1 round 2 (28.10), front: «Отменить выходной» (the one line of a lesson, the list of five, the sum, the substitutes that do not return, the note about exams),
// «Вам назначена замена» in one row, the card of a group (no «— Не назначен», a lead who is not a teacher), and «уроки ведёт только преподаватель» (#156).
// Spec: artifacts/analysis/W1_FIX2_SPEC.md, parts 1-3; LESSONS 46 (every new code / trigger has its words and a test), 48 (one line of a lesson in every list).
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
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const F = require(path.join(root, "src/lib/payf.ts"));
const S = require(path.join(root, "src/lib/substitutions.ts"));
const SL = require(path.join(root, "src/lib/staff-lifecycle.ts"));
const GF = require(path.join(root, "src/lib/group-form.ts"));
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const lesson = (n, over = {}) => ({ groupId: `g${n}`, groupName: `Группа ${n}`, lessonId: `l${n}`, date: "2026-10-28", startTime: "10:00", endTime: "10:45", reason: null, ...over });

// ── S2-2: PAYROLL_LOCKED is gone ─────────────────────────────────────────────────────────────────────────────────

test("S2-2: nothing in the front speaks of an «утверждённая ведомость»: the code is gone from the words and from the frozen contract", () => {
  for (const file of ["src/lib/substitutions.ts", "src/lib/ops-errors.ts"]) assert.doesNotMatch(read(file), /PAYROLL_LOCKED|уже утверждена/, file);
  assert.doesNotMatch(read("tests/fixtures/logB/_contract.json"), /PAYROLL_LOCKED/);
  assert.equal(fs.existsSync(path.join(root, "tests/fixtures/logB/x_payroll_locked.json")), false);
  // a bulk refusal of that old code (a server that still sent it) shows the server's own text, not an invented one
  assert.equal(S.bulkSkippedLine({ id: "i", code: "PAYROLL_LOCKED", message: "текст сервера" }), "текст сервера");
});

test("S2-1: the administrator's payrollSheetsAffected is only {month}: the toast note still reads (no status, no sheet id, no teacher)", () => {
  assert.deepEqual(S.assignmentNotes({ payrollSheetsAffected: [{ month: "2026-10" }] }), ["Ведомость за октябрь изменится"]);
  assert.deepEqual(S.assignmentNotes({ payrollSheetsAffected: [{ month: "2026-10", status: "settled", sheet_id: "s", teacher_id: "t" }] }), ["Ведомость за октябрь изменится"], "the owner's shape reads the same");
});

// ── part 2: «Отменить выходной» ──────────────────────────────────────────────────────────────────────────────────

test("#155 (2): ONE line of a lesson «28.10 · 10:00–10:45 · Группа» in every list of both windows; the lists go by date and time", () => {
  assert.equal(F.dayOffLessonLine(lesson(1)), "28.10 · 10:00–10:45 · Группа 1");
  assert.equal(F.dayOffLessonLine(lesson(1, { startTime: null, endTime: null })), "28.10 · Группа 1", "a server that sent no time (an older one): the line is still whole");
  assert.equal(F.dayOffLessonLine(lesson(1, { reason: "идёт экзамен" })), "28.10 · 10:00–10:45 · Группа 1 — идёт экзамен");
  const sorted = F.sortDayOffLessons([lesson(1, { date: "2026-10-29", startTime: "09:00" }), lesson(2, { startTime: "14:00" }), lesson(3, { startTime: "10:00", groupName: "Б" }), lesson(4, { startTime: "10:00", groupName: "А" })]);
  assert.deepEqual(sorted.map((item) => item.groupName), ["А", "Б", "Группа 2", "Группа 1"]);
});

test("#155 (2): a list of more than five shows five and «Показать все N» / «Свернуть»; five and fewer have no button; nothing scrolls inside the window", () => {
  const { DayOffLessonList } = require(path.join(root, "src/components/schedule/day-off-dialog.tsx"));
  const many = Array.from({ length: 22 }, (_, n) => lesson(n, { startTime: `${String(8 + (n % 10)).padStart(2, "0")}:00` }));
  const html = renderToStaticMarkup(React.createElement(DayOffLessonList, { title: "Вернутся в расписание", lessons: many, tone: "ok", testId: "restored" }));
  assert.equal((html.match(/<li/g) || []).length, 5);
  assert.match(text(html), /Показать все 22/);
  assert.doesNotMatch(html, /overflow-y-auto|max-h-|tabindex/);
  const five = renderToStaticMarkup(React.createElement(DayOffLessonList, { title: "x", lessons: many.slice(0, 5), tone: "ok", testId: "five" }));
  assert.equal((five.match(/<li/g) || []).length, 5);
  assert.doesNotMatch(five, /<button/);
  assert.equal(renderToStaticMarkup(React.createElement(DayOffLessonList, { title: "x", lessons: [], tone: "ok", testId: "none" })), "");
  const source = read("src/components/schedule/day-off-dialog.tsx");
  assert.match(source, /all \? "Свернуть" : `Показать все \$\{sorted\.length\}`/);
  assert.equal(F.DAY_OFF_LIST_PREVIEW, 5);
});

test("#155 (3): the sum says «Вернём в расписание 22 урока.» with the right form of the word, and the kept ones by their reason", () => {
  const kept = (reason) => ({ ...lesson(9), reason });
  assert.equal(F.voidSummary({ restored: Array(22).fill(lesson(1)), kept: [] }), "Вернём в расписание 22 урока.");
  assert.equal(F.voidSummary({ restored: [lesson(1)], kept: [] }), "Вернём в расписание 1 урок.");
  assert.equal(F.voidSummary({ restored: Array(5).fill(lesson(1)), kept: [] }), "Вернём в расписание 5 уроков.");
  assert.equal(F.voidSummary({ restored: Array(21).fill(lesson(1)), kept: [] }), "Вернём в расписание 21 урок.");
  assert.equal(F.voidSummary({ restored: Array(11).fill(lesson(1)), kept: [] }), "Вернём в расписание 11 уроков.");
  assert.equal(F.voidSummary({ restored: [], kept: [] }), "В расписание не вернётся ни один урок.");
  assert.equal(F.voidSummary({ restored: Array(22).fill(lesson(1)), kept: [kept("Урок сегодня уже начался: остаётся отменённым")] }), "Вернём в расписание 22 урока. 1 урок уже начался — останется отменённым.");
  assert.equal(F.voidSummary({ restored: [lesson(1)], kept: [kept("Урок изменён после выходного"), kept("Урок уже изменён после выходного")] }), "Вернём в расписание 1 урок. 2 урока изменены после выходного — останутся отменёнными.");
  assert.equal(F.voidSummary({ restored: [], kept: [kept("Урок уже в прошлом"), kept("Группа закрыта")] }), "В расписание не вернётся ни один урок. 1 урок уже прошёл — останется отменённым. 1 урок в закрытой группе — останется отменённым.");
  assert.equal(F.voidSummary({ restored: [], kept: [kept("что-то своё")] }).endsWith("1 урок — останется отменённым."), true, "an unknown reason is not invented");
});

test("#155 (2): the reason in «Останутся отменёнными» is short and only when it differs from the title", () => {
  assert.equal(F.keptReasonShort("Урок сегодня уже начался: остаётся отменённым"), "уже начался");
  assert.equal(F.keptReasonShort("Урок изменён после выходного"), "изменён после выходного");
  assert.equal(F.keptReasonShort("Дата входит в другой выходной"), "входит в другой выходной");
  assert.equal(F.keptReasonShort("Ручная отмена: вид «по вине центра» возвращён"), "отменён вручную");
  assert.equal(F.keptReasonShort("Остаётся отменённым"), null, "it repeats the title");
  assert.equal(F.keptReasonShort(null), null);
  assert.equal(F.keptReasonShort("Нужно проверить"), "Нужно проверить");
  const { VoidPlanBody } = require(path.join(root, "src/components/schedule/days-off-panel.tsx"));
  const html = text(renderToStaticMarkup(React.createElement(VoidPlanBody, { plan: { restored: [lesson(1)], kept: [{ ...lesson(2), reason: "Урок сегодня уже начался: остаётся отменённым" }], warnings: [] } })));
  assert.match(html, /Останутся отменёнными 28\.10 · 10:00–10:45 · Группа 2 — уже начался/);
});

test("#155 (4): the substitutes that do not return: the block's title says it once, the line is built from the fields (not the server's message)", () => {
  assert.equal(F.NOT_RESTORED_TITLE, "Замена не вернётся — назначьте заново");
  const restored = [lesson(1, { date: "2026-10-28", startTime: "10:00" })];
  const warning = { code: "SUBSTITUTE_NOT_RESTORED", message: "28.10 — «Группа 1»: замена (Иванов И.) была снята выходным и не вернулась — назначьте её заново", groupId: "g1", lessonId: "l1", date: "2026-10-28", startTime: "10:00", substituteName: "Иванов И." };
  assert.equal(F.dayOffNotRestoredLine(warning, restored), "28.10 · 10:00–10:45 · Группа 1 — была замена: Иванов И.", "the end of the lesson comes from the lesson that came back");
  assert.equal(F.dayOffNotRestoredLine({ ...warning, groupName: "Группа 1", endTime: "10:45" }, []), "28.10 · 10:00–10:45 · Группа 1 — была замена: Иванов И.", "the server sends the end itself");
  // rule 48: the line of the substitute and the line of the lists agree on the time
  assert.ok(F.dayOffNotRestoredLine(warning, restored).startsWith(F.dayOffLessonLine(restored[0])));
  // the group and the time come from the lesson that came back when the warning has no start time
  assert.equal(F.dayOffNotRestoredLine({ ...warning, startTime: undefined }, restored), "28.10 · 10:00–10:45 · Группа 1 — была замена: Иванов И.");
  assert.equal(F.dayOffNotRestoredLine({ ...warning, substituteName: null }, restored), "28.10 · 10:00–10:45 · Группа 1 — была замена");
  assert.equal(F.dayOffNotRestoredLine({ code: "x", message: "m", date: "2026-10-28", substituteName: "Ким А." }, []), "28.10 — была замена: Ким А.");
  const { VoidPlanBody } = require(path.join(root, "src/components/schedule/days-off-panel.tsx"));
  const html = renderToStaticMarkup(React.createElement(VoidPlanBody, { plan: { restored, kept: [], warnings: [warning] } }));
  assert.match(text(html), /Замена не вернётся — назначьте заново 28\.10 · 10:00–10:45 · Группа 1 — была замена: Иванов И\./);
  assert.doesNotMatch(html, /была снята выходным/, "the server's message is for the journal and the API");
  assert.doesNotMatch(html, /Вернутся без замены/);
});

test("#155 (5): the note about exams is conditional («Если … снимались …») and only when some lessons come back", () => {
  const { VoidPlanBody } = require(path.join(root, "src/components/schedule/days-off-panel.tsx"));
  assert.equal(F.VOID_EXAMS_NOTE, "Если с этих уроков снимались экзамены — назначьте их заново");
  const some = renderToStaticMarkup(React.createElement(VoidPlanBody, { plan: { restored: [lesson(1)], kept: [], warnings: [] } }));
  assert.match(some, /data-testid="day-off-void-exams-note"/);
  assert.match(text(some), /Если с этих уроков снимались экзамены — назначьте их заново/);
  const none = renderToStaticMarkup(React.createElement(VoidPlanBody, { plan: { restored: [], kept: [lesson(1)], warnings: [] } }));
  assert.doesNotMatch(none, /exams-note|экзамен/);
  // the server's own flat sentence («… не вернутся») is no longer printed in this window
  assert.doesNotMatch(read("src/components/schedule/days-off-panel.tsx"), /plan\?\.examsNote|\bEXAMS_NOTE\b/);
});

test("#155: the notice after the cancellation of a day off names the lessons with the same lines and the same title", () => {
  const source = read("src/components/schedule/days-off-panel.tsx");
  assert.match(source, /setNoticeLines\(notRestoredLines\(result\)\.map\(\(line\) => line\.text\)\)/);
  assert.match(source, /setNoticeLabel\(`\$\{NOT_RESTORED_TITLE\}:`\)/);
  assert.match(source, /lessonsCount\(result\.restored\.length\)/);
  assert.equal(F.lessonsCount(22), "22 урока");
});

// ── part 2: «Вам назначена замена» in one row ────────────────────────────────────────────────────────────────────

test("#155 (6): one substitution is ONE row «Вам назначена замена: вс, 15.11 · 10:00 · Группа» (nothing to open); two and more open as before", () => {
  const { AssignedLessons } = require(path.join(root, "src/components/substitutions/teacher-requests-block.tsx"));
  const entry = (n, date = "2026-11-15") => ({ groupId: `g${n}`, groupName: `9-${n}`, lessonId: `l${n}`, lessonDate: date, startTime: "10:00", endTime: "11:30", replacing: { id: "t", name: "Иванов Иван" } });
  assert.equal(S.assignedSingleLine(entry(1)), "Вам назначена замена: вс, 15.11 · 10:00 · 9-1");
  const one = renderToStaticMarkup(React.createElement(AssignedLessons, { entries: [entry(1)] }));
  assert.equal(text(one), "Вам назначена замена: вс, 15.11 · 10:00 · 9-1");
  assert.doesNotMatch(one, /<details|<summary/);
  const two = renderToStaticMarkup(React.createElement(AssignedLessons, { entries: [entry(1), entry(2)] }));
  assert.match(two, /<details/);
  assert.match(text(two), /^Вам назначены замены: 2/);
});

// ── part 2: the card of a group ──────────────────────────────────────────────────────────────────────────────────

const member = (id, role, first, last, active = true) => ({ id, member_id: `m-${id}`, user_id: id, email: `${id}@x`, first_name: first, last_name: last, org_role: role, is_active: active });
const STAFF = [member("t1", "teacher", "Иван", "Иванов"), member("t2", "teacher", "Пётр", "Петров"), member("a1", "admin", "Дилноза", "Каримова"), member("o1", "owner", "Усман", "Усманов")];

test("#155 (7): the form of the group sends the lead only when it was changed to a teacher; «класс» cleared is an explicit null; there is no «— Не назначен»", () => {
  const state = { name: " 9-А ", class_level: "", teacher_id: "t1", description: "", max_students: "30", lesson_type: "group" };
  assert.deepEqual(GF.groupUpdateBody(state, "t1", false), { name: "9-А", class_level: null, description: undefined, max_students: 30 });
  assert.equal("class_level" in GF.groupUpdateBody(state, "t1", false), true);
  assert.equal(GF.groupUpdateBody(state, "t1", false).class_level, null, "the cleared class goes as null (the server clears the field)");
  assert.equal(GF.groupUpdateBody({ ...state, class_level: "9" }, "t1", false).class_level, 9);
  assert.equal(GF.groupUpdateBody({ ...state, teacher_id: "t2" }, "t1", false).teacher_id, "t2");
  assert.equal("teacher_id" in GF.groupUpdateBody({ ...state, teacher_id: "" }, "t1", false), false, "never a null lead (422 TEACHER_REQUIRED)");
  assert.equal("teacher_id" in GF.groupUpdateBody(state, "t1", false), false, "an unchanged lead is not sent");
  assert.equal(GF.groupUpdateBody(state, "t1", true).lesson_type, "group");
  const view = read("src/components/groups/group-detail-view.tsx");
  assert.doesNotMatch(view, /— Не назначен/);
  assert.match(view, /groupUpdateBody\(editState, group\.teacher_id, withType\)/);
  assert.match(view, /opsErrorCode\(e\) === "TEACHER_REQUIRED"/);
});

test("#156 (6): the field of the group lists teachers; a current lead who is not a teacher is shown as «Владелец, не ведёт уроки» and cannot be chosen", () => {
  const options = SL.groupTeacherOptions(STAFF, "o1");
  assert.deepEqual(options.map((option) => option.value), ["o1", "t1", "t2"]);
  assert.equal(options[0].disabled, true);
  assert.equal(options[0].label, "Усман Усманов — Владелец, не ведёт уроки");
  assert.equal(SL.groupTeacherOptions(STAFF, "a1")[0].label, "Дилноза Каримова — Администратор, не ведёт уроки");
  assert.deepEqual(SL.groupTeacherOptions(STAFF, "t2").map((option) => option.value), ["t1", "t2"]);
  assert.deepEqual(SL.groupTeacherOptions(STAFF, null).map((option) => option.value), ["t1", "t2"]);
  assert.deepEqual(SL.groupTeacherOptions([], "ghost"), [], "an unknown lead adds nothing");
  // the select can show a disabled item and ignores a click on it
  assert.match(read("src/components/ui/select.tsx"), /options\.find\(\(o\) => o\.value === val\)\?\.disabled\) return/);
  assert.match(read("src/components/ui/select.tsx"), /aria-disabled=\{option\.disabled \|\| undefined\}/);
});

test("#156 (5): a group without a teacher says what it costs; the create form allows it with a hint; the restore window and the dismissal window say it too", () => {
  assert.equal(SL.GROUP_WITHOUT_TEACHER_WARNING, "Без преподавателя уроки не попадут в ведомость, а экзамен провести некому");
  const view = read("src/components/groups/group-detail-view.tsx");
  assert.match(view, /data-testid="group-no-teacher-warning"/);
  assert.match(view, /\{GROUP_WITHOUT_TEACHER_WARNING\}/);
  assert.match(view, /leadIsTeacher \? `Преподаватель: /, "a lead who is not a teacher is not named «Преподаватель: …»");
  const create = read("src/components/groups/group-create-modal.tsx");
  assert.match(create, /label: "Без преподавателя" \}/);
  assert.match(create, /\{GROUP_TEACHER_LATER_HINT\}/);
  assert.match(create, /<GroupTeacherField teachers=\{teachers\}/);
  assert.doesNotMatch(create, /Не назначен/);
  assert.match(read("src/components/groups/group-archive-dialog.tsx"), /teacherId === "__none__" && <p data-testid="restore-no-teacher-warning"[^>]*>\{GROUP_WITHOUT_TEACHER_WARNING\}/);
  const { RemovalDialogBody } = require(path.join(root, "src/components/staff/remove-member-dialog.tsx"));
  const impact = { groups: [{ id: "g1", name: "9-А" }], inProgressLessons: [] };
  const html = renderToStaticMarkup(React.createElement(RemovalDialogBody, {
    name: "Иванов", impact, loadError: null, isRole: false, targets: [{ id: "t2", name: "Петров" }], choices: { g1: { value: SL.UNASSIGNED, confirmed: false } }, everyone: "", conflicts: {}, busy: false, error: null,
    onRetry() {}, onChoice() {}, onEveryone() {},
  }));
  assert.match(text(html), /Без преподавателя уроки не попадут в ведомость, а экзамен провести некому/);
  const other = renderToStaticMarkup(React.createElement(RemovalDialogBody, {
    name: "Иванов", impact, loadError: null, isRole: false, targets: [{ id: "t2", name: "Петров" }], choices: { g1: { value: "t2", confirmed: false } }, everyone: "", conflicts: {}, busy: false, error: null,
    onRetry() {}, onChoice() {}, onEveryone() {},
  }));
  assert.doesNotMatch(other, /unassigned-warning/, "shown only for «Оставить без преподавателя»");
});

test("#156 (5): the words of the refusals: no teacher at a move, a restore with a lead who is not a teacher, a rate to a non-teacher", () => {
  const A = require(path.join(root, "src/lib/schedule-card-actions.ts"));
  assert.equal(A.lessonMoveErrorText({ code: "LESSON_HAS_NO_TEACHER", message: "x", detail: { code: "LESSON_HAS_NO_TEACHER" } }), "У группы нет преподавателя — назначьте его в карточке группы");
  const archive = require(path.join(root, "src/lib/group-archive.ts"));
  assert.doesNotMatch(archive.RESTORE_TEACHER_INACTIVE_TEXT, /не работает в центре/);
  assert.equal(archive.RESTORE_TEACHER_INACTIVE_TEXT, "Прежний преподаватель группы больше не ведёт уроки. Выберите нового или оставьте группу без преподавателя.");
  const P = require(path.join(root, "src/lib/payroll.ts"));
  assert.equal(P.payrollErrorText({ status: 422, code: "RATE_RECEIVER_NOT_TEACHER", message: "x" }), "Ставку задают только преподавателю. Этот сотрудник не ведёт уроки");
});

// ── part 3: only a teacher leads ─────────────────────────────────────────────────────────────────────────────────

test("#156 (6): who may lead is ONE function; the handover, the page «Замены» and the request dialog take only teachers", () => {
  assert.equal(SL.canLead("teacher"), true);
  for (const role of ["admin", "owner", undefined, null, ""]) assert.equal(SL.canLead(role), false);
  assert.deepEqual(SL.handoverTargets(STAFF).map((target) => target.id), ["t1", "t2"]);
  assert.deepEqual(SL.handoverTargets(STAFF, "t1").map((target) => target.id), ["t2"]);
  assert.match(read("src/components/substitutions/substitutions-page.tsx"), /canLead\(member\.org_role\)/);
  assert.match(read("src/components/substitutions/request-dialog.tsx"), /member\.id !== viewerId && canLead\(member\.role\)/);
  assert.doesNotMatch(read("src/components/substitutions/substitutions-page.tsx"), /\["teacher", "admin", "owner"\]/);
});

test("#156 (6): the dead code of a manager as a substitute is gone (ManagerAssignedBlock, roleChip, roleLabel and their lines in the dialogs)", () => {
  for (const file of ["src/components/substitutions/teacher-requests-block.tsx", "src/components/substitutions/substitutions-page.tsx"]) assert.doesNotMatch(read(file), /ManagerAssignedBlock/, file);
  assert.equal(S.roleChip, undefined);
  assert.equal(require(path.join(root, "src/lib/lesson-teacher.ts")).roleLabel, undefined);
  for (const file of ["src/components/groups/lesson-teacher-dialog.tsx", "src/components/substitutions/decision-dialog.tsx"]) assert.doesNotMatch(read(file), /roleLabel|roleChip|candidate-role/, file);
});

test("#156 (3): the window «Изменить роль» of a teacher warns before (substitutes taken off, missed lessons) and never blocks; the journal knows the new trigger", () => {
  assert.equal(SL.ROLE_TO_ADMIN_NOTE, "Администратор не ведёт уроки: его группы нужно передать другим преподавателям.");
  const { ImpactNotes } = require(path.join(root, "src/components/staff/remove-member-dialog.tsx"));
  const html = text(renderToStaticMarkup(React.createElement(ImpactNotes, { impact: { futureSubstitutions: { count: 2 }, missedLessons: { count: 3 }, pendingSubstitutionRequests: { count: 1 } } })));
  assert.match(html, /Будущие замены этого сотрудника \(2\) будут сняты/);
  assert.match(html, /Пропущенных уроков: 3\./);
  assert.match(html, /Запросов на замену этого сотрудника \(1\) будут закрыты/);
  assert.equal(renderToStaticMarkup(React.createElement(ImpactNotes, { impact: { futureSubstitutions: { count: 0 } } })), "");
  assert.equal(renderToStaticMarkup(React.createElement(ImpactNotes, { impact: null })), "");
  const page = read("src/app/owner/teachers/page.tsx");
  assert.match(page, /opsApi\.removalImpact\(memberKey, "role_change"\)/);
  assert.match(read("src/components/staff/remove-member-dialog.tsx"), /opsApi\.removalImpact\(memberId, intent\)/);
  assert.match(read("src/lib/api.ts"), /removal-impact\$\{intent === "role_change" \? "\?intent=role_change" : ""\}/);
  assert.match(page, /<RoleToAdminNotes impact=\{impact\} \/>/);
  // LESSONS 46: the new trigger `role_changed` has its words in each place of the journal
  const gone = { clearedAt: "2026-10-22T04:30:00", clearedBy: { id: "x", name: "Каримова Н." }, clearedTrigger: "role_changed", status: "substituted" };
  assert.equal(S.clearedLine({ ...gone, clearedBy: null }), "Замена снята: роль заменяющего изменена, он больше не ведёт уроки, 22.10 09:30");
  assert.equal(S.decidedByLine({ origin: "teacher", trigger: "role_changed", status: "closed", teacher: { id: "t1", name: "Иванов И." }, decision: { kind: "closed", closedReason: "ROLE_CHANGED", at: "2026-10-22T04:30:00" } }), "Закрыто системой, 22.10 09:30");
  assert.equal(S.CLOSED_REASON_TEXT.ROLE_CHANGED, "Сотрудник стал администратором");
});

test("#156 (4): a waiting request whose suggested colleague stopped leading lessons says it in plain words", () => {
  assert.equal(S.suggestedLine({ suggestedTeacher: { id: "x", name: "Сидоров С.", active: false } }), "Предложенный сотрудник больше не ведёт уроки");
  assert.equal(S.suggestedLine({ suggestedTeacher: { id: "x", name: "Сидоров С.", active: true } }), "Предложил: Сидоров С.");
});

test("#156 (3): the handover of a teacher who becomes an administrator lists the ARCHIVED groups too, marked «в архиве» (the server's `intent=role_change`)", () => {
  const { RemovalDialogBody } = require(path.join(root, "src/components/staff/remove-member-dialog.tsx"));
  const impact = { memberId: "m1", canRemove: false, groups: [{ id: "g1", name: "9-А", status: "active", nextLesson: { date: "2026-10-30", startTime: "10:00" } }, { id: "g2", name: "Старая 7-Б", status: "archived", nextLesson: null }], inProgressLessons: [] };
  const html = text(renderToStaticMarkup(React.createElement(RemovalDialogBody, {
    name: "Иванов", impact, loadError: null, isRole: true, targets: [{ id: "t2", name: "Петров" }], choices: { g1: { value: "", confirmed: false }, g2: { value: "", confirmed: false } }, everyone: "", conflicts: {}, busy: false, error: null,
    onRetry() {}, onChoice() {}, onEveryone() {},
  })));
  assert.match(html, /9-А/);
  assert.match(html, /Старая 7-Б · в архиве/);
  assert.doesNotMatch(html.replace(/Старая 7-Б · в архиве/, ""), /в архиве/, "an active group is not marked");
});

test("R3 1: «Можно назначить позже» stands in the «Преподаватель» block right under its select; no teachers in the centre: one line instead of the select", () => {
  const { GroupTeacherField } = require(path.join(root, "src/components/groups/group-create-modal.tsx"));
  const teachers = [{ id: "t1", first_name: "Иван", last_name: "Иванов", org_role: "teacher" }];
  const html = renderToStaticMarkup(React.createElement(GroupTeacherField, { teachers, value: "", onChange() {} }));
  assert.ok(html.indexOf(">Преподаватель<") < html.indexOf('id="group-create-uchitel"') && html.indexOf('id="group-create-uchitel"') < html.indexOf("group-create-teacher-hint"), "label, select, then the hint - all in one block");
  assert.match(text(html), /Можно назначить позже/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(GroupTeacherField, { teachers, value: "t1", onChange() {} })), /group-create-teacher-hint/, "a chosen teacher: no hint");
  const none = renderToStaticMarkup(React.createElement(GroupTeacherField, { teachers: [], value: "", onChange() {} }));
  assert.equal(text(none), "Преподавателей пока нет — назначьте позже");
  assert.doesNotMatch(none, /group-create-uchitel|<button/);
  // the hint is nowhere else in the form (it stood under «Тип занятий» by mistake)
  const create = read("src/components/groups/group-create-modal.tsx");
  assert.equal((create.match(/group-create-teacher-hint/g) || []).length, 1);
});

test("R3 6: a lead who is not a teacher: the header says «Ведёт не преподаватель: Имя Ф. — выберите преподавателя», never «Не назначен»", () => {
  assert.equal(SL.groupLeadNotTeacherLine("Усманов У."), "Ведёт не преподаватель: Усманов У. — выберите преподавателя");
  assert.equal(SL.groupLeadNotTeacherLine(null), "Ведёт не преподаватель — выберите преподавателя");
  const view = read("src/components/groups/group-detail-view.tsx");
  assert.match(view, /groupLeadNotTeacherLine\(group\.teacher_name\)/);
  assert.match(view, /!group\.teacher_id && !group\.teacher_name \? "Преподаватель не назначен"/);
});

test("R3 7: the note about groups only while he has groups; the substitutes are told once, by their own line", () => {
  const { RoleToAdminNotes } = require(path.join(root, "src/components/staff/remove-member-dialog.tsx"));
  const withGroups = text(renderToStaticMarkup(React.createElement(RoleToAdminNotes, { impact: { groups: [{ id: "g", name: "9-А" }], futureSubstitutions: { count: 2 } } })));
  assert.match(withGroups, /Администратор не ведёт уроки: его группы нужно передать другим преподавателям\./);
  assert.match(withGroups, /Будущие замены этого сотрудника \(2\) будут сняты/);
  assert.equal((withGroups.match(/замен/gi) || []).length, 1, "the substitutes are named once");
  const none = renderToStaticMarkup(React.createElement(RoleToAdminNotes, { impact: { groups: [], futureSubstitutions: { count: 0 } } }));
  assert.equal(none, "", "no groups and no substitutes: nothing");
  const onlySubs = renderToStaticMarkup(React.createElement(RoleToAdminNotes, { impact: { groups: [], futureSubstitutions: { count: 1 } } }));
  assert.doesNotMatch(onlySubs, /role-to-admin-note/);
  assert.doesNotMatch(SL.ROLE_TO_ADMIN_NOTE, /замен/);
});

test("R3 9: the types follow the server: `clearedTrigger` names role_changed, the unused `canChangeRole` is gone", () => {
  assert.match(read("src/lib/substitution-types.ts"), /clearedTrigger\?: [^;]*"role_changed"/);
  assert.doesNotMatch(read("src/lib/ops-b-types.ts"), /canChangeRole/);
});
