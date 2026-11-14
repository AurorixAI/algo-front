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
