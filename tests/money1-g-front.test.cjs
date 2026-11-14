// Money-1 / Г front (server branch money-g, MONEY1_G_FRONT.md): every item is a behaviour of a real window in a real browser, the server answered by the test.
// Ф-1: the kind of a cancellation is chosen only with the money right; without it the window says the consequence in the words of the server and sends no kind.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
const Module = require("node:module");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");

// the pure functions of src/lib are loaded as TypeScript (the same loader as payf.test.cjs)
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};
const lib = (name) => require(path.join(__dirname, "..", "src", "lib", name));

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => text.replace(/\s+/g, " ").trim();      // \s covers the non-breaking space
const OWNER = { role: "owner", org_role: "owner" };
const ADMIN_NO_RIGHT = { role: "admin", org_role: "admin", payments_access: false };
const ADMIN_WITH_RIGHT = { role: "admin", org_role: "admin", payments_access: true };
const TEACHER = { role: "teacher", org_role: "teacher" };
const SUM_PHRASE = "Ученикам зачтётся по 46 000 сум";

/** `consequence`: the answer of GET …/lessons/cancel-consequence (a string, or a function for a held / failing answer). */
function serverOf({ consequence = SUM_PHRASE, gate = null, status = 200 } = {}) {
  return async (request) => {
    if (request.method === "GET" && /\/groups\/g1\/lessons\/cancel-consequence$/.test(request.path)) {
      if (gate) await gate;
      return status === 200 ? { json: { consequence } } : { status, json: { detail: { code: "SERVER_ERROR", message: "boom" } } };
    }
    if (request.method === "GET" && /lesson-exam-binding$/.test(request.path)) return { json: { state: "none" } };
    if (request.method === "POST" && request.path === "/auth/org/groups/g1/attendance") return { json: { ok: true, cancelled: true, version: 3, warnings: [] } };
    if (request.method === "POST" && request.path === "/auth/org/groups/g1/attendance/reconcile/cancel") {
      if (/dry_run=true/.test(request.query)) {
        if (gate) await gate;
        return { json: { ok: true, cancelled: true, version: 3, warnings: [], dryRun: true, consequence, moneyEffects: { students: [], payroll: [], text: "", dryRun: true } } };
      }
      return { json: { ok: true, cancelled: true, version: 3, warnings: [] } };
    }
    if (request.method === "GET" && /\/substitutions\/r\d\/candidates$/.test(request.path)) return { json: { requesterId: "t1", candidates: [] } };
    if (request.method === "GET" && /\/substitutions\/r\d$/.test(request.path)) return { json: { examBinding: { state: "none" } } };
    if (request.method === "POST" && request.path === "/auth/org/substitutions/r1/decide") return { json: { item: { id: "r1" }, result: {} } };
    if (request.method === "POST" && request.path === "/auth/org/substitutions/decide-bulk") return { json: { updated: 1, skipped: [] } };
    return null;
  };
}
const defer = () => { let release; const gate = new Promise((resolve) => { release = resolve; }); return { gate, release }; };
const consequenceCalls = (calls) => calls.filter((call) => /cancel-consequence$/.test(call.path));

async function openSheet(user, width = 1280, server = serverOf()) {
  const run = await openPage(browser, "money-g.entry.tsx", server, { width, height: 900 });
  await run.page.evaluate((who) => window.mount("sheetCancel", who), user);
  await run.page.waitForSelector('[role="dialog"]');
  return run;
}
const reasonIn = (page) => page.fill("#sheet-reason", "заболел преподаватель");

// ── Ф-1: the menu of a lesson ────────────────────────────────────────────────────────────────────

test("Ф-1 menu: «Замена» and «Перенести» stand before «Отменить урок»", async () => {
  const { page } = await openSheet(ADMIN_NO_RIGHT);
  const labels = (await page.locator('[role="group"][aria-label="Действия с уроком"] button').allTextContents()).map(plain);
  assert.deepEqual(labels.slice(0, 3), ["Назначить замену", "Перенести урок", "Отменить урок"]);
  await page.close();
});

test("Ф-1 menu: an administrator without the money right has no choice of the kind - the sentence of the server stands there, and no kind is sent", async () => {
  const run = await openSheet(ADMIN_NO_RIGHT);
  await run.page.click("text=Отменить урок");
  await run.page.waitForSelector('[data-testid="cancel-consequence"]');
  assert.equal(await run.page.locator('[data-testid="cancellation-kind"]').count(), 0);
  assert.equal(await run.page.textContent('[data-testid="cancel-consequence"]'), SUM_PHRASE, "the phrase as the server wrote it");
  assert.equal(consequenceCalls(run.calls).length, 1);
  assert.match(consequenceCalls(run.calls)[0].query, /lessonDate=2099-11-20/);
  assert.match(consequenceCalls(run.calls)[0].query, /lessonId=l1/);
  await reasonIn(run.page);
  await run.page.click('[data-testid="confirm-cancel"], button:has-text("Отменить урок") >> nth=-1');
  await run.page.waitForFunction(() => window.__log.includes("changed:Урок отменён"));
  const sent = run.calls.find((call) => call.method === "POST" && call.path === "/auth/org/groups/g1/attendance");
  assert.equal("cancellationKind" in sent.body, false, JSON.stringify(sent.body));
  await run.page.close();
});

