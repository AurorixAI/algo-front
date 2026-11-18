// Money-2 fix 10 (п.4): «Зачислить учеников» at 375 - the body is ONE scrolling area (search, list, blocks), the buttons stay at the bottom; nothing lies over anything at 0 / 1 / 4 chosen, with the individual price open and with plates.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, OWNER } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const X = require("./helpers/money2-fix7.cjs");

const ctx = setup(test);
const PEOPLE = [["st9", "Новый"], ["st8", "Второй"], ["st7", "Третий"], ["st6", "Четвёртый"]];
async function open(width, chosen, undone = []) {
  const server = X.drawerServer(undone, (r) => (r.method === "GET" && r.path === "/auth/org/students" ? { json: { items: PEOPLE.map(([id, last]) => X.STUDENT(id, last)), total: 4 } } : null));
  const run = await openPage(ctx.browser, "money-b.entry.tsx", server, { width, height: width === 375 ? 812 : 900 });
  await run.page.evaluate(() => window.mount("addDrawer", { role: "owner", org_role: "owner" }, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 380000, valid_from: "2026-09-01" } }));
  await run.page.fill('input[placeholder^="Поиск по имени"]', "Уч");
  for (const i of chosen) await run.page.click(`button:has-text("${PEOPLE[i][1]}")`);
  await run.page.waitForTimeout(600);
  return run;
}
const geometry = () => {
  const box = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
  const body = document.querySelector('[role="dialog"] [data-modal-part="body"]');
  const search = box('input[placeholder^="Поиск по имени"]'), list = box('[data-testid="enrol-list"]'), blocks = box('[data-testid="enrol-blocks"]'), foot = box('[data-modal-part="footer"]'), bodyBox = body.getBoundingClientRect();
  const visibleRows = [...document.querySelectorAll('[data-testid="enrol-list"] button')].filter((b) => { const r = b.getBoundingClientRect(); return r.top >= bodyBox.top - 1 && r.bottom <= bodyBox.bottom + 1; }).length;
  return { searchBottom: search.bottom, listTop: list.top, listBottom: list.bottom, blocksTop: blocks && blocks.height ? blocks.top : null, footTop: foot.top, bodyBottom: bodyBox.bottom, visibleRows, bodyScrolls: body.scrollHeight > body.clientHeight + 1, listOwnScroll: list.height < document.querySelector('[data-testid="enrol-list"]').scrollHeight - 1, hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
};

for (const [label, chosen, undone, price] of [["0 chosen", [], [], false], ["1 chosen", [0], [], false], ["4 chosen", [0, 1, 2, 3], [], false], ["4 chosen, individual price open", [0, 1, 2, 3], [], true], ["4 chosen, two come back", [0, 1, 2, 3], ["st9", "st7"], false]]) {
  test(`phone 375, ${label}: one scrolling body, the search over the list over the blocks, the buttons at the bottom, nothing overlaps`, async () => {
    const run = await open(375, chosen, undone);
    if (price) { await run.page.locator('button[role="switch"]:has-text("Индивидуальная цена")').first().click(); await run.page.waitForTimeout(250); }
    const g = await run.page.evaluate(geometry);
    assert.ok(g.listTop >= g.searchBottom - 1, `the list starts under the search ${JSON.stringify(g)}`);
    if (g.blocksTop !== null) assert.ok(g.blocksTop >= g.listBottom - 1, `the blocks stand under the list ${JSON.stringify(g)}`);
    assert.ok(g.footTop >= g.bodyBottom - 1, "the buttons are under the body");
    assert.equal(g.listOwnScroll, false, "the list does not scroll by itself (one area)");
    assert.equal(g.hscroll, false);
    // at the top of the body the person sees the search and at least three rows of the list
    await run.page.evaluate(() => { document.querySelector('[role="dialog"] [data-modal-part="body"]').scrollTop = 0; });
    const top = await run.page.evaluate(geometry);
    assert.ok(top.visibleRows >= 3, `three rows visible: ${top.visibleRows}`);
    const facts = await run.page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    await run.page.close();
  });
}

test("1280: the list keeps its own scroll, the blocks stand under it, the buttons in the footer", async () => {
  const run = await open(1280, [0]);
  const g = await run.page.evaluate(geometry);
  assert.ok(g.blocksTop >= g.listBottom - 1 && g.footTop >= g.bodyBottom - 1, JSON.stringify(g));
  assert.equal(g.hscroll, false);
  await run.page.close();
});
