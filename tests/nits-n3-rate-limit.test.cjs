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

test("429 with a usable Retry-After: «Подождите N сек.» counts down to zero, then the retry is allowed", () => {
  const deadline = limit.rateLimitDeadline(err(429, 45), T0);
  assert.equal(deadline, T0 + 45_000);
  assert.equal(limit.rateLimitFallbackText(err(429, 45)), null, "a counted wait has no fallback text");
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
  assert.equal(limit.canRetryNow(deadline, T0 + 999_999, true), false, "a request in flight blocks the button");
  assert.equal(limit.secondsLeft(null, T0), 0);
});

test("N3-3: a 429 without a usable Retry-After (none, zero, garbage, over 15 minutes) holds the button for a default minute and says the server's text, else the fixed calm one", () => {
  assert.equal(limit.DEFAULT_WAIT_SECONDS, 60);
  for (const bad of [undefined, 0, -1, Number.NaN, "30", 901, 3600]) {
    const error = err(429, bad, "Слишком много попыток. Подождите 5 мин.");
    const deadline = limit.rateLimitDeadline(error, T0);
    assert.equal(deadline, T0 + 60_000, String(bad));
    assert.equal(limit.canRetryNow(deadline, T0 + 59_000), false);
    assert.equal(limit.canRetryNow(deadline, T0 + 60_000), true);
    assert.ok(limit.rateLimitFallbackText(error), String(bad));
  }
  // the text: the server's message, else the fixed sentence; waitPhrase for a very long wait
  assert.equal(limit.rateLimitText(T0 + 60_000, T0, limit.rateLimitFallbackText(err(429, undefined, "Лимит исчерпан"))), "Лимит исчерпан");
  assert.equal(limit.rateLimitFallbackText(err(429, undefined, "  ")), entry.RATE_LIMIT_MESSAGE);
  assert.equal(limit.rateLimitFallbackText(err(429, 3600, "x")), "Слишком много попыток. Подождите 60 мин и попробуйте снова.");
  assert.equal(limit.rateLimitText(T0 + 60_000, T0 + 61_000, "Лимит исчерпан"), "Можно попробовать снова.", "after the hold the go-ahead replaces the old text");
  // not a 429: nothing to hold
  assert.equal(limit.rateLimitDeadline(err(500, 30), T0), null);
  assert.equal(limit.rateLimitDeadline(null, T0), null);
});