test("Ф-1 menu: while the sentence loads a skeleton holds its place; «На оплату не влияет» is shown as it is", async () => {
  const held = defer();
  const run = await openSheet(ADMIN_NO_RIGHT, 1280, serverOf({ consequence: "На оплату не влияет", gate: held.gate }));
  await run.page.click("text=Отменить урок");
  await run.page.waitForSelector('[data-testid="cancel-consequence-skeleton"]');
  assert.equal(await run.page.locator('[data-testid="cancel-consequence"]').count(), 0);
  held.release();
  await run.page.waitForSelector('[data-testid="cancel-consequence"]');
  assert.equal(await run.page.locator('[data-testid="cancel-consequence-skeleton"]').count(), 0);
  assert.equal(plain(await run.page.textContent('[data-testid="cancel-consequence"]')), "На оплату не влияет");
  await run.page.close();
});

test("Ф-1 menu: a refusal to load the sentence neither shows an error nor blocks the cancellation", async () => {
  const run = await openSheet(ADMIN_NO_RIGHT, 1280, serverOf({ status: 500 }));
  await run.page.click("text=Отменить урок");
  await run.page.waitForFunction(() => !document.querySelector('[data-testid="cancel-consequence-skeleton"]'));
  assert.equal(await run.page.locator('[data-testid="cancel-consequence"]').count(), 0);
  await reasonIn(run.page);
  await run.page.click('button:has-text("Отменить урок") >> nth=-1');
  await run.page.waitForFunction(() => window.__log.includes("changed:Урок отменён"));
  await run.page.close();
});

for (const [who, user] of [["the owner", OWNER], ["an administrator with the right", ADMIN_WITH_RIGHT]]) {
  test(`Ф-1 menu: ${who} chooses the kind as before - no sentence asked, the kind is sent`, async () => {
    const run = await openSheet(user);
    await run.page.click("text=Отменить урок");
    await run.page.waitForSelector('[data-testid="cancellation-kind"]');
    await run.page.click('[data-testid="cancellation-kind-holiday"]');
    await reasonIn(run.page);
    await run.page.click('button:has-text("Отменить урок") >> nth=-1');
    await run.page.waitForFunction(() => window.__log.includes("changed:Урок отменён"));
    assert.equal(consequenceCalls(run.calls).length, 0);
    assert.equal(run.calls.find((call) => call.method === "POST" && call.path === "/auth/org/groups/g1/attendance").body.cancellationKind, "holiday");
    await run.page.close();
  });
}

// ── Ф-1: «Урока не было» ─────────────────────────────────────────────────────────────────────────

async function openMissed(user, width = 1280, server = serverOf()) {
  const run = await openPage(browser, "money-g.entry.tsx", server, { width, height: 900 });
  await run.page.evaluate((who) => window.mount("cancelMissed", who), user);
  await run.page.waitForSelector('[role="dialog"]');
  return run;
}

test("Ф-1 «Урока не было»: without the right - no kind, the `consequence` of the preview stands in «Что изменится», nothing but the reason is sent", async () => {
  const held = defer();
  const run = await openMissed(ADMIN_NO_RIGHT, 1280, serverOf({ gate: held.gate }));
  await run.page.waitForSelector('[data-testid="cancel-consequence-skeleton"]');
  held.release();
  await run.page.waitForSelector('[data-testid="cancel-effects-students"]');
  assert.equal(await run.page.locator('[data-testid="cancellation-kind"]').count(), 0);
  assert.equal(await run.page.textContent('[data-testid="cancel-effects-students"]'), SUM_PHRASE);
  await run.page.fill("#cancel-missed-reason", "заболел");
  await run.page.click('[data-testid="cancel-missed-submit"]');
  await run.page.waitForFunction(() => window.__log.some((line) => String(line).startsWith("cancelled:")));
  for (const call of run.calls.filter((entry) => entry.path.endsWith("/attendance/reconcile/cancel"))) assert.equal("cancellationKind" in call.body, false, `${call.query} ${JSON.stringify(call.body)}`);
  await run.page.close();
});

test("Ф-1 «Урока не было»: an owner keeps the choice of the kind and his own line of sums", async () => {
  const run = await openMissed(OWNER);
  await run.page.waitForSelector('[data-testid="cancellation-kind"]');
  assert.equal(await run.page.locator('[data-testid="cancel-consequence-skeleton"]').count(), 0);
  await run.page.close();
});

// ── Ф-1: «Замены» ────────────────────────────────────────────────────────────────────────────────

async function openDecision(user, width = 1280, server = serverOf()) {
  const run = await openPage(browser, "money-g.entry.tsx", server, { width, height: 900 });
  await run.page.evaluate((who) => window.mount("decision", who, { role: who.org_role }), user);
  await run.page.waitForSelector('[role="dialog"]');
  await run.page.click('label:has(input[value="cancel"])');
  return run;
}

test("Ф-1 «Замены», one request: without the right no kind, the sentence of the server, no kind in the decision", async () => {
  const run = await openDecision(ADMIN_NO_RIGHT);
  await run.page.waitForSelector('[data-testid="cancel-consequence"]');
  assert.equal(await run.page.locator('[data-testid="cancellation-kind"]').count(), 0);
  assert.equal(await run.page.textContent('[data-testid="cancel-consequence"]'), SUM_PHRASE);
  assert.match(consequenceCalls(run.calls)[0].query, /lessonId=l-r1/);
  await run.page.fill("#substitution-cancel-reason", "заболел преподаватель");
  await run.page.click('button:has-text("Отменить урок") >> nth=-1');
  await run.page.waitForFunction(() => window.__log.includes("decided"));
  const sent = run.calls.find((call) => call.path === "/auth/org/substitutions/r1/decide");
  assert.equal(sent.body.decision, "cancel");
  assert.equal("cancellationKind" in sent.body, false, JSON.stringify(sent.body));
  await run.page.close();
});

