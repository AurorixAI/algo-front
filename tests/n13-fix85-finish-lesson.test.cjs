// N13 carry-over #85: «Завершить урок» follows the clock while the lesson panel is open.
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
/** The text between two markers of a source file (the marker lines included). */
const between = (text, from, to) => {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `marker not found: ${from}`);
  const end = text.indexOf(to, start);
  assert.ok(end > start, `end marker not found: ${to}`);
  return text.slice(start, end + to.length);
};

const { canFinishLessonNow, clockMinutes, FINISH_LEAD_MINUTES } = require(src("lib/lesson-actions.ts"));

// ---- #85 «Завершить урок» follows the clock ------------------------------------------------------

const at = (h, m) => h * 60 + m;
const lesson = (over = {}) => ({
  status: "in_progress", startTime: "09:20", endTime: "09:40", occurrenceDate: "2026-10-16", businessDate: "2026-10-16", nowMinutes: at(9, 30), ...over,
});

test("the rule: from the start and no earlier than 15 minutes before the end, and for good after the end", () => {
  assert.equal(FINISH_LEAD_MINUTES, 15);
  assert.equal(clockMinutes("09:40"), 580);
  assert.equal(clockMinutes(undefined), 0);
  assert.equal(canFinishLessonNow(lesson({ nowMinutes: at(9, 24) })), false); // 16 minutes before the end
  assert.equal(canFinishLessonNow(lesson({ nowMinutes: at(9, 25) })), true);  // exactly 15 minutes before
  assert.equal(canFinishLessonNow(lesson({ nowMinutes: at(9, 39) })), true);
  assert.equal(canFinishLessonNow(lesson({ nowMinutes: at(9, 40) })), true);
  assert.equal(canFinishLessonNow(lesson({ nowMinutes: at(13, 0) })), true);  // anytime after the end
  // a short lesson: the window may open before the lesson starts - the start still gates it
  assert.equal(canFinishLessonNow(lesson({ startTime: "09:30", endTime: "09:40", nowMinutes: at(9, 26) })), false);
  assert.equal(canFinishLessonNow(lesson({ startTime: "09:30", endTime: "09:40", nowMinutes: at(9, 30) })), true);
});

test("only a lesson in progress, on its day: earlier day always, later day never, wrong weekday never", () => {
  for (const status of ["scheduled", "completed", "cancelled", null, undefined]) {
    assert.equal(canFinishLessonNow(lesson({ status, nowMinutes: at(9, 39) })), false, String(status));
  }
  assert.equal(canFinishLessonNow(lesson({ endTime: "", nowMinutes: at(9, 39) })), false);
  assert.equal(canFinishLessonNow(lesson({ occurrenceDate: "2026-10-15", nowMinutes: at(8, 0) })), true);  // yesterday's open lesson
  assert.equal(canFinishLessonNow(lesson({ occurrenceDate: "2026-10-17", nowMinutes: at(9, 39) })), false); // tomorrow's
  assert.equal(canFinishLessonNow(lesson({ isTodayWeekday: false, nowMinutes: at(9, 39) })), false);
  assert.equal(canFinishLessonNow(lesson({ isTodayWeekday: true, nowMinutes: at(9, 39) })), true);
  assert.equal(canFinishLessonNow(lesson({ occurrenceDate: undefined, isTodayWeekday: true, nowMinutes: at(9, 39) })), true); // the dashboard slot
});

test("the bug: a panel open BEFORE the window gets the button as the clock moves, with no reopen", () => {
  const minutesAtOpen = at(9, 10);
  assert.equal(canFinishLessonNow(lesson({ nowMinutes: minutesAtOpen })), false);
  // the same open panel, re-evaluated on three later ticks of the clock
  const later = [at(9, 20), at(9, 24), at(9, 25)].map((nowMinutes) => canFinishLessonNow(lesson({ nowMinutes })));
  assert.deepEqual(later, [false, false, true]);
});

