// WE-E (E1, decision 3): the RULES of the one lesson panel, below the screens:
//  - `lessonPanelBanner`: which banner, in which order (a future lesson has ONE banner, a past lesson that was never started offers the reconciliation, ...);
//  - the hook `useTeacherLessonPanel` on a bare probe component: the date check at the start (it came from the dashboard; the schedule had only the hidden button),
//    «Разобрать пропущенный урок» for a task older than 7 days is not offered to a teacher;
//  - MUTATION: the date check is cut out of a copy of the hook and the same scenario must fail.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");
const { NOW, TODAY, PAST_DAY, FUTURE_DAY, LESSONS, lesson, createWorld, harness } = require("./helpers/teacher-world.cjs");

const root = harness.root;
const view = require(path.join(root, "src/lib/lesson-panel-view.ts"));
const hookModule = (mutate) => {
  const filename = path.join(root, "src/lib/use-teacher-lesson-panel.ts");
  if (!mutate) return require(filename);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const source = mutate(fs.readFileSync(filename, "utf8"));
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
};

// ── the banner ───────────────────────────────────────────────────────────────────────────────────
const base = { status: "scheduled", relation: "today", isDirty: false, hasSavedMarks: false, hasSubsequentStarted: false, time: { type: "live", isPastEndTime: false } };
const banner = (patch) => view.lessonPanelBanner({ ...base, ...patch });

test("[R1] the banner follows the lifecycle: end states, what was done, why a scheduled lesson cannot start, ready", () => {
  assert.equal(banner({ status: "cancelled" }), "cancelled");
  assert.equal(banner({ status: "completed" }), "completed");
  assert.equal(banner({ status: "in_progress", isDirty: true }), "dirty");
  assert.equal(banner({ status: "in_progress", hasSavedMarks: true }), "saved");
  assert.equal(banner({ status: "in_progress" }), "started");
  assert.equal(banner({ relation: "past" }), "past");
  assert.equal(banner({ relation: "future" }), "future");
  assert.equal(banner({ hasSubsequentStarted: true }), "subsequent");
  assert.equal(banner({ time: { type: "upcoming" } }), "upcoming");
  assert.equal(banner({ time: { type: "live", isPastEndTime: true } }), "overdue");
  assert.equal(banner({}), "ready");
});

test("[R2] precedence: a finished or cancelled lesson shows that whatever else is true; a past or future day beats «later lesson started» and the clock", () => {
  assert.equal(banner({ status: "completed", isDirty: true, relation: "past", hasSubsequentStarted: true }), "completed");
  assert.equal(banner({ status: "cancelled", relation: "future" }), "cancelled");
  assert.equal(banner({ relation: "past", hasSubsequentStarted: true, time: { type: "upcoming" } }), "past");
  assert.equal(banner({ relation: "future", hasSubsequentStarted: true }), "future");
  assert.equal(banner({ hasSubsequentStarted: true, time: { type: "upcoming" } }), "subsequent");
  // a started lesson of a past day is a started lesson (the reconciliation opens such a journal)
  assert.equal(banner({ status: "in_progress", relation: "past" }), "started");
});

// ── the hook on a bare probe ─────────────────────────────────────────────────────────────────────
async function probe(mutate, scenario, worldOptions) {
  harness.setNow(NOW);
  const world = createWorld(worldOptions);
  try {
    const { useTeacherLessonPanel, lessonFromAttendanceAction } = hookModule(mutate);
    const React = require("react");
    let latest = null;
    const toasts = [];
    const host = (extra = {}) => ({
      businessDate: TODAY, groups: world.groups, user: world.user, todayLessons: [], statusOfToday: () => "scheduled", hasSavedMarks: () => false,
      openActions: world.openActions, setOpenActions: () => undefined, lessonFromAction: lessonFromAttendanceAction,
      onWritten: () => undefined, notifyRefusal: (notice, reason) => toasts.push([notice, reason]), onMissedCancelled: () => undefined, ...extra,
    });
    let hostProps = host();
    const Probe = () => { latest = useTeacherLessonPanel(hostProps); return null; };
    const screen = harness.screen(Probe, {}, {});
    const api = {
      get panel() { return latest; }, world, toasts, screen,
      setHost(extra) { hostProps = host(extra); screen.world.render(); },
      async open(lesson) { await screen.call(() => latest.openLesson(lesson)); await screen.settle(); },
      async start() { await screen.call(() => latest.handleStartLesson()); await screen.settle(); },
    };
    await scenario(api);
  } finally { world.restore(); harness.setNow(null); }
}

