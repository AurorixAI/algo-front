// UX pack §5.1 / §5.1-бис in a real browser: the window «Оплата от ученика» with the numbers of the walk of stage.  What a person reads, top to bottom: whose money it is, the debt, the amount, the block
// «Что изменится» about the STUDENT (a table), then ONE folded line about the pay of the teachers; nothing leaves its box on 1280, 1024 and a phone (tailwind of the project is the CSS).
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { fixture, EMPTY_EFFECTS, deferred } = require("./helpers/dom-answers.cjs");
const { toshmatovPreview, STAGE_EFFECTS, TOSHMATOV } = require("./helpers/stage-numbers.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const isDry = (call) => /dry_run=true/.test(call.query);
const plain = (text) => text.replace(/\s+/g, " ").replace(/ /g, " ").trim();
/** The rows as a person reads them: the pieces of a row (a name, a number) with a space between. */
const rowTexts = (locator) => locator.evaluateAll((items) => items.map((item) => [...item.children].map((child) => child.textContent).join(" ")));
function server(effects, extra = {}) {
  return async (request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m1/payments/preview") return { json: toshmatovPreview(Number(/amount=(\d+)/.exec(request.query)?.[1]) || null) };
    if (request.method === "POST" && request.path === "/auth/org/memberships/m1/payments" && isDry(request)) return extra.dry ? extra.dry() : { json: { ...fixture("e1_create_300000"), dry_run: true, money_effects: effects } };
    return null;
  };
}
async function open(width, effects = STAGE_EFFECTS, user, extra) {
  const { page, calls, errors } = await openPage(browser, "money.entry.tsx", server(effects, extra), { width, height: 900 });
  await page.evaluate(([u, membership]) => window.mount("till", u, { membership }), [user, TOSHMATOV]);
  for (let waited = 0; !calls.some((call) => call.path.endsWith("/payments/preview")) && waited < 5000; waited += 25) await page.waitForTimeout(25);
  await page.fill("#payment-amount", "400000");
  await page.click('[data-testid="payment-methods"] >> text=Наличные');
  return { page, calls, errors };
}

test("the window is about the STUDENT's money: the title, the subtitle, the debt now, the chips (owner, 1280)", async () => {
  const { page } = await open(1280);
  await page.waitForSelector('[data-testid="payment-plan-rows"]');
  assert.equal(await page.textContent('[role="dialog"] h2'), "Оплата от ученика");
  const text = plain(await page.textContent('[role="dialog"]'));
  assert.match(text, /Тошматов Бобур · Алгебра 7 \(вт\/пт\) · деньги поступают в центр/);
  assert.match(plain(await page.textContent('[data-testid="payment-debt-now"]')), /^Долг сейчас: 1 200 000 сум$/);
  assert.deepEqual((await page.locator('[data-testid="payment-chips"] button').allTextContents()).map(plain), ["Погасить долг · 800 000 сум", "Долг + ноябрь · 1 200 000 сум"]);
  assert.equal(plain(await page.textContent('button[form="payment-form"]')), "Внести 400 000 сум");
  await page.close();
});

test("the block «Что изменится» is a table about the student: the name on the left, the number on the right; and NO salary anywhere in the window - for any role", async () => {
  for (const user of [undefined, { role: "admin", org_role: "admin", payments_access: true }]) {
    const { page, calls } = await open(1280, STAGE_EFFECTS, user);
    await page.waitForSelector('[data-testid="payment-plan-rows"]');
    await page.waitForTimeout(400);
    const block = page.locator('[data-testid="payment-calc"]');
    assert.match(plain(await block.locator("h3").textContent()), /^Что изменится$/);
    const rows = (await rowTexts(block.locator('[data-testid="payment-plan-rows"] li'))).map(plain);
    assert.deepEqual(rows, ["Погасит долг за сентябрь 400 000 сум", "Останется долг 800 000 сум", "из них за прошлые месяцы 400 000 сум"]);
    // the number is on the right of its row, the name on the left
    const geometry = await page.evaluate(() => [...document.querySelectorAll('[data-testid="payment-plan-rows"] li')].map((li) => { const [name, number] = li.children; const a = name.getBoundingClientRect(); const b = number.getBoundingClientRect(); return { numberRight: b.left > a.left, aligned: Math.abs(li.getBoundingClientRect().right - b.right) < 2 }; }));
    assert.ok(geometry.every((item) => item.numberRight && item.aligned), JSON.stringify(geometry));
    // the owner's decision of 05.11: nothing about the pay of the teachers - no line, no «Подробнее», no amber sentence about a closed month
    const dialog = plain(await page.textContent('[role="dialog"]'));
    assert.ok(!/зарплат|Эргашев|Мирзаев|Подробнее|закрыт|преподавател/i.test(dialog), dialog);
    assert.equal(await page.locator('[data-testid="payroll-consequence"], [data-testid="money-effects"], [data-testid="till-effects-notice"]').count(), 0);
    const amber = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] *')].filter((el) => /bg-amber|border-amber/.test(String(el.getAttribute("class") ?? ""))).length);
    assert.equal(amber, 0, "nothing amber in the window");
    // and no request for the numbers of the pay (the window does not use them)
    assert.deepEqual(calls.filter((call) => call.method === "POST" && /dry_run=true/.test(call.query)), []);
    await page.close();
  }
});