test("Ф-1 «Замены», one request: the owner chooses the kind and no sentence is asked", async () => {
  const run = await openDecision(OWNER);
  await run.page.waitForSelector('[data-testid="cancellation-kind"]');
  await run.page.click('[data-testid="cancellation-kind-holiday"]');
  await run.page.fill("#substitution-cancel-reason", "праздник");
  await run.page.click('button:has-text("Отменить урок") >> nth=-1');
  await run.page.waitForFunction(() => window.__log.includes("decided"));
  assert.equal(consequenceCalls(run.calls).length, 0);
  assert.equal(run.calls.find((call) => call.path === "/auth/org/substitutions/r1/decide").body.cancellationKind, "holiday");
  await run.page.close();
});

async function openBulk(user, dates, server = serverOf()) {
  const run = await openPage(browser, "money-g.entry.tsx", server, { width: 1280, height: 900 });
  await run.page.evaluate(([who, days]) => window.mount("bulk", who, { dates: days }), [user, dates]);
  await run.page.waitForSelector('[role="dialog"]');
  return run;
}

test("Ф-1 «Замены», pack: without the right no kind and none sent; the sentence only when one lesson is chosen (several lessons have no single sum)", async () => {
  const one = await openBulk(ADMIN_NO_RIGHT, ["2099-11-20"]);
  await one.page.waitForSelector('[data-testid="cancel-consequence"]');
  assert.equal(await one.page.locator('[data-testid="cancellation-kind"]').count(), 0);
  await one.page.fill("#substitution-bulk-reason", "праздничный день центра");
  await one.page.click('button:has-text("Отменить уроки") >> nth=-1');
  await one.page.waitForFunction(() => window.__log.includes("done"));
  assert.equal("cancellationKind" in one.calls.find((call) => call.path === "/auth/org/substitutions/decide-bulk").body, false);
  await one.page.close();
  const many = await openBulk(ADMIN_NO_RIGHT, ["2099-11-20", "2099-11-27"]);
  await many.page.waitForSelector("#substitution-bulk-reason");
  assert.equal(consequenceCalls(many.calls).length, 0);
  assert.equal(await many.page.locator('[data-testid="cancel-consequence"], [data-testid="cancel-consequence-skeleton"]').count(), 0);
  await many.page.close();
  const owner = await openBulk(OWNER, ["2099-11-20", "2099-11-27"]);
  await owner.page.waitForSelector('[data-testid="cancellation-kind"]');
  await owner.page.close();
});

// ── Ф-1: widths ──────────────────────────────────────────────────────────────────────────────────

for (const width of [1280, 1024, 375]) {
  test(`Ф-1 ${width}: the three windows without the right - nothing leaves its box, the sentence is whole`, async () => {
    for (const open of [() => openSheet(ADMIN_NO_RIGHT, width), () => openMissed(ADMIN_NO_RIGHT, width), () => openDecision(ADMIN_NO_RIGHT, width)]) {
      const { page } = await open();
      if (await page.locator('text=Отменить урок').count() && !(await page.locator("#sheet-reason, #cancel-missed-reason, #substitution-cancel-reason").count())) await page.click("text=Отменить урок");
      await page.waitForSelector('[data-testid="cancel-consequence"], [data-testid="cancel-effects-students"]');
      const sentence = plain(await page.locator('[data-testid="cancel-consequence"], [data-testid="cancel-effects-students"]').first().textContent());
      assert.equal(sentence, "Ученикам зачтётся по 46 000 сум", `${width}: ${sentence}`);
      await page.waitForTimeout(450);
      const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
      assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
      assert.equal(facts.scroll, 0);
      await page.close();
    }
  });
}

// ── Ф-2: cancel and correction of a payment - «Что изменится» from the dry run, the server's words ─────

const NEW_DEBT_TEXT = "В группе «Вторая (пн/ср/пт)» появится долг 300 000 сум; Зарплата за ноябрь у Эргашева К. уменьшится на 45 000 сум";
const DONE_DEBT_TEXT = "В группе «Вторая (пн/ср/пт)» появился долг 300 000 сум";
const PAYMENT_ROW = { membership_id: "m1", student_id: "s1", student_name: "Каримов Фарходжон Рустамович", group_id: "g1", group_name: "Алгебра 7 (вт/пт)", is_primary: true, is_active: true, status: "ok", debt: 0, advance: 0 };
const PAYMENT = { id: "p1", amount: 300000, paid_on: "2026-11-05", method: "cash", status: "active", kind: "payment" };

function paymentServer({ text = NEW_DEBT_TEXT, gate = null, dryStatus = 200, log = [] } = {}) {
  return async (request) => {
    const dry = /dry_run=true/.test(request.query);
    if (request.method === "POST" && /\/org\/payments\/p1\/(void|replace)$/.test(request.path)) {
      log.push(`${request.path.split("/").pop()}${dry ? ":dry" : ""}`);
      if (dry) {
        if (gate) await gate;
        if (dryStatus !== 200) return { status: dryStatus, json: { detail: { code: "SERVER_ERROR", message: "boom" } } };
        return { status: request.path.endsWith("/replace") ? 201 : 200, json: { payment: PAYMENT, row: PAYMENT_ROW, warnings: [], allocation: null, dry_run: true, new_debts: [], money_effects: { students: [], payroll: [], text, dryRun: true } } };
      }
      return { status: request.path.endsWith("/replace") ? 201 : 200, json: { payment: PAYMENT, row: PAYMENT_ROW, warnings: [], allocation: null, dry_run: false, new_debts: [], money_effects: { students: [], payroll: [], text: DONE_DEBT_TEXT, dryRun: false } } };
    }
    if (request.method === "GET" && /\/payments\/preview$/.test(request.path)) return { json: { suggested_amount: 0, due: { total: 0, rows: [] }, left_debt_only: false } };
    return null;
  };
}
async function openVoid(width = 1280, server = paymentServer()) {
  const run = await openPage(browser, "money-g.entry.tsx", server, { width, height: 900 });
  await run.page.evaluate((who) => window.mount("voidPayment", who), OWNER);
  await run.page.waitForSelector('[role="dialog"]');
  return run;
}
const rowsOf = async (page) => (await page.locator('[data-testid="effects-text-row"]').allTextContents()).map((row) => row.replace(/\s+/g, " ").trim());

