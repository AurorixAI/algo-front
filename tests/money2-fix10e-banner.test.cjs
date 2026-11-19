// Money-2 fix 10Д: the red notice «N учеников с долгом …» is drawn ONLY on the control panel and on the page «Оплаты» itself; not on a statement, a receipt, the prices, the groups, the students (one condition: bannerShownOn).
const assert = require("node:assert/strict");
const test = require("node:test");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const X = require("./helpers/money-b-fixture.cjs");

const server = (request) => (request.path === "/auth/org/payments/summary" ? { json: X.SUMMARY } : null);
let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { await browser.close(); });

test("the notice stands on «Главная» and on «Оплаты»; not on the pages of a student, a group, a statement, a receipt", async () => {
  const cases = [["/owner/dashboard", 1], ["/owner/payments", 1], ["/owner/payments/statement/m1", 0], ["/owner/payments/receipt/p1", 0], ["/owner/students/st1", 0], ["/owner/students", 0], ["/owner/groups/g1", 0], ["/owner/schedule", 0]];
  for (const [pathname, expected] of cases) {
    const { page } = await openPage(browser, "money-b.entry.tsx", server, { width: 1280, height: 600 });
    await page.evaluate((value) => { window.__pathname = value; window.mount("banner", { role: "owner", org_role: "owner" }, { refresh: true }); }, pathname);
    await page.waitForTimeout(900);
    assert.equal(await page.locator('[data-testid="payments-alert-banner"]').count(), expected, pathname);
    await page.close();
  }
});
