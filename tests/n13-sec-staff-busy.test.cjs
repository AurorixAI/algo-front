// ROADMAP #95 R3 (F2): the exam service answers 503 + Retry-After when its staff capacity is used up (nothing was done);
// teacher screens ask again - a read twice, a change that cannot be doubled once - and a poll does not flash an error.
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
const busy = require(path.join(__dirname, "../src/lib/staff-busy.ts"));
const {
  POLL_FAILURES_BEFORE_NOTICE, STAFF_BUSY_MESSAGE, STAFF_READ_REPEATS, STAFF_WRITE_REPEATS,
  isRepeatableStaffWrite, isStaffWriteBusy, pollFailure, staffBusyDelayMs, staffBusyRepeats,
} = busy;

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const err = (status, message = "x", retryAfter) => Object.assign(new Error(message), { status, retryAfter });

test("a read is asked again twice on a 503, with or without Retry-After; other answers are not repeated", () => {
  assert.equal(STAFF_READ_REPEATS, 2);
  for (const retryAfter of [2, undefined]) assert.equal(staffBusyRepeats("GET", "/exams/live-summary", 503, retryAfter), 2);
  assert.equal(staffBusyRepeats("get", "/exams/E1/lobby-status", 503, 2), 2);
  for (const status of [200, 400, 401, 403, 404, 409, 422, 429, 500, 502, 504]) {
    assert.equal(staffBusyRepeats("GET", "/exams/live-summary", status, 2), 0, `GET ${status}`);
  }
});

test("a change is asked again once, only where a repeat cannot double it, and only on the server's own 503 + Retry-After", () => {
  assert.equal(STAFF_WRITE_REPEATS, 1);
  for (const action of ["publish", "open-lobby", "assign", "close", "start-live", "entry-limits/reset"]) {
    const endpoint = `/exams/EXAM_ab12cd34/${action}`;
    assert.equal(isRepeatableStaffWrite("POST", endpoint), true, endpoint);
    assert.equal(staffBusyRepeats("POST", endpoint, 503, 2), 1, endpoint);
    assert.equal(staffBusyRepeats("POST", endpoint, 503, undefined), 0, `${endpoint} without Retry-After`);
    for (const status of [409, 422, 429, 500, 502, 504]) assert.equal(staffBusyRepeats("POST", endpoint, status, 2), 0, `${endpoint} ${status}`);
  }
});

test("a change that is not idempotent is never repeated by the client", () => {
  for (const endpoint of [
    "/exams/generate",                    // creates an exam
    "/exams/E1/clone",                    // creates an exam
    "/exams/E1/pin",                      // a toggle
    "/exams/E1/restore",
    "/exams/E1/report?force=true",        // a model call
    "/exams/E1/draft/replace-task",
    "/exams/E1/print-package/prepare",
    "/exams/E1/delivery/cancel",
    "/exams/E1/publish/extra",            // only the exact routes
    "/exams/E1/xpublish",
    "/exams/E1/sessions/S1",
    "/admin/exams/E1/close",
  ]) {
    assert.equal(isRepeatableStaffWrite("POST", endpoint), false, endpoint);
    assert.equal(staffBusyRepeats("POST", endpoint, 503, 2), 0, endpoint);
  }
  // not the verb either: a DELETE/PUT/PATCH on a repeatable route is not repeated
  for (const verb of ["DELETE", "PUT", "PATCH"]) assert.equal(staffBusyRepeats(verb, "/exams/E1/close", 503, 2), 0, verb);
  assert.equal(staffBusyRepeats("DELETE", "/exams/E1?permanent=true", 503, 2), 0);
});

test("the wait is Retry-After kept between one and five seconds, two without it", () => {
  assert.equal(staffBusyDelayMs(2), 2000);
  assert.equal(staffBusyDelayMs(3), 3000);
  assert.equal(staffBusyDelayMs(0.2), 1000);
  assert.equal(staffBusyDelayMs(120), 5000);
  assert.equal(staffBusyDelayMs(undefined), 2000);
});

test("a change refused as busy is told to the teacher in one short line; reads and other failures keep the server's text", () => {
  assert.equal(STAFF_BUSY_MESSAGE, "Сервер занят — повторите через пару секунд");
  assert.equal(isStaffWriteBusy("POST", 503, 2), true);
  assert.equal(isStaffWriteBusy("DELETE", 503, 2), true);
  assert.equal(isStaffWriteBusy("POST", 503, undefined), false);
  assert.equal(isStaffWriteBusy("GET", 503, 2), false);
  assert.equal(isStaffWriteBusy("POST", 409, 2), false);
});

