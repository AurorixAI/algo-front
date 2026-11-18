// Money-2 fix 10B: `node tests/dom/money2-fix10b-shots.cjs <out dir>` - «Всего к оплате сразу» for several students (three / eight, long names, one with nothing to pay) and the hints of the returning students (part return / two ordinary).
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

const ORDINARY = "Ученика убрали сегодня, но после этого ему простили долг 15 000 сум — поэтому он записывается заново: прежние индивидуальная цена и паузы не вернутся";
const PEOPLE = [["st9", "Новый", "Ученик"], ["st8", "Второй", "Ученик"], ["st7", "Третий", "Ученик"], ["st6", "Четвёртый", "Ученик"], ["st5", "Пятый", "Ученик"], ["st4", "Новоиспечённый-Подкрепляющийся", "Мухаммадаминхужа"], ["st3", "Седьмой", "Ученик"], ["st2", "Золотухин-Белоусов-Сокольников", "Александр-Константин"]];
const PART = (label, from, amount, lessons, inPeriod, whole = false) => ({ label, from, amount, lessons, lessons_in_period: inPeriod, whole });
// per student: null = nothing to pay at once
const IMMEDIATE = { st9: [PART("ноябрь", "2026-11-04", 187000, 5, 12)], st8: [PART("октябрь", "2026-10-27", 89000, 2, 9), PART("ноябрь", "", 380000, 12, 12, true)], st7: [PART("ноябрь", "2026-11-04", 187000, 5, 12)], st6: [PART("ноябрь", "2026-11-04", 187000, 5, 12)], st5: [PART("ноябрь", "2026-11-04", 187000, 5, 12)], st4: [PART("ноябрь", "2026-11-04", 187000, 5, 12)], st3: null, st2: [PART("ноябрь", "2026-11-04", 187000, 5, 12)] };
const sumOf = (parts) => parts.reduce((s, p) => s + p.amount, 0);
const OWNER = { role: "owner", org_role: "owner" };

