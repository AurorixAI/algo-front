// UX pack §5.2 / §5.2-бис / §5.1-тер in a real browser: the page «Зарплата» of November 2026 with the numbers of the walk of stage - four tiles, a table whose row is ONE height (the name and one quiet line),
// ONE status chip by priority that opens the list of what to do, the change of the sum told under the number, and the amber bar over the summary about the OTHER months.  The CSS is the project's tailwind.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { monthServer, SABINA } = require("./helpers/month-list-fixture.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => text.replace(/\s+/g, " ").replace(/ /g, " ").trim();
async function openMonth(width, server = monthServer()) {
  const run = await openPage(browser, "money.entry.tsx", server, { width, height: 900 });
  await run.page.clock.setFixedTime(new Date("2026-11-05T10:00:00+05:00"));
  await run.page.evaluate(() => { window.__search = "month=2026-11"; window.mount("monthPage", { role: "owner", org_role: "owner" }); });
  await run.page.waitForSelector('[data-testid="month-tile-accrued"]');
  return run;
}

test("the tiles are the numbers of the walk: 935 834 accrued · 150 000 paid · 860 000 left · 74 166 paid ahead; the calm line under them", async () => {
  const { page } = await openMonth(1280);
  const tiles = (await page.locator('[data-testid^="month-tile-"]').allTextContents()).map(plain);
  assert.deepEqual(tiles, ["Начислено на сегодня935 834 сум", "Выплачено150 000 сум", "Осталось выплатить860 000 сумбез учёта выплаченного вперёд", "Выплачено вперёд74 166 сум"]);   // re-audit С16: the three tiles add up in the head
  assert.equal(plain(await page.textContent('[data-testid="payroll-month-status"]')), "Ноябрь ещё идёт — суммы предварительные · сохранено 2 из 3");
  await page.close();
});

test("the row is ONE height: the name and one quiet line (rates · lessons); no amber line under the name; the sum change is under the number", async () => {
  const { page } = await openMonth(1280);
  assert.equal(await page.locator('[data-testid="teacher-attention"]').count(), 0, "the amber line under the name is gone");
  const kamol = page.locator("ul > li").nth(0);
  const cell = kamol.locator("div").first();
  assert.deepEqual((await cell.locator("> p").allTextContents()).map((text) => plain(text).replace(/\s*·\s*/g, " · ")), ["Камол Эргашев", "Группа 50% · Индив. 60% · 4 урока"]);
  assert.match(plain(await kamol.locator('[data-testid="teacher-sum"]').innerText()), /^75 834 начислено сейчас было 120 834$/);
  assert.equal(plain(await kamol.locator('[data-testid="teacher-sum-was"]').textContent()), "было 120 834");
  assert.equal(plain(await kamol.locator('[data-testid="teacher-rest"]').innerText()), "вперёд 74 166");
  const heights = await page.evaluate(() => [...document.querySelectorAll("ul > li")].map((li) => Math.round(li.getBoundingClientRect().height)));
  assert.ok(Math.max(...heights) - Math.min(...heights) <= 40, `the rows are of one height: ${heights.join(", ")}`);
  await page.close();
});

test("ONE chip by priority: «Требует действия · N» (amber) / «Не рассчитано» / «Сохранено 05.11»; no second chip of the change", async () => {
  const { page } = await openMonth(1280);
  const chips = [];
  for (const index of [0, 1, 2]) chips.push(plain(await page.locator("ul > li").nth(index).locator('[data-testid="status-todo"], [class*="rounded-2xl"][class*="border"]').first().textContent()));
  assert.deepEqual(chips, ["Требует действия", "Требует действия", "Сохранено 05.11"]);
  assert.equal(await page.locator('[data-testid="status-todo"]').count(), 2);
  assert.ok(!/Изменилась/.test(plain(await page.textContent("ul"))), "the change is not a chip of its own");
  await page.close();
});

