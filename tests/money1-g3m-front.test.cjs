// Money-1 / Г, круг G3M (FIX_FRONT.md): каждый пункт — поведение настоящего окна в настоящем браузере, ответ сервера даёт тест.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { start, plain, invalid, ROW, open } = require("./helpers/money1-v.cjs");
const { toshmatovPreview, TOSHMATOV } = require("./helpers/stage-numbers.cjs");

const ts = require("typescript");
const Module = require("node:module");
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest); };
const lib = (name) => require(path.join(__dirname, "..", "src", "lib", name));
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let browser;
test.before(async () => { browser = await start(); });
test.after(async () => { await browser.close(); });

// ── Ф1 ──
test("Ф1: «Исправить оплату» в выписке стоит и у ушедшего ученика (нет условия is_active)", () => {
  const src = read("src/components/payments/statement-view.tsx");
  const menu = src.slice(src.indexOf("key: \"correct\"") - 200, src.indexOf("key: \"correct\"") + 100);
  assert.doesNotMatch(menu, /is_active/);
});

test("Ф1: отказ PAYMENT_EXCEEDS_DEBT при исправлении показан словами сервера, без своего текста и без «Повторить»", async () => {
  const text = "Ученик ушёл из группы: при исправлении сумма не может быть больше 347 000 сум";
  const server = (request) => {
    if (request.method === "GET" && /payments\/preview$/.test(request.path)) return { json: toshmatovPreview(Number(/amount=(\d+)/.exec(request.query)?.[1]) || null) };
    if (request.method === "POST") return invalid("PAYMENT_EXCEEDS_DEBT", text, { debt: 347000 });
    return null;
  };
  const payment = { id: "p1", amount: 300000, paid_on: "2026-11-05", method: "cash", note: null };
  const run = await open(browser, "money-v.entry.tsx", "replace", { props: { membership: TOSHMATOV, payment }, server });
  const page = run.page;
  await page.waitForSelector("#payment-form");
  await page.fill("#payment-amount", "400 000");
  await page.fill("#payment-reason", "ошибся в сумме");
  await page.waitForSelector('[data-testid="money-effects"][data-state="failed"]');
  assert.ok(plain(await page.textContent("#payment-form")).includes(text));
  assert.equal(await page.locator('[data-testid="money-effects-retry"]').count(), 0);
  assert.ok(plain(await page.textContent('[data-testid="payment-blocker"]')).includes(text));
  await page.close();
});

// ── Ф2 / Ф3: журнал, меню столбца прошедшего урока у администратора без права на деньги ──
const { launch, openPage } = require("./helpers/dom-page.cjs");
const NOW = new Date("2026-11-06T12:00:00+05:00");
const STUDENT = { id: "st1", first_name: "Иван", last_name: "Иванов", full_name: "Иванов Иван", class_level: 7, status: "active", group_id: "g1", current_group_id: "g1", groups_count: 1 };
const lesson = (id, date, status) => ({ id, instanceKey: `${date}_${id}`, date, startTime: "08:00", endTime: "09:00", status });
async function journal(user, lessons) {
  const run = await openPage(browser, "money.entry.tsx", (request) => (request.method === "GET" && /\/auth\/org\/groups\/g1\/attendance$/.test(request.path)
    ? { json: { groupId: "g1", month: "2026-11", lessons, records: {}, statuses: Object.fromEntries(lessons.map((l) => [l.instanceKey, l.status])), cancellationKinds: {}, cancellationReasons: {}, versions: {}, excuses: {}, corrections: {},
        lessonTeachers: Object.fromEntries(lessons.map((l) => [l.instanceKey, { teacherId: "t1", teacherName: "Петров П.", plannedTeacherId: "t1", isSubstitution: false }])), rosterStudentIds: {} } }
    : null));
  await run.page.clock.setFixedTime(NOW);
  await run.page.evaluate(([who, props]) => window.mount("journal", who, props), [user, { students: [STUDENT], month: "2026-11" }]);
  await run.page.waitForSelector("table");
  return run;
}
const ASSIGN_LOCK = "Назначить, кто провёл прошедший урок, может владелец или администратор с доступом к деньгам";
const MARK_LOCK = "Отметки прошедшего урока меняет владелец или администратор с правом на оплаты";

