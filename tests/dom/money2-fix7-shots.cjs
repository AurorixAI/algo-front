// Money-2 fix 7: `node tests/dom/money2-fix7-shots.cjs <out dir>` - the windows of enrolment of a student who comes back the day of the leaving (card without groups, drawer of the group page with one / two chosen)
// and the return of a debtor into the same group, at 1280 / 1024 / 375, normal and long names.
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
const OWNER = { role: "owner", org_role: "owner" };
const IMMEDIATE = { amount: 187000, lessons: 5, text: "К оплате сразу: 187 000 сум (за 5 уроков)", parts: [{ label: "ноябрь", from: "2026-11-04", amount: 187000, lessons: 5, lessons_in_period: 12, whole: false }] };

(async () => {
  const browser = await launch();
  for (const [setName, names, long] of [["normal", F.SHORT, false], ["long", F.LONG, true]]) {
    for (const width of [1280, 1024, 375]) {
      const size = { width, height: width === 375 ? 812 : 900 };
      const suffix = `${width}${long ? "-long" : ""}`;
      const modal = async (file, server, props, after) => {
        const { page } = await openPage(browser, "money2.entry.tsx", server, size);
        await page.evaluate(([p]) => window.mount("assign", { role: "owner", org_role: "owner" }, p), [{ moneyAvailable: true, groupsBasePath: "/owner/groups", ...props }]);
        await page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
        await page.waitForTimeout(700);
        if (after) await after(page);
        await page.evaluate(() => document.querySelectorAll('[role="dialog"] *').forEach((el) => { if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; }));
        await page.waitForTimeout(200);
        await page.locator('[role="dialog"]').screenshot({ path: path.join(out, `${file}-${suffix}.png`) });
        await page.close();
      };
      await modal("card-no-groups-leave-undo", X.modalServer({ undone: true, names }), { mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] });
      await modal("debtor-return-same-group", X.modalServer({ undone: false, names, pastBalances: [{ group_id: "gt", group_name: names.T, membership_id: "m-old-t", left_on: "2026-11-17", kind: "debt", amount: 38000, text: `В этой группе с прошлого раза (ушёл 17.11.2026) остался долг 38 000 сум` }, { group_id: "gb", group_name: names.B, membership_id: "m-old-b", left_on: "2026-11-10", kind: "debt", amount: 120000, text: "x" }], immediate: IMMEDIATE }),
        { mode: "add", currentGroupName: names.A, excludeGroupIds: ["ga"] },
        async (page) => { await page.fill("#assign-group-pay-from", "04.11.2026"); await page.keyboard.press("Tab"); await page.waitForSelector('[data-testid="pay-from-immediate"]:not(:has-text("Считаем"))'); await page.waitForTimeout(300); });
      // the drawer of the group page: one, then two chosen
      for (const [file, undone, chosen] of [["drawer-one-leave-undo", ["st9"], 1], ["drawer-two-one-leave-undo", ["st9"], 2]]) {
        const { page } = await openPage(browser, "money-b.entry.tsx", X.drawerServer(undone, () => null, long), size);
        await page.evaluate(() => window.mount("addDrawer", { role: "owner", org_role: "owner" }, { summary: { accountingStart: "2026-09-01" }, refresh: false }));
        await page.fill('input[placeholder^="Поиск по имени"]', "о");
        const buttons = page.locator('button:has-text("Ученик"), button:has-text("Мухаммадаминхужа")');
        for (const name of chosen === 1 ? [long ? "Новоиспечённый" : "Новый"] : [long ? "Новоиспечённый" : "Новый", "Второй"]) await page.click(`button:has-text("${name}")`);
        await page.waitForSelector('[data-testid="leave-undo"], [data-testid="leave-undo-many"]');
        if (chosen === 2) await page.click('[data-testid="leave-undo-many"] summary');
        await page.waitForTimeout(700);
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) console.log(`SUSPECT wide ${file} ${suffix}`);
        await page.locator('[role="dialog"]').screenshot({ path: path.join(out, `${file}-${suffix}.png`) });
        await page.close();
      }
    }
  }
  await browser.close();
  console.log("done");
})();