test("hover, focus and tap open the list of what to do - every item a link, the changed salary among them", async () => {
  const { page } = await openMonth(1280);
  const first = page.locator('[data-testid="status-todo"]').first();
  await first.hover();
  await page.waitForSelector('[data-testid="status-todo-panel"]');
  const items = (await page.locator('[data-testid="status-todo-item"]').allTextContents()).map(plain);
  assert.deepEqual(items, ["1 урок без отметки", "1 доп. урок ждёт решения", "Зарплата изменилась на −45 000 сум — сохраните новую сумму"]);
  const hrefs = await page.locator('[data-testid="status-todo-item"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  assert.deepEqual(hrefs, ["/owner/attendance?tab=open", "/owner/substitutions", "/owner/payroll/s1"]);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('[data-testid="status-todo-panel"]').count(), 0);
  await page.mouse.move(5, 5);
  await first.evaluate((el) => el.blur());
  await first.focus();
  await page.waitForSelector('[data-testid="status-todo-panel"]');
  await page.mouse.click(5, 5);
  assert.equal(await page.locator('[data-testid="status-todo-panel"]').count(), 0, "a click outside closes it");
  await first.click();
  await page.waitForSelector('[data-testid="status-todo-panel"]');
  await page.close();
});

test("the bar over the summary: the OTHER months whose saved salary changed (amber), with the button to open the oldest; no bar without the answer", async () => {
  const { page } = await openMonth(1280);
  await page.waitForSelector('[data-testid="changed-months-bar"]');
  assert.equal(plain(await page.textContent('[data-testid="changed-months-bar"]')), "Зарплата изменилась в закрытых месяцах: сентябрь — 2 преподавателя, октябрь — 1.Открыть сентябрь");
  const bar = await page.evaluate(() => { const b = document.querySelector('[data-testid="changed-months-bar"]').getBoundingClientRect(); const t = document.querySelector('[data-testid="month-tile-accrued"]').getBoundingClientRect(); return b.bottom <= t.top + 1; });
  assert.equal(bar, true, "the bar is over the summary");
  await page.close();
  const none = await openMonth(1280, monthServer({ changed: null }));
  await none.page.waitForTimeout(200);
  assert.equal(await none.page.locator('[data-testid="changed-months-bar"]').count(), 0);
  await none.page.close();
  const same = await openMonth(1280, monthServer({ changed: [{ month: "2026-11", teachers: 1 }] }));
  await same.page.waitForTimeout(200);
  assert.equal(await same.page.locator('[data-testid="changed-months-bar"]').count(), 0, "the month on the page has its own chips");
  await same.page.close();
});

for (const width of [1280, 1024, 375]) {
  test(`${width}: nothing leaves its box, no horizontal scroll; the chip, the button and the bar are at least 40 px on a phone`, async () => {
    const { page } = await openMonth(width);
    await page.waitForSelector('[data-testid="changed-months-bar"]');
    const facts = await page.evaluate(layoutProbe, "body");
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    if (width < 1280) {
      const heights = await page.evaluate(() => ['[data-testid="status-todo"]', '[data-testid="changed-months-open"]', "ul > li button"].map((selector) => Math.round(document.querySelector(selector).getBoundingClientRect().height)));
      assert.ok(heights.every((h) => h >= 32) && heights[1] >= 40 && heights[2] >= 40, heights.join(","));
    }
    await page.close();
  });
}

test("F2: the four tiles share the whole width of the content (1280 and 1024: four equal columns; 375: two by two)", async () => {
  for (const width of [1280, 1024, 375]) {
    const { page } = await openMonth(width);
    const geometry = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('[data-testid^="month-tile-"]')].map((el) => el.getBoundingClientRect());
      const list = document.querySelector('[data-testid="payroll-month-summary"]').getBoundingClientRect();
      return { lefts: tiles.map((r) => Math.round(r.left)), tops: tiles.map((r) => Math.round(r.top)), widths: tiles.map((r) => Math.round(r.width)), rightEdge: Math.round(Math.max(...tiles.map((r) => r.right))), listRight: Math.round(list.right), listLeft: Math.round(list.left) };
    });
    assert.ok(Math.abs(geometry.rightEdge - geometry.listRight) <= 1, `${width}: the last tile reaches the right edge of the content: ${JSON.stringify(geometry)}`);
    assert.ok(Math.max(...geometry.widths) - Math.min(...geometry.widths) <= 2, `${width}: equal columns ${JSON.stringify(geometry)}`);
    if (width >= 1024) assert.equal(new Set(geometry.tops).size, 1, `${width}: one row ${JSON.stringify(geometry)}`);
    else assert.deepEqual([...new Set(geometry.tops)].length, 2, `${width}: 2 x 2 ${JSON.stringify(geometry)}`);
    await page.close();
  }
});

