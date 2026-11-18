// Money-2 fix 9: `node tests/dom/money2-fix9-shots.cjs <out dir>` - the windows of the walk M12 after the fixes, at 1280 / 375 (and the statement cards at 1024).
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
const { statementServer } = require("../helpers/statement-all-kinds.cjs");

const ORDINARY = "Сегодня ученика перевели в группу «Физика». Чтобы вернуть всё как было, переведите его обратно из этой группы";
const PEOPLE = [["st9", "Новый"], ["st8", "Второй"], ["st7", "Третий"]];
const SAME = { group_id: "g2", group_name: "7-Б Геометрия", membership_id: "m-same", left_on: "2026-11-17", kind: "debt", amount: 38000, same_group: true, text: "В этой группе с прошлого раза остался долг 38 000 сум" };
const NO_SUM = { ...SAME }; delete NO_SUM.amount; NO_SUM.text = "В этой группе с прошлого раза остался долг";
function drawerServer(undone, ordinary, balances = {}) {
  const base = X.drawerServer(undone, (r) => (r.method === "GET" && r.path === "/auth/org/students" ? { json: { items: PEOPLE.map(([id, last]) => X.STUDENT(id, last)), total: 3 } } : null), false, balances);
  return (request) => {
    if (request.method === "POST" && /\/students\/bulk$/.test(request.path) && X.isDry(request)) {
      const ids = request.body.student_ids;
      return { json: { group_id: "g2", added: ids.length, skipped: 0, skipped_details: [], warnings: [], dry_run: true, students: ids.map((id) => ({ student_id: id, group_id: "g2", status: "added", billing: null, past_balances: balances[id] || [], leave_undo: undone.includes(id) ? X.undoOf(true) : ordinary.includes(id) ? { undone: false, text: ORDINARY, restored: [] } : null })) } };
    }
    return base(request);
  };
}
const scrollDown = (page) => page.evaluate(() => document.querySelectorAll('[role="dialog"] *').forEach((el) => { if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; }));
async function snap(page, file, el = '[role="dialog"]') {
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) console.log(`SUSPECT wide ${file}`);
  await page.locator(el).screenshot({ path: path.join(out, `${file}.png`) });
}

