// Money-2 fix 10: `node tests/dom/money2-fix10-measure.cjs` - prints column -> centre of the heading -> centre of the value, the largest gap over the rows (statement 1280).
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "..", "..");
const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
process.env.DOM_CSS = css;
const { launch, openPage } = require("../helpers/dom-page.cjs");
const { statementServer } = require("../helpers/statement-all-kinds.cjs");
const { F } = require("../helpers/money2-fix7.cjs");
(async () => {
  const browser = await launch();
  const { page } = await openPage(browser, "money2.entry.tsx", statementServer(F.SHORT), { width: 1280, height: 900 });
  await page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
  await page.waitForSelector('[data-testid="statement-row-transfer_in"]');
  await page.waitForTimeout(300);
  const res = await page.evaluate(() => {
    const centre = (el) => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return b.left + b.width / 2; };
    const head = document.querySelector('[data-testid="statement-table"] .dt-head');
    return ["charged", "paid", "balance"].map((col) => {
      const h = head.querySelector(`[data-col="${col}"]`);
      const cells = [...document.querySelectorAll(`[data-testid="statement-table"] .dt-row .dt-cell[data-col="${col}"]`)].filter((c) => c.textContent.trim() !== "");
      const hc = centre(h); const vs = cells.map((c) => centre(c.querySelector(".dt-value")));
      return { col, head: +hc.toFixed(1), valueMin: +Math.min(...vs).toFixed(1), valueMax: +Math.max(...vs).toFixed(1), maxDiff: +Math.max(...vs.map((v) => Math.abs(v - hc))).toFixed(2), rows: vs.length, chips: cells.filter((c) => c.querySelector('[data-testid="statement-balance-chip"]')).length };
    });
  });
  console.log(JSON.stringify(res));
  await browser.close();
})();
