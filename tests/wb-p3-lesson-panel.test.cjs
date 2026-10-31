// Wave B / P3 (F-A10, F-A11, F-A12, F-A27): the BEHAVIOUR of the lesson panel of the teacher.
//  - useLessonPanelData: a slow answer of lesson A after lesson B was opened changes nothing in the panel of B (students, marks, status, version,
//    error, `loading`), and a write asks the hook for the lesson id and the version of THE OPEN lesson only;
//  - the roster of a lesson is one rule for both screens (frozen for a started / past lesson, current for a lesson not started);
//  - the shared time / weekday / plural helpers;
//  - MUTATIONS: the guards are removed from a copy of the source and the same scenarios must fail.
// There is no DOM renderer in this repo, so the hook runs in a small hook harness (state, refs and effects with their cleanup over a slot array);
// the logic under test is the real file.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const Module = require("node:module");

const root = path.join(__dirname, "..");
const transpile = (filename, source, jsx) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
}).outputText;
require.extensions[".ts"] = (mod, filename) => mod._compile(transpile(filename, fs.readFileSync(filename, "utf8"), false), filename);
require.extensions[".tsx"] = (mod, filename) => mod._compile(transpile(filename, fs.readFileSync(filename, "utf8"), true), filename);

// ── the hook harness ────────────────────────────────────────────────────────────────────────────
let instance = null;
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const realReact = require("react");
const harness = {
  ...realReact,
  useState(initial) {
    const inst = instance;
    const i = inst.cursor++;
    if (!(i in inst.slots)) inst.slots[i] = initial;
    return [inst.slots[i], (value) => { inst.slots[i] = typeof value === "function" ? value(inst.slots[i]) : value; inst.schedule(); }];
  },
  useRef(initial) {
    const inst = instance;
    const i = inst.cursor++;
    if (!(i in inst.slots)) inst.slots[i] = { current: initial };
    return inst.slots[i];
  },
  useCallback(fn) { instance.cursor++; return fn; },
  useMemo(fn) { instance.cursor++; return fn(); },
  useEffect(fn, deps) {
    const inst = instance;
    const i = inst.cursor++;
    const prev = inst.slots[i];
    if (prev && deps && sameDeps(prev.deps, deps)) return;
    inst.effects.push(() => {
      if (prev && prev.cleanup) prev.cleanup();
      const cleanup = fn();
      inst.slots[i] = { deps, cleanup: typeof cleanup === "function" ? cleanup : null };
    });
    if (!prev) inst.slots[i] = { deps: null, cleanup: null };
  },
};
const realLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === "react") return harness;
  if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
  return realLoad.call(this, request, parent, ...rest);
};

/** Loads src/lib/<name>.ts as a fresh module, optionally with `mutate(source)` applied to its text first. */
function loadLib(name, mutate) {
  if (!mutate) return require(path.join(root, "src/lib", `${name}.ts`));
  const filename = path.join(root, "src/lib", `${name}.ts`);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(transpile(filename, mutate(fs.readFileSync(filename, "utf8")), false), filename);
  return mod.exports;
}

