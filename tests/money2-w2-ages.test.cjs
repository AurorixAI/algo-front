// Money-2 wave 2, Э8 (Т18): «Должники» by the age of the debt - four baskets of `debt_ages[]` (students and the sum of each) are the FILTER of the list (`age=`); a row says «долг N дней» from `debt_age_days`
// unless its reason line already says these days; on a phone the baskets are ONE scrollable row, no text cut.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const X = require("./helpers/money-b-fixture.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });
const plain = (text) => String(text ?? "").replace(/[\s ]+/g, " ").trim();

// PAY-DUE: the days of the overdue are the server's words in the line under the label (`debt_sub`); the age filter is by `overdue_days`
const debtRow = (id, name, amount, days, bucket) => X.ROW({ membership_id: id, student_id: `s${id}`, student_name: name, debt: amount, debt_amount: amount, overdue_days: days, debt_age_bucket: bucket, state: "debt", state_text: `Долг ${amount} сум`, debt_text: `Долг ${amount} сум`, debt_sub: `просрочено ${days} дней` });
const ROWS = [
  debtRow("a", "Алиев Тимур", 300000, 12, "to_30"),
  debtRow("b", "Бекова Лола", 450000, 62, "61_90"),
  debtRow("c", "Рашидов Азиз", 600000, 100, "over_90"),
  debtRow("d", "Саидова Нилуфар", 150000, 20, "to_30"),
];
const AGES = [
  { bucket: "to_30", students: 2, memberships: 2, debt_total: 450000 },
  { bucket: "31_60", students: 0, memberships: 0, debt_total: 0 },
  { bucket: "61_90", students: 1, memberships: 1, debt_total: 450000 },
  { bucket: "over_90", students: 1, memberships: 1, debt_total: 600000 },
];
const SUMMARY = { ...X.SUMMARY, debtors: 4, debt_total: 1500000, buckets: { ...X.SUMMARY.buckets, debtors: 4 }, debt_ages: AGES };
const server = (request) => {
  if (request.path === "/auth/org/payments/summary") return { json: SUMMARY };
  if (request.path === "/auth/org/payments/status") {
    const age = /(?:^|&)age=([a-z0-9_]+)/.exec(request.query)?.[1];
    const items = age ? ROWS.filter((row) => row.debt_age_bucket === age) : ROWS;
    return { json: { items, total: items.length, limit: 50, offset: 0 } };
  }
  if (request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "7-А Алгебра", teacher_id: "t1" }] };
  return null;
};
async function open(width) {
  const run = await openPage(browser, "money-b.entry.tsx", server, { width, height: width === 375 ? 800 : 900 });
  await run.page.evaluate(() => window.mount("payments", { role: "owner", org_role: "owner" }, { refresh: true, search: "bucket=debtors" }));
  await run.page.waitForSelector('[data-testid="debt-ages"]');
  await run.page.waitForSelector('[data-testid="payments-table"] [data-testid="status-cell"]');
  return run;
}
const chips = (page) => page.locator('[data-testid="debt-ages"] button').evaluateAll((list) => list.map((b) => b.innerText.replace(/[\s ]+/g, " ").trim()));
const statusCalls = (run) => run.calls.filter((call) => call.path === "/auth/org/payments/status");

test("Э8: «Все» and four baskets with the students and the sum of each; an empty basket says «нет»", async () => {
  const run = await open(1280);
  assert.deepEqual(await chips(run.page), ["Все 4 уч.", "До 30 дней 2 уч. · 450 000 сум", "31–60 дней нет", "61–90 дней 1 уч. · 450 000 сум", "Старше 90 дней 1 уч. · 600 000 сум"]);
  await run.page.close();
});

test("Э8: a basket is a filter - the list is asked with `age=`, only its rows stay; a second press shows all", async () => {
  const run = await open(1280);
  await run.page.click('[data-testid="debt-age-61_90"]');
  await run.page.waitForFunction(() => document.querySelectorAll('[data-testid="payments-table"] [data-testid="status-cell"]').length === 1);
  assert.ok(statusCalls(run).some((call) => /(?:^|&)age=61_90(&|$)/.test(call.query)), JSON.stringify(statusCalls(run).map((call) => call.query)));
  assert.equal(await run.page.locator('[data-testid="debt-age-61_90"]').getAttribute("aria-pressed"), "true");
  assert.match(plain(await run.page.textContent('[data-testid="payments-table"]')), /Бекова Лола/);
  await run.page.click('[data-testid="debt-age-61_90"]');
  await run.page.waitForFunction(() => document.querySelectorAll('[data-testid="payments-table"] [data-testid="status-cell"]').length === 4);
  await run.page.close();
});

test("Э8 → PAY-DUE: the days of the overdue stand on a row ONCE, in the server's line under the label - no second «долг N дней» line, no sum repeated", async () => {
  const run = await open(1280);
  assert.equal(await run.page.locator('[data-testid="debt-age"]').count(), 0, "the old line of the age is gone");
  const subs = (await run.page.locator('[data-testid="pay-sub"]').allTextContents()).map(plain);
  assert.deepEqual(subs, ["просрочено 12 дней", "просрочено 62 дней", "просрочено 100 дней", "просрочено 20 дней"]);
  const body = plain(await run.page.textContent('[data-testid="payments-table"]'));
  assert.equal((body.match(/12 дней/g) ?? []).length, 1, "12 days once");
  assert.equal((body.match(/Долг 300000 сум/g) ?? []).length, 1, "the sum of a row once (no second balance line)");
  await run.page.close();
});

test("Э8 (375): the baskets are ONE scrollable row, every chip whole; the page has no horizontal scroll", async () => {
  const run = await open(375);
  const facts = await run.page.evaluate(() => {
    const strip = document.querySelector('[data-testid="debt-ages"]');
    const buttons = [...strip.querySelectorAll("button")];
    const tops = new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top)));
    return { rows: tops.size, cut: buttons.filter((b) => [...b.querySelectorAll("span")].some((s) => s.scrollWidth > s.clientWidth + 1)).length, page: document.documentElement.scrollWidth > window.innerWidth + 1, scrolls: strip.scrollWidth > strip.clientWidth };
  });
  assert.equal(facts.rows, 1, "one row");
  assert.equal(facts.cut, 0, "no cut text");
  assert.equal(facts.page, false);
  assert.equal(facts.scrolls, true, "it scrolls sideways");
  await run.page.close();
});

test("Э8: the filter lives in the address (`age=`) only on «Должники»", () => {
  const src = fs.readFileSync(path.join(root, "src/lib/payments.ts"), "utf8");
  assert.match(src, /state\.bucket === "debtors" && state\.age/);
});

test("fix5 → PAY-DUE: the status of a debtor - the label and ONE line under it (the server's days), at 1280 and 375", async () => {
  for (const width of [1280, 375]) {
    const run = await open(width);
    const cell = run.page.locator('[data-testid="status-cell"]').nth(1);
    const lines = await cell.evaluate((el) => [...el.querySelectorAll("p")].map((p) => p.textContent.replace(/[\s\u00A0\u202F]+/g, " ").trim()));
    assert.deepEqual(lines, ["просрочено 62 дней"], "the label is a chip, under it ONE line");
    assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
    await run.page.close();
  }
});