const DATE_CHECK = /const blocked = startBlockedReason\([\s\S]*?\n    if \(blocked\) \{[\s\S]*?\n    \}\n/;
const scenarioDateCheck = async (api) => {
  await api.open(LESSONS.past);                                   // the lesson of Monday, the business day is Wednesday
  await api.start();
  assert.equal(api.world.called("startGroupAttendance").length, 0, "no request for a lesson of another day");
  assert.match(api.panel.attendanceError || "", /Начать урок можно только в день его проведения/);
  await api.open(LESSONS.future);
  await api.start();
  assert.equal(api.world.called("startGroupAttendance").length, 0);
  assert.match(api.panel.attendanceError || "", /Урок ещё не наступил: начать его можно только в день проведения/);
  await api.open(LESSONS.live);                                   // today: goes through
  await api.start();
  assert.equal(api.world.called("startGroupAttendance").length, 1);
};

test("[R3] the start is refused for a lesson of another day by the hook itself (the buttons are hidden, but a stale panel must not slip through)", async () => {
  await probe(null, scenarioDateCheck);
});

test("[R4] MUTATION: without the date check the same scenario fails (a request goes out for a past lesson)", async () => {
  const mutated = (source) => { assert.match(source, DATE_CHECK); return source.replace(DATE_CHECK, ""); };
  await assert.rejects(() => probe(mutated, scenarioDateCheck), /no request for a lesson of another day|0 !== 1|1 !== 0/);
});

// the window of the teacher is BY THE DATE of the lesson (server: LESSON_TOO_OLD when the date is before today - 7): 7 days back is allowed, 8 is not
const dayLesson = (id, date) => lesson(id, `G-${id}`, `Группа ${id}`, date, "10:00", "11:00");
test("[R5] 7 days back the teacher still settles / cancels / marks, 8 days back nothing of his is offered: ONE line instead; the administrator is not bound", async () => {
  const seven = dayLesson("L7", "2026-10-28");
  const eight = dayLesson("L8", "2026-10-27");
  await probe(null, async (api) => {
    const missed = (l) => api.world.openAction(l);
    api.setHost({ openActions: [missed(seven), missed(eight)] });
    await api.open(seven);
    assert.equal(api.panel.lessonTooOld, false);
    assert.equal(api.panel.banner, "past");
    assert.ok(api.panel.activeMissedAction, "7 days: «Разобрать» is offered");
    assert.equal(api.panel.lessonMenuItems.some((item) => item.key === "cancel"), false, "7 days with a task: «Разобрать» is the road (the dialog offers both outcomes), the menu does not repeat it");
    await api.open(eight);
    assert.equal(api.panel.lessonTooOld, true);
    assert.equal(api.panel.banner, "tooOld");
    assert.equal(api.panel.activeMissedAction, null, "8 days: no «Разобрать», even when the server lists the task");
    assert.deepEqual(api.panel.lessonMenuItems.map((item) => item.key).filter((key) => key === "cancel"), [], "8 days: no «Урока не было»");
    // the same for a lesson that was started and left open: nothing to mark
    api.world.setLessonState(eight, { status: "in_progress", version: 2, roster: ["s1", "s2"] });
    await api.open({ ...eight });
    assert.equal(api.panel.banner, "tooOld");
    await api.screen.call(() => api.panel.handleSaveAttendance());
    assert.equal(api.world.called("saveGroupAttendance").length, 0);
    assert.match(api.panel.attendanceError || "", /Урок старше 7 дней — его закрывает администратор или владелец/);
    // the administrator is not bound by the window
    api.world.user = { ...api.world.user, role: "admin", org_role: "admin" };
    api.setHost({ openActions: [missed(eight)], user: api.world.user });
    assert.equal(api.panel.lessonTooOld, false);
  }, { extra: [seven, eight] });
});

test("[R5b] MUTATION: the window by the existence of the task (not by the date) lets a lesson of 8 days with no task through", async () => {
  const eight = dayLesson("L8", "2026-10-27");
  const mutated = (source) => { assert.match(source, /isLessonTooOld\(activeLessonDate, businessDate\)/); return source.replace("isLessonTooOld(activeLessonDate, businessDate)", "false"); };
  await assert.rejects(() => probe(mutated, async (api) => {
    await api.open(eight);
    assert.equal(api.panel.banner, "tooOld");
  }, { extra: [eight] }), /'past' !== 'tooOld'|tooOld/);
});

test("[R6] a task that is not old is offered to the teacher; a lesson of today never has one", async () => {
  const action = createWorld().openAction(LESSONS.past);
  await probe(null, async (api) => {
    api.setHost({ openActions: [action] });
    await api.open(LESSONS.past);
    assert.deepEqual(api.panel.activeMissedAction && api.panel.activeMissedAction.lessonId, "L-past");
    assert.equal(api.panel.banner, "past");
    await api.open(LESSONS.live);
    assert.equal(api.panel.activeMissedAction, null);
    assert.equal(api.panel.banner, "ready");
  });
});

test("[R7] the lesson rebuilt from a task of the server: the day of the week of ITS date, the room, the format", () => {
  const { lessonFromAttendanceAction } = hookModule(null);
  const lesson = lessonFromAttendanceAction({ actionType: "missed", groupId: "G", groupName: "Г", classLevel: 8, lessonId: "L", lessonDate: PAST_DAY, subject: "math", startTime: "10:00", endTime: "11:00", room: null, format: "online", topic: "Дроби", markedCount: 0, rosterCount: 2, remainingCount: 2 });
  assert.equal(lesson.dayOfWeek, 1);                       // 2026-11-02 is a Monday
  assert.equal(lesson.room, "");
  assert.equal(lesson.format, "online");
  assert.equal(lesson.occurrenceDate, PAST_DAY);
  assert.equal(lesson.topic, "Дроби");
  void FUTURE_DAY;
});

// ── REL-N2 R3: one road to «Урока не было» - the wiring of the hook (the screens cannot reach a state with saved flag and no marks, the hook can be put there) ──
const SAVED_FLAG = "setIsAttendanceSaved(snapshot.isSaved);";
test("[RN2-W1] overdue with the «saved» flag and no marks: the card has no buttons, so the row stays in the menu; without the flag the card takes it", async () => {
  await probe(null, async (api) => {
    await api.open(LESSONS.over);
    assert.equal(api.panel.banner, "overdue");
    assert.ok(api.panel.cancelCardItem, "the card takes the row");
    assert.equal(api.panel.lessonMenuItems.some((item) => item.key === "cancel"), false);
  });
  const flagged = (source) => { assert.ok(source.includes(SAVED_FLAG), "the line to mutate found"); return source.replace(SAVED_FLAG, "setIsAttendanceSaved(true);"); };
  await probe(flagged, async (api) => {
    await api.open(LESSONS.over);
    assert.equal(api.panel.isAttendanceSaved, true);
    assert.equal(api.panel.banner, "overdue", "no marks: still the overdue banner");
    assert.equal(api.panel.cancelCardItem, null, "the card shows no buttons for saved marks");
    assert.equal(api.panel.lessonMenuItems.some((item) => item.key === "cancel"), true, "so the row stays in the menu: the lesson is not left without a road");
  });
});
