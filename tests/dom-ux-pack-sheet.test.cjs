// UX pack №3 / №19 in a real browser: the page of the sheet of a month that moved after the saving (saved 120 834, accrued now 75 834, paid ahead 150 000).  On the SCREEN: the card says «Начислено на сегодня»
// with the number of today and the saved one in a line; the table has its caption in the head («Показана сохранённая версия — 120 834 сум»).  In PRINT the document has ONE total - the saved one - and one line
// about the accrual of today; the legend is one line.  The CSS is the project's tailwind.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => text.replace(/\s+/g, " ").trim();
const SHEET = { id: "s1", saved: true, month: "2026-11", period_start: "2026-11-01", period_end: "2026-11-30", month_open: true, teacher_id: "t1", teacher_name: "Эргашев К.", revision: 2,
  percents: { group: "50" }, divisor_default: 12, lines: require("./helpers/sheet-lines.cjs").lines, groups: require("./helpers/sheet-lines.cjs").groups, total_amount: 120834, counted_total: 7, unpaid_total: 1, pending_excused_total: 0, undecided_total: 3, written_off_total: 0,
  warnings: { open_lessons: null, pending_excused: 0, no_fee: 0, unpaid: 1, unpaid_students: 1 },
  payout: { saved_total: 120834, fresh_total: 75834, target: 75834, paid: 150000, balance: -74166, state: "overpaid", basis: "fresh", changed_by: -45000, change_text: null, text: "x", items: [], carry_in: 0, carry_used: 0, advance_out: 0 },
  source_fingerprint: "fp", stale: true, note: null, created_by_name: "Арслан", created_at: "2026-11-05T05:00:00", updated_by_name: "Рустам Валиев", updated_at: "2026-11-05T05:00:00" };
const server = (request) => {
  const { method, path: p } = request;
  if (method !== "GET") return null;
  if (p === "/auth/org/payroll/sheets/s1") return { json: SHEET };
  if (p === "/auth/org/payroll/sheets/s1/diff") return { json: { sheet_id: "s1", revision: 2, stale: true, source_fingerprint: "fp2", saved_total: 120834, fresh_total: 75834, delta_amount: -45000, reasons: [], rate_changes: [], lines: [] } };
  if (p === "/auth/org/payroll-periods") return { json: { month: "2026-11", items: [{ teacherId: "t1", teacherName: "Эргашев К.", month: "2026-11", state: "open", closedOn: null, sheetId: "s1", sheetRevision: 2, reopened: null }] } };
  if (p === "/auth/org/payroll/months/2026-11") return { json: { month: "2026-11", period_start: "2026-11-01", period_end: "2026-11-30", month_open: true, divisor: 12, lessons_without_teacher: 0, teachers: [{ teacher_id: "t1", teacher_name: "Эргашев К.", lessons_count: 12, lesson_types: [], rates: { group: "50" }, missing_rates: [], sheet: null, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 } }] } };
  if (p === "/auth/org/payroll/rates") return { json: { month: "2026-11", items: [] } };
  return null;
};
async function open(width) {
  const run = await openPage(browser, "money.entry.tsx", server, { width, height: 900 });
  await run.page.clock.setFixedTime(new Date("2026-11-05T10:00:00+05:00"));
  await run.page.evaluate(() => window.mount("sheetPage", { role: "owner", org_role: "owner" }));
  await run.page.waitForSelector('[data-testid="saved-table-note"]');
  return run;
}
const visible = (page, selector) => page.evaluate((s) => { const el = document.querySelector(s); return Boolean(el) && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"; }, selector);

test("on the screen: the caption in the head of the table, the number of today in the card, the saved one in a line; no print block", async () => {
  const { page } = await open(1280);
  assert.equal(plain(await page.textContent('[data-testid="saved-table-note"]')), "Показана сохранённая версия — 120 834 сум");
  assert.equal(plain(await page.textContent('[data-testid="payroll-total"]')), "75 834 сум");
  assert.equal(await visible(page, '[data-testid="sheet-print-totals"]'), false, "the print block is not on the screen");
  await page.close();
});

test("in PRINT: ONE total (the saved one «Итог ведомости 120 834 сум») and the line «Начислено на 05.11: 75 834 сум (месяц идёт)»; the big number of today is not printed twice", async () => {
  const { page } = await open(1280);
  await page.emulateMedia({ media: "print" });
  assert.equal(await visible(page, '[data-testid="sheet-print-totals"]'), true);
  const text = plain(await page.locator('[data-testid="sheet-print-totals"]').innerText());
  assert.match(text, /^Итог ведомости 120\s834\sсум Начислено на 05\.11: 75\s834\sсум \(месяц идёт\)/);
  assert.equal(await visible(page, '[data-testid="payroll-total"]'), false, "the number of today is one line, not a second total");
  assert.equal(await visible(page, '[data-testid="saved-table-note"]'), true, "the table says which version it is - on paper too");
  await page.close();
});

for (const width of [1280, 1024, 375]) {
  test(`${width}: nothing leaves its box, no horizontal scroll`, async () => {
    const { page } = await open(width);
    const facts = await page.evaluate(layoutProbe, "body");
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    await page.close();
  });
}
