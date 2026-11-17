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

const ROWS = [
  X.ROW({ membership_id: "a", student_id: "sa", student_name: "Алиев Тимур", debt: 300000, days_overdue: 12, reason: "Просрочено на 12 дней", debt_age_days: 12, debt_age_bucket: "to_30", tab: "debtors" }),
  X.ROW({ membership_id: "b", student_id: "sb", student_name: "Бекова Лола", debt: 450000, days_overdue: null, reason: null, debt_age_days: 62, debt_age_bucket: "61_90", tab: "debtors" }),
  X.ROW({ membership_id: "c", student_id: "sc", student_name: "Рашидов Азиз", debt: 600000, days_overdue: 100, reason: "Просрочено на 100 дней", debt_age_days: 100, debt_age_bucket: "over_90", tab: "debtors" }),
  X.ROW({ membership_id: "d", student_id: "sd", student_name: "Саидова Нилуфар", debt: 150000, days_overdue: 20, reason: "Просрочено на 20 дней", debt_age_days: 20, debt_age_bucket: "to_30", tab: "debtors" }),
];
const AGES = [
  { bucket: "to_30", students: 2, memberships: 2, debt_total: 450000 },
  { bucket: "31_60", students: 0, memberships: 0, debt_total: 0 },
  { bucket: "61_90", students: 1, memberships: 1, debt_total: 450000 },
  { bucket: "over_90", students: 1, memberships: 1, debt_total: 600000 },
];
const SUMMARY = { ...X.SUMMARY, debt_split: { ...X.SPLIT, debtors: 4, debtors_memberships: 4, debtors_debt_total: 1500000 }, debt_ages: AGES };
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
  await run.page.evaluate(() => window.mount("payments", { role: "owner", org_role: "owner" }, { refresh: true, search: "bucket=debt" }));
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

test("Э8: «долг N дней» on a row only where the reason line does not already say these days", async () => {
  const run = await open(1280);
  const ages = await run.page.locator('[data-testid="debt-age"]').allTextContents();
  // fix 5: the days stand on the line of the sum - «Долг … · 62 дня» (the word «долг» once)
  assert.deepEqual(ages.map(plain), ["· 62 дня"]);
  assert.equal((plain(await run.page.locator('[data-testid="debt-age"]').locator("..").textContent()).match(/олг/g) ?? []).length, 1);
  const body = plain(await run.page.textContent('[data-testid="payments-table"]'));
  assert.equal((body.match(/12 дней/g) ?? []).length, 1, "12 days once");
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
  assert.match(src, /state\.bucket === "debt" && state\.age/);
});

test("fix5: the status of a debtor with an age - the chip and ONE line «Долг … · N дней» (1280 and 375)", async () => {
  for (const width of [1280, 375]) {
    const run = await open(width);
    const cell = run.page.locator('[data-testid="status-cell"]', { has: run.page.locator('[data-testid="debt-age"]') });
    assert.equal(await cell.count(), 1);
    const lines = await cell.evaluate((el) => [...el.querySelectorAll("p")].map((p) => p.textContent.replace(/[\s ]+/g, " ").trim()));
    assert.equal(lines.length, 2, JSON.stringify(lines));   // the chip (a status) + ONE line
    assert.match(lines[1], /^Долг [\d ]+ сум · 62 дня$/);
    assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
    await run.page.close();
  }
});
