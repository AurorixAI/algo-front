// PAY-DUE, screens part 2 (14Б.7 / 14Б.8, frames 11-14 and 21 of the layout) in a real browser (headless Chromium, the CSS of the project): the STATEMENT - the summary (what the student owes, in the server's words,
// one state or two side by side), the column «Остаток» (what is open on the row itself: a red «Долг», a calm blue «К оплате», a quiet «Оплачено», a green «Аванс»), the red line «Не сходится» only at a mismatch -
// and the window «Внести оплату» (both sums on top, the field takes `suggested_amount`, the server's sentence under it BEFORE the button).  The words are the server's (tests/helpers/paydue-statement.cjs); the
// screen shows them as they are (143).  Layout probe on 1280 / 1024 / 375 with long names (136).  PNGs of the frames: node tests/dom/paydue-part2-shots.cjs <out dir>.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const S = require("./helpers/paydue-statement.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => (text ?? "").replace(/[\s ]+/g, " ").trim();
const OWNER = { role: "owner", org_role: "owner" };
const LONG_NAME = "Мухаммаджонова Фарангиз Абдурахмоновна-Каримова";
const LONG_GROUP = "Подготовка к олимпиаде по математике, 7 класс (углублённый курс)";
const RED = "rgb(190, 18, 60)";

async function openStatement(width, statement, height = 900) {
  const run = await openPage(browser, "money2.entry.tsx", (request) => (request.method === "GET" && request.path === "/auth/org/memberships/m-a/statement" ? { json: statement } : null), { width, height });
  await run.page.evaluate((user) => window.mount("statement", user, { moneyAvailable: true }), OWNER);
  await run.page.waitForSelector('[data-testid="statement-summary"]');
  return run;
}
async function openWindow(width, preview, height = 900) {
  const run = await openPage(browser, "money.entry.tsx", (request) => (request.method === "GET" && request.path === "/auth/org/memberships/m1/payments/preview" ? { json: preview(Number(/amount=(\d+)/.exec(request.query)?.[1]) || null) } : null), { width, height });
  await run.page.evaluate(([user, membership]) => window.mount("till", user, { membership }), [OWNER, { membership_id: "m1", group_id: "g1", student_name: "Анвар Каримов", group_name: "Математика 7 Пн-Ср-Пт" }]);
  for (let waited = 0; !run.calls.some((call) => call.path.endsWith("/payments/preview")) && waited < 5000; waited += 25) await run.page.waitForTimeout(25);
  await run.page.waitForSelector('[data-testid="payment-due"]');
  return run;
}
async function probe(page, selector, label) {
  const result = await page.evaluate(layoutProbe, selector);
  assert.deepEqual(result.bad, [], `${label}: ${result.bad.join(" | ")}`);
  assert.ok(result.scroll <= 0, `${label}: the page scrolls sideways by ${result.scroll}`);
}
const textOf = async (page, testid) => plain(await page.locator(`[data-testid="${testid}"]`).first().innerText());
const colourOf = (page, selector) => page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).color, selector);

test("frame 12: the term has passed - «Долг 600 000» in red with «просрочено 14 дней» under it; «Остаток» of the row is the red chip «Долг 600 000»; nothing else says «долг» twice", async () => {
  const { page } = await openStatement(1280, S.lolaDebt());
  assert.equal(await textOf(page, "statement-state-debt"), "Долг 600 000 сум просрочено 14 дней");
  assert.equal(await page.locator('[data-testid="statement-state-due"]').count(), 0);
  assert.equal(await colourOf(page, '[data-testid="statement-state-debt"] p'), RED);
  const summary = plain(await page.locator('[data-testid="statement-summary"]').innerText());
  assert.ok(summary.startsWith("Стоимость обучения 600 000 сум Оплачено 0 сум"), summary);
  assert.ok(!summary.includes("Остаток") && !summary.includes("Не сходится"), summary);
  assert.equal(await page.getAttribute('[data-testid="statement-summary"]', "data-reconciles"), "true");
  assert.equal(await textOf(page, "statement-cell-balance"), "Долг 600 000");
  assert.equal(await page.locator('[data-testid="statement-open-chip"]').count(), 1);
  await page.close();
});

