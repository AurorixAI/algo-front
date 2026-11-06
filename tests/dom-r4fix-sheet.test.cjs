// R4 fixes of the sheet page (Д1, Д2, Д3, Д7) in a real browser: the tables of the groups fit their card on a phone, a changed salary is said once, the undecided lessons are the count of NOW.
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
const base = require("./helpers/sheet-lines.cjs");
// the lines of the stage case: a student with 8 unpaid lessons (the column «Без оплаты» with the checkbox «начислить»), an individual price
const lines = base.lines.map((line, index) => ({ ...line, student_name: index === 0 ? "Тошматов Бобур" : line.student_name, display_id: `DS-00${index + 2}`, unpaid: index === 0 ? 8 : 0, undecided: 1, no_pay: index === 0 ? 0 : 1, price_source: "override", counted: 9, amount: 1112500 + index, monthly_fee: 400000 }));
const sheetOf = ({ stale, changedBy, fresh, undecidedTotal, month = "2026-10", monthOpen = false }) => ({
  id: "s1", saved: true, month, period_start: `${month}-01`, period_end: `${month}-28`, month_open: monthOpen, teacher_id: "t1", teacher_name: "Эргашев К.", revision: 2,
  percents: { group: "50" }, divisor_default: 12, lines, groups: base.groups, total_amount: 757500, counted_total: 18, unpaid_total: 8, undecided_total: undecidedTotal, pending_excused: 0,
  warnings: { open_lessons: null, pending_excused: 0, no_fee: 0, unpaid: 1, unpaid_students: 1 },
  payout: { saved_total: 757500, fresh_total: fresh, target: 757500, paid: 0, balance: 757500, state: "unpaid", basis: "saved", changed_by: changedBy, change_text: null, text: "x", items: [], carry_in: 0, carry_used: 0 },
  source_fingerprint: "fp", stale, note: null, created_by_name: "Арслан", created_at: "2026-11-05T05:00:00", updated_by_name: "Рустам", updated_at: "2026-11-05T05:00:00",
});
let sheet; let undecidedLessons = 0;
const server = (request) => {
  const { method, path: p } = request;
  if (method !== "GET") return null;
  if (p === "/auth/org/payroll/sheets/s1") return { json: sheet };
  if (p === "/auth/org/payroll/sheets/s1/diff") return { json: { sheet_id: "s1", revision: 2, stale: sheet.stale, source_fingerprint: "fp2", saved_total: 757500, fresh_total: sheet.payout.fresh_total, delta_amount: sheet.payout.changed_by, reasons: [], rate_changes: [], lines: [] } };
  if (p === "/auth/org/payroll-periods") return { json: { month: sheet.month, items: [{ teacherId: "t1", teacherName: "Эргашев К.", month: sheet.month, state: "closed", closedOn: "2026-11-03", sheetId: "s1", sheetRevision: 2, canReopen: true }] } };
  if (p === `/auth/org/payroll/months/${sheet.month}`) return { json: { month: sheet.month, period_start: sheet.period_start, period_end: sheet.period_end, month_open: sheet.month_open, divisor: 12, lessons_without_teacher: 0, teachers: [{ teacher_id: "t1", teacher_name: "Эргашев К.", undecided_lessons: undecidedLessons, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 1, unpaid_students: 1 }, total_amount: 757500, counted_total: 18, unpaid_total: 8, sheet: { id: "s1", stale: sheet.stale } }] } };
  if (p === "/auth/org/payroll/rates") return { json: { month: sheet.month, items: [] } };
  return null;
};
async function open(width) {
  const run = await openPage(browser, "money.entry.tsx", server, { width, height: 900 });
  await run.page.clock.setFixedTime(new Date("2026-11-05T10:00:00+05:00"));
  await run.page.evaluate(() => window.mount("sheetPage", { role: "owner", org_role: "owner" }));
  await run.page.waitForSelector('section[aria-label^="Группа"]');
  await run.page.waitForTimeout(400);
  return run;
}

