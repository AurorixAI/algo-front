// UX pack №9 in a real browser: the window «Записать выплату» (a teacher's payout).  «Запись о выплате — деньги ALGO не переводит.»; ONE line over the form («К выплате 757 500 сум»; two figures only for a part paid);
// the hint of the field («Это вся сумма — выплата за октябрь будет закрыта»); the main button names the action and the sum, off with the line «почему»; the question about more than is left is one plaque with the
// whole sentence.  The CSS is the project's tailwind.
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
const STATE = (over) => ({ saved_total: 757500, fresh_total: 757500, target: 757500, paid: 0, balance: 757500, state: "unpaid", basis: "saved", changed_by: 0, change_text: null, text: "", items: [], carry_in: 0, carry_used: 0, advance_out: 0, ...over });
const overpayServer = (request) => (request.method === "POST" && request.path === "/auth/org/payroll/sheets/s1/payouts" ? { status: 409, json: { detail: { code: "OVERPAY_CONFIRM_REQUIRED", message: "x", overpay: 50000, balance: 757500 } } } : null);
async function open(width, state, server = () => null) {
  const run = await openPage(browser, "money.entry.tsx", server, { width, height: 812 });
  await run.page.evaluate(([s]) => window.mount("payout", undefined, { state: s }), [state]);
  await run.page.waitForSelector("#payout-amount");
  return run;
}

test("№9: the title, the subtitle, ONE line «К выплате 757 500 сум» over the form - no tiles of figures", async () => {
  const { page } = await open(1280, STATE({}));
  assert.equal(plain(await page.textContent('[role="dialog"] h2')), "Записать выплату");
  assert.equal(plain(await page.textContent('[data-testid="payout-subtitle"]')), "Запись о выплате — деньги ALGO не переводит.");
  assert.equal(plain(await page.textContent('[data-testid="payout-state"]')), "К выплате 757 500 сум");
  assert.equal(await page.locator('[data-testid="payout-state"] dt').count(), 0, "one line, not a list of figures");
  await page.close();
});

test("№9: two figures only for a part paid: «Осталось выплатить 607 500 сум из 757 500 сум»; an open month says «К выплате сейчас»; the neutral colour", async () => {
  const part = await open(1280, STATE({ paid: 150000, balance: 607500, state: "due" }));
  assert.equal(plain(await part.page.textContent('[data-testid="payout-state"]')), "Осталось выплатить 607 500 сум из 757 500 сум");
  const color = await part.page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="payout-state"]')).color);
  assert.ok(!/180, 83, 9|146, 64, 14|217, 119, 6/.test(color), `neutral, not amber: ${color}`);
  await part.page.close();
  const open_ = await open(1280, STATE({ basis: "fresh", target: 25000, balance: 25000, text: "Месяц открыт: начислено сейчас 25 000, выплачено 0, к выплате 25 000" }));
  assert.equal(plain(await open_.page.textContent('[data-testid="payout-state"]')), "К выплате сейчас 25 000 сум");
  assert.equal(await open_.page.locator('[data-testid="payout-text"]').count(), 0, "the sentence of the server repeats the line - not shown");
  await open_.page.close();
});

test("№9: the hint of the field - the whole sum closes the month; a part says what is left; the button names the action and the sum", async () => {
  const { page } = await open(1280, STATE({}));
  const submit = page.locator('[data-testid="payout-submit"]');
  assert.equal(await submit.isDisabled(), false, "the form starts with what is left");
  assert.equal(plain(await submit.textContent()), "Записать выплату 757 500 сум");
  assert.equal(plain(await page.textContent('[aria-live="polite"]')), "Это вся сумма — выплата за ноябрь будет закрыта");
  await page.fill("#payout-amount", "500 000");
  assert.equal(plain(await submit.textContent()), "Записать выплату 500 000 сум");
  assert.equal(plain(await page.textContent('[aria-live="polite"]')), "Останется выплатить 257 500 сум");
  await page.fill("#payout-amount", "");
  assert.equal(await submit.isDisabled(), true);
  assert.equal(plain(await page.textContent('[data-testid="payout-why"]')), "Введите сумму выплаты.");
  assert.equal(plain(await page.textContent('[data-testid="confirm-cancel"]')), "Отмена");
  await page.close();
});

test("№9: more than is left - ONE plaque with the whole sentence, the button «Записать выплату вперёд 807 500 сум»; «Отмена» goes back to the form", async () => {
  const { page } = await open(1280, STATE({}), overpayServer);
  await page.fill("#payout-amount", "807 500");
  await page.click('[role="radio"]:has-text("Наличные")');
  await page.click('[data-testid="payout-submit"]');
  await page.waitForSelector('[data-testid="payout-overpay"]');
  assert.equal(plain(await page.textContent('[data-testid="payout-overpay"]')), "Это на 50 000 сум больше остатка — запишем как выплату вперёд и вычтем из следующей выплаты.");
  assert.equal(plain(await page.textContent('[data-testid="payout-submit"]')), "Записать выплату вперёд 807 500 сум");
  assert.equal(await page.locator('[data-testid="payout-overpay"] span span').count(), 0, "no second line under the sentence");
  assert.equal(plain(await page.textContent('[aria-live="polite"]')), "", "the hint under the field does not repeat the plaque (a fact once)");
  await page.click('[data-testid="confirm-cancel"]');
  assert.equal(await page.locator('[data-testid="payout-overpay"]').count(), 0);
  assert.equal(plain(await page.inputValue("#payout-amount")), "807 500");
  await page.close();
});

for (const width of [1280, 1024, 375]) {
  test(`${width}: nothing leaves its box, no horizontal scroll; the buttons are at least 40 px on a phone`, async () => {
    const { page } = await open(width, STATE({ paid: 150000, balance: 607500, state: "due" }), overpayServer);
    await page.fill("#payout-amount", "700 000");
    await page.click('[role="radio"]:has-text("Наличные")');
    await page.click('[data-testid="payout-submit"]');
    await page.waitForSelector('[data-testid="payout-overpay"]');
    await page.waitForTimeout(450);
    const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    if (width < 1024) {
      const heights = await page.evaluate(() => ['[data-testid="payout-submit"]', '[data-testid="confirm-cancel"]'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().height)));
      assert.ok(heights.every((h) => h >= 40), heights.join(","));
    }
    await page.close();
  });
}