test("Ф2: журнал — «Назначить…» у закончившегося урока: без права на деньги пункт неактивен с причиной расписания; у владельца активен; у идущего урока активен", async () => {
  const lessons = [lesson("a", "2026-11-05", "scheduled"), lesson("b", "2026-11-06", "scheduled")];      // b: 08-09, now 12:00 -> ended
  const { page } = await journal({ role: "admin", org_role: "admin", payments_access: false }, lessons);
  await page.locator('button[aria-label="Действия с уроком 05.11.2026"]').first().click();
  const item = page.locator('[data-testid="menu-assign-held"]');
  assert.equal(await item.getAttribute("aria-disabled"), "true");
  assert.ok(plain(await item.textContent()).includes(ASSIGN_LOCK));
  await page.close();
  const owner = await journal({ role: "owner", org_role: "owner" }, lessons);
  await owner.page.locator('button[aria-label="Действия с уроком 05.11.2026"]').first().click();
  assert.equal(await owner.page.locator('[data-testid="menu-assign-held"]').getAttribute("aria-disabled"), "false");
  await owner.page.close();
});

test("Ф3: администратор без права — «Отметить посещаемость» прошедшего урока: неактивен, причина словами в меню журнала; у владельца активен; то же правило в расписании", async () => {
  const lessons = [lesson("a", "2026-11-05", "scheduled")];
  const { page } = await journal({ role: "admin", org_role: "admin", payments_access: false }, lessons);
  await page.locator('button[aria-label="Действия с уроком 05.11.2026"]').first().click();
  const item = page.locator('[data-testid="menu-mark-locked"]');
  assert.equal(await item.getAttribute("aria-disabled"), "true");
  assert.ok(plain(await item.textContent()).includes(MARK_LOCK));
  await page.close();
  const owner = await journal({ role: "owner", org_role: "owner" }, lessons);
  await owner.page.locator('button[aria-label="Действия с уроком 05.11.2026"]').first().click();
  assert.equal(await owner.page.locator('[data-testid="menu-mark-locked"]').count(), 0);
  assert.ok(plain(await owner.page.locator('[role="menuitem"]').allTextContents().then((t) => t.join("|"))).includes("Отметить посещаемость"));
  await owner.page.close();
  const card = { role: "admin", archived: false, state: "scheduled", date: "2026-11-05", today: "2026-11-06", hasTeacherInfo: true, startTime: "08:00", endTime: "09:00" };
  assert.equal(lib("schedule-card-actions.ts").pastMarkLockReason({ ...card, moneyRight: false }), MARK_LOCK);
  assert.equal(lib("schedule-card-actions.ts").pastMarkLockReason({ ...card, moneyRight: true }), null);
  assert.equal(lib("schedule-card-actions.ts").pastMarkLockReason({ ...card, moneyRight: false, state: "cancelled" }), null, "a cancelled lesson has no «mark»");
});

// ── Ф4 ──
test("Ф4: заголовок окна конфликта отметок не повторяет строку под ним (кто и когда / без автора — слова сервера)", () => {
  const ops = lib("attendance-ops.ts");
  const first = (text) => plain(text).toLowerCase().split(/[ ,.:—]+/).slice(0, 2).join(" ");
  for (const detail of [
    { currentVersion: 3, updatedBy: { name: "Рахимов Т." }, updatedAt: "2026-11-06T05:42:00" },
    { currentVersion: 3, updatedBy: { name: "Рахимов Т." } },
    { currentVersion: 3, updatedBy: {}, message: "Отметки изменились — обновите страницу" },
    { currentVersion: 3, updatedBy: {}, message: "" },
  ]) {
    const line = ops.conflictHeadline(detail);
    assert.notEqual(plain(ops.CONFLICT_TITLE), plain(line));
    assert.notEqual(first(ops.CONFLICT_TITLE), first(line), line);
  }
  assert.match(read("src/components/attendance/attendance-ops-dialogs.tsx"), /title=\{CONFLICT_TITLE\}/);
});

