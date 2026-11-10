// «Деньги-1 / В» (walk of stage Д2 and Д8): every date of a timestamp of the package is the day of the clock of Tashkent (01:50 on 11.11 = 20:50 UTC of 10.11; 00:30 = 19:30 UTC of the day before);
// on 375 the controls of the new screens are tap zones of 40 px.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { start, plain, open, root } = require("./helpers/money1-v.cjs");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
};
const V = require(path.join(root, "src/lib/payments-income-v2.ts"));
const D = require(path.join(root, "src/lib/payments-decisions.ts"));
const L = require(path.join(root, "src/lib/payments-ledger.ts"));

test("the journal: «отменена 11.11» / «исправлена 11.11» for 01:50 of Tashkent (20:50 UTC of 10.11); 00:30 of Tashkent = 19:30 UTC of the day before", () => {
  for (const [utc, day] of [["2026-11-10T20:50:00", "11.11"], ["2026-11-10T19:30:00", "11.11"], ["2026-11-10T18:59:00", "10.11"], ["2026-11-11T08:00:00", "11.11"]]) {
    const voided = V.cancelledSubLine({ status: "voided", voided_at: utc, voided_by_name: "Иванова Д.", void_reason: "ошибка" });
    assert.match(voided, new RegExp(`^↳ отменена ${day.replace(".", "\\.")} · `), utc);
    assert.match(V.correctionLine({ status: "active", replaces_receipt_no: 4, replaces_amount: 100000, amount: 90000, corrected_at: utc, corrected_by_name: "Иванова Д." }), new RegExp(`исправил Иванова Д\\. ${day.replace(".", "\\.")}`), utc);
  }
  assert.match(V.cancelledSubLine({ status: "voided", voided_at: "2026-10-05", voided_by_name: null, void_reason: null }), /отменена 05\.10/, "a plain day stays as it is");
  assert.equal(V.statusTag({ status: "voided", replaced_by_receipt_no: null, view: "cancelled_here", paid_on: "2026-10-05", voided_at: "2026-11-10T20:50:00" }), "Оплата 05.10 (отменена 11.11)");
});

test("«Решения», the decision of the drawer and the already-voided note: the same clock", () => {
  assert.equal(D.decisionWhen("2026-11-10T19:30:00"), "11.11 · 00:30");
  assert.equal(D.decisionWhen("2026-11-10T20:50:00"), "11.11 · 01:50");
  assert.match(L.alreadyVoidedText(Object.assign(new Error("x"), { code: "ALREADY_VOIDED", detail: { code: "ALREADY_VOIDED", message: "Оплата уже отменена", voided_at: "2026-11-10T19:30:00", voided_by_name: "Иванова Д." } })), /Иванова Д\., 11\.11\.2026 00:30$/);
  assert.equal(D.decisionsSinceText("2026-11-11"), "Журнал ведётся с 11.11.2026");
});

let browser;
test.before(async () => { browser = await start(); });
test.after(async () => { await browser.close(); });

test("375: the receipt of an operation at 00:30 Tashkent says «Выдана 11.11.2026 · 00:30» and the stamp 11.11", async () => {
  const receipt = { receipt_no: 21, org_name: "ALGO", student_name: "Тошматов Бобур", group_name: "Алгебра 7", currency: "UZS", paid_on: "2026-11-05", method: "cash", mode: "calendar", amount: 400000, amount_words: "Четыреста тысяч сум", allocations: [], debt_before: 0, debt_after: 0, advance_after: 0, note: null, accepted_by_name: "Арслан", voided_at: "2026-11-10T19:30:00", void_reason: "ошибка", void_note: null, issued_at: "2026-11-10T19:30:00", is_copy: false, disclaimer: "Не является фискальным чеком", replaced_by_receipt_no: null, replaces_receipt_no: null };
  const { page } = await open(browser, "money-v.entry.tsx", "receiptPage", { width: 375, server: (r) => (r.method === "GET" && r.path === "/auth/org/payments/p1/receipt" ? { json: receipt } : null) });
  await page.waitForSelector('[aria-label^="Квитанция"]');
  assert.equal(plain(await page.textContent('[data-testid="sheet-issued"]')), "Выдана 11.11.2026 · 00:30");
  assert.match(plain(await page.locator('[role="note"]').innerText()), /ОПЛАТА ОТМЕНЕНА ошибка · 11\.11\.2026/);
  await page.close();
});

const height = (page, selector) => page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().height);

