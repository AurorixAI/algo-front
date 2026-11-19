// Money-2 fix 10Д (the owner's remark on the snapshot: «непонятно, какой ученик выбран») in the form of the mock-up of 19.11: the chosen students are LABELS with a cross under the search (in the order of choosing),
// the rest are rows with a native box in the list «Ещё ученики»; a chosen student is never lost to the search and never repeated in the list; one and four chosen are on the screen at 1280x900 and 375x812;
// the same list serves the mass transfer.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain } = require("./helpers/money2-w2.cjs");
const H = require("./helpers/enrol-v2.cjs");

const ctx = setup(test);
const PEOPLE = Array.from({ length: 12 }, (_, i) => H.STUDENT(`st${i + 1}`, `Сц${String(i + 1).padStart(2, "0")}`, "Тест"));
async function open(width, extra = {}) { return H.openDrawer(ctx, H.server({ people: PEOPLE, ...extra }), { width }); }
const chips = (page) => page.locator('[data-testid="picked-chip"] > span:first-child').allTextContents().then((list) => list.map((text) => text.slice(0, 4)));
const rows = (page) => page.evaluate(() => [...document.querySelectorAll("[data-student-row]")].map((row) => ({ name: row.textContent.slice(0, 4), on: row.querySelector("input").checked })));
const inView = (page, selector) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0 && getComputedStyle(el).visibility === "visible"; }), selector);
const label = (page) => page.locator('[data-testid="enrol-others-title"]').innerText().then(plain);

test("the chosen stand as labels in the order of choosing; the list says «Ещё ученики» once somebody is chosen; unchoosing returns the row to the list", async () => {
  for (const width of [1280, 375]) {
    const run = await open(width);
    const p = run.page;
    assert.equal(await p.locator('[data-testid="picked-chips"]').count(), 0, "nobody chosen - no labels");
    assert.equal(await label(p), "Ученики 7 класса · все классы");
    await H.pick(p, "Сц05", "Сц02", "Сц09");
    assert.deepEqual(await chips(p), ["Сц05", "Сц02", "Сц09"]);
    assert.deepEqual((await rows(p)).slice(0, 3).map((r) => r.name), ["Сц01", "Сц03", "Сц04"], "the chosen are not in the list again");
    assert.ok((await rows(p)).every((r) => r.on === false), "every row of the list is an unchecked box");
    assert.equal(await label(p), "Ещё ученики · все классы");
    await p.getByRole("button", { name: /Убрать: Сц02/ }).click();
    assert.deepEqual(await chips(p), ["Сц05", "Сц09"]);
    assert.ok((await rows(p)).some((r) => r.name === "Сц02"), "he is back among the rows");
    await p.getByRole("button", { name: /Убрать: Сц05/ }).click(); await p.getByRole("button", { name: /Убрать: Сц09/ }).click();
    assert.equal(await p.locator('[data-testid="picked-chips"]').count(), 0, "nobody chosen again - no labels");
    assert.equal(await label(p), "Ученики 7 класса · все классы");
    await p.close();
  }
});

test("the look: a chosen student is a label on the tone «выбрано» with a named cross; every row of the list has a native box on the left and no letter avatar", async () => {
  const run = await open(1280);
  await H.pick(run.page, "Сц03");
  const look = await run.page.evaluate(() => {
    const chip = document.querySelector('[data-testid="picked-chip"]');
    const row = document.querySelector("[data-student-row]");
    return { chipClass: chip.className, cross: chip.querySelector("button").getAttribute("aria-label"), box: row.querySelector('input[type="checkbox"]') !== null, label: row.querySelector("input").getAttribute("aria-label"), rowFirst: row.firstElementChild.querySelector("input") !== null, avatars: row.querySelectorAll(".rounded-full").length };
  });
  assert.match(look.chipClass, /\bbg-primary-50\b/); assert.equal(look.cross, "Убрать: Сц03 Тест");
  assert.equal(look.box, true); assert.equal(look.rowFirst, true, "the box stands first in the row"); assert.match(look.label, /^Сц\d\d Тест$/);
  assert.equal(look.avatars, 0, "no round avatar; the status is a rectangle tag");
  await run.page.close();
});

test("the search never hides a chosen student: his label stays although he does not match, the rows under it are the matches", async () => {
  const run = await open(1280);
  await H.pick(run.page, "Сц07");
  await H.search(run.page, "Сц11");
  assert.deepEqual(await chips(run.page), ["Сц07"]);
  assert.deepEqual((await rows(run.page)).map((r) => r.name), ["Сц11"]);
  await H.search(run.page, "Яяя");
  assert.deepEqual(await chips(run.page), ["Сц07"], "nothing matches - the chosen is still there");
  assert.equal(await run.page.locator("[data-student-row]").count(), 0);
  assert.equal(await run.page.getByText(/Ничего не найдено/).count(), 0, "no «nothing found» over a chosen student");
  await run.page.close();
});

test("one and four chosen: their labels are on the screen without scrolling (1280x900 and 375x812) even when the list was opened wide and scrolled before choosing", async () => {
  for (const width of [1280, 375]) {
    const run = await open(width);
    // a phone folds the list to five rows and opens the rest with «и ещё N»; a wide window holds all the rows and scrolls them inside
    if (width === 375) await run.page.click('[data-testid="enrol-list-more"]');
    await run.page.evaluate(() => document.querySelectorAll('[data-testid="enrol-list"], [role="dialog"] *').forEach((el) => { if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; }));
    await H.pick(run.page, "Сц11");
    assert.deepEqual(await inView(run.page, '[data-testid="picked-chip"]'), [true], `one chosen at ${width}`);
    for (const n of ["Сц12", "Сц10", "Сц09"]) await run.page.locator(`[data-student-row]:has-text("${n}")`).first().scrollIntoViewIfNeeded().then(() => H.pick(run.page, n));
    await run.page.evaluate(() => document.querySelectorAll('[role="dialog"] *').forEach((el) => { if (el.scrollTop > 0) el.scrollTop = 0; }));
    await run.page.waitForTimeout(400);
    assert.deepEqual(await inView(run.page, '[data-testid="picked-chip"]'), [true, true, true, true], `four chosen at ${width}`);
    // the bar does not repeat the names of the chosen (the labels above are their list)
    assert.equal(await run.page.locator('[data-testid="summary-bar"]').getByText("Сц11").count(), 0);
    await run.page.close();
  }
});

test("the same list is used by the mass transfer: the chosen from another group are labels too, the box of a row is native", async () => {
  const run = await open(1280);
  await H.pick(run.page, "Сц04", "Сц01");
  assert.deepEqual(await chips(run.page), ["Сц04", "Сц01"]);
  assert.equal(await run.page.locator('[data-testid="enrol-list"] li:visible input[type="checkbox"]').count(), PEOPLE.length - 2, "a wide window shows every row of the list (it scrolls inside)");
  assert.equal(await run.page.locator('[data-testid="enrol-list-more"]:visible').count(), 0, "no «и ещё N»");
  await run.page.close();
});
