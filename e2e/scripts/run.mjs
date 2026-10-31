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
  const pwArgs = ["playwright", "test", "-c", path.join(e2eDir, "playwright.config.ts"), ...process.argv.slice(2)];
  log(`playwright ${process.argv.slice(2).join(" ")}`);
  const pw = spawnSync("npx", pwArgs, {
    cwd: repoDir,
    env: { ...env, E2E_FRONT_PORT: String(FRONT_PORT), E2E_AUTH_PORT: String(AUTH_PORT), E2E_EXAM_PORT: String(EXAM_PORT), E2E_EXAM: WITH_EXAM ? "1" : "" },
    stdio: "inherit",
  });
  exitCode = pw.status ?? 1;
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