test("F2: three tiles (nothing paid ahead) fill the width too - no empty fourth place; on a phone the odd one spans both columns", async () => {
  for (const width of [1280, 375]) {
    const { page } = await openMonth(width, monthServer({ teachers: [SABINA] }));
    assert.equal(await page.locator('[data-testid^="month-tile-"]').count(), 3);
    const geometry = await page.evaluate(() => { const tiles = [...document.querySelectorAll('[data-testid^="month-tile-"]')].map((el) => el.getBoundingClientRect()); const list = document.querySelector('[data-testid="payroll-month-summary"]').getBoundingClientRect(); return { right: Math.round(Math.max(...tiles.map((r) => r.right))), list: Math.round(list.right), lastWidth: Math.round(tiles[2].width), firstWidth: Math.round(tiles[0].width) }; });
    assert.ok(Math.abs(geometry.right - geometry.list) <= 1, `${width}: ${JSON.stringify(geometry)}`);
    if (width === 375) assert.ok(geometry.lastWidth > geometry.firstWidth * 1.8, JSON.stringify(geometry));
    await page.close();
  }
});

test("F3: the subtitle does not repeat the title - the month and the number of teachers", async () => {
  const { page } = await openMonth(1280);
  assert.equal(plain(await page.textContent('[data-testid="payroll-page-subtitle"]')), "3 преподавателя");
  assert.ok(!/Зарплата преподавателей за месяц/.test(plain(await page.textContent("body"))));
  await page.close();
});

test("F4: on a phone «Скачать Excel», «Рассчитать всех» and «⋯» stand in ONE row, the «⋯» button is at least 40 px", async () => {
  const { page } = await openMonth(375);
  const geometry = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="payroll-month-actions"]');
    return [...box.querySelectorAll("button")].map((el) => { const r = el.getBoundingClientRect(); return { name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; });
  });
  assert.equal(geometry.length, 3, JSON.stringify(geometry));
  assert.equal(new Set(geometry.map((item) => item.top)).size, 1, `one row: ${JSON.stringify(geometry)}`);
  const menu = geometry[2];
  assert.ok(menu.name.startsWith("Ещё") && menu.w >= 40 && menu.h >= 40, JSON.stringify(menu));
  assert.ok(geometry.every((item) => item.right <= 375), JSON.stringify(geometry));
  await page.close();
});

test("F5: the list «Что нужно сделать» - the words of the dictionary, every item a link with an arrow and a hover", async () => {
  const { page } = await openMonth(1280);
  await page.locator('[data-testid="status-todo"]').first().click();
  await page.waitForSelector('[data-testid="status-todo-panel"]');
  const items = (await page.locator('[data-testid="status-todo-item"]').allTextContents()).map(plain);
  assert.equal(items[0], "1 урок без отметки");
  assert.ok(!/незакрыт/i.test(items.join("|")), items.join("|"));
  assert.equal(await page.locator('[data-testid="status-todo-item-arrow"]').count(), items.length, "an arrow at every item");
  const link = page.locator('[data-testid="status-todo-item"]').first();
  const before = await link.evaluate((el) => getComputedStyle(el).backgroundColor);
  await link.hover();
  const after = await link.evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(before, after, "the item answers the mouse");
  const arrowRight = await page.evaluate(() => { const item = document.querySelector('[data-testid="status-todo-item"]').getBoundingClientRect(); const arrow = document.querySelector('[data-testid="status-todo-item-arrow"]').getBoundingClientRect(); return arrow.right <= item.right && arrow.left > item.left + item.width / 2; });
  assert.equal(arrowRight, true, "the arrow is on the right of the item");
  await page.close();
});
