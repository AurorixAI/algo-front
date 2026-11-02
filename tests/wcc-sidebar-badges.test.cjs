// WC-C / PERF-1: the badges of the administrator's sidebar («Посещаемость», «Замены») are no longer asked on every change of page.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
const sidebar = read("src/components/layout/sidebar.tsx");

test("the first request of the badges depends on who looks, not on the page", () => {
  const m = sidebar.match(/useEffect\(\(\) => \{\s*if \(!showExcuses\) return;\s*void refreshExcuses\(\);\s*void refreshSubstitutions\(\);\s*\}, \[([^\]]*)\]\);/);
  assert.ok(m, "the opening effect is there");
  assert.ok(!/pathname/.test(m[1]), `deps: ${m[1]}`);
  assert.match(m[1], /showExcuses/);
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
