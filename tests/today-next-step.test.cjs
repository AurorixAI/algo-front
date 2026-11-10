// Release review 06.11: «Расписание» said «На сегодня всё», «Главная» said «Начните урок 09:00».  ONE function (lib/today-actions.ts) answers for both screens.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const opts = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: opts }).outputText, f);
require.extensions[".tsx"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: opts }).outputText, f);
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest); };
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

// Owner 10.11: the card «Ближайшее действие» overflowed to 4 lines, was red, with sparkles.
const CARD = require(src("components/teacher/next-action-card.tsx"));
const SERVER_MISSED = { actionType: "missed", lessonId: "l1", lessonDate: "2026-11-04", groupName: "Индивидуально: Азизов", rosterCount: 0, markedCount: 0, remainingCount: 0 };
const openOf = (action) => T.openTodayActions({ actions: [action], today: "2026-11-10", toLesson: () => ({ id: "l1", groupName: action.groupName, startTime: "10:00", endTime: "11:00", occurrenceDate: action.lessonDate }), isLocked: () => false })[0];

test("a missed lesson on the card: the title «Разобрать пропущенный урок», ONE line «Ср, 4 нояб. · Индивидуально: Азизов», no explanation (it is on the screen the arrow opens)", () => {
  const view = CARD.nextStepView({ kind: "action", action: openOf(SERVER_MISSED) });
  assert.equal(view.title, "Разобрать пропущенный урок");
  assert.match(view.description, /^[А-Яа-я]{2}, 4 нояб\.? · Индивидуально: Азизов$/);
  assert.doesNotMatch(view.description, /не был начат|Укажите|\n/);
  assert.ok(view.description.length < 60);
  assert.match(fs.readFileSync(path.join(__dirname, "..", "src/components/teacher/lesson-panel.tsx"), "utf8"), /Урок не был начат/, "the explanation is where the arrow leads");
});

test("the card text is ONE line with the full value in title; the tone of an overdue lesson is a WARNING (yellow), never red; the sign is by meaning", () => {
  for (const file of ["src/components/teacher/next-action-card.tsx", "src/app/teacher/schedule/page.tsx"]) {
    const text = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.match(text, /title=\{(view|nextStepText)\.description\}[^>]*truncate|truncate[^>]*title=\{(view|nextStepText)\.description\}/, `${file}: one line, the full text in title`);
  }
  const schedule = fs.readFileSync(path.join(__dirname, "..", "src/app/teacher/schedule/page.tsx"), "utf8");
  assert.match(schedule, /nextStepText\.tone === "rose" \? "border-warning-200 bg-warning-50\/70/, "overdue = warning on «Расписание»");
  assert.doesNotMatch(schedule, /nextStepText\.tone === "rose" \? "border-danger/);
  assert.match(CARD.ICON_TONE.rose, /warning/, "overdue = warning on «Главная»");
  const iconName = (step) => CARD.nextStepIcon(step).displayName || CARD.nextStepIcon(step).render?.displayName;
  const lucide = require("lucide-react");
  assert.equal(CARD.nextStepIcon({ kind: "action", action: openOf(SERVER_MISSED) }), lucide.AlertCircle, "a missed lesson: «!»");
  assert.equal(CARD.nextStepIcon({ kind: "action", action: { lesson: {}, tone: "emerald", label: "Начните урок", description: "" } }), lucide.Play, "a lesson to start: play");
  assert.equal(CARD.nextStepIcon({ kind: "closed", later: null }), lucide.CheckCircle2, "nothing to do: a tick");
  void iconName;
});
