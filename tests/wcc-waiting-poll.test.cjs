// WC-C / F-A14: the poll of the student's waiting room (src/lib/exam-waiting-poll.ts) on a FAKE clock (LESSONS 76).
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
const Module = require("node:module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) request = path.join(__dirname, "../src", request.slice(2));
  return origResolve.call(this, request, ...rest);
};
const {
  WAITING_POLL_MS, WAITING_POLL_MAX_MS, WAITING_POLL_MIN_GAP_MS,
  nextWaitingPollDelay, withJitter, waitingPollFailure, startWaitingRoomPoll,
} = require(path.join(__dirname, "../src/lib/exam-waiting-poll.ts"));

const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

/** A fake clock: timers fire in order of time, the page events are fired by hand. */
function fakeEnv(random = 0.5) {
  let now = 0;
  let seq = 0;
  let timers = [];
  const returns = new Set();
  const env = {
    now: () => now,
    setTimer: (fn, ms) => { const timer = { id: ++seq, at: now + ms, fn }; timers.push(timer); return timer.id; },
    clearTimer: (id) => { timers = timers.filter((t) => t.id !== id); },
    onReturn: (fn) => { returns.add(fn); return () => returns.delete(fn); },
    random: () => random,
  };
  return {
    env,
    pending: () => timers.length,
    listeners: () => returns.size,
    fireReturn: async () => { for (const fn of [...returns]) fn(); await flush(); },
    advance: async (ms) => {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        now = next.at;
        next.fn();
        await flush();
      }
      now = end;
      await flush();
    },
    sleep: (ms) => new Promise((resolve) => env.setTimer(resolve, ms)),
  };
}

class ApiLike extends Error { constructor(status, retryAfter) { super("x"); this.status = status; this.retryAfter = retryAfter; } }

test("the delay: success 1.5 s, failures 1.5 -> 3 -> 5 s and never beyond the ceiling of 5 s", () => {
  assert.equal(WAITING_POLL_MS, 1500);
  assert.equal(WAITING_POLL_MAX_MS, 5000);
  let d = WAITING_POLL_MS;
  const seen = [];
  for (let i = 0; i < 6; i += 1) { d = nextWaitingPollDelay(d, "transient"); seen.push(d); }
  assert.deepEqual(seen, [3000, 5000, 5000, 5000, 5000, 5000]);
  assert.equal(nextWaitingPollDelay(5000, "ok"), 1500, "one success is the normal pace again");
  assert.equal(nextWaitingPollDelay(3000, "error"), 3000, "a 4xx the server meant keeps the pace");
  assert.equal(nextWaitingPollDelay(9000, "error"), 5000);
});

test("Retry-After is honoured, but never past the 5 s ceiling", () => {
  assert.equal(nextWaitingPollDelay(1500, "transient", 4), 4000);
  assert.equal(nextWaitingPollDelay(1500, "transient", 1), 3000, "a short Retry-After does not shorten the back-off");
  assert.equal(nextWaitingPollDelay(1500, "transient", 120), 5000);
  assert.equal(nextWaitingPollDelay(1500, "transient", 0), 3000);
});

test("jitter is +-20 % and never above the ceiling, whatever the random", () => {
  assert.equal(withJitter(1500, 0), 1200);
  assert.equal(withJitter(1500, 1), 1800);
  for (const r of [0, 0.25, 0.5, 0.999, 1, 7, -3]) {
    for (const ms of [1500, 3000, 5000]) {
      const j = withJitter(ms, r);
      assert.ok(j <= WAITING_POLL_MAX_MS && j >= ms * 0.8 - 1, `${ms}/${r} -> ${j}`);
    }
  }
});

test("failures: no answer / 0 / 429 / 5xx are transient; other 4xx keep the pace", () => {
  for (const e of [new Error("net"), new ApiLike(0), new ApiLike(429, 3), new ApiLike(500), new ApiLike(503), null]) {
    assert.equal(waitingPollFailure(e).outcome, "transient");
  }
  assert.equal(waitingPollFailure(new ApiLike(429, 3)).retryAfter, 3);
  for (const e of [new ApiLike(400), new ApiLike(401), new ApiLike(403), new ApiLike(404)]) {
    assert.equal(waitingPollFailure(e).outcome, "error");
  }
});

