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
const entry = require(path.join(__dirname, "../src/lib/exam-entry.ts"));
const { isRateLimited, rateLimitMessage, waitPhrase, checkFailureMessage, CHECK_FAILED_MESSAGE, RATE_LIMIT_MESSAGE } = entry;

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const err = (status, message = "x", retryAfter) => Object.assign(new Error(message), { status, retryAfter });

test("a 429 is told apart from every other failure", () => {
  assert.equal(isRateLimited(err(429)), true);
  for (const other of [err(0), err(400), err(403), err(410), err(500), new Error("plain"), null, undefined, "429", { status: "429" }]) {
    assert.equal(isRateLimited(other), false);
  }
});

test("the wait reads «минуту» up to a minute and a half, then whole minutes rounded up", () => {
  assert.equal(waitPhrase(1), "минуту");
  assert.equal(waitPhrase(60), "минуту");
  assert.equal(waitPhrase(90), "минуту");
  assert.equal(waitPhrase(91), "2 мин");
  assert.equal(waitPhrase(120), "2 мин");
  assert.equal(waitPhrase(121), "3 мин");
  assert.equal(waitPhrase(3300), "55 мин");
  assert.equal(waitPhrase(0), "минуту");
  assert.equal(waitPhrase(-5), "минуту");
});

test("the message shows Retry-After; without the header the server's own text; without both the fixed one", () => {
  assert.equal(rateLimitMessage(err(429, "серверный текст", 45)), "Слишком много попыток. Подождите минуту и попробуйте снова.");
  assert.equal(rateLimitMessage(err(429, "серверный текст", 300)), "Слишком много попыток. Подождите 5 мин и попробуйте снова.");
  assert.equal(rateLimitMessage(err(429, "Слишком много попыток. Подождите 12 мин и попробуйте снова.")), "Слишком много попыток. Подождите 12 мин и попробуйте снова.");
  assert.equal(rateLimitMessage(err(429, "   ")), RATE_LIMIT_MESSAGE);
  assert.equal(rateLimitMessage(err(429, "x", Number.NaN)), "x");
  assert.equal(rateLimitMessage(err(429, "x", 0)), "x");
  assert.equal(rateLimitMessage(null), RATE_LIMIT_MESSAGE);
});

test("the pre-check failure text: a 429 gives the wait, other client errors the server text, the rest the retry message", () => {
  assert.equal(checkFailureMessage(err(429, "x", 600)), "Слишком много попыток. Подождите 10 мин и попробуйте снова.");
  assert.equal(checkFailureMessage(err(403, "Нет доступа")), "Нет доступа");
  assert.equal(checkFailureMessage(err(500, "boom")), CHECK_FAILED_MESSAGE);
  assert.equal(checkFailureMessage(err(0)), CHECK_FAILED_MESSAGE);
});

test("the API client keeps Retry-After on the error of the exam endpoints", () => {
  const api = read("src/lib/api.ts");
  assert.match(api, /public retryAfter\?: number/);
  assert.match(api, /function retryAfterSeconds\(response: Response\)[\s\S]{0,300}headers\?\.get\?\.\("Retry-After"\)/);
  assert.match(api, /if \(response\.status !== 429\) return undefined;/);
  assert.match(api, /throw new ApiError\(response\.status, message, undefined, undefined, undefined, retryAfterSeconds\(response\)\);/);
});

test("the entry page keeps the form open on a 429 at the check AND at the start, never the error phase", () => {
  const page = read("src/app/e/[code]/page.tsx");
  // check: the catch shows the failure text on the form and marks the banner
  assert.match(page, /console\.error\("Check student error:", err\);\s*setRateLimited\(isRateLimited\(err\)\);\s*setGroupWarning\(checkFailureMessage\(err\)\);\s*return;/);
  // start: a 429 goes back to the form with the server's wait BEFORE the generic error phase
  const catchStart = page.slice(page.indexOf("if (isRateLimited(err)) {\n        // Too many attempts"));
  assert.match(catchStart, /^if \(isRateLimited\(err\)\) \{[\s\S]{0,300}setPhase\("lobby"\);\s*setRateLimited\(true\);\s*setGroupWarning\(rateLimitMessage\(err\)\);\s*return;\s*\}/);
  assert.ok(catchStart.indexOf('setPhase("lobby")') < catchStart.indexOf('setPhase("error")'), "the 429 branch comes before the error phase");
  // a new attempt clears the mark together with the warning
  assert.match(page, /setGroupWarning\(null\);\s*setRateLimited\(false\);/);
  // the banner says what happened
  assert.match(page, /rateLimited \? "Слишком много попыток" : "Доступ ограничен группой"/);
});

test("the teacher can reset the entry limits while the exam is open, and only then", () => {
  const api = read("src/lib/api.ts");
  assert.match(api, /resetEntryLimits: \(examId: string\) =>\s*examApi<\{ exam_id: string; reset: boolean \}>\(`\/exams\/\$\{examId\}\/entry-limits\/reset`, "staff", \{\s*method: "POST"/);
  const page = read("src/app/teacher/exams/[id]/page.tsx");
  assert.match(page, /await examsApi\.resetEntryLimits\(examId\);\s*showToast\("Ограничения входа сброшены", "success"\);/);
  const button = page.slice(page.indexOf("onClick={handleResetEntryLimits}") - 400, page.indexOf("Сбросить ограничения входа") + 40);
  assert.match(button, /!isPrintDelivery && exam\.access_code && \["lobby", "active"\]\.includes\(exam\.status\) && \(/);
  assert.ok(button.includes("loading={resettingLimits}"));
  assert.ok(button.includes("Сбросить ограничения входа"));
});

test("examsApi.checkStudent: a 429 rejects with the wait from Retry-After, the form can show it", async () => {
  const file = path.join(__dirname, "../src/lib/api.ts");
  delete require.cache[file];
  global.window = { location: { pathname: "/e/ABC123", search: "" } };
  const answer = (status, headers, body) => async () => ({
    ok: status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  });
  const body = { detail: "Слишком много попыток. Подождите минуту и попробуйте снова." };
  const { examsApi } = require(file);
  const ask = () => examsApi.checkStudent("ABC123", { student_id: "TE-001" });

  global.fetch = answer(429, { "retry-after": "75" }, body);
  await assert.rejects(ask(), (e) => e.name === "ApiError" && e.status === 429 && e.retryAfter === 75 && e.message === body.detail);

  global.fetch = answer(429, { "retry-after": "3300" }, body);
  await assert.rejects(ask(), (e) => e.retryAfter === 3300 && rateLimitMessage(e) === "Слишком много попыток. Подождите 55 мин и попробуйте снова.");

  for (const headers of [{}, { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }, { "retry-after": "0" }, { "retry-after": "-5" }]) {
    global.fetch = answer(429, headers, body);
    await assert.rejects(ask(), (e) => e.status === 429 && e.retryAfter === undefined && rateLimitMessage(e) === body.detail, JSON.stringify(headers));
  }

  global.fetch = answer(500, { "retry-after": "10" }, { detail: "boom" });
  await assert.rejects(ask(), (e) => e.status === 500 && e.retryAfter === undefined);
});