test("the payment is not held by anything but the form: the button is on as soon as the method is chosen; off, it says why (the method is missing)", async () => {
  const { page } = await openPage(browser, "money.entry.tsx", server(STAGE_EFFECTS), { width: 1280, height: 900 }).then(async (run) => {
    await run.page.evaluate(([u, membership]) => window.mount("till", u, { membership }), [undefined, TOSHMATOV]);
    for (let waited = 0; !run.calls.some((call) => call.path.endsWith("/payments/preview")) && waited < 5000; waited += 25) await run.page.waitForTimeout(25);
    await run.page.fill("#payment-amount", "400000");
    return run;
  });
  assert.equal(await page.isDisabled('button[form="payment-form"]'), true);
  assert.equal(plain(await page.textContent('[data-testid="payment-blocker"]')), "Выберите способ оплаты");
  await page.click('[data-testid="payment-methods"] >> text=Наличные');
  assert.equal(await page.isDisabled('button[form="payment-form"]'), false);
  assert.equal(await page.locator('[data-testid="payment-blocker"]').count(), 0);
  await page.close();
});

test("while the plan of the student is counted: grey rows of the same size", async () => {
  const hold = deferred();
  const run = await openPage(browser, "money.entry.tsx", async (request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m1/payments/preview") { if (/amount=/.test(request.query)) await hold.promise; return { json: toshmatovPreview(Number(/amount=(\d+)/.exec(request.query)?.[1]) || null) }; }
    return null;
  }, { width: 1280, height: 900 });
  await run.page.evaluate(([u, membership]) => window.mount("till", u, { membership }), [undefined, TOSHMATOV]);
  for (let waited = 0; !run.calls.some((call) => call.path.endsWith("/payments/preview")) && waited < 5000; waited += 25) await run.page.waitForTimeout(25);
  await run.page.fill("#payment-amount", "400000");
  await run.page.waitForSelector('[data-testid="payment-plan-skeleton"]');
  hold.open();
  await run.page.waitForSelector('[data-testid="payment-plan-rows"]');
  await run.page.close();
});

for (const width of [1280, 1024, 375]) {
  test(`${width}: nothing leaves its box, no horizontal scroll, the buttons are at least 40 px high on a phone`, async () => {
    const { page } = await open(width);
    await page.waitForSelector('[data-testid="payment-plan-rows"]');
    const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    if (width === 375) {
      const heights = await page.evaluate(() => ["confirm-cancel"].map((id) => document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect().height));
      assert.ok(heights.every((h) => h >= 40), heights.join(","));
    }
    await page.close();
  });
}
