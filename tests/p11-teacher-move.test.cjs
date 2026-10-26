// P1.1: the teacher moves HIS OWN lesson ahead of time with the administrator's dialog (one path with #124); the journal says who moved it.
// Spec: artifacts/p1/P1_1_TEACHER_MOVE_SPEC.md.  The rules are run on the real helpers; the wiring is pinned on the sources.
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
const S = require(path.join(root, "src/lib/substitutions.ts"));
const A = require(path.join(root, "src/lib/schedule-card-actions.ts"));

const MIN = 60_000;
const START = Date.UTC(2026, 9, 26, 5, 0);                // some lesson start
const base = { role: "teacher", userId: "t1", lessonTeacherId: "t1", isSubstitution: false, lessonStatus: "scheduled", startsAtMs: START };
const control = (patch, minutesBefore) => S.teacherMoveControl({ ...base, ...patch, nowMs: START - minutesBefore * MIN }).kind;

test("the button is on his own future lesson while more than 60 minutes are left; then the hint", () => {
  assert.equal(control({}, 24 * 60), "button");
  assert.equal(control({}, 120), "button");
  assert.equal(control({}, 61), "button");
  assert.equal(control({}, 60), "late");                  // the server: now < start - 60 min
  assert.equal(control({}, 59), "late");
  assert.equal(control({}, 1), "late");
  assert.equal(control({}, 0), "none");                   // started
  assert.equal(control({}, -30), "none");
  assert.equal(S.MOVE_TOO_LATE_HINT, "Перенести можно не позднее чем за 60 минут до начала");
});

test("not his lesson, a substitution of one lesson, a manager, a lesson that is not planned: nothing", () => {
  assert.equal(control({ lessonTeacherId: "t2" }, 300), "none");
  assert.equal(control({ isSubstitution: true }, 300), "none");
  assert.equal(control({ role: "admin" }, 300), "none");
  assert.equal(control({ role: "owner" }, 300), "none");
  assert.equal(control({ lessonStatus: "cancelled" }, 300), "none");
  assert.equal(control({ lessonStatus: "completed" }, 300), "none");
  assert.equal(control({ startsAtMs: null }, 300), "none");
  assert.equal(control({ lessonTeacherId: null }, 300), "button");        // teacher not read yet: the server has the last word
});

test("the journal says WHO moved the lesson; other decisions keep their line", () => {
  const item = (via, by) => ({ status: "rescheduled", decision: { kind: "reschedule", via, by: by ? { id: "u", name: by } : null, at: "2026-10-21T09:12:00", movedTo: null } });
  assert.equal(S.decidedByLine(item("teacher_move", "Каримов А.")), "Перенёс: преподаватель Каримов А., 21.10 14:12");
  assert.equal(S.decidedByLine(item("request", "Каримова Н.")), "Перенёс: администратор Каримова Н., 21.10 14:12");
  assert.equal(S.decidedByLine(item("teacher_move", null)), "Перенёс: преподаватель, 21.10 14:12");
  const cancelled = { status: "cancelled", decision: { kind: "cancel", via: "request", by: { id: "u", name: "Каримова Н." }, at: "2026-10-21T09:12:00" } };
  assert.equal(S.decidedByLine(cancelled), "Решил(а) Каримова Н., 21.10 14:12");
});

test("the live check says why a teacher is late (the server's ok=false + code) and the error texts are the server's", () => {
  const message = "Перенести урок можно не позднее чем за 60 минут до начала. Нажмите «Не смогу провести» — решит администратор";
  const lines = A.lessonMoveCheckLines({ ok: false, code: "MOVE_TOO_LATE", message, teacherConflicts: [], groupConflicts: [], warnings: [] });
  assert.deepEqual([lines.ok, lines.lines, lines.code, lines.stale], [false, [message], "MOVE_TOO_LATE", false]);
  assert.equal(A.moveConfirmDisabled({ checking: false, failed: false, check: { ok: false } }), true);
  const refused = Object.assign(new Error(message), { status: 409, code: "MOVE_TOO_LATE", detail: { code: "MOVE_TOO_LATE", message } });
  assert.equal(A.lessonMoveErrorText(refused), message);
});

