// Money-2 fix 10Д (the owner's remark on the snapshot: «непонятно, какой ученик выбран»): the chosen students are pinned on top in the order of choosing, a chosen row is a filled box on the tone «выбрано»
// (role=checkbox + aria-checked), every row has the same look (a box on the left, no letter avatar), a thin divider «Ещё ученики» only when both groups exist, the search never hides a chosen student,
// one and four chosen are on the screen without scrolling at 1280x900 and 375x812; the same list serves the mass transfer.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const H = require("./helpers/money2-fix10e.cjs");
const { NOV } = H;

const ctx = setup(test);
const PEOPLE = Array.from({ length: 12 }, (_, i) => [`st${i + 1}`, `Сц${String(i + 1).padStart(2, "0")}`, "Тест"]);
const imm = Object.fromEntries(PEOPLE.map(([id]) => [id, NOV]));
/** the answer of the list follows the search (as the server does) */
function server(extra = {}) {
  const base = H.server({ people: PEOPLE, immediate: imm, past: {}, ordinary: [], undone: [] });
  return (request) => {
    if (request.method === "GET" && request.path === "/auth/org/students") {
      const term = decodeURIComponent((/search=([^&]*)/.exec(request.query) || [])[1] || "");
      const items = base(request).json.items.filter((s) => !term || `${s.last_name} ${s.first_name}`.toLowerCase().includes(term.toLowerCase()));
      return { json: { items, total: items.length } };
    }
    return extra.wrap ? extra.wrap(request, base) : base(request);
  };
}
async function open(width, handler = server()) {
  const run = await openPage(ctx.browser, "money-b.entry.tsx", handler, { width, height: width === 375 ? 812 : 900 });
  await run.page.evaluate(() => window.mount("addDrawer", { role: "owner", org_role: "owner" }, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 450000, valid_from: "2026-09-01" } }));
  await run.page.waitForSelector('[data-testid="enrol-list"] button');
  return run;
}
const pick = async (page, name) => { await page.evaluate((n) => [...document.querySelectorAll('[data-testid="enrol-list"] button')].find((b) => b.textContent.includes(n)).scrollIntoView({ block: "center" }), name); await page.click(`[data-testid="enrol-list"] button:has-text("${name}")`); await page.waitForTimeout(150); };
const order = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="enrol-list"] button')].map((b) => ({ name: b.textContent.slice(0, 5), on: b.getAttribute("aria-checked") })));
const inView = (page, names) => page.evaluate((list) => {
  const scrollBox = [document.querySelector('[data-testid="enrol-list"]'), document.querySelector('[data-testid="enrol-list"]').parentElement].map((e) => e.getBoundingClientRect());
  const footer = document.querySelector('[data-testid="enrol-blocks"]');
  return list.map((n) => { const b = [...document.querySelectorAll('[data-testid="enrol-list"] button')].find((x) => x.textContent.includes(n)); const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0 && getComputedStyle(b).visibility === "visible"; });
}, names);

test("the chosen stand first in the order of choosing; the divider «Ещё ученики» only when both kinds exist; unchoosing returns the row to the rest", async () => {
  for (const width of [1280, 375]) {
    const run = await open(width);
    assert.equal(await run.page.locator('[data-testid="enrol-others-title"]').count(), 0, "nobody chosen - no divider");
    await pick(run.page, "Сц05"); await pick(run.page, "Сц02"); await pick(run.page, "Сц09");
    const rows = await order(run.page);
    assert.deepEqual(rows.slice(0, 5).map((r) => r.name), ["Сц05 ", "Сц02 ", "Сц09 ", "Сц01 ", "Сц03 "]);
    assert.deepEqual(rows.slice(0, 4).map((r) => r.on), ["true", "true", "true", "false"]);
    assert.equal(await run.page.locator('[data-testid="enrol-others-title"]').count(), 1);
    assert.equal(plain(await run.page.locator('[data-testid="enrol-others-title"]').textContent()), "Ещё ученики");
    // the divider stands between the chosen and the rest
    assert.equal(await run.page.evaluate(() => document.querySelector('[data-testid="enrol-others-title"]').nextElementSibling.getAttribute("aria-checked")), "false");
    assert.equal(await run.page.evaluate(() => document.querySelector('[data-testid="enrol-others-title"]').previousElementSibling.getAttribute("aria-checked")), "true");
    // the summary lists them in the same order
    await run.page.waitForSelector('[data-testid="enrol-summary-name"]');
    assert.deepEqual((await run.page.locator('[data-testid="enrol-summary-name"]').allTextContents()).map((t) => t.slice(0, 5)), ["Сц05 ", "Сц02 ", "Сц09 "]);
    await pick(run.page, "Сц02");
    assert.deepEqual((await order(run.page)).slice(0, 4).map((r) => r.name), ["Сц05 ", "Сц09 ", "Сц01 ", "Сц02 "]);
    for (const n of ["Сц05", "Сц09"]) await pick(run.page, n);
    assert.equal(await run.page.locator('[data-testid="enrol-others-title"]').count(), 0, "nobody chosen again - no divider");
    await run.page.close();
  }
});