test("a poll stays quiet on the first busy failure once it has a verified state, speaks on the second, and at once for anything else", () => {
  assert.equal(POLL_FAILURES_BEFORE_NOTICE, 2);
  let verdict = pollFailure(err(503), 0);
  assert.deepEqual(verdict, { quiet: true, streak: 1 });
  verdict = pollFailure(err(503), verdict.streak);
  assert.deepEqual(verdict, { quiet: false, streak: 2 });
  for (const status of [502, 504]) assert.equal(pollFailure(err(status), 0).quiet, true);
  for (const other of [err(0), err(401), err(403), err(404), err(500), err(429), new Error("plain"), null]) {
    assert.deepEqual(pollFailure(other, 1), { quiet: false, streak: 0 });
  }
  // before the first success there is nothing verified to keep on screen: the failure is shown
  assert.deepEqual(pollFailure(err(503), 0, false), { quiet: false, streak: 1 });
});

// ── the real client, with a scripted fetch and a clock that does not wait ───────────────────────────────────────
const apiFile = path.join(__dirname, "../src/lib/api.ts");
delete require.cache[apiFile];
global.window = { location: { pathname: "/teacher/dashboard", search: "" } };
const { examsApi } = require(apiFile);

function script(answers) {
  const calls = [];
  const waits = [];
  let next = 0;
  global.fetch = async (url, init = {}) => {
    calls.push(`${init.method || "GET"} ${String(url).replace(/^.*\/api\/v1/, "")}`);
    const [status, headers = {}, body = {}] = answers[Math.min(next, answers.length - 1)];
    next += 1;
    return {
      ok: status < 300,
      status,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      json: async () => body,
    };
  };
  global.setTimeout = (fn, ms) => { waits.push(ms); fn(); return 0; };
  return { calls, waits };
}
const BUSY = [503, { "retry-after": "2" }, { detail: "Сервер сейчас обслуживает много запросов преподавателей." }];
const OK = (body = []) => [200, {}, body];

test.afterEach(() => { global.setTimeout = realSetTimeout; });
const realSetTimeout = global.setTimeout;

test("the dashboard read is repeated after Retry-After and the screen gets the answer of the repeat", async () => {
  const run = script([BUSY, BUSY, OK([{ exam_id: "E1" }])]);
  assert.deepEqual(await examsApi.getLiveDashboardSummary(), [{ exam_id: "E1" }]);
  assert.deepEqual(run.calls, Array(3).fill("GET /exams/live-summary"));
  assert.deepEqual(run.waits, [2000, 2000]);
});

test("a read that stays busy fails after three tries with the server's text and its Retry-After", async () => {
  const run = script([BUSY]);
  await assert.rejects(
    examsApi.getLiveDashboardSummary(),
    (e) => e.name === "ApiError" && e.status === 503 && e.retryAfter === 2 && e.message === BUSY[2].detail,
  );
  assert.equal(run.calls.length, 3);
  assert.deepEqual(run.waits, [2000, 2000]);
});

test("Retry-After above five seconds waits five; a 503 without it waits two", async () => {
  let run = script([[503, { "retry-after": "60" }, {}], OK()]);
  await examsApi.getLiveDashboardSummary();
  assert.deepEqual(run.waits, [5000]);
  run = script([[503, {}, { detail: "Не удалось проверить группу" }], OK()]);
  await examsApi.getLiveDashboardSummary();
  assert.deepEqual(run.waits, [2000]);
});

test("a read that fails otherwise is not repeated", async () => {
  for (const status of [400, 403, 404, 409, 429, 500, 502]) {
    const run = script([[status, { "retry-after": "2" }, { detail: "no" }]]);
    await assert.rejects(examsApi.getLiveDashboardSummary(), (e) => e.status === status);
    assert.equal(run.calls.length, 1, String(status));
    assert.deepEqual(run.waits, []);
  }
});