test("a slow server: requests never overlap; the next ask is planned only after the answer", async () => {
  const f = fakeEnv();
  let active = 0, maxActive = 0, calls = 0;
  const poll = startWaitingRoomPoll(async () => {
    calls += 1; active += 1; maxActive = Math.max(maxActive, active);
    await f.sleep(4000);
    active -= 1;
    return "continue";
  }, f.env);
  await f.advance(60_000);
  poll.stop();
  assert.equal(maxActive, 1, "never two requests of one student at once");
  // 1.5 s wait + 4 s answer = 5.5 s per round -> 11 asks in 60 s (the interval made 40 starts, up to 3 at once)
  assert.equal(calls, 11);
});

test("request counts in 60 s: before (setInterval 1.5 s) -> after", async (t) => {
  // before: the old effect started a request every 1.5 s regardless of the answer
  const old = async (latencyMs, fail) => {
    const f = fakeEnv();
    let calls = 0, active = 0, maxActive = 0;
    const tick = () => { f.env.setTimer(tick, 1500); calls += 1; active += 1; maxActive = Math.max(maxActive, active); f.sleep(latencyMs).then(() => { active -= 1; }); };
    f.env.setTimer(tick, 1500);
    await f.advance(60_000);
    return { calls, maxActive };
  };
  const now = async (latencyMs, fail) => {
    const f = fakeEnv();
    let calls = 0, active = 0, maxActive = 0;
    startWaitingRoomPoll(async () => {
      calls += 1; active += 1; maxActive = Math.max(maxActive, active);
      await f.sleep(latencyMs);
      active -= 1;
      if (fail) throw new ApiLike(fail);
      return "continue";
    }, f.env);
    await f.advance(60_000);
    return { calls, maxActive };
  };
  const rows = [];
  for (const [name, latency, fail] of [["healthy, answer 0.1 s", 100, 0], ["slow, answer 4 s", 4000, 0], ["overloaded: 503 at once", 10, 503]]) {
    const before = await old(latency, fail);
    const after = await now(latency, fail);
    rows.push(`${name}: calls/60 s ${before.calls} -> ${after.calls}; at once ${before.maxActive} -> ${after.maxActive}`);
    assert.ok(after.calls <= before.calls);
    assert.equal(after.maxActive, 1);
  }
  t.diagnostic(rows.join(" | "));
  const healthy = await now(100, 0);
  assert.ok(healthy.calls >= 36 && healthy.calls <= 40);
  const outage = await now(10, 503);
  assert.ok(outage.calls <= 15 && outage.calls >= 11, `outage asks: ${outage.calls}`);
});

test("after a long outage the exam start reaches the student within 5 s", async () => {
  // random = 1 is the longest jitter; the ceiling still holds
  const f = fakeEnv(1);
  let serverUp = false, startedAt = null, enteredAt = null;
  startWaitingRoomPoll(async () => {
    if (!serverUp) throw new ApiLike(503);
    if (startedAt !== null) { enteredAt = f.env.now(); return "stop"; }
    return "continue";
  }, f.env);
  await f.advance(120_000); // two minutes of 503: the delay sits at the ceiling
  serverUp = true;
  startedAt = f.env.now();
  await f.advance(10_000);
  assert.notEqual(enteredAt, null, "the student entered");
  assert.ok(enteredAt - startedAt <= 5000, `entered ${enteredAt - startedAt} ms after the start`);
});

test("healthy lobby: the start reaches the student within the normal pace (<= 1.8 s with jitter)", async () => {
  const f = fakeEnv(1);
  let startedAt = null, enteredAt = null;
  startWaitingRoomPoll(async () => {
    if (startedAt !== null) { enteredAt = f.env.now(); return "stop"; }
    return "continue";
  }, f.env);
  await f.advance(30_000);
  startedAt = f.env.now();
  await f.advance(5000);
  assert.ok(enteredAt - startedAt <= 1800 && enteredAt >= startedAt);
});

test("a success after failures goes back to 1.5 s", async () => {
  const f = fakeEnv();
  const at = [];
  let fails = 3;
  startWaitingRoomPoll(async () => {
    at.push(f.env.now());
    if (fails > 0) { fails -= 1; throw new ApiLike(503); }
    return "continue";
  }, f.env);
  await f.advance(20_000);
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  assert.deepEqual(gaps.slice(0, 5), [3000, 5000, 5000, 1500, 1500]);
});

