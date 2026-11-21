// PAY-TAILS, screens part 3: `node tests/dom/paytails-part3-shots.cjs <out dir>` - PNGs of the frames on the REAL answers of the server (tests/fixtures/paytails) at 1280 / 1024 / 375, and with a long name at 1280 / 375.
// Prints ONLY suspicious lines: horizontal scroll, text off its block, a console error.  Run with TMPDIR in `artifacts/money1-stage/.cache` (the css of the run goes there).
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
const { layoutProbe } = require("../helpers/layout-probe.cjs");
const { fx, advanceStatus } = require("../helpers/paytails-server.cjs");
const PX = require("../helpers/paytails-fixture.cjs");
const X2 = require("../helpers/paytails-fixture2.cjs");
const F = require("../helpers/money2-fixture.cjs");
const OWNER = { role: "owner", org_role: "owner" };
const SIZES = [[1280, 900], [1024, 800], [375, 812]];
const LONG_NAME = "Абдурахмонов Мухаммадюсуф Абдулазизович";
const LONG_GROUP = "Математика 7 углублённая (вечерняя), длинное название группы";
const OPENINGS = { accounting_start: "2026-09-01", state: "done", can_set_opening: true, totals: { left_available: 0, memberships: 40, missing: 0, needs_review: 0 } };

