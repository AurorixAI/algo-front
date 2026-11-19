// `node tests/dom/enrol-v2-shots.cjs <out dir>` - the 15 frames of the mock-up from the product: 1280 (375 for the phone frames), and with LONG=1 the long names.  Headless Chromium, no window.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "..", "..");
const [out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
process.env.DOM_CSS = css;
const { launch } = require("../helpers/dom-page.cjs");
const { FRAMES } = require("../helpers/enrol-v2-frames.cjs");

const NAMES = { 1: "open", 2: "three", 3: "terms-open", 4: "done", 5: "other-group", 6: "special-rows", 7: "sums-differ", 8: "many", 9: "counting", 10: "no-price", 11: "no-money", 12: "not-all", 13: "phone-one", 14: "phone-terms", 15: "from-card" };
const only = (process.env.FRAMES || "").split(",").filter(Boolean).map(Number);
const LONG = process.env.LONG === "1";
(async () => {
  const browser = await launch();
  const ctx = { browser };
  for (const n of Object.keys(FRAMES).map(Number)) {
    if (only.length && !only.includes(n)) continue;
    const width = [13, 14].includes(n) ? 375 : 1280;
    const run = await FRAMES[n](ctx, { width, long: LONG });
    await run.page.waitForTimeout(300);
    const wide = await run.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (wide) console.log(`SUSPECT wide frame ${n}`);
    if (run.errors.length) console.log(`ERRORS frame ${n}: ${run.errors.slice(0, 2).join(" | ").slice(0, 200)}`);
    await run.page.screenshot({ path: path.join(out, `${String(n).padStart(2, "0")}-${NAMES[n]}${LONG ? "-long" : ""}.png`) });
    await run.page.close();
  }
  await browser.close();
  fs.rmSync(path.dirname(css), { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
