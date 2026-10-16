import { defineConfig, devices } from "@playwright/test";
import { FRONT_ORIGIN } from "./support/env";

const ci = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
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
