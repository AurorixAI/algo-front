// N13 carry-over #86: the exam-assignment dialog offers no lesson that is completed, cancelled or already over.
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
const src = (p) => path.join(root, "src", p);
const read = (p) => fs.readFileSync(src(p), "utf8");

const { isLessonBindable, bindableLessons, occurrenceKey, selectionLost } = require(src("lib/exam-lessons.ts"));
const at = (h, m) => h * 60 + m;

// ---- #86 exam assignment: only lessons that can still open the exam ------------------------------

const slot = (over = {}) => ({ id: "L1", occurrenceDate: "2026-10-16", startTime: "09:20", endTime: "09:40", ...over });
const ctx = (nowMinutes, statuses = {}, businessDate = "2026-10-16") => ({ businessDate, nowMinutes, statuses });

test("occurrenceKey is the journal key", () => {
  assert.equal(occurrenceKey(slot()), "2026-10-16_L1");
});

test("a completed or cancelled lesson is never offered; a lesson that is over is not either", () => {
  // the reported case: 09:20-09:40 completed, it is 09:37
  assert.equal(isLessonBindable(slot(), ctx(at(9, 37), { "2026-10-16_L1": "completed" })), false);
  assert.equal(isLessonBindable(slot(), ctx(at(9, 37), { "2026-10-16_L1": "cancelled" })), false);
  // no status and the end passed: a missed lesson cannot be started any more
  assert.equal(isLessonBindable(slot(), ctx(at(9, 40))), false);
  assert.equal(isLessonBindable(slot(), ctx(at(11, 0), { "2026-10-16_L1": "scheduled" })), false);
  // an earlier day
  assert.equal(isLessonBindable(slot({ occurrenceDate: "2026-10-15" }), ctx(at(8, 0))), false);
});

test("a lesson in progress or still ahead is kept, whenever the teacher assigns", () => {
  assert.equal(isLessonBindable(slot(), ctx(at(9, 37), { "2026-10-16_L1": "in_progress" })), true); // assigning during the lesson
  assert.equal(isLessonBindable(slot(), ctx(at(9, 50), { "2026-10-16_L1": "in_progress" })), true); // runs past the planned end, still open
  assert.equal(isLessonBindable(slot(), ctx(at(9, 37))), true);                                      // not started, not over
  assert.equal(isLessonBindable(slot(), ctx(at(9, 39))), true);
  assert.equal(isLessonBindable(slot({ id: "L2", startTime: "11:00", endTime: "11:40" }), ctx(at(9, 37))), true);
  assert.equal(isLessonBindable(slot({ occurrenceDate: "2026-10-17" }), ctx(at(23, 0))), true);       // tomorrow, even late tonight
  assert.equal(isLessonBindable(slot({ occurrenceDate: "2026-10-17", id: "L3" }), ctx(at(8, 0), { "2026-10-17_L3": "cancelled" })), false);
  assert.equal(isLessonBindable(slot({ endTime: null }), ctx(at(23, 0))), true); // no end time to judge by
});

test("the list of the report: 09:20-09:40 completed at 09:37 disappears, the rest stays in order", () => {
  const lessons = [
    slot(),
    slot({ id: "L2", startTime: "11:00", endTime: "11:40" }),
    slot({ id: "L1", occurrenceDate: "2026-10-18" }),
  ];
  const shown = bindableLessons(lessons, ctx(at(9, 37), { "2026-10-16_L1": "completed" }));
  assert.deepEqual(shown.map(occurrenceKey), ["2026-10-16_L2", "2026-10-18_L1"]);
  // a few minutes later the not-yet-started 11:00 lesson is still there, the 09:20 one (never started) is over
  assert.deepEqual(bindableLessons(lessons, ctx(at(9, 41))).map(occurrenceKey), ["2026-10-16_L2", "2026-10-18_L1"]);
});

test("the dialog filters by the attendance statuses of the chosen group and by the clock, and says so when it cannot check", () => {
  const modal = read("components/exam/schedule-exam-modal.tsx");
  assert.match(modal, /orgApi\.getGroupAttendance\(groupId, \{ dateFrom, dateTo: addDays\(dateFrom, 42\) \}\)/);
  assert.match(modal, /attendance\?\.statuses \?\? \{\}/);
  assert.match(modal, /bindableLessons\(\s*occurrences\.filter\(\(item\) => item\.groupId === groupId\),/);
  assert.match(modal, /const clock = useNow\(30_000\)/);
  assert.match(modal, /businessTimeMinutes\(at\)/);
  // no unfiltered list is ever rendered, and a failed status read is shown (with a retry) instead of offering everything
  assert.doesNotMatch(modal, /occurrences\.filter\(\(item\) => item\.groupId === groupId\),\s*\[groupId, occurrences\]/);
  assert.match(modal, /Не удалось проверить статус занятий/);
  assert.match(modal, /setStatusNonce/);
  assert.match(modal, /Завершённые, отменённые и уже прошедшие занятия не показываются/);
});

test("a picked lesson that leaves the list is detected (completed in another tab, cancelled, over)", () => {
  const offered = bindableLessons([slot(), slot({ id: "L2", startTime: "11:00", endTime: "11:40" })], ctx(at(9, 30)));
  assert.equal(selectionLost("", offered), false, "nothing picked, nothing lost");
  assert.equal(selectionLost("2026-10-16_L1", offered), false);
  // the status refresh brings "completed" for L1: the pick is gone, the other lesson is still there
  const refreshed = bindableLessons([slot(), slot({ id: "L2", startTime: "11:00", endTime: "11:40" })], ctx(at(9, 37), { "2026-10-16_L1": "completed" }));
  assert.equal(selectionLost("2026-10-16_L1", refreshed), true);
  assert.equal(selectionLost("2026-10-16_L2", refreshed), false);
  assert.equal(selectionLost("2026-10-16_L2", []), true, "an empty list loses any pick");
});

test("the dialog re-reads the statuses on the 30 s tick and on window focus, and says when the pick is gone", () => {
  const modal = read("components/exam/schedule-exam-modal.tsx");
  assert.match(modal, /useEffect\(\(\) => \{ refreshStatuses\.current\(\); \}, \[clock\]\)/, "a refresh on every clock tick");
  assert.match(modal, /window\.addEventListener\("focus", onFocus\)/);
  assert.match(modal, /window\.removeEventListener\("focus", onFocus\)/, "the listener is removed on close");
  assert.match(modal, /createRequestSequence\(\)/, "an older read never overwrites a newer one");
  assert.match(modal, /if \(!groupId \|\| !statusesReady\) return;/, "no refresh before the first read of the group");
  assert.match(modal, /\.catch\(\(\) => \{ \/\* keep what is known \*\/ \}\)/, "a failed refresh keeps the last statuses");
  assert.match(modal, /const selectionGone = statusesReady && selectionLost\(selectedOccurrenceId, groupOccurrences\)/);
  assert.match(modal, /\{selectionGone && \(\s*<p role="alert"[^>]*>Выбранное занятие больше недоступно — выберите другое<\/p>/);
});
