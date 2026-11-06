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

// the sentence of the server is shown as ROWS (its parts divided by «; » are lines of their own, re-audit В2); put together with «; » it is the sentence itself
const rowsText = async (locator) => (await locator.allTextContents()).map(plain).join("; ");

test("№15: «Что изменится» is the sentence of the server about the student's money (as rows, numbers do not break); the salary of the teachers is NOT in the window even when the server sends it", async () => {
  const { page } = await openAssign(1280);
  const block = page.locator('[data-testid="transfer-preview"]');
  assert.equal(plain(await block.locator("h3").textContent()), "Что изменится");
  assert.equal(await rowsText(block.locator('[data-testid="transfer-carried"] li')), SENTENCE);
  assert.ok((await block.locator('[data-testid="transfer-carried"] li').count()) >= 2, "rows, not one paragraph");
  const raw = await block.locator('[data-testid="transfer-carried"]').textContent();
  assert.ok(/640\u00a0000\u00a0сум/.test(raw) && /280\u00a0000\u00a0сум/.test(raw) && /360\u00a0000\u00a0сум/.test(raw), "the sums of the server's sentence carry non-breaking spaces: " + JSON.stringify(raw));
  const dialog = plain(await page.textContent('[role="dialog"]'));
  assert.ok(!/зарплат|Каримова К\.|Эргашев К\.|Подробнее|закрыт/i.test(dialog.replace(/Преподаватель: Камол Эргашев/g, "")), dialog);
  assert.equal(await page.locator('[data-testid="money-effects"]').count(), 0);
  assert.ok(!/Что переедет/.test(dialog), "one title for every window");
  await page.close();
});

test("№15 / В2: the group price is said ONCE (on the card of the group); no «Ученик берёт цену…», no «Цена группы:», no «Эту цену получит»; the old line «Действующая оплата перейдёт…» is gone", async () => {
  const { page } = await openAssign(1280);
  const dialog = plain(await page.textContent('[role="dialog"]'));
  assert.equal((dialog.match(/360 000 сум\/мес/g) ?? []).length, 1, dialog);
  assert.ok(!/Ученик берёт цену|Цена группы|Эту цену получит|индивидуальная цена прежней/.test(dialog), dialog);
  assert.ok(!/Действующая оплата перейдёт/.test(dialog));
  assert.equal(await page.locator('[data-testid="assign-price-hint"]').count(), 0);
  await page.close();
});

test("В2: «Перевести в другую группу» - who and from where is ONE line under the title (readable, 4.5:1); the window does not scroll itself; the list is as tall as its content; the button is «Перевести» in one line", async () => {
  for (const width of [1280, 1024, 375]) {
    const { page } = await openAssign(width);
    await page.waitForTimeout(250);
    const facts = await page.evaluate(() => {
      const line = document.querySelector('[data-testid="assign-current-group"]');
      const dialog = document.querySelector('[role="dialog"]');
      const parse = (css) => { const m = /rgba?\(([^)]+)\)/.exec(css); const [r, g, b, a = 1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
      const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratios = [...line.querySelectorAll("span")].filter((el) => el.children.length === 0 && el.textContent.trim()).map((el) => { const a = lum(parse(getComputedStyle(el).color)), b = lum({ r: 255, g: 255, b: 255 }); return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10; });
      const body = dialog.querySelector('[data-modal-part="body"]');
      const list = document.querySelector('[data-testid="assign-groups"]');
      const rows = list.querySelectorAll(':scope > div > div[class*="cursor-pointer"]').length;
      const block = document.querySelector('[data-testid="transfer-preview"]').getBoundingClientRect();
      const submit = document.querySelector('[data-testid="assign-submit"]');
      const lineBox = line.getBoundingClientRect();
      return { text: line.textContent.replace(/\s+/g, " ").trim(), ratios, lineHeight: Math.round(lineBox.height), scrolled: body.scrollTop, listHeight: Math.round(list.getBoundingClientRect().height), rows, blockBottom: Math.round(block.bottom), submitTop: Math.round(submit.getBoundingClientRect().top), submitHeight: Math.round(submit.getBoundingClientRect().height), submitText: submit.textContent.trim(), vh: window.innerHeight };
    });
    assert.match(facts.text, /^Иванов Иван · сейчас в «Алгебра 7 \(вт\/пт\)»$/, JSON.stringify(facts));
    assert.ok(facts.ratios.length > 0 && facts.ratios.every((ratio) => ratio >= 4.5), JSON.stringify(facts));
    assert.equal(facts.scrolled, 0, `${width}: the body of the window was not scrolled by the window itself`);
    assert.ok(facts.listHeight <= facts.rows * 150 + 60, `${width}: the list is as tall as its groups, not a fixed box (it was 220 / 340 px with one group): ${JSON.stringify(facts)}`);
    assert.ok(facts.blockBottom <= facts.submitTop + 1, `${width}: «Что изменится» is above the button: ${JSON.stringify(facts)}`);
    assert.equal(facts.submitText, "Перевести");
    assert.ok(facts.submitHeight <= 48, `${width}: one line: ${JSON.stringify(facts)}`);
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
    assert.equal(await rowsText(page.locator('[data-testid="transfer-carried"] li')), SENTENCE);
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
