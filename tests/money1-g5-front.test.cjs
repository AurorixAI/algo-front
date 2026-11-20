// Money-1 / Г, круг 5 (PRICE_PLACES.md): четыре мелочи состояния «цена запланирована» — места 12, 8, счётчики, 5. Макеты — настоящие случаи (обе запланированные цены).
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { start, plain } = require("./helpers/money1-v.cjs");
const { openPage } = require("./helpers/dom-page.cjs");

const ts = require("typescript");
const Module = require("node:module");
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest); };
const root = path.join(__dirname, "..");
const lib = (name) => require(path.join(root, "src", "lib", name));
let browser;
test.before(async () => { browser = await start(); });
test.after(async () => { await browser.close(); });

const shots = path.join(root, "..", "artifacts", "analysis", "money_g_front", "fix5");
fs.mkdirSync(shots, { recursive: true });

const GROUP_PLAN = { row_id: "r", amount: 420000, valid_from: "2026-12-01" };
const OWN_PLAN = { row_id: "o", amount: 380000, valid_from: "2026-12-01", reason: "x" };
const NONE = { amount: null, source: "none", valid_from: null, group_amount: null, reason: null };
const OWN = { ...NONE, scheduled: OWN_PLAN };
const T_B = "с 01.12 — 420 000 сум";
const T_V = "с 01.12 — 380 000 сум";
const PRICES = { as_of: "2026-11-15", period_mode: "calendar", price_label: "Цена в месяц", items: [{ group_id: "g1", name: "Алгебра 7", current: null, scheduled: GROUP_PLAN, scheduled_count: 1 }] };
const NO_PRICES = { ...PRICES, items: [{ ...PRICES.items[0], scheduled: null, scheduled_count: 0 }] };
const ROW = { membership_id: "m1", student_id: "s1", student_name: "Иванов Иван", display_id: "AL1-001", group_id: "g1", group_name: "Алгебра 7", teacher_name: "Петров", class_level: 7, is_primary: true, is_active: true, status: "none", period_mode: "calendar", paid_until: null, debt: 0, past_debt: 0, current_due: 0, advance: 0, partial_credit: 0, price_missing: true };
const CASES = [["б", NONE, T_B], ["в", OWN, T_V]];
// ── отрисовка по местам ──
const server = (prices, extra) => (request) => {
  const own = extra && extra(request);
  if (own) return own;
  if (request.method === "GET" && /\/auth\/org\/group-prices$/.test(request.path)) return { json: prices };
  return null;
};
const count = (run) => run.calls.filter((call) => /group-prices$/.test(call.path)).length;

async function mounted(entry, name, props, answer, width = 1280) {
  const run = await openPage(browser, entry, answer, { width, height: 900 });
  await run.page.clock.setFixedTime(new Date("2026-11-15T10:00:00+05:00"));
  await run.page.evaluate(([n, p]) => window.mount(n, p), [name, props]);
  return run;
}
const body = async (page) => plain(await page.textContent("body"));

const HIST_FUTURE = { id: "h1", amount: 420000, valid_from: "2026-12-01", note: null, created_by_name: null, created_at: null, is_current: false, is_future: true, changes: [] };

test("Р4-1 место 12: окно «Цена группы» без цены — «Сейчас цена не задана. Запланирована: с 01.12 — 420 000 сум.»; без запланированной — как было", async () => {
  const g = lib("group-price.ts");
  assert.deepEqual(g.groupPlannedFromHistory([{ ...HIST_FUTURE, id: "late", valid_from: "2027-01-01", amount: 1 }, HIST_FUTURE, { ...HIST_FUTURE, is_future: false, valid_from: "2026-01-01" }]), { amount: 420000, valid_from: "2026-12-01" });
  assert.equal(g.groupPlannedFromHistory([]), null);
  assert.equal(g.groupPriceNotSetText(null), "Сейчас цена не задана.");
  for (const width of [375, 1280]) {
    const run = await mounted("money-g4.entry.tsx", "groupPriceNone", { history: [HIST_FUTURE] }, server(PRICES), width);
    await run.page.waitForSelector('[data-testid="group-price-now"]');
    assert.match(plain(await run.page.textContent('[data-testid="group-price-now"]')), /^Сейчас цена не задана\. Запланирована: с 01\.12 — 420 000 сум\./);
    await run.page.waitForTimeout(400);
    await run.page.screenshot({ path: path.join(shots, `p12-group-price-${width}.png`) });
    await run.page.close();
  }
  const none = await mounted("money-g4.entry.tsx", "groupPriceNone", { history: [] }, server(PRICES));
  await none.page.waitForSelector('[data-testid="group-price-now"]');
  assert.doesNotMatch(plain(await none.page.textContent('[data-testid="group-price-now"]')), /Запланирована/);
  await none.page.close();
});

