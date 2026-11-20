#!/usr/bin/env node
/**
 * ALGO E2E runner (ROADMAP #27):  npm run e2e [-- <playwright args>]
 *
 *   1. docker compose (project `algo-e2e`): Postgres + Redis + auth-service built from AUTH_SERVICE_PATH
 *      (+ exam-service when E2E_EXAM=1); waits until every container is healthy
 *   2. `next build` of THIS checkout into .next-e2e (NEXT_PUBLIC_* point at the local services) and `next start`
 *   3. Playwright (e2e/playwright.config.ts)
 *   4. teardown: the processes THIS script started and `docker compose down -v` (unless E2E_KEEP=1)
 *
 * Environment (all optional):
 *   AUTH_SERVICE_PATH   auth-service checkout (default ../auth-service-n13p2, relative to this repo)
 *   EXAM_SERVICE_PATH   exam-service checkout (default ../exam-service-n13)
 *   E2E_EXAM=1          also start exam-service (+ content stub) and run the @exam scenarios
 *   E2E_KEEP=1          leave the stack and the front running afterwards (stop them with `npm run e2e:down`)
 *   E2E_REUSE=1         reuse a stack that is already up (implies E2E_KEEP) and an existing .next-e2e build
 *   E2E_SKIP_BUILD=1    do not rebuild the front when .next-e2e exists
 *   E2E_FRONT_PORT / E2E_AUTH_PORT / E2E_EXAM_PORT   host ports (13000 / 18000 / 18003)
 *   E2E_PROJECT         docker compose project name (default algo-e2e): a second stack beside the default one needs its own name and ports
 *   E2E_WORKERS         parallel Playwright workers (default 3 locally, 2 in CI)
 *   E2E_CONSOLE_PORT    the port console-k1.spec.ts serves the console on (13100)
 *   E2E_CLOCK_AT        "YYYY-MM-DDTHH:MM" (Tashkent): put the stand clock there instead of the nearest 10:00 ahead (it must be in the future;
 *                       checks the suite on another weekday / the last day of a month / after 10:00)
 *
 * TIME-TESTS: the stand runs on a controllable business clock (ALGO_TEST_CLOCK=1 in the compose file).  On a FRESH stack the runner deletes the
 * offset key in Redis, sets the nearest 10:00 ahead (Tashkent) through PUT /api/v1/auth/dev/clock, waits until auth AND exam report the same offset and
 * prints the business time and `test_clock` of both services; with `test_clock: false` the run does not start.  The ordinary projects (desktop, mobile)
 * run first, the `days` project (fixed 2028 dates, moves the clock far forward, never back) runs last, alone, in its own Playwright call.
 *
 * Flags starting with `--` before the first path are passed to Playwright (`--headed`, `--project=mobile`, `--grep ...`).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.resolve(here, "..");
const repoDir = path.resolve(e2eDir, "..");
const stateDir = path.join(e2eDir, ".state");
const composeFile = path.join(e2eDir, "docker-compose.e2e.yml");
const frontPidFile = path.join(stateDir, "front.pid");

const env = process.env;
const FRONT_PORT = Number(env.E2E_FRONT_PORT || 13000);
const AUTH_PORT = Number(env.E2E_AUTH_PORT || 18000);
const EXAM_PORT = Number(env.E2E_EXAM_PORT || 18003);
const WITH_EXAM = env.E2E_EXAM === "1";
// A second stack next to the default one (another checkout running at the same time): its own compose project, its own ports
const PROJECT = env.E2E_PROJECT || "algo-e2e";
const REUSE = env.E2E_REUSE === "1";
const KEEP = env.E2E_KEEP === "1" || REUSE;
const FRONT_ORIGIN = `http://localhost:${FRONT_PORT}`;

const authPath = path.resolve(repoDir, env.AUTH_SERVICE_PATH || "../auth-service-n13p2");
const examPath = path.resolve(repoDir, env.EXAM_SERVICE_PATH || "../exam-service-n13");

const composeEnv = {
  ...env,
  AUTH_SERVICE_PATH: authPath,
  EXAM_SERVICE_PATH: examPath,
  E2E_AUTH_PORT: String(AUTH_PORT),
  E2E_EXAM_PORT: String(EXAM_PORT),
  E2E_FRONT_ORIGIN: FRONT_ORIGIN,
};
const composeBase = ["compose", "-p", PROJECT, "-f", composeFile, ...(WITH_EXAM ? ["--profile", "exam"] : [])];

const t0 = Date.now();
const stamp = () => `[e2e +${Math.round((Date.now() - t0) / 1000)}s]`;
const log = (...a) => console.log(stamp(), ...a);
const fail = (msg) => {
  console.error(`${stamp()} ERROR: ${msg}`);
  process.exit(2);
};

function docker(args, opts = {}) {
  return spawnSync("docker", [...composeBase, ...args], { env: composeEnv, stdio: "inherit", cwd: repoDir, ...opts });
}

function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });
}

async function waitHttp(url, ms, what) {
  const end = Date.now() + ms;
  let last = "";
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = String(e.cause?.code || e.message);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`${what} did not become ready at ${url} within ${ms / 1000}s (${last})`);
}

// ---------------------------------------------------------------------------------------------- the stand clock (TIME-TESTS)
const AUTH_API = `http://localhost:${AUTH_PORT}/api/v1`;
const EXAM_API = `http://localhost:${EXAM_PORT}/api/v1`;
const TASHKENT_OFFSET_HOURS = 5; // Asia/Tashkent has no daylight saving time

/** The nearest 10:00 AHEAD by Tashkent: today when it is not yet 10:00 there, otherwise tomorrow ("YYYY-MM-DDT10:00"); E2E_CLOCK_AT replaces it. */
function targetBusinessNow(realNowMs = Date.now()) {
  if (env.E2E_CLOCK_AT) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(env.E2E_CLOCK_AT)) throw new Error("E2E_CLOCK_AT must look like 2026-11-30T10:00");
    return env.E2E_CLOCK_AT;
  }
  const local = new Date(realNowMs + TASHKENT_OFFSET_HOURS * 3600_000); // the UTC fields of this date are the Tashkent wall time
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (minutes >= 10 * 60 ? 1 : 0)));
  return `${day.toISOString().slice(0, 10)}T10:00`;
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, body };
}

