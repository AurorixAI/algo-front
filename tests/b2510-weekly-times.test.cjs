// Пакет 25.10, final round: «today's start has gone» (every chosen day gets its weekly lesson; today's weekday starts a week later) and
// «Разное время по дням» (the shared add form of the owner / administrator / teacher).  The rule lives in ONE function (pastDayPlan).
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
const F = require(path.join(root, "src/lib/lesson-slot-form.ts"));
// the real api module is replaced by a recorder: the weekly-lesson helper is run against it (no network)
const apiPath = path.join(root, "src/lib/api.ts");
const calls = [];
require.cache[apiPath] = {
  id: apiPath, filename: apiPath, loaded: true,
  exports: { orgApi: { createLesson: async (body) => { calls.push(body); return { id: `l${body.dayOfWeek}` }; } } },
};
const W = require(path.join(root, "src/lib/weekly-lessons.ts"));

// Monday 26.10.2026, 11:00
const NOW = { today: "2026-10-26", todayDay: 1, nowMinutes: 11 * 60 };
const SHARED = { startTime: "10:00", endTime: "11:30" };
const plan = (o) => F.pastDayPlan({ scope: "recurring", validFrom: "", date: "", ...NOW, ...o });
const same = (days, time = SHARED) => F.dayTimesOf(days, time, null);
const DRAFT = { format: "offline", room: "", topic: "", color: "blue" };

test("[1] Mon + Wed + Fri, today Monday 11:00, start 10:00: three requests, Monday starts NEXT Monday, Wed and Fri today", async () => {
  const result = plan({ times: same([1, 3, 5]) });
  assert.deepEqual(result.slots.map((s) => [s.day, s.validFrom]), [[1, "2026-11-02"], [3, "2026-10-26"], [5, "2026-10-26"]]);
  assert.deepEqual(result.shifted, { day: 1, from: "2026-11-02" });
  calls.length = 0;
  const saved = await W.createWeeklyLessons("g1", result.slots, DRAFT);
  assert.equal(calls.length, 3, "every chosen day gets its weekly lesson - nothing is dropped");
  assert.deepEqual(calls.map((c) => [c.dayOfWeek, c.validFrom, c.startTime, c.endTime]), [
    [1, "2026-11-02", "10:00", "11:30"], [3, "2026-10-26", "10:00", "11:30"], [5, "2026-10-26", "10:00", "11:30"],
  ]);
  assert.deepEqual(saved.added, [1, 3, 5]);
  assert.deepEqual(saved.failed, []);
});

test("[1] a later start, an explicit later «Действует с», an explicit today and the other weekdays: no shift", () => {
  assert.equal(plan({ times: same([1, 3, 5], { startTime: "12:00", endTime: "13:30" }) }).shifted, null, "a later start");
  assert.equal(plan({ times: same([1, 3, 5], { startTime: "11:00", endTime: "12:30" }) }).shifted, null, "the start is now, not gone");
  const future = plan({ times: same([1, 3, 5]), validFrom: "2026-11-02" });
  assert.equal(future.shifted, null, "«Действует с» in the future");
  assert.ok(future.slots.every((s) => s.validFrom === "2026-11-02"));
  const explicit = plan({ times: same([1]), validFrom: "2026-10-26" });
  assert.deepEqual(explicit.shifted, { day: 1, from: "2026-11-02" }, "an explicit today is the same as blank");
  assert.equal(plan({ times: same([3, 5]) }).shifted, null, "today's weekday is not chosen");
  assert.deepEqual(plan({ times: same([1]) }).slots, [{ day: 1, startTime: "10:00", endTime: "11:30", validFrom: "2026-11-02" }], "Monday alone is shifted, not blocked");
});

test("[1] a one-off lesson of today in the past stays blocked; tomorrow and a later start are fine", () => {
  const oneOff = (o) => F.pastDayPlan({ scope: "one_off", times: [{ day: 0, ...SHARED }], validFrom: "", ...NOW, ...o });
  assert.match(oneOff({ date: "2026-10-26" }).pastOneOff, /прошедшее время/);
  assert.equal(oneOff({ date: "2026-10-27" }).pastOneOff, null);
  assert.equal(oneOff({ date: "2026-10-26", times: [{ day: 0, startTime: "15:00", endTime: "16:30" }] }).pastOneOff, null);
  assert.deepEqual(oneOff({ date: "2026-10-26" }).slots, [], "a one-off lesson has no weekly slots");
});