test("frame 13: a debt and «К оплате» of one student - TWO states side by side, the debt first; two chips in «Остаток» in their own tones; the three sums equal the summary", async () => {
  const { page } = await openStatement(1280, S.timurTwo());
  await page.getByRole("button", { name: "Все месяцы" }).click(); // as in the layout: both months at once
  await page.waitForSelector('[data-testid="statement-open-chip"] >> nth=1');
  assert.deepEqual(await page.locator('[data-testid="statement-state"] > div').evaluateAll((items) => items.map((item) => item.getAttribute("data-testid"))), ["statement-state-debt", "statement-state-due"]);
  assert.equal(await textOf(page, "statement-state-debt"), "Долг 600 000 сум просрочено 45 дней");
  assert.equal(await textOf(page, "statement-state-due"), "К оплате 231 000 сум до 24.11");
  assert.equal(await colourOf(page, '[data-testid="statement-state-debt"] p'), RED);
  assert.notEqual(await colourOf(page, '[data-testid="statement-state-due"] p'), RED, "«К оплате» is not red");
  assert.deepEqual((await page.locator('[data-testid="statement-cell-balance"]').allInnerTexts()).map(plain), ["Долг 600 000", "К оплате 231 000"]);
  const chips = await page.locator('[data-testid="statement-open-chip"]').evaluateAll((items) => items.map((item) => [item.textContent, getComputedStyle(item).backgroundColor]));
  assert.notEqual(chips[0][1], chips[1][1], "the debt and «К оплате» have different looks");
  assert.equal(chips[1][1], "rgb(219, 234, 254)", "«К оплате» is the calm blue of the tone map");
  assert.equal(await page.getAttribute('[data-testid="statement-summary"]', "data-reconciles"), "true");
  await page.close();
});

test("frame 14 (right): paid - «Оплачено до 30.11» in green; the charge row says a quiet word «Оплачено» (not a chip), the payment row is empty; no «Остаток» in the summary", async () => {
  const { page } = await openStatement(1280, S.anvarPaid());
  assert.equal(await textOf(page, "statement-state-state"), "Оплачено до 30.11");
  assert.equal(await page.locator('[data-testid="statement-open-chip"]').count(), 0);
  assert.equal(await textOf(page, "statement-open-paid"), "Оплачено");
  assert.deepEqual((await page.locator('[data-testid="statement-cell-balance"]').allInnerTexts()).map(plain), ["Оплачено", ""]);
  assert.equal(await page.getAttribute('[data-testid="statement-summary"]', "data-reconciles"), "true");
  await page.close();
});

test("frame 11: the term runs - «К оплате 231 000 сум» with «до 24.11» (the server's words), the row's chip is the blue «К оплате 231 000»", async () => {
  const { page } = await openStatement(1280, S.anvarDue());
  assert.equal(await textOf(page, "statement-state-due"), "К оплате 231 000 сум до 24.11");
  assert.equal(await textOf(page, "statement-cell-balance"), "К оплате 231 000");
  assert.equal(await page.locator('[data-testid="statement-state-debt"]').count(), 0);
  await page.close();
});

test("13.2: the payment that brought money not yet spread on a charge shows «Аванс 200 000 сум» (green) and the summary says the same; the equalities hold", async () => {
  const { page } = await openStatement(1280, S.withAdvance());
  assert.equal(await textOf(page, "statement-state-state"), "Аванс 200 000 сум");
  assert.deepEqual((await page.locator('[data-testid="statement-cell-balance"]').allInnerTexts()).map(plain), ["Оплачено", "Аванс 200 000 сум"]);
  assert.equal(await page.getAttribute('[data-testid="statement-summary"]', "data-reconciles"), "true");
  await page.close();
});

test("a mismatch - the rows say 231 000 «К оплате», the summary 200 000: the red line «Не сходится» shows (the identity of the summary holds, the sums of the rows do not)", async () => {
  const { page } = await openStatement(1280, S.broken());
  assert.equal(await page.getAttribute('[data-testid="statement-summary"]', "data-reconciles"), "false");
  assert.ok((await textOf(page, "statement-reconciles")).includes("Не сходится"));
  await page.close();
});

