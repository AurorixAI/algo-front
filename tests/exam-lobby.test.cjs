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
const { examHasLobby, isNoLobbyConflict, nextLobbyPollDelay, LOBBY_POLL_MS, LOBBY_POLL_MAX_MS } = require(path.join(__dirname, "../src/lib/exam-lobby.ts"));

test("a printed exam has no lobby; unknown (not loaded) exam is not asked either", () => {
  assert.equal(examHasLobby({ delivery_mode: "print" }), false);
  assert.equal(examHasLobby({ delivery_mode: "online" }), true);
  assert.equal(examHasLobby({}), true);
  assert.equal(examHasLobby({ delivery_mode: null }), true);
  assert.equal(examHasLobby(null), false);
  assert.equal(examHasLobby(undefined), false);
});

test("409 from the lobby endpoint is «no lobby»; other failures are not", () => {
  class FakeApiError extends Error { constructor(status) { super("x"); this.status = status; } }
  assert.equal(isNoLobbyConflict(new FakeApiError(409)), true);
  for (const err of [new FakeApiError(0), new FakeApiError(403), new FakeApiError(500), new Error("plain"), null, undefined, "409"]) {
    assert.equal(isNoLobbyConflict(err), false);
  }
});

test("pages ask for the lobby only after the exam data says it has one", () => {
  const admin = fs.readFileSync(path.join(__dirname, "../src/app/admin/exams/[id]/page.tsx"), "utf8");
  const teacher = fs.readFileSync(path.join(__dirname, "../src/app/teacher/exams/[id]/page.tsx"), "utf8");
  assert.ok(!/Promise\.all\(\[\s*examsApi\.getAdminView\(examId\),\s*examsApi\.getLobbyStatus/.test(admin), "admin: lobby is not fired in parallel with the view");
  assert.ok(/examHasLobby\(view\)\s*\?\s*await examsApi\.getLobbyStatus/.test(admin), "admin: initial load gated on the view");
  assert.ok(/hasLobby\s*\?\s*examsApi\.getLobbyStatus/.test(admin), "admin: polling gated");
  assert.ok(/!examHasLobby\(exam\)/.test(teacher), "teacher: polling gated on a loaded exam with a lobby");
  assert.ok(/isNoLobbyConflict\(err\)[\s\S]{0,400}delivery_mode: "print"/.test(teacher), "teacher: a 409 switches the exam to print mode in state");
  assert.ok(/setLobbyConflict\(false\)/.test(admin), "admin: the conflict flag is reset when the data is loaded again");
});

test("lobby poll pace: a transient failure doubles the wait up to 30 s, the first success resets it, other errors keep it", () => {
  assert.equal(LOBBY_POLL_MS, 2500);
  assert.equal(LOBBY_POLL_MAX_MS, 30000);
  let delay = LOBBY_POLL_MS;
  const seen = [];
  for (let i = 0; i < 7; i++) { delay = nextLobbyPollDelay(delay, "transient"); seen.push(delay); }
  assert.deepEqual(seen, [5000, 10000, 20000, 30000, 30000, 30000, 30000]);
  assert.equal(nextLobbyPollDelay(30000, "ok"), 2500);
  assert.equal(nextLobbyPollDelay(10000, "error"), 10000);
  assert.equal(nextLobbyPollDelay(2500, "error"), 2500);
  // never below the normal pace, whatever came in
  assert.equal(nextLobbyPollDelay(0, "transient"), 5000);
});

test("the exam page polls the lobby with the backoff (no fixed 2.5 s interval) and shows a refused PDF download", () => {
  const page = fs.readFileSync(path.join(__dirname, "../src/app/teacher/exams/[id]/page.tsx"), "utf8");
  const poll = page.slice(page.indexOf("Live Polling for Lobby"), page.indexOf("Local 1-second Countdown Ticker"));
  assert.match(poll, /outcome = isTransientApiError\(err\) \? "transient" : "error";/);
  assert.match(poll, /delay = nextLobbyPollDelay\(delay, outcome\);\s*timer = setTimeout\(pollStatus, delay\);/);
  assert.doesNotMatch(poll, /setInterval/);
  assert.match(poll, /stopped = true;\s*if \(timer\) clearTimeout\(timer\);/);
  // both PDF buttons go through the helper whose rejection becomes a toast with the error's own message
  assert.match(page, /download\(\)\.catch\(\(err: unknown\) => \{\s*showToast\(err instanceof Error && err\.message \?/);
  assert.match(page, /runPrintDownload\(\(\) => examsApi\.downloadStudentPrintPdf\(examId, 1\)\)/);
  assert.match(page, /runPrintDownload\(\(\) => examsApi\.downloadTeacherPrintKey\(examId, 1\)\)/);
  assert.doesNotMatch(page, /onClick=\{\(\) => examsApi\.download/);
  assert.match(page, /\{toastNode\}/);
});
