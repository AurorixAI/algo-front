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
  assert.match(page, /<TeacherMoveControl/);
  assert.doesNotMatch(page, /только на сегодня|canRescheduleToday|rescheduleLessonOccurrence|isReschedulingLesson|rescheduleReason/, "the same-day-only move is gone from the page");
  assert.doesNotMatch(read("src/lib/api.ts"), /rescheduleLessonOccurrence/);
  assert.ok(page.split("\n").length < 3210, "the page did not grow");
  assert.match(control_, /<LessonActionSheet[\s\S]*moveOnly[\s\S]*aboveLessonPanel/);
  assert.match(control_, /actions=\{\["reschedule"\]\}/);
  assert.match(sheet, /moveOnly/);
  assert.match(sheet, /lessonMove\(groupId/, "the sheet posts the one lesson-move");
  assert.equal((sheet.match(/substitutionsApi\.lessonMove\(/g) || []).length, 1);
  // the page holds its own Escape key while the dialog is open
  assert.match(page, /moveDialogOpen/);
  assert.match(page, /onMoved=\{\(text\) => \{ setActiveLesson\(null\);/);
});

test("the hint for the last hour is shown instead of the button, next to «Не смогу провести»", () => {
  const control_ = read("src/components/substitutions/teacher-move-control.tsx");
  assert.match(control_, /control\.kind === "late"[\s\S]*MOVE_TOO_LATE_HINT/);
  assert.match(control_, /data-testid="teacher-move"/);
});

test("the journal of «Замены и переносы» types the new via", () => {
  assert.match(read("src/lib/substitution-types.ts"), /"request" \| "teacher_move"/);
});
