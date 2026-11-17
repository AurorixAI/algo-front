// Money-2 fix 5 / п.1-2: a refusal of the server stands ONCE in a window of money (in the block «Что изменится», not again as a red plate), the button of a refusal that a repeat cannot change is off until
// the date or the amount changes; the head of a window of money never ends or starts a line with the dot-separator.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { toshmatovPreview, TOSHMATOV } = require("./helpers/stage-numbers.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });
const plain = (text) => text.replace(/[\s ]+/g, " ").trim();
const times = (text, part) => text.split(part).length - 1;
const WORDS = "Запись старше 7 дней вносит владелец";

function tillServer() {
  return async (request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m1/payments/preview") {
      if (/amount=5000(&|$)/.test(request.query)) return { status: 403, json: { detail: { code: "BACKDATE_OWNER_ONLY", message: WORDS } } };
      return { json: toshmatovPreview(Number(/amount=(\d+)/.exec(request.query)?.[1]) || null) };
    }
    if (request.method === "POST" && request.path === "/auth/org/memberships/m1/payments") return { status: 403, json: { detail: { code: "BACKDATE_OWNER_ONLY", message: WORDS } } };
    return null;
  };
}

test("п.1: окно «Оплата от ученика» - отказ пробного расчёта один раз, кнопка выключена, правка суммы её включает (375)", async () => {
  const run = await openPage(browser, "money.entry.tsx", tillServer(), { width: 375, height: 800 });
  const { page, calls } = run;
  await page.evaluate(([u, membership]) => window.mount("till", u, { membership }), [{ role: "admin", org_role: "admin" }, TOSHMATOV]);
  for (let waited = 0; !calls.some((call) => call.path.endsWith("/payments/preview")) && waited < 5000; waited += 25) await page.waitForTimeout(25);
  await page.fill("#payment-amount", "5000");
  await page.click('[data-testid="payment-methods"] >> text=Наличные');
  await page.waitForSelector('[data-testid="payment-calc"] [role="alert"]');
  const dialog = plain(await page.locator('[role="dialog"]').evaluate((el) => el.innerText));
  assert.equal(times(dialog, WORDS), 1, dialog);
  assert.equal(await page.locator('button[form="payment-form"]').isDisabled(), true);
  const posts = calls.filter((call) => call.method === "POST").length;
  await page.fill("#payment-amount", "6000");
  await page.waitForSelector('[data-testid="payment-plan-rows"]');
  assert.equal(await page.locator('button[form="payment-form"]').isDisabled(), false);
  assert.equal(calls.filter((call) => call.method === "POST").length, posts);
  await page.close();
});

test("п.1: отказ при записи (без отказа пробного расчёта) - одна красная плашка, сумма не дублируется", async () => {
  const answer = tillServer();
  const run = await openPage(browser, "money.entry.tsx", answer, { width: 375, height: 800 });
  const { page, calls } = run;
  await page.evaluate(([u, membership]) => window.mount("till", u, { membership }), [{ role: "admin", org_role: "admin" }, TOSHMATOV]);
  for (let waited = 0; !calls.some((call) => call.path.endsWith("/payments/preview")) && waited < 5000; waited += 25) await page.waitForTimeout(25);
  await page.fill("#payment-amount", "7000");
  await page.waitForSelector('[data-testid="payment-plan-rows"]');
  await page.click('[data-testid="payment-methods"] >> text=Наличные');
  await page.click('button[form="payment-form"]');
  await page.waitForSelector('[role="dialog"] [role="alert"], [role="dialog"] [role="status"]');
  const dialog = plain(await page.locator('[role="dialog"]').evaluate((el) => el.innerText));
  assert.equal(times(dialog, WORDS), 1, dialog);
  await page.close();
});

// ----- опись: окно денег × отказ пробного расчёта (BACKDATE_OWNER_ONLY) -> слова сервера один раз -----
const TODAY_PAYMENT = { id: "p1", amount: 400000, paid_on: "2026-11-05", method: "cash", note: null };
function dryRefusing(request) {
  if (/dry_run=true/.test(request.query) && request.method !== "GET") return { status: 403, json: { detail: { code: "BACKDATE_OWNER_ONLY", message: WORDS } } };
  if (request.method === "GET" && request.path === "/auth/org/memberships/m1/payments/preview") return { json: toshmatovPreview(Number(/amount=(\d+)/.exec(request.query)?.[1]) || null) };
  return null;
}
async function dialogOnce(name, props, fill) {
  const { page } = await openPage(browser, "money.entry.tsx", dryRefusing, { width: 375, height: 800 });
  await page.evaluate(([n, p]) => window.mount(n, { role: "admin", org_role: "admin" }, p), [name, props]);
  await page.waitForSelector('[role="dialog"]');
  if (fill) await fill(page);
  await page.waitForTimeout(900);
  const text = plain(await page.locator('[role="dialog"]').evaluate((el) => el.innerText));
  const submit = page.locator('[role="dialog"] button[type="submit"], button[form]').first();
  const off = await submit.count() ? await submit.isDisabled() : true;
  await page.close();
  return { text, off };
}
test("опись п.1: исправление оплаты - слова сервера один раз, кнопка выключена", async () => {
  const { text, off } = await dialogOnce("replace", { membership: TOSHMATOV, payment: TODAY_PAYMENT }, async (page) => {
    await page.fill("#payment-amount", "350000");
    await page.fill("#payment-reason, textarea[placeholder^='Например']", "Ошибся в сумме").catch(() => {});
  });
  assert.equal(times(text, WORDS), 1, text);
  assert.equal(off, true);
});
test("опись п.1: прощение долга и возврат - отказ пробного расчёта не дублируется", async () => {
  for (const [name, reasonId] of [["writeoff", "#writeoff-reason"], ["refund", "#refund-reason"]]) {
    const { text } = await dialogOnce(name, {}, async (page) => { await page.fill(reasonId, "Причина для проверки").catch(() => {}); });
    assert.ok(times(text, WORDS) <= 1, `${name}: ${text}`);
  }
});
