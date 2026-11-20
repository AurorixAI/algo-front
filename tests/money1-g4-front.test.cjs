// Money-1 / Г, круг 4 (FIX_ROUND4.md): цена ученика и группы — ОДНА функция на все экраны. Таблица состояний (б) (в) (г) + отрисовка на каждое место описи (artifacts/money1-stage/g3m/PRICE_PLACES.md).
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

const shots = path.join(root, "..", "artifacts", "analysis", "money_g_front", "fix4");
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

// ── общая функция: таблица состояний ──
test("Р4-1 lib: plannedPriceOf — своя запланированная первой, иначе групповая, иначе null; при действующей цене планировать нечего", () => {
  const g = lib("group-price.ts");
  const inForce = { amount: 500000, source: "group", valid_from: "2026-09-01", group_amount: 500000, reason: null, scheduled: OWN_PLAN };
  assert.equal(g.plannedPriceOf(inForce, GROUP_PLAN), null, "(а)");
  assert.deepEqual(g.plannedPriceOf(NONE, GROUP_PLAN), { amount: 420000, valid_from: "2026-12-01" }, "(б)");
  assert.deepEqual(g.plannedPriceOf(OWN, GROUP_PLAN), { amount: 380000, valid_from: "2026-12-01" }, "(в) своя важнее групповой");
  assert.deepEqual(g.plannedPriceOf(OWN, null), { amount: 380000, valid_from: "2026-12-01" }, "(в) без групповой");
  assert.equal(g.plannedPriceOf(NONE, null), null, "(г)");
  assert.deepEqual(g.plannedPriceOf({ ...NONE, scheduled: { amount: null, valid_from: "2026-12-01" } }, GROUP_PLAN), { amount: 420000, valid_from: "2026-12-01" }, "своя «цена группы снова» — не сумма");
  assert.deepEqual(g.plannedPriceOf({ ...NONE, scheduled: { ...OWN_PLAN, amount: 0 } }, GROUP_PLAN), { amount: 0, valid_from: "2026-12-01" }, "бесплатно — тоже цена");
  assert.equal(g.plannedPriceOf(undefined, undefined), null);
});

test("Р4-1 lib: все подписи по состояниям (б)(в)(г) — одна функция priceNotInForceText над plannedPriceOf", () => {
  const g = lib("group-price.ts");
  const label = "Цена в месяц";
  // строка ученика
  assert.equal(plain(g.membershipPriceLine(NONE, label, GROUP_PLAN).text), "Цена " + T_B);
  assert.equal(plain(g.membershipPriceLine(OWN, label, GROUP_PLAN).text), "Цена " + T_V);
  assert.equal(plain(g.membershipPriceLine(NONE, label, null).text), "Цена группы не задана");
  // окно записи «Зачислить в группу»: группа — под названием, строчными («цена с … — …» / «цена не задана» / «5 сум в месяц»)
  assert.equal(plain(g.priceNotInForceText(GROUP_PLAN, "цена не задана")), "цена " + T_B);
  assert.equal(plain(g.priceNotInForceText(null, "цена не задана")), "цена не задана");
  assert.equal(plain(lib("enrol-terms.ts").priceInWords(5, label)), "5 сум в месяц");
  // «Открытие учёта»
  const o = lib("openings.ts");
  const mk = (price) => ({ price, mode: "calendar" });
  assert.equal(plain(o.priceText(mk(NONE), GROUP_PLAN)), "цена " + T_B);
  assert.equal(plain(o.priceText(mk(OWN), GROUP_PLAN)), "цена " + T_V);
  assert.equal(plain(o.priceText(mk(NONE), null)), "цена не задана");
  // строки вкладки группы
  const row = (price) => ({ ...ROW, price, monthly_fee: null });
  const view = (price, grp) => lib("group-payments.ts").paymentRowView(row(price), { label, today: "2026-11-15", groupScheduled: grp });
  assert.equal(plain(view(NONE, GROUP_PLAN).priceText), T_B);
  assert.equal(plain(view(OWN, GROUP_PLAN).priceText), T_V);
  assert.equal(view(NONE, null).priceText, "Не задана");
  assert.equal(view(OWN, GROUP_PLAN).scheduledText, null, "своя запланированная уже стоит как цена: не дважды");
});

