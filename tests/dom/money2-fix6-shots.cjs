// Money-2 fix 6: `node tests/dom/money2-fix6-shots.cjs <out dir> <before|after>` - the statement table (every kind of row, a transfer there and back in one day) at 1280 / 1024 / 375, normal and long names.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "..", "..");
const [out, phase = "after"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
process.env.DOM_CSS = css;
const { launch, openPage } = require("../helpers/dom-page.cjs");
const F = require("../helpers/money2-fixture.cjs");
const { statementServer } = require("../helpers/statement-all-kinds.cjs");

(async () => {
  const browser = await launch();
  for (const [setName, names] of [["normal", F.SHORT], ["long", F.LONG]]) {
    for (const width of [1280, 1024, 375]) {
      const { page } = await openPage(browser, "money2.entry.tsx", statementServer(names), { width, height: 900 });
      await page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
      await page.waitForSelector('[data-testid="statement-row-transfer_in"]');
      await page.waitForTimeout(250);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) console.log(`SUSPECT wide ${setName} ${width}`);
      await page.locator('[data-testid="statement-table"]').screenshot({ path: path.join(out, `statement-${phase}-${width}${setName === "long" ? "-long" : ""}.png`) });
      await page.close();
    }
  }
  await browser.close();
  console.log("done");
})();