/** mount(hookFn): renders `hookFn(props)` again whenever a state changes (on a microtask); effects run after every render. */
function mount(hookFn, initialProps) {
  const inst = { slots: [], cursor: 0, effects: [], dirty: false, props: initialProps, result: null };
  const render = () => {
    instance = inst;
    inst.cursor = 0;
    inst.dirty = false;
    inst.result = hookFn(inst.props);
    const effects = inst.effects.splice(0);
    instance = null;
    for (const effect of effects) { instance = inst; effect(); instance = null; }
  };
  inst.schedule = () => {
    if (inst.dirty) return;
    inst.dirty = true;
    queueMicrotask(() => { if (inst.dirty) render(); });
  };
  render();
  return {
    get result() { return inst.result; },
    setProps(next) { inst.props = { ...inst.props, ...next }; render(); },
    unmount() { for (const slot of inst.slots) if (slot && typeof slot.cleanup === "function") slot.cleanup(); },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

// ── the world of the scenarios: two lessons of one day, each with its own journal and its own version ──
const TODAY = "2026-11-02";
const lessonA = { id: "LA", groupId: "GA", occurrenceDate: TODAY };
const lessonB = { id: "LB", groupId: "GB", occurrenceDate: TODAY };
const keyOf = (lesson) => `${TODAY}_${lesson.id}`;
const student = (id, name, extra = {}) => ({ id, first_name: name, last_name: `Ф${id}`, full_name: `Ф${id} ${name}`, class_level: 7, status: "active", ...extra });
const groups = {
  GA: { students: [student("a1", "Азиз"), student("a2", "Алина")] },
  GB: { students: [student("b1", "Бобур"), student("b2", "Барно")] },
};
const journals = {
  GA: { statuses: { [keyOf(lessonA)]: "completed" }, versions: { [keyOf(lessonA)]: 11 }, records: { [keyOf(lessonA)]: { a1: "present", a2: "absent" } }, rosterStudentIds: { [keyOf(lessonA)]: ["a1", "a2"] }, cancellationReasons: {}, excuses: {} },
  GB: { statuses: { [keyOf(lessonB)]: "in_progress" }, versions: { [keyOf(lessonB)]: 7 }, records: { [keyOf(lessonB)]: { b1: "present", b2: "late" } }, rosterStudentIds: { [keyOf(lessonB)]: ["b1", "b2"] }, cancellationReasons: {}, excuses: {} },
};

/** The panel as a screen wires it: the real hook + the real marks hook; the screen's state is what the callbacks write. */
function panelOf(P, M, gates) {
  const screen = { students: [], status: "scheduled", marks: {}, error: null, loadedCalls: [], opened: 0, closed: 0 };
  const view = mount(({ lesson }) => {
    const marksOps = M.useLessonMarksOps();
    const panel = P.useLessonPanelData(lesson, {
      businessDate: TODAY,
      ownGroupIds: ["GA", "GB"],
      getGroup: async (groupId) => groups[groupId],
      getJournal: (groupId) => gates[groupId].promise,
      versionBody: marksOps.versionBody,
      onClose: () => { screen.closed += 1; screen.students = []; screen.status = "scheduled"; screen.marks = {}; screen.error = null; marksOps.reset(undefined, {}); },
      onOpen: () => { screen.opened += 1; screen.students = []; screen.status = "scheduled"; screen.marks = {}; screen.error = null; marksOps.reset(undefined, {}); },
      onLoaded: (snapshot) => {
        screen.loadedCalls.push(snapshot.key);
        screen.students = snapshot.students.map((s) => s.id);
        screen.status = snapshot.status;
        screen.marks = snapshot.marks;
        marksOps.reset(snapshot.version, snapshot.baseRecords);
      },
      onFailed: (error) => { screen.error = String(error && error.message || error); },
    });
    return { panel, marksOps };
  }, { lesson: null });
  return { view, screen, open: (lesson) => view.setProps({ lesson }) };
}

function makeGates() {
  return { GA: deferred(), GB: deferred() };
}

// ── F-A10: the race ────────────────────────────────────────────────────────────────────────────
async function raceScenario(P, M) {
  const gates = makeGates();
  const { view, screen, open } = panelOf(P, M, gates);
  open(lessonA); // A is asked for: its answer is slow
  await settle();
  assert.equal(view.result.panel.loading, true);
  open(lessonB); // A closed unanswered, B opened
  await settle();
  gates.GB.resolve(journals.GB);
  await settle();
  assert.deepEqual(screen.students, ["b1", "b2"]);
  assert.equal(screen.status, "in_progress");
  assert.equal(view.result.panel.loading, false);
  // the slow answer of A arrives now
  gates.GA.resolve(journals.GA);
  await settle();
  assert.deepEqual(screen.students, ["b1", "b2"], "the students of B only");
  assert.equal(screen.status, "in_progress", "the status of B, not «completed» of A");
  assert.deepEqual(screen.marks, { b1: "present", b2: "late" }, "the marks of B");
  assert.deepEqual(screen.loadedCalls, [keyOf(lessonB)], "A was never applied");
  assert.equal(view.result.panel.loading, false);
  // a write goes to B with the version of B
  const target = view.result.panel.target(lessonB);
  assert.deepEqual({ lessonId: target.lessonId, groupId: target.groupId, lessonDate: target.lessonDate, version: target.versionBody }, { lessonId: "LB", groupId: "GB", lessonDate: TODAY, version: { expectedVersion: 7 } });
  assert.equal(view.result.panel.target(lessonA), null, "a write for A is refused while B is on the screen");
  view.unmount();
}

test("[F-A10] a slow answer of lesson A after B was opened: the panel of B holds only B (students, marks, status, version)", async () => {
  await raceScenario(loadLib("lesson-panel-data"), loadLib("use-lesson-marks-ops"));
});

test("[F-A10] `loading` is not reset by an answer of another lesson - neither by its success nor by its failure", async () => {
  const P = loadLib("lesson-panel-data");
  const M = loadLib("use-lesson-marks-ops");
  const gates = makeGates();
  const { view, screen, open } = panelOf(P, M, gates);
  open(lessonA);
  await settle();
  open(lessonB);
  await settle();
  assert.equal(view.result.panel.loading, true);
  gates.GA.resolve(journals.GA);
  await settle();
  assert.equal(view.result.panel.loading, true, "B is still being read");
  assert.equal(view.result.panel.target(lessonB), null, "and nothing may be written to it yet");
  gates.GB.resolve(journals.GB);
  await settle();
  assert.equal(view.result.panel.loading, false);
  // a failure of the old lesson: no error text in the panel of the new one, no `loading` change
  const second = makeGates();
  const again = panelOf(P, M, second);
  again.open(lessonA);
  await settle();
  again.open(lessonB);
  await settle();
  second.GA.reject(new Error("сеть пропала"));
  await settle();
  assert.equal(again.screen.error, null, "the error of A is not the error of B");
  assert.equal(again.view.result.panel.loading, true);
  second.GB.resolve(journals.GB);
  await settle();
  assert.equal(again.view.result.panel.loading, false);
  assert.deepEqual(again.screen.students, ["b1", "b2"]);
  assert.equal(screen.error, null);
});

test("[F-A10] the panel is closed before the answer: nothing is applied, `loading` ends, a write is refused", async () => {
  const P = loadLib("lesson-panel-data");
  const M = loadLib("use-lesson-marks-ops");
  const gates = makeGates();
  const { view, screen, open } = panelOf(P, M, gates);
  open(lessonA);
  await settle();
  open(null);
  await settle();
  assert.equal(view.result.panel.loading, false);
  gates.GA.resolve(journals.GA);
  await settle();
  assert.deepEqual(screen.loadedCalls, []);
  assert.deepEqual(screen.students, []);
  assert.equal(view.result.panel.target(lessonA), null);
  assert.equal(view.result.panel.isOpen(keyOf(lessonA)), false, "a handler that wakes up after the close touches nothing");
});

test("[F-A10] A -> B -> A: the answer of the FIRST A is dropped, the answer of the second A is applied", async () => {
  const P = loadLib("lesson-panel-data");
  const M = loadLib("use-lesson-marks-ops");
  let calls = 0;
  const first = deferred();
  const second = deferred();
  const screen = { students: [], loaded: 0 };
  const view = mount(({ lesson }) => {
    const marksOps = M.useLessonMarksOps();
    const panel = P.useLessonPanelData(lesson, {
      businessDate: TODAY, ownGroupIds: ["GA", "GB"], getGroup: async (id) => groups[id],
      getJournal: (groupId) => (groupId === "GA" ? (++calls === 1 ? first.promise : second.promise) : Promise.resolve(journals.GB)),
      versionBody: marksOps.versionBody, onClose() {}, onOpen() { screen.students = []; }, onFailed() {},
      onLoaded: (snapshot) => { screen.loaded += 1; screen.students = snapshot.students.map((s) => s.id); marksOps.reset(snapshot.version, snapshot.baseRecords); },
    });
    return { panel, marksOps };
  }, { lesson: null });
  view.setProps({ lesson: lessonA });
  await settle();
  view.setProps({ lesson: lessonB });
  await settle();
  view.setProps({ lesson: lessonA });
  await settle();
  const staleA = { ...journals.GA, versions: { [keyOf(lessonA)]: 1 } };
  first.resolve(staleA);
  await settle();
  assert.equal(screen.loaded, 1, "only B was applied (the first A is stale)");
  assert.equal(view.result.panel.loading, true, "the second A is still on its way");
  second.resolve(journals.GA);
  await settle();
  assert.equal(screen.loaded, 2);
  assert.deepEqual(screen.students, ["a1", "a2"]);
  assert.equal(view.result.panel.target(lessonA).versionBody.expectedVersion, 11, "the version of the SECOND answer, not the stale 1");
});

test("[F-A10] a failed read leaves no lesson to write to; the error is the one of the open lesson", async () => {
  const P = loadLib("lesson-panel-data");
  const M = loadLib("use-lesson-marks-ops");
  const gates = makeGates();
  const { view, screen, open } = panelOf(P, M, gates);
  open(lessonB);
  await settle();
  gates.GB.reject(new Error("Нет связи"));
  await settle();
  assert.equal(screen.error, "Нет связи");
  assert.equal(view.result.panel.loading, false);
  assert.equal(view.result.panel.target(lessonB), null);
});

test("[F-A10] the version of the lesson that was open before is forgotten at once, before the new journal comes", async () => {
  const P = loadLib("lesson-panel-data");
  const M = loadLib("use-lesson-marks-ops");
  const gates = makeGates();
  const { view, open } = panelOf(P, M, gates);
  open(lessonA);
  await settle();
  gates.GA.resolve(journals.GA);
  await settle();
  assert.deepEqual(view.result.panel.target(lessonA).versionBody, { expectedVersion: 11 });
  open(lessonB);
  await settle();
  assert.deepEqual(view.result.marksOps.versionBody(), {}, "B has no version yet: the 11 of A is gone");
});

// the mutant must fail on an ASSERTION of the scenario, not on a crash of the harness
const mutantFailure = (error) => {
  if (process.env.SHOW_MUTANT) console.log("MUTANT:", String(error.message).split("\n")[0]);
  return error instanceof assert.AssertionError;
};

// ── the mutations: take a guard out of the source, the same scenario must fail ─────────────────────
test("[mutation] without the token check the race scenario fails (the old lesson's answer reaches the panel)", async () => {
  const mutant = loadLib("lesson-panel-data", (source) => {
    assert.equal((source.match(/if \(!sequence\.isCurrent\(token\)\) return;/g) || []).length, 2, "the two token checks are where the test expects them");
    return source.replace(/if \(!sequence\.isCurrent\(token\)\) return;/g, "");
  });
  await assert.rejects(raceScenario(mutant, loadLib("use-lesson-marks-ops")), mutantFailure);
});

test("[mutation] without the check of the open lesson a write for A is accepted while B is on the screen", async () => {
  const mutant = loadLib("lesson-panel-data", (source) => {
    assert.match(source, /loadedKey\.current !== key \|\| openKey\.current !== key/);
    return source.replace("loadedKey.current !== key || openKey.current !== key", "false");
  });
  await assert.rejects(raceScenario(mutant, loadLib("use-lesson-marks-ops")), mutantFailure);
});

test("[mutation] without forgetting the old version at the open, B would carry the version of A", async () => {
  const P = loadLib("lesson-panel-data");
  const M = loadLib("use-lesson-marks-ops");
  // the screen forgets nothing in `onOpen` (what the page did before WB-P3): A's version stays until B's journal comes
  const gates = makeGates();
  const view = mount(({ lesson }) => {
    const marksOps = M.useLessonMarksOps();
    const panel = P.useLessonPanelData(lesson, {
      businessDate: TODAY, ownGroupIds: ["GA", "GB"], getGroup: async (id) => groups[id], getJournal: (g) => gates[g].promise,
      versionBody: marksOps.versionBody, onClose() {}, onOpen() {}, onFailed() {},
      onLoaded: (snapshot) => marksOps.reset(snapshot.version, snapshot.baseRecords),
    });
    return { panel, marksOps };
  }, { lesson: null });
  view.setProps({ lesson: lessonA });
  await settle();
  gates.GA.resolve(journals.GA);
  await settle();
  view.setProps({ lesson: lessonB });
  await settle();
  assert.deepEqual(view.result.marksOps.versionBody(), { expectedVersion: 11 }, "the leftover the real screens now clear in onOpen");
});

// ── F-A12: one roster rule for both screens ────────────────────────────────────────────────────
test("[F-A12] a started or past lesson shows the frozen roster in its order; a student who left comes from the journal, one who joined later is not in it", () => {
  const P = loadLib("lesson-panel-data");
  const key = keyOf(lessonA);
  const group = { students: [student("s2", "Мадина"), student("s3", "Дилшод")] }; // s1 left the group after the lesson, s3 joined after it
  const journal = {
    rosterStudentIds: { [key]: ["s1", "s2"] },
    historicalStudents: [{ id: "s1", first_name: "Анвар", last_name: "Ушёл", full_name: "Ушёл Анвар", class_level: 7, display_id: "X-1" }],
  };
  const roster = P.buildLessonRoster({ source: "group", lessonKey: key, isToday: false, group, journal });
  assert.deepEqual(roster.map((s) => s.id), ["s1", "s2"]);
  assert.equal(roster[0].full_name, "Ушёл Анвар");
  const same = P.buildLessonRoster({ source: "group", lessonKey: key, isToday: true, group, journal });
  assert.deepEqual(same.map((s) => s.id), ["s1", "s2"], "today or not - the frozen roster is the roster");
});

test("[F-A12] a frozen EMPTY roster is a fact (an empty lesson), not «no roster yet»", () => {
  const P = loadLib("lesson-panel-data");
  const key = keyOf(lessonA);
  const roster = P.buildLessonRoster({ source: "group", lessonKey: key, isToday: false, group: groups.GA, journal: { rosterStudentIds: { [key]: [] } } });
  assert.deepEqual(roster, []);
});

test("[F-A12] a lesson not started yet shows the current group - today without the students on a pause, another day with all", () => {
  const P = loadLib("lesson-panel-data");
  const key = keyOf(lessonA);
  const group = { students: [student("s1", "А"), student("s2", "Б", { on_pause: true }), student("s3", "В")] };
  assert.deepEqual(P.buildLessonRoster({ source: "group", lessonKey: key, isToday: true, group, journal: { rosterStudentIds: {} } }).map((s) => s.id), ["s1", "s3"]);
  assert.deepEqual(P.buildLessonRoster({ source: "group", lessonKey: key, isToday: false, group, journal: {} }).map((s) => s.id), ["s1", "s2", "s3"]);
});

test("[F-A12] a substitute's roster is the roster of the journal; the group page is not needed", () => {
  const P = loadLib("lesson-panel-data");
  const roster = P.buildLessonRoster({ source: "journal", lessonKey: keyOf(lessonA), isToday: true, group: null, journal: { lessonRoster: [{ id: "s9", first_name: "Али", last_name: "Валиев", full_name: "Валиев Али", class_level: 9 }] } });
  assert.deepEqual(roster.map((s) => s.id), ["s9"]);
});

test("[F-A12] the dashboard and the schedule get the SAME snapshot of the same journal (one builder, the roster of a past lesson is frozen on both)", async () => {
  const P = loadLib("lesson-panel-data");
  const key = keyOf(lessonA);
  const group = { students: [student("s2", "Мадина"), student("s3", "Дилшод")] };
  const journal = { statuses: { [key]: "completed" }, versions: { [key]: 4 }, records: { [key]: { s1: "present", s2: "absent" } }, rosterStudentIds: { [key]: ["s1", "s2"] },
    historicalStudents: [{ id: "s1", full_name: "Ушёл Анвар" }] };
  // the dashboard's lesson of today may come without a date, the schedule's always has one: the same lesson, the same key, the same snapshot
  const fromDashboard = P.buildLessonSnapshot({ lesson: { id: "LA", groupId: "GA" }, businessDate: TODAY, source: "group", group, journal });
  const fromSchedule = P.buildLessonSnapshot({ lesson: lessonA, businessDate: TODAY, source: "group", group, journal });
  assert.deepEqual(fromDashboard, fromSchedule);
  assert.deepEqual(fromSchedule.students.map((s) => s.id), ["s1", "s2"]);
  assert.equal(fromSchedule.version, 4);
  assert.equal(fromSchedule.isSaved, true);
  assert.equal(P.lessonPanelKey({ id: "LA" }, TODAY), `${TODAY}_LA`);
  // the screens keep no copy of the rule: it lives in one place
  for (const file of ["src/app/teacher/dashboard/page.tsx", "src/app/teacher/schedule/page.tsx"]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(text, /rosterStudentIds\?\.\[lessonKey\]|historicalById|hasFrozenRoster/, `${file} builds no roster of its own`);
    assert.match(text, /useLessonPanelData/, `${file} reads the lesson through the hook`);
  }
});

test("[F-A12] a cancelled lesson shows no marks, but the journal's marks stay the base of «Оставить мои»", () => {
  const P = loadLib("lesson-panel-data");
  const key = keyOf(lessonA);
  const snapshot = P.buildLessonSnapshot({ lesson: lessonA, businessDate: TODAY, source: "group", group: groups.GA,
    journal: { statuses: { [key]: "cancelled" }, records: { [key]: { a1: "present" } }, cancellationReasons: { [key]: "Болезнь" }, versions: { [key]: 3 } } });
  assert.deepEqual(snapshot.marks, {});
  assert.deepEqual(snapshot.baseRecords, { a1: "present" });
  assert.equal(snapshot.isSaved, false);
  assert.equal(snapshot.cancellationReason, "Болезнь");
});

// ── F-A11: the shared helpers ──────────────────────────────────────────────────────────────────
test("[F-A11] getLessonTimeStatus: the one copy gives what the two copies gave", () => {
  const T = loadLib("schedule-time");
  const lesson = { startTime: "10:00", endTime: "11:00", dayOfWeek: 3 };
  const at = (minutes, completed) => T.getLessonTimeStatus(lesson, 3, false, completed, minutes);
  assert.deepEqual([at(9 * 60 + 30).type, at(9 * 60 + 30).diffMinutes], ["upcoming", 30]);
  assert.deepEqual([at(10 * 60 + 5).type, at(10 * 60 + 5).canStart, at(10 * 60 + 5).isPastEndTime], ["live", true, false]);
  assert.equal(at(11 * 60 + 1).isPastEndTime, true);
  assert.equal(at(10 * 60 + 5, true).type, "completed");
  assert.equal(T.getLessonTimeStatus(lesson, 4, false, false, 600).type, "other_day");
  assert.equal(T.getLessonTimeStatus(null, 3).type, "other_day");
});

test("[F-A11] the weekdays and the plural words", () => {
  const T = loadLib("schedule-time");
  assert.deepEqual(T.DAYS.map((d) => d.short), ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]);
  assert.equal(T.DAYS[6].name, "Воскресенье");
  assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25].map(T.classCountLabel), ["1 занятие", "2 занятия", "5 занятий", "11 занятий", "12 занятий", "21 занятие", "22 занятия", "25 занятий"]);
  assert.deepEqual([1, 2, 5, 11, 21, 24].map(T.formatExamQueueCount), ["1 экзамен", "2 экзамена", "5 экзаменов", "11 экзаменов", "21 экзамен", "24 экзамена"]);
  assert.equal(T.completedLessonsProgressLabel(2, 21), "Завершено: 2 из 21 урока");
  assert.equal(T.completedLessonsProgressLabel(2, 11), "Завершено: 2 из 11 уроков");
  assert.equal(T.completedLessonsProgressLabel(1, 5), "Завершено: 1 из 5 уроков");
  // the three screens read the weekdays from one place
  const slot = loadLib("lesson-slot-form");
  assert.equal(slot.DAYS, T.DAYS);
});

