// Money-2 fix 10 (п.4) in the form of the mock-up of 19.11: «Зачислить в группу» at 375 - the body is ONE scrolling area (search, labels, special rows, list, conditions), the bottom bar with the button stays at the bottom;
// nothing lies over anything at 0 / 1 / 4 chosen, with the conditions open and with special rows; every tap target is 40 px.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup } = require("./helpers/money2-w2.cjs");
const { layoutProbe, touchTargets } = require("./helpers/layout-probe.cjs");
const H = require("./helpers/enrol-v2.cjs");

const ctx = setup(test);
const PEOPLE = [H.STUDENT("st9", "Новый", "Ученик"), H.STUDENT("st8", "Второй", "Ученик"), H.STUDENT("st7", "Третий", "Ученик"), H.STUDENT("st6", "Четвёртый", "Ученик"), ...Array.from({ length: 6 }, (_, i) => H.STUDENT(`sx${i}`, `Лишний${i}`, "Ученик"))];
const NAMES = ["Новый", "Второй", "Третий", "Четвёртый"];
async function open(width, chosen, undone = []) {
  const run = await H.openDrawer(ctx, H.server({ people: PEOPLE, undone, ordinary: ["st8"] }), { width });
  for (const i of chosen) await H.pick(run.page, NAMES[i]);
  await run.page.waitForTimeout(600);
  return run;
}
const geometry = () => {
  const box = (sel) => { const el = document.querySelector(sel); return el && el.getClientRects().length > 0 ? el.getBoundingClientRect() : null; };
  const body = document.querySelector('[role="dialog"] [data-modal-part="body"]');
  const dialog = document.querySelector('[role="dialog"]');
  const search = box('input[aria-label="Поиск по имени или ID"]'), chips = box('[data-testid="picked-chips"]'), list = box('[data-testid="enrol-list"]'), exceptions = box('[data-testid="enrol-exceptions"]'), terms = box('[data-testid="enrol-terms"]');
  const foot = box('[data-modal-part="footer"]'), bar = box('[data-testid="summary-bar"]'), bodyBox = body.getBoundingClientRect();
  const visibleRows = [...document.querySelectorAll("[data-student-row]")].filter((b) => { const r = b.getBoundingClientRect(); return r.top >= bodyBox.top - 1 && r.bottom <= bodyBox.bottom + 1; }).length;
  const scrollers = [...dialog.querySelectorAll("*")].filter((el) => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)).length;
  return { searchBottom: search.bottom, chipsTop: chips ? chips.top : null, chipsBottom: chips ? chips.bottom : null, listTop: list ? list.top : null, listBottom: list ? list.bottom : null, exceptionsTop: exceptions ? exceptions.top : null, termsTop: terms ? terms.top : null, footTop: foot.top, barBottom: bar.bottom, vh: window.innerHeight, bodyBottom: bodyBox.bottom, visibleRows, scrollers, hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
};

for (const [label, chosen, undone, terms] of [["0 chosen", [], [], false], ["1 chosen", [0], [], false], ["4 chosen", [0, 1, 2, 3], [], false], ["4 chosen, conditions open", [0, 1, 2, 3], [], true], ["4 chosen, two come back", [0, 1, 2, 3], ["st9", "st7"], false]]) {
  test(`phone 375, ${label}: one scrolling body, the search over the labels over the special rows over the list over the conditions, the bar at the bottom, nothing overlaps`, async () => {
    const run = await open(375, chosen, undone);
    if (terms) { await run.page.click('[data-testid="enrol-terms-toggle"]'); await run.page.waitForTimeout(250); }
    const g = await run.page.evaluate(geometry);
    if (terms) assert.equal(g.listTop, null, "the conditions are open: the list is folded up to the labels");
    if (g.chipsTop !== null) { assert.ok(g.chipsTop >= g.searchBottom - 1, `the labels under the search ${JSON.stringify(g)}`); if (g.listTop !== null) assert.ok(g.listTop >= g.chipsBottom - 1, "the list under the labels"); } else assert.ok(g.listTop >= g.searchBottom - 1, `the list under the search ${JSON.stringify(g)}`);
    // Money-2 fix 11 (F6b): on a phone the special rows stand right under the labels, BEFORE the list of the rest - they are seen without scrolling
    if (g.exceptionsTop !== null) { assert.ok(g.exceptionsTop >= (g.chipsBottom ?? g.searchBottom) - 1, `the special rows under the labels ${JSON.stringify(g)}`); if (g.listTop !== null) assert.ok(g.listTop >= g.exceptionsTop, `and over the list ${JSON.stringify(g)}`); }
    if (g.termsTop !== null && g.exceptionsTop !== null) assert.ok(g.termsTop >= g.exceptionsTop, "the conditions after the special rows");
    assert.ok(g.footTop >= g.bodyBottom - 1, "the bar is under the body");
    assert.ok(Math.abs(g.barBottom - g.vh) <= 1, "and pinned to the bottom of the screen");
    assert.ok(g.scrollers <= 1, `one scrolling area, found ${g.scrollers}`);
    assert.equal(g.hscroll, false);
    // at the top of the body the person sees the search and, with the list on the screen, at least two rows of it
    await run.page.evaluate(() => { document.querySelector('[role="dialog"] [data-modal-part="body"]').scrollTop = 0; });
    const top = await run.page.evaluate(geometry);
    if (!terms) assert.ok(top.visibleRows >= (chosen.length <= 1 ? 3 : 2), `rows visible: ${top.visibleRows}`);
    const facts = await run.page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.deepEqual(await run.page.evaluate(touchTargets, '[role="dialog"]'), [], "every tap target is 40 px");
    await run.page.close();
  });
}

test("1280: the special rows and the conditions stand under the list in the same body, the bar is the footer", async () => {
  const run = await open(1280, [0, 1]);
  const g = await run.page.evaluate(geometry);
  assert.ok(g.exceptionsTop === null || g.exceptionsTop >= g.listBottom - 1, JSON.stringify(g));
  assert.ok(g.termsTop >= g.listBottom - 1 && g.footTop >= g.bodyBottom - 1, JSON.stringify(g));
  assert.equal(g.hscroll, false);
  await run.page.close();
});
