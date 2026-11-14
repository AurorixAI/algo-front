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
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(require("node:os").tmpdir(), "algo-css-")), "tw.css");
  require("node:child_process").execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;      // the project's tailwind: the shots and the layout facts of the tests are the real ones
  browser = await start();
});
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
  await page.waitForFunction((t) => document.querySelector('[data-testid="payment-blocker"]')?.textContent?.replace(/[\s\u00a0\u202f]+/g, ' ').includes(t), text);
  assert.ok(plain(await page.textContent("body")).includes(text));
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
const MARK_LOCK = "Отмечать посещаемость прошедших уроков может владелец или администратор с доступом к деньгам";

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
  assert.equal(lib("group-workspace.ts").groupPriceChipText(null, "Цена в месяц", planned), null, "К2 круг 3: a planned price is no chip of the header");
  assert.equal(lib("group-workspace.ts").groupPriceChipText(null, "Цена в месяц", null), "Цена группы не задана");
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

// ── Ф10: окно решения по заявке на телефоне ──
for (const [width, columns] of [[375, 1], [1280, 2]]) {
  test(`Ф10: ${width}: варианты решения стоят в ${columns} колонк${columns === 1 ? "у, каждый строкой во всю ширину" : "и, как было"}; причина недоступного — одной фразой без повтора заголовка`, async () => {
    const run = await openPage(browser, "money-g.entry.tsx", () => null, { width, height: 900 });
    await run.page.evaluate((who) => window.mount("decision", who, { role: "admin", past: true }), { role: "admin", org_role: "admin", payments_access: false });
    await run.page.waitForSelector('[role="radiogroup"]');
    const facts = await run.page.evaluate(() => {
      const group = document.querySelector('[role="radiogroup"]');
      const cards = [...group.querySelectorAll("label")].map((label) => label.getBoundingClientRect());
      const lefts = new Set(cards.map((rect) => Math.round(rect.left)));
      const lock = [...group.querySelectorAll("label")].find((label) => label.querySelector("input:disabled"));
      return { columns: lefts.size, width: group.getBoundingClientRect().width, first: cards[0].width, lockTitle: lock?.querySelector(".font-semibold")?.textContent ?? "", lockText: lock?.querySelector("span.text-xs")?.textContent ?? "", scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.equal(facts.columns, columns);
    if (columns === 1) assert.ok(facts.first >= facts.width - 1, "a card takes the whole width");
    assert.ok(facts.lockTitle.length > 0, "the locked option is there");
    assert.equal(plain(facts.lockText), "Это решает владелец или администратор с доступом к деньгам");
    assert.ok(!plain(facts.lockText).toLowerCase().includes("назначить"), "the reason does not repeat the title");
    assert.equal(facts.scroll, 0);
    await run.page.close();
  });
}

test("Н5: код SHEET_NOT_SAVED сервер не выдаёт — во фронте обработки нет, неизвестный код — «other»", () => {
  assert.doesNotMatch(read("src/lib/payroll-logica.ts"), /SHEET_NOT_SAVED|not_saved/);
  assert.equal(lib("payroll-logica.ts").payoutError({ code: "SHEET_NOT_SAVED", message: "m" }).kind, "other");
});

test("Н4: форма приглашения не обещает срок строкой (срок — из expires_at после отправки)", () => {
  assert.doesNotMatch(read("src/app/owner/teachers/page.tsx"), /действует \d+ дн/);
  for (const f of ["src/app/admin/diagnostics/page.tsx", "src/lib/diagnostic-invite.ts"]) assert.doesNotMatch(read(f), /(действует|действителен)\s+\d+\s+(дн|час)/);
});

test("Н1: отказ сервера при исправлении — один раз (над кнопкой), блок «Что изменится» с прежними числами скрыт", async () => {
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
  await page.waitForFunction((t) => document.querySelector('[data-testid="payment-blocker"]')?.textContent?.replace(/[\s\u00a0\u202f]+/g, ' ').includes(t), text);
  const body = plain(await page.locator("body").innerText());
  assert.equal(body.split(text).length - 1, 1, "текст отказа на экране один раз");
  assert.equal(await page.locator("#payment-calc").count(), 0, "блок «Что изменится» скрыт");
  assert.doesNotMatch(body, /Погасит долг|Останется долг/);
  await page.close();
});

test("Н2: меню столбца — подпись «Урока не было» по праву на деньги; причины неактивных пунктов без точки в конце (журнал и расписание)", async () => {
  const lessons = [lesson("a", "2026-11-05", "scheduled")];
  const hints = async (user) => {
    const { page } = await journal(user, lessons);
    await page.locator('button[aria-label="Действия с уроком 05.11.2026"]').first().click();
    const text = plain(await page.locator('[role="menu"]').first().innerText());
    const lock = plain(await page.locator('[data-testid="menu-mark-locked"]').count() ? await page.locator('[data-testid="menu-mark-locked"]').textContent() : "");
    await page.close();
    return { text, lock };
  };
  const admin = await hints({ role: "admin", org_role: "admin", payments_access: false });
  assert.ok(admin.text.includes("Урок не войдёт в зарплату. Что будет с оплатой учеников — покажем в окне"), admin.text);
  assert.doesNotMatch(admin.text, /по вашему выбору/);
  assert.ok(admin.lock.endsWith("деньгам"), admin.lock);
  const owner = await hints({ role: "owner", org_role: "owner" });
  assert.ok(owner.text.includes("перерасчёт ученикам — по вашему выбору."), owner.text);
  const { PAST_MARK_NO_RIGHT_TEXT, PAST_ASSIGN_NO_RIGHT_TEXT } = lib("schedule-card-actions.ts");
  for (const text of [PAST_MARK_NO_RIGHT_TEXT, PAST_ASSIGN_NO_RIGHT_TEXT]) assert.doesNotMatch(text, /[.!]$/);
});

test("Н3: окно конфликта отметок — «Отметки изменены: Имя, время», без «(а)»", () => {
  const { conflictHeadline } = lib("attendance-ops.ts");
  assert.equal(conflictHeadline({ currentVersion: 3, updatedBy: { name: "Рахимов Т." }, updatedAt: "2026-11-14T05:42:00", message: "" }), "Отметки изменены: Рахимов Т., 10:42");
  assert.equal(conflictHeadline({ currentVersion: 3, updatedBy: { name: "Петров П." }, message: "" }), "Отметки изменены: Петров П.");
  assert.doesNotMatch(read("src/lib/attendance-ops.ts"), /изменил\(а\)/);
});

// ── Круг 3, К1: «Исправить оплату» ушедшего — потолок сказан один раз (слова сервера), числа «Что изменится» — ответ сервера ──
const CEILING_TEXT = "Ученик ушёл из группы: сумму можно исправить не больше 500 000 сум";
const k1Server = (request) => {
  if (request.method === "GET" && /payments\/preview$/.test(request.path)) {
    const amount = Number(/amount=(\d+)/.exec(request.query)?.[1]) || null;
    const base = toshmatovPreview(amount);
    return { json: { ...base, suggested_amount: 500000, warnings: [{ code: "left_debt_only", message: CEILING_TEXT }], ...(amount ? { result: { ...base.result, debt_after: 19000, past_debt_after: 19000, paid_until_after: "2026-11-12", summary_text: "Останется долг 19 000 сум" } } : {}) } };
  }
  if (request.method === "POST") {
    const dry = /dry_run=true/.test(request.query);
    const amount = request.body?.amount;
    if (dry && amount > 500000) return invalid("PAYMENT_EXCEEDS_DEBT", "Ученик ушёл из группы: при исправлении сумма не может быть больше 500 000 сум", { debt: 500000 });
    return { status: 201, json: { payment: { id: "p1", amount, paid_on: "2026-11-05", method: "cash", note: null }, row: ROW, warnings: [], allocation: null, dry_run: dry, new_debts: [], money_effects: { students: [], payroll: [], text: "", dryRun: true } } };
  }
  return null;
};
const times = (text, part) => text.split(part).length - 1;

for (const width of [1280, 375]) {
  test(`К1 ${width}: «Исправить оплату» ушедшего — потолок один раз, словами сервера, вне «Что изменится»; числа блока — сервера`, async () => {
    const payment = { id: "p1", amount: 500000, paid_on: "2026-11-05", method: "cash", note: null };
    const run = await open(browser, "money-v.entry.tsx", "replace", { width, props: { membership: TOSHMATOV, payment }, server: k1Server });
    const page = run.page;
    await page.waitForSelector("#payment-form");
    await page.fill("#payment-amount", "100 000");
    await page.waitForFunction(() => /19[\s\u00a0\u202f]000/.test(document.querySelector('[data-testid="payment-calc"]')?.textContent ?? ""));
    const dialog = plain(await page.textContent('[role="dialog"]'));
    assert.equal(times(dialog, "не больше 500 000"), 1, dialog);
    assert.ok(!dialog.includes("можно оплатить только долг"));
    assert.ok(!plain(await page.textContent('[data-testid="payment-calc"]')).includes("не больше 500 000"));
    assert.equal(plain(await page.textContent('[data-testid="left-debt-only"]')), CEILING_TEXT);
        // above the ceiling: the reason of the off button stands over the button, once; the calm hint gives way to it
    await page.fill("#payment-amount", "600 000");
    await page.fill("#payment-reason", "ошибся в сумме");
    await page.waitForFunction(() => /не может быть больше/.test(document.querySelector('[data-testid="payment-blocker"]')?.textContent ?? ""));
    const over = plain(await page.textContent('[role="dialog"]'));
    assert.equal(times(over, "не больше 500 000"), 0, over);
    assert.equal(times(over, "не может быть больше 500 000"), 1, over);
    await page.screenshot({ path: path.join(root, "..", "artifacts", "analysis", "money_g_front", "fix3", `k1-replace-over-${width}.png`) });
    await page.fill("#payment-amount", "100 000");
    await page.waitForFunction(() => /19[\s\u00a0\u202f]000/.test(document.querySelector('[data-testid="payment-calc"]')?.textContent ?? ""));
    await page.waitForTimeout(400);
    require("node:fs").mkdirSync(path.join(root, "..", "artifacts", "analysis", "money_g_front", "fix3"), { recursive: true });
    await page.screenshot({ path: path.join(root, "..", "artifacts", "analysis", "money_g_front", "fix3", `k1-replace-${width}.png`) });
    await page.close();
  });
}

// ── Круг 3, К2: ученик группы с запланированной ценой — «Цена с 01.12 — 420 000 сум», «Не задана» только когда цены нет вовсе ──
test("К2: строка вкладки «Оплаты» — запланированная цена группы или своя той же функцией, красное «Не задана» только без цены", () => {
  const G = lib("group-payments.ts");
  const gp = lib("group-price.ts");
  const row = (id, price) => ({ membership_id: id, student_id: `s${id}`, student_name: `Ученик ${id}`, group_id: "g1", group_name: "Г", is_primary: true, is_active: true, status: "active", debt: 0, price });
  const none = { amount: null, source: "none", valid_from: null, group_amount: null, reason: null };
  const groupPlanned = { row_id: "r", amount: 420000, valid_from: "2026-12-01" };
  const views = (rows, extra = {}) => G.paymentRowViews(rows, { periodMode: "calendar", today: "2026-11-15", ...extra });
  const [a] = views([row("1", none)], { groupScheduled: groupPlanned });
  assert.equal(plain(a.priceText), "Цена с 01.12 — 420 000 сум");
  assert.equal(a.priceScheduled, true);
  const [b] = views([row("2", none)]);
  assert.equal(b.priceText, "Не задана");
  assert.equal(b.priceScheduled, false);
  const [c] = views([row("3", { ...none, scheduled: { row_id: "o", amount: 300000, valid_from: "2026-12-05", reason: "x" } })], { groupScheduled: groupPlanned });
  assert.equal(plain(c.priceText), "Цена с 05.12 — 300 000 сум", "the own planned price first");
  assert.equal(c.scheduledText, null, "and not twice");
  const [d] = views([row("4", { amount: 500000, source: "group", valid_from: "2026-01-01", group_amount: 500000, reason: null })], { groupScheduled: groupPlanned });
  assert.equal(plain(d.priceText), "500 000 сум");
  assert.equal(plain(gp.priceNotInForceText(groupPlanned, "Не задана")), plain(a.priceText), "the one function");
});

// ── Круг 3, К3: карточка урока в расписании — «Назначить того, кто провёл» у закончившегося урока без права на деньги: пункт есть, неактивен, причина та же ──
test("К3: карточка урока в расписании — пункт неактивен с причиной журнала (одна функция), у владельца активен; у идущего урока открыт", async () => {
  const SCA = lib("schedule-card-actions.ts");
  const card = { role: "admin", archived: false, state: "scheduled", date: "2026-11-05", today: "2026-11-06", hasTeacherInfo: true, startTime: "08:00", endTime: "09:00" };
  const open = async (raw, label = "Назначить того, кто провёл") => {
    const input = { now: new Date("2026-11-06T10:00:00+05:00"), ...raw };
    const actions = SCA.scheduleCardActions(input);
    const run = await openPage(browser, "money.entry.tsx", () => null);
    await run.page.evaluate((p) => window.mount("sheet", undefined, p), { actions, assignLabel: label, assignLock: SCA.assignLockReason(input) });
    await run.page.waitForSelector('[role="dialog"]');
    return run;
  };
  const admin = await open({ ...card, moneyRight: false });
  const locked = admin.page.locator('[data-testid="sheet-assign-locked"]');
  assert.equal(await locked.count(), 1, "the item is on the card");
  assert.equal(await locked.getAttribute("aria-disabled"), "true");
  assert.ok(plain(await locked.textContent()).includes(ASSIGN_LOCK));
  assert.equal(SCA.assignLockReason({ ...card, moneyRight: false }), SCA.pastSubstituteLockReason({ date: card.date, today: card.today, endTime: card.endTime, moneyRight: false }), "the one function");
  await admin.page.close();
  const rich = await open({ ...card, moneyRight: true });
  assert.equal(await rich.page.locator('[data-testid="sheet-assign-locked"]').count(), 0);
  assert.ok(plain(await rich.page.locator('[role="group"][aria-label="Действия с уроком"]').textContent()).includes("Назначить того, кто провёл"));
  await rich.page.close();
  const shotRun = await open({ ...card, moneyRight: false });
  await shotRun.page.setViewportSize({ width: 375, height: 700 });
  await shotRun.page.waitForTimeout(400);
  require("node:fs").mkdirSync(path.join(root, "..", "artifacts", "analysis", "money_g_front", "fix3"), { recursive: true });
  await shotRun.page.screenshot({ path: path.join(root, "..", "artifacts", "analysis", "money_g_front", "fix3", "k3-card-375.png") });
  await shotRun.page.setViewportSize({ width: 1280, height: 700 });
  await shotRun.page.screenshot({ path: path.join(root, "..", "artifacts", "analysis", "money_g_front", "fix3", "k3-card-1280.png") });
  await shotRun.page.close();
  const going = await open({ ...card, date: "2026-11-06", endTime: "23:00", startTime: "08:00", moneyRight: false });      // today 08:00-23:00: not ended
  assert.equal(await going.page.locator('[data-testid="sheet-assign-locked"]').count(), 0);
  await going.page.close();
  assert.match(read("src/components/groups/group-schedule-overview.tsx"), /assignLock=\{assignLock\}/);
  assert.match(read("src/components/groups/group-schedule-overview.tsx"), /assignLockReason\(cardInput\)/);
});

// ── Круг 3, К4: «Сотрудники» владельца на 375 — в строке главная кнопка и «⋯», вкладки в одну строку, ничего не обрезано ──
test("К4: «Сотрудники» — на телефоне в строке преподавателя главная кнопка и «⋯» (остальное в меню), вкладки в одну строку; на 1280 всё как было", async () => {
  const fs2 = require("node:fs"), os = require("node:os"), { execFileSync } = require("node:child_process");
  const css = path.join(fs2.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  const member = (id, first, last, role) => ({ id, member_id: `m-${id}`, user_id: id, first_name: first, last_name: last, email: `${id}@example.test`, org_role: role, is_active: true });
  const rate = (id, first, last) => ({ teacher_id: id, teacher_name: `${first} ${last}`, lesson_types: ["group", "individual"], rates: { group: { percent: "50", valid_from: "2026-01" }, individual: { percent: "60", valid_from: "2026-01" } } });
  const server = (request) => {
    if (request.path === "/auth/org/members") return { json: /status=removed/.test(request.query) ? [] : [member("o1", "Рустам", "Валиев", "owner"), member("a1", "Сабина", "Назарова", "admin"), member("t1", "Лола", "Мирзаева", "teacher"), member("t2", "Камол", "Эргашев", "teacher")] };
    if (request.path === "/auth/org/invitations") return { json: [] };
    if (request.path === "/auth/org/payroll/rates") return { json: { items: [rate("t1", "Лола", "Мирзаева"), rate("t2", "Камол", "Эргашев")] } };
    return null;
  };
  const shots = path.join(root, "..", "artifacts", "analysis", "money_g_front", "fix3");
  fs2.mkdirSync(shots, { recursive: true });
  for (const width of [375, 1280]) {
    const run = await openPage(browser, "staff.entry.tsx", server, { width, height: 900 });
    await run.page.evaluate(() => window.mountStaff());
    await run.page.waitForSelector('button[aria-label^="Изменить ставку"]');
    await run.page.waitForTimeout(700);
    const facts = await run.page.evaluate(() => {
      const tabs = document.querySelector('[data-testid="staff-tabs"]');
      const rows = [...document.querySelectorAll('[data-testid="staff-row-actions"]')].filter((row) => row.children.length > 0);
      const rowInfo = rows.map((row) => {
        const card = row.closest(".overflow-hidden").getBoundingClientRect();
        const kids = [...row.querySelectorAll("button")].map((b) => ({ text: (b.textContent || "").trim(), aria: b.getAttribute("aria-label"), right: b.getBoundingClientRect().right, visible: b.offsetParent !== null }));
        return { cardRight: card.right, kids };
      });
      return { tabHeights: [...tabs.querySelectorAll("button")].map((b) => Math.round(b.getBoundingClientRect().height)), tabsScroll: tabs.scrollWidth - tabs.clientWidth, rowInfo, bodyScroll: document.documentElement.scrollWidth - window.innerWidth };
    });
    assert.equal(facts.bodyScroll <= 0, true, JSON.stringify(facts));
    for (const row of facts.rowInfo) for (const kid of row.kids) assert.ok(kid.right <= row.cardRight + 0.5, `cut: ${JSON.stringify(kid)} of ${row.cardRight}`);
    const teacherRows = facts.rowInfo.filter((row) => row.kids.some((k) => /Изменить ставку/.test(k.aria || "")));
    assert.equal(teacherRows.length, 2);
    if (width === 375) {
      assert.ok(new Set(facts.tabHeights).size === 1 && facts.tabHeights[0] < 50, `tabs in one line ${facts.tabHeights}`);
      for (const row of teacherRows) assert.deepEqual(row.kids.map((k) => (k.aria || "").split(":")[0] || "menu"), ["Изменить ставку", "Действия"], JSON.stringify(row.kids));
      await run.page.screenshot({ path: path.join(shots, "k4-staff-375.png"), fullPage: true });
      await run.page.locator('button[aria-label^="Действия:"]').nth(1).click();
      const menu = plain(await run.page.locator('[role="menu"]').innerText());
      assert.ok(menu.includes("Сменить роль") && menu.includes("Удалить сотрудника"), menu);
    } else {
      for (const row of teacherRows) assert.deepEqual(row.kids.map((k) => (k.aria || "").split(":")[0]).slice(0, 2), ["Изменить ставку", "Сменить роль"]);
    }
    if (width === 375) await run.page.screenshot({ path: path.join(shots, "k4-staff-375-menu.png") });
    else await run.page.screenshot({ path: path.join(shots, "k4-staff-1280.png"), fullPage: true });
    await run.page.close();
  }
});

test("К2 (экран): вкладка «Оплаты» группы с запланированной ценой — у учеников «Цена с 01.12 — 420 000 сум», не красным «Не задана»; без цены вовсе — «Не задана»", async () => {
  const fs2 = require("node:fs"), os = require("node:os"), { execFileSync } = require("node:child_process");
  const css = path.join(fs2.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  const none = { amount: null, source: "none", valid_from: null, group_amount: null, reason: null };
  const row = (id, name) => ({ membership_id: `m-${id}`, student_id: `s-${id}`, student_name: name, display_id: `AL1-00${id}`, group_id: "g1", group_name: "Алгебра 7", is_primary: true, is_active: true, price: none, status: "none", period_mode: "calendar", paid_until: null, debt: 0, past_debt: 0, current_due: 0, advance: 0, partial_credit: 0, price_missing: true });
  const items = [row(1, "Алиев Анвар"), row(2, "Бекова Мадина")];
  const server = (request) => (request.path === "/auth/org/payments/status" ? { json: { items: /bucket=debtors/.test(request.query) ? [] : items, total: /bucket=debtors/.test(request.query) ? 0 : items.length, summary: {} } } : null);
  const shots = path.join(root, "..", "artifacts", "analysis", "money_g_front", "fix3");
  fs2.mkdirSync(shots, { recursive: true });
  for (const width of [375, 1280]) {
    for (const scheduled of [{ row_id: "r", amount: 420000, valid_from: "2026-12-01" }, null]) {
      const run = await openPage(browser, "group-tab.entry.tsx", server, { width, height: 800 });
      await run.page.clock.setFixedTime(new Date("2026-11-15T10:00:00+05:00"));
      await run.page.evaluate((s) => window.mountGroupTab({ scheduled: s }), scheduled);
      await run.page.waitForSelector('[data-testid="group-payment-price"]');
      await run.page.waitForTimeout(500);
      const texts = (await run.page.locator('[data-testid="group-payment-price"]').allTextContents()).map(plain);
      const colours = await run.page.locator('[data-testid="group-payment-price"]').evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
      const summary = plain(await run.page.textContent('[data-testid="group-payments-summary"]'));
      if (scheduled) {
        assert.deepEqual(texts, ["Цена с 01.12 — 420 000 сум", "Цена с 01.12 — 420 000 сум"]);
        assert.notEqual(colours[0], "rgb(180, 83, 9)", "not the amber of «не задана»");
        assert.ok(summary.includes("Цена с 01.12 — 420 000 сум"));
      } else {
        assert.deepEqual(texts, ["Не задана", "Не задана"]);
        assert.ok(summary.includes("Цена группы не задана"));
      }
      if (scheduled) await run.page.screenshot({ path: path.join(shots, `k2-paytab-${width}.png`), fullPage: true });
      await run.page.close();
    }
  }
});