function drawerServer(undone, ordinary) {
  const base = X.drawerServer(undone, (r) => (r.method === "GET" && r.path === "/auth/org/students" ? { json: { items: PEOPLE.map(([id, last, first]) => X.STUDENT(id, last, first)), total: PEOPLE.length } } : null), false, {});
  return (request) => {
    if (request.method === "POST" && /\/students\/bulk$/.test(request.path) && X.isDry(request)) {
      const ids = request.body.student_ids;
      const billing = (id) => (request.body.pay_from ? { pay_from: request.body.pay_from, explicit: true, default_pay_from: "2026-11-09", first_lesson: "2026-11-09", text: "Оплата с выбранного дня", immediate: IMMEDIATE[id] ? { amount: sumOf(IMMEDIATE[id]), lessons: 5, text: `К оплате сразу: ${sumOf(IMMEDIATE[id])} сум`, parts: IMMEDIATE[id] } : null } : null);
      const total = ids.reduce((s, id) => s + (IMMEDIATE[id] ? sumOf(IMMEDIATE[id]) : 0), 0);
      return { json: { group_id: "g2", added: ids.length, skipped: 0, skipped_details: [], warnings: [], dry_run: true, immediate_total: request.body.pay_from ? { text: `Всего к оплате сразу: ${total} сум` } : null, students: ids.map((id) => ({ student_id: id, group_id: "g2", status: "added", billing: billing(id), past_balances: [], leave_undo: undone.includes(id) ? X.undoOf(true) : ordinary.includes(id) ? { undone: false, text: ORDINARY, restored: [] } : null })) } };
    }
    return base(request);
  };
}
async function shot(page, file) {
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) console.log(`SUSPECT wide ${file}`);
  await page.screenshot({ path: path.join(out, `${file}.png`) });
}
const scrollDown = (page) => page.evaluate(() => document.querySelectorAll('[role="dialog"] *').forEach((el) => { if (el.getAttribute('data-testid') !== 'pay-from-immediate-students' && el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; }));

(async () => {
  const browser = await launch();
  for (const width of [1280, 375]) {
    const size = { width, height: width === 375 ? 812 : 900 };
    // «Всего к оплате сразу»: three / eight students (hint closed / open)
    for (const [file, chosen] of [["immediate-three", [0, 1, 2]], ["immediate-eight", [0, 1, 2, 3, 4, 5, 6, 7]]]) {
      const { page } = await openPage(browser, "money-b.entry.tsx", drawerServer([], []), size);
      await page.evaluate((w) => window.mount("addDrawer", w, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 380000, valid_from: "2026-09-01" } }), OWNER);
      await page.fill('input[placeholder^="Поиск по имени"]', "Уч").catch(() => {});
      for (const i of chosen) await page.click(`button:has-text("${PEOPLE[i][1]}")`);
      await page.fill("#add-student-pay-from", "04.11.2026");
      await page.keyboard.press("Tab");
      await page.waitForSelector('[data-testid="pay-from-immediate-block"]');
      await page.waitForTimeout(500);
      await scrollDown(page); await page.waitForTimeout(200);
      await shot(page, `${file}-${width}-closed`);
      const geo = await page.evaluate(() => { const b = document.querySelector('[data-testid="pay-from-immediate-block"]').getBoundingClientRect(); const l = document.querySelector('[data-testid="pay-from-immediate-students"]'); const sums = [...document.querySelectorAll('[data-testid="pay-from-immediate-student-sum"]')].map((e) => Math.round(e.getBoundingClientRect().right)); return { block: Math.round(b.height), list: Math.round(l.getBoundingClientRect().height), listScroll: l.scrollHeight, rights: [...new Set(sums)] }; });
      console.log(file, width, JSON.stringify(geo));
      await page.locator('[data-testid="pay-from-immediate-help"] [role="button"]').first().click(); await page.waitForTimeout(250);
      await shot(page, `${file}-${width}-open`);
      await page.close();
    }
    // the hints of the returning students
    for (const [file, chosen, undone, ordinary] of [["drawer-part-return", [0, 1, 2], ["st9"], ["st8", "st7"]], ["drawer-ordinary-two", [1, 2], [], ["st8", "st7"]]]) {
      const { page } = await openPage(browser, "money-b.entry.tsx", drawerServer(undone, ordinary), size);
      await page.evaluate((w) => window.mount("addDrawer", w, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 380000, valid_from: "2026-09-01" } }), OWNER);
      await page.fill('input[placeholder^="Поиск по имени"]', "Уч").catch(() => {});
      for (const i of chosen) await page.click(`button:has-text("${PEOPLE[i][1]}")`);
      await page.waitForSelector('[data-testid="leave-return-many"]');
      await page.waitForTimeout(700);
      await scrollDown(page); await page.waitForTimeout(200);
      await shot(page, `${file}-${width}-closed`);
      await page.locator('[role="dialog"] [aria-label="Пояснение"]').first().click(); await page.waitForTimeout(250);
      await shot(page, `${file}-${width}-open`);
      await page.close();
    }
  }

  // fix 10B, items 5-6: the windows without the plates and the noise, the messages of success, the statement
  for (const width of [1280, 375]) {
    const size = { width, height: width === 375 ? 812 : 900 };
    const OPEN = (page, chosen) => page.evaluate((w) => window.mount("addDrawer", w, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 380000, valid_from: "2026-09-01" } }), OWNER).then(async () => { await page.fill('input[placeholder^="Поиск по имени"]', "Уч").catch(() => {}); for (const i of chosen) await page.click(`button:has-text("${PEOPLE[i][1]}")`); await page.waitForTimeout(800); });
    const toastOf = async (summary, file) => {
      const t = await openPage(browser, "money-b.entry.tsx", () => null, size);
      await t.page.evaluate((summary) => window.mount("toastDemo", { role: "owner", org_role: "owner" }, { summary }), summary);
      await t.page.waitForSelector('[role="status"]'); await t.page.waitForTimeout(500);
      await shot(t.page, file); await t.page.close();
    };
    const lastSummary = async (page) => { await page.waitForFunction(() => window.__log.some((line) => line.startsWith("{")), null, { timeout: 4000 }); return JSON.parse((await page.evaluate(() => window.__log)).filter((line) => line.startsWith("{")).pop()); };
    // the card of a returning student: no plate, no empty places; then the message after the action
    {
      const { page } = await openPage(browser, "money2.entry.tsx", X.modalServer({ undone: true, names: F.SHORT }), size);
      await page.evaluate(() => window.mount("assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true, groupsBasePath: "/owner/groups", mode: "add", currentGroupName: "Алгебра 7", excludeGroupIds: ["ga"] }));
      await page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
      await page.waitForTimeout(900); await scrollDown(page); await shot(page, `card-return-${width}`);
      await page.click('[data-testid="assign-submit"]'); await page.waitForSelector('[data-testid="assign-done"]'); await page.waitForTimeout(600);
      await shot(page, `card-return-done-${width}`);
      await page.close();
    }
    // the drawer: one returns (no plate, then the message), part without common terms, part with a changed day (line closed / open), a batch of three (the message by count)
    for (const [file, chosen, undone] of [["drawer-one-returns", [0], ["st9"]], ["drawer-part-nocommon", [0, 1, 2], ["st9", "st7"]], ["drawer-part-common", [0, 1, 2], ["st9", "st7"]], ["drawer-three-return", [0, 1, 2], ["st9", "st8", "st7"]]]) {
      const { page } = await openPage(browser, "money-b.entry.tsx", drawerServer(undone, []), size);
      await OPEN(page, chosen);
      if (file === "drawer-part-common") { await page.fill("#add-student-pay-from", "08.11.2026"); await page.keyboard.press("Tab"); await page.waitForTimeout(800); }
      await scrollDown(page); await page.waitForTimeout(200);
      await shot(page, `${file}-${width}-closed`);
      if (file === "drawer-part-common") { await page.locator('[data-testid="leave-shared-note"] [aria-label="Пояснение"]').click(); await page.waitForTimeout(250); await shot(page, `${file}-${width}-open`); await page.keyboard.press("Escape"); }
      if (file !== "drawer-part-nocommon" && file !== "drawer-part-common") {
        await page.click('button:has-text("Зачислить (")'); await page.waitForTimeout(500);
        await toastOf(await lastSummary(page), `toast-${file === "drawer-one-returns" ? "one" : "batch"}-${width}`);
      } else if (file === "drawer-part-common") {
        await page.click('button:has-text("Зачислить (")'); await page.waitForTimeout(500);
        await toastOf(await lastSummary(page), `toast-part-${width}`);
      }
      await page.close();
    }
    // «Зачислить учеников» for a debtor: the lower part of the window after the edits
    {
      const { page } = await openPage(browser, "money-b.entry.tsx", drawerServer([], []), size);
      await OPEN(page, [0]);
      await page.fill("#add-student-pay-from", "04.11.2026"); await page.keyboard.press("Tab");
      await page.waitForSelector('[data-testid="pay-from-immediate-block"]'); await page.waitForTimeout(500);
      await scrollDown(page); await page.waitForTimeout(200);
      await shot(page, `drawer-one-debtor-${width}`);
      console.log(`drawer-one-debtor ${width}`, JSON.stringify(await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); const foot = d.querySelector('[data-modal-part="footer"]'); const label = document.querySelector('[data-testid="pay-from"]'); const body = d.querySelector('[data-modal-part="body"]'); const sc = [...d.querySelectorAll("*")].find((el) => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)); return { dialog: Math.round(d.getBoundingClientRect().height), footer: foot ? Math.round(foot.getBoundingClientRect().height) : null, fromPayFromTopToFooter: foot && label ? Math.round(foot.getBoundingClientRect().top - label.getBoundingClientRect().top) : null, payFromBlock: label ? Math.round(label.getBoundingClientRect().height) : null, scrollerClient: sc ? Math.round(sc.clientHeight) : null, scrollerFull: sc ? sc.scrollHeight : null }; })));
      await page.close();
    }
    // the card for a debtor (the window «Зачислить в группу»): the same measure
    {
      const immediate = { amount: 187000, lessons: 5, text: "К оплате сразу: 187 000 сум (за 5 уроков)", parts: [{ label: "ноябрь", from: "2026-11-17", amount: 187000, lessons: 5, lessons_in_period: 12, whole: false }] };
      const SAME = { group_id: "gt", group_name: F.SHORT.T, membership_id: "m-same", left_on: "2026-11-17", kind: "debt", amount: 38000, same_group: true, text: "Уже был в этой группе, ушёл 17.11.2026 — остался долг 38 000 сум" };
      const server = F.baseServer((request) => {
        if (request.method === "GET" && request.path === "/auth/org/groups/gt/pay-from-default") return { json: { today: "2026-11-06", first_lesson: "2026-11-09", default_pay_from: "2026-11-09", text: "Оплата с 09.11.2026 — первое занятие группы с сегодня" } };
        if (request.method === "POST" && request.path === "/auth/org/groups/gt/students/st1") {
          const past = request.body && request.body.pay_from;
          return { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, leave_undo: null, past_balances: [SAME], billing: past ? { pay_from: request.body.pay_from, explicit: true, default_pay_from: "2026-11-09", first_lesson: "2026-11-09", text: "x", immediate } : null } };
        }
        return null;
      }, F.SHORT);
      const { page } = await openPage(browser, "money2.entry.tsx", server, size);
      await page.evaluate(() => window.mount("assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true, mode: "add", currentGroupName: "Алгебра 7", excludeGroupIds: ["ga"], groupsBasePath: "/owner/groups" }));
      await page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
      await page.waitForSelector('[data-testid="past-balance"]');
      await page.fill("#assign-group-pay-from", "17.11.2026"); await page.keyboard.press("Tab");
      await page.waitForSelector('[data-testid="pay-from-immediate-block"]'); await page.waitForTimeout(500);
      await scrollDown(page); await page.waitForTimeout(200);
      await shot(page, `card-debtor-${width}`);
      console.log(`card-debtor ${width}`, JSON.stringify(await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); const foot = d.querySelector('[data-modal-part="footer"]'); const label = document.querySelector('[data-testid="pay-from"]'); const sc = [...d.querySelectorAll("*")].find((el) => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)); const lower = label ? sc.scrollHeight - (label.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop) : null; return { dialog: Math.round(d.getBoundingClientRect().height), footer: foot ? Math.round(foot.getBoundingClientRect().height) : null, lowerPartFromPayFromToEndOfBody: lower === null ? null : Math.round(lower), scrollerClient: sc ? Math.round(sc.clientHeight) : null, scrollerFull: sc ? sc.scrollHeight : null }; })));
      await page.close();
    }
    // the statement: everything adds up (no green line, no empty strip)
    {
      const e1 = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/pay2/e1_statement_790000.json"), "utf8"));
      const server = F.baseServer((r) => (r.path === "/auth/org/memberships/m-a/statement" ? { json: e1 } : r.path === "/auth/org/memberships/m-a/payments" ? { json: [] } : null), F.SHORT);
      const { page } = await openPage(browser, "money2.entry.tsx", server, { width, height: 900 });
      await page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
      await page.waitForSelector('[aria-label="Итоги"]'); await page.waitForTimeout(500);
      await shot(page, `statement-${width}`);
      console.log(`statement ${width} reconciles-line`, await page.locator('[data-testid="statement-reconciles"]').count());
      await page.close();
    }
  }
  await browser.close();
  console.log("done");
})();
