// Money-2 fix 10Д: `node tests/dom/money2-fix10e-shots.cjs <out dir> <work dir>` - the lower part of «Зачислить учеников»: ONE conditions frame + ONE summary card (three with the same period / different periods / one / eight with long names /
// a common price + a returning student / a role without money / a mass transfer).  The compiled CSS goes to <work dir>, not to the system temp.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "..", "..");
const [out, work] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(work, { recursive: true });
const css = path.join(work, "tw.css");
execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
process.env.DOM_CSS = css;
const { launch, openPage } = require("../helpers/dom-page.cjs");
const H = require("../helpers/money2-fix10e.cjs");
const { PART, NOV } = H;
const LONG = "Золотухин-Белоусов-Сокольников Александр-Константин";
const THREE = [["st1", "СцМ14 М14-н7"], ["st2", "СцМ14 М14-2-а"], ["st3", "СцМ14 М14-н6"]];
const EIGHT = [["st1", "Новый"], ["st2", "Второй"], ["st3", "Третий"], ["st4", "Четвёртый"], ["st5", "Золотухин-Белоусов-Сокольников", "Александр-Константин"], ["st6", "Шестой"], ["st7", "Седьмой"], ["st8", "Восьмой-Подкрепляющийся-Долгофамильный"]];
const OWNER = { role: "owner", org_role: "owner" };
const SCENARIOS = {
  "three-same": { people: THREE, imm: { st1: NOV, st2: NOV, st3: NOV }, past: { st2: [H.DEBT_SAME] }, ordinary: ["st2"] },
  "three-diff": { people: THREE, imm: { st1: NOV, st2: [PART("октябрь", "2026-10-27", 89000, 2, 9), PART("ноябрь", "", 450000, 12, 12, true)], st3: [PART("ноябрь", "2026-11-26", 75000, 2, 12)] }, past: { st3: [H.ADVANCE_OTHER] } },
  "one": { people: THREE.slice(0, 1), imm: { st1: NOV }, past: { st1: [H.DEBT_SAME] }, ordinary: ["st1"] },
  "eight": { people: EIGHT, imm: { st1: NOV, st2: NOV, st3: NOV, st4: NOV, st5: NOV, st6: NOV, st8: NOV }, past: { st5: [H.DEBT_SAME] }, ordinary: ["st2"] },
  "common": { people: THREE, imm: { st1: NOV, st2: NOV, st3: NOV }, past: {}, undone: ["st2"], common: true },
  "no-money": { people: THREE, imm: {}, past: { st2: [{ ...H.DEBT_SAME, amount: undefined }] }, ordinary: ["st3"], money: false },
};
const { OWNER_EFFECTS } = require("../helpers/dom-answers.cjs");
/** a mass transfer: three students from «Алгебра 7»; one of them has a debt of the last time, one «записывается заново» */
function transferServer(people) {
  const base = H.server({ people, immediate: {}, past: { st2: [H.DEBT_SAME] }, ordinary: ["st3"] });
  return (request) => {
    if (request.method === "GET" && request.path === "/auth/org/students") return { json: { items: people.map(([id, last, first]) => ({ ...H.X.STUDENT(id, last, first), status: "active", group_id: "gA", current_group_id: "gA", groups_count: 1 })), total: people.length } };
    if (request.method === "GET" && request.path === "/auth/org/groups") return { json: [{ id: "g2", name: "Геометрия 8" }, { id: "gA", name: "Алгебра 7" }] };
    if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/bulk" && /dry_run=true/.test(request.query) && /mode=transfer/.test(request.query)) {
      const answer = base(request).json;
      return { json: { ...answer, carried: [], money_effects: OWNER_EFFECTS } };
    }
    return base(request);
  };
}
async function shot(page, file) {
  // a phone: the body of the window scrolls - the lower part (the conditions and the card) is what the snapshot is about
  if (/-375$/.test(file) && !/select/.test(file)) await page.evaluate(() => { const b = document.querySelector('[data-testid="enrol-blocks"]'); if (b) b.scrollIntoView({ block: "end" }); });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) console.log(`SUSPECT wide ${file}`);
  await page.screenshot({ path: path.join(out, `${file}.png`) });
}
(async () => {
  const browser = await launch();
  for (const width of [1280, 375]) {
    const size = { width, height: width === 375 ? 812 : 900 };
    for (const [name, sc] of Object.entries(SCENARIOS)) {
      const money = sc.money !== false;
      const { page } = await openPage(browser, "money-b.entry.tsx", H.server({ people: sc.people, immediate: sc.imm, past: sc.past, ordinary: sc.ordinary, undone: sc.undone }), size);
      await page.evaluate(([who, m]) => window.mount("addDrawer", who, m ? { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 450000, valid_from: "2026-09-01" } } : { refresh: false }), [money ? OWNER : { role: "admin", org_role: "admin", payments_access: false }, money]);
      await page.fill('input[placeholder^="Поиск по имени"]', "Сц").catch(() => {});
      if (sc.people === EIGHT) await page.fill('input[placeholder^="Поиск по имени"]', "").catch(() => {});
      for (const [, last] of sc.people) await page.click(`button:has-text("${last}")`);
      await page.waitForSelector('[data-testid="enrol-summary"]'); await page.waitForTimeout(700);
      if (sc.common) { await page.click('[role="switch"]:has-text("Индивидуальная цена")'); await page.fill("#add-student-price-amount", "300000"); await page.fill("#add-student-price-reason", "Договорённость"); await page.waitForTimeout(900); }
      await shot(page, `drawer-v2-${name}-${width}`);
      await page.close();
    }
  }
  // the mass transfer
  for (const width of [1280, 375]) {
    const { page } = await openPage(browser, "money-b.entry.tsx", transferServer(THREE.map(([id, last]) => [id, last, "Ученик"])), { width, height: width === 375 ? 812 : 900 });
    await page.evaluate(() => window.mount("addDrawer", { role: "owner", org_role: "owner" }, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 450000, valid_from: "2026-09-01" } }));
    await page.fill('input[placeholder^="Поиск по имени"]', "Сц");
    for (const [, last] of THREE) await page.click(`button:has-text("${last}")`);
    await page.waitForSelector('[data-testid="enrol-summary"]'); await page.waitForTimeout(900);
    await shot(page, `drawer-v2-transfer-${width}`);
    await page.close();
  }
  // the choice: nobody / one / three chosen out of twelve (and with a search typed)
  const PEOPLE = Array.from({ length: 12 }, (_, i) => [`st${i + 1}`, `Сц${String(i + 1).padStart(2, "0")}`, "Тест"]);
  const imm = Object.fromEntries(PEOPLE.map(([id]) => [id, NOV]));
  for (const width of [1280, 375]) {
    for (const [name, picks, term] of [["0", []], ["1", ["Сц04"]], ["3", ["Сц09", "Сц02", "Сц06"]], ["3-search", ["Сц09", "Сц02", "Сц06"], "Сц11"]]) {
      const base = H.server({ people: PEOPLE, immediate: imm, past: {}, ordinary: [], undone: [] });
      const handler = (request) => {
        if (request.method === "GET" && request.path === "/auth/org/students") { const t = decodeURIComponent((/search=([^&]*)/.exec(request.query) || [])[1] || ""); const items = base(request).json.items.filter((x) => !t || x.last_name.includes(t)); return { json: { items, total: items.length } }; }
        return base(request);
      };
      const { page } = await openPage(browser, "money-b.entry.tsx", handler, { width, height: width === 375 ? 812 : 900 });
      await page.evaluate(() => window.mount("addDrawer", { role: "owner", org_role: "owner" }, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 450000, valid_from: "2026-09-01" } }));
      await page.waitForSelector('[data-testid="enrol-list"] button');
      for (const last of picks) await page.click(`[data-testid="enrol-list"] button:has-text("${last}")`);
      if (term) { await page.fill('input[placeholder^="Поиск по имени"]', term); await page.waitForTimeout(900); }
      await page.waitForTimeout(700);
      await shot(page, `drawer-v2-select-${name}-${width}`);
      await page.close();
    }
  }
  // the notice of the debt on the control panel (it is NOT on a statement / receipt / group / student pages - see tests/money2-fix10e-banner.test.cjs)
  for (const width of [1280, 375]) {
    const { page } = await openPage(browser, "money-b.entry.tsx", (request) => (request.path === "/auth/org/payments/summary" ? { json: require("../helpers/money-b-fixture.cjs").SUMMARY } : null), { width, height: width === 375 ? 812 : 900 });
    await page.evaluate(() => { window.__pathname = "/owner/dashboard"; window.mount("banner", { role: "owner", org_role: "owner" }, { refresh: true }); });
    await page.waitForSelector('[data-testid="payments-alert-banner"]'); await page.waitForTimeout(800);
    await shot(page, `banner-dashboard-${width}`);
    await page.close();
  }
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
