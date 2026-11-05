// UX round of the owner (05.11): the list of the salaries of a month in a real browser WITH the real CSS of the project - nothing of a row runs out of its own cell into the next column,
// on a wide screen (the table, 1280), on a tablet (cards, 1024) and on a phone (cards, 375); ONE line of what needs an action under the name; the rate in short lines; the change after the
// saving said once (the status chip); the payout column holds the chip only.  The CSS is built by tailwind from the sources (as the build does), the page is a fixed clock-free render.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const PAYOUT = { saved_total: 120834, fresh_total: 75834, target: 75834, paid: 150000, balance: -74166, state: "overpaid", basis: "fresh", changed_by: -45000, change_text: null, text: "x", items: [], carry_in: 0, carry_used: 0, advance_out: 0 };
const KAMOL = { teacher_id: "t1", teacher_name: "Камол Эргашев", lessons_count: 4, lesson_types: [], rates: { group: "50", individual: "60" }, missing_rates: [], undecided_lessons: 1,
  sheet: { id: "s1", revision: 2, total_amount: 120834, stale: true, updated_at: "2026-11-05T05:00:00" }, warnings: { open_lessons: 1, pending_excused: 0, no_fee: 0, unpaid: 8, unpaid_students: 1 }, payout: PAYOUT, __period: { state: "open", closedOn: null, reopened: null } };
const LOLA = { teacher_id: "t2", teacher_name: "Лола Мирзаева-Абдувахидова Рахимовна", lessons_count: 0, lesson_types: [], rates: { group: "50" }, missing_rates: ["pair"], sheet: null,
  warnings: { open_lessons: 12, pending_excused: 3, no_fee: 14, unpaid: 0 }, undecided_lessons: 12, payout: null, __period: null };
const NONE = { teacher_id: "t3", teacher_name: "Без ставки", lessons_count: 2, lesson_types: [], rates: {}, missing_rates: ["group"], sheet: null, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 }, payout: null, __period: null };

async function render(width, viewport) {
  const run = await openPage(browser, "money.entry.tsx", () => null, { width: viewport, height: 900 });
  await run.page.evaluate(([w, teachers]) => window.mount("monthRows", { role: "owner", org_role: "owner" }, { width: w, teachers }), [width, [KAMOL, LOLA, NONE]]);
  await run.page.waitForSelector('[data-testid="teacher-attention"]');
  return run;
}

// the content area of the screen: the viewport less the sidebar (240) and the padding of the page; a phone has no sidebar
const SCREENS = [[1280, 1000, "table"], [1024, 740, "cards"], [375, 343, "cards"]];

for (const [viewport, width, kind] of SCREENS) {
  test(`${viewport}: nothing of a row runs out of its cell (${kind}); no horizontal scroll`, async () => {
    const { page } = await render(width, viewport);
    const facts = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("ul > li")];
      const bad = [];
      for (const row of rows) {
        const rowBox = row.getBoundingClientRect();
        for (const cell of row.children) {
          const box = cell.getBoundingClientRect();
          if (cell.scrollWidth > cell.clientWidth + 1) bad.push(`cell of ${row.querySelector("p")?.textContent}: scrollWidth ${cell.scrollWidth} > ${cell.clientWidth}`);
          // every piece of text of the cell lies inside the cell
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent.trim() || node.parentElement.closest(".sr-only")) continue;           // the text of a hint for a screen reader is not drawn
            const range = document.createRange(); range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              if (rect.width > 0 && (rect.right > box.right + 1 || rect.left < box.left - 1)) bad.push(`text «${node.textContent.trim().slice(0, 40)}» is outside its cell (${Math.round(rect.right)} > ${Math.round(box.right)})`);
            }
          }
          if (box.right > rowBox.right + 1) bad.push("a cell is wider than its row");
        }
      }
      return { bad, rows: rows.length, scroll: document.documentElement.scrollWidth - window.innerWidth };
    });
    assert.equal(facts.rows, 3);
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0, "no horizontal scroll of the page");
    await page.close();
  });
}

test("the row of the list: the name and the lessons, ONE line of what needs an action, the rate in short lines, the change once, the payout column holds the chip only", async () => {
  const { page } = await render(1000, 1280);
  const kamol = page.locator("ul > li").nth(0);
  const text = (await kamol.textContent()).replace(/\s+/g, " ").replace(/ /g, " ");
  // the name cell: the name, «N уроков за месяц», ONE line of attention with two actions; the note about the unpaid is not here
  assert.equal(await kamol.locator('[data-testid="teacher-attention"]').count(), 1);
  assert.match((await kamol.locator('[data-testid="teacher-attention"]').textContent()).replace(/\s+/g, " "), /^1 незакрытый урок · 1 доп\. урок ждёт решения/);
  assert.ok(!/не оплат|посещени/.test(text), `the note is on the sheet, not in the list: ${text}`);
  // the rate: two short lines, no «·»
  const rate = (await kamol.locator('[data-testid="teacher-rate"]').innerText()).split("\n").map((line) => line.trim()).filter(Boolean);
  assert.deepEqual(rate, ["Группа 50%", "Индив. 60%"]);
  // the status chip says the change, the payout column only the state of the payout; the month is a small word
  assert.match(text, /Изменилась на −45 000 сум/);
  assert.equal(await kamol.locator("text=/Изменилась на/").count(), 1, "said once: the status chip");
  assert.equal(await kamol.locator("text=/изменилось на/").count(), 0, "not a second time under the payout");
  assert.ok(!(await kamol.locator('[data-testid="payout-chip"]').locator("xpath=..").textContent()).includes("изменил"), "the payout column holds the chip only");
  assert.equal((await kamol.locator('[data-testid="payout-chip"]').textContent()).replace(/\s+/g, " ").trim(), "Переплачено 74 166 сум");
  assert.equal(await kamol.locator('[data-testid="payout-change"]').count(), 0);
  assert.equal((await kamol.locator('[data-testid="period-open"]').textContent()).trim(), "Месяц открыт");
  assert.equal(await kamol.locator('[data-testid="period-chip"]').count(), 0, "an open month is not a chip");
  // a long list of actions of the second teacher is still ONE paragraph
  const lola = page.locator("ul > li").nth(1);
  assert.equal(await lola.locator('[data-testid="teacher-attention"]').count(), 1);
  assert.equal(await lola.locator("p[data-testid='teacher-attention'] a").count(), 4, "unfinished lessons, excuses, prices, additional lessons");
  // a rate that is missing: the kinds that are set, then «Парный — нет ставки» and the link
  const lolaRate = (await lola.locator('[data-testid="teacher-rate"]').innerText()).split("\n").map((line) => line.trim()).filter(Boolean);
  assert.deepEqual(lolaRate.slice(0, 2), ["Группа 50%", "Парный — нет ставки"]);
  assert.ok(lolaRate.includes("Указать"));
  await page.close();
});
