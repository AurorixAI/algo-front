// R3 (unconfirmed 4): the REAL pages on `next dev` (npm run dev -- -p 3101), the server answered through `route` - the real router, layouts, menus and Modal.  Not a test:
// `node tests/dom/live.cjs <out dir>`; the PNGs of the cash window, the write-off and the days off at 1280 and 375.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/@playwright/test"));
const { fixture, OWNER_EFFECTS } = require("../helpers/dom-answers.cjs");

const BASE = process.env.LIVE_BASE || "http://localhost:3101";
const out = process.argv[2];
const isDry = (url) => /dry_run=true/.test(url.search);
const ROW = { ...JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/logicA/A29_status_row_debtor.json"), "utf8")), membership_id: "m1", student_name: "Иванов Иван", group_name: "7-А Алгебра", status: "due" };
const PAUSE_LOCKED = { code: "PAUSE_LOCKED", message: "Месяц октябрь 2026 у преподавателя Каримова К. закрыт: ведомость сохранена 03.11.2026. Чтобы исправить, владелец переоткрывает месяц.", month: "2026-10", teacherId: "t1", teacherName: "Каримова К.", closedOn: "2026-11-03" };
const SUMMARY = { as_of: "2026-11-05", due: 1, ends_today: 0, expired: 0, expiring: 0, none: 0, active: 3, free: 0, tracked_total: 4, period_mode: "month", debt_total: 350000, advance_total: 0, memberships_with_debt: 1, students_with_debt: 1 };
const DAYS_OFF = [{ id: "d1", dateFrom: "2026-11-23", dateTo: "2026-11-23", reason: "Праздник", createdAt: "2026-11-01T10:00:00", createdByName: "Арслан", voidedAt: null, active: true }];

function answer(url, request) {
  const p = url.pathname.replace(/^\/api\/v1/, "");
  const method = request.method();
  if (p === "/auth/me") return { id: "u1", role: "owner", org_role: "owner", first_name: "Арслан", last_name: "Тест", full_name: "Арслан Тест", email: "a@b.c", org_id: "o1", payments_access: true };
  if (p === "/auth/org/payments/summary") return SUMMARY;
  if (p === "/auth/org/payments/status") return { items: [ROW], total: 1, limit: 50, offset: 0, as_of: "2026-11-05" };
  if (method === "GET" && p === "/auth/org/memberships/m1/payments/preview") return fixture("e1_preview_300000");
  if (method === "POST" && p === "/auth/org/memberships/m1/payments" && isDry(url)) return { ...fixture("e1_create_300000"), dry_run: true, money_effects: OWNER_EFFECTS };
  if (p === "/auth/org/memberships/m1/pauses" && method === "GET") return [];
  if (p === "/auth/org/days-off" && method === "GET") return DAYS_OFF;
  if (p === "/auth/org/attendance/excuses/summary") return { pending_total: 0, open_lessons_total: 0 };
  if (p === "/auth/org/substitutions/summary") return { pendingTotal: 0, urgentTotal: 0, overdueTotal: 0 };
  if (p === "/auth/support/unread") return { count: 0 };
  if (method === "GET" && p === "/auth/org/payroll-periods") return { month: "2026-10", items: [{ teacherId: "t1", teacherName: "Каримова К.", month: "2026-10", state: "closed", closedOn: "2026-11-03", sheetId: "s1", sheetRevision: 3, reopened: null }] };
  return null;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  for (const [width, height] of [[1280, 900], [375, 812]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addCookies([{ name: "algo_auth_token", value: "synthetic-render-only", url: BASE, httpOnly: true }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.route(`${BASE}/api/v1/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      let pauseDry = false;
      if (url.pathname.endsWith("/memberships/m1/writeoffs") && request.method() === "POST" && isDry(url)) pauseDry = true;
      const body = pauseDry ? { status: 200, json: { ...fixture("e6_writeoff_40000"), money_effects: { students: [], payroll: [], text: "", dryRun: true } } } : null;
      const data = body ?? { status: 200, json: answer(url, request) ?? (request.method() === "GET" ? [] : {}) };
      await route.fulfill({ status: data.status, contentType: "application/json", body: JSON.stringify(data.json) });
    });
    const measure = async (name) => {
      const metrics = await page.evaluate(() => {
        const vw = window.innerWidth;
        const dialog = document.querySelector('[role="dialog"]');
        const outside = dialog ? [...dialog.querySelectorAll("button, a, input, textarea")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1); }).map((el) => (el.textContent || el.tagName).trim().slice(0, 30)) : [];
        return { scrollX: document.documentElement.scrollWidth - vw, outside };
      });
      await page.screenshot({ path: path.join(out, `live-${name}-${width}.png`) });
      report.push(`live-${name} ${width}: pageScroll=${metrics.scrollX} controlsOutside=${JSON.stringify(metrics.outside)}`);
    };
    // the cash window of the real page «Оплаты»
    await page.goto(`${BASE}/owner/payments`);
    await page.waitForSelector("text=Иванов Иван", { timeout: 60000 });
    await page.waitForTimeout(500);
    const pay = page.getByRole("button", { name: /Внести оплату|Внести/ }).first();
    await pay.click();
    await page.waitForSelector("#payment-amount");
    await page.waitForTimeout(600);
    await page.fill("#payment-amount", "300000");
    await page.click('[data-testid="payment-methods"] >> text=Наличные');
    await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]', { timeout: 15000 });
    await measure("till");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    // the write-off from the row menu of the real page (a form that moves money: its dry run is asked once the reason is typed)
    await page.getByRole("button", { name: /Действия: Иванов Иван/ }).first().click();
    await page.getByRole("menuitem", { name: /Простить долг/ }).first().click();
    await page.waitForSelector("#writeoff-reason");
    await page.fill("#writeoff-reason", "болезнь, договорились с родителем");
    await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]', { timeout: 15000 });
    await measure("writeoff");
    await page.keyboard.press("Escape");
    // the days off of the real settings page
    await page.goto(`${BASE}/owner/settings?section=days_off`);
    await page.waitForSelector('[data-testid="days-off-panel"]', { timeout: 60000 });
    await page.waitForTimeout(500);
    await measure("days-off");
    report.push(`errors ${width}: ${JSON.stringify(errors.filter((e) => !/Failed to load|404/.test(e)).slice(0, 3))}`);
    await context.close();
  }
  await browser.close();
  console.log(report.join("\n"));
})();