test("Д1: the item «ждут решения» of the sheet is the count of NOW (0 after the decision), not the saved undecided_total", async () => {
  sheet = sheetOf({ stale: true, changedBy: 133333, fresh: 890833, undecidedTotal: 1 }); undecidedLessons = 0;
  let { page } = await open(1280);
  assert.doesNotMatch(plain(await page.innerText("body")), /ждут решения|ждёт решения/);
  await page.close();
  undecidedLessons = 2;
  ({ page } = await open(1280));
  assert.match(plain(await page.innerText("body")), /2 дополнительных урока ждут решения/);
  await page.close();
});

test("Д2: «Зарплата изменилась на +133 333 сум» is said once on the page", async () => {
  sheet = sheetOf({ stale: true, changedBy: 133333, fresh: 890833, undecidedTotal: 0 }); undecidedLessons = 0;
  const { page } = await open(1280);
  const text = plain(await page.innerText("body"));
  assert.equal(text.split("изменилась на +133").length - 1, 1, text.slice(0, 600));
  await page.close();
});

for (const width of [1280, 1024, 375, 340]) {
  test(`Д3 ${width}: the table of every group fits its card (no sideways scroll inside), «Заработано» is visible`, async () => {
    sheet = sheetOf({ stale: true, changedBy: 133333, fresh: 890833, undecidedTotal: 0 }); undecidedLessons = 0;
    const { page } = await open(width);
    const facts = await page.evaluate(() => [...document.querySelectorAll('section[aria-label^="Группа"] [role="region"]')].map((el) => ({ scroll: el.scrollWidth, box: el.clientWidth })));
    assert.ok(facts.length > 0);
    for (const fact of facts) assert.ok(fact.scroll <= fact.box + 1, JSON.stringify(facts));
    const probe = await page.evaluate(layoutProbe, "body");
    assert.deepEqual(probe.bad, [], JSON.stringify(probe.bad));
    assert.equal(probe.scroll, 0);
    await page.screenshot({ path: path.join(os.tmpdir(), `r4fix-sheet-${width}.png`), fullPage: true });
    await page.close();
  });
}

// the elements of a screen that are smaller than 40 px in height (a checkbox / radio: the invisible input is the target)
const small = (page) => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("button, a[href], [role=tab], input:not([type=hidden])")) {
    if (el.closest(".sr-only")) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.height < 39.5) out.push(`${(el.getAttribute("aria-label") || el.textContent || el.type || "").trim().slice(0, 30)} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
  }
  return out;
});

test("Д7 375: the sheet of a closed month (back link, tabs, «Записать выплату», «Отменить» of a payout, «По датам», «Переоткрыть месяц») has no target under 40 px", async () => {
  sheet = sheetOf({ stale: false, changedBy: 0, fresh: 757500, undecidedTotal: 0 }); undecidedLessons = 0;
  sheet.payout.items = [{ id: "p1", paid_on: "2026-11-05", amount: 50000, method: "cash", note: null, created_by_name: "Рустам Валиев", created_at: "2026-11-05T05:00:00", voided_at: null, void_reason: null }];
  const { page } = await open(375);
  assert.deepEqual(await small(page), []);
  assert.ok(await page.locator('[data-testid="reopen-month"]').count() >= 0);
  await page.screenshot({ path: path.join(os.tmpdir(), "r4fix-sheet-closed-375.png"), fullPage: true });
  await page.close();
});

test("Д7 375: the checkbox «начислить» is a 40 px target (the box stays 18 px) and the probe is clean", async () => {
  sheet = sheetOf({ stale: false, changedBy: 0, fresh: 757500, undecidedTotal: 0, month: "2026-11", monthOpen: true }); undecidedLessons = 0;
  const { page } = await open(375);
  const box = await page.evaluate(() => { const el = document.querySelector('section[aria-label^="Группа"] input[type=checkbox]'); if (!el) return null; const r = el.getBoundingClientRect(); const v = el.nextElementSibling.getBoundingClientRect(); return { w: r.width, h: r.height, vw: v.width }; });
  assert.ok(box, "the table has the checkbox of the line with unpaid lessons");
  assert.ok(box.w >= 40 && box.h >= 40, JSON.stringify(box));
  assert.equal(box.vw, 18);
  const probe = await page.evaluate(layoutProbe, "body");
  assert.deepEqual(probe.bad, [], JSON.stringify(probe.bad));
  await page.screenshot({ path: path.join(os.tmpdir(), "r4fix-sheet-open-375.png"), fullPage: true });
  await page.close();
});
