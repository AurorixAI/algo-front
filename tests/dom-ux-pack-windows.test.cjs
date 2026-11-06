// UX pack №12, №18, №20, №21, №22 in a real browser: the windows of «Деньги-1» of wave (в) share ONE footer - the main button names the action (and the sum), is blue when the action can be undone, an off
// button has the line «почему» over it, the secondary one is «Отмена»; nothing leaves its box on 1280, 1024 and 375.  The CSS is the project's tailwind.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { OWNER_EFFECTS } = require("./helpers/dom-answers.cjs");

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
const RED = /rgb\(2(20|25|39), (38|29|68), (38|72|68)\)/;
const colorOf = (page, selector) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, selector);

const restoreServer = (request) => {
  if (request.path !== "/auth/org/groups/g1/lessons/restore") return null;
  return request.body.dryRun
    ? { json: { ok: true, restored: false, dryRun: true, returnedToReview: true, moneyEffects: { ...OWNER_EFFECTS, payroll: [] }, deductions: [{ studentId: "s1", name: "Нематов Жасур", amount: 40000 }, { studentId: "s2", name: "Иванов Иван", amount: 80000 }] } }
    : { json: { ok: true, restored: true, lessonId: "l1", lessonDate: "2026-10-28", returnedToReview: true } };
};

test("№20: «Вернуть на отметку» - ONE sentence «Ученикам снимем перерасчёт за этот урок: … всего 120 000 сум.», the money of the teacher in the words of the dictionary, a blue button, «Причина (обязательно)»", async () => {
  const { page } = await openPage(browser, "money.entry.tsx", restoreServer, { width: 1280, height: 900 });
  await page.evaluate(() => window.mount("review"));
  await page.waitForSelector('[data-testid="return-review-deductions"]');
  // re-audit В4: ONE block «Что изменится» - the students' recalculation as a table, each name once
  const block = plain(await page.textContent('[data-testid="return-review-deductions"]'));
  assert.match(block, /^Что изменится\s*Ученикам снимем перерасчёт за этот урок\s*Нематов Жасур\s*40 000 сум\s*Иванов Иван.*80 000 сум\s*Всего\s*120 000 сум/);
  assert.equal((block.match(/Иванов Иван/g) ?? []).length, 1, block);
  assert.equal((plain(await page.textContent('[role="dialog"]')).match(/Что изменится/g) ?? []).length, 1, "one title");
  assert.match(plain(await page.textContent('[role="dialog"]')), /В зарплату преподавателя урок войдёт, когда его проведут\./);
  const submit = page.locator('[data-testid="return-review-submit"]');
  assert.equal(plain(await submit.textContent()), "Вернуть на отметку");
  assert.equal(await submit.isDisabled(), true);
  assert.match(plain(await page.textContent('[data-testid="return-review-why"]')), /Укажите причину/);
  assert.ok(!RED.test(await colorOf(page, '[data-testid="return-review-submit"]')), "blue: the lesson can be marked again");
  assert.equal(plain(await page.textContent('label[for="return-review-reason"]')), "Причина (обязательно)");
  await page.fill("#return-review-reason", "нажали «Урока не было» по ошибке");
  assert.equal(await submit.isDisabled(), false);
  await page.close();
});

test("№21: «Никто не пришёл?» - the text does not repeat the title; the buttons «Завершить урок» / «Отмена»", async () => {
  const { page } = await openPage(browser, "shots.entry.tsx", () => null, { width: 1280, height: 900 });
  await page.evaluate(() => window.mountShot("nobodyCame"));
  await page.waitForSelector('[role="dialog"]');
  assert.equal(plain(await page.textContent('[role="dialog"] h2')), "Никто не пришёл?");
  const body = plain(await page.textContent('[role="dialog"] p'));
  assert.ok(!/^Никто не пришёл/.test(body), body);
  assert.match(body, /^Если завершить, урок будет считаться проведённым и войдёт в зарплату преподавателя\. Если урока не было — вернитесь и нажмите «Урока не было»\.$/);
  const buttons = (await page.locator('[role="dialog"] button').allTextContents()).map(plain).filter((text) => text && text !== "Закрыть");
  assert.deepEqual(buttons.slice(-2), ["Отмена", "Завершить урок"]);
  await page.close();
});

