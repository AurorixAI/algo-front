// Money-2 fix 10В: `node tests/dom/money2-fix10c-shots.cjs <out dir>` - the message after «Зачислить в группу» (ordinary / the student stays in other groups / the leaving cancelled; short and long names),
// the toggle «Остаток на начало учёта» (owner before the launch is closed / administrator after), the cards of the groups with «Другой класс», the window for a role without the right to money.
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
const { launch, openPage } = require("../helpers/dom-page.cjs");
const X = require("../helpers/money2-fix7.cjs");
const { F } = X;
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "openings", `${name}.json`), "utf8"));
const OWNER = { role: "owner", org_role: "owner" };
const ADMIN = { role: "admin", org_role: "admin" };
const SUMMARY = (canSet) => ({ ...fixture("O03_summary_pending"), state: "done", launch_closed: !canSet, can_set_opening: canSet, can_reopen_launch: canSet });
const PEOPLE = [["st9", "Новый"]];
const scrollDown = (page) => page.evaluate(() => document.querySelectorAll('[role="dialog"] *').forEach((el) => { if (el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; }));
async function shot(page, file) {
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) console.log(`SUSPECT wide ${file}`);
  await page.screenshot({ path: path.join(out, `${file}.png`) });
}

(async () => {
  const browser = await launch();
  for (const width of [1280, 375]) {
    const size = { width, height: width === 375 ? 812 : 900 };
    // the message after the action
    for (const [file, names, undone, props] of [
      ["card-done-toast-ordinary", F.SHORT, false, { mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] }],
      ["card-done-toast-stays", F.SHORT, false, { mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: F.SHORT.A }] }],
      ["card-done-toast-undo", F.SHORT, true, { mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: F.SHORT.A }] }],
      ["card-done-toast-long", F.LONG, true, { mode: "add", currentGroupName: F.LONG.A, excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: F.LONG.A }], studentName: "Золотухин-Белоусов-Сокольников Александр-Константин" }],
    ]) {
      const { page } = await openPage(browser, "money2.entry.tsx", X.modalServer({ undone, names }), size);
      await page.evaluate((p) => window.mount("assign", { role: "owner", org_role: "owner" }, p), { moneyAvailable: true, groupsBasePath: "/owner/groups", closeOnDone: true, ...props });
      await page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
      await page.waitForSelector('[data-testid="assign-submit"]:not([disabled])'); await page.waitForTimeout(700);
      await page.click('[data-testid="assign-submit"]'); await page.waitForSelector("[data-tone]"); await page.waitForTimeout(700);
      await shot(page, `${file}-${width}`);
      await page.close();
    }
    // the toggle of the opening balance
    for (const [file, user, canSet] of [["drawer-opening-owner", OWNER, true], ["drawer-opening-admin", ADMIN, false]]) {
      const base = X.drawerServer([], (r) => (r.method === "GET" && r.path === "/auth/org/students" ? { json: { items: PEOPLE.map(([id, last]) => X.STUDENT(id, last)), total: 1 } } : r.method === "GET" && r.path === "/auth/org/opening-balances/summary" ? { json: SUMMARY(canSet) } : null));
      const { page } = await openPage(browser, "money-b.entry.tsx", base, size);
      await page.evaluate(([w]) => window.mount("addDrawer", w, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 380000, valid_from: "2026-09-01" } }), [user]);
      await page.click('button:has-text("Новый")');
      await page.waitForSelector('[data-testid="add-price-settings"]'); await page.waitForTimeout(700);
      await scrollDown(page); await page.waitForTimeout(200);
      await shot(page, `${file}-${width}`);
      await page.close();
    }
    // the cards of the groups: the class
    for (const [file, names] of [["card-groups-class", F.SHORT], ["card-groups-class-long", F.LONG]]) {
      const { page } = await openPage(browser, "money2.entry.tsx", F.baseServer(() => null, names), size);
      await page.evaluate(() => window.mount("assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true, groupsBasePath: "/owner/groups", mode: "add", currentGroupName: "Алгебра 7", excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: "Алгебра 7" }] }));
      await page.waitForSelector('[data-testid="assign-group-card"]'); await page.waitForTimeout(500);
      await shot(page, `${file}-${width}`);
      await page.close();
    }
    // a role without the right to money
    {
      const { page } = await openPage(browser, "money2.entry.tsx", X.modalServer({ undone: false, names: F.SHORT }), size);
      await page.evaluate(() => window.mount("assign", { role: "admin", org_role: "admin" }, { moneyAvailable: false, groupsBasePath: "/admin/groups", mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] }));
      await page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
      await page.waitForTimeout(900); await scrollDown(page);
      await shot(page, `no-money-card-${width}`);
      await page.close();
    }
  }
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
