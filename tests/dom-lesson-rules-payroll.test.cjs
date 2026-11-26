// LESSON-RULES Э6: the sheet of a teacher - «N отмен ждут подтверждения» among the affairs of the block «Что нужно сделать» and the refusal of the saving (409 UNCONFIRMED_CANCELLATIONS) in the server's words.
// The warnings are the server's own contract (tests/fixtures/logicA: the keys `unconfirmed_cancellations` / `unconfirmed_items`); the refusal of the saving is tested in lesson-rules-units.test.cjs.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { setup } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { plain, WORLD_DAY } = require("./helpers/lesson-rules-answers.cjs");

const ctx = setup(test);
const REAL = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "lessonRules", "payroll_calculate_waiting.json"), "utf8")).sheets[0].warnings;   // the sheet of the world: November of Эргашев К.
const ITEM = REAL.unconfirmed_items[1];
const warnings = (over) => ({ ...REAL, open_lessons: 0, open_lesson_items: [], unconfirmed_cancellations: 0, unconfirmed_items: [], pending_excused: 0, no_fee: 0, unpaid: 0, unpaid_students: [], ...over });

async function open(counts, width = 1280) {
  const run = await openPage(ctx.browser, "lesson-rules.entry.tsx", () => null, { width, height: width === 375 ? 800 : 900, today: "2026-12-02" });
  await run.page.evaluate(([who, c]) => window.mount("sheet-todo", who, { counts: c }), [{ role: "owner", org_role: "owner" }, counts]);
  return run;
}

for (const width of [1280, 1024, 375]) {
  test(`${width}: the item «1 отмена ждёт подтверждения» stands FIRST in «Что нужно сделать» and leads to «Замены» with the button «Решить»`, async () => {
    const { page, errors } = await open(REAL, width);
    await page.waitForSelector('[data-testid="sheet-todo"]');
    const items = page.locator('[data-testid="sheet-todo-item"]');
    assert.equal(await items.count(), 3);
    assert.match(plain(await items.nth(0).textContent()), /^2 отмены ждут подтверждения\s*Решить$/);
    assert.match(plain(await items.nth(1).textContent()), /^6 уроков без отметки/, "the real sheet: the cancellations stand BEFORE the lessons without a mark");
    assert.match(plain(await items.nth(2).textContent()), /^у 3 учеников нет цены/);
    assert.equal(await items.nth(0).locator("a").getAttribute("href"), "/owner/substitutions");
    const probe = await page.evaluate(layoutProbe, "body");
    assert.deepEqual([probe.bad, probe.scroll > 0], [[], false]);
    assert.deepEqual(errors, []);
    await page.close();
  });
}

test("the number is said right: 1 отмена ждёт / 2 отмены ждут / 5 отмен ждут; zero says nothing (the real sheet has 2; the other warnings are zeroed to see the line alone)", async () => {
  for (const [n, text] of [[1, "1 отмена ждёт подтверждения"], [2, "2 отмены ждут подтверждения"], [5, "5 отмен ждут подтверждения"], [21, "21 отмена ждёт подтверждения"]]) {
    const { page } = await open(warnings({ unconfirmed_cancellations: n, unconfirmed_items: [ITEM] }));
    assert.match(plain(await page.textContent('[data-testid="sheet-todo-item"]')), new RegExp(`^${text}`));
    await page.close();
  }
  const { page } = await open(warnings({}));
  assert.equal(await page.locator('[data-testid="sheet-todo"]').count(), 0, "nothing waits: no block");
  await page.close();
});
