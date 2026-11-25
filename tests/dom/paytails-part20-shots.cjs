// PAY-TAILS Б11.50 (part 20): `node tests/dom/paytails-part20-shots.cjs <out dir>` - the PNGs of the window of the pauses and of the card of the student, 1280 and 375, named «<состояние>-<ширина>.png».
// Real answers of the server (tests/fixtures/paytails/part16, part14); the clock stands on the day of their world (24.11.2026).  Hand-set only: the debt of the zero-debt line («долга нет»), the long names of the stress states, the one-day pause.
// Prints ONLY suspicious things (sideways scroll, a console error).  Run with TMPDIR in `artifacts/money1-stage/.cache`.
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
const { contract, pauseOf, pauseServer, setWorld, day, dmy } = require("../helpers/paytails-part16.cjs");
const { readReal } = require("../helpers/paytails-part13.cjs");
const X = require("../helpers/paydue-fixture.cjs");

setWorld("2026-11-24");
const OWNER = { role: "owner", org_role: "owner" };
const LOCKED_TEXT = "Месяц закрыт: паузу за эти дни не изменить, пока месяц не переоткрыт. Переоткрыть его может владелец или администратор с доступом к деньгам";
const suspicious = [];
const RUNNING = () => pauseOf("pr1", day(-7), day(6), { reason: "уехал к родственникам" });
const endAnswer = (impact) => (request) => ({ json: { ...contract("pause_probe_end_today"), impact: { ...contract("pause_probe_end_today").impact, ...impact }, dry_run: /dry_run=true/.test(request.query) } });
const click = (name) => async (page) => { await page.getByRole("button", { name }).click(); await page.waitForSelector('[data-testid="pause-card-acting"]'); await page.waitForTimeout(500); };
const dialogStates = [
  ["end_confirm_empty_reason", () => pauseServer({ pauses: [RUNNING()], end: endAnswer({}) }), click("Закончить сегодня")],
  ["end_confirm_filled_reason", () => pauseServer({ pauses: [RUNNING()], end: endAnswer({}) }), async (page) => { await click("Закончить сегодня")(page); await page.fill("#pause-act-reason", "ошиблись в дате"); }],
  ["end_confirm_no_debt_after", () => pauseServer({ pauses: [RUNNING()], end: endAnswer({ debt_before: 300000, debt_after: 0 }) }), click("Закончить сегодня")],
  ["end_confirm_no_debt_before", () => pauseServer({ pauses: [RUNNING()], end: endAnswer({ debt_before: 0, debt_after: 300000 }) }), click("Закончить сегодня")],
  ["one_day_card", () => pauseServer({ pauses: [pauseOf("p1", day(0), day(0), { reason: "болел" })] }), async () => {}],
  ["closed_month", () => pauseServer({ pauses: [], create: { status: 422, json: { detail: { code: "PAUSE_LOCKED", message: LOCKED_TEXT, month: "2026-11", teacherId: "t1", teacherName: "Эргашев К.", closedOn: "2026-11-23" } } } }),
    async (page) => { await page.fill("#pause-first", dmy(day(0))); await page.fill("#pause-last", dmy(day(3))); await page.waitForSelector('[data-testid="period-closed-head"]'); await page.waitForTimeout(400); }],
];
const history = (over) => ({ group_id: "gx", group_name: "Алгебра 7", class_level: 7, is_active: false, joined_at: "2026-09-01T07:00:00", left_at: "2026-11-20T07:00:00", periods: [{ joined_at: "2026-09-01T07:00:00", left_at: "2026-11-20T07:00:00" }], membership_id: "mf1", ...over });
const profileServer = (rows, pauses, long) => (r) => {
  if (r.path === "/auth/org/students/st1/profile") return { json: { student: { id: "st1", org_id: "o", first_name: "Анвар", last_name: long ? "Абдурахмоножонов-Шарофутдинов" : "Каримов", full_name: long ? "Анвар Абдурахмоножонов-Шарофутдинов" : "Анвар Каримов", class_level: 7, group_id: null, display_id: "AL-1", student_phone: null, comment: null, status: "active", created_at: "2026-09-01T08:00:00" }, group: null, groups: [], group_history: rows, diagnostics: [], exams: [] } };
  const m = /^\/auth\/org\/memberships\/([^/]+)\/pauses$/.exec(r.path);
  if (m) return { json: pauses[m[1]] ?? [] };
  if (r.path === "/auth/org/students/st1/memberships") return { json: [] };
  if (r.path === "/auth/org/payments/summary") return { json: X.SUMMARY };
  if (r.path === "/auth/org/payments/status") return { json: X.statusPage(r.query) };
  if (r.path === "/auth/org/settings/payments") return { json: X.SETTINGS };
  return null;
};
const LEAVE_TODAY = readReal("pause_closed_by_leave_today");
const LEAVE_LATER = readReal("pause_closed_by_leave_later");
const TRANSFER_TODAY = readReal("pause_closed_by_transfer_today");
const TRANSFER_LATER = readReal("pause_closed_by_transfer_later");
const rowsAll = [
  history({ membership_id: LEAVE_LATER.membership_id, group_name: "Алгебра 7 (вт/пт)" }),
  history({ membership_id: LEAVE_TODAY.membership_id, group_name: "Геометрия 8", left_at: "2026-11-24T05:00:00", periods: [{ joined_at: "2026-09-01T07:00:00", left_at: "2026-11-24T05:00:00" }] }),
  history({ membership_id: TRANSFER_TODAY.membership_id, group_name: "Физика 9", left_at: null, periods: [{ joined_at: "2026-09-01T07:00:00", left_at: null }] }),
  history({ membership_id: "mnone", group_name: "Химия 7 (без пауз)" }),
];
const LONGROWS = rowsAll.map((row, i) => ({ ...row, group_name: ["Алгебра повышенного уровня для сильных учеников 7 класса", "Геометрия 8 (вторник, пятница, вечерняя смена)", "Физика 9 — подготовка к олимпиаде", "Химия 7"][i] }));
const pausesAll = { [LEAVE_LATER.membership_id]: [LEAVE_LATER], [LEAVE_TODAY.membership_id]: [LEAVE_TODAY], [TRANSFER_TODAY.membership_id]: [TRANSFER_TODAY], mnone: [] };
const cardStates = [
  ["card_former_groups", rowsAll, pausesAll, false, null],
  ["card_former_groups_long_names", LONGROWS, pausesAll, true, null],
  ["card_former_window_leave_today", rowsAll, pausesAll, false, LEAVE_TODAY.membership_id],
  ["card_former_window_leave_later", rowsAll, pausesAll, false, LEAVE_LATER.membership_id],
  ["card_former_window_transfer_today", rowsAll, pausesAll, false, TRANSFER_TODAY.membership_id],
  ["card_former_window_transfer_later", [history({ membership_id: TRANSFER_LATER.membership_id, group_name: "Физика 9" })], { [TRANSFER_LATER.membership_id]: [TRANSFER_LATER] }, false, TRANSFER_LATER.membership_id],
];

