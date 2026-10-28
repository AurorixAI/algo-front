// #158 (28.10), front: the panel of the teacher - «Ближайшее действие» by one rule, the tiles, «Группы в фокусе».
// Spec: artifacts/analysis/P157_158_SPEC.md part C; analysis substitutions-page-ux.md §13; LESSONS 38 (one rule - one function), 46.
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
const A = require(path.join(root, "src/lib/teacher-agenda.ts"));

const T = "2026-10-28";
const min = (hhmm) => A.minutesOfTime(hhmm);
const lesson = (id, start, end, over = {}) => ({ id, groupId: `g${id}`, groupName: `Группа ${id}`, startTime: start, endTime: end, occurrenceDate: T, ...over });
const agendaOf = (lessons, statuses, now) => A.todayAgenda(lessons, (l) => statuses[l.id] || "scheduled", min(now));
const step = (over = {}) => A.pickNextStep({ actions: [], agenda: { upcoming: [] }, activeExam: null, attentionExam: null, loadFailed: false, today: T, later: null, ...over });
const action = (id, tone, actionType, over = {}) => ({ lesson: lesson(id, "10:00", "10:45", over.lesson || {}), tone, actionType });

// ── what counts in the day ─────────────────────────────────────────────────────────────────────────────

test("#158: «Уроков сегодня: 3 · осталось 1» - cancelled, moved away and substituted lessons are not in the day", () => {
  const lessons = [
    lesson("a", "09:00", "09:45"),
    lesson("b", "11:00", "11:45"),
    lesson("c", "15:00", "15:45"),
    lesson("cancelled", "12:00", "12:45"),
    lesson("moved", "13:00", "13:45", { substitutionOutcome: { kind: "rescheduled" } }),
    lesson("cancelled2", "13:30", "14:00", { substitutionOutcome: { kind: "cancelled" } }),
    lesson("replaced", "14:00", "14:45", { replacedBy: { id: "u", name: "Иванов А." } }),
  ];
  const day = agendaOf(lessons, { a: "completed", b: "completed", cancelled: "cancelled" }, "14:20");
  assert.equal(day.total, 3);
  assert.equal(day.remaining, 1);
  assert.deepEqual(A.lessonsTodayTile(day), { value: 3, note: "осталось 1" });
  assert.deepEqual(A.lessonsTodayTile(agendaOf([], {}, "10:00")), { value: 0, note: null });
});

test("#158: the phases follow the clock: before the start, from the minute of the start, past the end without a start = missed", () => {
  const l = lesson("a", "15:00", "15:45");
  assert.equal(agendaOf([l], {}, "14:59").entries[0].phase, "upcoming");
  assert.equal(agendaOf([l], {}, "14:20").entries[0].minutesToStart, 40);
  assert.equal(agendaOf([l], {}, "15:00").entries[0].phase, "to_start");
  assert.equal(agendaOf([l], {}, "15:45").entries[0].phase, "to_start");
  assert.equal(agendaOf([l], {}, "15:46").entries[0].phase, "missed");
  assert.equal(agendaOf([l], { a: "in_progress" }, "17:00").entries[0].phase, "in_progress");
  assert.equal(agendaOf([l], { a: "completed" }, "17:00").entries[0].phase, "done");
  // a missed lesson is a task of the server («Разобрать пропущенный урок»), not «осталось»
  assert.equal(agendaOf([l], {}, "17:00").remaining, 0);
});

// ── «Ближайшее действие»: the first match ─────────────────────────────────────────────────────────────────────