test("Р4-1 lib: чип «нет цены» в «Открытии учёта» — только когда ничего не запланировано", () => {
  const o = lib("openings.ts");
  const row = (price) => o.normalizeRow({ membership_id: "m", student: { id: "s", name: "Иван" }, group: { id: "g1", name: "А" }, mode: "calendar", price, enrolled_on: "2026-09-01", status: "active" });
  const keys = (r, planned) => o.rowChips(r, "2026-09-01", planned).map((c) => c.key);
  assert.ok(keys(row(NONE), null).includes("no_price"), "(г)");
  assert.ok(!keys(row(NONE), GROUP_PLAN).includes("no_price"), "(б)");
  assert.ok(!keys(row(OWN), null).includes("no_price"), "(в)");
  assert.equal(row(OWN).price.scheduled.amount, 380000, "normalizeRow сохраняет свою запланированную");
});

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

for (const [state, price, expected] of CASES) {
  test(`Р4-1 место 6, страница ученика «Оплаты по группам» (${state}): «Цена ${expected}», не цена группы при своей; запрос цен групп один`, async () => {
    const run = await mounted("money-g4.entry.tsx", "priceLine", { row: { ...ROW, price } }, server(PRICES));
    await run.page.waitForFunction((t) => (document.body.textContent || "").replace(/[\s  ]+/g, " ").includes(t), expected);
    assert.equal(plain(await run.page.textContent('[data-testid="membership-price"]')), "Цена " + expected);
    assert.equal(count(run), 1);
    assert.doesNotMatch(await body(run.page), /не задана/);
    if (state === "в") await run.page.screenshot({ path: path.join(shots, "student-v-1280.png") });
    await run.page.close();
    if (state === "в") {      // the same at 375: the text of the phone is read, not only the width (LL 126)
      const phone = await mounted("money-g4.entry.tsx", "priceLine", { row: { ...ROW, price } }, server(PRICES), 375);
      await phone.page.waitForFunction((t) => (document.body.textContent || "").replace(/[\s\u00a0\u202f]+/g, " ").includes(t), expected);
      assert.equal(plain(await phone.page.textContent('[data-testid="membership-price"]')), "Цена " + expected);
      assert.ok((await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
      await phone.page.screenshot({ path: path.join(shots, "student-v-375.png") });
      await phone.page.close();
    }
  });

  test(`Р4-1 место 7, карточка «Индивидуальная цена» (${state}): «Сейчас: Цена ${expected}» не янтарным`, async () => {
    const run = await mounted("money-g4.entry.tsx", "individual", { row: { ...ROW, price } }, server(PRICES, (r) => (/price-override$/.test(r.path) ? { json: { membership_id: "m1", group_id: "g1", as_of: "2026-11-15", period_mode: "calendar", price_label: "Цена в месяц", price, history: [], cancelled: [] } } : null)));
    await run.page.waitForFunction((t) => (document.querySelector('[data-testid="individual-price-now"]')?.textContent || "").replace(/[\s  ]+/g, " ").includes(t), expected);
    assert.equal(plain(await run.page.textContent('[data-testid="individual-price-now"]')), "Цена " + expected);
    const colour = await run.page.locator('[data-testid="individual-price-now"]').evaluate((el) => getComputedStyle(el).color);
    assert.notEqual(colour, "rgb(146, 64, 14)", "не янтарный");
    assert.doesNotMatch(plain(await run.page.textContent('[data-testid="individual-price-dialog"]')), /не задана/);
    await run.page.waitForTimeout(600);
    await run.page.screenshot({ path: path.join(shots, `pricecard-${state}-1280.png`) });
    await run.page.close();
    const phone = await mounted("money-g4.entry.tsx", "individual", { row: { ...ROW, price } }, server(PRICES, (r) => (/price-override$/.test(r.path) ? { json: { membership_id: "m1", group_id: "g1", as_of: "2026-11-15", period_mode: "calendar", price_label: "Цена в месяц", price, history: [], cancelled: [] } } : null)), 375);
    await phone.page.waitForFunction((t) => (document.querySelector('[data-testid="individual-price-now"]')?.textContent || "").replace(/[\s\u00a0\u202f]+/g, " ").includes(t), expected);
    assert.equal(plain(await phone.page.textContent('[data-testid="individual-price-now"]')), "Цена " + expected);
    await phone.page.waitForTimeout(600);
    await phone.page.screenshot({ path: path.join(shots, `pricecard-${state}-375.png`) });
    await phone.page.close();
  });

  test(`Р4-1 место 11, «Открытие учёта» (${state}): цена «Цена ${expected}», чипа «нет цены» нет`, async () => {
    const raw = { membership_id: "m1", student: { id: "s1", name: "Иванов Иван" }, group: { id: "g1", name: "Алгебра 7" }, mode: "calendar", price, enrolled_on: "2026-09-01", status: "active" };
    const run = await mounted("money-g4.entry.tsx", "openings", { rows: [raw] }, server(PRICES));
    await run.page.waitForFunction((t) => (document.body.textContent || "").replace(/[\s  ]+/g, " ").includes(t), expected);
    assert.equal(plain(await run.page.textContent('[data-testid="openings-price"]')), "цена " + expected);
    assert.doesNotMatch(await body(run.page), /нет цены|не задана/);
    await run.page.close();
  });

  test(`Р4-1 место 5 → PAY-DUE 9.7, страница «Оплаты» центра (${state}): колонки цены в списке НЕТ (ни суммы, ни «цена группы не задана», ни «цена с …») - цена живёт в выписке и на странице группы`, async () => {
    const answer = server(PRICES, (r) => (r.path === "/auth/org/payments/summary" ? { json: { as_of: "2026-11-15", period_mode: "calendar", debtors: 1, debt_total: 100000, due_students: 0, due_total: 0, buckets: { debtors: 1, to_pay: 0, expiring: 0, active: 0, paused: 0 }, pay_due_days: 5, pay_due_lessons: 2 } } : r.path === "/auth/org/payments/status" ? { json: { items: [{ ...ROW, price, debt: 100000, debt_amount: 100000, due_amount: 0, state: "debt", state_text: "Долг 100 000 сум", debt_text: "Долг 100 000 сум", debt_sub: "просрочено 3 дня", status: "active" }], total: 1, students: 1, limit: 50, offset: 0 } } : null));
    const run = await mounted("money-g4.entry.tsx", "payments", {}, answer);
    await run.page.waitForSelector('[data-testid="pay-label"]', { timeout: 8000 });
    assert.equal(await run.page.locator('[data-testid="payment-row-price-missing"]').count(), 0);
    assert.equal(await run.page.locator('[data-col="price"]').count(), 0);
    assert.ok(!/Цена в месяц|Цена пакета|цена группы не задана/.test(plain(await run.page.textContent("body"))));
    await run.page.close();
  });
}

test("Р4-1 место 10, ящик «Зачислить в группу» (б)(г): «цена с … — 420 000 сум» под названием без «не задана»; без цены вовсе — «цена не задана» + строка «Задать цену»", async () => {
  const STUDENT = { id: "s1", first_name: "Иван", last_name: "Иванов", full_name: "Иванов Иван", class_level: 7, status: "new", group_id: null, groups_count: 0, current_group_id: null };
  const answer = (r) => (r.path === "/auth/org/students" ? { json: { items: [STUDENT], total: 1 } } : /\/groups/.test(r.path) ? { json: [] } : null);
  const run = await mounted("money-g4.entry.tsx", "drawer", { scheduled: GROUP_PLAN }, server(PRICES, answer));
  await run.page.waitForFunction(() => /цена с 01\.12/.test(document.body.textContent || ""));
  const text = await body(run.page);
  assert.match(text, /цена с 01\.12 — 420 000 сум/);
  assert.doesNotMatch(text, /не задана/);
  await run.page.click('label:has-text("Иванов Иван")');
  await run.page.waitForSelector('[data-testid="enrol-note-price"]');
  assert.match(plain(await run.page.textContent('[data-testid="enrol-note-price"]')), /До начала действия цены сумма оплаты не подсказывается/);
  assert.equal(await run.page.getByRole("link", { name: "Цена группы" }).count(), 1, "a planned price leads to the page of the prices, not to «Задать»");
  await run.page.close();
  const none = await mounted("money-g4.entry.tsx", "drawer", {}, server(NO_PRICES, answer));
  await none.page.waitForFunction(() => /цена не задана/.test(document.body.textContent || ""));
  await none.page.click('label:has-text("Иванов Иван")');
  await none.page.waitForSelector('[data-testid="enrol-note-price"]');
  assert.equal(await none.page.getByRole("link", { name: "Задать цену" }).count(), 1);
  assert.match(plain(await none.page.textContent('[data-testid="enrol-note-price"]')), /Пока цена не задана, сумма оплаты не подсказывается/);
  await none.page.close();
});

test("Р4-1 место 3, вкладка «Оплаты» группы (г): строки «Цена группы не задана» нет (чип шапки) — вместо неё ссылка «Задать цену группы»; (б) — подпись и ссылка «Цена группы»", async () => {
  const none = { ...ROW };
  const answer = (r) => (r.path === "/auth/org/payments/status" ? { json: { items: [{ ...none, price: NONE }], total: 1, limit: 50, offset: 0 } } : null);
  for (const width of [375, 1280]) {
    const run = await mounted("money-g4.entry.tsx", "groupTab", {}, answer, width);
    await run.page.waitForSelector('[data-testid="group-payments-summary"]');
    const summary = plain(await run.page.textContent('[data-testid="group-payments-summary"]'));
    assert.equal(summary, "Задать цену группы");
    assert.equal(await run.page.locator('[data-testid="group-payments-set-price"]').count(), 1);
    assert.doesNotMatch(summary, /не задана/);
    assert.ok((await run.page.locator('[data-testid="group-payments-set-price"]').evaluate((el) => el.getBoundingClientRect().height)) >= (width === 375 ? 40 : 10));
    await run.page.screenshot({ path: path.join(shots, `grouptab-g-${width}.png`), fullPage: true });
    await run.page.close();
  }
  const planned = await mounted("money-g4.entry.tsx", "groupTab", { scheduled: GROUP_PLAN }, answer);
  await planned.page.waitForSelector('[data-testid="group-payments-summary"]');
  assert.match(plain(await planned.page.textContent('[data-testid="group-payments-summary"]')), /^Цена с 01\.12 — 420 000 сум\s?Цена группы$/);
  await planned.page.close();
});

test("Р4-1: исходники — ни одно место не выбирает «запланированную» своей веткой (одна plannedPriceOf)", () => {
  const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
  // PAY-DUE 9.7: the list of «Оплаты» has no price column, so it no longer chooses a planned price at all
  assert.doesNotMatch(read("src/components/payments/payments-page.tsx"), /plannedPriceOf|priceOfRow/);
  for (const f of ["src/components/payments/membership-price.tsx", "src/lib/openings.ts", "src/lib/group-payments.ts", "src/lib/group-price.ts"]) {
    assert.match(read(f), /plannedPriceOf/, f);
  }
  assert.doesNotMatch(read("src/lib/group-payments.ts"), /own \?\? options\.groupScheduled/, "локальная ветка выбора убрана");
});

// ── Р4-2: «Сотрудники», вкладки на 375 ──
test("Р4-2: «Сотрудники» — три вкладки целиком в одной строке при счётчиках до трёхзначных (375: нет прокрутки вбок, подписи не обрезаны); 1280 как был", async () => {
  const member = (id, active) => ({ id: `${id}`, member_id: `m-${id}`, user_id: `${id}`, first_name: "Имя", last_name: `Ф${id}`, email: `${id}@example.test`, org_role: id === "o" ? "owner" : "teacher", is_active: active });
  const many = (n, prefix, active) => Array.from({ length: n }, (_, i) => member(`${prefix}${i}`, active));
  const invite = (i) => ({ id: `i${i}`, email: `i${i}@example.test`, org_role: "teacher", status: "pending", expires_at: "2030-01-01T00:00:00", created_at: "2026-11-10T00:00:00", email_status: "sent" });
  for (const [members, former, invites] of [[4, 2, 2], [120, 130, 250], [999, 999, 999]]) {
    const answer = (request) => {
      if (request.path === "/auth/org/members") return { json: /status=removed/.test(request.query) ? many(former, "f", false) : many(members, "a", true) };
      if (request.path === "/auth/org/invitations") return { json: Array.from({ length: invites }, (_, i) => invite(i)) };
      if (request.path === "/auth/org/payroll/rates") return { json: { items: [] } };
      return null;
    };
    for (const width of [375, 360, 1280]) {
      const run = await openPage(browser, "staff.entry.tsx", answer, { width, height: 900 });
      await run.page.evaluate(() => window.mountStaff());
      await run.page.waitForSelector('[data-testid="staff-tabs"] button');
      await run.page.waitForTimeout(500);
      const facts = await run.page.evaluate(() => {
        const tabs = document.querySelector('[data-testid="staff-tabs"]');
        const box = tabs.getBoundingClientRect();
        const buttons = [...tabs.querySelectorAll("button")].map((b) => { const r = b.getBoundingClientRect(); const visible = [...b.querySelectorAll("span")].filter((s) => s.offsetParent !== null).map((s) => s.textContent).join("|"); return { text: (b.innerText || "").replace(/\s+/g, " ").trim(), left: r.left, right: r.right, h: Math.round(r.height), clipped: b.scrollWidth > b.clientWidth + 1, visible }; });
        return { scroll: tabs.scrollWidth - tabs.clientWidth, boxRight: box.right, buttons, body: document.documentElement.scrollWidth - window.innerWidth };
      });
      const id = `${width} счётчики ${members}/${invites}/${former}: ${JSON.stringify(facts.buttons.map((b) => b.text))}`;
      assert.ok(facts.scroll <= 0, `вкладки прокручиваются вбок (${facts.scroll}) — ${id}`);
      assert.ok(facts.body <= 0, `страница шире экрана — ${id}`);
      assert.equal(new Set(facts.buttons.map((b) => b.h)).size, 1, `вкладки в одну строку — ${id}`);
      for (const b of facts.buttons) assert.ok(b.right <= facts.boxRight + 0.5 && !b.clipped, `вкладка обрезана ${b.text} — ${id}`);
      if (width < 768) {
        assert.deepEqual(facts.buttons.map((b) => b.text.replace(/\s*\d+$/, "")), ["Сотрудники", "Приглашения", "Бывшие"], id);
        assert.deepEqual(facts.buttons.map((b) => b.text.match(/\d+$/)?.[0]), [String(members), String(invites), String(former)], `счётчики целиком — ${id}`);
      } else {
        assert.deepEqual(facts.buttons.map((b) => b.text), [`Сотрудники (${members})`, `Приглашения ${invites}`, `Бывшие сотрудники (${former})`], id);
      }
      if (members === 120 && (width === 375 || width === 1280)) await run.page.screenshot({ path: path.join(shots, `staff-${width}.png`) });
      await run.page.close();
    }
  }
});
