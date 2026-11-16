// Money-2 wave 1, Э3 (Т7, Т11): the statement - «Восстановить оплату» at a cancelled payment that the server calls `restorable` (reason is mandatory, «Что изменится» from the dry run, a refusal in the server's
// words); a payment already replaced says by which one and has no button; the student in the archive keeps «Вернуть аванс» and «Простить долг».
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const F = require("./helpers/money2-fixture.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => text.replace(/\s+/g, " ").replace(/ /g, " ").trim();
const WILL = "В группе «Бета» аванс вырастет на 390 000 сум — до 390 000 сум";

function server(restore = null) {
  return F.baseServer((request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m-a/statement") return { json: F.statementWithVoided() };
    if (request.method === "GET" && request.path === "/auth/org/memberships/m-a/payments") return { json: F.paymentsList() };
    if (request.method === "POST" && request.path === "/auth/org/payments/p3/restore") {
      if (restore) return restore(request);
      return { status: 201, json: { payment: { ...F.paymentsList()[2], id: "p4", restored_from_receipt_no: 3 }, money_effects: request.query.includes("dry_run") ? { dryRun: true, text: WILL, students: [], payroll: [] } : { text: WILL, students: [], payroll: [] } } };
    }
    return null;
  });
}

async function open(width, answer) {
  const run = await openPage(browser, "money2.entry.tsx", answer, { width, height: 900 });
  await run.page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
  await run.page.waitForSelector('[data-testid="statement-months"]');
  await run.page.getByText("Показать отменённые").click();
  await run.page.waitForSelector('section[aria-label="Отменённые записи"] li');
  return run;
}

test("Т7: «Восстановить оплату» only where `restorable`; the replaced one names its successor and has no button", async () => {
  const run = await open(1280, server());
  const list = run.page.locator('section[aria-label="Отменённые записи"] li');
  assert.equal(await list.count(), 2);
  const texts = (await list.allTextContents()).map(plain);
  const replaced = texts.find((item) => item.includes("№ 1"));
  const plainOne = texts.find((item) => item.includes("№ 3"));
  assert.ok(replaced.includes("заменена оплатой № 2"), replaced);
  assert.ok(!replaced.includes("Восстановить оплату"), "an already replaced payment is not restored twice");
  assert.ok(plainOne.includes("Восстановить оплату"), plainOne);
  assert.equal(await run.page.getByRole("button", { name: "Восстановить оплату" }).count(), 1);
  await run.page.close();
});

test("Т7: the window - the reason is mandatory, «Что изменится» is the sentence of the dry run once, the write goes with the reason", async () => {
  const run = await open(1280, server());
  await run.page.getByRole("button", { name: "Восстановить оплату" }).click();
  await run.page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  const dialog = plain(await run.page.textContent('[role="dialog"]'));
  assert.equal(dialog.split("390 000 сум").length - 1, 2, "the sentence of the server stands once: «вырастет на 390 000 сум — до 390 000 сум»");
  assert.ok(dialog.includes("Что изменится") && dialog.includes("Восстановить оплату?"));
  const submit = run.page.locator('[role="dialog"] button[type="submit"]');
  await submit.click();
  assert.equal(run.calls.filter((call) => call.method === "POST" && !/dry_run/.test(call.query)).length, 0, "without a reason nothing is written");
  await run.page.fill('[role="dialog"] textarea, [role="dialog"] input[type="text"]', "Отменили по ошибке");
  await submit.click();
  await run.page.waitForSelector('[role="dialog"]', { state: "detached" });
  const write = run.calls.filter((call) => call.method === "POST" && /\/payments\/p3\/restore$/.test(call.path) && !/dry_run/.test(call.query));
  assert.equal(write.length, 1);
  assert.deepEqual(write[0].body, { reason: "Отменили по ошибке" });
  await run.page.close();
});

test("Т7: a 409 of the server is said in its own words and the window stays", async () => {
  const text = "Эта оплата уже заменена оплатой № 4: восстановить её второй раз нельзя";
  const run = await open(1280, server((request) => request.query.includes("dry_run")
    ? { status: 201, json: { payment: F.paymentsList()[2], money_effects: { dryRun: true, text: "", students: [], payroll: [] } } }
    : { status: 409, json: { detail: { code: "PAYMENT_ALREADY_RESTORED", message: text, receipt_no: 4, payment_id: "p4" } } }));
  await run.page.getByRole("button", { name: "Восстановить оплату" }).click();
  await run.page.fill('[role="dialog"] textarea, [role="dialog"] input[type="text"]', "Нужна оплата");
  await run.page.locator('[role="dialog"] button[type="submit"]').click();
  await run.page.waitForSelector('[role="dialog"] [role="alert"]');
  assert.ok(plain(await run.page.textContent('[role="dialog"] [role="alert"]')).includes(text));
  assert.equal(await run.page.locator('[role="dialog"]').count(), 1);
  await run.page.close();
});

test("Т11: the student in the archive keeps «Вернуть аванс» and «Простить долг» (the server allows both)", () => {
  const ts = require("typescript");
  require.extensions[".ts"] = (mod, filename) => { mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename); };
  const Module = require("node:module");
  const original = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) { return original.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...rest); };
  const M = require(path.join(root, "src/lib/membership-actions.ts"));
  Module._resolveFilename = original;
  const left = { is_active: false, debt: 100000, writeoff_allowed: true, refundable: 0 };
  assert.deepEqual(M.membershipMenuLabels(left, { archived: true }), ["Простить долг"]);
  assert.deepEqual(M.membershipMenuLabels({ ...left, debt: 0, refundable: 50000 }, { archived: true }), ["Вернуть аванс"]);
  assert.deepEqual(M.membershipMenuLabels({ ...left, is_active: true }, { archived: true }), ["Простить долг"], "the price and the opening balance stay closed for an archived student");
});
