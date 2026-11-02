// WC-C / PERF-1: the badges of the administrator's sidebar («Посещаемость», «Замены») are no longer asked on every change of page.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
const sidebar = read("src/components/layout/sidebar.tsx");

test("a change of page asks through the 30 s throttle, not directly", () => {
  const m = sidebar.match(/useEffect\(\(\) => \{\s*if \(!showExcuses\) return;\s*refreshBadgesOnPageChange\(\[useExcuseBadge, useSubstitutionBadge\], Date\.now\(\)\);\s*\}, \[([^\]]*)\]\);/);
  assert.ok(m, "the page-change effect is there");
  assert.match(m[1], /showExcuses/);
  assert.match(m[1], /pathname/);
});

test("the other refreshes stay: the tab coming back (focus, visibilitychange) and every 5 minutes, one request for the pair of events", () => {
  assert.ok(/addEventListener\("focus", refreshIfVisible\)/.test(sidebar));
  assert.ok(/addEventListener\("visibilitychange", refreshIfVisible\)/.test(sidebar));
  assert.ok(/window\.setInterval\(refreshIfVisible, 5 \* 60 \* 1000\)/.test(sidebar));
  assert.ok(/now - lastRun < 1000/.test(sidebar));
});

test("every action that changes a counter refreshes it itself (so a page change is not needed for it)", () => {
  assert.ok(/refresh\(true\)/.test(read("src/components/attendance/excuses-page.tsx")));
  assert.ok(/refresh\(true\)/.test(read("src/components/substitutions/substitutions-page.tsx")));
  assert.ok(/refresh\(true\)/.test(read("src/components/attendance/open-lessons-view.tsx")));
  assert.ok(/refresh\(true\)/.test(read("src/components/groups/group-attendance-journal.tsx")));
  // the pages that show the counters publish what they loaded
  assert.ok(/setSummary\(/.test(read("src/components/substitutions/substitutions-page.tsx")));
});

test("the guard of the stores stays (a second request within 1 s is not made)", () => {
  assert.ok(/const MIN_GAP_MS = 1000;/.test(read("src/lib/excuse-badge.ts")));
  assert.ok(/MIN_GAP_MS/.test(read("src/lib/substitution-badge.ts")));
});

// ── the throttle on a fake clock and the real stores (the API is replaced) ─────────────────────────────────────────────────────
const ts = require("typescript");
const Module = require("node:module");
require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const calls = { excuses: 0, substitutions: 0 };
let failing = false;
const fakeApi = {
  orgApi: { getAttendanceExcuseSummary: async () => { calls.excuses += 1; if (failing) throw new Error("503"); return { pending_total: 2, open_lessons_total: 1 }; } },
  substitutionsApi: { summary: async () => { calls.substitutions += 1; if (failing) throw new Error("503"); return { pendingTotal: 3, urgentTotal: 1, overdueTotal: 0 }; } },
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "./api") return fakeApi;
  return origLoad.call(this, request, ...rest);
};
const { useExcuseBadge } = require(path.join(__dirname, "../src/lib/excuse-badge.ts"));
const { useSubstitutionBadge } = require(path.join(__dirname, "../src/lib/substitution-badge.ts"));
const { refreshBadgesOnPageChange, isBadgeStale, BADGE_PAGE_CHANGE_MIN_AGE_MS } = require(path.join(__dirname, "../src/lib/badge-throttle.ts"));
const realNow = Date.now;
let clock = 0;
Date.now = () => clock;                       // LESSONS 76: no real clock
const stores = [useExcuseBadge, useSubstitutionBadge];
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
async function pageChangeAt(seconds) { clock = 1_000_000 + seconds * 1000; refreshBadgesOnPageChange(stores, Date.now()); await flush(); }
function fresh() { useExcuseBadge.getState().reset(); useSubstitutionBadge.getState().reset(); calls.excuses = 0; calls.substitutions = 0; failing = false; }

test("10 page changes in 60 s: 2 requests per badge (was 10)", async () => {
  fresh();
  for (let i = 0; i < 10; i += 1) await pageChangeAt(i * 6);          // 0, 6, ... 54 s
  assert.deepEqual(calls, { excuses: 2, substitutions: 2 }, "at 0 s and at 30 s");
  await pageChangeAt(60);
  assert.deepEqual(calls, { excuses: 3, substitutions: 3 }, "an 11th change at 60 s: 3 per badge at most");
});

test("a change of page 31 s after the last read asks; 29 s after does not", async () => {
  fresh();
  await pageChangeAt(0);
  await pageChangeAt(29);
  assert.equal(calls.excuses, 1);
  await pageChangeAt(31);
  assert.equal(calls.excuses, 2);
  assert.equal(calls.substitutions, 2);
  assert.equal(isBadgeStale(1_000_000, 1_000_000 + BADGE_PAGE_CHANGE_MIN_AGE_MS), true, "exactly 30 s is stale");
  assert.equal(isBadgeStale(1_000_000, 1_000_000 + BADGE_PAGE_CHANGE_MIN_AGE_MS - 1), false);
});

test("the throttle counts any successful read: an action's refresh(true) or the page's own number postpones the next one", async () => {
  fresh();
  await pageChangeAt(0);
  clock = 1_000_000 + 20_000;
  await useExcuseBadge.getState().refresh(true);                      // an action 20 s later
  useSubstitutionBadge.getState().setSummary({ pendingTotal: 1 });     // the page of substitutions published its number at 20 s
  await flush();
  const before = { ...calls };
  await pageChangeAt(45);                                              // 25 s after the last read: not stale
  assert.deepEqual(calls, before);
  await pageChangeAt(51);                                              // 31 s after
  assert.equal(calls.excuses, before.excuses + 1);
});

test("a failed read does not postpone anything: the next page change asks again", async () => {
  fresh();
  failing = true;
  await pageChangeAt(0);
  assert.deepEqual(calls, { excuses: 1, substitutions: 1 });
  await pageChangeAt(2);
  assert.deepEqual(calls, { excuses: 2, substitutions: 2 });
  failing = false;
  await pageChangeAt(4);
  await pageChangeAt(6);
  assert.deepEqual(calls, { excuses: 3, substitutions: 3 }, "the success at 4 s holds the next ones back");
});

test("sign-out/sign-in (reset) forgets the time: the next page change asks", async () => {
  fresh();
  await pageChangeAt(0);
  useExcuseBadge.getState().reset();
  useSubstitutionBadge.getState().reset();
  await pageChangeAt(5);
  assert.equal(calls.excuses, 2);
});

test("m5: the number the page of substitutions publishes with setWaiting is a successful read too", async () => {
  fresh();
  clock = 1_000_000;
  useSubstitutionBadge.getState().setWaiting(4);
  await flush();
  assert.equal(useSubstitutionBadge.getState().lastOkAt, 1_000_000);
  await pageChangeAt(10);
  assert.equal(calls.substitutions, 0, "10 s later a change of page does not ask for it again");
  assert.equal(calls.excuses, 1, "the other counter was never read: it asks");
});

test("restore the clock", () => { Date.now = realNow; Module._load = origLoad; });