test("the look of a chosen row: aria-checked, the tone «выбрано» (bg-primary-50) and a filled box; every row has a box on the left and no letter avatar", async () => {
  const run = await open(1280);
  await pick(run.page, "Сц03");
  const look = await run.page.evaluate(() => [...document.querySelectorAll('[data-testid="enrol-list"] button')].slice(0, 2).map((b) => ({ role: b.getAttribute("role"), checked: b.getAttribute("aria-checked"), cls: b.className, box: b.firstElementChild.className, rounded: b.querySelectorAll(".rounded-full").length })));
  assert.equal(look[0].role, "checkbox"); assert.equal(look[0].checked, "true");
  assert.match(look[0].cls, /\bbg-primary-50\b/); assert.match(look[0].box, /bg-primary-600/);
  assert.equal(look[1].checked, "false"); assert.doesNotMatch(look[1].cls, /bg-primary-50/); assert.match(look[1].box, /bg-white/);
  assert.equal(look[0].box.split(" ").includes("rounded-md"), true); assert.equal(look[1].box.split(" ").includes("rounded-md"), true);
  // the only round thing in a row is the status pill (no letter avatar)
  assert.deepEqual(look.map((l) => l.rounded), [1, 1]);
  await run.page.close();
});

test("the search never hides a chosen student: he stays on top although he does not match, under him the matches", async () => {
  const run = await open(1280);
  await pick(run.page, "Сц07");
  await run.page.fill('input[placeholder^="Поиск по имени"]', "Сц11"); await run.page.waitForTimeout(900);
  const rows = await order(run.page);
  assert.deepEqual(rows.map((r) => [r.name, r.on]), [["Сц07 ", "true"], ["Сц11 ", "false"]]);
  assert.equal(await run.page.locator('[data-testid="enrol-others-title"]').count(), 1);
  await run.page.fill('input[placeholder^="Поиск по имени"]', "Яяя"); await run.page.waitForTimeout(900);
  assert.deepEqual((await order(run.page)).map((r) => r.name), ["Сц07 "], "nothing matches - the chosen is still there, no «nothing found» over him");
  assert.equal(await run.page.locator('[data-testid="enrol-others-title"]').count(), 0);
  await run.page.close();
});

test("one and four chosen: their rows are on the screen without scrolling (1280x900 and 375x812) even when the list was scrolled down before choosing", async () => {
  for (const width of [1280, 375]) {
    const run = await open(width);
    await pick(run.page, "Сц11");
    assert.deepEqual(await inView(run.page, ["Сц11"]), [true], `one chosen at ${width}`);
    // the card under the list does not repeat his name (one student: no list of names)
    assert.equal(await run.page.locator('[data-testid="enrol-summary-name"]').count(), 0);
    for (const n of ["Сц12", "Сц10", "Сц09"]) await pick(run.page, n);
    await run.page.waitForTimeout(600);
    assert.deepEqual(await inView(run.page, ["Сц11", "Сц12", "Сц10", "Сц09"]), [true, true, true, true], `four chosen at ${width}`);
    await run.page.close();
  }
});

test("the same list is used by the mass transfer: the chosen stand first, as a checkbox", async () => {
  const run = await open(1280, server({ wrap: (request, base) => base(request) }));
  await run.page.click('[data-testid="enrol-list"] button:has-text("Сц04")');
  await run.page.click('[data-testid="enrol-list"] button:has-text("Сц01")');
  const rows = await order(run.page);
  assert.deepEqual(rows.slice(0, 3).map((r) => r.name), ["Сц04 ", "Сц01 ", "Сц02 "]);
  assert.equal(await run.page.locator('[data-testid="enrol-list"] button[role="checkbox"]').count(), PEOPLE.length);
  await run.page.close();
});