test("#158 rule 1-3: red journal, then a lesson in progress, then a lesson to start - whatever the time of day", () => {
  const missed = action("m", "rose", "missed", { lesson: { startTime: "15:00" } });
  const inProgress = action("p", "amber", "in_progress", { lesson: { startTime: "08:00" } });
  const toStart = action("s", "emerald", undefined, { lesson: { startTime: "07:00" } });
  assert.equal(step({ actions: [toStart, inProgress, missed] }).action, missed);
  assert.equal(step({ actions: [toStart, inProgress] }).action, inProgress);
  assert.equal(step({ actions: [toStart] }).action, toStart);
  // an old journal (a past day) is red as well; the oldest comes first
  const old1 = action("o1", "rose", "in_progress", { lesson: { occurrenceDate: "2026-10-20", startTime: "10:00" } });
  const old2 = action("o2", "rose", "in_progress", { lesson: { occurrenceDate: "2026-10-22", startTime: "10:00" } });
  assert.equal(step({ actions: [old2, inProgress, old1] }).action, old1);
});

test("#158 rule 4: before the start - «Дальше: группа · 15:00 · через 40 мин», the nearest lesson, a tail «и ещё N сегодня», neutral tone", () => {
  const day = agendaOf([lesson("late", "18:00", "18:45"), lesson("near", "15:00", "15:45"), lesson("mid", "16:30", "17:15")], {}, "14:20");
  const s = step({ agenda: day });
  assert.equal(s.kind, "upcoming");
  assert.equal(s.entry.lesson.id, "near");
  assert.equal(s.more, 2);
  assert.equal(A.startsInText(s.entry.minutesToStart), "через 40 мин");
  assert.equal(A.startsInText(130), "через 2 ч 10 мин");
  assert.equal(A.startsInText(120), "через 2 ч");
  assert.equal(A.moreTodayText(2), "и ещё 2 сегодня");
  assert.equal(A.moreTodayText(0), null);
  // the lesson that has begun is a lesson to start, not an upcoming one: the next lesson is the next card
  assert.equal(agendaOf([lesson("near", "15:00", "15:45")], {}, "15:01").upcoming.length, 0);
});

test("#158 rule 4 skips what is not the teacher's: cancelled, moved away, substituted, finished", () => {
  const day = agendaOf([
    lesson("x1", "15:00", "15:45", { substitutionOutcome: { kind: "cancelled" } }),
    lesson("x2", "15:10", "15:45", { replacedBy: { id: "u", name: "Иванов А." } }),
    lesson("x3", "15:20", "15:45"),
    lesson("ok", "17:00", "17:45"),
  ], { x3: "cancelled" }, "14:00");
  assert.equal(step({ agenda: day }).entry.lesson.id, "ok");
  assert.equal(step({ agenda: day }).more, 0);
});

test("#158 rule 5: an upcoming lesson first, then a running exam, then an exam that needs a decision", () => {
  const exam = { exam_id: "e1" };
  const attention = { exam_id: "e2" };
  assert.deepEqual(step({ activeExam: exam, attentionExam: attention }), { kind: "exam_active", exam });
  assert.deepEqual(step({ attentionExam: attention }), { kind: "exam_attention", exam: attention });
  const day = agendaOf([lesson("a", "15:00", "15:45")], {}, "14:00");
  assert.equal(step({ agenda: day, activeExam: exam }).kind, "upcoming");
});

test("#158 rule 6: «На сегодня всё закрыто» and «Следующий: …» only when there is nothing to do and no lesson ahead today", () => {
  const later = { date: "2026-10-29", startTime: "14:00", groupName: "Группа 1" };
  assert.deepEqual(step({ later }), { kind: "closed", later });
  assert.deepEqual(step(), { kind: "closed", later: null });
});

test("#158: a failed load never says «всё закрыто»; a task of the stale data is still a task", () => {
  assert.deepEqual(step({ loadFailed: true }), { kind: "failed" });
  const day = agendaOf([lesson("a", "15:00", "15:45")], {}, "14:00");
  assert.equal(step({ loadFailed: true, agenda: day }).kind, "failed", "a lesson «через 40 мин» is not promised from stale data");
  const inProgress = action("p", "amber", "in_progress");
  assert.equal(step({ loadFailed: true, actions: [inProgress] }).kind, "action");
});