/** useNow runs against a fake React (the real file, a stand-in for the two hooks) and fake timers. */
function loadUseNow() {
  const code = ts.transpileModule(fs.readFileSync(src("lib/use-now.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const world = { state: null, setCalls: [], effect: null, intervals: [], cleared: [], clock: 1_000 };
  const fakeReact = {
    useState(init) {
      if (world.state === null) world.state = { value: typeof init === "function" ? init() : init };
      return [world.state.value, (next) => { world.state.value = next; world.setCalls.push(next); }];
    },
    useEffect(fn, deps) { world.effect = { fn, deps }; },
  };
  const mod = { exports: {} };
  const fakeSetInterval = (fn, ms) => { const handle = { fn, ms, id: world.intervals.length + 1 }; world.intervals.push(handle); return handle; };
  const fakeClearInterval = (handle) => world.cleared.push(handle);
  const fakeDate = { now: () => world.clock };
  new Function("require", "module", "exports", "setInterval", "clearInterval", "Date", code)(
    (id) => (id === "react" ? fakeReact : require(id)), mod, mod.exports, fakeSetInterval, fakeClearInterval, fakeDate,
  );
  return { useNow: mod.exports.useNow, world };
}

test("useNow ticks every 30 s while enabled, re-reads the clock at once, and clears the timer on close", () => {
  const { useNow, world } = loadUseNow();
  assert.equal(useNow(30_000, true), 1_000);
  assert.deepEqual(world.effect.deps, [true, 30_000]);
  world.clock = 50_000;                      // the panel opens long after the page loaded
  const cleanup = world.effect.fn();
  assert.deepEqual(world.setCalls, [50_000], "the clock is re-read the moment it is enabled");
  assert.equal(world.intervals.length, 1);
  assert.equal(world.intervals[0].ms, 30_000);
  world.clock = 80_000;
  world.intervals[0].fn();                   // one tick
  world.clock = 110_000;
  world.intervals[0].fn();
  assert.deepEqual(world.setCalls, [50_000, 80_000, 110_000]);
  assert.equal(typeof cleanup, "function");
  cleanup();                                 // the panel closes / the page unmounts
  assert.deepEqual(world.cleared, [world.intervals[0]]);
});

test("useNow schedules nothing while disabled (no open panel, no timer)", () => {
  const { useNow, world } = loadUseNow();
  useNow(30_000, false);
  assert.deepEqual(world.effect.deps, [false, 30_000]);
  assert.equal(world.effect.fn(), undefined);
  assert.equal(world.intervals.length, 0);
  assert.equal(world.setCalls.length, 0);
});

test("both pages feed the rule from useNow while a panel is open, not from a value frozen at open", () => {
  const dashboard = read("app/teacher/dashboard/page.tsx");
  const dashboardMemo = between(dashboard, "const finishClock = useNow(30_000, Boolean(activeLesson));", "finishClock]);");
  assert.match(dashboardMemo, /canFinishLessonNow\(/);
  assert.match(dashboardMemo, /businessTimeMinutes\(new Date\(finishClock\)\)/);
  assert.doesNotMatch(dashboardMemo, /businessTimeMinutes\(\)/, "no clock read frozen inside the memo");

  const schedule = read("app/teacher/schedule/page.tsx");
  const scheduleMemo = between(schedule, "const canFinishLesson = useMemo(() => {", "panelClock]);");
  assert.match(schedule, /const panelClock = useNow\(30_000, Boolean\(activeLesson\)\)/);
  assert.match(scheduleMemo, /canFinishLessonNow\(/);
  assert.match(scheduleMemo, /businessTimeMinutes\(at\)/);
  // the one-hour reschedule cut-off moves with the same clock
  assert.match(between(schedule, "const canRescheduleToday = useMemo(() => {", "panelClock]);"), /businessTimeMinutes\(at\)/);
  assert.doesNotMatch(schedule, /businessTimeMinutes\(\) < startMinutes - 60/);
});
