// UX pack №6 in a real browser: the window «Архивировать группу» with ONE lesson without a mark.  ONE amber block «Остался 1 урок без отметки: вт, 3 ноября · 11:00–12:00 · Мирзаева Л.» with the link to
// the journal and the whole sentence «Если урок был — сначала отметьте посещаемость.»; the checkbox «Урока не было — отменить его при архивации» with the money consequence of the server under it; the line
// «почему» over the off button; the button is BLUE (the archive can be undone).  The CSS is the project's tailwind.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { archiveServer } = require("./helpers/archive-fixture.cjs");

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
async function open(width, over) {
  const run = await openPage(browser, "money.entry.tsx", archiveServer(over), { width, height: 900 });
  await run.page.evaluate(() => window.mount("archive"));
  await run.page.waitForSelector('[data-testid="archive-missed"]');
  return run;
}

test("№6: ONE amber block - «Остался 1 урок без отметки:», the lesson, the whole advice sentence, the link «Открыть журнал» to the journal of the group", async () => {
  const { page } = await open(1280);
  const block = page.locator('[data-testid="archive-missed"]');
  assert.equal(plain(await block.locator('[data-testid="archive-missed-title"]').textContent()), "Остался 1 урок без отметки:");
  assert.deepEqual((await block.locator("li").allTextContents()).map(plain), ["вт, 3 ноября · 11:00–12:00 · Мирзаева Л."]);
  assert.equal(plain(await block.locator('[data-testid="archive-missed-advice"]').textContent()), "Если урок был — сначала отметьте посещаемость.");
  const link = block.locator('[data-testid="archive-open-journal"]');
  assert.equal(plain(await link.textContent()), "Открыть журнал");
  assert.equal(await link.getAttribute("href"), "/owner/groups/g1?tab=attendance");
  // the old red stop «Не закрыто пропущенных уроков» is gone: nothing red for the same fact
  assert.equal(await page.locator('[role="alert"]').count(), 0, "no red alert for the lesson without a mark");
  assert.ok(!/Не закрыто пропущенных/.test(plain(await page.textContent('[role="dialog"]'))));
  await page.close();
});

test("№6: the checkbox says «Урока не было — отменить его при архивации»; under it the sentence of the server about the money; nothing is said twice", async () => {
  const { page } = await open(1280);
  const label = page.locator("label", { hasText: "отменить его при архивации" });
  assert.equal(plain(await label.locator("span.font-medium").first().evaluate((el) => el.firstChild.textContent)), "Урока не было — отменить его при архивации");
  assert.equal(plain(await page.textContent('[data-testid="archive-missed-consequence"]')), "Ученикам перерасчёта не будет, а в зарплату преподавателей они не войдут.");
  const text = plain(await page.textContent('[role="dialog"]'));
  assert.equal((text.match(/сначала отметьте посещаемость/g) ?? []).length, 1, text);
  assert.equal((text.match(/перерасчёта не будет/g) ?? []).length, 1, text);
  await page.close();
});

test("№6: the button «В архив» is blue, off with the line «почему» over it; the checkbox turns it on and the line goes", async () => {
  const { page } = await open(1280);
  const submit = page.locator('[data-testid="group-archive-submit"]');
  assert.equal(await submit.isDisabled(), true);
  assert.equal(plain(await page.textContent('[data-testid="group-archive-why"]')), "Отметьте урок в журнале или поставьте галочку «Урока не было».");
  assert.equal(plain(await page.textContent('[data-testid="confirm-cancel"]')), "Отмена");
  const color = await submit.evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.ok(!/220, 38, 38|225, 29, 72/.test(color), `blue, not red: ${color}`);
  await page.click('label:has-text("отменить его при архивации")');
  assert.equal(await submit.isDisabled(), false);
  assert.equal(await page.locator('[data-testid="group-archive-why"]').count(), 0);
  await submit.click();
  await page.waitForFunction(() => window.__log.some((line) => String(line).startsWith("archived:")));
  await page.close();
});

test("№6: several lessons - the words go to the plural; the list is the server's", async () => {
  const lessons = [1, 2, 3].map((n) => ({ lessonId: `l${n}`, lessonDate: `2026-11-0${n}`, startTime: "10:00", endTime: "11:00", teacherName: "Мирзаева Л." }));
  const { impact } = require("./helpers/archive-fixture.cjs");
  const { page } = await open(1280, { blockers: [{ ...impact().blockers[0], count: 3, lessons }] });
  assert.equal(plain(await page.textContent('[data-testid="archive-missed-title"]')), "Осталось 3 урока без отметки:");
  assert.equal(await page.locator('[data-testid="archive-missed"] li').count(), 3);
  assert.match(plain(await page.textContent("label:has(input[type=checkbox])")), /^Уроков не было — отменить их при архивации/);
  await page.close();
});

for (const width of [1280, 1024, 375]) {
  test(`${width}: nothing leaves its box, no horizontal scroll; the link and the buttons are at least 40 px on a phone`, async () => {
    const { page } = await open(width);
    const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    if (width < 1024) {
      await page.waitForTimeout(450); // the window has finished its opening animation (a scale) - the boxes have their real size
      const heights = await page.evaluate(() => ['[data-testid="archive-open-journal"]', '[data-testid="confirm-cancel"]', '[data-testid="group-archive-submit"]'].map((selector) => Math.round(document.querySelector(selector).getBoundingClientRect().height)));
      assert.ok(heights.every((h) => h >= 40), heights.join(","));
    }
    await page.close();
  });
}
