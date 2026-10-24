// Nits pack N3 (#92 в): «Слишком много попыток» (HTTP 429) on the exam entry is a calm wait with a countdown, not an error screen.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const compile = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
};
require.extensions[".ts"] = compile;
require.extensions[".tsx"] = compile;
if (!Module.__n3Alias) {
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...rest);
  };
  Module.__n3Alias = true;
}
const limit = require(path.join(root, "src/lib/exam-rate-limit.ts"));
const entry = require(path.join(root, "src/lib/exam-entry.ts"));

const err = (status, retryAfter, message = "x") => Object.assign(new Error(message), { status, retryAfter });
const T0 = 1_000_000;

test("the wait is the whole seconds of Retry-After of a 429; nothing for no header, zero, garbage, a very long wait or another status", () => {
  assert.equal(limit.rateLimitWaitSeconds(err(429, 45)), 45);
  assert.equal(limit.rateLimitWaitSeconds(err(429, 0.2)), 1);
  assert.equal(limit.rateLimitWaitSeconds(err(429, 900)), 900);
  for (const bad of [undefined, null, 0, -5, Number.NaN, Infinity, "30", 901, 3600]) assert.equal(limit.rateLimitWaitSeconds(err(429, bad)), null, String(bad));
  for (const status of [403, 404, 500, 503, 0]) assert.equal(limit.rateLimitWaitSeconds(err(status, 30)), null, String(status));
  assert.equal(limit.rateLimitWaitSeconds(null), null);
  assert.equal(limit.rateLimitWaitSeconds(new TypeError("network")), null);
});

test("429 with Retry-After: «Подождите N сек.» counts down to zero, then the retry is allowed; without it the fixed text and the retry at once", () => {
  const deadline = limit.rateLimitDeadline(err(429, 45), T0);
  assert.equal(deadline, T0 + 45_000);
  assert.equal(limit.rateLimitText(deadline, T0), "Подождите 45 сек.");
  assert.equal(limit.rateLimitText(deadline, T0 + 1), "Подождите 45 сек.", "rounded up: never «0 сек.» while waiting");
  assert.equal(limit.rateLimitText(deadline, T0 + 1_000), "Подождите 44 сек.");
  assert.equal(limit.rateLimitText(deadline, T0 + 44_001), "Подождите 1 сек.");
  assert.equal(limit.canRetryNow(deadline, T0), false);
  assert.equal(limit.canRetryNow(deadline, T0 + 44_999), false);
  assert.equal(limit.canRetryNow(deadline, T0 + 45_000), true);
  assert.equal(limit.rateLimitText(deadline, T0 + 45_000), "Можно попробовать снова.");
  assert.equal(limit.canRetryNow(deadline, T0 + 999_999), true);
  assert.equal(limit.secondsLeft(deadline, T0 + 999_999), 0, "never negative");

  const none = limit.rateLimitDeadline(err(429, undefined), T0);
  assert.equal(none, null);
  assert.equal(limit.rateLimitText(none, T0), "Слишком много попыток. Подождите минуту и попробуйте снова.");
  assert.equal(limit.rateLimitText(none, T0), entry.RATE_LIMIT_MESSAGE);
  assert.equal(limit.canRetryNow(none, T0), true);
  assert.equal(limit.canRetryNow(none, T0, true), false, "a request in flight blocks the button");
  assert.equal(limit.secondsLeft(null, T0), 0);
});

test("a long wait reads in minutes", () => {
  assert.equal(limit.waitLabel(5), "5 сек.");
  assert.equal(limit.waitLabel(119), "119 сек.");
  assert.equal(limit.waitLabel(120), "2 мин.");
  assert.equal(limit.waitLabel(125), "2 мин 5 сек.");
  assert.equal(limit.waitLabel(900), "15 мин.");
  assert.equal(limit.waitLabel(-3), "0 сек.");
});

test("a repeat that is 429 again starts a new countdown from its own Retry-After", () => {
  const first = limit.rateLimitDeadline(err(429, 30), T0);
  const later = T0 + 31_000; // the student pressed the button after the first wait
  assert.equal(limit.canRetryNow(first, later), true);
  const second = limit.rateLimitDeadline(err(429, 60), later);
  assert.equal(limit.canRetryNow(second, later), false);
  assert.equal(limit.rateLimitText(second, later), "Подождите 60 сек.");
  assert.equal(limit.rateLimitText(second, later + 59_500), "Подождите 1 сек.");
});