test("Ф-2 cancel of a payment: «Что изменится» says the debt in the other group in the server's words; the button waits for it; the real request goes after", async () => {
  const held = defer();
  const sent = [];
  const run = await openVoid(1280, paymentServer({ gate: held.gate, log: sent }));
  await run.page.waitForSelector('[data-testid="money-effects-skeleton"]');
  const button = run.page.locator('button:has-text("Отменить оплату")').last();
  assert.equal(await button.isDisabled(), true);
  assert.match(await run.page.textContent('[role="dialog"]'), /Считаем/, "the off button says why");
  held.release();
  await run.page.waitForSelector('[data-testid="effects-text-row"]');
  assert.deepEqual(await rowsOf(run.page), ["В группе «Вторая (пн/ср/пт)» появится долг 300 000 сум", "Зарплата за ноябрь у Эргашева К. уменьшится на 45 000 сум"]);
  assert.equal(plain(await run.page.textContent('[data-testid="money-effects"] p')), "Что изменится");
  const dry = run.calls.find((call) => /dry_run=true/.test(call.query));
  assert.equal(dry.body.reason, "Проверка последствий");
  assert.equal(await button.isDisabled(), false);
  await run.page.fill("#record-void-reason", "ошибочно внесли");
  await button.click();
  await run.page.waitForFunction(() => window.__log.includes("voided"));
  assert.deepEqual(sent, ["void:dry", "void"]);
  const real = run.calls.filter((call) => /payments\/p1\/void$/.test(call.path) && !/dry_run/.test(call.query));
  assert.equal(real.length, 1);
  assert.equal(real[0].body.reason, "ошибочно внесли");
  await run.page.close();
});

test("Ф-2 cancel of a payment: nothing changes elsewhere - no block at all, the button is ready", async () => {
  const run = await openVoid(1280, paymentServer({ text: "" }));
  await run.page.waitForFunction(() => !document.querySelector('[data-testid="money-effects-skeleton"]'));
  assert.equal(await run.page.locator('[data-testid="money-effects"]').count(), 0);
  assert.equal(await run.page.locator('button:has-text("Отменить оплату")').last().isDisabled(), false);
  await run.page.close();
});

test("Ф-2 cancel of a payment: a failed preview says so with «Повторить» and holds the button with the reason", async () => {
  const run = await openVoid(1280, paymentServer({ dryStatus: 500 }));
  await run.page.waitForSelector('[data-testid="money-effects-retry"]');
  assert.equal(await run.page.locator('button:has-text("Отменить оплату")').last().isDisabled(), true);
  assert.match(plain(await run.page.textContent('[role="dialog"]')), /нажмите «Повторить»/);
  await run.page.close();
});

async function openReplace(width = 1280, server = paymentServer(), payment) {
  const run = await openPage(browser, "money-g.entry.tsx", server, { width, height: 900 });
  await run.page.evaluate(([who, pay]) => window.mount("replace", who, { payment: pay }), [OWNER, payment]);
  await run.page.waitForSelector('[role="dialog"]');
  return run;
}

test("Ф-2 correction of a payment: the dry run of the correction stands in the one «Что изменится» of the window; the real request has the key, the dry one has none", async () => {
  const sent = [];
  const run = await openReplace(1280, paymentServer({ log: sent }));
  await run.page.waitForSelector('[data-testid="effects-text-row"]');
  assert.deepEqual(await rowsOf(run.page), ["В группе «Вторая (пн/ср/пт)» появится долг 300 000 сум", "Зарплата за ноябрь у Эргашева К. уменьшится на 45 000 сум"]);
  assert.equal(await run.page.locator('[role="dialog"] >> text="Что изменится"').count(), 1, "ONE title per window");
  const dry = run.calls.find((call) => /replace$/.test(call.path) && /dry_run=true/.test(call.query));
  assert.equal("idempotency-key" in dry.headers, false);
  assert.equal(dry.body.amount, 400000);
  await run.page.fill("#payment-amount", "100 000");
  await run.page.fill("#payment-reason", "ошиблись в сумме");
  await run.page.waitForFunction(() => document.querySelectorAll('[data-testid="effects-text-row"]').length > 0 && !document.querySelector('[data-testid="money-effects-skeleton"]'));
  await run.page.click('button:has-text("Исправить")');
  await run.page.waitForFunction(() => window.__log.includes("saved"));
  const asked = run.calls.filter((call) => /replace$/.test(call.path));
  assert.equal(asked[asked.length - 1].query, "", "the last one is the real request");
  assert.ok(asked[asked.length - 1].headers["idempotency-key"]);
  assert.equal(asked.some((call) => /dry_run=true/.test(call.query) && call.body.amount === 100000), true, "the changed amount was previewed");
  await run.page.close();
});