// ── F-A27: no branch of a manager on the screens of the teacher ──────────────────────────────────
test("[F-A27] the teacher gets only his own rows in the «⋯» menu of the lesson, whatever the lesson is; nothing of a manager", () => {
  const C = require(path.join(root, "src/components/substitutions/teacher-lesson-controls.tsx"));
  const L = loadLib("lesson-teacher");
  const S = loadLib("substitutions");
  const keys = new Set();
  for (const moveKind of ["none", "button", "late", "rejected"]) {
    for (const requestKind of ["none", "button", "pending"]) {
      for (const offer of [null, { route: "missed", label: "Урока не было", hint: "x" }]) {
        for (const item of C.teacherLessonMenuItems({ moveKind, requestKind, setMoveOpen() {}, setRequestOpen() {} }, () => {}, { offer, open() {} })) keys.add(item.key);
      }
    }
  }
  assert.deepEqual([...keys].sort(), ["cancel", "move", "request"], "the teacher's rows: move, ask for a substitute, «Урока не было» - no «replace the teacher»");
  for (const status of ["scheduled", "in_progress", "completed", "cancelled"]) {
    assert.equal(L.canReplaceTeacher("teacher", status), false, `a teacher does not assign a substitute (${status})`);
  }
  // the chip of a waiting request is the teacher's own («Вы запросили замену»), not the manager's «Ждёт замены»
  const chips = S.occurrenceChips({ groupName: "Г", substitutionRequest: { id: "r1", status: "pending", teacherName: "Иванов" } }, "t1", { groupsBase: "/teacher/groups" });
  assert.deepEqual(chips.map((chip) => chip.text), [S.REQUESTED_LABEL]);
  assert.notEqual(S.REQUESTED_LABEL, S.WAITING_MARK);
});

