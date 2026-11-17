// Money-2 fix 6 (LESSONS 142): the statement reads like a TABLE - a number stands exactly under its heading (one right edge), the label «перенос» lives in «Операция», the money cell holds only the number,
// every money column has a thin vertical line from the header to the last row; a card (375) keeps «подпись … значение» with the label at the name.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const F = require("./helpers/money2-fixture.cjs");
const { statementServer } = require("./helpers/statement-all-kinds.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

async function open(width, names) {
  const run = await openPage(browser, "money2.entry.tsx", statementServer(names), { width, height: 900 });
  await run.page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
  await run.page.waitForSelector('[data-testid="statement-row-transfer_in"]');
  return run;
}

const MONEY = ["charged", "paid", "balance"];
const SIGNED = /^[+−]?[\d\s ]+$/;

for (const [setName, names] of [["short", F.SHORT], ["long", F.LONG]]) for (const width of [1280, 1024]) {
  test(`таблица (${setName}, ${width}): число под своим заголовком, метка в «Операции», линии на всю высоту`, async () => {
    const { page, errors } = await open(width, names);
    const data = await page.evaluate((cols) => {
      const textEdge = (el) => { const range = document.createRange(); range.selectNodeContents(el); const rects = [...range.getClientRects()].filter((rect) => rect.width > 0); return rects.length ? Math.max(...rects.map((rect) => rect.right)) : null; };
      const head = document.querySelector(".dt-head");
      const headBox = head.getBoundingClientRect();
      const out = { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, cols: {}, rows: [] };
      for (const col of cols) {
        const headCell = head.querySelector(`[data-col="${col}"]`);
        const headStyle = getComputedStyle(headCell);
        const headCellBox = headCell.getBoundingClientRect();
        const cells = [...document.querySelectorAll(`.dt-body .dt-cell[data-col="${col}"]`)];
        out.cols[col] = {
          headEdge: textEdge(headCell), headBorder: headStyle.borderLeftWidth, headFull: headCellBox.top <= headBox.top + 0.5 && headCellBox.bottom >= headBox.top + head.clientHeight - 0.5,
          cells: cells.map((cell) => {
            const row = cell.closest(".dt-row"); const rowBox = row.getBoundingClientRect(); const box = cell.getBoundingClientRect(); const value = cell.querySelector(".dt-value");
            const chip = value.querySelector('[data-kind="chip"]');
            return { text: value.innerText.trim(), edge: value.innerText.trim() ? textEdge(chip ?? value) : null, border: getComputedStyle(cell).borderLeftWidth, full: box.top <= rowBox.top + 0.5 && box.bottom >= rowBox.bottom - 0.5, left: box.left };
          }),
        };
      }
      out.rows = [...document.querySelectorAll(".dt-body .dt-row[data-testid^=statement-row]")].map((row) => ({ type: row.dataset.testid, operation: row.querySelector('[data-col="operation"]').innerText, paid: row.querySelector('[data-col="paid"] .dt-value').innerText.trim() }));
      return out;
    }, MONEY);
    assert.equal(data.overflow, false, "горизонтальной прокрутки страницы нет");
    for (const col of MONEY) {
      const c = data.cols[col];
      assert.equal(c.headBorder, "1px", `шапка ${col}: левая граница 1px`);
      assert.equal(c.headFull, true, `шапка ${col}: линия на всю высоту шапки`);
      assert.ok(c.cells.length >= 7, `${col}: строк ${c.cells.length}`);
      const lefts = new Set(c.cells.map((cell) => Math.round(cell.left)));
      assert.equal(lefts.size, 1, `${col}: колонка стоит ровно (${[...lefts]})`);
      for (const cell of c.cells) {
        assert.equal(cell.border, "1px", `${col}: у ячейки левая граница 1px`);
        assert.equal(cell.full, true, `${col}: ячейка на всю высоту строки`);
        if (cell.edge !== null) assert.ok(Math.abs(cell.edge - c.headEdge) <= 1, `${col}: «${cell.text}» правый край ${cell.edge} против заголовка ${c.headEdge}`);
      }
    }
    for (const cell of data.cols.paid.cells) if (cell.text) assert.match(cell.text, SIGNED, `«Оплачено» — только число со знаком: «${cell.text}»`);
    const transfers = data.rows.filter((row) => /transfer_/.test(row.type));
    assert.equal(transfers.length, 2);
    for (const row of transfers) { assert.match(row.operation, /перенос/); assert.doesNotMatch(row.paid, /перенос/); }
    assert.deepEqual(errors, []);
  });
}

test("карточка 375: «подпись … значение», метка «перенос» у названия, линий нет", async () => {
  const { page } = await open(375, F.SHORT);
  const data = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="statement-row-transfer_in"]');
    const paid = row.querySelector('[data-col="paid"]');
    const label = paid.querySelector(".dt-label");
    return { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, label: label?.innerText, value: paid.querySelector(".dt-value").innerText.trim(), operation: row.querySelector('[data-col="operation"]').innerText, border: getComputedStyle(paid).borderLeftWidth, labelRight: label?.getBoundingClientRect().right, valueLeft: paid.querySelector(".dt-value").getBoundingClientRect().left, headShown: getComputedStyle(document.querySelector(".dt-head")).display };
  });
  assert.equal(data.overflow, false);
  assert.equal(data.label, "Оплачено");
  assert.match(data.value, SIGNED);
  assert.match(data.operation, /перенос/);
  assert.equal(data.border, "0px");
  assert.equal(data.headShown, "none");
  assert.ok(data.valueLeft >= data.labelRight);
});