test("#158: several lessons in a day - the card moves to the next one when the first is closed (the clock and the statuses only)", () => {
  const lessons = [lesson("a", "09:00", "09:45"), lesson("b", "11:00", "11:45"), lesson("c", "15:00", "15:45")];
  assert.equal(step({ agenda: agendaOf(lessons, {}, "08:00") }).entry.lesson.id, "a");
  assert.equal(step({ agenda: agendaOf(lessons, { a: "completed" }, "09:50") }).entry.lesson.id, "b");
  assert.equal(step({ agenda: agendaOf(lessons, { a: "completed", b: "completed" }, "12:00") }).entry.lesson.id, "c");
  assert.equal(step({ agenda: agendaOf(lessons, { a: "completed", b: "completed", c: "completed" }, "16:00") }).kind, "closed");
});

// ── «Группы в фокусе» ──────────────────────────────────────────────────────────────────────────────────────

test("#158: «Группы в фокусе» - no cancelled / moved / substituted lesson; the lesson in progress stays; one function with the card", () => {
  const week = [
    lesson("gone", "10:00", "10:45", { groupId: "G", substitutionOutcome: { kind: "cancelled" } }),
    lesson("repl", "10:30", "11:15", { groupId: "G", replacedBy: { id: "u", name: "Иванов А." } }),
    lesson("live", "13:00", "13:45", { groupId: "G" }),
    lesson("next", "09:00", "09:45", { groupId: "G", occurrenceDate: "2026-10-29" }),
  ];
  const ahead = (statuses, now, groupId = "G") => A.nextLessonAhead({ lessons: week, today: T, nowMinutes: min(now), todayStatusOf: (l) => statuses[l.id] || "scheduled", groupId });
  // 13:20: the lesson of the group is on (started) - it does not drop out of the focus
  assert.deepEqual([ahead({ live: "in_progress" }, "13:20").lesson.id, ahead({ live: "in_progress" }, "13:20").live], ["live", true]);
  // its time has come but it is not started yet: still the nearest (and not «live»)
  assert.deepEqual([ahead({}, "13:20").lesson.id, ahead({}, "13:20").live], ["live", false]);
  // finished: the next one is tomorrow's
  assert.equal(ahead({ live: "completed" }, "13:50").lesson.id, "next");
  // missed (the end has passed, never started): not «ahead»
  assert.equal(ahead({}, "14:00").lesson.id, "next");
  // a cancelled / substituted lesson is never the nearest
  assert.equal(ahead({}, "09:00").lesson.id, "live");
  assert.equal(ahead({}, "09:00", "other"), null);
  // the status map is by lesson id: it never touches a lesson of another date
  const sameId = A.nextLessonAhead({ lessons: [lesson("w", "10:00", "10:45", { groupId: "G", occurrenceDate: "2026-11-04" })], today: T, nowMinutes: min("12:00"), todayStatusOf: () => "cancelled" });
  assert.equal(sameId.lesson.id, "w");
});

// ── the page: the card, the tiles, the badge ───────────────────────────────────────────────────────────────

const page = read("src/app/teacher/dashboard/page.tsx");

