// WC-C / F-A13: the teacher's schedule — one attendance request per group, and the live-summary poll only for a visible tab.
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
const { groupIdsOfLessons, attendanceMapsOfToday } = require(path.join(__dirname, "../src/lib/schedule-attendance.ts"));
const { startVisiblePolling } = require(path.join(__dirname, "../src/lib/visible-polling.ts"));

const TODAY = "2026-11-03";

/** The former reading: one request PER LESSON (copied from the page before the change). */
async function formerMaps(lessons, getGroupAttendance) {
  const attMap = {}, compMap = {}, statusMap = {};
  await Promise.all(lessons.map(async (les) => {
    if (!les || !les.groupId) return;
    const att = await getGroupAttendance(les.groupId, { dateFrom: TODAY, dateTo: TODAY });
    const lessonKey = `${TODAY}_${les.id}`;
    if (att?.records) {
      const rec = att.records[lessonKey];
      if (rec && Object.keys(rec).length > 0) attMap[les.id] = true;
    }
    if (att?.statuses) {
      const st = att.statuses[lessonKey];
      if (st) statusMap[les.id] = st;
      if (st === "completed") compMap[les.id] = true;
      else if (st === "in_progress") compMap[les.id] = false;
    }
  }));
  return { attMap, compMap, statusMap };
}

/** The new reading with the same fake API. */
async function newMaps(lessons, getGroupAttendance) {
  const byGroup = new Map();
  await Promise.all(groupIdsOfLessons(lessons).map(async (groupId) => {
    byGroup.set(groupId, await getGroupAttendance(groupId, { dateFrom: TODAY, dateTo: TODAY }));
  }));
  return attendanceMapsOfToday(lessons, TODAY, (groupId) => byGroup.get(groupId));
}

function fakeApi() {
  const journals = {
    g1: { records: { [`${TODAY}_a`]: { s1: "present" }, [`${TODAY}_b`]: {} }, statuses: { [`${TODAY}_a`]: "completed", [`${TODAY}_b`]: "in_progress" } },
    g2: { records: {}, statuses: { [`${TODAY}_c`]: "scheduled", [`${TODAY}_d`]: "cancelled" } },
    g3: { records: { [`${TODAY}_e`]: { s9: "absent" } }, statuses: {} },
    g4: null,
    g5: {},
  };
  const calls = [];
  return { calls, get: async (groupId, period) => { calls.push(groupId); assert.deepEqual(period, { dateFrom: TODAY, dateTo: TODAY }); return journals[groupId]; } };
}

const LESSONS = [
  { id: "a", groupId: "g1" }, { id: "b", groupId: "g1" }, { id: "c", groupId: "g2" }, { id: "d", groupId: "g2" },
  { id: "e", groupId: "g3" }, { id: "f", groupId: "g4" }, { id: "g", groupId: "g5" }, { id: "h", groupId: null }, null,
];

test("the maps are the same as the per-lesson reading; the requests: per lesson -> per group", async () => {
  const before = fakeApi();
  const former = await formerMaps(LESSONS, before.get);
  const after = fakeApi();
  const now = await newMaps(LESSONS, after.get);
  assert.deepEqual(now, former, "same attMap / compMap / statusMap");
  // spot check of the meaning
  assert.deepEqual(now.attMap, { a: true, e: true });
  assert.deepEqual(now.compMap, { a: true, b: false });
  assert.equal(now.statusMap.d, "cancelled");
  assert.equal(before.calls.length, 7);
  assert.equal(after.calls.length, 5);
  assert.deepEqual([...new Set(after.calls)].sort(), [...after.calls].sort(), "no group twice");
});

test("a teacher with six lessons of one group: 6 requests -> 1", async () => {
  const lessons = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, groupId: "g1" }));
  const before = fakeApi(), after = fakeApi();
  const former = await formerMaps(lessons, before.get);
  const now = await newMaps(lessons, after.get);
  assert.deepEqual(now, former);
  assert.equal(before.calls.length, 6);
  assert.equal(after.calls.length, 1);
});

test("groups are asked once each, in the order of the first lesson; no group, no request", () => {
  assert.deepEqual(groupIdsOfLessons(LESSONS), ["g1", "g2", "g3", "g4", "g5"]);
  assert.deepEqual(groupIdsOfLessons([]), []);
  assert.deepEqual(groupIdsOfLessons([null, undefined, { id: "x", groupId: "" }]), []);
});

test("a failed journal of one group fails the whole load (atomic snapshot, as before)", async () => {
  const get = async (groupId) => { if (groupId === "g2") throw new Error("503"); return {}; };
  await assert.rejects(() => newMaps(LESSONS, get), /503/);
  await assert.rejects(() => formerMaps(LESSONS, get), /503/);
});

function fakeVisible() {
  let visible = true;
  let every = null;
  const listeners = new Set();
  let runs = 0;
  const env = {
    setEvery: (run) => { every = run; return 1; },
    clearEvery: () => { every = null; },
    isVisible: () => visible,
    onVisibilityChange: (run) => { listeners.add(run); return () => listeners.delete(run); },
  };
  return {
    env,
    tick: () => { if (every) every(); },
    hide: () => { visible = false; for (const fn of [...listeners]) fn(); },
    show: () => { visible = true; for (const fn of [...listeners]) fn(); },
    count: () => runs,
    inc: () => { runs += 1; },
    armed: () => every !== null || listeners.size > 0,
  };
}

test("the poll skips a hidden tab, asks at once on return, and stops cleanly", () => {
  const f = fakeVisible();
  const stop = startVisiblePolling(() => f.inc(), 15_000, f.env);
  f.tick(); f.tick();
  assert.equal(f.count(), 2);
  f.hide();
  for (let i = 0; i < 40; i += 1) f.tick();   // 10 minutes of a forgotten tab: 40 ticks of 15 s
  assert.equal(f.count(), 2, "nothing asked in the background (before: 40 requests in 10 minutes)");
  f.show();
  assert.equal(f.count(), 3, "asked at once on return");
  stop();
  assert.equal(f.armed(), false);
  f.tick(); f.show();
  assert.equal(f.count(), 3);
});

test("the page uses both helpers and no longer asks the journal per lesson or polls unconditionally", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/app/teacher/schedule/page.tsx"), "utf8");
  assert.ok(/groupIdsOfLessons\(loadedTodayOccurrences\)/.test(src));
  assert.ok(/attendanceMapsOfToday\(loadedTodayOccurrences/.test(src));
  assert.ok(!/loadedTodayOccurrences\.map\(async/.test(src), "no request per lesson");
  assert.ok(/startVisiblePolling\(\(\) => \{ void refresh\(\); \}, 15_000, browserVisiblePollEnv\(\)\)/.test(src));
  assert.ok(!/setInterval\(\(\) => \{ void refresh\(\); \}, 15_000\)/.test(src), "no unconditional live-summary interval");
});
