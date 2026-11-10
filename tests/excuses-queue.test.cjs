// Release review 06.11 (the owner): the badge of «Пропуски» said «1», the tab «Ожидают (0)» was empty - the queue was read for ONE month, the badge counts every period.  The queue is a queue: every period, archived groups included,
// ONE number for the badge, the tab and the rows.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const root = path.join(__dirname, "..");
const P = require(path.join(root, "src/lib/excuses-pending.ts"));

const TODAY = "2026-11-10";
const ROWS = [
  { id: "oct", lesson_date: "2026-10-14", group: { id: "g1", name: "7-А" } },
  { id: "sep", lesson_date: "2026-09-20", group: { id: "g1", name: "7-А" } },
  { id: "nov", lesson_date: "2026-11-05", group: { id: "g1", name: "7-А" } },
  { id: "arch", lesson_date: "2026-10-02", group: { id: "g9", name: "5-Б", archived: true } },
];
// a server that answers like the real one: only the lessons of the asked window, at most 93 days
const server = async (window, limit, offset) => {
  assert.ok((Date.parse(window.to) - Date.parse(window.from)) / 86_400_000 + 1 <= 93, "the API takes at most 93 days");
  const inside = ROWS.filter((row) => row.lesson_date >= window.from && row.lesson_date <= window.to);
  return { items: inside.slice(offset, offset + limit), total: inside.length, pending_total: inside.length };
};

test("windows of the queue: ≤ 93 days each, they cover a year back and next month, no gap and no overlap", () => {
  const windows = P.pendingWindows(TODAY);
  assert.ok(windows.length >= 4);
  for (const w of windows) assert.ok((Date.parse(w.to) - Date.parse(w.from)) / 86_400_000 + 1 <= 93);
  assert.equal(windows[0].to, "2026-12-31", "the end of next month");
  for (let i = 1; i < windows.length; i += 1) assert.equal((Date.parse(windows[i - 1].from) - Date.parse(windows[i].to)) / 86_400_000, 1, "no gap between windows");
  assert.ok(windows[windows.length - 1].from <= "2025-11-03");
});

test("November is open, the excuse of OCTOBER (and of September, and of an archived group) is in the queue; the number is the number of rows", async () => {
  const queue = await P.loadPendingAcrossPeriods(TODAY, server);
  assert.deepEqual(queue.items.map((row) => row.id).sort(), ["arch", "nov", "oct", "sep"]);
  assert.equal(queue.pendingTotal, queue.items.length, "the tab «Ожидают (N)» and its rows are one number");
  assert.equal(queue.total, 4);
  assert.equal(queue.hidden, 0);
  assert.ok(queue.items.find((row) => row.id === "arch").group.archived, "the archived group's excuse is not dropped");
});

test("the page: the queue is read across periods, the month switch is only for the decided tabs, the tab number is the badge's, an archived group is marked", () => {
  const page = fs.readFileSync(path.join(root, "src/components/attendance/excuses-page.tsx"), "utf8");
  assert.match(page, /loadPendingAcrossPeriods<AttendanceExcuseItem>\(formatBusinessDate\(\)/);
  assert.match(page, /\{tab !== "pending" && \(\s*<div className="flex items-center rounded-xl border/, "the month navigator is hidden on «Ожидают»");
  assert.match(page, /Ожидают \(\$\{tab === "pending" \? pendingTotal : badgePending\}\)/);
  assert.match(page, /item\.group\.archived && <Tag testId="excuse-group-archived"[^>]*>группа в архиве<\/Tag>/);
  assert.doesNotMatch(page, /setPendingTotal\(data\.pending_total/, "a decided tab does not overwrite the queue's number with a month's");
});
