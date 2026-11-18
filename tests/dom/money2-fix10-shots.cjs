// Money-2 fix 10: `node tests/dom/money2-fix10-shots.cjs <out dir>` - the windows after the owner's remarks (the «?» instead of text, compact balances, «К оплате сразу», the statement centred, the phone window), 1280 / 375, a hint closed and open.
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

const LONG = process.env.LONG === "1";
const ORDINARY = "Ученика убрали сегодня, но после этого ему простили долг 15 000 сум — поэтому он записывается заново: прежние индивидуальная цена и паузы не вернутся";
const PEOPLE = LONG
  ? [["st9", "Новоиспечённый-Подкрепляющийся", "Мухаммадаминхужа"], ["st8", "Второй", "Ученик"], ["st7", "Третий", "Ученик"], ["st6", "Четвёртый", "Ученик"]]
  : [["st9", "Новый", "Ученик"], ["st8", "Второй", "Ученик"], ["st7", "Третий", "Ученик"], ["st6", "Четвёртый", "Ученик"]];
const NAME = (i) => `${PEOPLE[i][1]} ${PEOPLE[i][2]}`;
const GROUP = LONG ? "7-Б Геометрия, углублённая программа подготовки к олимпиаде (вторник и пятница)" : "7-Б Геометрия";
const SAME = { group_id: "g2", group_name: GROUP, membership_id: "m-same", left_on: "2026-11-17", kind: "debt", amount: 38000, same_group: true, text: "Уже был в этой группе, ушёл 17.11.2026 — остался долг 38 000 сум" };
const OTHER = { group_id: "gx", group_name: LONG ? "Алгебра для будущих олимпиадников, углублённая" : "Физика 9", membership_id: "m-x", left_on: "2026-11-10", kind: "advance", amount: 80000, text: "Был в группе — остался аванс 80 000 сум" };
const NO_SUM = (row) => { const r = { ...row }; delete r.amount; return r; };
const NO_MONEY = { role: "admin", org_role: "admin", payments_access: false };

function drawerServer(undone, ordinary, balances = {}) {
  const base = X.drawerServer(undone, (r) => (r.method === "GET" && r.path === "/auth/org/students" ? { json: { items: PEOPLE.map(([id, last, first]) => X.STUDENT(id, last, first)), total: PEOPLE.length } } : null), false, balances);
  return (request) => {
    if (request.method === "POST" && /\/students\/bulk$/.test(request.path) && X.isDry(request)) {
      const ids = request.body.student_ids;
      return { json: { group_id: "g2", added: ids.length, skipped: 0, skipped_details: [], warnings: [], dry_run: true, students: ids.map((id) => ({ student_id: id, group_id: "g2", status: "added", billing: null, past_balances: balances[id] || [], leave_undo: undone.includes(id) ? X.undoOf(true) : ordinary.includes(id) ? { undone: false, text: ORDINARY, restored: [] } : null })) } };
    }
    return base(request);
  };
}
async function shot(page, file, extra = {}) {
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) console.log(`SUSPECT wide ${file}`);
  await page.screenshot({ path: path.join(out, `${file}.png`), ...extra });
}
const scrollDown = (page) => page.evaluate(() => document.querySelectorAll('[role="dialog"] *').forEach((el) => { if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; }));
/** closed + open state of the «?» that is `which` (index) */
async function twoStates(page, file, which = 0, scroll = true) {
  if (scroll) { await scrollDown(page); await page.waitForTimeout(200); }
  await shot(page, `${file}-closed`);
  const helps = page.locator('[role="dialog"] [aria-label="Пояснение"]');
  if (await helps.count() > which) { await helps.nth(which).click(); await page.waitForTimeout(250); await shot(page, `${file}-open`); }
}
const SUF = LONG ? "-long" : "";