// the inventory (rule 139): the columns of «Сбор по группам» that hold ONLY a number follow the same rule (the others - «Долг» with «✓ оплачено» / «ждём оплату», «Должников» with a mark - are left to the lead)
for (const width of [1280, 1024]) {
  test(`сбор по группам (${width}): «Стоимость» и «Оплачено» — числовые колонки`, async () => {
    const R = require("./helpers/real-life-fixture.cjs");
    const run = await openPage(browser, "ds.entry.tsx", () => null, { width, height: 900 });
    await run.page.evaluate(([name, props]) => { document.getElementById("root").style.padding = "0 16px"; window.mount(name, { role: "owner", org_role: "owner" }, props); }, ["collection", { collection: R.COLLECTION_REAL }]);
    await run.page.waitForSelector(".dt-row");
    const data = await run.page.evaluate(() => {
      const textEdge = (el) => { const range = document.createRange(); range.selectNodeContents(el); const limit = el.getBoundingClientRect().right + 1; const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.right <= limit); return Math.max(...rects.map((rect) => rect.right)); };
      const head = document.querySelector(".dt-head");
      return ["charged", "paid"].map((col) => ({ col, headBorder: getComputedStyle(head.querySelector(`[data-col="${col}"]`)).borderLeftWidth, head: (() => { const h = head.querySelector(`[data-col="${col}"]`); return Math.max(textEdge(h), ...[...h.querySelectorAll("svg")].map((icon) => icon.getBoundingClientRect().right).filter((right) => right <= h.getBoundingClientRect().right + 3)); })(), cells: [...document.querySelectorAll(`.dt-body .dt-cell[data-col="${col}"]`)].map((cell) => ({ border: getComputedStyle(cell).borderLeftWidth, edge: textEdge(cell.querySelector(".dt-value")) })) }));
    });
    for (const column of data) {
      assert.equal(column.headBorder, "1px", column.col);
      assert.ok(column.cells.length > 0);
      for (const cell of column.cells) { assert.equal(cell.border, "1px", column.col); assert.ok(Math.abs(cell.edge - column.head) <= 1, `${column.col}: ${cell.edge} против ${column.head}`); }
    }
  });
}