test("Ф-2 correction of a payment: a draft that cannot be sent asks nothing; the sentence of the toast is the server's (done form)", async () => {
  const run = await openReplace(1280, paymentServer());
  await run.page.waitForSelector('[data-testid="effects-text-row"]');
  const before = run.calls.filter((call) => /replace$/.test(call.path)).length;
  await run.page.fill("#payment-amount", "");
  await run.page.waitForTimeout(700);
  assert.equal(run.calls.filter((call) => /replace$/.test(call.path)).length, before);
  await run.page.close();
});

test("Ф-2 toast after a correction: the rows are the server's `money_effects.text` in the done form; a plain payment adds nothing", () => {
  const { savedPaymentToastDetails } = lib("payments-ledger.ts");
  const result = { allocation: null, money_effects: { students: [], payroll: [], text: DONE_DEBT_TEXT + "; Зарплата за ноябрь у Эргашева К. уменьшилась на 45\u00a0000 сум" } };
  assert.deepEqual(savedPaymentToastDetails("replace", result).map(plain), ["В группе «Вторая (пн/ср/пт)» появился долг 300 000 сум", "Зарплата за ноябрь у Эргашева К. уменьшилась на 45 000 сум"]);
  assert.deepEqual(savedPaymentToastDetails("create", result), []);
  assert.deepEqual(savedPaymentToastDetails("replace", { allocation: null, money_effects: { students: [], payroll: [], text: "" } }), []);
  assert.deepEqual(lib("money-effects.ts").serverEffectsRows({ money_effects: null }), []);
});

// ── Ф-2: «Решения» ───────────────────────────────────────────────────────────────────────────────

test("Ф-2 «Решения»: the opened row says the `consequence` of the server; a row without it says nothing", async () => {
  const rows = [
    { id: "d1", at: "2026-11-05T09:00:00", kind: "payment_void", kind_label: "Оплата отменена", student_id: "s1", student_name: "Каримов Фарходжон Рустамович", group_name: "Алгебра 7 (вт/пт)", amount: 300000, new_amount: null, receipt_no: 12, reason: "ошибочно", actor_name: "Иванова А.", debt_before: 0, debt_after: 300000, consequence: "В группе «Вторая (пн/ср/пт)» долг вырос на 300 000 сум — до 700 000 сум" },
    { id: "d2", at: "2026-11-05T09:10:00", kind: "payment_void", kind_label: "Оплата отменена", student_id: "s2", student_name: "Иванов Иван", group_name: "Геометрия", amount: 100000, new_amount: null, receipt_no: 13, reason: "ошибка", actor_name: "Иванова А.", debt_before: null, debt_after: null, consequence: null },
  ];
  const run = await openPage(browser, "money-g.entry.tsx", async (request) => (request.path === "/auth/org/payments/decisions" ? { json: { as_of: "2026-11-05", from: "2026-11-01", to: "2026-11-30", page: 1, size: 25, total: 2, pages: 1, since: "2026-10-01", rows } } : null), { width: 1280, height: 900 });
  await run.page.evaluate((who) => window.mount("decisions", who), OWNER);
  await run.page.waitForSelector('[data-testid="decision-row"]');
  await run.page.locator('[data-testid="decision-row"]').nth(0).click();
  await run.page.waitForSelector('[data-testid="decision-consequence"]');
  assert.equal(await run.page.textContent('[data-testid="decision-consequence"]'), "В группе «Вторая (пн/ср/пт)» долг вырос на 300 000 сум — до 700 000 сум");
  await run.page.locator('[data-testid="decision-row"]').nth(1).click();
  await run.page.waitForSelector('[data-testid="decision-details"]');
  assert.equal(await run.page.locator('[data-testid="decision-consequence"]').count(), 0);
  await run.page.close();
});

for (const width of [1280, 1024, 375]) {
  test(`Ф-2 ${width}: the cancel and the correction of a payment - nothing leaves its box, the sentence is whole`, async () => {
    for (const open of [() => openVoid(width), () => openReplace(width)]) {
      const { page } = await open();
      await page.waitForSelector('[data-testid="effects-text-row"]');
      assert.deepEqual(await rowsOf(page), ["В группе «Вторая (пн/ср/пт)» появится долг 300 000 сум", "Зарплата за ноябрь у Эргашева К. уменьшится на 45 000 сум"], `${width}`);
      await page.waitForTimeout(450);
      const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
      assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
      assert.equal(facts.scroll, 0);
      await page.close();
    }
  });
}

// ── Ф-4: «Поступления» - the till of the day and the journal of payments ─────────────────────────────

const CASH_TEXT = "Наличные в кассе за сегодня: 130 000 сум (принято 250 000 сум, возвращено 100 000 сум, отменено 20 000 сум)";
const CASH = { date: "2026-10-21", label: "Наличные в кассе за сегодня", cash_received: 250000, cash_refunded: 100000, cash_cancelled: 20000, cash_corrected: 0, expected: 130000, payments_count: 2, text: CASH_TEXT, scope: "centre", filtered_view: false, scope_text: null };
const OVERVIEW = { by_method: [{ method: "cash", label: "Наличные", amount: 250000, count: 2 }, { method: "card", label: "Карта", amount: 180000, count: 1 }] };

test("Ф-4: the normalizer keeps the cancelled and corrected parts of the till", () => {
  const { normalizeOverview } = lib("payments-income-v2.ts");
  const cash = normalizeOverview({ cash: { ...CASH, cash_cancelled: 20000, cash_corrected: -50000 } }).cash;
  assert.equal(cash.cash_cancelled, 20000);
  assert.equal(cash.cash_corrected, -50000);
  assert.equal(cash.expected, 130000, "the sum of the till is the server's number");
});

