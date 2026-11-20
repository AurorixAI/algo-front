// PAY-DUE part 5 (screens after the walk M18) in a real browser: the sum of every card of money fits its card on ONE line at every window width 640...1440, the sidebar open and folded
// (Оплаты, Поступления, the owner's panel) with 8-digit sums, and the view of 1280 does not change.  Point 1 (D2).
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { answer, PAGES, SETUPS, measure } = require("./helpers/paydue-part5.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

for (const page of PAGES) {
  test(`${page.name}: every sum is inside its card, on one line, without a sideways scroll (1440 / 1280 / 1024 / 900 / 768 / 640 / 375, sidebar open and folded)`, async () => {
    for (const [width, sidebar] of SETUPS) {
      const run = await openPage(browser, "paydue-part5.entry.tsx", answer, { width, height: width === 375 ? 812 : 900 });
      try {
        const { rows, doc } = await measure(run, page, sidebar);
        const label = `${page.name} ${width}/${sidebar}`;
        assert.ok(rows.length >= 2, `${label}: the sums are on the screen (${rows.length})`);
        for (const r of rows) {
          assert.equal(r.over, 0, `${label}: «${r.text}» text ${r.tw} px does not fit the box ${r.inner} px (goes out by ${r.over})`);
          assert.ok(r.sw <= r.cw + 1, `${label}: «${r.text}» scrollWidth ${r.sw} > clientWidth ${r.cw}`);
          assert.equal(r.lines, 1, `${label}: «${r.text}» is on ${r.lines} lines`);
          assert.ok(r.fs >= 14, `${label}: «${r.text}» is ${r.fs} px, unreadable`);
        }
        assert.ok(doc <= 0, `${label}: the page scrolls sideways by ${doc}`);
        // the view of 1280 (sidebar open) does not change: the sum keeps its full size where it always fitted
        if (width === 1280 && sidebar === 240 && page.name === "payments") for (const r of rows) assert.equal(r.fs, 30, `1280: «${r.text}» keeps 30 px`);
      } finally { await run.page.close(); }
    }
  });
}
