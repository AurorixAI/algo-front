// Money-2 fix 6, the inventory of the other tables: `node tests/dom/money2-fix6-inventory-shots.cjs <out dir> <before|after>` - «Сбор по группам», «Решения», «Оплаты», «Зарплата за месяц» at 1280 / 1024 on the real-data fixtures of the table tests.
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
const R = require("../helpers/real-life-fixture.cjs");
const { monthServer } = require("../helpers/month-list-fixture.cjs");
const SCENES = [
  { name: "collection", entry: "ds.entry.tsx", server: () => null, mount: "collection", props: { collection: R.COLLECTION_REAL }, wait: ".dt-row" },
  { name: "decisions", entry: "money-v.entry.tsx", server: R.decisionsRealServer, mount: "decisions", props: {}, wait: '[data-testid="decision-row"]' },
  { name: "payments", entry: "money-b.entry.tsx", server: R.paymentsRealServer, mount: "payments", props: { refresh: true, search: "bucket=debtors" }, wait: ".dt-row" },
  { name: "payroll-month", entry: "money.entry.tsx", server: monthServer(), mount: "monthPage", props: {}, wait: ".dt-row", search: "month=2026-11", time: "2026-11-05T10:00:00+05:00" },
];
(async () => {
  const browser = await launch();
  for (const scene of SCENES) for (const [width, pad] of [[1280, 240], [1024, 0]]) {
    const { page } = await openPage(browser, scene.entry, scene.server, { width, height: 900 });
    if (scene.time) await page.clock.setFixedTime(new Date(scene.time));
    await page.evaluate(([padding, s]) => { document.getElementById("root").style.boxSizing = "border-box"; document.getElementById("root").style.padding = padding ? `0 32px 0 ${padding + 32}px` : "0 16px"; if (s.search) window.__search = s.search; window.mount(s.mount, { role: "owner", org_role: "owner" }, s.props); }, [pad, { mount: scene.mount, props: scene.props, search: scene.search }]);
    await page.waitForSelector(scene.wait, { timeout: 8000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, `inventory-${scene.name}-${phase}-${width}.png`), fullPage: true });
    await page.close();
  }
  await browser.close();
  console.log("done");
})();