test("[F-A27] the screens of the teacher spell no manager condition and keep no manager dialog", () => {
  for (const file of ["src/app/teacher/dashboard/page.tsx", "src/app/teacher/schedule/page.tsx"]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(text, /isManager|isOrgManager|LessonTeacherDialog|canReplaceTeacher|org_role === "owner"/, file);
  }
  const schedule = fs.readFileSync(path.join(root, "src/app/teacher/schedule/page.tsx"), "utf8");
  assert.match(schedule, /orgApi\.listGroups\(\{ teacher_id: user\.id \}\)/);
  assert.match(schedule, /orgApi\.getSchedule\(user\.id\)/);
});

// ── R3 round: what to do with the answer of a write (pure), the notice of a refusal, the double press, the texts ──────────────
const targetOf = (overrides = {}) => ({ key: keyOf(lessonA), groupId: "GA", groupName: "Группа А", lessonId: "LA", lessonDate: TODAY, versionBody: { expectedVersion: 11 }, ...overrides });

test("[R3-1/2] the answer of a write: the panel changes only while its lesson is open; a refusal that finds the panel gone is a notice", () => {
  const P = loadLib("lesson-panel-data");
  const target = targetOf();
  const open = (key) => key === target.key;
  const elsewhere = (key) => key === keyOf(lessonB); // B was opened while the write of A was on its way
  const closed = () => false;
  assert.deepEqual(P.planAfterWrite({ target, isOpen: open, outcome: { ok: true } }), { applyToPanel: true, notice: null });
  assert.deepEqual(P.planAfterWrite({ target, isOpen: open, outcome: { ok: false, kind: "other" } }), { applyToPanel: true, notice: null }, "its own panel shows its own refusal in its own place");
  assert.deepEqual(P.planAfterWrite({ target, isOpen: elsewhere, outcome: { ok: true } }), { applyToPanel: false, notice: null }, "a success of A does not touch the panel of B");
  assert.deepEqual(P.planAfterWrite({ target, isOpen: closed, outcome: { ok: true } }), { applyToPanel: false, notice: null });
  assert.deepEqual(P.planAfterWrite({ target, isOpen: elsewhere, outcome: { ok: false, kind: "other" } }),
    { applyToPanel: false, notice: "Не сохранено: Группа А, 2 ноября — откройте урок и повторите" });
  assert.deepEqual(P.planAfterWrite({ target, isOpen: closed, outcome: { ok: false, kind: "conflict" } }),
    { applyToPanel: false, notice: "Урок изменили в другом окне — откройте его снова" });
  assert.equal(P.refusedWriteNotice({ groupName: null, lessonDate: "2026-11-02" }, "other"), "Не сохранено: урок, 2 ноября — откройте урок и повторите");
});

