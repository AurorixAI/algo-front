// ROADMAP #95 R3 (F4): a busy server (503 + Retry-After) is repeated by the page, not shown as a broken exam.
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
const retry = require(path.join(__dirname, "../src/lib/exam-retry.ts"));
const {
  BUSY_MESSAGE, RETRY_ATTEMPTS, SAVING_RETRY_MESSAGE, START_RETRY_MESSAGE,
  isTransientServerError, retryDelayMs, transientFailureMessage, withTransientRetry,
} = retry;

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const err = (status, message = "x", retryAfter) => Object.assign(new Error(message), { status, retryAfter });

test("only a busy or briefly unreachable server is repeated", () => {
  for (const status of [503, 502, 504]) assert.equal(isTransientServerError(err(status)), true);
  for (const other of [err(0), err(400), err(403), err(410), err(422), err(429), err(500), new Error("plain"), null, undefined, "503", { status: "503" }]) {
    assert.equal(isTransientServerError(other), false);
  }
});

test("the wait is the server's Retry-After kept between one and five seconds; two seconds without it", () => {
  assert.equal(retryDelayMs(err(503, "x", 3)), 3000);
  assert.equal(retryDelayMs(err(503, "x", 2)), 2000);
  assert.equal(retryDelayMs(err(503, "x", 0.2)), 1000);
  assert.equal(retryDelayMs(err(503, "x", 60)), 5000);
  for (const bad of [undefined, 0, -3, Number.NaN, "2"]) assert.equal(retryDelayMs(err(503, "x", bad)), 2000);
  assert.equal(retryDelayMs(null), 2000);
});

test("the failure text is the server's own Russian text, else the fixed one", () => {
  assert.equal(transientFailureMessage(err(503, "Попытка сейчас обрабатывается другим запросом.")), "Попытка сейчас обрабатывается другим запросом.");
  assert.equal(transientFailureMessage(err(503, "   ")), BUSY_MESSAGE);
  assert.equal(transientFailureMessage(null), BUSY_MESSAGE);
});

test("a request that succeeds is made once and nobody waits", async () => {
  const waits = [];
  let calls = 0;
  const value = await withTransientRetry(async () => { calls += 1; return "ok"; }, { sleep: async (ms) => waits.push(ms) });
  assert.deepEqual([value, calls, waits], ["ok", 1, []]);
});

test("a 503 is repeated after its Retry-After and the answer of the repeat is used", async () => {
  const waits = [];
  const notices = [];
  let calls = 0;
  const value = await withTransientRetry(
    async () => { calls += 1; if (calls < 3) throw err(503, "busy", calls); return { session_id: "S1" }; },
    { sleep: async (ms) => waits.push(ms), onRetry: (_error, next) => notices.push(next) },
  );
  assert.deepEqual(value, { session_id: "S1" });
  assert.deepEqual([calls, waits, notices], [3, [1000, 2000], [2, 3]]);
});

test("after the last try the last error is thrown, with its status and Retry-After", async () => {
  assert.equal(RETRY_ATTEMPTS, 3);
  let calls = 0;
  const waits = [];
  await assert.rejects(
    withTransientRetry(async () => { calls += 1; throw err(503, `busy ${calls}`, 2); }, { sleep: async (ms) => waits.push(ms) }),
    (error) => error.status === 503 && error.message === "busy 3" && error.retryAfter === 2,
  );
  assert.deepEqual([calls, waits], [3, [2000, 2000]]);
});

test("anything else is thrown at once, unrepeated", async () => {
  for (const status of [429, 410, 403, 400, 500]) {
    let calls = 0;
    await assert.rejects(withTransientRetry(async () => { calls += 1; throw err(status); }, { sleep: async () => assert.fail("no wait") }));
    assert.equal(calls, 1);
  }
});

test("the API client keeps Retry-After of a 503 as well as of a 429", () => {
  const api = read("src/lib/api.ts");
  assert.match(api, /if \(response\.status !== 429 && response\.status !== 503\) return undefined;/);
  assert.match(api, /throw new ApiError\(response\.status, message, undefined, undefined, undefined, retryAfterSeconds\(response\)\);/);
});

const page = read("src/app/e/[code]/page.tsx");
const submitHandler = page.slice(page.indexOf("const handleSubmit = async"), page.indexOf("const goNext = "));

test("submit repeats on a busy server and says so; the exam stays on screen when the tries are used up", () => {
  assert.match(submitHandler, /withTransientRetry\(\s*\(\) =>\s*examsApi\.submit\(/);
  assert.match(submitHandler, /onRetry: \(\) => setRetryNotice\(SAVING_RETRY_MESSAGE\)/);
  assert.equal(SAVING_RETRY_MESSAGE, "Сохраняем… повторяем попытку");
  const transient = submitHandler.slice(submitHandler.indexOf("isTransientServerError(err)"));
  assert.match(transient, /setSubmitFailure\(transientFailureMessage\(err\)\);\s*setPhase\("exam"\);\s*return \{ ok: false, retryAt: null \};/);
  // and the ordinary failure still ends on the error page, after the transient branch
  assert.ok(transient.indexOf('setPhase("exam")') < transient.indexOf('setPhase("error")'));
});

test("the failure is a banner on the exam with a «Повторить» button that submits again - not a link to /login", () => {
  const banner = page.slice(page.indexOf("{submitFailure && ("), page.indexOf("min-h-[calc(100vh-5rem)]"));
  assert.match(banner, /role="alert"/);
  assert.match(banner, /onClick=\{handleSubmit\}[\s\S]{0,400}Повторить/);
  assert.doesNotMatch(banner, /\/login|<Link/);
  assert.match(page, /\{submitFailure && \(/);
});

test("the notice is read to the student while the page repeats", () => {
  assert.match(page, /role="status" aria-live="polite">\s*\{retryNotice \?\? "Пожалуйста, не закрывайте страницу"\}/);
});

test("start repeats on a busy server too; the lobby form keeps what was typed and the same button repeats", () => {
  const start = page.slice(page.indexOf("const executeStartExam"), page.indexOf("const handleAnswer"));
  assert.match(start, /withTransientRetry\(\(\) => examsApi\.startSession\(code, identity\)/);
  assert.match(start, /onRetry: \(\) => setRetryNotice\(START_RETRY_MESSAGE\)/);
  assert.match(start, /if \(isTransientServerError\(err\)\) \{[\s\S]{0,260}setPhase\("lobby"\);[\s\S]{0,80}setGroupWarning\(transientFailureMessage\(err\)\);\s*return;/);
  assert.match(start, /setError\(err\.message \|\| "Не удалось начать экзамен"\);\s*setPhase\("error"\);/);
  assert.equal(START_RETRY_MESSAGE, "Входим в экзамен… повторяем попытку");
  assert.match(page, /\? retryNotice \?\? "Проверка\.\.\."/);
});

test("the ordinary error page is unchanged: it still has its way home", () => {
  const errorScreen = page.slice(page.indexOf('if (phase === "error")'));
  assert.match(errorScreen, /<Link href="\/login">/);
});