async function setUpStandClock(fresh) {
  const health = {};
  for (const [name, base] of [["auth", `http://localhost:${AUTH_PORT}`], ...(WITH_EXAM ? [["exam", `http://localhost:${EXAM_PORT}`]] : [])]) {
    health[name] = (await getJson(`${base}/health`)).body?.test_clock;
    log(`${name}: /health test_clock: ${health[name]}`);
  }
  for (const [name, flag] of Object.entries(health)) {
    if (flag !== true) throw new Error(`${name}: /health shows test_clock: ${flag} - the stand clock is off, the run does not start`);
  }
  if (fresh) {
    // A fresh stack has no shift yet.  The key is deleted BEFORE the first data, so no row of the stand is ever "in the future" of the clock.
    const del = spawnSync("docker", [...composeBase, "exec", "-T", "redis", "redis-cli", "-n", "0", "DEL", "algo:test:clock_offset_seconds"], {
      env: composeEnv,
      encoding: "utf8",
      cwd: repoDir,
    });
    if (del.status !== 0) throw new Error(`could not delete the clock key in Redis: ${(del.stderr || "").slice(0, 200)}`);
  }
  const target = targetBusinessNow();
  const current = (await getJson(`${AUTH_API}/auth/dev/clock`)).body;
  if (!current) throw new Error("GET /auth/dev/clock answered nothing useful");
  let offset = current.offset_seconds;
  if (current.now_business.slice(0, 16) >= target) {
    log(`stand clock already at ${current.now_business} (not before ${target}): left as it is (the clock only moves forward)`);
  } else {
    const put = await getJson(`${AUTH_API}/auth/dev/clock`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ business_now: target }),
    });
    if (put.status !== 200) throw new Error(`PUT /auth/dev/clock ${target}: HTTP ${put.status} ${JSON.stringify(put.body).slice(0, 200)}`);
    offset = put.body.offset_seconds;
  }
  // both services must report the same offset before the first test
  const end = Date.now() + 15_000;
  let seen = {};
  for (;;) {
    const auth = (await getJson(`${AUTH_API}/auth/dev/clock`)).body;
    const exam = WITH_EXAM ? (await getJson(`${EXAM_API}/dev/clock`)).body : auth;
    seen = { auth, exam };
    if (auth?.offset_seconds === offset && exam?.offset_seconds === offset) break;
    if (Date.now() > end) throw new Error(`the services do not agree on the clock offset ${offset}: ${JSON.stringify(seen)}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  log(`stand business time (Asia/Tashkent): auth ${seen.auth.now_business}${WITH_EXAM ? `, exam ${seen.exam.now_business}` : ""}; offset ${offset} s; test_clock: true`);
}

async function clockOffsetNow() {
  try {
    return (await getJson(`${AUTH_API}/auth/dev/clock`)).body?.offset_seconds ?? 0;
  } catch (e) {
    log(`the stand clock could not be read after the ordinary projects (${e.cause?.code || e.message}): the days project goes on and says it itself`);
    return 0;
  }
}

function stopFront() {
  // Only the process this tool started (its pid is in .state/front.pid) - never anything else on the port.
  if (!existsSync(frontPidFile)) return;
  const pid = Number(readFileSync(frontPidFile, "utf8"));
  rmSync(frontPidFile, { force: true });
  try {
    process.kill(-pid, "SIGTERM"); // the whole process group (npx -> next)
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

function teardown() {
  stopFront();
  log("docker compose down -v");
  // always with the `exam` profile: a stack started with E2E_EXAM=1 must be removed whole, whatever the env of this call
  spawnSync("docker", ["compose", "-p", PROJECT, "-f", composeFile, "--profile", "exam", "down", "-v", "--remove-orphans"], {
    env: composeEnv,
    stdio: "ignore",
    cwd: repoDir,
  });
}

if (process.argv[2] === "--down") {
  teardown();
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------- preflight
if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) fail("Docker is not running (docker info failed)");
if (!existsSync(path.join(authPath, "Dockerfile"))) {
  fail(`auth-service checkout not found at ${authPath}. Set AUTH_SERVICE_PATH=/path/to/auth-service (branch that is on stage)`);
}
if (WITH_EXAM && !existsSync(path.join(examPath, "Dockerfile"))) fail(`exam-service checkout not found at ${examPath} (EXAM_SERVICE_PATH)`);

const alreadyUp = spawnSync("docker", ["compose", "-p", PROJECT, "ps", "-q"], { env: composeEnv, encoding: "utf8" }).stdout.trim() !== "";
if (!REUSE || !alreadyUp) {
  for (const [port, what] of [[FRONT_PORT, "E2E_FRONT_PORT"], [AUTH_PORT, "E2E_AUTH_PORT"], ...(WITH_EXAM ? [[EXAM_PORT, "E2E_EXAM_PORT"]] : [])]) {
    if (!alreadyUp && (await portBusy(port))) fail(`port ${port} is busy (another program listens there). Choose another with ${what}=...`);
    if (alreadyUp && what === "E2E_FRONT_PORT" && (await portBusy(port))) fail(`port ${port} is busy; run \`npm run e2e:down\` first`);
  }
}

