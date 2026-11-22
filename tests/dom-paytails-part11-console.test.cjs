// PAY-TAILS Б11.21 п.9: the console «Сверка денег» at 1280 - the list of divergences has NO sideways scroll and the status column «Новое» / «Было и раньше» is whole (before: the table scrolled 32 px and the status was cut).
// The CSS of the run is the console's own (its tailwind config).  PNGs: node tests/dom/paytails-part11-shots.cjs <dir>.
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const test = require("node:test");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-c", path.join(root, "console", "tailwind.config.ts"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await require("./helpers/dom-page.cjs").launch();
});
test.after(async () => { await browser.close(); });
const { openPage } = require("./helpers/dom-page.cjs");

const KINDS = require(path.join(__dirname, "fixtures/money-reconcile/findings.json")).findings;
const RUN = { id: "r1", startedAt: "2026-11-23T01:33:00", finishedAt: "2026-11-23T01:34:00", status: "findings", centresChecked: 11, findings: 4, newFindings: 3, mail: "none", error: null };
const rows = () => [
  { ...KINDS.find((item) => item.details.what === "drift"), id: "f1", orgName: "Деньги-1 Календарь", isNew: true },
  { ...KINDS.find((item) => item.details.what === "identity"), id: "f2", orgName: "TestSchool", isNew: false },
];

for (const width of [1280, 1024]) {
  test(`п.9 (${width}): the table of divergences has no sideways scroll; «Было и раньше» is whole; the long sum wraps instead of pushing the status out`, async () => {
    const { page, errors } = await openPage(browser, "console.entry.tsx", () => null, { width, height: 900 });
    await page.evaluate((d) => window.show(d), { runs: [RUN], latest: RUN, findings: rows() });
    await page.waitForSelector("table");
    await page.waitForTimeout(300);
    const facts = await page.evaluate(() => {
      const wrap = document.querySelector("table").parentElement;
      const cells = [...document.querySelectorAll("tbody tr")].map((tr) => { const last = tr.lastElementChild; const box = last.getBoundingClientRect(); const pill = last.firstElementChild?.getBoundingClientRect(); return { right: Math.round(pill?.right ?? 0), cellRight: Math.round(box.right), wrapRight: Math.round(wrap.getBoundingClientRect().right) }; });
      return { scroll: wrap.scrollWidth - wrap.clientWidth, cells };
    });
    assert.equal(facts.scroll, 0, `no sideways scroll: ${JSON.stringify(facts)}`);
    for (const cell of facts.cells) assert.ok(cell.right <= cell.wrapRight, `the status is inside the panel: ${JSON.stringify(cell)}`);
    assert.equal(await page.locator('[data-testid="money-amount"]').count(), 2);
    assert.deepEqual(errors, []);
    await page.close();
  });
}