(async () => {
  const browser = await launch();
  for (const width of [1280, 375]) {
    const height = width === 375 ? 1400 : 1000;
    for (const [state, server, act] of dialogStates) {
      const { page, errors } = await openPage(browser, "money2.entry.tsx", server(), { width, height, today: "2026-11-24" });
      await page.evaluate(([who]) => window.mount("pause", who, { moneyAvailable: true }), [OWNER]);
      await page.waitForSelector('[role="dialog"]');
      await page.waitForTimeout(700);
      await act(page);
      await page.waitForTimeout(300);
      const label = `${state}-${width}`;
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const bad = errors.filter((t) => !/Failed to load resource/.test(t));
      if (scroll > 0 || bad.length) suspicious.push(`${label}: scroll ${scroll} errors ${JSON.stringify(bad).slice(0, 200)}`);
      const box = await page.locator('[role="dialog"]').boundingBox();
      await page.screenshot({ path: path.join(out, `${label}.png`), clip: { x: 0, y: 0, width, height: Math.min(height, Math.ceil(box.y + box.height + 24)) } });
      await page.close();
    }
    for (const [state, rows, pauses, long, open] of cardStates) {
      const { page, errors } = await openPage(browser, "paydue.entry.tsx", profileServer(rows, pauses, long), { width, height: width === 375 ? 1500 : 1100, today: "2026-11-24" });
      await page.evaluate(([who]) => window.mount("student", who, { moneyAvailable: true }), [OWNER]);
      await page.waitForSelector("text=История зачислений и переводов", { timeout: 8000 });
      await page.waitForTimeout(900);
      if (open) {
        await page.locator(`[data-testid="former-pauses"]`).evaluateAll(() => {});
        const names = { [LEAVE_LATER.membership_id]: "Алгебра 7 (вт/пт)", [LEAVE_TODAY.membership_id]: "Геометрия 8", [TRANSFER_TODAY.membership_id]: "Физика 9", [TRANSFER_LATER.membership_id]: "Физика 9" };
        await page.locator(`[data-testid="former-pauses"][aria-label="Паузы: ${names[open]}"]`).click();
        await page.waitForSelector('[data-testid="pause-card"]');
        await page.waitForTimeout(400);
      } else {
        await page.locator("text=История зачислений и переводов").scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
      }
      const label = `${state}-${width}`;
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const bad = errors.filter((t) => !/Failed to load resource/.test(t));
      if (scroll > 0 || bad.length) suspicious.push(`${label}: scroll ${scroll} errors ${JSON.stringify(bad).slice(0, 200)}`);
      if (open) {
        const box = await page.locator('[role="dialog"]').boundingBox();
        await page.screenshot({ path: path.join(out, `${label}.png`), clip: { x: 0, y: 0, width, height: Math.min(1500, Math.ceil(box.y + box.height + 24)) } });
      } else {
        const block = page.locator("text=История зачислений и переводов").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
        await block.screenshot({ path: path.join(out, `${label}.png`) });
      }
      await page.close();
    }
  }
  await browser.close();
  console.log(suspicious.length ? suspicious.join("\n") : "no suspicious");
})();