test("close, publish, assign, start: asked again once after a busy 503; the repeat's answer is used", async () => {
  const calls = {
    close: () => examsApi.close("E1"),
    publish: () => examsApi.publish("E1", { lesson_id: "L1", lesson_date: "2026-10-17" }),
    assign: () => examsApi.assign("E1", { group_id: "G1" }),
    startLive: () => examsApi.startLive("E1"),
    resetEntryLimits: () => examsApi.resetEntryLimits("E1"),
  };
  for (const [name, call] of Object.entries(calls)) {
    const run = script([BUSY, OK({ status: "ok" })]);
    assert.deepEqual(await call(), { status: "ok" }, name);
    assert.equal(run.calls.length, 2, name);
    assert.ok(run.calls.every((line) => line.startsWith("POST /exams/E1/")), name);
    assert.deepEqual(run.waits, [2000], name);
  }
});

test("a change that stays busy stops after the one repeat and says «Сервер занят»", async () => {
  const run = script([BUSY]);
  await assert.rejects(
    examsApi.close("E1"),
    (e) => e.status === 503 && e.message === STAFF_BUSY_MESSAGE && e.retryAfter === 2,
  );
  assert.deepEqual(run.calls, ["POST /exams/E1/close", "POST /exams/E1/close"]);
});

test("pin (a toggle) and clone (a new exam) are never repeated: one request, the short busy text", async () => {
  for (const call of [() => examsApi.pin("E1"), () => examsApi.clone("E1", { title: "Copy" })]) {
    const run = script([BUSY, OK({})]);
    await assert.rejects(call(), (e) => e.status === 503 && e.message === STAFF_BUSY_MESSAGE);
    assert.equal(run.calls.length, 1);
    assert.deepEqual(run.waits, []);
  }
});

test("a 503 of a change WITHOUT Retry-After is neither repeated nor reworded", async () => {
  const run = script([[503, {}, { detail: "Не удалось проверить занятие в расписании. Повторите попытку." }]]);
  await assert.rejects(examsApi.close("E1"), (e) => e.status === 503 && e.message === "Не удалось проверить занятие в расписании. Повторите попытку.");
  assert.equal(run.calls.length, 1);
});

test("an answer to a change that is not a 503 is handed on at once (a repeated close would be a 409 or a no-op anyway)", async () => {
  const run = script([[409, {}, { detail: "Завершить можно только запущенный экзамен" }]]);
  await assert.rejects(examsApi.close("E1"), (e) => e.status === 409 && e.message === "Завершить можно только запущенный экзамен");
  assert.equal(run.calls.length, 1);
});

test("the student calls are not touched here: the exam page repeats them itself", async () => {
  const run = script([BUSY, OK({})]);
  await assert.rejects(examsApi.startSession("ABC123", { student_id: "TE-001" }), (e) => e.status === 503 && e.retryAfter === 2);
  assert.equal(run.calls.length, 1);
});

test("the print PDF downloads of a teacher are reads too", () => {
  const api = read("src/lib/api.ts");
  assert.match(api, /await fetchExamStaff\(`\$\{EXAM_API_V1\}\$\{path\}`, \{ credentials: "include", cache: "no-store" \}, path\);/);
  assert.equal((api.match(/await fetchExamStaff\(`\$\{EXAM_API_V1\}\$\{path\}`/g) || []).length, 2);
});

test("the dashboard and the schedule keep the last verified live state on a busy server instead of an error banner", () => {
  const dashboard = read("src/app/teacher/dashboard/page.tsx");
  assert.match(dashboard, /const failure = pollFailure\(err, liveExamFailureStreak\.current, liveExamVerified\.current\);\s*liveExamFailureStreak\.current = failure\.streak;\s*if \(failure\.quiet\) return;/);
  const schedule = read("src/app/teacher/schedule/page.tsx");
  assert.match(schedule, /const failure = pollFailure\(error, failureStreak, verified\);\s*failureStreak = failure\.streak;\s*if \(!cancelled && \(!failure\.quiet \|\| isManualRetry\)\) setLiveExamError\(/);
  // the lobby poll was already quiet and backs off on a 503 (nextLobbyPollDelay), unchanged
  const lobby = read("src/app/teacher/exams/[id]/page.tsx");
  assert.match(lobby, /outcome = isTransientApiError\(err\) \? "transient" : "error";/);
});

test("the test is part of test:display", () => {
  assert.match(read("package.json"), /tests\/n13-sec-staff-busy\.test\.cjs/);
});