test("N3-3: api.ts reads Retry-After as seconds or as an HTTP-date; garbage and past dates stay undefined", async () => {
  const file = path.join(root, "src/lib/api.ts");
  delete require.cache[file];
  global.window = { location: { pathname: "/e/ABC123", search: "" } };
  const answer = (headers) => async () => ({ ok: false, status: 429, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, json: async () => ({ detail: "x" }) });
  const { examsApi } = require(file);
  const ask = () => examsApi.checkStudent("ABC123", { student_id: "TE-001" });
  const future = new Date(Date.now() + 90_000).toUTCString();
  global.fetch = answer({ "retry-after": future });
  await assert.rejects(ask(), (e) => e.status === 429 && e.retryAfter >= 88 && e.retryAfter <= 91, "an HTTP-date in the future becomes the seconds left");
  for (const value of ["soon", "Wed, 21 Oct 2015 07:28:00 GMT", "0"]) {
    global.fetch = answer({ "retry-after": value });
    await assert.rejects(ask(), (e) => e.status === 429 && e.retryAfter === undefined, value);
  }
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
  const noHeader = renderToStaticMarkup(React.createElement(RateLimitCard, { deadline: Date.now() + 60_000, fallback: "Слишком много попыток. Подождите минуту и попробуйте снова.", onRetry() {} }));
  assert.match(noHeader, /Подождите минуту и попробуйте снова/);
  assert.match(noHeader, /<button[^>]*\sdisabled(=""|\s|>)/, "held for the default minute");
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
  assert.match(load, /if \(isRateLimited\(err\)\) \{[\s\S]*?setLoadLimit\(\{ deadline: rateLimitDeadline\(err, Date\.now\(\)\), fallback: rateLimitFallbackText\(err\) \}\);[\s\S]*?setPhase\("rate_limited"\);[\s\S]*?return;[\s\S]*?\}\s*console\.error\("Failed to load exam:", err\);/);
  // everything else is unchanged: the server's text or the fixed one, the error screen
  assert.match(load, /setError\(err\.message \|\| "Экзамен не найден\. Проверьте код доступа\."\);\s*setPhase\("error"\);/);
  assert.match(load, /setError\("Этот экзамен уже закрыт или недоступен"\);/);
  // the retry shows «Загрузка» again and repeats the same request
  assert.match(page, /const retryLoad = \(\) => \{\s*setLoadLimit\(null\);\s*setPhase\("loading"\);\s*void loadExamInfo\(\);/);
  assert.match(page, /if \(phase === "rate_limited"\) \{[\s\S]*?<RateLimitCard deadline=\{loadLimit\?\.deadline \?\? null\} fallback=\{loadLimit\?\.fallback \?\? null\} onRetry=\{retryLoad\} \/>/);
  // the rate-limited screen comes before the error screen
  assert.ok(page.indexOf('phase === "rate_limited"') < page.indexOf('if (phase === "error")'));
  assert.match(page, /type Phase = "loading" \| "rate_limited"/);
});

test("the lobby: a 429 on the identity check or the start keeps the form, counts down on the banner and holds the button; a 503 or other errors do not", () => {
  const page = read("src/app/e/[code]/page.tsx");
  const check = page.slice(page.indexOf('console.error("Check student error:"'), page.indexOf("// In lobby mode, join waiting room"));
  assert.match(check, /setRateLimited\(isRateLimited\(err\)\);\s*setLimitUntil\(rateLimitDeadline\(err, Date\.now\(\)\)\);\s*setLimitFallback\(rateLimitFallbackText\(err\)\);/);
  const start = page.slice(page.indexOf("const executeStartExam"), page.indexOf("const handleAnswer"));
  assert.match(start, /if \(isRateLimited\(err\)\) \{[\s\S]*?setRateLimited\(true\);\s*setLimitUntil\(rateLimitDeadline\(err, Date\.now\(\)\)\);\s*setLimitFallback\(rateLimitFallbackText\(err\)\);/);
  assert.match(start, /if \(isTransientServerError\(err\)\) \{[\s\S]*?setLimitUntil\(null\);/);
  assert.match(start, /console\.error\("Failed to start exam:", err\);\s*setError\(err\.message \|\| "Не удалось начать экзамен"\);\s*setPhase\("error"\);/);
  assert.match(page, /rateLimited && limitUntil !== null \? rateLimitText\(limitUntil, limitNow, limitFallback\) : groupWarning/);
  assert.match(page, /\|\| phase === "starting" \|\| !canRetryNow\(limitUntil, limitNow\)\}/);
});

test("a 429 on the final save keeps the exam on screen with the answers; «Повторить» is held with the same countdown (N3-2)", () => {
  const page = read("src/app/e/[code]/page.tsx");
  const submit = page.slice(page.indexOf("const handleSubmit"), page.indexOf("const goNext ="));
  assert.match(submit, /if \(isRateLimited\(err\)\) \{[\s\S]*?const retryAt = rateLimitDeadline\(err, Date\.now\(\)\);[\s\S]*?setSubmitFailure\(rateLimitMessage\(err\)\);\s*setSubmitLimitUntil\(retryAt\);[\s\S]*?setPhase\("exam"\);\s*return \{ ok: false, retryAt \};/);
  assert.ok(submit.indexOf("isRateLimited(err)") < submit.indexOf('setError(err.message || "Ошибка отправки ответов'));
  assert.match(submit, /isTransientServerError\(err\)\) \{[\s\S]*?return \{ ok: false, retryAt: null \};/, "a busy server: no automatic retry, only the button");
  const banner = page.slice(page.indexOf("{submitFailure && ("), page.indexOf("min-h-[calc(100vh-5rem)]"));
  assert.match(banner, /disabled=\{!canRetryNow\(submitLimitUntil, submitLimitNow\)\}/);
  assert.match(banner, /`Подождите \$\{waitLabel\(secondsLeft\(submitLimitUntil, submitLimitNow\)\)\}`\s*:\s*"Повторить"/);
  assert.match(banner, /rateLimitText\(submitLimitUntil, submitLimitNow, submitLimitFallback\)/);
});

test("N3-1: the end-of-time auto-submit goes through a once-per-session controller, not straight from the effect", () => {
  const page = read("src/app/e/[code]/page.tsx");
  const effect = page.slice(page.indexOf("timeLeft === 0 && startTimeRef.current > 0"), page.indexOf("// ── Helpers"));
  assert.match(effect, /autoSubmitRef\.current\?\.trigger\(\)/);
  assert.doesNotMatch(effect, /handleSubmit\(\)/);
  assert.match(page, /submit: async \(\) => \(phaseRef\.current === "exam" \? handleSubmitRef\.current\(\) : \{ ok: true, retryAt: null \}\)/);
  assert.match(page, /autoSubmitRef\.current\?\.reset\(\);\s*try \{\s*const res = await withTransientRetry\(\(\) => examsApi\.startSession/);
});

// ── N3-1: no loop. The page's effect fires on every change of [timeLeft, phase]; a failed submit sets phase back to «exam». ──
const { createAutoSubmit } = require(path.join(root, "src/lib/exam-auto-submit.ts"));

function clock() {
  let now = 0;
  const timers = [];
  return {
    now: () => now,
    setTimer: (run, ms) => { const timer = { run, at: now + ms, live: true }; timers.push(timer); return timer; },
    clearTimer: (timer) => { timer.live = false; },
    /** advance the clock, running due timers (and the promises they start) */
    async advance(ms) {
      now += ms;
      for (const timer of timers) if (timer.live && timer.at <= now) { timer.live = false; timer.run(); }
      await new Promise((resolve) => setImmediate(resolve));
    },
    pending: () => timers.filter((t) => t.live).length,
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("N3-1: time is up, the submit gets a 429: ONE call now, ONE automatic retry when the wait ends, however often the effect fires", async () => {
  const c = clock();
  let calls = 0;
  const auto = createAutoSubmit({ ...c, submit: async () => { calls += 1; return { ok: false, retryAt: c.now() + 30_000 }; } });
  // the effect re-fires on every render while «time is up» holds (phase flips exam -> submitting -> exam)
  for (let render = 0; render < 20; render += 1) { auto.trigger(); await flush(); }
  assert.equal(calls, 1, "no back-to-back submits");
  assert.equal(c.pending(), 1, "exactly one retry is scheduled");
  await c.advance(29_000);
  for (let render = 0; render < 5; render += 1) { auto.trigger(); await flush(); }
  assert.equal(calls, 1, "nothing before the wait is over");
  await c.advance(1_000);
  assert.equal(calls, 2, "the one automatic retry");
  for (let render = 0; render < 20; render += 1) { auto.trigger(); await flush(); }
  await c.advance(10 * 60_000);
  assert.equal(calls, 2, "the retry is 429 again: no third automatic call, only the button");
  assert.equal(c.pending(), 0);
});

test("N3-1: a 503 (busy server), another failure or a success never schedules an automatic retry", async () => {
  for (const outcome of [{ ok: false, retryAt: null }, { ok: true, retryAt: null }, undefined]) {
    const c = clock();
    let calls = 0;
    const auto = createAutoSubmit({ ...c, submit: async () => { calls += 1; return outcome; } });
    for (let render = 0; render < 10; render += 1) { auto.trigger(); await flush(); }
    await c.advance(60 * 60_000);
    assert.equal(calls, 1, JSON.stringify(outcome));
    assert.equal(c.pending(), 0);
  }
});

test("N3-1: a retry that finds the exam no longer on screen (saved by the button meanwhile) is harmless; leaving the page drops the timer; a new session fires again", async () => {
  const c = clock();
  let calls = 0;
  const auto = createAutoSubmit({ ...c, submit: async () => { calls += 1; return { ok: false, retryAt: c.now() + 5_000 }; } });
  auto.trigger(); await flush();
  assert.equal(c.pending(), 1);
  auto.cancel();
  assert.equal(c.pending(), 0);
  await c.advance(60_000);
  assert.equal(calls, 1, "cancelled");
  auto.trigger(); await flush();
  assert.equal(calls, 1, "still once per session");
  auto.reset();
  auto.trigger(); await flush();
  assert.equal(calls, 2, "a new session");
});

test("N3-4: the countdown hook takes the clock again in the same render when the deadline changes", () => {
  const source = read("src/lib/use-countdown.ts");
  assert.match(source, /const \[seen, setSeen\] = useState\(deadline\);\s*if \(seen !== deadline\) \{\s*setSeen\(deadline\);\s*setNow\(Date\.now\(\)\);/);
});
