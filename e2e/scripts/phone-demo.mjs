#!/usr/bin/env node
/**
 * The phone stand:  npm run e2e:phone-demo   (stop: npm run e2e:down)
 *
 * Brings the E2E stand up the way `npm run e2e` does (e2e/scripts/run.mjs with E2E_NO_TESTS=1 E2E_KEEP=1: docker compose project algo-e2e, auth-service from
 * AUTH_SERVICE_PATH, the build of this checkout in .next-e2e, the stand clock on the nearest 10:00), runs NO tests, fills the centre of the passwordless
 * sign-in through the routes of the product (phone-demo-seed.mjs) and leaves everything running, with a helper page for the phone on http://localhost:13200/
 * (phone-demo-server.mjs).  Environment: those of run.mjs (AUTH_SERVICE_PATH, E2E_SKIP_BUILD, E2E_CLOCK_AT, ports), E2E_PHONE_PORT (13200).
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedPhoneDemo } from "./phone-demo-seed.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, "..", "..");
const stateDir = path.join(here, "..", ".state");
const env = process.env;
const FRONT_PORT = Number(env.E2E_FRONT_PORT || 13000);
const AUTH_PORT = Number(env.E2E_AUTH_PORT || 18000);
const PHONE_PORT = Number(env.E2E_PHONE_PORT || 13200);

const up = spawnSync("node", [path.join(here, "run.mjs")], {
  cwd: repoDir,
  env: { ...env, E2E_NO_TESTS: "1", E2E_KEEP: "1", E2E_EXTRA_ORIGINS: `http://localhost:${PHONE_PORT}`, AUTH_SERVICE_PATH: env.AUTH_SERVICE_PATH || "/Users/arslan/Desktop/ALGO/auth-service-g" },
  stdio: "inherit",
});
if (up.status !== 0) {
  console.error("[phone-demo] the stand did not come up");
  process.exit(up.status ?? 2);
}

const result = await seedPhoneDemo(`http://localhost:${AUTH_PORT}`);
console.log("[phone-demo] created:");
for (const c of result.created) console.log(`  ${c.state.padEnd(24)} ${c.name.padEnd(30)} ${c.group}${c.note ? ` | ${c.note}` : ""}`);
if (result.skipped.length) {
  console.log("[phone-demo] NOT created:");
  for (const s of result.skipped) console.log(`  ${s.state} / ${s.name}: ${s.why}`);
}
console.log("[phone-demo] centre settings:", JSON.stringify({ period_mode: result.settings.period_mode, billing_anchor: result.settings.billing_anchor, pay_due_days: result.settings.pay_due_days, admin_can_manage: result.settings.admin_can_manage }));
const s = result.summary;
console.log(`[phone-demo] cards: debt ${s.debt_total} (${s.debtors}), due ${s.due_total} (${s.due_students}), advance ${s.advance_total} (${s.students_with_advance}), paused ${s.paused}`);

mkdirSync(stateDir, { recursive: true });
const log = openSync(path.join(stateDir, "phone-demo.log"), "a");
const page = spawn("node", [path.join(here, "phone-demo-server.mjs"), String(PHONE_PORT), String(AUTH_PORT), String(FRONT_PORT)], { detached: true, stdio: ["ignore", log, log] });
page.unref();
writeFileSync(path.join(stateDir, "phone-demo.pid"), String(page.pid));
console.log(`[phone-demo] ready: helper page http://localhost:${PHONE_PORT}/ ; front http://localhost:${FRONT_PORT}/ ; stop: npm run e2e:down`);
