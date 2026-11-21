// PAY-TAILS, screens part 1: `TMPDIR=<dir> node tests/dom/paytails-part1-shots.cjs <out dir>` - PNGs of the frames 1, 2b, 3, 4, 20, 21, 22, 23a, 23б of the layout by the REAL components at 1280, 1024 and 375 (and with long names),
// the data of the layout (tests/helpers/paytails-fixture.cjs).  Prints ONLY suspicious lines: horizontal scroll, text off its block.
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
const X = require("../helpers/paytails-fixture.cjs");

const OWNER = { role: "owner", org_role: "owner" };
const OPENINGS = { accounting_start: "2026-09-01", state: "pending", can_set_opening: true, totals: { left_available: 0, memberships: 40, missing: 38, needs_review: 0 } };
const LONG = (rows) => rows.map((row, i) => (i === 0 ? { ...row, student_name: X.LONG_NAME, group_name: X.LONG_GROUP } : row));

const server = ({ summary = X.SUMMARY, status, group, openings } = {}) => (r) => {
  if (r.path === "/auth/org/payments/summary") return { json: summary };
  if (r.path === "/auth/org/payments/status") {
    if (/group_id=g1/.test(r.query)) return { json: group ? group(r.query) : X.groupStatus(r.query) };
    return { json: status ? status(r.query) : X.statusOf(r.query) };
  }
  if (r.path === "/auth/org/groups/g1") return { json: { id: "g1", name: "Математика 7", status: "active", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", max_students: 30, student_count: 3, students: [], price_current: { amount: 600000 }, lesson_type: "group", schedule: [{ day: 0, start: "16:00", end: "17:00" }] } };
  if (r.path === "/auth/org/groups") return { json: [{ id: "g1", name: "Математика 7", teacher_id: "t1" }] };
  if (r.path === "/auth/org/members") return { json: [] };
  if (r.path === "/auth/org/opening-balances/summary") return { json: openings ?? { ...OPENINGS, state: "done", totals: { ...OPENINGS.totals, missing: 0 } } };
  return null;
};

(async () => {
  const browser = await launch();
  const suspicious = [];
  const shot = async (name, width, height, answer, mountArgs, after, full = false) => {
    const { page, errors } = await openPage(browser, "paydue.entry.tsx", answer, { width, height });
    await page.evaluate(([n, u, p]) => window.mount(n, u, p), mountArgs);
    await page.waitForSelector('[data-testid="payments-table"], [data-testid="payments-phone-list"], [data-testid="advance-empty"], [data-testid="group-payment-row"]', { timeout: 9000 });
    await page.waitForTimeout(500);
    if (after) await after(page);
    await page.waitForTimeout(350);
    const probe = await page.evaluate(layoutProbe, "body");
    const bad = probe.bad.filter((b) => !/\[money-row-(line|name)\]/.test(b));
    if (bad.length || probe.scroll > 0) suspicious.push(`${name}-${width}: ${probe.scroll > 0 ? `scroll ${probe.scroll} ` : ""}${bad.join(" | ")}`);
    if (errors.length) suspicious.push(`${name}-${width}: console ${errors.join(" | ").slice(0, 160)}`);
    await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: full });
    await page.close();
  };
  const pay = (search) => ["payments", OWNER, { moneyAvailable: true, search }];
  const group = ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }];
  const expandBand = (page) => page.click('[data-testid="payments-left-toggle"]');
  for (const [w, h] of [[1280, 900], [1024, 800], [375, 812]]) {
    await shot("f1-advance-tab", w, h, server(), pay("bucket=advance"), null, w !== 375);
    await shot("f2b-advance-left", w, h, server(), pay("bucket=advance&left=1"), (p) => p.getByRole("radio", { name: /^Ушедшие/ }).click().catch(() => undefined), w !== 375);
    await shot("f3-advance-empty", w, h, server({ summary: X.SUMMARY_NOBODY, status: (q) => X.statusOf(q, { advance: [] }) }), pay("bucket=advance"), null, false);
    await shot("f4-group-payments", w, h, server(), group, null, true);
    await shot("f4b-group-payments-band-open", w, h, server(), group, expandBand, true);
    await shot("f-debtors", w, h, server({ summary: { ...X.SUMMARY, price_missing: 5 }, status: (q) => (/bucket=debtors/.test(q) ? X.page([X.TIMUR, X.LOLA], { total: 12, students: 12, amount_total: 3780000 }) : X.statusOf(q)) }), pay("bucket=debtors"), null, w !== 375);
  }
  // long names and eight-digit sums
  for (const w of [1280, 375]) {
    await shot("L-debtors-long", w, w === 375 ? 812 : 900, server({ status: (q) => (/bucket=debtors/.test(q) ? X.page(LONG([X.longRow("l1"), X.LOLA, X.TIMUR]), { total: 12, students: 12 }) : X.statusOf(q)) }), pay("bucket=debtors"), null, w !== 375);
    await shot("L-advance-long", w, w === 375 ? 812 : 900, server({ status: (q) => X.statusOf(q, { advance: LONG(X.ADVANCE_ALL) }) }), pay("bucket=advance"), null, w !== 375);
    await shot("L-group-long", w, w === 375 ? 812 : 900, server({ group: (q) => { const s = X.groupStatus(q); return { ...s, items: LONG(s.items) }; } }), group, expandBand, true);
  }
  // frames 20-22: every conditional block at once at 375 × 812 and the sheet of the age of the debt
  const busy = server({ summary: { ...X.SUMMARY, price_missing: 5 }, openings: OPENINGS, status: (q) => (/bucket=debtors/.test(q) ? X.page([X.TIMUR, X.LOLA, X.base({ ...X.LOLA, membership_id: "m-a", student_id: "s-a", student_name: "Рустам Назаров", group_name: "Физика 7" }), X.base({ ...X.LOLA, membership_id: "m-b", student_id: "s-b", student_name: "Мехрибон Алиева" })], { total: 12, students: 12, amount_total: 3780000 }) : X.statusOf(q)) });
  await shot("f20-phone-busy", 375, 812, busy, pay("bucket=debtors"));
  await shot("f20-phone-busy-667", 375, 667, busy, pay("bucket=debtors"));
  await shot("f22-age-sheet", 375, 812, busy, pay("bucket=debtors"), async (p) => { await p.click('[data-testid="debt-age-open"]'); await p.waitForTimeout(500); });
  await shot("f23a-phone-advance", 375, 812, server(), pay("bucket=advance"));
  await shot("f23b-phone-group", 375, 812, server(), group);
  await shot("f23b-phone-group-open", 375, 812, server(), group, expandBand, true);
  await browser.close();
  console.log(suspicious.length ? suspicious.join("\n") : "no suspicious lines");
})().catch((e) => { console.error(e); process.exit(1); });