async function openDonut(width = 1280, cash = CASH) {
  const run = await openPage(browser, "money-g.entry.tsx", () => null, { width, height: 900 });
  await run.page.evaluate(([c, o, w]) => window.mount("donut", {}, { cash: c, overview: o, width: w }), [cash, OVERVIEW, width >= 1024 ? 420 : width - 32]);
  await run.page.waitForSelector('[data-testid="income-methods"]');
  return run;
}

test("Ф-4: the line of the till is the text of the server (all parts: received, returned, cancelled); the two «наличные» say what they are counted by", async () => {
  const { page } = await openDonut();
  assert.equal(plain(await page.textContent('[data-testid="cash-today-text"]')), plain(CASH_TEXT));
  assert.equal(await page.textContent('[data-testid="cash-today-text"]'), CASH_TEXT, "as it is, down to the non-breaking spaces");
  assert.match(plain(await page.textContent('[data-testid="cash-today"]')), /^Касса за день · по дню внесения/);
  assert.equal(plain(await page.textContent('[data-testid="income-methods"] h2')), "Чем платили · по дате оплаты");
  await page.close();
});

test("Ф-4: a till with nothing moved says the server's line as it is, never a line of ours", async () => {
  const { page } = await openDonut(1280, { ...CASH, cash_received: 0, cash_refunded: 0, cash_cancelled: 0, expected: 0, text: "Наличные в кассе за сегодня: 0 сум" });
  assert.equal(await page.textContent('[data-testid="cash-today-text"]'), "Наличные в кассе за сегодня: 0 сум");
  await page.close();
});

const DATES = "внесена 22.10 · дата оплаты 21.10";
const JOURNAL_ROW = (id, extra = {}) => ({ id, receipt_no: 41, paid_on: "2026-10-21", paid_time: null, created_at: "2026-10-22T07:00:00", entered_at_text: "внесена 22.10 в 12:00", student_id: "s1", student_name: "Каримов Фарходжон Рустамович", display_id: null, membership_id: "m1", group_id: "g1", group_name: "Алгебра 7 (вт/пт)", teacher_name: "Эргашев К.", amount: 1250000, method: "cash", method_label: "Наличные", created_by_id: "u1", created_by_name: "Иванова А.", note: null, status: "active", ...extra });

test("Ф-4 journal: a payment entered not on its payment day says `dates_text` under the date; a payment of its own day says nothing", async () => {
  const run = await openPage(browser, "money-g.entry.tsx", () => null, { width: 1280, height: 900 });
  await run.page.evaluate((rows) => window.mount("journal", {}, { rows }), [JOURNAL_ROW("a", { dates_text: DATES }), JOURNAL_ROW("b", { entered_at_text: null, dates_text: null, paid_time: "11:40", student_name: "Иванов Иван" })]);
  await run.page.waitForSelector('[data-testid="journal-row"]');
  const rows = run.page.locator('[data-testid="journal-row"]');
  assert.equal(plain(await rows.nth(0).locator('[data-testid="journal-entered"]').textContent()), DATES);
  assert.equal(await rows.nth(1).locator('[data-testid="journal-entered"]').count(), 0);
  await run.page.close();
});

for (const width of [1280, 1024, 375]) {
  test(`Ф-4 ${width}: the till and the journal at «как в жизни» data - nothing leaves its box, the texts are whole`, async () => {
    const donut = await openDonut(width);
    await donut.page.waitForTimeout(100);
    assert.equal(await donut.page.textContent('[data-testid="cash-today-text"]'), CASH_TEXT, `${width}`);
    const f1 = await donut.page.evaluate(layoutProbe, '[data-testid="income-methods"]');
    assert.deepEqual(f1.bad, [], JSON.stringify(f1.bad));
    assert.equal(f1.scroll, 0);
    await donut.page.close();
    const run = await openPage(browser, "money-g.entry.tsx", () => null, { width, height: 900 });
    await run.page.evaluate(([rows, w]) => window.mount("journal", {}, { rows, width: w }), [[JOURNAL_ROW("a", { dates_text: DATES })], width >= 1024 ? 960 : width - 32]);
    await run.page.waitForSelector('[data-testid="journal-row"]');
    assert.equal(plain(await run.page.locator('[data-testid="journal-entered"]').first().innerText()), DATES);
    assert.equal(plain(await run.page.locator('[data-testid="journal-row"]').first().innerText()).includes("Каримов Фарходжон Рустамович"), true);
    const f2 = await run.page.evaluate(layoutProbe, '[data-testid="income-journal-list"]');
    assert.deepEqual(f2.bad, [], JSON.stringify(f2.bad));
    assert.equal(f2.scroll, 0);
    await run.page.close();
  });
}

// ── Ф-3: «Посещаемость → Пропуски» without the money right: no deadline at all ──────────────────────

