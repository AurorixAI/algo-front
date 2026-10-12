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
const { examHasLobby, isNoLobbyConflict } = require(path.join(__dirname, "../src/lib/exam-lobby.ts"));

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
});
