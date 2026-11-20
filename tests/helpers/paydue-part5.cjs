// PAY-DUE part 5: the fixture and the measure of the sums of the cards of money (shared by tests/dom-paydue-part5.test.cjs and tests/dom/paydue-part5-shots.cjs).
const fs = require("node:fs");
const path = require("node:path");
const X = require("./paydue-fixture.cjs");
const root = path.join(__dirname, "..", "..");

const OVERVIEW = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "income2", "I01_income_month_october.json"), "utf8"));
const JOURNAL = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "income2", "J01_journal_page1.json"), "utf8"));
const BIG = { debt: 24850000, due: 16767000, advance: 6917333 };
const SUMMARY = { ...X.SUMMARY, debt_total: BIG.debt, due_total: BIG.due, advance_total: BIG.advance, debtors: 41, due_students: 108, students_with_advance: 9 };
const overview = () => {
  const o = JSON.parse(JSON.stringify(OVERVIEW));
  o.current.received = 98765432; o.current.net_received = 98765432;
  o.position = { ...o.position, debt_total: BIG.debt, advance_total: BIG.advance, debt_text: "Долг 24 850 000 сум" };
  o.collection.total = { ...o.collection.total, charged: 24850000, paid: 16767000, debt: 8083000 };
  o.collection.text = "Оплачено 16 767 000 из 24 850 000 сум (67%)";
  return o;
};
const answer = (request) => {
  if (request.path === "/auth/org/payments/summary") return { json: SUMMARY };
  if (request.path === "/auth/org/payments/status") return { json: X.statusPage(request.query) };
  if (request.path === "/auth/org/payments/income") return { json: overview() };
  if (request.path === "/auth/org/payments/journal") return { json: JOURNAL };
  if (request.path === "/auth/org/settings/payments") return { json: X.SETTINGS };
  if (request.path === "/auth/org/stats") return { json: { total_students: 149, total_groups: 12, total_members: 6, active_diagnostics: 0, completed_diagnostics: 0, new_students: 1 } };
  if (request.path === "/auth/org/groups-overview") return { json: { groups: [], avg_theta: null } };
  return null;
};

const PAGES = [
  { name: "payments", ready: '[data-testid="payments-position"], [data-testid="payments-position-compact"]', cards: '[data-testid="payments-position"] > div', sums: '[data-testid="payments-position"] > div a > p:nth-of-type(2), [data-testid="payments-position-compact"] span.font-bold' },
  { name: "income", ready: '[data-testid="income-cards"]', cards: '[data-testid^="card-"]', sums: '[data-testid^="card-"] > p:nth-of-type(2)' },
  { name: "dashboard", ready: '[data-testid="dashboard-tile-money"]', cards: '[data-testid="dashboard-tile-money"] > a', sums: '[data-testid="dashboard-tile-money"] > a p:first-child' },
];
const SETUPS = [[1440, 240], [1440, 68], [1280, 240], [1280, 68], [1024, 240], [1024, 68], [900, 240], [768, 240], [768, 68], [640, 0], [375, 0]];

/** Measures every sum of `page` mounted in the frame of the product (the sidebar `sidebar` px wide) in `run` (a page of dom-page.cjs); the headless font is ~12 % narrower than Inter, so the text width is counted with that margin. */
async function measure(run, page, sidebar) {
  await run.page.evaluate(([n, p]) => window.mount(n, { role: "owner", org_role: "owner" }, p), [page.name, { sidebar }]);
  await run.page.waitForSelector(page.ready, { state: "attached", timeout: 8000 }).catch(() => {});
  await run.page.waitForTimeout(700);
  const rows = await run.page.evaluate(([cards, sums]) => {
    const res = [];
    for (const el of document.querySelectorAll(sums)) {
      if (!el.offsetParent) continue;
      const holder = [...document.querySelectorAll(cards)].find((c) => c.contains(el));
      const box = (holder || el.parentElement).getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(el);
      const rect = range.getBoundingClientRect();
      const width = Math.round(rect.width * 1.12);
      const inner = Math.round(el.getBoundingClientRect().width);
      const style = getComputedStyle(el);
      res.push({ text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 24), sw: el.scrollWidth, cw: el.clientWidth, tw: width, inner, fs: Math.round(parseFloat(style.fontSize) * 10) / 10, over: Math.round(Math.max(0, rect.left + width - box.right, box.left - rect.left, width - inner)), lines: Math.round(rect.height / parseFloat(style.lineHeight || "1")) });
    }
    return res;
  }, [page.cards, page.sums]);
  const doc = await run.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  return { rows, doc };
}

module.exports = { SUMMARY, answer, PAGES, SETUPS, measure };
