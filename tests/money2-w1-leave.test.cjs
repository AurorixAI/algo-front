// Money-2 wave 1, Э1 (Т3, Т11): the windows of the LEAVING and of the ARCHIVING say what ENDS in the words of the server (`memberships[].effects.ends`) once - in place of the own sentence about
// the individual price; the debt that stays is said by the headline of the block (one number, once); a role without the right to money sees the same facts without a sum; the refusal is the server's text.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const F = require("./helpers/money2-fixture.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => text.replace(/\s+/g, " ").replace(/ /g, " ").trim();
const count = (text, part) => text.split(part).length - 1;

function server(previewPath, memberships, extra = () => null) {
  return F.baseServer((request) => {
    if (request.method === "GET" && request.path === previewPath) return { json: { as_of: "2026-11-16", memberships } };
    return extra(request);
  });
}

test("Э1 (уход): «Закончится» is the server's `ends` - price, planned price, pause - each said once; the old sentence about the price is not repeated; the debt is said once", async () => {
  const membership = F.leaveMembership(0);
  const run = await openPage(browser, "money2.entry.tsx", server("/auth/org/groups/ga/students/st1/leave-preview", [membership]), { width: 1280, height: 900 });
  await run.page.evaluate(() => window.mount("leave"));
  await run.page.waitForSelector('[data-testid="effects-ends"]');
  const titles = (await run.page.locator('[data-testid="settle-membership"] h4').allTextContents()).map(plain);
  assert.deepEqual(titles, ["Закончится"], "the debt stays is the headline: only «Закончится» is a section");
  const rows = await run.page.locator('[data-testid="effects-ends"] li').evaluateAll((items) => items.map((li) => [...li.children].map((child) => child.textContent.replace(/[\s\u00a0]+/g, " ").trim())));
  assert.deepEqual(rows, [["Индивидуальная цена", "300 000 сум"], ["Цена с 01.12", "250 000 сум"], ["Пауза", "23–26.11"]]);
  const dialog = plain(await run.page.locator('[role="dialog"]').evaluate((el) => el.innerText));
  assert.ok(!/вместе с группой/.test(dialog), "the own sentence about the individual price is gone");
  assert.equal(count(dialog, "120 000 сум"), 1, "the debt once");
  assert.equal(count(dialog, "300 000 сум"), 1, "the price once");
  assert.equal(run.errors.length, 0, run.errors.join("|"));
  await run.page.close();
});

test("Э1 (архив): a block «Закончится» per group of the student (three groups, long names); a role without the right to money - the same facts without a sum, the button is not dead", async () => {
  const memberships = [0, 1, 2].map((index) => F.leaveMembership(index, { kind: "archive" }));
  const open = await openPage(browser, "money2.entry.tsx", server("/auth/org/students/st1/archive-preview", memberships), { width: 375, height: 800 });
  await open.page.evaluate(() => window.mount("archive"));
  await open.page.waitForSelector('[data-testid="effects-ends"]');
  assert.equal(await open.page.locator('[data-testid="effects-ends"]').count(), 3);
  const text = plain(await open.page.textContent('[role="dialog"]'));
  for (const membership of memberships) for (const item of membership.effects.ends) assert.equal(count(text, plain(item.text)), 1, item.text);
  assert.equal(await open.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal scroll at 375");
  await open.page.close();

  const none = [0, 1].map((index) => F.leaveMembership(index, { money: false, kind: "archive" }));
  const blind = await openPage(browser, "money2.entry.tsx", server("/auth/org/students/st1/archive-preview", none), { width: 1280, height: 900 });
  await blind.page.evaluate(() => window.mount("archive", { role: "admin", org_role: "admin" }));
  await blind.page.waitForSelector('[data-testid="effects-ends"]');
  const blindText = plain(await blind.page.textContent('[role="dialog"]'));
  assert.ok(!/\d\s*сум/.test(blindText), blindText);
  assert.ok(blindText.includes("Индивидуальная цена в группе"));
  assert.equal(await blind.page.getByRole("button", { name: "В архив" }).isDisabled(), false);
  await blind.page.close();
});

test("Т11: the refusal of the archive is the text of the server, once, and the window stays", async () => {
  const message = "Убрать ученика с оплатой вперёд или долгом может владелец или администратор с доступом к деньгам";
  const run = await openPage(browser, "money2.entry.tsx", server("/auth/org/students/st1/archive-preview", [F.leaveMembership(0, { money: false, kind: "archive" })], (request) => request.method === "POST" && request.path === "/auth/org/students/st1/archive" ? { status: 403, json: { detail: { code: "MONEY_RIGHT_REQUIRED", message } } } : null), { width: 1280, height: 900 });
  await run.page.evaluate(() => window.mount("archive", { role: "admin", org_role: "admin" }));
  await run.page.waitForSelector('[data-testid="effects-ends"]');
  await run.page.getByRole("button", { name: "В архив" }).click();
  await run.page.waitForSelector('[role="alert"]');
  const alerts = (await run.page.locator('[role="alert"]').allTextContents()).map(plain);
  assert.deepEqual(alerts.filter((item) => item.includes("Убрать ученика с оплатой")), [message]);
  await run.page.close();
});