test("[1] the note names the weekday and the real date", () => {
  assert.equal(F.shiftedDayNote({ day: 1, from: "2026-11-02" }), "Пн: сегодняшний урок уже прошёл — понедельник начнётся с 2 ноября");
  assert.equal(F.shiftedDayNote({ day: 3, from: "2026-12-09" }), "Ср: сегодняшний урок уже прошёл — среда начнётся с 9 декабря");
  assert.equal(F.shiftedDayNote({ day: 7, from: "2027-01-10" }), "Вс: сегодняшний урок уже прошёл — воскресенье начнётся с 10 января");
  // the week boundaries: the date is always today + 7, whatever the day
  const sunday = F.pastDayPlan({ scope: "recurring", times: same([7]), validFrom: "", date: "", today: "2026-11-01", todayDay: 7, nowMinutes: 23 * 60 });
  assert.deepEqual(sunday.shifted, { day: 7, from: "2026-11-08" });
});

test("[1] a refusal of one day does not stop the others, and each day keeps its own validFrom", async () => {
  const api = require(apiPath).orgApi;
  const original = api.createLesson;
  api.createLesson = async (body) => {
    calls.push(body);
    if (body.dayOfWeek === 3) throw Object.assign(new Error("busy"), { status: 409, code: "TEACHER_BUSY", detail: { code: "TEACHER_BUSY", message: "x", conflicts: [], total: 0 } });
    return { id: `l${body.dayOfWeek}` };
  };
  calls.length = 0;
  const saved = await W.createWeeklyLessons("g1", plan({ times: same([1, 3, 5]) }).slots, DRAFT);
  api.createLesson = original;
  assert.deepEqual(saved.added, [1, 5]);
  assert.deepEqual(saved.failed.map((f) => [f.day, f.reason]), [[3, "преподаватель занят"]]);
  assert.equal(calls.length, 3);
});

test("[2] the toggle is for a weekly lesson on two days or more; the times of the days are one again with a single day", () => {
  assert.equal(F.canVaryTimes("recurring", [1]), false);
  assert.equal(F.canVaryTimes("recurring", [1, 3]), true);
  assert.equal(F.canVaryTimes("one_off", [1, 3]), false);
  const seeded = F.seedDayTimes([1, 3], SHARED);
  assert.deepEqual(seeded, { 1: SHARED, 3: SHARED });
  const typed = { 1: { startTime: "09:00", endTime: "10:30" }, 3: { startTime: "14:00", endTime: "15:30" } };
  assert.deepEqual(F.reconcileDayTimes([1, 3], typed, SHARED), { perDay: typed, shared: SHARED }, "two days: nothing changes");
  assert.deepEqual(F.reconcileDayTimes([3], typed, SHARED), { perDay: null, shared: typed[3] }, "one day left: its own time becomes THE time");
  assert.deepEqual(F.reconcileDayTimes([], typed, SHARED), { perDay: null, shared: SHARED });
  assert.deepEqual(F.reconcileDayTimes([1], null, SHARED), { perDay: null, shared: SHARED }, "the toggle was off: nothing changes");
  // a day added after the toggle was switched on takes the shared time until it gets its own
  assert.deepEqual(F.dayTimesOf([5, 1], SHARED, { 1: typed[1] }), [{ day: 1, ...typed[1] }, { day: 5, ...SHARED }]);
});

test("[2] the toggle off: every day has the one time (identical to the old behaviour)", async () => {
  const times = same([5, 1, 3], { startTime: "15:00", endTime: "16:30" });
  assert.deepEqual(times.map((t) => [t.day, t.startTime, t.endTime]), [[1, "15:00", "16:30"], [3, "15:00", "16:30"], [5, "15:00", "16:30"]]);
  calls.length = 0;
  await W.createWeeklyLessons("g1", plan({ times, validFrom: "2026-11-02" }).slots, DRAFT);
  assert.deepEqual(calls.map((c) => [c.dayOfWeek, c.startTime, c.endTime, c.validFrom]), [[1, "15:00", "16:30", "2026-11-02"], [3, "15:00", "16:30", "2026-11-02"], [5, "15:00", "16:30", "2026-11-02"]]);
});