const excuse = (id, date, group, extra = {}) => ({ id, attendance_id: `a${id}`, lesson_date: date, lesson_key: `${date}_l`, group: { id: `g${id}`, name: group }, teacher: { id: "t1", name: "Каримова Дилдора Рустамовна" }, student: { id: `s${id}`, full_name: `Каримов Фарходжон ${id}`, display_id: null }, reason: "болел", reason_by: null, reason_at: null, status: "pending", reviewed_by: null, reviewed_at: null, review_note: null, files: [], deadline: null, billing_mode: null, decided_after_deadline: null, deadline_at_decision: null, ...extra });
// the order of the server (by lesson date, the oldest first) - the lessons are of different months, so a fallback «last day of the month» would colour them differently
const NO_DEADLINE_ROWS = [excuse("1", "2026-09-22", "Алгебра 7 (вт/пт)"), excuse("2", "2026-10-14", "Алгебра 7 (вт/пт)"), excuse("3", "2026-11-05", "Геометрия 8 (пн/ср)")];
const excusesServer = (rows) => (request) => {
  if (request.path === "/auth/org/attendance/excuses/summary") return { json: { pending_total: rows.length, open_lessons_total: 0 } };
  if (request.path === "/auth/org/attendance/excuses") return { json: { items: request.query.includes("status=pending") ? rows : [], total: rows.length, pending_total: rows.length } };
  return null;
};
async function openExcuses(user, rows, width = 1280) {
  const run = await openPage(browser, "ds.entry.tsx", excusesServer(rows), { width, height: 900 });
  await run.page.clock.setFixedTime(new Date("2026-11-14T10:00:00+05:00"));
  await run.page.evaluate((who) => window.mount("excuses", who, {}), user);
  await run.page.waitForFunction((count) => document.querySelectorAll("li").length >= count, rows.length, { timeout: 10000, polling: "raf" });
  await run.page.waitForFunction(() => !document.querySelector('[role="progressbar"], .animate-pulse'), null, { timeout: 10000, polling: "raf" });
  return run;
}

test("Ф-3: without the money right (`deadline` null) there is no deadline: no column, no chip, no colour; the order is the server's (by the date of the lesson)", async () => {
  const { page } = await openExcuses(ADMIN_NO_RIGHT, NO_DEADLINE_ROWS);
  const body = plain(await page.textContent("body"));
  assert.doesNotMatch(body, /Срок|Осталось|прошёл|до 30\.09|до 31\.10|до 30\.11/, body.slice(0, 400));
  assert.equal(await page.locator('[data-testid="excuses-no-money-right"]').count(), 1);
  const students = (await page.locator("li").allTextContents()).map(plain).filter((text) => /Каримов Фарходжон \d/.test(text)).map((text) => /Фарходжон (\d)/.exec(text)[1]);
  assert.deepEqual(students, ["1", "2", "3"], "the order of the server");
  await page.close();
});

test("Ф-3: with the right the server's deadline stays: the column, the chip, the urgent first", async () => {
  const rows = [
    excuse("1", "2026-11-05", "Алгебра 7 (вт/пт)", { deadline: { kind: "date", date: "2026-11-30", days_left: 16, overdue: false } }),
    excuse("2", "2026-10-14", "Алгебра 7 (вт/пт)", { deadline: { kind: "date", date: "2026-11-10", days_left: -4, overdue: true } }),
    excuse("3", "2026-11-12", "Геометрия 8 (пн/ср)", { deadline: { kind: "date", date: "2026-11-15", days_left: 1, overdue: false } }),
  ];
  const { page } = await openExcuses(OWNER, rows);
  const body = plain(await page.textContent("body"));
  assert.match(body, /Срок/);
  assert.match(body, /Срок прошёл 4 дня назад/);
  const order = (await page.locator("li").allTextContents()).map(plain).filter((text) => /Каримов Фарходжон \d/.test(text)).map((text) => /Фарходжон (\d)/.exec(text)[1]);
  assert.deepEqual(order, ["2", "3", "1"], "passed first, then the nearest");
  await page.close();
});

test("Ф-3 lib: no deadline from the server - no deadline of ours (neither `null` nor an absent key falls back to «конец месяца»)", () => {
  const { excuseDeadlineCell, excuseDeadlinePassed, sortExcusesByUrgency } = lib("excuse-deadline.ts");
  for (const deadline of [null, undefined]) {
    const item = { lesson_date: "2026-09-22", status: "pending", ...(deadline === undefined ? {} : { deadline }) };
    assert.equal(excuseDeadlineCell(item, "2026-11-14"), null);
    assert.equal(excuseDeadlinePassed(item, "2026-11-14"), null);
  }
  const items = [{ id: "a", lesson_date: "2026-11-05", status: "pending", deadline: null }, { id: "b", lesson_date: "2026-09-22", status: "pending", deadline: null }];
  assert.deepEqual(sortExcusesByUrgency(items, "2026-11-14").map((item) => item.id), ["a", "b"], "the server's order stands");
  assert.equal(lib("excuse-deadline.ts").excuseDeadline, undefined, "the month-end rule is gone");
});

test("Ф-3: decided excuses with `billing_mode` and `decided_after_deadline` null do not break the screen and show no mark", async () => {
  const decided = [excuse("1", "2026-10-14", "Алгебра 7 (вт/пт)", { status: "confirmed", reviewed_by: { id: "u1", name: "Иванова А." }, reviewed_at: "2026-10-20T08:00:00" })];
  const run = await openPage(browser, "ds.entry.tsx", (request) => {
    if (request.path === "/auth/org/attendance/excuses/summary") return { json: { pending_total: 0, open_lessons_total: 0 } };
    if (request.path === "/auth/org/attendance/excuses") return { json: { items: request.query.includes("status=confirmed") ? decided : [], total: request.query.includes("status=confirmed") ? 1 : 0, pending_total: 0 } };
    return null;
  }, { width: 1280, height: 900 });
  await run.page.clock.setFixedTime(new Date("2026-11-14T10:00:00+05:00"));
  await run.page.evaluate((who) => window.mount("excuses", who, {}), ADMIN_NO_RIGHT);
  await run.page.click('[role="tab"]:has-text("Подтверждено")');
  await run.page.waitForFunction(() => /Каримов Фарходжон 1/.test(document.body.textContent || ""), null, { timeout: 10000 });
  assert.doesNotMatch(plain(await run.page.textContent("body")), /после срока|Срок/);
  assert.deepEqual(run.errors.filter((text) => !/404|Failed to load resource/.test(text)), []);
  await run.page.close();
});