test("one dialog for both: the teacher's page holds the shared sheet through the control, not a copy of the form", () => {
  const page = read("src/app/teacher/schedule/page.tsx");
  const control_ = read("src/components/substitutions/teacher-move-control.tsx");
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  const dashboard = read("src/app/teacher/dashboard/page.tsx");
  assert.match(page, /<TeacherLessonControls/);
  assert.match(dashboard, /<TeacherLessonControls/, "the dashboard's panel has the same controls");
  assert.doesNotMatch(dashboard, /<RequestControl/);
  assert.ok(dashboard.split("\n").length <= 2842 + 11, "the dashboard did not grow");
  assert.match(read("src/components/substitutions/teacher-lesson-controls.tsx"), /<RequestControl[\s\S]*<TeacherMoveControl/);
  assert.doesNotMatch(page, /только на сегодня|canRescheduleToday|rescheduleLessonOccurrence|isReschedulingLesson|rescheduleReason/, "the same-day-only move is gone from the page");
  assert.doesNotMatch(read("src/lib/api.ts"), /rescheduleLessonOccurrence/);
  assert.ok(page.split("\n").length < 3210, "the page did not grow");
  assert.match(control_, /<LessonActionSheet[\s\S]*moveOnly[\s\S]*aboveLessonPanel/);
  assert.match(control_, /actions=\{\["reschedule"\]\}/);
  assert.match(sheet, /moveOnly/);
  assert.match(sheet, /lessonMove\(groupId/, "the sheet posts the one lesson-move");
  assert.equal((sheet.match(/substitutionsApi\.lessonMove\(/g) || []).length, 1);
  // both pages hold their Escape key while the dialog is open
  for (const source of [page, dashboard]) {
    assert.match(source, /moveHoldsEscape\.current\) return/);
    assert.match(source, /onDialogChange=\{\(open\) => \{ moveHoldsEscape\.current = open; \}\}/);
    assert.match(source, /onMoved=\{\(text\) => \{ setActiveLesson\(null\); showToast\(text\);/, "the toast lives in the page: the control goes away with the panel");
    assert.match(source, /\{toastNode\}/);
  }
});

test("the last hour: «Перенести урок» is a disabled row of the «⋯» menu with the reason, next to «Не смогу провести»", () => {
  const control_ = read("src/components/substitutions/teacher-move-control.tsx");
  assert.match(control_, /onKind\?\.\(kind\)/);                      // the control says «button» / «late» / «none»; the menu draws the row
  const menu = read("src/components/substitutions/teacher-lesson-controls.tsx");
  assert.match(menu, /actions\.moveKind === "late"[\s\S]*disabledReason: MOVE_TOO_LATE_HINT/);
  // the page's Escape key is released when the control goes away with the dialog open
  assert.match(control_, /useEffect\(\(\) => \(\) => \{ window\.setTimeout\(\(\) => onDialogChange\?\.\(false\), 0\); \}, \[\]\)/);
});

test("the journal of «Замены и переносы» types the new via", () => {
  assert.match(read("src/lib/substitution-types.ts"), /"request" \| "teacher_move"/);
});

test("rooms are written one way: «Кабинет 5» / «кабинет 5» / «Каб. 5» / «каб 5» -> «каб. 5»; other words stay (display only)", () => {
  const F = require(path.join(root, "src/lib/lesson-slot-form.ts"));
  for (const room of ["Кабинет 5", "кабинет 5", "Каб. 5", "каб 5", "КАБ.5", "  Кабинет   5 ", "каб. 5"]) assert.equal(F.roomWithPrefix(room), "каб. 5", room);
  assert.equal(F.roomWithPrefix("Кабинет 3-А"), "каб. 3-А");
  assert.equal(F.roomWithPrefix("21"), "каб. 21");
  assert.equal(F.roomWithPrefix("5"), "каб. 5");
  for (const room of ["Зал", "Малый зал", "Актовый зал", "Кабинетный зал", "каб5", "Каб"]) assert.equal(F.roomWithPrefix(room), room, room);
  // saving is not changed: the value that is sent is the one the teacher typed
  assert.equal(F.roomWithPrefix.length, 1);
});

test("both week grids write the head of a day with the one component: weekday, the date under it, the pill of today", () => {
  const Day = require(path.join(root, "src/components/schedule/day-heading.tsx"));
  assert.equal(Day.weekdayShort("2026-10-26"), "пн");
  assert.equal(Day.dayAndMonth("2026-10-26"), "26 окт.");
  const owner = read("src/components/groups/group-schedule-overview.tsx");
  const teacher = read("src/app/teacher/schedule/page.tsx");
  assert.match(owner, /<DayHeading date=\{date\} isToday=\{isToday\} \/>/);
  assert.match(teacher, /<DayHeading date=\{businessWeekdayDate\(day\.id, weekOffset\)\} isToday=\{isToday\} onAccent \/>/);
  assert.doesNotMatch(owner + teacher, /text-\[10px\] bg-white\/20 px-2 py-1 rounded-md font-bold/, "no second copy of the pill");
  assert.ok(teacher.split("\n").length < 3210, "the teacher page did not grow");
});

test("the journal: a move without a request says who moved it and its chip is «Перенос»; a teacher's request keeps its reason", () => {
  const moved = (via) => ({ origin: "system", status: "rescheduled", reasonCode: "other", reasonLabel: "Другое", decision: { via } });
  assert.equal(S.originLine(moved("teacher_move")), "Перенёс сам, без запроса");
  assert.equal(S.originLine(moved("request")), "Перенёс администратор, без запроса");
  assert.equal(S.reasonChipText(moved("teacher_move")), "Перенос");
  assert.equal(S.originLine({ origin: "system", status: "pending", decision: null }), "Запрос создан системой");
  const asked = { origin: "teacher", status: "rescheduled", reasonCode: "sick", reasonLabel: "", decision: { via: "request" } };
  assert.equal(S.originLine(asked), null);
  assert.equal(S.reasonChipText(asked), "Болезнь");
});

test("the teacher's week grid never shows the cards of another week while the next one loads (a click acted on the old week's lesson)", () => {
  const page = read("src/app/teacher/schedule/page.tsx");
  assert.match(page, /const weekLoading = loadedWeek\?\.start !== weekPeriod\.start;/);
  assert.match(page, /loadedWeek && !weekLoading \? loadedWeek\.lessons : \[\]/);
  assert.doesNotMatch(page, /setWeekOccurrences/, "the lessons of a week are always stored with their week");
  assert.match(page, /weekLoading \? \(weekLoadError \? "Неделя не загружена" : "Загружаем…"\) : "Нет занятий"/);
});
