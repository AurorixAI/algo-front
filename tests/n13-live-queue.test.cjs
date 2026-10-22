/**
 * Admin analytics «Живая очередь» follows what diagnostic-service /analytics/org/live-queue answers
 * (`completed`, `session_id`, `grade_level`, flat `theta`, naive-UTC `created_at` / `completed_at`),
 * not the shape the old page imagined (`recently_completed`, `student_name`, `started_at`, `result.theta`).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const queue = require(path.join(__dirname, "../src/lib/live-queue.ts"));
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/org-live-queue.json"), "utf8"));

test("the real response shape is read: active + completed, counts, period", () => {
  const view = queue.normalizeLiveQueue(fixture.ok);
  assert.equal(view.activeCount, 3);
  assert.equal(view.completedCount, 2);
  assert.equal(view.periodHours, 24);
  assert.deepEqual(view.active.map((row) => row.code), ["K7M2QX", "P4N8TZ", "R2D5WB"]);
  assert.deepEqual(view.completed.map((row) => row.code), ["H9V3LC", "B6Y1FJ"]);
  assert.deepEqual(view.active.map((row) => row.id), [
    "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333",
  ]);
});

test("grade, phase, answers and theta come from the fields that exist", () => {
  const view = queue.normalizeLiveQueue(fixture.ok);
  const [warmup, deep, nav] = view.active;
  assert.equal(warmup.classLevel, 7);
  assert.equal(warmup.phase, "разминка");
  assert.equal(deep.phase, "углублённая проверка");
  assert.equal(nav.phase, "поиск уровня");
  assert.equal(deep.itemsAnswered, 24);
  assert.equal(nav.itemsAnswered, 0);
  // θ of a running session is not a result: only a finished one shows it
  assert.equal(deep.theta, null);
  assert.equal(view.completed[0].theta, -0.4521);
  assert.equal(view.completed[1].theta, null);
  assert.equal(view.completed[0].phase, "");
  assert.equal(queue.liveQueueDetails(warmup), "7 кл. · разминка · 3 отв.");
  assert.equal(queue.liveQueueDetails(nav), "5 кл. · поиск уровня · 0 отв.");
  assert.equal(queue.liveQueueDetails(view.completed[0]), "8 кл. · 31 отв.");
});

test("times: running = creation, finished = completion, both naive UTC shown on the Tashkent clock", () => {
  const view = queue.normalizeLiveQueue(fixture.ok);
  assert.equal(view.active[0].time, "13:55"); // 08:55Z
  assert.equal(view.active[1].time, "23:59"); // 18:59Z, still the 16th in Tashkent
  assert.equal(view.active[2].time, ""); // no created_at: nothing invented
  assert.equal(view.completed[0].time, "12:52"); // completed_at 07:52Z, not created_at
  assert.equal(view.completed[1].time, "00:00"); // 19:00Z is already the next day in Tashkent
});

test("a missing started_at / student name / diagnostic type is simply not shown", () => {
  const view = queue.normalizeLiveQueue(fixture.ok);
  for (const row of [...view.active, ...view.completed]) {
    assert.deepEqual(Object.keys(row).sort(), ["classLevel", "code", "id", "itemsAnswered", "phase", "status", "theta", "time"]);
  }
});

test("the closed route (409 body) and junk are not a queue: the page shows «недоступна»", () => {
  assert.equal(queue.normalizeLiveQueue(fixture.closed), null);
  for (const junk of [null, undefined, "", 0, [], {}, { active: "x" }, "ok"]) {
    assert.equal(queue.normalizeLiveQueue(junk), null, JSON.stringify(junk));
  }
  assert.equal(queue.LIVE_QUEUE_UNAVAILABLE, "Живая очередь временно недоступна");
});

test("an empty queue is a queue; missing counts fall back to the list lengths; bad rows are dropped", () => {
  const empty = queue.normalizeLiveQueue({ period_hours: 6, active_count: 0, completed_count: 0, active: [], completed: [] });
  assert.deepEqual([empty.active.length, empty.completed.length, empty.periodHours], [0, 0, 6]);
  const sparse = queue.normalizeLiveQueue({
    active: [{ session_id: "s1", invite_code: "AAAAAA", phase: "weird", grade_level: "6", items_answered: "x" }, null, 5, {}],
    completed: [{ invite_code: "BBBBBB", completed_at: "garbage", theta: "0.5" }],
  });
  assert.equal(sparse.active.length, 1);
  assert.equal(sparse.activeCount, 1);
  assert.equal(sparse.completedCount, 1);
  assert.equal(sparse.periodHours, 24);
  assert.equal(sparse.active[0].classLevel, 6);
  assert.equal(sparse.active[0].phase, "");
  assert.equal(sparse.active[0].itemsAnswered, null);
  assert.equal(sparse.completed[0].id, "BBBBBB");
  assert.equal(sparse.completed[0].time, "");
  assert.equal(sparse.completed[0].theta, 0.5);
});

test("the fixture keys are exactly what the service handler writes (when the sibling repo is checked out)", (t) => {
  const router = path.join(__dirname, "../../diagnostic-service-sec/src/api/analytics_router.py");
  if (!fs.existsSync(router)) return t.skip("diagnostic-service-sec is not next to this checkout");
  const source = fs.readFileSync(router, "utf8");
  const handler = source.slice(source.indexOf('@router.get("/org/live-queue")'), source.indexOf('@router.get("/org/stats")'));
  const fmtStart = handler.indexOf("def _fmt");
  const envelopeStart = handler.indexOf("return {", handler.indexOf("return {", fmtStart) + 8); // 1st return = a row, 2nd = the answer
  const row = handler.slice(fmtStart, envelopeStart);
  const written = [...row.matchAll(/"([a-z_]+)":/g)].map((m) => m[1]).sort();
  assert.deepEqual(Object.keys(fixture.ok.active[0]).sort(), written);
  const envelope = handler.slice(envelopeStart);
  for (const key of ["period_hours", "active_count", "completed_count", "active", "completed"]) {
    assert.ok(envelope.includes(`"${key}"`), key);
    assert.ok(key in fixture.ok);
  }
  assert.equal("recently_completed" in fixture.ok, false);
});