test("Р4-1 место 8: окно «Назначить индивидуальную цену» — справка о цене ГРУППЫ с подписью «Цена группы: с 01.12 — 420 000 сум.» (форма bare), у ученика со своей запланированной 380 000", async () => {
  const g = lib("group-price.ts");
  assert.equal(plain(g.othersPayText(500000, "Цена в месяц", GROUP_PLAN)), "Остальные платят по цене группы: 500 000 сум/мес.");
  assert.equal(plain(g.othersPayText(null, "Цена в месяц", GROUP_PLAN)), "Цена группы: " + T_B + ".");
  assert.equal(g.othersPayText(null, "Цена в месяц", null), "Цена группы не задана.");
  for (const width of [375, 1280]) {
    const run = await mounted("money-g4.entry.tsx", "assign", { row: { ...ROW, price: OWN } }, server(PRICES), width);
    await run.page.waitForFunction(() => /Цена группы: с 01/.test(document.querySelector('[data-testid="assign-others-pay"]')?.textContent || ""));
    const text = plain(await run.page.textContent('[data-testid="assign-others-pay"]'));
    assert.match(text, /Цена группы: с 01\.12 — 420 000 сум\./);
    assert.doesNotMatch(text, /380/);
    await run.page.waitForTimeout(400);
    await run.page.screenshot({ path: path.join(shots, `p8-assign-${width}.png`) });
    await run.page.close();
  }
});

test("Р4-1 счётчики: фильтр «Индивидуальная цена (N)» вкладки группы считает и запланированные свои цены (показан ученик со своей ценой); «Цены групп» — число сервера", async () => {
  const gp = lib("group-payments.ts");
  const label = "Цена в месяц";
  const inForce = { amount: 500000, source: "group", valid_from: "2026-09-01", group_amount: 500000, reason: null };
  const mk = (id, price) => gp.paymentRowView({ ...ROW, membership_id: id, student_id: id, student_name: "Ученик " + id, price, monthly_fee: price.amount }, { label, today: "2026-11-15", groupScheduled: null });
  const views = [mk("a", NONE), mk("b", OWN), mk("c", { ...inForce, scheduled: OWN_PLAN }), mk("d", { ...inForce, source: "override", reason: "льгота" }), mk("e", inForce), mk("f", { ...inForce, scheduled: { ...OWN_PLAN, amount: null } })];
  assert.deepEqual(gp.paymentsCounts(views).individual, 3, "b (своя запланированная, цены нет), c (действует групповая, запланирована своя), d (своя действует)");
  assert.deepEqual(gp.filterPaymentRows(views, "individual").map((v) => v.name), ["Ученик b", "Ученик c", "Ученик d"]);
  assert.equal(gp.filterChipLabel("individual", gp.paymentsCounts(views)), "Индивидуальная цена (3)");
  const rows = [{ ...ROW, price: OWN }, { ...ROW, membership_id: "m2", student_id: "s2", student_name: "Петров Пётр", price: { amount: 500000, source: "group", valid_from: "2026-09-01", group_amount: 500000, reason: null } }];
  for (const width of [375, 1280]) {
    const run = await mounted("money-g4.entry.tsx", "groupTab", {}, (r) => (r.path === "/auth/org/payments/status" ? { json: { items: rows.map((x) => ({ ...x, debt: 0, status: "ok" })), total: 2, limit: 50, offset: 0 } } : null), width);
    await run.page.waitForSelector('[data-testid="group-payment-row"]');
    assert.match(plain(await run.page.textContent("body")), /Индивидуальная цена \(1\)/);
    await run.page.screenshot({ path: path.join(shots, `counters-grouptab-${width}.png`) });
    await run.page.close();
  }
});

for (const [state, price, expected] of CASES) {
  test(`Р4-1 место 5 → PAY-DUE 9.7, страница «Оплаты» центра (${state}): колонки цены нет на 1280 и 375 - ни подписи столбца, ни слова «Цена» в строке`, async () => {
    const answer = server(PRICES, (r) => (r.path === "/auth/org/payments/summary" ? { json: { as_of: "2026-11-15", period_mode: "calendar", debtors: 1, debt_total: 100000, due_students: 0, due_total: 0, buckets: { debtors: 1, to_pay: 0, expiring: 0, active: 0, paused: 0 }, pay_due_days: 5, pay_due_lessons: 2 } } : r.path === "/auth/org/payments/status" ? { json: { items: [{ ...ROW, price, debt: 100000, debt_amount: 100000, due_amount: 0, state: "debt", state_text: "Долг 100 000 сум", debt_text: "Долг 100 000 сум", debt_sub: "просрочено 3 дня", status: "active" }], total: 1, students: 1, limit: 50, offset: 0 } } : null));
    for (const width of [375, 1280]) {
      const run = await mounted("money-g4.entry.tsx", "payments", {}, answer, width);
      await run.page.waitForSelector('[data-testid="pay-label"]', { timeout: 8000 });
      assert.equal(await run.page.locator('[data-col="price"]').count(), 0, "нет колонки цены");
      assert.equal(await run.page.locator('[data-testid="payment-row-price-missing"]').count(), 0);
      assert.ok(!/[Цц]ена/.test(plain(await run.page.locator('[data-testid="payments-table"]').textContent())), "слова «Цена» в таблице нет");
      if (state === "в") await run.page.screenshot({ path: path.join(shots, `p5-payments-${width}.png`) });
      await run.page.close();
    }
  });
}