test("№18: «Сохранить с уроками без отметки?» - the buttons «Отмена» / «Сохранить и закрыть месяц», the link «Открыть журнал» to the group of the first lesson", async () => {
  const { page } = await openPage(browser, "shots.entry.tsx", () => null, { width: 1280, height: 900 });
  await page.evaluate(() => window.mountShot("openLessonsQuestion"));
  await page.waitForSelector('[data-testid="confirm-link"]');
  assert.equal(plain(await page.textContent('[role="dialog"] h2')), "Сохранить с уроками без отметки?");
  const text = plain(await page.textContent('[role="dialog"]'));
  assert.match(text, /3 урока без отметки не попадут в зарплату:/);
  assert.match(text, /После сохранения месяц закроется\./);
  assert.equal(plain(await page.textContent('[data-testid="confirm-link"]')), "Открыть журнал");
  assert.match(await page.getAttribute('[data-testid="confirm-link"]', "href"), /^\/owner\/groups\/g1\?tab=attendance&month=2026-10/);
  const buttons = (await page.locator('[role="dialog"] button').allTextContents()).map(plain);
  assert.ok(buttons.includes("Отмена") && buttons.includes("Сохранить и закрыть месяц"), buttons.join("|"));
  await page.close();
});

test("№22: «Вернуть аванс 344 000 сум», «Способ возврата»; off with the line «почему» until the method is chosen", async () => {
  const { page } = await openPage(browser, "money.entry.tsx", () => null, { width: 1280, height: 900 });
  await page.evaluate(() => window.mount("refund"));
  await page.waitForSelector("#refund-amount");
  const submit = page.locator('[data-testid="refund-submit"]');
  assert.equal(plain(await submit.textContent()), "Вернуть аванс 344 000 сум");
  assert.equal(await submit.isDisabled(), true);
  assert.equal(plain(await page.textContent('[data-testid="refund-why"]')), "Выберите способ возврата");
  assert.equal(plain(await page.textContent("#refund-method-label")), "Способ возврата");
  await page.click('[role="radio"]:has-text("Наличные")');
  assert.equal(await submit.isDisabled(), false);
  await page.fill("#refund-amount", "100 000");
  assert.equal(plain(await submit.textContent()), "Вернуть аванс 100 000 сум");
  await page.close();
});

test("№12: «Назначить выходной» (blue) names the action, the line «почему» while the lessons are checked", async () => {
  const { page } = await openPage(browser, "shots.entry.tsx", () => null, { width: 1280, height: 900 });
  await page.evaluate(() => window.mountShot("dayOffDialog"));
  await page.waitForSelector('[data-testid="day-off-apply"]');
  assert.equal(plain(await page.textContent('[data-testid="day-off-apply"]')), "Назначить выходной");
  assert.equal(await page.isDisabled('[data-testid="day-off-apply"]'), true);
  assert.ok((await page.locator('[data-testid="day-off-why"]').count()) === 1, "an off button says why");
  assert.ok(!RED.test(await colorOf(page, '[data-testid="day-off-apply"]')), "a day off can be cancelled - blue");
  assert.equal(plain(await page.textContent('[data-testid="confirm-cancel"]')), "Отмена");
  await page.close();
});

for (const [name, entry, mountName, props] of [["return-to-review", "money.entry.tsx", "review"], ["refund", "money.entry.tsx", "refund"], ["day-off", "shots.entry.tsx", "dayOffDialog"], ["nobody-came", "shots.entry.tsx", "nobodyCame"]]) {
  for (const width of [1280, 1024, 375]) {
    test(`${width}: the window «${name}» - nothing leaves its box, no horizontal scroll, the footer buttons are at least 40 px`, async () => {
      const { page } = await openPage(browser, entry, name === "return-to-review" ? restoreServer : () => null, { width, height: 812 });
      await page.evaluate(([fn, mount]) => (fn === "money.entry.tsx" ? window.mount(mount) : window.mountShot(mount)), [entry, mountName]);
      await page.waitForSelector('[role="dialog"]');
      await page.waitForTimeout(700);
      const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
      assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
      assert.equal(facts.scroll, 0);
      if (width < 1024) {
        const heights = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].filter((el) => /^(Отмена|Вернуть|Назначить|Завершить)/.test(el.textContent.trim())).map((el) => Math.round(el.getBoundingClientRect().height)));
        assert.ok(heights.length >= 2 && heights.every((h) => h >= 40), heights.join(","));
      }
      await page.close();
    });
  }
}
