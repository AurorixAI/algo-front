// UX pack №14 in a real browser: the RECEIPT (the parent reads it).  «Оплачено до 30.09.2026», «Погашен долг за 01.09–30.09 · 400 000 сум» (the label is the server's), «Остаток долга после оплаты: 800 000 сум»;
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
  voided_at: null, void_reason: null, replaced_by_receipt_no: null, replaces_receipt_no: null, replaces_amount: null };
async function open(width) {
  const run = await openPage(browser, "money.entry.tsx", () => null, { width, height: 900 });
  await run.page.evaluate((receipt) => window.mount("receipt", undefined, { receipt }), RECEIPT);
  await run.page.waitForSelector('[aria-label^="Квитанция"]');
  return run;
}

test("№14: «Оплачено до 30.09.2026», the allocation with the label of the server and the sum, «Остаток долга после оплаты: 800 000 сум»; no «Цена периода» and no «Покрытие»", async () => {
  const { page } = await open(1280);
  const text = plain(await page.locator('[aria-label^="Квитанция"]').innerText());
  assert.match(text, /Оплачено до\s*30\.09\.2026/);
  assert.match(text, /Погашен долг за 01\.09–30\.09\s*400\s000\sсум/);
  assert.match(text, /Остаток долга после оплаты: 800\s000\sсум/);
  assert.match(text, /Долг до оплаты: 1\s200\s000\sсум/);
  assert.ok(!/Цена периода|Покрытие|Баланс|Закрыла долг/.test(text), text);
  await page.close();
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
