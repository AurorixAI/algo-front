// Money-2 R3c Г1: `node tests/dom/money2-opening-locked-shots.cjs <out dir>` - PNGs of the screens when `can_set_opening` is FALSE (the accounting has started, the user is not the owner): the enrolment
// window (no switch «Остаток на начало учёта») and the table of the openings (one calm line) at 1280 and 375.  Names: `normal-opening-locked-<scene>-<width>.png`.  Prints only suspicious lines.
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
const F = require("../helpers/money2-fixture.cjs");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "openings", `${name}.json`), "utf8"));
const ADMIN = { role: "admin", org_role: "admin" };
// a coherent closed start: the person pressed «Готово», nobody is missing («Заполнено 8 из 8»)
const CLOSED = { left_available: 1, memberships: 9, missing: 0, needs_review: 0, shown: 0, with_opening: 8 };
const summary = { ...fixture("O03_summary_pending"), state: "done", totals: CLOSED, launch_closed: true, can_set_opening: false, can_reopen_launch: false };
const list = { ...fixture("O01_list_pending"), state: "done", totals: CLOSED, launch_closed: true, can_set_opening: false, can_reopen_launch: false };
const OWNER = { role: "owner", org_role: "owner" };
const ownerSummary = { ...summary, can_set_opening: true, can_reopen_launch: true };
const ownerList = { ...list, can_set_opening: true, can_reopen_launch: true };
const server = (r) => {
  if (r.method === "GET" && r.path === "/auth/org/opening-balances/summary") return { json: summary };
  if (r.method === "GET" && r.path === "/auth/org/opening-balances") return { json: list };
  return null;
};
const scenes = [
  { name: "enrol", mount: ["assign", ADMIN, { moneyAvailable: true, mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], groupsBasePath: "/admin/groups" }], server: F.baseServer(server, F.SHORT),
    steps: async (page) => { await page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]'); await page.waitForTimeout(400); await page.evaluate(() => { for (const el of document.querySelectorAll('[role="dialog"] *')) if (el.scrollHeight > el.clientHeight + 8 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; }); } },
  { name: "table", mount: ["openings", ADMIN, { moneyAvailable: true }], server: (r) => (r.path === "/auth/org/groups" ? { json: [] } : server(r)),
    steps: async (page) => { await page.waitForSelector('[data-testid="openings-locked"]'); } },
  { name: "reopen", file: "normal-opening-reopen", mount: ["openings", OWNER, { moneyAvailable: true }],
    server: (r) => (r.path === "/auth/org/groups" ? { json: [] } : r.method === "GET" && r.path === "/auth/org/opening-balances/summary" ? { json: ownerSummary } : r.method === "GET" && r.path === "/auth/org/opening-balances" ? { json: ownerList } : null),
    steps: async (page) => { await page.waitForSelector('[data-testid="openings-reopen"]'); } },
];
(async () => {
  const browser = await launch();
  for (const scene of scenes) {
    for (const width of [1280, 375]) {
      const run = await openPage(browser, "money2.entry.tsx", scene.server, { width, height: width === 375 ? 800 : 900 });
      try {
        const [name, user, props] = scene.mount;
        await run.page.evaluate(([n, u, p]) => window.mount(n, u, p), [name, user, props]);
        await scene.steps(run.page);
        await run.page.waitForTimeout(250);
        if (await run.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) console.log(`SUSPECT ${scene.name} ${width}: horizontal scroll`);
        if (run.errors.length) console.log(`ERRORS ${scene.name} ${width}: ${run.errors.slice(0, 2).join(" | ").slice(0, 200)}`);
        await run.page.screenshot({ path: path.join(out, `${scene.file || `normal-opening-locked-${scene.name}`}-${width}.png`), fullPage: false });
      } catch (error) { console.log(`FAIL ${scene.name} ${width}: ${String(error).slice(0, 160)}`); }
      await run.page.close();
    }
  }
  await browser.close();
  console.log("done");
})();