test("the tab comes back: an immediate ask, the planned one is dropped, no double ask", async () => {
  const f = fakeEnv();
  let calls = 0;
  startWaitingRoomPoll(async () => { calls += 1; return "continue"; }, f.env);
  await f.advance(10_000);
  const before = calls;
  // the background tab's timer was throttled by the browser: nothing fires for a while; the return asks at once
  await f.fireReturn();
  assert.equal(calls, before + 1, "asked at once on return");
  assert.equal(f.pending(), 1, "exactly one planned ask is left");
  // visibilitychange + pageshow + focus come together: the min gap keeps it to one ask
  await f.fireReturn();
  await f.fireReturn();
  assert.equal(calls, before + 1);
  await f.advance(WAITING_POLL_MIN_GAP_MS + 1);
  await f.fireReturn();
  assert.ok(calls >= before + 2);
});

test("the return while a request is on the way does not start a second one", async () => {
  const f = fakeEnv();
  let calls = 0, active = 0, maxActive = 0;
  startWaitingRoomPoll(async () => {
    calls += 1; active += 1; maxActive = Math.max(maxActive, active);
    await f.sleep(3000);
    active -= 1;
    return "continue";
  }, f.env);
  await f.advance(1500 * 0.5 + 1500); // first ask has started
  await f.fireReturn();
  await f.fireReturn();
  assert.equal(maxActive, 1);
  assert.equal(calls, 1);
});

test("a final verdict (started / kicked / closed / submitted) ends the poll: no timer, no listener, no more asks", async () => {
  const f = fakeEnv();
  let calls = 0;
  startWaitingRoomPoll(async () => { calls += 1; return calls >= 3 ? "stop" : "continue"; }, f.env);
  await f.advance(60_000);
  assert.equal(calls, 3);
  assert.equal(f.pending(), 0);
  assert.equal(f.listeners(), 0);
  await f.fireReturn();
  assert.equal(calls, 3);
});

test("stop() during a request: the answer is dropped (alive() is false), nothing is planned afterwards", async () => {
  const f = fakeEnv();
  let sawAlive = null;
  const poll = startWaitingRoomPoll(async (alive) => {
    await f.sleep(2000);
    sawAlive = alive();
    return "continue";
  }, f.env);
  await f.advance(1500);
  poll.stop();
  await f.advance(10_000);
  assert.equal(sawAlive, false);
  assert.equal(f.pending(), 0);
  assert.equal(f.listeners(), 0);
});

test("a failure is reported to the page (the log) and does not stop the poll", async () => {
  const f = fakeEnv();
  const seen = [];
  let calls = 0;
  startWaitingRoomPoll(async () => { calls += 1; if (calls === 1) throw new ApiLike(429, 2); return "continue"; }, f.env, (e) => seen.push(e.status));
  await f.advance(10_000);
  assert.deepEqual(seen, [429]);
  assert.ok(calls >= 3);
});

test("the page: one request at a time through the controller; the transitions are kept; examInfo does not restart the poll", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/app/e/[code]/page.tsx"), "utf8");
  const a = src.indexOf("// ── Polling in Waiting Room Phase");
  const b = src.indexOf("// ── Timer ──");
  const block = src.slice(a, b);
  assert.ok(a > 0 && b > a);
  assert.ok(!/setInterval/.test(block), "no interval in the waiting room");
  assert.ok(/startWaitingRoomPoll\(/.test(block) && /browserWaitingPollEnv\(\)/.test(block));
  assert.equal((src.match(/getSessionStatus\(/g) || []).length, 1, "the status is asked in one place");
  for (const word of ['"kicked"', '"submitted"', '"closed"', 'setPhase("exam")', 'setPhase("results")', 'setPhase("lobby")']) {
    assert.ok(block.includes(word), `kept: ${word}`);
  }
  assert.ok(/\}, \[phase, sessionId, sessionToken, code\]\);/.test(block), "examInfo is not a dependency of the effect");
  assert.ok(/examInfoRef\.current\?\.total_time_minutes/.test(block));
  assert.ok(!/document\.hidden|visibilityState\s*===\s*"hidden"/.test(fs.readFileSync(path.join(__dirname, "../src/lib/exam-waiting-poll.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")), "the student's poll is not paused in the background");
});
