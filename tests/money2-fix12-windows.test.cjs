// Money-2 fix 12 (Д8, п.3, п.4): the window of the card of the student does not change its height while the person types in the search; the sentences of the server do not tear the name of a group at a hyphen; the sum of a group is one piece.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, OWNER } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");

const ctx = setup(test);
const g = (id, name, level, price) => ({ id, name, class_level: level, status: "active", teacher_id: "t1", teacher_name: "Камол Эргашев", price_current: { amount: price, label: "x" }, schedule: [], students_count: 3, max_students: 12 });
const GROUPS = [g("g1", "Алгебра 7 (вт/пт)", 7, 500000), g("g2", "М11 Б Пн-Ср-Пт", 11, 550000), g("g3", "М11 Г Вт-Чт-Сб", 11, 550000), g("g4", "М11 ВС Вт-Чт-Сб", 11, 550000), g("g5", "М12 А Пн-Ср-Пт", 12, 600000), g("g6", "Геометрия 8", 8, 360000)];
const server = (request) => {
  if (request.method === "GET" && request.path === "/auth/org/groups") return { json: GROUPS };
  if (request.method === "GET" && request.path === "/auth/org/members") return { json: [{ id: "t1", user_id: "t1", org_role: "teacher", first_name: "Эргашев", last_name: "К." }] };
  return null;
};
const dialogHeight = (page) => page.evaluate(() => Math.round(document.querySelector('[role="dialog"]').getBoundingClientRect().height * 100) / 100);

for (const width of [1280, 375]) {
  test(`${width}: the card window keeps its height while typing in the search («М11», «М11 Г», «zzzz», erased) - within 1 px of the height before the input`, async () => {
    const run = await openPage(ctx.browser, "money.entry.tsx", server, { width, height: width === 375 ? 812 : 900 });
    await run.page.evaluate(() => window.mount("assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
    await run.page.waitForSelector('[data-testid="assign-group-card"]');
    await run.page.waitForTimeout(300);
    const before = await dialogHeight(run.page);
    const seen = [["before", before]];
    for (const [label, text] of [["М11", "М11"], ["М11 Г", "М11 Г"], ["zzzz", "zzzz"], ["erased", ""]]) {
      await run.page.fill("#assign-group-search", text);
      await run.page.waitForTimeout(200);
      const h = await dialogHeight(run.page);
      seen.push([label, h]);
      assert.ok(Math.abs(h - before) <= 1, `${width}: «${label}» ${h} vs ${before}: ${JSON.stringify(seen)}`);
    }
    await run.page.fill("#assign-group-search", "zzzz");
    assert.equal(await run.page.getByText("Группы не найдены").count(), 1, "the empty result stands in the same area");
    console.log(`fix12 height ${width}: ${JSON.stringify(seen)}`);
    await run.page.close();
  });
}

test("1280: no empty box at the opening - the list is as tall as its content until the first input", async () => {
  const run = await openPage(ctx.browser, "money.entry.tsx", (r) => (r.method === "GET" && r.path === "/auth/org/groups" ? { json: GROUPS.slice(0, 2) } : server(r)), { width: 1280, height: 900 });
  await run.page.evaluate(() => window.mount("assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
  await run.page.waitForSelector('[data-testid="assign-group-card"]');
  const facts = await run.page.evaluate(() => ({ list: document.querySelector('[data-testid="assign-groups"]').getBoundingClientRect().height, inner: document.querySelector('[data-testid="assign-groups"] > div').getBoundingClientRect().height }));
  assert.ok(facts.list <= facts.inner + 1, JSON.stringify(facts));
  await run.page.close();
});

test("a group card: the sum with its unit is one piece (nowrap)", async () => {
  const run = await openPage(ctx.browser, "money.entry.tsx", server, { width: 375, height: 812 });
  await run.page.evaluate(() => window.mount("assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
  await run.page.waitForSelector('[data-testid="group-pick-price"]');
  const bad = await run.page.evaluate(() => [...document.querySelectorAll('[data-testid="group-pick-price"]')].filter((el) => getComputedStyle(el).whiteSpace !== "nowrap").length);
  assert.equal(bad, 0);
  await run.page.close();
});