test("[2] each day goes with its own time (room, format, topic, colour are shared)", async () => {
  const perDay = { 1: { startTime: "09:00", endTime: "10:30" }, 3: { startTime: "14:00", endTime: "15:30" } };
  calls.length = 0;
  await W.createWeeklyLessons("g1", plan({ times: F.dayTimesOf([3, 1], SHARED, perDay), validFrom: "2026-11-02" }).slots, { format: "online", room: " 12 ", topic: " Тема ", color: "rose" });
  assert.deepEqual(calls.map((c) => [c.dayOfWeek, c.startTime, c.endTime]), [[1, "09:00", "10:30"], [3, "14:00", "15:30"]]);
  assert.ok(calls.every((c) => c.format === "online" && c.room === "12" && c.topic === "Тема" && c.color === "rose" && c.subject === "Математика"));
});

test("[2] after a partial save only the refused days stay chosen, each keeps ITS OWN time (a retry sends the same per-day times)", async () => {
  const own = { 1: { startTime: "15:00", endTime: "16:30" }, 3: { startTime: "16:00", endTime: "17:30" }, 5: { startTime: "09:00", endTime: "10:30" } };
  // Fri was added; Mon and Wed were refused: the dialog sets the days to the refused ones
  const kept = F.reconcileDayTimes([1, 3], own, SHARED);
  assert.equal(kept.perDay, own, "two days left: the toggle stays on and nothing is touched");
  assert.deepEqual(F.dayTimesOf([1, 3], kept.shared, kept.perDay), [{ day: 1, ...own[1] }, { day: 3, ...own[3] }]);
  calls.length = 0;
  await W.createWeeklyLessons("g1", plan({ times: F.dayTimesOf([1, 3], kept.shared, kept.perDay), validFrom: "2026-11-02" }).slots, DRAFT);
  assert.deepEqual(calls.map((c) => [c.dayOfWeek, c.startTime, c.endTime]), [[1, "15:00", "16:30"], [3, "16:00", "17:30"]]);
  // only Wed is left: its own time becomes the one time of the form
  const one = F.reconcileDayTimes([3], own, SHARED);
  assert.equal(one.perDay, null);
  assert.deepEqual(one.shared, own[3]);
  // both screens set the days after a refusal through the same reconcile (not a bare setDays)
  const owner = read("src/components/schedule/weekly-lesson-dialogs.tsx"), teacher = read("src/app/teacher/schedule/page.tsx");
  assert.match(owner, /applyDays\(failed\.map\(\(item\) => item\.day\)\)/);
  assert.match(teacher, /applyAddDays\(failed\.map\(\(item\) => item\.day\)\)/);
});

test("[2] «время уже прошло» works per day: only today's weekday with a gone start moves, whatever the other days say", () => {
  // Monday 09:00 (gone at 11:00), Wednesday 09:00 (another day: fine)
  const a = plan({ times: F.dayTimesOf([1, 3], SHARED, { 1: { startTime: "09:00", endTime: "10:30" }, 3: { startTime: "09:00", endTime: "10:30" } }) });
  assert.deepEqual(a.slots.map((s) => [s.day, s.validFrom]), [[1, "2026-11-02"], [3, "2026-10-26"]]);
  // Monday 15:00 (later today), Wednesday 08:00: nothing moves
  const b = plan({ times: F.dayTimesOf([1, 3], SHARED, { 1: { startTime: "15:00", endTime: "16:30" }, 3: { startTime: "08:00", endTime: "09:30" } }) });
  assert.equal(b.shifted, null);
  assert.ok(b.slots.every((s) => s.validFrom === "2026-10-26"));
});