test("[R3-2] a refused write of A while B is open: the target of A is still A's, the plan is a notice, the panel of B is not touched", async () => {
  const P = loadLib("lesson-panel-data");
  const M = loadLib("use-lesson-marks-ops");
  const gates = makeGates();
  const { view, screen, open } = panelOf(P, M, gates);
  open(lessonA);
  await settle();
  gates.GA.resolve({ ...journals.GA, statuses: { [keyOf(lessonA)]: "in_progress" } });
  await settle();
  const targetA = view.result.panel.target(lessonA); // the teacher presses «Сохранить» on A
  assert.deepEqual(targetA.versionBody, { expectedVersion: 11 });
  open(lessonB); // ... closes A, opens B while the write is on its way
  await settle();
  gates.GB.resolve(journals.GB);
  await settle();
  const before = JSON.stringify(screen);
  const plan = P.planAfterWrite({ target: targetA, isOpen: view.result.panel.isOpen, outcome: { ok: false, kind: "other" } });
  assert.equal(plan.applyToPanel, false);
  assert.match(plan.notice, /^Не сохранено: .*2 ноября — откройте урок и повторите$/);
  assert.equal(JSON.stringify(screen), before, "the screen of B is as it was");
  assert.deepEqual(view.result.panel.target(lessonB).versionBody, { expectedVersion: 7 }, "the next write of B carries B's version");
});

