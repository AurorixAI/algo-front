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
const E = require(path.join(__dirname, "../src/lib/exam-history-error.ts"));

// Same shape as ApiError in src/lib/api.ts: an Error with a numeric `status`.
class FakeApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

test("HTTP 403 from exam-history is a non-retryable «no access» state", () => {
  const state = E.toExamHistoryError(new FakeApiError(403, "Forbidden"));
  assert.equal(state.retryable, false);
  assert.equal(state.title, "Нет доступа к истории экзаменов");
  assert.ok(!state.message.includes("Forbidden"), "the raw server text is not shown");
});

test("network failure, 5xx and unknown errors stay retryable with the generic title", () => {
  for (const err of [
    new FakeApiError(0, "Не удалось подключиться к сервису."),
    new FakeApiError(503, "Сервис временно недоступен."),
    new FakeApiError(500, "boom"),
    new Error("plain"),
  ]) {
    const state = E.toExamHistoryError(err);
    assert.equal(state.retryable, true, err.message);
    assert.equal(state.title, "Не удалось загрузить экзамены");
    assert.equal(state.message, err.message);
  }
  const unknown = E.toExamHistoryError("oops");
  assert.equal(unknown.retryable, true);
  assert.ok(unknown.message.length > 0);
});

test("other 4xx (404, 401) are not mistaken for «no access»", () => {
  for (const status of [401, 404, 422]) {
    assert.equal(E.toExamHistoryError(new FakeApiError(status, "x")).retryable, true);
  }
});