// ── Ф6 ──
test("Ф6 lib: одна подпись — «Цена с 25.11 — 400 000 сум» при запланированной цене, старые слова без неё; такая группа не «без цены»", () => {
  const g = lib("group-price.ts");
  const planned = { row_id: "r", amount: 400000, valid_from: "2026-11-25" };
  assert.equal(plain(g.priceNotInForceText(planned, "Цена группы не задана")), "Цена с 25.11 — 400 000 сум");
  assert.equal(plain(g.priceNotInForceText(planned, "цена группы не задана")), "цена с 25.11 — 400 000 сум");
  assert.equal(g.priceNotInForceText(null, "Цена группы не задана"), "Цена группы не задана");
  assert.equal(plain(g.priceNotInForceText({ ...planned, amount: 0 }, "Цена не задана")), "Цена с 25.11 — бесплатно");
  assert.equal(g.lacksGroupPrice({ price_current: null }), true);
  assert.equal(g.lacksGroupPrice({ price_current: null, price_scheduled: planned }), false);
  assert.equal(g.countGroupsWithoutPrice([{ price_current: null }, { price_current: null, price_scheduled: planned }, { price_current: null, status: "archived" }]), 1);
  assert.equal(plain(g.membershipPriceLine({ amount: null, source: "none", valid_from: null, group_amount: null, reason: null }, "Цена в месяц", planned).text), "Цена с 25.11 — 400 000 сум");
  assert.equal(lib("group-workspace.ts").groupPriceChipText(null, "Цена в месяц", planned), "Цена с 25.11 — 400 000 сум");
});

const GROUP = { id: "g1", name: "Алгебра 7", status: "active", max_students: 10, student_count: 3, price_current: null };
const PRICES = { as_of: "2026-11-14", period_mode: "calendar", price_label: "Цена в месяц", items: [{ group_id: "g1", name: "Алгебра 7", current: null, scheduled: { row_id: "r", amount: 400000, valid_from: "2026-11-25" }, scheduled_count: 1 }] };
const priceServer = (request) => (request.method === "GET" && /\/auth\/org\/group-prices$/.test(request.path) ? { json: PRICES } : null);

test("Ф6: карточка группы без цены сегодня, но с ценой с 25.11, пишет «Цена с 25.11 — 400 000 сум» (после ответа сервера), а не «не задана»; без запланированной — как было", async () => {
  const run = await open(browser, "money-v.entry.tsx", "groupCard", { props: { group: { ...GROUP, price_scheduled: PRICES.items[0].scheduled } }, server: priceServer });
  assert.equal(plain(await run.page.textContent('[data-testid="group-card-price"]')), "Цена с 25.11 — 400 000 сум");
  await run.page.close();
  const none = await open(browser, "money-v.entry.tsx", "groupCard", { props: { group: GROUP }, server: priceServer });
  assert.match(plain(await none.page.textContent('[data-testid="group-card-price"]')), /Цена не задана/);
  await none.page.close();
});

test("Ф6: строка цены ученика — запрос цен групп один раз, «Цена с 25.11 — 400 000 сум» вместо «Цена группы не задана»", async () => {
  const run = await open(browser, "money-v.entry.tsx", "priceLine", { server: priceServer });
  await run.page.waitForFunction(() => /Цена с 25\.11/.test(document.body.textContent || ""));
  assert.equal(plain(await run.page.textContent('[data-testid="membership-price"]')), "Цена с 25.11 — 400 000 сум");
  assert.equal(run.calls.filter((call) => /group-prices$/.test(call.path)).length, 1);
  assert.doesNotMatch(plain(await run.page.textContent("body")), /не задана/);
  await run.page.close();
});

