// PAY-TAILS, screens part 2: `node tests/dom/paytails-part2-shots.cjs <out dir>` - PNGs of the frames 2a, 5, 6, 7, 8, 9, 10, 11, 12, 13b, 14, 15, 16, 17, 18, 19 and the map of words (top) of the layout by the REAL components at 1280, 1024 and 375
// (and with long names / eight-digit sums), the data of the layout (tests/helpers/paytails-fixture2.cjs).  Prints ONLY suspicious lines: horizontal scroll, text off its block.
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
const X = require("../helpers/paytails-fixture2.cjs");
const PX = require("../helpers/paytails-fixture.cjs");
const F = X.F;
const OWNER = { role: "owner", org_role: "owner" };
const SIZES = [[1280, 900], [1024, 800], [375, 812]];

const listServer = (rows) => (r) => {
  if (r.path === "/auth/org/payments/summary") return { json: PX.SUMMARY };
  if (r.path === "/auth/org/payments/status") {
    if (/group_id=g1/.test(r.query)) return { json: PX.page(rows, { total: rows.length, students: rows.length }) };
    return { json: PX.page(rows, { total: rows.length, students: rows.length }) };
  }
  if (r.path === "/auth/org/groups/g1") return { json: { id: "g1", name: "Физика 7", status: "active", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", max_students: 30, student_count: 2, students: [], price_current: { amount: 480000 }, lesson_type: "group", schedule: [{ day: 1, start: "16:00", end: "17:00" }] } };
  if (r.path === "/auth/org/groups") return { json: [{ id: "g1", name: "Физика 7", teacher_id: "t1" }] };
  if (r.path === "/auth/org/members") return { json: [] };
  if (r.path === "/auth/org/opening-balances/summary") return { json: { accounting_start: "2026-09-01", state: "done", can_set_opening: true, totals: { left_available: 0, memberships: 40, missing: 0, needs_review: 0 } } };
  return null;
};

(async () => {
  const browser = await launch();
  const suspicious = [];
  const shot = async (name, width, height, entry, answer, mount, after, full = false, wait = '[role="dialog"], [data-testid="statement-summary"], [data-testid="payments-table"], [data-testid="payments-phone-list"], [data-testid="tone-map"], [data-testid="group-payment-row"]') => {
    const { page, errors } = await openPage(browser, entry, answer, { width, height });
    await page.evaluate(([n, u, p]) => window.mount(n, u, p), mount);
    await page.waitForSelector(wait, { timeout: 9000 });
    await page.waitForTimeout(600);
    if (after) await after(page);
    await page.waitForTimeout(400);
    const target = (await page.locator('[role="dialog"]').count()) > 0 ? '[role="dialog"]' : "body";
    const probe = await page.evaluate(layoutProbe, target);
    const bad = probe.bad.filter((b) => !/«· [^»]*»|leaves its block \(.*\)$/.test(b) || target === '[role="dialog"]');
    if (bad.length || probe.scroll > 0) suspicious.push(`${name}-${width}: ${probe.scroll > 0 ? `scroll ${probe.scroll} ` : ""}${bad.join(" | ")}`);
    if (errors.length) suspicious.push(`${name}-${width}: console ${errors.join(" | ").slice(0, 160)}`);
    await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: full });
    await page.close();
  };
  const leave = (memberships, post) => F.baseServer(X.leaveServer(memberships, post));
  const leaveMount = ["leave-toast", OWNER, {}];
  const press = async (page) => { await page.getByRole("button", { name: "Убрать из группы" }).click(); await page.waitForSelector("[data-tone]"); };
  const statement = (key) => F.baseServer((r) => (r.method === "GET" && r.path === "/auth/org/memberships/m-a/statement" ? { json: X.STATEMENTS[key] } : r.method === "GET" && r.path === "/auth/org/memberships/m-a/payments" ? { json: [] } : null));
  const statementMount = ["statement", OWNER, { moneyAvailable: true }];
  const assignProps = { moneyAvailable: true, groupsBasePath: "/owner/groups", mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: F.SHORT.A }] };
  const pickGroup = async (page) => { await page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]'); await page.waitForTimeout(900); };
  const BIG = 12345678;
  const longDebt = X.LEAVE_DEBT({
    group_name: X.LONG_GROUP,
    money: { unpaid: BIG, debt_amount: BIG, due_amount: 0, due_until: null, becomes_debt: 0, advance: 0, refundable: 0, paid_until: null, charged_after_leave: 0, individual_price_ends: false },
    effects: { kind: "leave", moves: [], texts: [], ends: [], stays: [{ code: "debt", amount: BIG, text: `Останется долг ${X.money(BIG)}: это единственная группа ученика` }] },
    recalc: [{ text: `Ноябрь: ${X.money(24850000)} → ${X.money(BIG)}`, basis_text: "пересчёт по день ухода · 9 уроков из 13" }, { text: `Декабрь не начнётся: ${X.money(24850000)} останутся авансом`, basis_text: null }],
    others: [`В группе «${X.LONG_GROUP}»: ${X.money(24850000)} → ${X.money(BIG)} — сегодняшний урок оплачен в «${X.LONG_GROUP}»`],
  });
  const wordRows = X.WORD_ROWS;
  const listMount = (search) => ["payments", OWNER, { moneyAvailable: true, search }];
  for (const [w, h] of SIZES) {
    await shot("f6-leave-debt", w, h, "money2.entry.tsx", leave([X.LEAVE_DEBT()]), leaveMount, null, false);
    await shot("f7-leave-advance", w, h, "money2.entry.tsx", leave([X.LEAVE_ADVANCE()]), leaveMount, null, false);
    await shot("f8-leave-message", w, h, "money2.entry.tsx", leave([X.LEAVE_DEBT()]), leaveMount, press, false);
    await shot("f9-leave-second-group", w, h, "money2.entry.tsx", leave([X.LEAVE_DEBT({ others: [X.OTHERS_9] })]), leaveMount, null, false);
    await shot("f6b-leave-cut-list", w, h, "money2.entry.tsx", leave([X.LEAVE_DEBT({ recalc: X.RECALC_CUT })]), leaveMount, null, false);
    await shot("f6c-leave-due", w, h, "money2.entry.tsx", leave([X.LEAVE_DUE()]), leaveMount, null, false);
    await shot("f10-enrol-bar", w, h, "money2.entry.tsx", X.enrolServer(), ["assign", OWNER, assignProps], pickGroup, false);
    await shot("f14-enrol-shifted", w, h, "money2.entry.tsx", X.enrolServer({ upcoming: X.UPCOMING_14, payFrom: "2026-11-23" }), ["assign", OWNER, assignProps], pickGroup, false);
    await shot("f11-list-words", w, h, "paydue.entry.tsx", listServer(wordRows), listMount("bucket=active"), null, w !== 375);
    await shot("f13b-group-tab", w, h, "paydue.entry.tsx", listServer(wordRows), ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }], null, true, '[data-testid="group-payment-row"]');
    await shot("f15-pack-no-lessons", w, h, "paydue.entry.tsx", listServer([X.TIMUR_PACK]), listMount("bucket=active"), null, false);
    await shot("f12-statement-starts", w, h, "money2.entry.tsx", statement("f12"), statementMount, null, true);
    await shot("f16-statement-forgiven", w, h, "money2.entry.tsx", statement("f16"), statementMount, null, true);
    await shot("f17-statement-money-forgiven", w, h, "money2.entry.tsx", statement("f17"), statementMount, null, true);
    await shot("f18a-statement-settled", w, h, "money2.entry.tsx", statement("f18a"), statementMount, null, false);
    await shot("f18b-statement-settled-forgiven", w, h, "money2.entry.tsx", statement("f18b"), statementMount, null, false);
    await shot("f18c-statement-no-charges", w, h, "money2.entry.tsx", statement("f18c"), statementMount, null, false);
    await shot("f5-statement-forgiveness-used", w, h, "money2.entry.tsx", statement("f5"), statementMount, null, true);
    await shot("top-map-of-words", w, h, "paydue.entry.tsx", listServer([]), ["toneMap", OWNER, {}], null, false, '[data-testid="tone-map"]');
  }
  // the refund window (frame 2a) and the receipts (frame 19)
  for (const [w, h] of SIZES) {
    await shot("f2a-refund-window", w, h, "money2.entry.tsx", F.baseServer(() => null), ["refund", OWNER, {}], null, false).catch((e) => suspicious.push(`f2a-${w}: ${String(e).slice(0, 120)}`));
  }
  // frame 19: the receipts - the line of the server under the rows (closed by money / partial); a closed membership has none
  const receiptBase = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "pay2", "e1_receipt_300000.json"), "utf8"));
  const receipts = { "f19a-receipt-closed": { ...receiptBase, receipt_state_text: "оплачено до 30.11" }, "f19b-receipt-partial": { ...receiptBase, receipt_state_text: "оплачено 100 000 из 420 000 сум · к оплате 320 000 сум до 23.11" }, "f19c-receipt-closed-membership": { ...receiptBase, receipt_state_text: null } };
  for (const [w, h] of SIZES) for (const [name, receipt] of Object.entries(receipts)) await shot(name, w, h, "money.entry.tsx", () => null, ["receipt", undefined, { receipt }], null, true, '[aria-label^="Квитанция"]');
  // long names and eight-digit sums
  for (const w of [1280, 375]) {
    const h = w === 375 ? 812 : 900;
    await shot("L-leave-long", w, h, "money2.entry.tsx", leave([longDebt, X.LEAVE_ADVANCE({ membership_id: "m-b", group_id: "gb", group_name: X.LONG_GROUP })]), leaveMount, null, false);
    const big = { ...X.UPCOMING_14, amount: 24850000, terms_note: "сегодня ученик ещё числился в «Подготовка к олимпиаде по математике, 7 класс (углублённый курс)»" };
    await shot("L-enrol-bar", w, h, "money2.entry.tsx", X.enrolServer({ upcoming: big, payFrom: "2026-11-23" }), ["assign", OWNER, assignProps], pickGroup, false);
    const longRows = wordRows.map((r, i) => (i === 0 ? { ...r, student_name: X.LONG_NAME, group_name: X.LONG_GROUP, state_sub: "≈ 24 850 000 сум" } : r));
    await shot("L-list-words", w, h, "paydue.entry.tsx", listServer(longRows), listMount("bucket=active"), null, w !== 375);
    const wide = JSON.parse(JSON.stringify(X.STATEMENTS.f12)); wide.membership.student_name = X.LONG_NAME; wide.membership.group_name = X.LONG_GROUP; wide.forecast.sub = "прогноз: начислится 24 850 000 сум";
    await shot("L-statement-forecast", w, h, "money2.entry.tsx", F.baseServer((r) => (r.method === "GET" && r.path === "/auth/org/memberships/m-a/statement" ? { json: wide } : r.method === "GET" && r.path === "/auth/org/memberships/m-a/payments" ? { json: [] } : null)), statementMount, null, true);
  }
  await browser.close();
  console.log(suspicious.length ? suspicious.join("\n") : "no suspicious lines");
})().catch((e) => { console.error(e); process.exit(1); });