(async () => {
  const browser = await launch();
  for (const width of [1280, 375]) {
    const size = { width, height: width === 375 ? 812 : 900 };
    // the drawer: one returns / 2 of 3 return / all return / one ordinary / ordinary + cancelling / admin without the right with a debt of this group
    const cases = [
      ["drawer-one-returns", ["Новый"], ["st9"], [], {}, true],
      ["drawer-two-of-three-return", ["Новый", "Второй", "Третий"], ["st9", "st7"], [], {}, true],
      ["drawer-all-return", ["Новый", "Третий"], ["st9", "st7"], [], {}, true],
      ["drawer-one-ordinary", ["Второй"], [], ["st8"], {}, true],
      ["drawer-ordinary-and-cancel", ["Новый", "Второй", "Третий"], ["st9"], ["st8", "st7"], {}, true],
      ["drawer-admin-no-money-debt", ["Новый"], [], [], { st9: [NO_SUM] }, false],
      ["drawer-money-debt-link", ["Новый"], [], [], { st9: [SAME] }, true],
    ];
    for (const [file, chosen, undone, ordinary, balances, money] of cases) {
      const { page } = await openPage(browser, "money-b.entry.tsx", drawerServer(undone, ordinary, balances), size);
      const who = money ? { role: "owner", org_role: "owner" } : { role: "admin", org_role: "admin", payments_access: false };
      await page.evaluate(([w, m]) => window.mount("addDrawer", w, m ? { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 380000, valid_from: "2026-09-01" } } : { refresh: false }), [who, money]);
      await page.fill('input[placeholder^="Поиск по имени"]', "Уч");
      for (const name of chosen) await page.click(`button:has-text("${name} Ученик")`);
      await page.waitForSelector('[data-testid="leave-undo"], [data-testid="leave-undo-many"], [data-testid="leave-return-many"], [data-testid="past-balances"]');
      for (const sel of ['[data-testid="leave-undo-many"] summary', '[data-testid="leave-return-many"] summary']) if (await page.locator(sel).count()) await page.click(sel);
      await page.waitForTimeout(700);
      await scrollDown(page);
      await page.waitForTimeout(200);
      await snap(page, `${file}-${width}`);
      await page.close();
    }
    // the card of a student: the plate of a cancelled leaving (one plate, one grey line)
    {
      const { page } = await openPage(browser, "money2.entry.tsx", X.modalServer({ undone: true, names: F.SHORT }), size);
      await page.evaluate(() => window.mount("assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true, groupsBasePath: "/owner/groups", mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] }));
      await page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
      await page.waitForSelector('[data-testid="leave-undo"]');
      await page.waitForTimeout(400); await scrollDown(page); await page.waitForTimeout(200);
      await snap(page, `card-undo-plate-${width}`);
      await page.close();
    }
    // the debtor: a debt of this group + «К оплате сразу: …» and the row «Ноябрь · 5 уроков из 12» (the server sends `from: null`)
    for (const [file, from] of [["card-debtor-more-nofrom", null], ["card-debtor-more-from", "2026-11-17"]]) {
      const immediate = { amount: 187000, lessons: 5, text: "К оплате сразу: 187 000 сум (за 5 уроков)", parts: [{ label: "ноябрь", from, amount: 187000, lessons: 5, lessons_in_period: 12, whole: false }] };
      const server = F.baseServer((request) => {
        if (request.method === "GET" && request.path === "/auth/org/groups/gt/pay-from-default") return { json: { today: "2026-11-06", first_lesson: "2026-11-09", default_pay_from: "2026-11-09", text: "Оплата с 09.11.2026 — первое занятие группы с сегодня" } };
        if (request.method === "POST" && request.path === "/auth/org/groups/gt/students/st1") {
          const past = request.body && request.body.pay_from;
          return { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, leave_undo: null, past_balances: [{ ...SAME, group_id: "gt", group_name: F.SHORT.T }], billing: past ? { pay_from: request.body.pay_from, explicit: true, default_pay_from: "2026-11-09", first_lesson: "2026-11-09", text: "Оплата с выбранного дня", immediate } : null } };
        }
        return null;
      }, F.SHORT);
      const { page } = await openPage(browser, "money2.entry.tsx", server, size);
      await page.evaluate(() => window.mount("assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true, mode: "add", currentGroupName: "Алгебра 7", excludeGroupIds: ["ga"], groupsBasePath: "/owner/groups" }));
      await page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
      await page.waitForSelector('[data-testid="past-balance"]');
      await page.fill("#assign-group-pay-from", "17.11.2026");
      await page.keyboard.press("Tab");
      await page.waitForSelector('[data-testid="pay-from-immediate"]:not(:has-text("Считаем"))');
      await page.waitForTimeout(400); await scrollDown(page); await page.waitForTimeout(200);
      await snap(page, `${file}-${width}`);
      await page.close();
    }
    // the statement page of an administrator without the right: the refusal and the way back
    {
      const { page } = await openPage(browser, "money2-fix9.entry.tsx", () => ({ status: 403, json: { detail: { code: "PAYMENTS_FORBIDDEN", message: "Нет доступа к оплатам" } } }), size);
      await page.evaluate(() => window.mount("statement", { role: "admin", org_role: "admin", payments_access: false }));
      await page.waitForSelector('[role="alert"]');
      await page.waitForTimeout(300);
      await snap(page, `statement-refusal-${width}`, "#root");
      await page.close();
    }
  }
  // the statement: a table at 1280, cards at 1024 and 375 (no empty strip under a row without «⋯»)
  for (const width of [1280, 1024, 375]) {
    const { page } = await openPage(browser, "money2.entry.tsx", statementServer(F.SHORT), { width, height: 900 });
    await page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
    await page.waitForSelector('[data-testid="statement-row-transfer_in"]');
    if (width === 1024) await page.evaluate(() => { document.getElementById("root").style.width = "720px"; });   // the side panel is open: 720 px of work area = cards
    await page.waitForTimeout(300);
    await snap(page, `statement-${width}`, '[data-testid="statement-table"]');
    await page.close();
  }
  await browser.close();
  console.log("done");
})();