test("[R3-2] the body of a write is the target's: the lesson and the version of A, whatever is open at the moment of the call", async () => {
  const P = loadLib("lesson-panel-data");
  const body = (module) => module.lessonWriteBody(targetOf(), "Тема", { status: "in_progress", records: { a1: "present" } });
  const expected = { lessonDate: TODAY, lessonId: "LA", topic: "Тема", status: "in_progress", records: { a1: "present" }, expectedVersion: 11 };
  assert.deepEqual(body(P), expected);
  assert.deepEqual(P.lessonStartBody(targetOf(), "Тема"), { lessonDate: TODAY, lessonId: "LA", topic: "Тема" }, "the start has no version");
  assert.deepEqual(P.lessonCancelRef(targetOf(), "Тема"), { groupId: "GA", lessonId: "LA", lessonDate: TODAY, topic: "Тема" });
  assert.deepEqual(P.lessonWriteBody(targetOf({ versionBody: {} }), undefined, {}), { lessonDate: TODAY, lessonId: "LA", topic: undefined }, "a lesson without a record sends no version");
  // the extra part cannot move the write to another lesson or another version
  assert.deepEqual(P.lessonWriteBody(targetOf(), "Т", { status: "completed" }).expectedVersion, 11);
});

test("[mutation R3] without the check of the open lesson a refusal is lost / a success is applied to B; without the target in the body the write names another lesson", async () => {
  const closedRefusal = (module) => {
    const target = targetOf();
    assert.equal(module.planAfterWrite({ target, isOpen: () => false, outcome: { ok: false, kind: "other" } }).notice === null, false, "the refusal is shown");
    assert.equal(module.planAfterWrite({ target, isOpen: (key) => key === keyOf(lessonB), outcome: { ok: true } }).applyToPanel, false, "a success of A is not applied to B");
  };
  closedRefusal(loadLib("lesson-panel-data")); // the real file passes
  const noIsOpen = loadLib("lesson-panel-data", (source) => {
    assert.match(source, /const open = input\.isOpen\(input\.target\.key\);/);
    return source.replace("const open = input.isOpen(input.target.key);", "const open = true;");
  });
  assert.throws(() => closedRefusal(noIsOpen), assert.AssertionError);
  const noVersion = loadLib("lesson-panel-data", (source) => {
    assert.match(source, /topic, \.\.\.extra, \.\.\.target\.versionBody/);
    return source.replace("topic, ...extra, ...target.versionBody", "topic, ...extra");
  });
  assert.throws(() => assert.equal(noVersion.lessonWriteBody(targetOf(), "Т", {}).expectedVersion, 11), assert.AssertionError);
  const otherLesson = loadLib("lesson-panel-data", (source) => {
    assert.match(source, /\{ lessonDate: target\.lessonDate, lessonId: target\.lessonId, topic, \.\.\.extra/);
    return source.replace("{ lessonDate: target.lessonDate, lessonId: target.lessonId, topic, ...extra", "{ lessonDate: target.lessonDate, lessonId: \"LB\", topic, ...extra");
  });
  assert.throws(() => assert.equal(otherLesson.lessonWriteBody(targetOf(), "Т", {}).lessonId, "LA"), assert.AssertionError);
  // the screens build their bodies through these functions: no write is composed from the lesson that happens to be open
  for (const file of ["src/app/teacher/dashboard/page.tsx", "src/app/teacher/schedule/page.tsx"]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(text, /lessonWriteBody\(target/, file);
    assert.match(text, /lessonStartBody\(target/, file);
    assert.match(text, /lessonCancelRef\(target/, file);
    assert.doesNotMatch(text, /(save|start)GroupAttendance\(activeLesson|sendTeacherCancel\([^)]*activeLesson\.(id|groupId)/, file);
    assert.match(text, /(save|start)GroupAttendance\(target\.groupId/, file);
    assert.match(text, /planAfterWrite\(/, file);
  }
});

test("[R3-8/9] a second press of the same lesson is one request; the write of A does not lock B", () => {
  const P = loadLib("lesson-panel-data");
  const view = mount(() => P.useLessonWrites(), {});
  const writes = () => view.result;
  assert.equal(writes().begin("A"), true);
  assert.equal(writes().begin("A"), false, "a double click on «Начать урок»: the second press sends nothing");
  assert.equal(writes().begin("B"), true, "another lesson is free");
  return settle().then(() => {
    assert.equal(writes().isBusy("A"), true);
    assert.equal(writes().isBusy("B"), true);
    assert.equal(writes().isBusy("C"), false, "a lesson that was not written is not busy");
    assert.equal(writes().isBusy(null), false);
    writes().end("A");
    return settle();
  }).then(() => {
    assert.equal(writes().isBusy("A"), false, "A is free again");
    assert.equal(writes().isBusy("B"), true, "the end of A does not free B");
    assert.equal(writes().begin("A"), true, "and A may be written again");
  });
});

test("[R3-4] «still loading» and «did not load» are two different words; neither says «reopen» for a read that is on its way", async () => {
  const P = loadLib("lesson-panel-data");
  const M = loadLib("use-lesson-marks-ops");
  const gates = makeGates();
  const { view, open } = panelOf(P, M, gates);
  open(lessonA);
  await settle();
  assert.equal(view.result.panel.notReadyText, P.LESSON_LOADING_TEXT);
  assert.doesNotMatch(P.LESSON_LOADING_TEXT, /откройте/i);
  gates.GA.reject(new Error("сеть"));
  await settle();
  assert.equal(view.result.panel.notReadyText, P.LESSON_NOT_LOADED_TEXT);
  assert.match(P.LESSON_NOT_LOADED_TEXT, /откройте урок снова/);
  assert.equal(view.result.panel.target(lessonA), null);
});

test("[R3-7] the guard of another answer about the lesson (the exam binding) dies with the run of the journal read, also A -> B -> A", async () => {
  const P = loadLib("lesson-panel-data");
  const M = loadLib("use-lesson-marks-ops");
  const gates = makeGates();
  const { view, open } = panelOf(P, M, gates);
  open(lessonA);
  await settle();
  const aliveFirstA = view.result.panel.alive(); // the binding of the first A is asked
  open(lessonB);
  await settle();
  assert.equal(aliveFirstA(), false, "B was opened: the answer is dropped");
  open(lessonA);
  await settle();
  const aliveSecondA = view.result.panel.alive();
  assert.equal(aliveFirstA(), false, "the same lesson again is a NEW run: the old answer is still dropped");
  assert.equal(aliveSecondA(), true);
  open(null);
  await settle();
  assert.equal(aliveSecondA(), false, "closed");
});

test("[mutation R3] a guard that is always true lets the binding of the first A into the second A", async () => {
  const mutant = loadLib("lesson-panel-data", (source) => {
    assert.match(source, /return \(\) => sequence\.isCurrent\(token\);/);
    return source.replace("return () => sequence.isCurrent(token);", "return () => true;");
  });
  const M = loadLib("use-lesson-marks-ops");
  const scenario = async (P) => {
    const gates = makeGates();
    const { view, open } = panelOf(P, M, gates);
    open(lessonA);
    await settle();
    const first = view.result.panel.alive();
    open(lessonB);
    await settle();
    open(lessonA);
    await settle();
    assert.equal(first(), false);
  };
  await scenario(loadLib("lesson-panel-data"));
  await assert.rejects(scenario(mutant), assert.AssertionError);
});

// ── R3-3, R3-6: the roster of a substitute is the roster of THIS lesson, and every roster is in one order ────────────────────
test("[R3-3] a substitute with one of two lessons of a group in a day: the roster is the frozen roster of THIS lesson, not the union of the day", () => {
  const P = loadLib("lesson-panel-data");
  const journal = {
    lessonRoster: [
      { id: "s1", first_name: "Али", last_name: "Валиев", full_name: "Валиев Али" },
      { id: "s2", first_name: "Дина", last_name: "Юсупова", full_name: "Юсупова Дина" },
      { id: "s3", first_name: "Бека", last_name: "Аминов", full_name: "Аминов Бека" }, // joined between the two lessons: only in the second
    ],
    rosterStudentIds: { [keyOf(lessonA)]: ["s1", "s2"], [keyOf(lessonB)]: ["s1", "s2", "s3"] },
  };
  const roster = (lesson) => P.buildLessonRoster({ source: "journal", lessonKey: keyOf(lesson), isToday: true, group: null, journal }).map((s) => s.id);
  assert.deepEqual(roster(lessonA), ["s1", "s2"]);
  assert.deepEqual(roster(lessonB), ["s3", "s1", "s2"], "the second lesson has all three (by last name)");
  assert.deepEqual(P.buildLessonRoster({ source: "journal", lessonKey: "no-such", isToday: true, group: null, journal }).map((s) => s.id), ["s3", "s1", "s2"], "not frozen yet: the roster of the journal");
});

test("[R3-6] the frozen roster is by last name and first name (not by the id of the server); the current group is in the same order", () => {
  const P = loadLib("lesson-panel-data");
  const key = keyOf(lessonA);
  const named = (id, last, first) => ({ ...student(id, first), last_name: last, first_name: first, full_name: `${last} ${first}` });
  const group = { students: [named("z-3", "Юсупов", "Али"), named("a-1", "Каримов", "Бобур"), named("m-2", "Каримов", "Азиз"), named("k-9", "Алиев", "Тимур")] };
  const frozenIds = ["z-3", "a-1", "m-2", "k-9", "gone"]; // by id, the way the server keeps it
  const journal = { rosterStudentIds: { [key]: frozenIds }, historicalStudents: [{ id: "gone", first_name: "Анвар", last_name: "Бекметов", full_name: "Бекметов Анвар" }] };
  const frozen = P.buildLessonRoster({ source: "group", lessonKey: key, isToday: false, group, journal });
  assert.deepEqual(frozen.map((s) => s.id), ["k-9", "gone", "m-2", "a-1", "z-3"]);
  const current = P.buildLessonRoster({ source: "group", lessonKey: key, isToday: false, group, journal: {} });
  assert.deepEqual(current.map((s) => s.id), ["k-9", "m-2", "a-1", "z-3"]);
});
