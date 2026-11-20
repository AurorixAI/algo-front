// PAY-DUE part 5, point 1: `node tests/dom/paydue-part5-shots.cjs <out dir> [shots]` - the sums of the cards of money (Оплаты, Поступления, the owner's panel) at 1440 / 1280 / 1024 / 768 / 375, the sidebar open
// and folded, with 8-digit sums: for every sum `scrollWidth`, `clientWidth`, the text width and how far the text goes beyond its card.  Prints a table; with `shots` also PNGs of 1280 / 1024 / 768 (open sidebar).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "..", "..");
const out = process.argv[2];
const shots = process.argv[3] === "shots";
fs.mkdirSync(out, { recursive: true });
const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
process.env.DOM_CSS = css;
const { launch, openPage } = require("../helpers/dom-page.cjs");
const { answer, PAGES, SETUPS, measure } = require("../helpers/paydue-part5.cjs");

(async () => {
  const browser = await launch();
  const lines = [];
  for (const page of PAGES) {
    for (const [width, sidebar] of SETUPS) {
      const run = await openPage(browser, "paydue-part5.entry.tsx", answer, { width, height: width === 375 ? 812 : 900 });
      const { rows, doc } = await measure(run, page, sidebar);
      for (const r of rows) lines.push(`${page.name}\t${width}${sidebar === 68 ? "s" : sidebar === 240 ? "o" : "-"}\t${r.text}\tscrollW ${r.sw}/clientW ${r.cw}\ttext(+12%) ${r.tw}/box ${r.inner}\tfs ${r.fs}\tover ${r.over}\tlines ${r.lines}\tdoc-hscroll ${doc}`);
      if (!rows.length) lines.push(`${page.name}\t${width}${sidebar}\tNO SUMS FOUND`);
      if (shots && sidebar !== 68 && [1024, 768, 1280].includes(width)) await run.page.screenshot({ path: path.join(out, `${page.name}-${width}.png`), fullPage: false });
      await run.page.close();
    }
  }
  await browser.close();
  console.log(lines.join("\n"));
})();
