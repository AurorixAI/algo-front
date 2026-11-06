// UX pack №7 in a real browser: what an administrator WITHOUT the money access sees.  The page «Оплаты»: one calm card with the way home (4.5:1, a 40 px button); «Перевести в другую группу» is OFF with its
// reason, not hidden; the card of the days off is short and stands below his own settings.  The CSS is the project's tailwind.
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
const ADMIN = { role: "admin", org_role: "admin", payments_access: false };
const contrastOf = (page, selector, backdrop = "rgb(255, 255, 255)") => page.evaluate(([sel, bg]) => {
  const parse = (css) => { const m = /rgba?\(([^)]+)\)/.exec(css); const [r, g, b] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r, g, b }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const fg = lum(parse(getComputedStyle(document.querySelector(sel)).color)); const back = lum(parse(bg));
  return Math.round(((Math.max(fg, back) + 0.05) / (Math.min(fg, back) + 0.05)) * 10) / 10;
}, [selector, backdrop]);

for (const width of [1280, 1024, 375]) {
  test(`${width}: the page «Оплаты» is closed - one card, who opens it, the way home; readable; nothing leaves its box`, async () => {
    const { page } = await openPage(browser, "money.entry.tsx", () => null, { width, height: 812 });
    await page.evaluate((who) => window.mount("moneyDenied", who), ADMIN);
    await page.waitForSelector('[data-testid="money-denied"]');
    const card = page.locator('[data-testid="money-denied"]');
    assert.deepEqual((await card.locator("p").allTextContents()).map(plain), ["Раздел «Оплаты» вам недоступен.", "Доступ включает владелец центра."]);
    const home = card.locator('[data-testid="money-denied-home"]');
    assert.equal(plain(await home.textContent()), "На главную");
    assert.equal(await home.getAttribute("href"), "/admin/diagnostics");
    assert.ok((await home.evaluate((el) => el.getBoundingClientRect().height)) >= 40);
    for (const selector of ['[data-testid="money-denied"] p:nth-of-type(1)', '[data-testid="money-denied"] p:nth-of-type(2)']) assert.ok(await contrastOf(page, selector) >= 4.5, selector);
    const facts = await page.evaluate(layoutProbe, "body");
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    await page.close();
  });
}

test("№7: «Перевести в другую группу» of the card of a student is OFF with the reason for an administrator without the access (not hidden); on for the owner; «Зачислить в группу» stays on", async () => {
  const off = await openPage(browser, "money.entry.tsx", () => null, { width: 375, height: 812 });
  await off.page.evaluate((who) => window.mount("studentGroups", who, { moneyRight: false }), ADMIN);
  await off.page.waitForSelector('[data-testid="enrol-transfer"]');
  assert.equal(await off.page.isDisabled('[data-testid="enrol-transfer"]'), true);
  assert.equal(plain(await off.page.textContent('[data-testid="enrol-transfer-why"]')), "Переводить может владелец или администратор с доступом к деньгам.");
  assert.equal(await off.page.isDisabled('[data-testid="enrol-add"]'), false);
  assert.ok(await contrastOf(off.page, '[data-testid="enrol-transfer-why"]') >= 4.5);
  const facts = await off.page.evaluate(layoutProbe, "body");
  assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
  await off.page.close();
  const on = await openPage(browser, "money.entry.tsx", () => null, { width: 375, height: 812 });
  await on.page.evaluate(() => window.mount("studentGroups", { role: "owner", org_role: "owner" }, { moneyRight: true }));
  await on.page.waitForSelector('[data-testid="enrol-transfer"]');
  assert.equal(await on.page.isDisabled('[data-testid="enrol-transfer"]'), false);
  assert.equal(await on.page.locator('[data-testid="enrol-transfer-why"]').count(), 0);
  await on.page.click('[data-testid="enrol-transfer"]');
  assert.ok((await on.page.evaluate(() => window.__log)).includes("assign:transfer"));
  await on.page.close();
});

test("№7: the card of the days off of an administrator without the access is ONE short line over the journal; no button, no long explanation", async () => {
  const run = await openPage(browser, "shots.entry.tsx", (request) => (request.path === "/auth/org/days-off" ? { json: [] } : null), { width: 375, height: 812 });
  await run.page.evaluate((who) => window.mountShot("daysOff", who), ADMIN);
  await run.page.waitForSelector('[data-testid="day-off-no-right"]');
  assert.equal(plain(await run.page.textContent('[data-testid="day-off-no-right"]')), "Назначает и отменяет владелец или администратор с доступом к деньгам. Список выходных виден вам, менять его нельзя.");
  assert.equal(await run.page.locator('[data-testid="day-off-new"]').count(), 0);
  assert.ok(!/уроки всех групп отменяются сразу/.test(plain(await run.page.textContent('[data-testid="days-off-panel"]'))));
  const facts = await run.page.evaluate(layoutProbe, "body");
  assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
  await run.page.close();
});
