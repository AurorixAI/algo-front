// PAY-TAILS Б9.6-7: `node tests/dom/paytails-part6-shots.cjs <out dir>` - the receipt on the REAL answers of the server (tests/fixtures/paytails) in three cases at 1280 / 375, and with a long name and group.
// Prints ONLY suspicious lines: horizontal scroll, text off its block, a console error.  Run with TMPDIR in `artifacts/money1-stage/.cache` (the css of the run goes there).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "..", "..");
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
process.env.DOM_CSS = css;
const { launch, openPage } = require("../helpers/dom-page.cjs");
const { layoutProbe } = require("../helpers/layout-probe.cjs");
const { fx } = require("../helpers/paytails-server.cjs");

const LONG_NAME = "Абдурахмонов Мухаммадюсуф Абдулазизович";
const LONG_GROUP = "Математика 7 углублённая (вечерняя), длинное название группы";
const partial = fx("receipt_partial_payment");
const CASES = {
  "receipt-1-partial": partial,
  "receipt-2-debt-cover": { ...partial, receipt_state_text: "не оплачено 100 000 сум, оплачено до 14.11", state_on_issue: { ...partial.state_on_issue, as_of: "2026-11-07" } },
  "receipt-3-closed-membership": fx("receipt_closed_membership"),
};

(async () => {
  const browser = await launch();
  const suspicious = [];
  for (const [name, base] of Object.entries(CASES)) {
    for (const long of [false, true]) {
      for (const width of [1280, 375]) {
        const receipt = long ? { ...base, student_name: LONG_NAME, group_name: LONG_GROUP } : base;
        const { page, errors } = await openPage(browser, "money.entry.tsx", () => null, { width, height: width === 375 ? 812 : 900 });
        await page.evaluate((r) => window.mount("receipt", undefined, { receipt: r }), receipt);
        await page.waitForSelector('[aria-label^="Квитанция"]', { timeout: 9000 });
        await page.waitForTimeout(500);
        const probe = await page.evaluate(layoutProbe, "body");
        const label = `${name}${long ? "-long" : ""}-${width}`;
        if (probe.bad.length || probe.scroll > 0) suspicious.push(`${label}: ${probe.scroll > 0 ? `scroll ${probe.scroll} ` : ""}${probe.bad.join(" | ")}`);
        if (errors.length) suspicious.push(`${label}: console ${errors.join(" | ").slice(0, 160)}`);
        await page.screenshot({ path: path.join(out, `${label}.png`), fullPage: true });
        await page.close();
      }
    }
  }
  await browser.close();
  console.log(suspicious.length ? suspicious.join("\n") : "no suspicious lines");
})();
