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
  WAITING_POLL_MS, WAITING_POLL_MAX_MS, WAITING_POLL_MIN_GAP_MS, WAITING_POLL_REQUEST_LIMIT_MS, WAITING_POLL_MIN_WAIT_MS,
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
    /** The clock moves, the timers do NOT fire (a background tab whose timers are frozen / throttled by the browser). */
    jump: (ms) => { now += ms; },
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

test("a slow server: requests never overlap; the pace is counted from the START of an ask", async () => {
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
  // the answer takes 4 s (> the 1.5 s pause): the next ask starts when the answer is in (+ 250 ms), a round is 4.25 s -> 14 asks in 60 s
  // (the interval made 40 starts, up to 3 at once; counting the pause from the END made 11 asks and added the answer time to every delay)
  assert.equal(calls, 14);
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

test("the tab comes back (its timers were frozen): an immediate ask, the planned one is dropped, no double ask", async () => {
  const f = fakeEnv();
  let calls = 0;
  startWaitingRoomPoll(async () => { calls += 1; return "continue"; }, f.env);
  await f.advance(10_000);
  const before = calls;
  f.jump(3000);                                   // a locked phone: 3 s pass, no timer fires
  await f.fireReturn();
  assert.equal(calls, before + 1, "asked at once on return");
  assert.equal(f.pending(), 1, "exactly one planned ask is left");
  // visibilitychange + pageshow + focus come together: the min gap keeps it to one ask
  await f.fireReturn();
  await f.fireReturn();
  assert.equal(calls, before + 1);
  // a return with a margin (1.5 s after the last ask, the gap is 1 s), not at the edge of it
  f.jump(WAITING_POLL_MIN_GAP_MS + 500);
  await f.fireReturn();
  assert.equal(calls, before + 2);
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
  assert.ok(/async \(alive, signal\) =>/.test(block) && /getSessionStatus\(code, sessionId, sessionToken, signal\)/.test(block), "the abort signal reaches the request");
  const api = fs.readFileSync(path.join(__dirname, "../src/lib/api.ts"), "utf8");
  assert.ok(/session-status\/\$\{encodePathId\(sessionId\)\}`, "student", \{ sessionToken, signal \}/.test(api), "getSessionStatus passes the signal on");
  assert.ok(/\.\.\.\(signal \? \{ signal \} : \{\}\)/.test(api), "examApi gives the signal to fetch");
  for (const word of ['"kicked"', '"submitted"', '"closed"', 'setPhase("exam")', 'setPhase("results")', 'setPhase("lobby")']) {
    assert.ok(block.includes(word), `kept: ${word}`);
  }
  assert.ok(/\}, \[phase, sessionId, sessionToken, code\]\);/.test(block), "examInfo is not a dependency of the effect");
  assert.ok(/examInfoRef\.current\?\.total_time_minutes/.test(block));
  assert.ok(!/document\.hidden|visibilityState\s*===\s*"hidden"/.test(fs.readFileSync(path.join(__dirname, "../src/lib/exam-waiting-poll.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")), "the student's poll is not paused in the background");
});

// ── R3 B1 / V1 / V2: an ask that never answers, a slow answer, the return to a hanging ask ───────────────────────────────────────

/** An ask that is given a `result(startedAt)` after `latency` ms (or never: latency = Infinity); records what it applied. */
function scriptedAsk(f, { latency, stateAt, applied, signals }) {
  let n = 0;
  return async (alive, signal) => {
    n += 1;
    const id = n;
    const startedAt = f.env.now();
    signals.push(signal);
    const sampled = stateAt(startedAt);             // the server decides at the START of the request
    if (latency(id) === Infinity) {
      await new Promise((resolve) => { signal.addEventListener("abort", resolve); signals[id - 1].__release = resolve; });
      if (!alive()) return "stop";
    } else {
      await f.sleep(latency(id));
    }
    if (!alive()) return "stop";                     // an abandoned ask applies nothing
    applied.push({ id, startedAt, at: f.env.now(), state: sampled });
    return sampled === "started" ? "stop" : "continue";
  };
}

test("B1: an ask that never answers is given up after 8 s, the poll goes on and the student enters after the start", async () => {
  const f = fakeEnv();
  const applied = [], signals = [];
  const startAt = 3000;
  const ask = scriptedAsk(f, { latency: (id) => (id === 1 ? Infinity : 20), stateAt: (t) => (t >= startAt ? "started" : "waiting"), applied, signals });
  startWaitingRoomPoll(ask, f.env);
  await f.advance(1500 + WAITING_POLL_REQUEST_LIMIT_MS - 1);
  assert.equal(signals.length, 1, "still waiting for the first ask");
  assert.equal(signals[0].aborted, false);
  await f.advance(1);                                // 8 s after the start of the ask
  assert.equal(signals[0].aborted, true, "the hanging request is aborted");
  await f.advance(WAITING_POLL_MIN_WAIT_MS + 100);
  assert.equal(signals.length, 2, "the next ask went out");
  assert.deepEqual(applied.map((a) => [a.id, a.state]), [[2, "started"]], "entered; nothing of the first ask is applied");
});

test("B1: an ask that never answers, again and again: one at a time, a failure each 8 s, about 7 asks in a minute", async () => {
  const f = fakeEnv();
  let active = 0, maxActive = 0, calls = 0;
  const failures = [];
  startWaitingRoomPoll(async (alive, signal) => {
    calls += 1; active += 1; maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => signal.addEventListener("abort", resolve));
    active -= 1;
    return "continue";
  }, f.env, (e) => failures.push(e.status));
  await f.advance(60_000);
  assert.equal(maxActive, 1);
  assert.ok(calls >= 6 && calls <= 8, `asks: ${calls}`);
  assert.ok(failures.length >= calls - 1 && failures.every((s) => s === 0));
});

test("B1: the answer of an abandoned ask that comes late does not overwrite the newer state", async () => {
  const f = fakeEnv();
  const applied = [], signals = [];
  let release1;
  let n = 0;
  startWaitingRoomPoll(async (alive, signal) => {
    n += 1;
    const id = n;
    signals.push(signal);
    if (id === 1) {
      await new Promise((resolve) => { release1 = resolve; });       // ignores the abort: answers late, as a real socket may
      if (alive()) applied.push("late-first");                       // the page checks alive() before writing
      return "stop";
    }
    applied.push("second");
    return "stop";
  }, f.env);
  await f.advance(1500 + WAITING_POLL_REQUEST_LIMIT_MS + 1000);
  assert.deepEqual(applied, ["second"]);
  release1();
  await f.advance(100);
  assert.deepEqual(applied, ["second"], "the late answer of the first ask is dropped");
});

test("V2: the return to an ask that has hung for 8 s (its timer frozen) abandons it and asks at once; before 8 s it waits", async () => {
  const f = fakeEnv();
  const applied = [], signals = [];
  const ask = scriptedAsk(f, { latency: (id) => (id === 1 ? Infinity : 10), stateAt: () => "waiting", applied, signals });
  startWaitingRoomPoll(ask, f.env);
  await f.advance(1500);                               // the first ask is on the way
  assert.equal(signals.length, 1);
  f.jump(4000);
  await f.fireReturn();
  assert.equal(signals.length, 1, "4 s: the ask is still waited for");
  f.jump(4000);                                         // 8 s since the start, the 8 s timer of the ask did not fire (frozen)
  await f.fireReturn();
  assert.equal(signals.length, 2, "a new ask went out at once");
  assert.equal(signals[0].aborted, true, "the hanging one was aborted");
  await f.fireReturn();
  assert.equal(signals.length, 2, "and the events that come together do not make a third");
});

test("V1: the start of the exam reaches the student within (answer time + 5 s), for any moment of the start and answer times 0 / 1 / 3 s", async () => {
  for (const L of [0, 1000, 3000]) {
    for (const random of [0, 0.5, 1]) {
      let worst = 0;
      for (let offset = 0; offset < 4000; offset += 250) {
        const f = fakeEnv(random);
        const applied = [], signals = [];
        const flip = 20_000 + offset;
        const ask = scriptedAsk(f, { latency: () => L, stateAt: (t) => (t >= flip ? "started" : "waiting"), applied, signals });
        startWaitingRoomPoll(ask, f.env);
        await f.advance(flip + 12_000);
        const entered = applied.find((a) => a.state === "started");
        assert.ok(entered, `L=${L} offset=${offset}: entered`);
        worst = Math.max(worst, entered.at - flip);
      }
      assert.ok(worst <= L + WAITING_POLL_MAX_MS, `L=${L} random=${random}: worst ${worst} ms`);
    }
  }
});

test("V1: the pause is counted from the start of an ask: a 0.3 s answer is followed by an ask 1.5 s after the START", async () => {
  const f = fakeEnv();
  const applied = [], signals = [];
  const ask = scriptedAsk(f, { latency: () => 300, stateAt: () => "waiting", applied, signals });
  startWaitingRoomPoll(ask, f.env);
  await f.advance(10_000);
  const gaps = applied.slice(1).map((a, i) => a.startedAt - applied[i].startedAt);
  assert.ok(gaps.length >= 5 && gaps.every((g) => g === 1500), `gaps between starts: ${gaps.join(",")}`);
});