test("the card: title, countdown, the button disabled while waiting and active after it (server render)", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { RateLimitCard } = require(path.join(root, "src/components/exam/rate-limit-card.tsx"));
  const html = (deadline) => renderToStaticMarkup(React.createElement(RateLimitCard, { deadline, onRetry() {} }));
  const waiting = html(Date.now() + 30_000);
  assert.match(waiting, /Слишком много попыток/);
  assert.match(waiting, /Подождите \d+ сек\./);
  assert.match(waiting, /<button[^>]*\sdisabled(=""|\s|>)/);
  assert.match(waiting, /Попробовать снова/);
  const noHeader = html(null);
  assert.match(noHeader, /Подождите минуту и попробуйте снова/);
  assert.doesNotMatch(noHeader, /\sdisabled(=""|\s|>)/);
  const over = html(Date.now() - 1000);
  assert.match(over, /Можно попробовать снова/);
  assert.doesNotMatch(over, /\sdisabled(=""|\s|>)/);
  // a calm card, not the red error screen
  assert.doesNotMatch(waiting, /bg-red-100|text-red-600/);
});

test("the exam page: a 429 on opening is the card (not the error screen); other failures stay what they were", () => {
  const page = read("src/app/e/[code]/page.tsx");
  const load = page.slice(page.indexOf("const loadExamInfo = useCallback"), page.indexOf("// ── Polling in Waiting Room Phase"));
  // 429 -> the card with its deadline; checked BEFORE the generic error branch
  assert.match(load, /if \(isRateLimited\(err\)\) \{[\s\S]*?setLoadLimit\(\{ deadline: rateLimitDeadline\(err, Date\.now\(\)\) \}\);[\s\S]*?setPhase\("rate_limited"\);[\s\S]*?return;[\s\S]*?\}\s*console\.error\("Failed to load exam:", err\);/);
  // everything else is unchanged: the server's text or the fixed one, the error screen
  assert.match(load, /setError\(err\.message \|\| "Экзамен не найден\. Проверьте код доступа\."\);\s*setPhase\("error"\);/);
  assert.match(load, /setError\("Этот экзамен уже закрыт или недоступен"\);/);
  // the retry shows «Загрузка» again and repeats the same request
  assert.match(page, /const retryLoad = \(\) => \{\s*setLoadLimit\(null\);\s*setPhase\("loading"\);\s*void loadExamInfo\(\);/);
  assert.match(page, /if \(phase === "rate_limited"\) \{[\s\S]*?<RateLimitCard deadline=\{loadLimit\?\.deadline \?\? null\} onRetry=\{retryLoad\} \/>/);
  // the rate-limited screen comes before the error screen
  assert.ok(page.indexOf('phase === "rate_limited"') < page.indexOf('if (phase === "error")'));
  assert.match(page, /type Phase = "loading" \| "rate_limited"/);
});

test("the lobby: a 429 on the identity check or the start keeps the form, counts down on the banner and holds the button; a 503 or other errors do not", () => {
  const page = read("src/app/e/[code]/page.tsx");
  const check = page.slice(page.indexOf('console.error("Check student error:"'), page.indexOf("// In lobby mode, join waiting room"));
  assert.match(check, /setRateLimited\(isRateLimited\(err\)\);\s*setLimitUntil\(rateLimitDeadline\(err, Date\.now\(\)\)\);/);
  const start = page.slice(page.indexOf("const executeStartExam"), page.indexOf("const handleAnswer"));
  assert.match(start, /if \(isRateLimited\(err\)\) \{[\s\S]*?setRateLimited\(true\);\s*setLimitUntil\(rateLimitDeadline\(err, Date\.now\(\)\)\);/);
  assert.match(start, /if \(isTransientServerError\(err\)\) \{[\s\S]*?setLimitUntil\(null\);/);
  assert.match(start, /console\.error\("Failed to start exam:", err\);\s*setError\(err\.message \|\| "Не удалось начать экзамен"\);\s*setPhase\("error"\);/);
  assert.match(page, /rateLimited && limitUntil !== null \? rateLimitText\(limitUntil, limitNow\) : groupWarning/);
  assert.match(page, /\|\| phase === "starting" \|\| !canRetryNow\(limitUntil, limitNow\)\}/);
});

test("a 429 on the final save keeps the exam on screen with the answers and the «Повторить» button", () => {
  const page = read("src/app/e/[code]/page.tsx");
  const submit = page.slice(page.indexOf("const handleSubmit"), page.indexOf("const goNext ="));
  assert.match(submit, /if \(isRateLimited\(err\)\) \{[\s\S]*?setSubmitFailure\(rateLimitMessage\(err\)\);\s*setPhase\("exam"\);\s*return;/);
  assert.ok(submit.indexOf("isRateLimited(err)") < submit.indexOf('setError(err.message || "Ошибка отправки ответов'));
});