(async () => {
  const browser = await launch();
  for (const width of [1280, 375]) {
    const size = { width, height: width === 375 ? 812 : 900 };
    const cases = [
      ["drawer-one-returns", [0], ["st9"], [], {}, OWNER_()],
      ["drawer-part-return", [0, 1, 2], ["st9", "st7"], [], {}, OWNER_()],
      ["drawer-all-return", [0, 2], ["st9", "st7"], [], {}, OWNER_()],
      ["drawer-ordinary-one", [1], [], ["st8"], {}, OWNER_()],
      ["drawer-ordinary-two", [1, 2], [], ["st8", "st7"], {}, OWNER_()],
      ["drawer-debt-same-group", [0], [], [], { st9: [SAME] }, OWNER_()],
      ["drawer-advance-other-group", [0], [], [], { st9: [OTHER] }, OWNER_()],
      ["drawer-no-money-balance", [0], [], [], { st9: [NO_SUM(SAME)] }, NO_MONEY],
      ["drawer-many-balances", [0, 1, 2], [], [], { st9: [SAME], st8: [OTHER], st7: [{ ...OTHER, membership_id: "m-y" }] }, OWNER_()],
    ];
    for (const [file, chosen, undone, ordinary, balances, who] of cases) {
      const { page } = await openPage(browser, "money-b.entry.tsx", drawerServer(undone, ordinary, balances), size);
      const m = who.payments_access !== false;
      await page.evaluate(([w, money, name]) => window.mount("addDrawer", w, money ? { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 380000, valid_from: "2026-09-01" } } : { refresh: false }), [who, m]);
      await page.fill('input[placeholder^="Поиск по имени"]', "Уч");
      await page.fill('input[placeholder^="Поиск по имени"]', "ов");
      await page.fill('input[placeholder^="Поиск по имени"]', "Уч").catch(() => {});
      for (const i of chosen) await page.click(`button:has-text("${PEOPLE[i][1]}")`);
      await page.waitForSelector('[data-testid="leave-undo"], [data-testid="leave-undo-many"], [data-testid="leave-return-many"], [data-testid="past-balances"]');
      if (file === "drawer-many-balances") await page.click('[data-testid="past-balances"] summary');
      await page.waitForTimeout(700);
      await twoStates(page, `${file}-${width}${SUF}`);
      await page.close();
    }
    // the card of a student: cancelled leaving (closed / open)
    {
      const { page } = await openPage(browser, "money2.entry.tsx", X.modalServer({ undone: true, names: LONG ? F.LONG : F.SHORT }), size);
      await page.evaluate(() => window.mount("assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true, groupsBasePath: "/owner/groups", mode: "transfer", currentGroupId: null, currentGroupName: "", excludeGroupIds: [], sourceGroups: [] }));
      await page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
      await page.waitForSelector('[data-testid="leave-undo"]');
      await page.waitForTimeout(400);
      await twoStates(page, `card-undo-${width}${SUF}`);
      await page.close();
    }
    // the debtor of the card: «К оплате сразу» + the debt of this group
    {
      const immediate = { amount: 187000, lessons: 5, text: "К оплате сразу: 187 000 сум (за 5 уроков)", parts: [{ label: "ноябрь", from: "2026-11-17", amount: 187000, lessons: 5, lessons_in_period: 12, whole: false }] };
      const server = F.baseServer((request) => {
        if (request.method === "GET" && request.path === "/auth/org/groups/gt/pay-from-default") return { json: { today: "2026-11-06", first_lesson: "2026-11-09", default_pay_from: "2026-11-09", text: "Оплата с 09.11.2026 — первое занятие группы с сегодня" } };
        if (request.method === "POST" && request.path === "/auth/org/groups/gt/students/st1") {
          const past = request.body && request.body.pay_from;
          return { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, leave_undo: null, past_balances: [{ ...SAME, group_id: "gt" }], billing: past ? { pay_from: request.body.pay_from, explicit: true, default_pay_from: "2026-11-09", first_lesson: "2026-11-09", text: "Оплата с 17.11.2026", immediate } : null } };
        }
        return null;
      }, LONG ? F.LONG : F.SHORT);
      const { page } = await openPage(browser, "money2.entry.tsx", server, size);
      await page.evaluate(() => window.mount("assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true, mode: "add", currentGroupName: "Алгебра 7", excludeGroupIds: ["ga"], groupsBasePath: "/owner/groups" }));
      await page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
      await page.waitForSelector('[data-testid="past-balance"]');
      await page.fill("#assign-group-pay-from", "17.11.2026");
      await page.keyboard.press("Tab");
      await page.waitForSelector('[data-testid="pay-from-immediate-block"]');
      await page.waitForTimeout(400);
      await scrollDown(page);
      await shot(page, `card-debtor-closed-${width}${SUF}`);
      // the hint of the block «К оплате сразу»
      await page.locator('[data-testid="pay-from-immediate-help"] [role="button"]').click(); await page.waitForTimeout(250);
      await shot(page, `card-debtor-open-${width}${SUF}`);
      const h = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); const sc = [...d.querySelectorAll("*")].find((el) => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)); const foot = d.querySelector('[data-modal-part="footer"]'); return { footer: foot ? Math.round(foot.getBoundingClientRect().height) : null, scroller: sc ? Math.round(sc.clientHeight) : null, dialog: Math.round(d.getBoundingClientRect().height) }; });
      console.log(`debtor card ${width}${SUF}`, JSON.stringify(h));
      await page.close();
    }
  }
  // the statement: a table at 1280 (closed menu / open menu), cards at 1024 (work area 720) and 375
  for (const width of [1280, 1024, 375]) {
    for (const withMenu of width === 1280 ? [false, true] : [false]) {
      const { page } = await openPage(browser, "money2.entry.tsx", statementServer(LONG ? F.LONG : F.SHORT), { width, height: 900 });
      await page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
      await page.waitForSelector('[data-testid="statement-row-transfer_in"]');
      if (width === 1024) await page.evaluate(() => { document.getElementById("root").style.width = "720px"; });
      await page.waitForTimeout(300);
      if (withMenu) { await page.locator('[data-testid="statement-table"] button[aria-label="Действия с записью"]').nth(1).click(); await page.waitForTimeout(250); }
      await shot(page, `statement-${width}${withMenu ? "-menu" : ""}${SUF}`, { fullPage: true });
      await page.close();
    }
  }
  // the window «Зачислить учеников» on a phone: 0 / 1 / 4 chosen, the individual price open, the plates
  {
    const size = { width: 375, height: 812 };
    const combos = [["phone-0", [], {}, false], ["phone-1", [0], {}, false], ["phone-4", [0, 1, 2, 3], {}, false], ["phone-4-price", [0, 1, 2, 3], {}, true], ["phone-1-debt-return", [0], { undone: ["st9"], balances: { st9: [SAME] } }, false], ["phone-4-return", [0, 1, 2, 3], { undone: ["st9", "st7"], ordinary: ["st8"], balances: { st9: [SAME] } }, false]];
    for (const [file, chosen, o, price] of combos) {
      const { page } = await openPage(browser, "money-b.entry.tsx", drawerServer(o.undone || [], o.ordinary || [], o.balances || {}), size);
      await page.evaluate(() => window.mount("addDrawer", { role: "owner", org_role: "owner" }, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 380000, valid_from: "2026-09-01" } }));
      await page.fill('input[placeholder^="Поиск по имени"]', "Уч");
      for (const i of chosen) await page.click(`button:has-text("${PEOPLE[i][1]}")`);
      await page.waitForTimeout(700);
      if (price) { const sw = page.locator('button[role="switch"]:has-text("Индивидуальная цена")'); if (await sw.count()) { await sw.first().click(); await page.waitForTimeout(250); } }
      await shot(page, `${file}-top${SUF}`);
      await scrollDown(page); await page.waitForTimeout(200);
      await shot(page, `${file}-bottom${SUF}`);
      // overlaps: the search field must not intersect the price block, rows >= 3 visible
      const geo = await page.evaluate(() => { const r = (sel) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null; }; const body = document.querySelector('[role="dialog"] [data-modal-part="body"]'); return { search: r('input[placeholder^="Поиск по имени"]') && r('input[placeholder^="Поиск по имени"]').bottom, blocks: r('[data-testid="enrol-blocks"]') && r('[data-testid="enrol-blocks"]').top, list: r('[data-testid="enrol-list"]') && [r('[data-testid="enrol-list"]').top, r('[data-testid="enrol-list"]').bottom], rows: document.querySelectorAll('[data-testid="enrol-list"] button').length, footer: r('[data-modal-part="footer"]') && r('[data-modal-part="footer"]').height, bodyH: body && body.getBoundingClientRect().height, bodyScroll: body && body.scrollHeight }; });
      console.log(file, JSON.stringify(geo));
      await page.close();
    }
  }
  await browser.close();
  console.log("done");
})();
function OWNER_() { return { role: "owner", org_role: "owner" }; }
