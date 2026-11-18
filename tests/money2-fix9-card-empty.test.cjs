// Money-2 fix 9 (walk M12, defect 3): in a CARD of DataTable (the statement at 1024 with the side panel open, and at 375) a row without the menu «⋯» left an empty strip of 40-50 px at the bottom: the empty cell
// of the actions kept its margin, its row gap and the height of a button.  An empty cell of actions takes no room in a card; in a TABLE it stays a cell of its column (the grid is the same).
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const F = require("./helpers/money2-fixture.cjs");
const { statementServer } = require("./helpers/statement-all-kinds.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

async function open(width) {
  const run = await openPage(browser, "money2.entry.tsx", statementServer(F.SHORT), { width, height: 900 });
  await run.page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
  await run.page.waitForSelector('[data-testid="statement-row-transfer_in"]');
  await run.page.waitForTimeout(200);
  return run;
}
// for each row of the table: the strip under its last VISIBLE content (the padding of the card is 14 px = 0.875rem), and the empty cells of actions with their height and display
const FACTS = () => Array.from(document.querySelectorAll('[data-testid="statement-table"] .dt-row:not(.dt-row-span)')).map((row) => {
  const box = row.getBoundingClientRect();
  const visible = Array.from(row.querySelectorAll(".dt-cell")).filter((cell) => getComputedStyle(cell).display !== "none" && cell.getBoundingClientRect().height > 0);
  const bottom = Math.max(...visible.map((cell) => cell.getBoundingClientRect().bottom));
  const empties = Array.from(row.querySelectorAll('.dt-cell[data-actions="true"]')).filter((cell) => cell.querySelector("button") === null);
  return { strip: Math.round((box.bottom - bottom) * 10) / 10, empties: empties.length, emptyDisplay: empties.map((cell) => getComputedStyle(cell).display), emptyHeight: empties.map((cell) => cell.getBoundingClientRect().height) };
});

for (const width of [375, 1024]) {
  test(`${width} (a card): no empty strip under a row without the menu «⋯» - the strip is the padding of the card only`, async () => {
    const run = await open(width);
    const facts = await run.page.evaluate(FACTS);
    assert.ok(facts.length >= 5, "rows found");
    assert.ok(facts.some((f) => f.empties > 0), "the statement has rows with an empty cell of actions (else the test proves nothing)");
    for (const f of facts) assert.ok(f.strip <= 15.5, JSON.stringify(f));
    for (const f of facts) for (const h of f.emptyHeight) assert.equal(h, 0, JSON.stringify(f));
    await run.page.close();
  });
}

test("1280 (a table): the empty cell of actions stays a cell of the grid (the columns do not move)", async () => {
  const run = await open(1280);
  const facts = await run.page.evaluate(FACTS);
  assert.ok(facts.some((f) => f.empties > 0));
  for (const f of facts) for (const d of f.emptyDisplay) assert.notEqual(d, "none", JSON.stringify(f));
  const rights = await run.page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="statement-table"] .dt-row:not(.dt-row-span) .dt-cell[data-col="balance"]')).map((c) => Math.round(c.getBoundingClientRect().right)));
  assert.equal(new Set(rights).size, 1, "one right edge of the column: " + rights);
  await run.page.close();
});
