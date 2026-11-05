// UX pack №7 + №17 in a real browser: «Уроки без отметки» of the walk of stage (Лола Мирзаева: 2 lessons of October, 1 of November).  The head of a month says «Октябрь 2026 · 2 урока» once; the caption says
// «с 1 сентября 2026»; a column of a status that is the same in every row is not drawn; the buttons are at least 40 px on a phone; an administrator WITHOUT the money right gets ONE plaque instead of a
// line in every row.  The CSS is the project's tailwind.
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
const { WALK, MIXED, openLessonsServer: serverOf } = require("./helpers/open-lessons-fixture.cjs");
async function open(width, data = WALK, user = { role: "owner", org_role: "owner" }) {
  const run = await openPage(browser, "money.entry.tsx", serverOf(data), { width, height: 900 });
  await run.page.evaluate((who) => window.mount("openLessons", who), user);
  await run.page.waitForSelector('[data-testid="open-month"]');
  return run;
}

test("№17: «Октябрь 2026 · 2 урока» once; the caption «с 1 сентября 2026»; the column of an equal status is not drawn", async () => {
  const { page } = await open(1280);
  const heads = (await page.locator('[data-testid="open-month"] h3').allTextContents()).map(plain);
  assert.deepEqual(heads, ["Октябрь 2026 · 2 урока", "Ноябрь 2026 · 1 урок"]);
  assert.equal(plain(await page.textContent('[data-testid="open-since"]')), "Показаны уроки без отметки с 1 сентября 2026");
  const text = plain(await page.textContent("section"));
  assert.ok(!/Посещаемость не отмечена/.test(text), "five equal statuses are noise");
  assert.ok(!/Статус/.test(text), "no column header of it");
  assert.ok(!/не отмечено 2/.test(text), "the head is not repeated by a line of counters");
  await page.close();
});

test("№17: when the lessons differ (one is going on) the status is shown", async () => {
  const { page } = await open(1280, MIXED);
  const text = plain(await page.textContent("section"));
  assert.match(text, /Статус/);
  assert.match(text, /Урок не завершён · отмечено 3 из 8/);
  assert.match(text, /не отмечено 1 · не завершено 1/);
  await page.close();
});

test("№7: an administrator without the money right - ONE plaque, no line in a row, the «⋯» of «Урока не было» stays; the owner has no plaque", async () => {
  const { page } = await open(1280, WALK, { role: "admin", org_role: "admin", payments_access: false });
  assert.equal(await page.locator('[data-testid="open-lessons-no-right"]').count(), 1);
  assert.equal(await page.locator('[data-testid="open-lesson-no-right"]').count(), 0);
  assert.equal(await page.locator('[data-testid="open-lesson-action"]').count(), 0);
  assert.equal(await page.locator('button[aria-label^="Действия:"]').count(), 3);
  assert.ok(!/правом на деньги|на оплаты/.test(plain(await page.textContent("section"))), "the dictionary: «с доступом к деньгам»");
  await page.close();
  const owner = await open(1280);
  assert.equal(await owner.page.locator('[data-testid="open-lessons-no-right"]').count(), 0);
  assert.equal(await owner.page.locator('[data-testid="open-lesson-action"]').count(), 3);
  await owner.page.close();
});

for (const [width, user] of [[1280, undefined], [1024, undefined], [375, undefined], [375, { role: "admin", org_role: "admin", payments_access: false }], [1280, { role: "admin", org_role: "admin", payments_access: false }]]) {
  test(`${width}${user ? " (admin without the right)" : ""}: nothing leaves its box, no horizontal scroll; the buttons are at least 40 px on a phone`, async () => {
    const { page } = await open(width, WALK, user);
    const facts = await page.evaluate(layoutProbe, "section");
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    if (width < 1024) {
      const sizes = await page.evaluate(() => [...document.querySelectorAll('[data-testid="open-lesson-action"], [data-testid="open-lesson-menu-slot"] button')].map((el) => Math.round(el.getBoundingClientRect().height)));
      assert.ok(sizes.length >= 3 && sizes.every((h) => h >= 40), sizes.join(","));
    }
    await page.close();
  });
}