const longer = (rows) => rows.map((row, i) => (i === 0 ? { ...row, student_name: LONG_NAME, group_name: LONG_GROUP } : row));
const centre = ({ long = false, extra } = {}) => (r) => {
  if (extra) { const own = extra(r); if (own) return own; }
  if (r.path === "/auth/org/payments/summary") return { json: fx("summary_with_advance") };
  if (r.path === "/auth/org/payments/status") {
    if (/group_id=g1/.test(r.query)) {
      if (/bucket=left_open/.test(r.query)) { const page = fx("group_left_open"); return { json: long ? { ...page, items: longer(page.items) } : page }; }
      return { json: PX.page(/bucket=all/.test(r.query) ? [PX.MADINA] : [], { total: /bucket=all/.test(r.query) ? 1 : 0, students: /bucket=all/.test(r.query) ? 1 : 0 }) };
    }
    const page = advanceStatus(r.query);
    return { json: long ? { ...page, items: longer(page.items) } : page };
  }
  if (r.path === "/auth/org/groups/g1") return { json: { id: "g1", name: "Математика 7", status: "active", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", max_students: 30, student_count: 1, students: [], price_current: { amount: 600000, valid_from: "2026-01-01", source: "group" }, price_scheduled: null, schedule: [] } };
  if (r.path === "/auth/org/groups") return { json: [{ id: "g1", name: "Математика 7", teacher_id: "t1" }] };
  if (r.path === "/auth/org/members") return { json: [] };
  if (r.path === "/auth/org/opening-balances/summary") return { json: OPENINGS };
  return null;
};

(async () => {
  const browser = await launch();
  const suspicious = [];
  const shot = async (name, width, height, entry, answer, mount, after, full = false, wait = '[role="dialog"], [data-testid="statement-summary"], [data-testid="payments-table"], [data-testid="payments-phone-list"], [data-testid="group-payment-row"], [data-testid="student-money-chip"], [aria-label^="Квитанция"], [data-testid="payments-left-toggle"]') => {
    const { page, errors } = await openPage(browser, entry, answer, { width, height });
    await page.evaluate(([n, u, p]) => window.mount(n, u, p), mount);
    await page.waitForSelector(wait, { timeout: 9000 });
    await page.waitForTimeout(700);
    if (after) await after(page);
    await page.waitForTimeout(500);
    const target = (await page.locator('[role="dialog"]').count()) > 0 ? '[role="dialog"]' : "body";
    const probe = await page.evaluate(layoutProbe, target);
    const bad = probe.bad.filter((b) => !/student-tabs/.test(b));
    if (bad.length || probe.scroll > 0) suspicious.push(`${name}-${width}: ${probe.scroll > 0 ? `scroll ${probe.scroll} ` : ""}${bad.join(" | ")}`);
    if (errors.length) suspicious.push(`${name}-${width}: console ${errors.join(" | ").slice(0, 160)}`);
    await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: full });
    await page.close();
  };
  const list = (search) => ["payments", OWNER, { moneyAvailable: true, search }];
  const group = ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }];
  const openBand = async (page) => { await page.click('[data-testid="payments-left-toggle"]'); await page.waitForSelector('[data-testid="group-payment-left-row"]'); };
  const onlyLeft = async (page) => { await page.getByRole("radio", { name: /^Ушедшие/ }).click(); await page.waitForTimeout(800); };
  const statement = (name, long = false) => {
    const data = fx(name);
    if (long) { data.membership.student_name = LONG_NAME; data.membership.group_name = LONG_GROUP; }
    return F.baseServer((r) => (r.method === "GET" && /\/memberships\/[^/]+\/statement$/.test(r.path) ? { json: data } : r.method === "GET" && /\/payments$/.test(r.path) ? { json: [] } : null));
  };
  const stMount = ["statement", OWNER, { moneyAvailable: true }];
  const leave = (name, post) => F.baseServer(X2.leaveServer(fx(name).memberships, post));
  const leaveMount = ["leave-toast", OWNER, {}];
  const press = async (page) => { await page.getByRole("button", { name: "Убрать из группы" }).click(); await page.waitForSelector("[data-tone]"); };
  const probe = fx("enrol_upcoming_probe");
  const enrolServer = F.baseServer((r) => {
    if (r.method === "GET" && r.path === "/auth/org/groups/gt/pay-from-default") return { json: { today: "2026-11-21", first_lesson: "2026-11-24", default_pay_from: "2026-11-24", text: probe.billing.text } };
    if (r.method === "POST" && r.path === "/auth/org/groups/gt/students/st1") return { json: { ...probe, dry_run: /dry_run=true/.test(r.query) } };
    return null;
  }, F.SHORT);
  const assignMount = ["assign", OWNER, { moneyAvailable: true, groupsBasePath: "/owner/groups", mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: F.SHORT.A }] }];
  const pickGroup = async (page) => { await page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]'); await page.waitForSelector('[data-testid="summary-bar-sum"]'); };
  const row = fx("status_row_starts").items[0];
  const profile = { student: { id: "st1", org_id: "o", first_name: "Один", last_name: "Ученик", full_name: "Ученик Один", class_level: 9, group_id: "id-3", display_id: "AL-001", student_phone: null, comment: null, status: "active", created_at: "2026-11-01T00:00:00" }, group: { id: "id-3", name: "Физика 7", class_level: 9, teacher_id: "id-4", teacher_name: "Пётр Teacher" }, groups: [{ group_id: "id-3", group_name: "Физика 7", class_level: 9, teacher_id: "id-4", teacher_name: "Пётр Teacher", is_primary: true, joined_at: "2026-11-21" }], group_history: [], diagnostics: [], exams: [] };
  const studentServer = centre({ extra: (r) => (r.path === "/auth/org/students/st1/profile" ? { json: profile } : r.path === "/auth/org/students/st1/memberships" ? { json: [row] } : null) });

  for (const [w, h] of SIZES) {
    await shot("p3-f1-advance-tab", w, h, "paydue.entry.tsx", centre(), list("bucket=advance"), null, true);
    await shot("p3-f2b-advance-left", w, h, "paydue.entry.tsx", centre(), list("bucket=advance"), onlyLeft, true);
    await shot("p3-f4-group-band", w, h, "paydue.entry.tsx", centre(), group, null, true);
    await shot("p3-f4b-group-band-open", w, h, "paydue.entry.tsx", centre(), group, openBand, true);
    await shot("p3-f6-leave-others", w, h, "money2.entry.tsx", leave("leave_preview_recalc_others"), leaveMount, null);
    await shot("p3-f8-leave-done", w, h, "money2.entry.tsx", leave("leave_preview_recalc_others", () => ({ json: fx("leave_result_recalc_others") })), leaveMount, press);
    await shot("p3-f7-leave-advance", w, h, "money2.entry.tsx", leave("leave_preview_paid_ahead"), leaveMount, null);
    await shot("p3-f10-enrol-bar", w, h, "money2.entry.tsx", enrolServer, assignMount, pickGroup);
    await shot("p3-f13a-student-starts", w, h, "paydue.entry.tsx", studentServer, ["student", OWNER, { moneyAvailable: true }], null, true);
    await shot("p3-f12-statement-forecast", w, h, "money2.entry.tsx", statement("statement_forecast"), stMount, null, true);
    await shot("p3-f16-statement-forgiven", w, h, "money2.entry.tsx", statement("statement_forgiven_until"), stMount, null, true);
    await shot("p3-f5-statement-used", w, h, "money2.entry.tsx", statement("statement_settled_with_used_forgiveness"), stMount, null, true);
    await shot("p3-f18c-statement-no-charges", w, h, "money2.entry.tsx", statement("statement_no_charges"), stMount, null, true);
    await shot("p3-f19a-receipt-closed", w, h, "money.entry.tsx", () => null, ["receipt", undefined, { receipt: fx("receipt_closed_period") }], null, true, '[aria-label^="Квитанция"]');
    await shot("p3-f19b-receipt-partial", w, h, "money.entry.tsx", () => null, ["receipt", undefined, { receipt: fx("receipt_partial_payment") }], null, true, '[aria-label^="Квитанция"]');
  }
  for (const w of [1280, 375]) {
    const h = w === 375 ? 812 : 900;
    await shot("p3-L-advance-tab", w, h, "paydue.entry.tsx", centre({ long: true }), list("bucket=advance"), null, true);
    await shot("p3-L-group-band-open", w, h, "paydue.entry.tsx", centre({ long: true }), group, openBand, true);
    await shot("p3-L-statement-used", w, h, "money2.entry.tsx", statement("statement_settled_with_used_forgiveness", true), stMount, null, true);
  }
  await browser.close();
  console.log(suspicious.length ? suspicious.join("\n") : "no suspicious lines");
})().catch((e) => { console.error(e); process.exit(1); });
