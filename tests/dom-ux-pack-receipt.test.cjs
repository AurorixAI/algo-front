// UX pack №14 in a real browser: the RECEIPT (the parent reads it).  «Оплачено до 30.09.2026», «Погашен долг за 01.09–30.09 · 400 000 сум» (the label is the server's), «Останется неоплаченным после оплаты: 800 000 сум»;
// no «Цена периода», no «Покрытие»; the ID of the student stays on one line.  The CSS is the project's tailwind.
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
const RECEIPT = { receipt_no: 21, org_name: "ALGO Math Center", org_city: "Ташкент", org_phone: "+998901234567", student_name: "Тошматов Бобур", display_id: "N13-0042-AL", group_name: "Алгебра 7 (вт/пт)", amount: 400000, amount_words: "Четыреста тысяч сум",
  currency: "UZS", paid_on: "2026-11-05", valid_from: "2026-09-01", valid_to: "2026-09-30", lessons_count: null, partial_period: false, method: "cash", mode: "calendar",
  allocations: [{ segment_id: "seg:09", period_from: "2026-09-01", period_to: "2026-09-30", amount: 400000, days: 30, bucket: "past_debt", closes: true, label: "Погашен долг за 01.09–30.09", price: 400000, segment_remaining_after: 0 }],
  debt_before: 1200000, debt_after: 800000, advance_after: 0, paid_until_before: "2026-08-31", paid_until_after: "2026-09-30", price_snapshot: { amount: 400000, source: "group" }, note: null, accepted_by_name: "Арслан", created_at: "2026-11-05T09:12:00",
  voided_at: null, void_reason: null, replaced_by_receipt_no: null, replaces_receipt_no: null, replaces_amount: null, state_on_issue: { as_of: "2026-11-07", debt: 800000, advance: 0, paid_until: "2026-09-30" } };
async function open(width, extra = { receipt_state_text: "оплачено до 30.09" }) {
  const run = await openPage(browser, "money.entry.tsx", () => null, { width, height: 900 });
  await run.page.evaluate((receipt) => window.mount("receipt", undefined, { receipt }), { ...RECEIPT, ...extra });
  await run.page.waitForSelector('[aria-label^="Квитанция"]');
  return run;
}

test("№14: «оплачено до 30.09» (the server's line), the allocation with the label of the server and the sum, «Останется неоплаченным после оплаты: 800 000 сум»; no «Цена периода» and no «Покрытие»", async () => {
  const { page } = await open(1280);
  const text = plain(await page.locator('[aria-label^="Квитанция"]').innerText());
  // PAY-TAILS Б1.5: the line about the state is the server's `receipt_state_text` (the screen no longer composes «Оплачено до» from two dates)
  assert.match(text, /Состояние\s*оплачено до 30\.09\s*на день выдачи, 07\.11\.2026/);
  assert.ok(!/Состояние на/.test(text), "the label is short: the day is in the quiet line under the phrase");
  assert.ok(!/Оплачено до\s*30\.09\.2026/.test(text), text);
  assert.match(text, /Погашен долг за 01\.09–30\.09\s*400\s000\sсум/);
  assert.match(text, /Куда пошли деньги · на день оплаты 05\.11\.2026/);
  assert.match(text, /Было не оплачено 1\s200\s000\sсум, после оплаты осталось 800\s000\sсум/);
  assert.ok(!/Останется неоплаченным|Было не оплачено:/.test(text), "the total is ONE past-tense line, not two");
  assert.ok(!/по этому периоду осталось/.test(text), "one allocation line: the sub-line would repeat the total");
  assert.ok(!/Цена периода|Покрытие|Баланс|Закрыла долг/.test(text), text);
  await page.close();
});

test("PAY-TAILS Б9.6: «по этому периоду осталось …» only when there is more than one allocation line; the label «Состояние» stays on ONE line at 375", async () => {
  const two = [
    { segment_id: "seg:10", period_from: "2026-10-01", period_to: "2026-10-31", amount: 200000, days: 31, bucket: "past_debt", closes: false, label: "Погашен долг за 01.10–31.10", price: 400000, segment_remaining_after: 200000 },
    { segment_id: "seg:11", period_from: "2026-11-01", period_to: "2026-11-30", amount: 200000, days: 30, bucket: "current", closes: false, label: "На текущий период 01.11–30.11", price: 400000, segment_remaining_after: 200000 },
  ];
  const run = await open(375, { allocations: two, amount: 400000, receipt_state_text: "оплачено до 30.09" });
  const text = plain(await run.page.locator('[aria-label^="Квитанция"]').innerText());
  assert.equal((text.match(/по этому периоду осталось 200 000 сум/g) || []).length, 2, text);
  const lines = await run.page.evaluate(() => { const dt = [...document.querySelectorAll("dt")].find((n) => n.textContent.trim() === "Состояние"); const range = document.createRange(); range.selectNodeContents(dt); return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size; });
  assert.equal(lines, 1, "the label is one line");
  await run.page.close();
});

test("№14: the ID of the student is on ONE line (it never breaks at a hyphen)", async () => {
  const { page } = await open(375);
  const facts = await page.evaluate(() => { const el = [...document.querySelectorAll("span")].find((node) => /^ID N13-0042-AL$/.test(node.textContent.trim())); const r = el.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(el).lineHeight) || 16; return { height: Math.round(r.height), lineHeight: Math.round(lh), nowrap: getComputedStyle(el).whiteSpace }; });
  assert.equal(facts.nowrap, "nowrap");
  assert.ok(facts.height <= facts.lineHeight + 2, JSON.stringify(facts));
  await page.close();
});

for (const width of [1280, 1024, 375]) {
  test(`${width}: nothing leaves its box, no horizontal scroll`, async () => {
    const { page } = await open(width);
    const facts = await page.evaluate(layoutProbe, "body");
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    await page.close();
  });
}

test("PAY-TAILS Б1.5: a partial payment, a closed membership and a forgiven period - the server's line as it is, or none: the screen makes up no «оплачено до»", async () => {
  const partial = await open(1280, { receipt_state_text: "оплачено 100 000 из 420 000 сум · к оплате 320 000 сум до 23.11" });
  assert.match(plain(await partial.page.locator('[aria-label^="Квитанция"]').innerText()), /Состояние\s*оплачено 100 000 из 420 000 сум · к оплате 320 000 сум до 23\.11/);
  await partial.page.close();
  const none = await open(1280, { receipt_state_text: null });
  const text = plain(await none.page.locator('[aria-label^="Квитанция"]').innerText());
  assert.ok(!/Состояние|на день выдачи|Оплачено до|оплачено до/.test(text), text);
  assert.equal(await none.page.locator('[data-testid="receipt-state-text"]').count(), 0);
  await none.page.close();
  const narrow = await open(375, { receipt_state_text: "оплачено 100 000 из 420 000 сум · к оплате 320 000 сум до 23.11" });
  const facts = await narrow.page.evaluate(layoutProbe, '[aria-label^="Квитанция"]');
  assert.equal(facts.scroll, 0);
  assert.deepEqual(facts.bad, []);
  await narrow.page.close();
});
