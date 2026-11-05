// UX pack №15 + §5.1-тер in a real browser: the window of a transfer of a student is about the MONEY OF THE STUDENT only - «Что изменится» is the sentence of the server about the
// payments and the debt that go to the new group; there is no line about the salary of the teachers (it is told in «Зарплата»).  The button names the action («Перевести (N)»), the group price
// is said once, the card «Текущая группа» is readable (contrast >= 4.5:1) and short on a phone.  The CSS is the project's tailwind.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { SENTENCE, transferServer } = require("./helpers/transfer-fixture.cjs");

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
const server = transferServer();

async function openAssign(width) {
  const run = await openPage(browser, "money.entry.tsx", server, { width, height: 900 });
  await run.page.evaluate(() => window.mount("assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
  await run.page.click("text=Геометрия 8");
  await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]');
  return run;
}

test("№15: «Что изменится» is the sentence of the server about the student's money; the salary of the teachers is NOT in the window even when the server sends it", async () => {
  const { page } = await openAssign(1280);
  const block = page.locator('[data-testid="transfer-preview"]');
  assert.equal(plain(await block.locator("h3").textContent()), "Что изменится");
  assert.equal(plain(await block.locator('[data-testid="transfer-carried"] li').first().textContent()), SENTENCE);
  const dialog = plain(await page.textContent('[role="dialog"]'));
  assert.ok(!/зарплат|Каримова К\.|Эргашев К\.|Подробнее|закрыт/i.test(dialog.replace(/Преподаватель: Камол Эргашев/g, "")), dialog);
  assert.equal(await page.locator('[data-testid="money-effects"]').count(), 0);
  assert.ok(!/Что переедет/.test(dialog), "one title for every window");
  await page.close();
});

test("№15: the group price is said ONCE; the old line «Действующая оплата перейдёт…» is gone (the sentence of the server says it with the sums)", async () => {
  const { page } = await openAssign(1280);
  const dialog = plain(await page.textContent('[role="dialog"]'));
  assert.equal((dialog.match(/Ученик берёт цену новой группы/g) ?? []).length, 1, dialog);
  assert.ok(!/Действующая оплата перейдёт/.test(dialog));
  assert.match(plain(await page.textContent('[data-testid="assign-price-hint"]')), /^Ученик берёт цену новой группы/);
  await page.close();
});

test("№15: the card «Текущая группа» reads at 4.5:1 or better; on a phone it is short (no teacher line, no icon)", async () => {
  for (const width of [1280, 375]) {
    const { page } = await openAssign(width);
    const facts = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="assign-current-group"]');
      const parse = (css) => { const m = /rgba?\(([^)]+)\)/.exec(css); const [r, g, b, a = 1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
      const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bg = parse(getComputedStyle(card).backgroundColor);
      const ratios = [...card.querySelectorAll("p")].filter((p) => p.getBoundingClientRect().height > 0).map((p) => {
        const fg = parse(getComputedStyle(p).color);
        const a = lum(fg), b = lum(bg);
        return { text: p.textContent.trim().slice(0, 30), ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10 };
      });
      return { ratios, height: Math.round(card.getBoundingClientRect().height), teacherVisible: [...card.querySelectorAll("p")].some((p) => /Преподаватель:/.test(p.textContent) && p.getBoundingClientRect().height > 0) };
    });
    assert.ok(facts.ratios.length >= 2 && facts.ratios.every((item) => item.ratio >= 4.5), `${width}: ${JSON.stringify(facts)}`);
    if (width === 375) { assert.equal(facts.teacherVisible, false, "folded on a phone"); assert.ok(facts.height <= 64, JSON.stringify(facts)); }
    else assert.equal(facts.teacherVisible, true);
    await page.close();
  }
});

for (const width of [1280, 1024, 375]) {
  test(`${width}: nothing leaves its box in the window of a transfer, no horizontal scroll`, async () => {
    const { page } = await openAssign(width);
    const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    await page.close();
  });
}

async function openDrawer(width, user = { role: "owner", org_role: "owner" }) {
  const run = await openPage(browser, "enrol.entry.tsx", server, { width, height: 900 });
  await run.page.evaluate((who) => window.mount(who), user);
  await run.page.fill('input[placeholder^="Поиск по имени"]', "Кари");
  await run.page.click('button:has-text("Каримов Фарход")');
  await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]');
  return run;
}

for (const width of [1280, 375]) {
  test(`${width}: the drawer «Зачислить учеников»: the mode «Перевести» - the button says «Перевести (1)», one title «Что изменится», the sentence of the server, no salary; nothing leaves its box`, async () => {
    const { page } = await openDrawer(width);
    assert.equal(plain(await page.textContent('button:has-text("Перевести (1)")')), "Перевести (1)");
    assert.equal(await page.locator('button:has-text("Зачислить (1)")').count(), 0);
    assert.equal(plain(await page.textContent('[data-testid="transfer-preview"] h3')), "Что изменится");
    assert.equal(plain(await page.textContent('[data-testid="transfer-carried"] li')), SENTENCE);
    assert.ok(!/зарплат|Каримова К\./i.test(plain(await page.textContent('[data-testid="transfer-preview"]'))));
    assert.equal(await page.locator('[data-testid="money-effects"]').count(), 0);
    // the other mode of the same window keeps «Зачислить»
    await page.click('[role="radio"]:has-text("Зачислить и в эту группу")');
    await page.waitForSelector('button:has-text("Зачислить (1)")');
    assert.equal(await page.locator('[data-testid="transfer-preview"]').count(), 0, "adding to a second group moves no money");
    await page.click('[role="radio"]:has-text("Перевести в эту группу")');
    await page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]');
    const facts = await page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    await page.close();
  });
}

test("№15, a phone: «Что изменится» is brought into the screen when the answer comes - the person sees what they confirm, above the button", async () => {
  const { page } = await openAssign(375);
  await page.waitForTimeout(250);
  const where = await page.evaluate(() => {
    const block = document.querySelector('[data-testid="transfer-preview"]').getBoundingClientRect();
    const buttons = [...document.querySelectorAll('[role="dialog"] button')].filter((b) => /Перевести в другую группу/.test(b.textContent)).map((b) => b.getBoundingClientRect());
    return { top: Math.round(block.top), bottom: Math.round(block.bottom), buttonTop: Math.round(buttons[buttons.length - 1].top), vh: window.innerHeight };
  });
  assert.ok(where.top >= 0 && where.bottom <= where.buttonTop + 1, JSON.stringify(where));
  await page.close();
});
