// Money-2 fix 10 (п.3): the statement at 1280 - the three money columns CENTRED (heading, value, chip), the «⋯» in its own ruled column «Действия с записью», the lines of the four borders run through the whole table.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { statementServer } = require("./helpers/statement-all-kinds.cjs");
const { F } = require("./helpers/money2-fix7.cjs");

const ctx = setup(test);
async function open(width) {
  const run = await openPage(ctx.browser, "money2.entry.tsx", statementServer(F.SHORT), { width, height: 900 });
  await run.page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
  await run.page.waitForSelector('[data-testid="statement-row-transfer_in"]');
  await run.page.waitForTimeout(300);
  return run;
}
/** column -> centre of the heading text, centre of the value of every row (the text), the column of the lines */
const measure = () => {
  const centre = (el) => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return b.left + b.width / 2; };
  const rightOf = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().right; };
  const head = document.querySelector('[data-testid="statement-table"] .dt-head');
  const out = {};
  for (const col of ["charged", "paid", "balance"]) {
    const h = head.querySelector(`[data-col="${col}"]`);
    const rows = [...document.querySelectorAll(`[data-testid="statement-table"] .dt-row .dt-cell[data-col="${col}"]`)].filter((c) => (col === "balance" ? c.querySelector('[data-testid="statement-open"]') : c.textContent.trim() !== ""));
    const cell = h.getBoundingClientRect();
    out[col] = { head: centre(h), headRight: rightOf(h), valuesRight: rows.map((c) => rightOf(c.querySelector(".dt-value"))), values: rows.map((c) => centre(c.querySelector(".dt-value"))), cellCentre: cell.left + cell.width / 2, chips: rows.filter((c) => c.querySelector('[data-testid="statement-open"]')).length };
  }
  const lines = {};
  for (const col of ["charged", "paid", "balance", "menu"]) {
    const cells = [head.querySelector(`[data-col="${col}"]`), ...document.querySelectorAll(`[data-testid="statement-table"] .dt-row .dt-cell[data-col="${col}"]`)];
    const rects = cells.map((c) => c.getBoundingClientRect());
    const gaps = rects.slice(1).map((r, i) => Math.round((r.top - rects[i].bottom) * 10) / 10);
    lines[col] = { border: getComputedStyle(cells[0]).borderLeftWidth, borders: cells.map((c) => getComputedStyle(c).borderLeftWidth), left: rects.map((r) => Math.round(r.left * 10) / 10), gaps, count: cells.length };
  }
  return { out, lines };
};

test("statement 1280: «Остаток» - heading, value and chip stand at ONE centre (<= 1 px), every row; «Стоимость» / «Оплачено» - the heading and every sum end on ONE right edge (Б11.22 п.6)", async () => {
  const run = await open(1280);
  const { out } = await run.page.evaluate(measure);
  for (const [col, m] of Object.entries(out)) {
    assert.ok(m.values.length >= (col === "balance" ? 2 : 3), col);          // «Остаток»: only the rows the server named something for (the two charges)
    if (col === "balance") for (const v of m.values) assert.ok(Math.abs(v - m.head) <= 1, `${col}: value ${v} heading ${m.head}`);
    else for (const v of m.valuesRight) assert.ok(Math.abs(v - m.headRight) <= 1.5, `${col}: right edge of a sum ${v}, of the heading ${m.headRight}`);
  }
  assert.ok(out.balance.chips >= 2, "the cells of «Остаток» (word or chip) are measured too");
  await run.page.close();
});

test("statement 1280: the four lines (charged | paid | balance | menu) are unbroken from the header to the last row, the menu is a cell of its own", async () => {
  const run = await open(1280);
  const { lines } = await run.page.evaluate(measure);
  for (const [col, l] of Object.entries(lines)) {
    assert.deepEqual([...new Set(l.borders)], ["1px"], `${col} has a line on every cell`);
    assert.equal(new Set(l.left).size, 1, `${col}: one left edge`);
    // the only break is the band of the month («Ноябрь 2026» spans every column, there is one in this statement)
    const breaks = l.gaps.filter((gap) => gap > 1.01 || gap < -0.01);
    assert.ok(breaks.length <= 1 && breaks.every((gap) => gap > 20 && gap < 60), `${col}: line broken, gaps ${JSON.stringify(l.gaps)}`);
  }
  const labels = await run.page.evaluate(() => [...document.querySelectorAll('[data-testid="statement-table"] button[aria-label]')].map((b) => [b.getAttribute("aria-label"), b.getAttribute("title")]));
  assert.ok(labels.some(([a]) => /^Действия с записью: /.test(a)));
  for (const [a, t] of labels.filter(([a]) => /Действия/.test(a))) assert.equal(t, "Действия с записью", "the hover hint is the short one");
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal scroll");
  await run.page.close();
});

test("statement: cards (1024 with the panel, 375) are unchanged - no ruled column, a card is not a table", async () => {
  for (const [width, root] of [[1024, 720], [375, null]]) {
    const run = await openPage(ctx.browser, "money2.entry.tsx", statementServer(F.SHORT), { width, height: 900 });
    await run.page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
    await run.page.waitForSelector('[data-testid="statement-row-transfer_in"]');
    if (root) await run.page.evaluate((w) => { document.getElementById("root").style.width = `${w}px`; }, root);
    await run.page.waitForTimeout(300);
    const cell = await run.page.evaluate(() => { const el = document.querySelector('.dt-cell[data-col="charged"]'); const s = getComputedStyle(el); return { border: s.borderLeftWidth, ml: s.marginLeft }; });
    assert.deepEqual(cell, { border: "0px", ml: "0px" }, `${width}: card cell without line`);
    await run.page.close();
  }
});