test("[2] validation per day: the end before the start names the weekday; the overlap check uses the time of each day", () => {
  assert.equal(F.dayTimeProblem(3, { startTime: "10:00", endTime: "09:00" }, true), "Ср: Окончание должно быть позже начала");
  assert.equal(F.dayTimeProblem(3, { startTime: "10:00", endTime: "09:00" }, false), "Окончание должно быть позже начала");
  assert.equal(F.dayTimeProblem(3, { startTime: "10:00", endTime: "11:00" }, true), null);
  const siblings = [
    { id: "a", dayOfWeek: 1, startTime: "10:00", endTime: "11:30" },
    { id: "b", dayOfWeek: 3, startTime: "14:00", endTime: "15:30" },
  ];
  const times = F.dayTimesOf([1, 3], SHARED, { 1: { startTime: "12:00", endTime: "13:00" }, 3: { startTime: "14:30", endTime: "16:00" } });
  const clashes = times.map((t) => [t.day, F.overlappingLesson(siblings, t.day, t.startTime, t.endTime)?.id ?? null]);
  assert.deepEqual(clashes, [[1, null], [3, "b"]], "Monday's time is free, Wednesday's clashes - the same shared time would have clashed on Monday");
  assert.equal(F.overlappingLesson(siblings, 1, SHARED.startTime, SHARED.endTime)?.id, "a");
});

test("[2] the form: the toggle only for two days or more; switched on, one row per day under the chips; off, the single pair as always", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { LessonSlotFields } = require(path.join(root, "src/components/schedule/lesson-slot-fields.tsx"));
  const value = { ...SHARED, format: "offline", room: "", topic: "", color: "blue" };
  const html = (perDay) => renderToStaticMarkup(React.createElement(LessonSlotFields, { idPrefix: "weekly-add", value, onChange() {}, perDay }));
  const none = html(undefined);                                                                     // a one-off lesson / the edit dialog: no toggle
  assert.doesNotMatch(none, /Разное время по дням/);
  assert.match(none, /id="weekly-add-nachalo"/);
  assert.doesNotMatch(html({ days: [1], times: null, onTimes() {} }), /Разное время по дням/, "one day: no toggle");
  assert.doesNotMatch(html({ days: [], times: null, onTimes() {} }), /Разное время по дням/);
  const off = html({ days: [1, 3], times: null, onTimes() {} });
  assert.match(off, /Разное время по дням/);
  assert.match(off, /id="weekly-add-nachalo"/, "off: the single pair");
  assert.doesNotMatch(off, /weekly-add-day-times/);
  const on = html({ days: [3, 1], times: F.seedDayTimes([1, 3], SHARED), onTimes() {} });
  assert.match(on, /data-testid="weekly-add-day-times"/);
  assert.match(on, /id="weekly-add-nachalo-1"/);
  assert.match(on, /id="weekly-add-okonchanie-3"/);
  assert.doesNotMatch(on, /id="weekly-add-nachalo"/, "on: the single pair is replaced by the rows");
  assert.ok(on.indexOf('weekly-add-day-time-1') < on.indexOf('weekly-add-day-time-3'), "the order of the week");
  assert.match(on, /aria-label="Понедельник: начало"/);
  const rows = on.match(/grid-cols-\[2rem_1fr_1fr\]/g) ?? [];
  assert.equal(rows.length, 2, "one row per chosen day");
});

test("wiring: the owner's dialog and the teacher's page use the same rule, the same note and the same fields", () => {
  const owner = read("src/components/schedule/weekly-lesson-dialogs.tsx"), teacher = read("src/app/teacher/schedule/page.tsx");
  for (const src of [owner, teacher]) {
    assert.match(src, /pastDayPlan\(\{/, "one rule");
    assert.match(src, /<ShiftedDayNote shifted=/, "one note");
    assert.match(src, /perDay=\{/, "one «Разное время по дням»");
    assert.match(src, /dayTimesOf\(/);
    assert.match(src, /reconcileDayTimes\(/);
    assert.doesNotMatch(src, /sendDays|allPast|pastDays/, "no day is dropped any more");
  }
  assert.match(owner, /createWeeklyLessons\(group\.id, slots, value\)/);
  assert.match(teacher, /createWeeklyLessons\(groupId, addPastPlan\.slots, draft\)/);
  assert.match(read("src/components/schedule/lesson-slot-fields.tsx"), /data-testid="add-past-day-note"/);
});