mkdirSync(stateDir, { recursive: true });
let exitCode = 1;
const cleanup = () => {
  if (!KEEP) teardown();
  else log(`E2E_KEEP: stack stays up (front ${FRONT_ORIGIN}, auth http://localhost:${AUTH_PORT}). Stop it: npm run e2e:down`);
};
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    cleanup();
    process.exit(130);
  });
}

try {
  // ------------------------------------------------------------------------------------------ stack
  if (REUSE && alreadyUp) {
    log("reusing the running stack");
  } else {
    log(`docker compose up (auth-service from ${authPath})`);
    const up = docker(["up", "-d", "--build", "--wait", "--wait-timeout", "240"]);
    if (up.status !== 0) {
      docker(["logs", "--tail", "60", "auth"]);
      throw new Error("docker compose up failed");
    }
  }
  await waitHttp(`http://localhost:${AUTH_PORT}/health`, 60_000, "auth-service");
  if (WITH_EXAM) await waitHttp(`http://localhost:${EXAM_PORT}/health`, 120_000, "exam-service");
  await setUpStandClock(!(REUSE && alreadyUp));

  // ------------------------------------------------------------------------------------------ front
  const buildDir = path.join(repoDir, ".next-e2e");
  const frontEnv = {
    ...env,
    NEXT_DIST_DIR: ".next-e2e",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_AUTH_API_URL: `http://localhost:${AUTH_PORT}`,
    NEXT_PUBLIC_EXAM_API_URL: `http://localhost:${EXAM_PORT}`,
    NEXT_PUBLIC_DIAG_API_URL: `http://localhost:${EXAM_PORT + 1}`, // no diagnostic-service in the stack: a closed port
  };
  const buildStamp = path.join(buildDir, ".e2e-stamp");
  const wantStamp = JSON.stringify([frontEnv.NEXT_PUBLIC_AUTH_API_URL, frontEnv.NEXT_PUBLIC_EXAM_API_URL]);
  const haveBuild =
    existsSync(path.join(buildDir, "BUILD_ID")) && existsSync(buildStamp) && readFileSync(buildStamp, "utf8") === wantStamp;
  if ((env.E2E_SKIP_BUILD === "1" || REUSE) && haveBuild) {
    log("front: reusing .next-e2e");
  } else {
    log("front: next build (NEXT_DIST_DIR=.next-e2e)");
    const build = spawnSync("npx", ["next", "build"], { cwd: repoDir, env: frontEnv, stdio: ["ignore", "ignore", "inherit"] });
    if (build.status !== 0) throw new Error("next build failed");
    writeFileSync(buildStamp, wantStamp);
  }

  // The console is a static export (console/out): console-k1.spec.ts serves it on its own port and proxies the platform API.
  const consoleOut = path.join(repoDir, "console", "out", "index.html");
  if ((env.E2E_SKIP_BUILD === "1" || REUSE) && existsSync(consoleOut)) {
    log("console: reusing console/out");
  } else {
    log("console: next build (static export -> console/out)");
    const consoleBuild = spawnSync("npm", ["run", "console:build"], { cwd: repoDir, env: { ...env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "ignore", "inherit"] });
    if (consoleBuild.status !== 0) throw new Error("console build failed");
  }

  if (await portBusy(FRONT_PORT)) {
    if (!REUSE) throw new Error(`port ${FRONT_PORT} is busy`);
    log(`front already listens on ${FRONT_PORT} (reuse)`);
  } else {
    log(`front: next start on :${FRONT_PORT}`);
    // stdout AND stderr go to a file: a child that kept the caller's pipe open would make `... | tail` wait for it forever
    const frontLog = openSync(path.join(stateDir, "front.log"), "a");
    const front = spawn("npx", ["next", "start", "-p", String(FRONT_PORT), "-H", "127.0.0.1"], {
      cwd: repoDir,
      env: frontEnv,
      detached: true, // own process group, so teardown can stop npx and next together
      stdio: ["ignore", frontLog, frontLog],
    });
    front.unref();
    writeFileSync(frontPidFile, String(front.pid));
  }
  await waitHttp(`${FRONT_ORIGIN}/login`, 60_000, "front");

  // ------------------------------------------------------------------------------------------ tests
  const userArgs = process.argv.slice(2);
  const pwEnv = { ...env, E2E_FRONT_PORT: String(FRONT_PORT), E2E_AUTH_PORT: String(AUTH_PORT), E2E_EXAM_PORT: String(EXAM_PORT), E2E_EXAM: WITH_EXAM ? "1" : "" };
  const runPlaywright = (extra) => {
    log(`playwright ${[...extra, ...userArgs].join(" ")}`);
    const args = ["playwright", "test", "-c", path.join(e2eDir, "playwright.config.ts"), ...extra, ...userArgs];
    return spawnSync("npx", args, { cwd: repoDir, env: pwEnv, stdio: "inherit" }).status ?? 1;
  };
  if (userArgs.some((a) => a.startsWith("--project"))) {
    exitCode = runPlaywright([]); // the caller chose the projects: nothing is split
  } else {
    // The ordinary projects first; the `days` project LAST and alone: it moves the stand clock to 2028 and never back.
    exitCode = runPlaywright(["--project=desktop", "--project=mobile"]);
    if ((await clockOffsetNow()) > 300 * 86400) {
      log("project days: the stand clock is already far in the future (a previous days run on this stand) and cannot go back - start a fresh stand (npm run e2e:down)");
      exitCode = exitCode || 1;
    } else {
      const daysCode = runPlaywright(["--project=days", "--workers=1", "--pass-with-no-tests"]);
      exitCode = exitCode || daysCode;
    }
  }
  if (exitCode !== 0) {
    log("tests failed - the report: npx playwright show-report e2e/playwright-report ; traces: e2e/test-results");
    if (KEEP) log("auth-service log: docker logs algo-e2e-auth-1 --tail 80");
  }
} catch (e) {
  console.error(`${stamp()} ERROR: ${e.message}`);
  exitCode = 2;
} finally {
  cleanup();
}
log(`done in ${Math.round((Date.now() - t0) / 1000)}s, exit ${exitCode}`);
process.exit(exitCode);