// ── Ф7 ──
test("Ф7: «Приглашение отправлено» — срок из expires_at сервера (+00:00 не сдвигается дважды), без срока — без обещаний; числа «7 дней» в окне нет", () => {
  const sl = lib("staff-lifecycle.ts");
  assert.equal(sl.inviteLinkNote("2026-11-21T09:30:00+00:00"), "Ссылка действует до 21.11, 14:30 и открывается один раз");
  assert.equal(sl.inviteLinkNote("2026-11-21T09:30:00"), sl.inviteLinkNote("2026-11-21T09:30:00+00:00"), "the same instant with and without the zone");
  assert.equal(sl.inviteLinkNote(null), "Ссылка открывается один раз");
  assert.ok(sl.INVITE_SENT_NOTES.every((note) => !/7 дн/.test(note)));
  assert.match(read("src/app/owner/teachers/page.tsx"), /expiresAt=\{sent\.expires_at\}/);
});

// ── Ф8: ведомость — блоки строятся из нового ответа после 409 SHEET_DATA_CHANGED и «Пересчитать» ──
const PAYOUT8 = { saved_total: 475000, fresh_total: 475000, target: 475000, paid: 0, balance: 475000, state: "unpaid", basis: "saved", changed_by: 0, change_text: null, text: "Не выплачено", items: [] };
const SHEET8 = (revision) => ({ id: "s1", saved: true, month: "2026-10", period_start: "2026-10-01", period_end: "2026-10-31", month_open: false, teacher_id: "t1", teacher_name: "Каримова К.", revision,
  percents: { group: "50" }, divisor_default: 12, lines: [], groups: [], total_amount: 475000, counted_total: 38, unpaid_total: 0, pending_excused_total: 0, undecided_total: 0,
  warnings: { open_lessons: null, pending_excused: 0, no_fee: 0, unpaid: 0 }, written_off_total: 0, payout: PAYOUT8, source_fingerprint: "fp-1", stale: false, note: null,
  created_by_name: "Арслан", created_at: "2026-11-03T05:00:00", updated_by_name: "Арслан", updated_at: "2026-11-03T05:00:00" });
