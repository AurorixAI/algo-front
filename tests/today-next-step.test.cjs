// Release review 06.11: «Расписание» said «На сегодня всё», «Главная» said «Начните урок 09:00».  ONE function (lib/today-actions.ts) answers for both screens.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const opts = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: opts }).outputText, f);
const src = (p) => path.join(__dirname, "..", "src", p);
const A = require(src("lib/teacher-agenda.ts"));
const T = require(src("lib/today-actions.ts"));

const lesson = (id, start, end, group) => ({ id, startTime: start, endTime: end, groupName: group, occurrenceDate: "2026-11-05" });
const LESSONS = [lesson("l1", "09:00", "10:30", "7-А Алгебра"), lesson("l2", "11:00", "12:30", "7-Б Геометрия"), lesson("l3", "16:00", "17:30", "9-Б ОГЭ")];
const day = (nowMinutes, statusOf = () => "scheduled", openActions = []) => {
  const agenda = A.todayAgenda(LESSONS, statusOf, nowMinutes);
  const scheduled = T.scheduledTodayActions({ entries: agenda.entries, openActions, today: "2026-11-05", subsequentStarted: () => false });
  const actions = T.orderedTodayActions({ open: [], scheduled, today: "2026-11-05" });
  return T.todayNextStep({ actions, agenda, activeExam: null, attentionExam: null, loadFailed: false, today: "2026-11-05", later: null });
};
const view = (step) => {
  switch (step.kind) { case "action": return step.action.label; case "upcoming": return `Ближайший урок ${step.entry.lesson.startTime} · ${step.entry.lesson.groupName}`; default: return step.kind; }
};

test("the lesson whose time has come is «Начните урок» - the same step for any screen that asks (the bug of the release review)", () => {
  const step = day(10 * 60);                 // 10:00 - the 09:00 lesson is over its start, not started
  assert.equal(step.kind, "action");
  assert.equal(view(step), "Начните урок");
  assert.equal(step.action.lesson.id, "l1");
});

test("a lesson still ahead: «Ближайший урок 09:00 · 7-А Алгебра»; a day with nothing left: closed", () => {
  assert.equal(view(day(8 * 60)), "Ближайший урок 09:00 · 7-А Алгебра");
  assert.equal(day(20 * 60, () => "completed").kind, "closed");
});

test("a lesson of today that is over and never started is the red «Разберите урок», unless the server already returned it", () => {
  const step = day(13 * 60, (l) => (l.id === "l1" ? "completed" : "scheduled"));
  assert.equal(step.action.label, "Разберите урок");
  const withServer = day(13 * 60, (l) => (l.id === "l1" ? "completed" : "scheduled"), [{ lessonId: "l2", lessonDate: "2026-11-05" }]);
  assert.notEqual(withServer.kind === "action" ? withServer.action.label : "", "Разберите урок");
});

test("both screens call the one function: «Главная» and «Расписание» import lib/today-actions and have no rule of their own", () => {
  for (const file of ["app/teacher/dashboard/page.tsx", "app/teacher/schedule/page.tsx"]) {
    const text = fs.readFileSync(src(file), "utf8");
    assert.match(text, /from "@\/lib\/today-actions"/, file);
    assert.match(text, /todayNextStep\(/, file);
    assert.match(text, /scheduledTodayActions\(/, file);
    assert.match(text, /openTodayActions\(/, file);
  }
  assert.doesNotMatch(fs.readFileSync(src("app/teacher/schedule/page.tsx"), "utf8"), /На сегодня всё<\/p>|Нет уроков, требующих действия/, "the schedule no longer has its own «всё закрыто»");
});
