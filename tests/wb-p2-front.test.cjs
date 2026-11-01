// Wave B P2 (R3 #1): «Ответ не проверен» (503 ANSWER_NOT_CHECKED) must not trap a student on a question.
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
const root = path.join(__dirname, "..");
const N = require(path.join(root, "src/lib/diagnostic-not-checked.ts"));
const page = fs.readFileSync(path.join(root, "src/app/d/[code]/page.tsx"), "utf8");

const apiError = (code, message) => Object.assign(new Error(message), { status: 503, code });

test("only the server's ANSWER_NOT_CHECKED is «не проверен»; other errors and non-errors are not", () => {
  assert.equal(N.isAnswerNotChecked(apiError("ANSWER_NOT_CHECKED", "x")), true);
  for (const other of [apiError("ANSWER_FAILED", "x"), apiError("STATE_UNAVAILABLE", "x"), apiError(undefined, "x"), new Error("x"), null, undefined, "ANSWER_NOT_CHECKED", 503]) {
    assert.equal(N.isAnswerNotChecked(other), false);
  }
});

test("the student reads the server's own text; a missing or blank text falls back to a Russian one", () => {
  const server = "Не удалось проверить ответ: проверка сейчас занята. Ответ не засчитан как неверный. Отправьте его ещё раз.";
  assert.equal(N.notCheckedMessage(apiError("ANSWER_NOT_CHECKED", "Своё сообщение сервера")), "Своё сообщение сервера");
  assert.equal(N.notCheckedMessage(apiError("ANSWER_NOT_CHECKED", "   ")), N.NOT_CHECKED_FALLBACK);
  assert.equal(N.notCheckedMessage(null), N.NOT_CHECKED_FALLBACK);
  assert.equal(N.NOT_CHECKED_FALLBACK, server);
  assert.match(N.NOT_CHECKED_FALLBACK, /не засчитан как неверный/);
});

test("the skip button appears after two «не проверено» in a row on the SAME question, not after one", () => {
  let streak = N.NO_STREAK;
  assert.equal(N.canSkipQuestion(streak, "T1"), false);
  streak = N.addNotChecked(streak, "T1");
  assert.equal(N.canSkipQuestion(streak, "T1"), false);          // once: just try again
  streak = N.addNotChecked(streak, "T1");
  assert.equal(N.canSkipQuestion(streak, "T1"), true);           // twice: the way out
  streak = N.addNotChecked(streak, "T1");
  assert.equal(N.canSkipQuestion(streak, "T1"), true);
  assert.equal(N.SKIP_AFTER_NOT_CHECKED, 2);
});

test("a streak belongs to one question: another question starts again and shows no button", () => {
  let streak = N.addNotChecked(N.addNotChecked(N.NO_STREAK, "T1"), "T1");
  assert.equal(N.canSkipQuestion(streak, "T2"), false);          // the question changed: nothing to skip yet
  streak = N.addNotChecked(streak, "T2");
  assert.deepEqual(streak, { taskId: "T2", count: 1 });          // not 3
  assert.equal(N.canSkipQuestion(streak, "T2"), false);
  assert.equal(N.canSkipQuestion(streak, null), false);
  assert.equal(N.canSkipQuestion(streak, undefined), false);
  assert.equal(N.canSkipQuestion(N.NO_STREAK, ""), false);
});

test("«Пропустить вопрос» sends an IDK token the server grades without the checker", () => {
  assert.equal(N.SKIP_BUTTON_LABEL, "Пропустить вопрос");
  assert.equal(N.SKIP_ANSWER, "не знаю");
  // the same set of tokens as diagnostic-service/src/domain/answer_evaluator.py::_IDK_TOKENS
  assert.ok(["не знаю", "незнаю", "?", "skip", "idk", ""].includes(N.SKIP_ANSWER));
  assert.match(N.SKIP_HINT, /«не знаю»/);                        // honest: a skipped question counts as «не знаю»
});

test("the page wires it: the API text is shown, no re-check of the attempt, the button sends the skip answer, success resets", () => {
  assert.match(page, /isAnswerNotChecked\(err\)/);
  assert.match(page, /setSubmissionNotice\(notCheckedMessage\(err\)\)/);
  // the not-checked branch comes BEFORE the generic «resolve the attempt» branch and does not call checkInvite
  const branch = page.slice(page.indexOf("isAnswerNotChecked(err)"), page.indexOf("} else if (!(err instanceof ApiError) || err.status !== 403)"));
  assert.ok(branch.length > 0 && !branch.includes("checkInvite"));
  assert.match(page, /addNotChecked\(streak,/);
  assert.match(page, /canSkipQuestion\(notChecked, currentTask\.task_id\)/);
  assert.match(page, /onClick=\{\(\) => void handleSubmit\(SKIP_ANSWER\)\}/);
  assert.match(page, /\{SKIP_BUTTON_LABEL\}/);
  assert.match(page, /setNotChecked\(NO_STREAK\)/);               // a successful answer resets the streak
});
