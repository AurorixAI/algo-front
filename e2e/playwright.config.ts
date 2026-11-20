import { defineConfig, devices } from "@playwright/test";
import { FRONT_ORIGIN } from "./support/env";

const ci = !!process.env.CI;

// The `days` project (TIME-TESTS) is in the config ONLY with E2E_DAYS=1 (e2e/scripts/run.mjs sets nothing: the caller does) and never together with the ordinary
// projects: its dates move the stand clock far forward, and the clock never goes back.
const withDays = process.env.E2E_DAYS === "1";
const argv = process.argv.slice(2);
const chosen = argv.flatMap((a, i) => (a.startsWith("--project=") ? [a.slice("--project=".length)] : a === "--project" && argv[i + 1] ? [argv[i + 1]] : []));
const inRunner = process.env.TEST_WORKER_INDEX === undefined; // the workers load this file too, with their own argv: only the runner checks
if (inRunner && withDays && chosen.includes("days") && chosen.length > 1) {
  throw new Error("the `days` project cannot be run together with other projects (its dates move the stand clock far forward, never back): run it alone, --project=days");
}
if (inRunner && withDays && chosen.length === 0) {
  throw new Error("E2E_DAYS=1: choose the projects (run.mjs does: the ordinary ones, then `days` alone); a bare `playwright test` would run `days` beside the ordinary projects");
}

export default defineConfig({
  testDir: "./tests",
  // TIME-TESTS: the stand's clock offset is read once into process.env, the workers inherit it
  globalSetup: "./global-setup.ts",
  outputDir: "./test-results",
  // Every spec file owns a throw-away organisation (support/api.ts: Org.create), so files are independent
  // and may run in parallel; the tests INSIDE a file share that organisation and run in order.
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS || (ci ? 2 : 3)),
  retries: ci ? 1 : 0,
  timeout: 60_000,
  // @exam scenarios need exam-service + the content stub (E2E_EXAM=1, see README); without them they are skipped.
  grepInvert: process.env.E2E_EXAM === "1" ? undefined : /@exam/,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "./playwright-report", open: "never" }]],
  use: {
    baseURL: FRONT_ORIGIN,
    locale: "ru-RU",
    timezoneId: "Asia/Tashkent",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    ...(withDays
      ? [
          {
            // «Life of a student by days»: fixed dates from 2030 on, each test sets its own absolute date and creates its own centre.  The stand clock moves
            // only forward, so this project goes LAST (e2e/scripts/run.mjs runs it in its own call, one worker) and never gives the time back.
            name: "days",
            testDir: "./days",
            retries: 0,
            timeout: 180_000,
            use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
          },
        ]
      : []),
    {
      // Only the tests tagged @mobile run at phone width (375x812, touch).
      name: "mobile",
      grep: /@mobile/,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
      },
    },
  ],
});