test("frame 21 and the layout probe (375 / 1024 / 1280, long names): the states stand under the sums on a phone, nothing leaves its box, no sideways scroll", async () => {
  for (const [width, height] of [[1280, 900], [1024, 800], [375, 812]]) {
    for (const statement of [S.timurTwo(LONG_NAME, LONG_GROUP), S.lolaDebt(LONG_NAME, LONG_GROUP), S.withAdvance(LONG_NAME, LONG_GROUP)]) {
      const { page } = await openStatement(width, statement, height);
      await probe(page, "body", `statement ${width}`);
      await page.close();
    }
  }
  const { page } = await openStatement(375, S.timurTwo(), 812);
  const box = await page.evaluate(() => { const summary = document.querySelector('[data-testid="statement-summary"]').getBoundingClientRect(); const state = document.querySelector('[data-testid="statement-state"]').getBoundingClientRect(); const left = document.querySelector('[data-testid="statement-summary"] dl').getBoundingClientRect(); return { stateBelow: state.top >= left.bottom - 1, inside: state.left >= summary.left && state.right <= summary.right }; });
  assert.deepEqual(box, { stateBelow: true, inside: true });
  await page.close();
});

test("frame 14 (left): the window «Внести оплату» - «К оплате 231 000 сум» + «до 24.11» on top, the field is filled with the server's `suggested_amount`, the sentence of the server under it; no chips of quick amounts", async () => {
  const { page } = await openWindow(1280, S.anvarPreview);
  assert.equal(await page.textContent('[role="dialog"] h2'), "Внести оплату");
  assert.equal(plain(await page.locator('[data-testid="payment-due-due"]').innerText()), "К оплате 231 000 сум до 24.11");
  await page.waitForFunction(() => document.querySelector("#payment-amount")?.value.replace(/\s/g, "") === "231000");
  await page.click('[data-testid="payment-methods"] >> text=Наличные');
  await page.waitForSelector('[data-testid="payment-plan-sentence"]');
  assert.equal(plain(await page.locator('[data-testid="payment-plan-sentence"]').innerText()), "Закроет «К оплате» 231 000 сум");
  assert.equal(await page.locator('[data-testid="payment-chips"]').count(), 0);
  assert.equal(plain(await page.textContent('button[form="payment-form"]')), "Внести 231 000 сум");
  await page.close();
});

test("10.10: a debt and «К оплате» - both on top (the debt first), and a smaller amount says BEFORE the button which sum it closes first (the server's sentence; the screen counts nothing)", async () => {
  const { page } = await openWindow(1280, S.timurPreview);
  assert.deepEqual(await page.locator('[data-testid="payment-due"] p').evaluateAll((items) => items.map((item) => item.getAttribute("data-testid"))), ["payment-due-debt", "payment-due-due"]);
  assert.equal(plain(await page.locator('[data-testid="payment-due-debt"]').innerText()), "Долг 600 000 сум просрочено 45 дней");
  await page.waitForFunction(() => document.querySelector("#payment-amount")?.value.replace(/\s/g, "") === "831000");
  await page.fill("#payment-amount", "400000");
  await page.waitForFunction(() => document.querySelector('[data-testid="payment-plan-sentence"]')?.textContent.includes("Погасит долг 400"));
  assert.equal(plain(await page.locator('[data-testid="payment-plan-sentence"]').innerText()), "Погасит долг 400 000 сум");
  await page.fill("#payment-amount", "700000");
  await page.waitForFunction(() => document.querySelector('[data-testid="payment-plan-sentence"]')?.textContent.includes("к оплате"));
  assert.equal(plain(await page.locator('[data-testid="payment-plan-sentence"]').innerText()), "Погасит долг 600 000 сум · к оплате 100 000 сум");
  await page.close();
});

test("the window on 375 / 1024: nothing leaves its box, no sideways scroll, the buttons are at least 40 px high on a phone", async () => {
  for (const [width, height] of [[1280, 900], [1024, 800], [375, 812]]) {
    const { page } = await openWindow(width, S.timurPreview, height);
    await page.click('[data-testid="payment-methods"] >> text=Наличные');
    await page.waitForSelector('[data-testid="payment-plan-sentence"]');
    await probe(page, '[role="dialog"]', `window ${width}`);
    if (width === 375) {
      const heights = await page.evaluate(() => ["confirm-cancel"].map((id) => document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect().height));
      assert.ok(heights.every((h) => h >= 40), heights.join(","));
    }
    await page.close();
  }
});