test("#158: the page reads the day through teacher-agenda (card, tiles, focus), and says the failed load in words", () => {
  assert.match(page, /from "@\/lib\/teacher-agenda"/);
  assert.match(page, /pickNextStep\(/);
  assert.match(page, /todayAgenda\(/);
  assert.match(page, /nextLessonAhead\(/);
  assert.match(page, /<NextActionCard/);
  assert.match(read("src/components/teacher/next-action-card.tsx"), /"Не удалось загрузить"/);
  assert.doesNotMatch(page, /value: todayLessons\.length/, "«Уроков сегодня» is not the raw number of occurrences any more");
  assert.doesNotMatch(page, /primaryLessonAction = lessonActions\[0\]/);
});

test("#158: tiles 2x2 on a phone (grid-cols-2, gap-3, icon above), one row from 1024; the decorative circle is not on a phone", () => {
  assert.match(page, /grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4/);
  assert.match(page, /p-3 sm:p-6/);
  assert.match(page, /flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-4/);
  assert.match(page, /hidden sm:block absolute -right-6 -bottom-6/);
  assert.doesNotMatch(page, /grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5/);
});

test("#158: «Требуют действия» is the list of the card and of the centre (one list); the badge «Идёт сейчас» is for a started lesson only", () => {
  assert.match(page, /orderActions\(\[\.\.\.openLessonActions\.filter\(\(action\) => !action\.locked\), \.\.\.scheduledLessonActions\]/);
  assert.match(page, /value: actionCount \?\? "—"/);
  assert.match(page, /action\.actionType \? openLessonBadge\(action\.actionType\) : action\.badge \?\? "Пора начать"/);
  assert.doesNotMatch(page, /: "Идёт сейчас"\}/, "a lesson whose time has come but which is not started is «Пора начать»");
  assert.match(page, /data-testid="group-focus-live"/);
});

test("#158: the card says each step in plain words (render of the component)", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const C = require(path.join(root, "src/components/teacher/next-action-card.tsx"));
  const textOf = (html) => html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
  const card = (step, hint = null) => renderToStaticMarkup(React.createElement(C.NextActionCard, { step, hint, onOpenAction() {}, onOpenLesson() {}, onRetry() {} }));
  const day = agendaOf([lesson("near", "15:00", "15:45"), lesson("mid", "16:30", "17:15")], {}, "14:20");
  const upcoming = card(step({ agenda: day }), "Пока нет решения — урок проводите вы");
  assert.match(upcoming, /data-step="upcoming"/);
  assert.match(textOf(upcoming), /Дальше: Группа near · 15:00/);
  assert.match(textOf(upcoming), /Пока нет решения — урок проводите вы/);
  assert.match(textOf(upcoming).replace(/\u00a0/g, " "), /через 40 мин/);
  assert.match(textOf(upcoming), /и ещё 1 сегодня/);
  assert.match(textOf(upcoming), /Открыть урок/);
  assert.match(upcoming, /bg-slate-100 text-slate-600/, "calm: the neutral tone of the icon, not a warning");
  assert.doesNotMatch(card(step({ agenda: day })), /amber|rose/, "without a hint nothing in the card is a warning");
  const closed = card(step({ later: { date: "2026-10-29", startTime: "14:00", groupName: "Группа 1" } }));
  assert.match(textOf(closed), /На сегодня всё закрыто\|.*Следующий: чт, 29\.10, 14:00 · Группа 1/);
  const failed = card(step({ loadFailed: true }));
  assert.match(textOf(failed), /Не удалось загрузить/);
  assert.doesNotMatch(textOf(failed), /всё закрыто/);
  assert.match(textOf(failed), /Повторить/);
  const exam = card(step({ activeExam: { exam_id: "e1", title: "Контрольная", group_name: "9-А", delivery_mode: "online", displayRemainingSeconds: 330 } }));
  assert.match(textOf(exam), /Сейчас проводится экзамен\|Контрольная · 9-А\. Осталось 05:30\./);
  const attention = card(step({ attentionExam: { exam_id: "e2", title: "Контрольная", group_name: "9-А", displayRemainingSeconds: 0 } }));
  assert.match(textOf(attention), /Нужно решить по экзамену/);
  for (const html of [upcoming, closed, failed, exam, attention]) assert.doesNotMatch(textOf(html), /\(а\)/);
});

test("#158: texts of the panel: plain Russian, no «(а)»", () => {
  for (const file of ["src/lib/teacher-agenda.ts", "src/app/teacher/dashboard/page.tsx"]) assert.doesNotMatch(read(file), /\(а\)|\(ла\)|\(ся\)/, file);
});

// ── round 2 (28.10): the lesson that is over and was never started, the schedule order, the lesson a substitute leads, the exam without a lesson ───────

test("#158 r2 (1): today's lesson that is over and never started is the FIRST task (red); it is in «Требуют действия»; the server's own action wins", () => {
  const over = lesson("late", "13:00", "13:45");
  const day = agendaOf([over, lesson("next", "17:00", "17:45")], {}, "14:30");
  assert.equal(day.entries[0].phase, "missed");
  assert.equal(day.remaining, 1, "a missed lesson is a task, not «осталось»");
  const page = read("src/app/teacher/dashboard/page.tsx");
  assert.match(page, /entry\.phase === "missed"/);
  assert.match(page, /cardLabel: `Разберите урок: \$\{entry\.lesson\.groupName\} · \$\{entry\.lesson\.startTime\}`/);
  assert.match(page, /state\.|openAttendanceActions\.some\(\(action\) => action\.lessonId === entry\.lesson\.id && action\.lessonDate === businessDate\)/, "no second card for the lesson the server returned");
  // the red task goes before a lesson in progress and a lesson to start, whatever the time
  const missed = { lesson: over, tone: "rose", label: "Разберите урок" };
  const inProgress = action("p", "amber", "in_progress", { lesson: { startTime: "08:00" } });
  assert.equal(step({ actions: [inProgress, missed], agenda: day }).action, missed);
  assert.equal(step({ actions: [missed], agenda: day }).kind, "action", "before «Дальше: …»");
  const C = require(path.join(root, "src/components/teacher/next-action-card.tsx"));
  const view = C.nextStepView({ kind: "action", action: { ...missed, cardLabel: "Разберите урок: Группа late · 13:00", description: "d", cardDescription: "Урок закончился, а журнал не начат. Отметьте урок или укажите, что его не было." } });
  assert.deepEqual([view.tone, view.title], ["rose", "Разберите урок: Группа late · 13:00"]);
});

test("#158 r2 (2): «Расписание на сегодня» is by the start time only, whatever the status", () => {
  const page = read("src/app/teacher/dashboard/page.tsx");
  assert.match(page, /\[\.\.\.todayLessons\]\.sort\(\(a, b\) => \(a\.startTime \|\| ""\)\.localeCompare\(b\.startTime \|\| ""\)/);
  assert.doesNotMatch(page, /const rank = \(lesson: LessonSummary/);
});

test("#158 r2 (3): a lesson a substitute leads is grey «Ведёт замена: Имя» in the schedule of the main teacher, never red «Урок не начат»", () => {
  assert.equal(A.ledByText("Каримов Н."), "Ведёт замена: Каримов Н.");
  assert.equal(A.ledByText(""), "Ведёт замена");
  const page = read("src/app/teacher/dashboard/page.tsx");
  assert.match(page, /const ledByOtherTeacher = !isCancelled && Boolean\(l\.replacedBy\)/);
  assert.match(page, /isCancelled \|\| ledByOtherTeacher\s+\? "bg-slate-50/);
  assert.match(page, /\) : ledByOtherTeacher \? \(\s+<span data-testid="led-by-substitute"/);
  // the grey badge stands before every red / amber one
  assert.ok(page.indexOf('data-testid="led-by-substitute"') < page.indexOf("Урок не начат"), "the badge of a substitute comes first");
});

test("#158 r2 (9): an exam without the date of a lesson is never «Занятие прошло»", () => {
  const C = require(path.join(root, "src/components/teacher/next-action-card.tsx"));
  const withDate = C.nextStepView({ kind: "exam_attention", exam: { exam_id: "e", title: "К", group_name: "9-А", scheduled_lesson_date: "2026-10-27", displayRemainingSeconds: 0 } }).description;
  const noDate = C.nextStepView({ kind: "exam_attention", exam: { exam_id: "e", title: "К", group_name: "9-А", scheduled_lesson_date: null, displayRemainingSeconds: 0 } }).description;
  assert.match(withDate, /Занятие прошло/);
  assert.doesNotMatch(noDate, /Занятие прошло/);
  assert.match(read("src/app/teacher/dashboard/page.tsx"), /scheduledDate && scheduledDate < businessDate/, "no date - not «needs_resolution»");
});
