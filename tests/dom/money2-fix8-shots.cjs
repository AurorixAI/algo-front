// Money-2 fix 8: `node tests/dom/money2-fix8-shots.cjs <out dir>` - the drawer «Зачислить учеников» (ONE bulk probe: leave_undo and past_balances of the server) and the card of a student with one plate,
// at 1280 / 1024 / 375, normal and long names.
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

const SAME = { group_id: "g2", group_name: "7-Б Геометрия", membership_id: "m-same", left_on: "2026-11-17", kind: "debt", amount: 38000, same_group: true, text: "В этой группе с прошлого раза остался долг 38 000 сум" };
const OTHER = (n, name) => ({ group_id: "gx" + n, group_name: name + " " + n, membership_id: "m-x" + n, left_on: "2026-11-1" + n, kind: n === 2 ? "advance" : "debt", amount: 10000 * n, text: name });

(async () => {
  const browser = await launch();
  for (const long of [false, true]) {
    const algebra = long ? "Алгебра, углублённая программа подготовки к олимпиаде" : "Алгебра";
    const people = long
      ? [["st9", "Новоиспечённый-Подкрепляющийся", "Мухаммадаминхужа"], ["st8", "Второй-Очень-Длинная-Фамилия", "Абдурахмонджон"], ["st7", "Третий-Тоже-Длинный", "Шахзодбек"]]
      : [["st9", "Новый", "Ученик"], ["st8", "Второй", "Ученик"], ["st7", "Третий", "Ученик"]];
    const students = (request) => (request.method === "GET" && request.path === "/auth/org/students" ? { json: { items: people.map(([id, last, first]) => X.STUDENT(id, last, first)), total: 3 } } : null);
    const cases = [
      ["drawer-one-returns", ["st9"], 1, {}],
      ["drawer-two-of-three-return", ["st9", "st7"], 3, {}],
      ["drawer-all-return", ["st9", "st8", "st7"], 3, {}],
      ["drawer-debtor-same-group", [], 1, { st9: [SAME] }],
      ["drawer-three-with-balances", [], 3, { st9: [SAME], st8: [OTHER(2, algebra)], st7: [OTHER(3, algebra)] }],
    ];
    for (const width of [1280, 1024, 375]) {
      const size = { width, height: width === 375 ? 812 : 900 };
      const suffix = `${width}${long ? "-long" : ""}`;
      for (const [file, undone, chosen, balances] of cases) {
        const { page } = await openPage(browser, "money-b.entry.tsx", X.drawerServer(undone, students, long, balances), size);
        await page.evaluate(() => window.mount("addDrawer", { role: "owner", org_role: "owner" }, { summary: { accountingStart: "2026-09-01" }, refresh: false }));
        await page.fill('input[placeholder^="Поиск по имени"]', "о");
        for (const [, last] of people.slice(0, chosen)) await page.click(`button:has-text("${last}")`);
        await page.waitForSelector('[data-testid="leave-undo"], [data-testid="leave-undo-many"], [data-testid="past-balances"]');
        for (const sel of ['[data-testid="leave-undo-many"] summary', '[data-testid="past-balances"] summary']) if (await page.locator(sel).count()) await page.click(sel);
        await page.waitForTimeout(700);
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) console.log(`SUSPECT wide ${file} ${suffix}`);
        await page.evaluate(() => document.querySelectorAll('[role="dialog"] *').forEach((el) => { if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; }));
        await page.waitForTimeout(200);
        await page.locator('[role="dialog"]').screenshot({ path: path.join(out, `${file}-${suffix}.png`) });
        await page.close();
      }
      // the card of a student: ONE plate (the sentence of the server, the grey line as its last line)
      const { page } = await openPage(browser, "money2.entry.tsx", X.modalServer({ undone: true, names: long ? F.LONG : F.SHORT }), size);
      await page.evaluate(() => window.mount("assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true, groupsBasePath: "/owner/groups", mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] }));
      await page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
      await page.waitForSelector('[data-testid="leave-undo"]');
      await page.waitForTimeout(500);
      await page.evaluate(() => document.querySelectorAll('[role="dialog"] *').forEach((el) => { if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; }));
      await page.locator('[role="dialog"]').screenshot({ path: path.join(out, `card-one-plate-${suffix}.png`) });
      await page.close();
    }
  }
  await browser.close();
  console.log("done");
})();
