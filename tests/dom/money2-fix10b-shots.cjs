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
    for (const [file, chosen, undone, ordinary] of [["drawer-part-return", [0, 1, 2], ["st9", "st7"], []], ["drawer-ordinary-two", [1, 2], [], ["st8", "st7"]]]) {
      const { page } = await openPage(browser, "money-b.entry.tsx", drawerServer(undone, ordinary), size);
      await page.evaluate((w) => window.mount("addDrawer", w, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 380000, valid_from: "2026-09-01" } }), OWNER);
      await page.fill('input[placeholder^="Поиск по имени"]', "Уч").catch(() => {});
      for (const i of chosen) await page.click(`button:has-text("${PEOPLE[i][1]}")`);
      await page.waitForSelector('[data-testid="leave-undo"], [data-testid="leave-undo-many"], [data-testid="leave-return-many"]');
      await page.waitForTimeout(700);
      await scrollDown(page); await page.waitForTimeout(200);
      await shot(page, `${file}-${width}-closed`);
      await page.locator('[role="dialog"] [aria-label="Пояснение"]').first().click(); await page.waitForTimeout(250);
      await shot(page, `${file}-${width}-open`);
      await page.close();
    }
  }
  await browser.close();
  console.log("done");
})();