test("375: «Показать отменённые» and the chips of «Куда ушли деньги» are 40 px high or more", async () => {
  const row = { id: "j1", receipt_no: 5, paid_on: "2026-11-05", paid_time: "10:00", created_at: null, student_id: "s1", student_name: "Тошматов Бобур", display_id: null, membership_id: "m1", group_id: "g1", group_name: "Алгебра 7", teacher_name: null, amount: 400000, method: "cash", method_label: "Наличные", created_by_id: null, created_by_name: null, note: null, allocation_text: null, allocations: [], refunded: 0, transferred: 0, status: "active", replaces_receipt_no: null, replaces_amount: null, replaced_by_receipt_no: null, void_reason: null, voided_at: null, voided_by_name: null };
  const journal = { as_of: "2026-11-15", from: "2026-11-01", to: "2026-11-30", page: 1, size: 25, total: 1, pages: 1, totals: { count: 1, sum: 400000, voided_count: 2 }, rows: [row], authors: [], history: [] };
  const first = await open(browser, "money-v.entry.tsx", "journal", { width: 375, props: { journal, showVoided: false } });
  await first.page.waitForSelector('[data-testid="journal-voided-toggle"]');
  assert.ok((await height(first.page, '[data-testid="journal-voided-toggle"]')) >= 40);
  await first.page.close();
  const overview = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "income2", "I01_income_month_october.json"), "utf8"));
  const second = await open(browser, "money-v.entry.tsx", "flowLine", { width: 375, props: { overview } });
  await second.page.waitForSelector('[data-testid="flow-legend-row"]');
  const heights = await second.page.locator('[data-testid="flow-legend-row"]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  assert.ok(heights.length >= 1 && heights.every((h) => h >= 40), heights.join(","));
  await second.page.close();
});

test("375: «Все месяцы», «Показать отменённые» of the statement and «Отменить» of a planned price carry the tap zone (the classes of the screens)", () => {
  const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
  const statement = read("src/components/payments/statement-view.tsx");
  assert.match(statement, /const BUTTON = "[^"]*max-sm:min-h-10"/);
  assert.match(statement, /ml-auto flex items-center gap-2 py-1\.5 text-sm text-slate-700 max-sm:min-h-10/);
  assert.match(read("src/components/payments/group-prices-page.tsx"), /onClick=\{onCancel\} className="[^"]*max-sm:min-h-10[^"]*">Отменить<\/button>/);
});

test("«Моя зарплата» asks the routes of the server - /auth/org/me/payroll and /auth/org/me/payroll/months - and no other", () => {
  const api = fs.readFileSync(path.join(root, "src/lib/api.ts"), "utf8");
  assert.match(api, /`\/auth\/org\/me\/payroll\?month=/);
  assert.match(api, /"\/auth\/org\/me\/payroll\/months"/);
  assert.doesNotMatch(api, /payroll\/my\b/);
});

// ── walk of stage Д3: the sentence of the server under the strip «Куда ушли деньги» ─────────────────────

test("the strip: the server's `refunded_text` stands under it as ONE muted line, as it came; without it - no line; the row says «возвращено из этих денег» (the server's label)", async () => {
  const overview = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "income2", "I01_income_month_october.json"), "utf8"));
  const withText = { ...overview, refunded_total: 140000, refunded_from_earlier: 50000, refunded_text: "Всего возвращено за период: 140\u00a0000 сум (из них 50\u00a0000 — из денег прошлых периодов)" };
  {
    const { page } = await open(browser, "money-v.entry.tsx", "flowLine", { props: { overview: withText } });
    await page.waitForSelector('[data-testid="flow-refunded-text"]');
    assert.equal(plain(await page.textContent('[data-testid="flow-refunded-text"]')), "Всего возвращено за период: 140 000 сум (из них 50 000 — из денег прошлых периодов)");
    assert.equal(await page.locator('[data-testid="flow-refunded-text"]').count(), 1);
    assert.match(plain(await page.textContent('[data-testid="income-flow"]')), /возвращено из этих денег/);
    await page.close();
  }
  {
    const { page } = await open(browser, "money-v.entry.tsx", "flowLine", { props: { overview: { ...overview, refunded_text: null } } });
    await page.waitForSelector('[data-testid="income-flow"]');
    assert.equal(await page.locator('[data-testid="flow-refunded-text"]').count(), 0);
    await page.close();
  }
  const normalized = V.normalizeOverview({ ...withText });
  assert.deepEqual([normalized.refunded_total, normalized.refunded_from_earlier, normalized.refunded_text === withText.refunded_text], [140000, 50000, true]);
  assert.deepEqual([V.normalizeOverview({}).refunded_total, V.normalizeOverview({}).refunded_text], [0, null]);
});