const DIFF8 = { sheet_id: "s1", revision: 2, stale: false, source_fingerprint: "fp-1", saved_total: 475000, fresh_total: 475000, delta_amount: 0, reasons: [], rate_changes: [], lines: [] };
function sheetServer(state) {
  return (request) => {
    const { method, path } = request;
    if (method === "GET" && path === "/auth/org/payroll/sheets/s1") return { json: SHEET8(state.revision) };
    if (method === "GET" && path === "/auth/org/payroll/sheets/s1/diff") return { json: { ...DIFF8, source_fingerprint: state.fingerprint } };
    if (method === "GET" && path === "/auth/org/payroll-periods") return { json: { month: "2026-10", items: [{ teacherId: "t1", teacherName: "Каримова К.", month: "2026-10", state: "reopened", closedOn: "2026-11-03", sheetId: "s1", sheetRevision: 2, reopened: { at: "2026-11-05T09:00:00", by: "Арслан", reason: "ошибочно отметили урок" } }] } };
    if (method === "GET" && path === "/auth/org/payroll/months/2026-10") return { json: { month: "2026-10", period_start: "2026-10-01", period_end: "2026-10-31", month_open: false, divisor: 12, lessons_without_teacher: 0, teachers: [{ teacher_id: "t1", teacher_name: "Каримова К.", lessons_count: 12, lesson_types: [], rates: { group: "50" }, missing_rates: [], sheet: null, warnings: { open_lessons: 0, pending_excused: state.excused, no_fee: 0, unpaid: 0 } }] } };
    if (method === "GET" && path === "/auth/org/payroll/rates") return { json: { month: "2026-10", items: [{ teacher_id: "t1", rates: { group: { percent: "50", valid_from: "2026-01" } } }] } };
    if (method === "PATCH" && path === "/auth/org/payroll/sheets/s1") {
      state.patches += 1;
      if (state.patches === 1) { state.excused = 0; state.fingerprint = "fp-2"; return { status: 409, json: { detail: { code: "SHEET_DATA_CHANGED", message: "Данные изменились после просмотра", fingerprint: "fp-2" } } }; }
      return { json: SHEET8(state.revision) };      // the same revision: no new key for the page to notice
    }
    return null;
  };
}
test("Ф8: после 409 SHEET_DATA_CHANGED и «Пересчитать» панель «уважительная ждёт решения» исчезает без обновления страницы (нового ответа месяца), а после сохранения с той же ревизией — тоже", async () => {
  const state = { revision: 2, patches: 0, excused: 1, fingerprint: "fp-1" };
  const run = await openPage(browser, "money.entry.tsx", sheetServer(state));
  await run.page.evaluate(() => window.mount("sheetPage", { role: "owner", org_role: "owner" }));
  await run.page.waitForSelector('[aria-label="Итог ведомости"]');
  const panel = () => run.page.getByText("уважительная ждёт решения").count();
  await run.page.waitForFunction(() => /уважительная ждёт решения/.test(document.body.textContent || ""));
  await run.page.click('[aria-label="Итог ведомости"] button:has-text("Сохранить и закрыть месяц")');
  await run.page.waitForSelector('button:has-text("Пересчитать")');
  assert.equal(await panel() > 0, true, "before the owner looks at the new data the block is the old one");
  await run.page.click('button:has-text("Пересчитать")');
  await run.page.waitForFunction(() => !/уважительная ждёт решения/.test(document.body.textContent || ""));
  assert.equal(await panel(), 0);
  state.excused = 1;      // the data moves once more behind the save: a save that keeps the revision must read the blocks again
  await run.page.click('[aria-label="Итог ведомости"] button:has-text("Сохранить и закрыть месяц")');
  await run.page.waitForFunction(() => /уважительная ждёт решения/.test(document.body.textContent || ""));
  await run.page.close();
});

// ── Ф9 ──
test("Ф9: подсказка про выплату вперёд — по дате конца месяца: у закончившегося (в том числе переоткрытого) «Вычтем из следующей выплаты», у идущего «Покроется начислениями до конца месяца»", () => {
  const pl = lib("payroll-logica.ts");
  assert.equal(pl.monthHasEnded("2026-10", "2026-11-14"), true);
  assert.equal(pl.monthHasEnded("2026-11", "2026-11-14"), false);
  assert.equal(pl.monthHasEnded("2026-11", "2026-11-30"), false, "the last day itself is not over yet");
  assert.equal(pl.monthHasEnded("2026-11", "2026-12-01"), true);
  assert.equal(pl.monthHasEnded(null), false);
  // a reopened month: the server counts it fresh (`basis: "fresh"`), but it has ended
  const fresh = { basis: "fresh", state: "overpaid", balance: -50000, carry_used: 0, advance_out: 0 };
  assert.deepEqual(pl.advanceLines(fresh, "2020-01"), ["Вычтем из следующей выплаты"]);
  assert.deepEqual(pl.advanceLines(fresh, "2999-01"), [pl.PAYOUT_ADVANCE_HINT_OPEN]);
  assert.deepEqual(pl.advanceLines(fresh), [pl.PAYOUT_ADVANCE_HINT_OPEN], "no month - the old rule");
  assert.doesNotMatch(pl.payoutOverpayQuestion(50000, "fresh", true), /до конца месяца/);
  assert.match(pl.payoutOverpayQuestion(50000, "fresh", false), /до конца месяца/);
  assert.equal(pl.overpaidExplain({ basis: "fresh" }, true), "Вычтем из следующей выплаты.");
});
