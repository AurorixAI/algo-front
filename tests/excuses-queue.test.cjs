// Release review (the owner): the badge of «Пропуски» said «1», the tab «Ожидают (0)» was empty - the queue was read for ONE month, the badge counts every period.  The contract of the server (money-v0):
// `GET …/attendance/excuses?status=pending` WITHOUT dates gives ALL the pending excuses with paging (by deadline, then lesson date, then id); `summary.pending_total` = the list's `pending_total` = the number of rows;
// archived groups are in; `group.archived` is in the row.  The client reads the pages whole, asks for NO dates, keeps the server's order, and says «группа в архиве».
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const root = path.join(__dirname, "..");
const P = require(path.join(root, "src/lib/excuses-pending.ts"));
const D = require(path.join(root, "src/lib/excuse-deadline.ts"));

const ROWS = [
  { id: "arch", lesson_date: "2026-10-02", group: { id: "g9", name: "5-Б", archived: true } },
  { id: "sep", lesson_date: "2026-09-20", group: { id: "g1", name: "7-А" } },
  { id: "oct", lesson_date: "2026-10-14", group: { id: "g1", name: "7-А" } },
  { id: "nov", lesson_date: "2026-11-05", group: { id: "g1", name: "7-А" } },
];
// a mock of the NEW server: no dates asked, every pending row of every month, paged
const calls = [];
const server = (limit, offset) => { calls.push({ limit, offset }); return Promise.resolve({ items: ROWS.slice(offset, offset + limit), total: ROWS.length, pending_total: ROWS.length }); };

test("November is open, the excuse of OCTOBER, of SEPTEMBER and of an ARCHIVED group are in the queue; the number is the number of rows", async () => {
  const queue = await P.loadAllPending(server);
  assert.deepEqual(queue.items.map((row) => row.id).sort(), ["arch", "nov", "oct", "sep"]);
  assert.equal(queue.pendingTotal, queue.items.length, "the tab «Ожидают (N)» and its rows are one number");
  assert.equal(queue.hidden, 0);
  assert.ok(queue.items.find((row) => row.id === "arch").group.archived, "an archived group's excuse is not dropped");
});

test("a long queue is read page by page and no row is lost or doubled", async () => {
  const many = Array.from({ length: 450 }, (_, i) => ({ id: `r${i}`, lesson_date: "2026-10-01", group: { id: "g", name: "x" } }));
  const queue = await P.loadAllPending((limit, offset) => Promise.resolve({ items: many.slice(offset, offset + limit), total: many.length, pending_total: many.length }));
  assert.equal(queue.items.length, 450);
  assert.equal(new Set(queue.items.map((row) => row.id)).size, 450);
});

test("the urgency sort of the screen is stable: equal deadlines keep the order of the server (deadline, then lesson date, then id)", () => {
  const same = [{ id: "a", lesson_date: "2026-09-01", deadline: null }, { id: "b", lesson_date: "2026-09-02", deadline: null }, { id: "c", lesson_date: "2026-09-03", deadline: null }];
  assert.deepEqual(D.sortExcusesByUrgency(same, "2026-11-10").map((row) => row.id), ["a", "b", "c"]);
});

test("the page: ONE undated request, the pages read whole, the month switch is only for the decided tabs, the tab number is the badge's, an archived group is marked", () => {
  const page = fs.readFileSync(path.join(root, "src/components/attendance/excuses-page.tsx"), "utf8");
  const branch = page.slice(page.indexOf('if (tab === "pending") {'), page.indexOf("const data = await orgApi.listAttendanceExcuses"));
  assert.match(branch, /loadAllPending<AttendanceExcuseItem>\(\(limit, offset\) => orgApi\.listAttendanceExcuses\(\{ \.\.\.undated, limit, offset \}\)\)/);
  assert.doesNotMatch(branch, /dateFrom: [^_]|dateTo: [^_]|pendingWindows|loadPendingAcrossPeriods/, "the queue is asked WITHOUT dates");
  assert.match(page, /\{tab !== "pending" && \(\s*<div className="flex items-center rounded-xl border/, "the month navigator is hidden on «Ожидают»");
  assert.match(page, /Ожидают \(\$\{tab === "pending" \? pendingTotal : badgePending\}\)/);
  assert.match(page, /item\.group\.archived && <Tag testId="excuse-group-archived"[^>]*>группа в архиве<\/Tag>/);
  assert.doesNotMatch(page, /setPendingTotal\(data\.pending_total/, "a decided tab does not overwrite the queue's number with a month's");
  assert.equal(P.pendingWindows, undefined, "the windows of 90 days are gone");
});