for (const width of [1280, 1024, 375]) {
  test(`Ф-3 ${width}: the queue of an administrator without the right - nothing leaves its box`, async () => {
    const { page } = await openExcuses(ADMIN_NO_RIGHT, NO_DEADLINE_ROWS, width);
    await page.waitForTimeout(450);
    const facts = await page.evaluate(layoutProbe, "main, body");
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    assert.match(plain(await page.textContent("body")), /Алгебра 7 \(вт\/пт\)/);
    await page.close();
  });
}

// ── Ф-7: «кто провёл» a past lesson is for the money right ───────────────────────────────────────────

const PAST_NO_RIGHT = "Назначить, кто провёл прошедший урок, может владелец или администратор с доступом к деньгам";

test("Ф-7 menu: «Назначить того, кто провёл» of a past lesson is not offered without the money right; a coming lesson keeps «Назначить замену»", () => {
  const { scheduleCardActions } = lib("schedule-card-actions.ts");
  const past = { role: "admin", archived: false, state: "scheduled", date: "2026-11-10", today: "2026-11-14", hasTeacherInfo: true, startTime: "16:00" };
  assert.deepEqual(scheduleCardActions({ ...past, moneyRight: false }), ["mark"]);
  assert.deepEqual(scheduleCardActions({ ...past }), ["mark"], "an absent flag is no right");
  assert.deepEqual(scheduleCardActions({ ...past, moneyRight: true }), ["mark", "assign"]);
  assert.deepEqual(scheduleCardActions({ ...past, role: "owner", moneyRight: true }), ["mark", "assign"]);
  const coming = { ...past, date: "2026-11-20" };
  assert.deepEqual(scheduleCardActions({ ...coming, moneyRight: false }), ["assign", "reschedule", "cancel"], "a substitute for a coming lesson moves no money");
});

test("Ф-7 server text: 403 MONEY_RIGHT_REQUIRED is shown as the server wrote it (the window of «кто провёл», the decision of a request)", () => {
  const message = "Провести урок за другого преподавателя в журнале может владелец или администратор с доступом к деньгам: от этого зависит, чья это зарплата";
  const error = Object.assign(new Error(message), { status: 403, code: "MONEY_RIGHT_REQUIRED", detail: { code: "MONEY_RIGHT_REQUIRED", message } });
  assert.equal(lib("ops-errors.ts").lessonTeacherErrorText(error), message);
  assert.equal(lib("substitutions.ts").substitutionErrorText(error), message);
});

async function openPastDecision(user, width = 1280) {
  const run = await openPage(browser, "money-g.entry.tsx", serverOf(), { width, height: 900 });
  await run.page.clock.setFixedTime(new Date("2026-11-14T10:00:00+05:00"));
  await run.page.evaluate(([who, role]) => window.mount("decision", who, { role, past: true }), [user, user.org_role]);
  await run.page.waitForSelector('[role="dialog"]');
  return run;
}

test("Ф-7 «Замены»: «Замена» of a past lesson is off for an administrator without the right - with the reason in words; the decision starts on another card", async () => {
  const { page } = await openPastDecision(ADMIN_NO_RIGHT);
  const card = page.locator('label:has(input[value="substitute"])');
  assert.equal(await card.locator("input").isDisabled(), true);
  assert.match(plain(await card.textContent()), new RegExp(PAST_NO_RIGHT));
  assert.equal(await page.locator('input[name="substitution-decision"]:checked').getAttribute("value") !== "substitute", true);
  for (const value of ["reschedule", "cancel", "reject"]) assert.equal(await page.locator(`input[value="${value}"]`).isDisabled(), false, value);
  await page.close();
});

for (const [who, user] of [["the owner", OWNER], ["an administrator with the right", ADMIN_WITH_RIGHT]]) {
  test(`Ф-7 «Замены»: ${who} may name who held a past lesson - the card is on and chosen`, async () => {
    const { page } = await openPastDecision(user);
    assert.equal(await page.locator('input[value="substitute"]').isDisabled(), false);
    assert.equal(await page.locator('input[name="substitution-decision"]:checked').getAttribute("value"), "substitute");
    assert.doesNotMatch(plain(await page.textContent('[role="dialog"]')), new RegExp(PAST_NO_RIGHT));
    await page.close();
  });
}

test("Ф-7 «Замены»: a lesson to come is not locked for an administrator without the right", async () => {
  const run = await openPage(browser, "money-g.entry.tsx", serverOf(), { width: 1280, height: 900 });
  await run.page.clock.setFixedTime(new Date("2026-11-14T10:00:00+05:00"));
  await run.page.evaluate((who) => window.mount("decision", who, { role: "admin" }), ADMIN_NO_RIGHT);
  await run.page.waitForSelector('[role="dialog"]');
  assert.equal(await run.page.locator('input[value="substitute"]').isDisabled(), false);
  await run.page.close();
});

for (const width of [1280, 1024, 375]) {
  test(`Ф-7 ${width}: the locked card - the reason is whole and nothing leaves its box`, async () => {
    const { page } = await openPastDecision(ADMIN_NO_RIGHT, width);
    await page.waitForTimeout(450);
    assert.match(plain(await page.locator('label:has(input[value="substitute"])').innerText()), new RegExp(PAST_NO_RIGHT));
    const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    await page.close();
  });
}
