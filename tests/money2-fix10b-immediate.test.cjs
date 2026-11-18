// Money-2 fix 10B: «Всего к оплате сразу» for several students is the card of one student (title + «?» + total, a row per student, the period under the name, «—» for a student with nothing to pay);
// the hint of several returning students is a paragraph per student (the name in bold); «Сразу платить не нужно».
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { setup, plain, OWNER } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const X = require("./helpers/money2-fix7.cjs");

const ctx = setup(test);
const LONG = "Золотухин-Белоусов-Сокольников Александр-Константин";
const PEOPLE = [["st9", "Новый", "Ученик"], ["st8", "Второй", "Ученик"], ["st7", "Третий", "Ученик"], ["st6", "Четвёртый", "Ученик"], ["st5", "Пятый", "Ученик"], ["st4", "Шестой", "Ученик"], ["st3", "Седьмой", "Ученик"], ["st2", "Золотухин-Белоусов-Сокольников", "Александр-Константин"]];
const PART = (label, from, amount, lessons, inPeriod, whole = false) => ({ label, from, amount, lessons, lessons_in_period: inPeriod, whole });
const ONE = [PART("ноябрь", "2026-11-04", 187000, 5, 12)];
const IMMEDIATE = { st9: ONE, st8: [PART("октябрь", "2026-10-27", 89000, 2, 9), PART("ноябрь", "", 380000, 12, 12, true)], st7: ONE, st6: ONE, st5: ONE, st4: ONE, st3: null, st2: ONE };
const sum = (parts) => parts.reduce((s, p) => s + p.amount, 0);
const ORDINARY = "Ученика убрали сегодня, но после этого ему простили долг 15 000 сум — поэтому он записывается заново: прежние индивидуальная цена и паузы не вернутся";

async function drawer(chosen, { undone = [], ordinary = [], width = 1280 } = {}) {
  const base = X.drawerServer(undone, (r) => (r.method === "GET" && r.path === "/auth/org/students" ? { json: { items: PEOPLE.map(([id, last, first]) => X.STUDENT(id, last, first)), total: PEOPLE.length } } : null), false, {});
  const server = (r) => {
    if (r.method === "POST" && /\/students\/bulk$/.test(r.path) && X.isDry(r)) {
      const ids = r.body.student_ids;
      const billing = (id) => (r.body.pay_from ? { pay_from: r.body.pay_from, explicit: true, default_pay_from: "2026-11-09", first_lesson: "2026-11-09", text: "x", immediate: IMMEDIATE[id] ? { amount: sum(IMMEDIATE[id]), lessons: 5, text: `К оплате сразу: ${sum(IMMEDIATE[id])} сум (за 5 уроков)`, parts: IMMEDIATE[id] } : null } : null);
      return { json: { group_id: "g2", added: ids.length, skipped: 0, skipped_details: [], warnings: [], dry_run: true, immediate_total: { text: "Всего к оплате сразу: 1 сум" }, students: ids.map((id) => ({ student_id: id, group_id: "g2", status: "added", billing: billing(id), past_balances: [], leave_undo: undone.includes(id) ? X.undoOf(true) : ordinary.includes(id) ? { undone: false, text: ORDINARY, restored: [] } : null })) } };
    }
    return base(r);
  };
  const run = await openPage(ctx.browser, "money-b.entry.tsx", server, { width, height: width === 375 ? 812 : 900 });
  await run.page.evaluate((w) => window.mount("addDrawer", w, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 380000, valid_from: "2026-09-01" } }), OWNER);
  await run.page.fill('input[placeholder^="Поиск по имени"]', "Уч").catch(() => {});
  for (const i of chosen) await run.page.click(`button:has-text("${PEOPLE[i][1]}")`);
  return run;
}
const pickDay = async (page) => { await page.fill("#add-student-pay-from", "04.11.2026"); await page.keyboard.press("Tab"); await page.waitForSelector('[data-testid="pay-from-immediate-block"]'); };

test("three students: the card of one student - the title with «?» and the total first, a row per student, no sentence of the server, periods read from the fields", async () => {
  for (const width of [1280, 375]) {
    const run = await drawer([0, 1, 2], { width });
    await pickDay(run.page);
    const block = run.page.locator('[data-testid="pay-from-immediate-block"]');
    const head = plain(await block.locator('[data-testid="pay-from-immediate-total"]').textContent());
    assert.ok(head.startsWith("Всего к оплате сразу") && head.endsWith("843 000 сум"), head);
    assert.equal(await block.locator('[data-testid="pay-from-immediate-help"]').count(), 1);
    const text = plain(await block.textContent());
    assert.ok(!/К оплате сразу:|за 5 уроков/.test(text), text);
    assert.equal(await block.locator('[data-testid="pay-from-immediate-student"]').count(), 3);
    const two = block.locator('[data-testid="pay-from-immediate-student"]', { hasText: "Второй Ученик" });
    assert.equal(plain(await two.locator('[data-testid="pay-from-immediate-student-sum"]').textContent()), "469 000 сум");
    const parts = await two.locator('[data-testid="pay-from-immediate-parts"] li span').allTextContents();
    assert.deepEqual(parts.map(plain), ["Октябрь, с 27.10 · 2 урока из 9", "89 000 сум", "Ноябрь, весь месяц", "380 000 сум"]);
    const one = block.locator('[data-testid="pay-from-immediate-student"]', { hasText: "Третий Ученик" });
    assert.equal(plain(await one.locator('[data-testid="pay-from-immediate-parts"]').textContent()), "Ноябрь, с 04.11 · 5 уроков из 12", "one period: the sum is not repeated");
    assert.ok(await block.locator(".tabular-nums").count() >= 4);
    assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `no horizontal scroll at ${width}`);
    await run.page.close();
  }
});

test("eight students (two long names, one with nothing to pay): names cut with «…» and whole in `title`, «—», one right edge, the block about 260 px and the list scrolls", async () => {
  for (const width of [1280, 375]) {
    const run = await drawer([0, 1, 2, 3, 4, 5, 6, 7], { width });
    await pickDay(run.page);
    const geo = await run.page.evaluate(() => {
      const block = document.querySelector('[data-testid="pay-from-immediate-block"]');
      const list = document.querySelector('[data-testid="pay-from-immediate-students"]');
      const rights = [...new Set([...document.querySelectorAll('[data-testid="pay-from-immediate-student-sum"]')].map((el) => Math.round(el.getBoundingClientRect().right)))];
      const cut = [...document.querySelectorAll('[data-testid="pay-from-immediate-name"]')].filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.getAttribute("title"));
      const dash = [...document.querySelectorAll('[data-testid="pay-from-immediate-student"]')].filter((el) => /Седьмой/.test(el.textContent)).map((el) => el.querySelector('[data-testid="pay-from-immediate-student-sum"]').textContent);
      return { block: block.getBoundingClientRect().height, scroll: list.scrollHeight > list.clientHeight + 4, rights, cut, dash, wide: document.documentElement.scrollWidth > window.innerWidth + 1 };
    });
    assert.ok(geo.block <= 270, `block ${geo.block}`);
    assert.equal(geo.scroll, true);
    assert.equal(geo.rights.length, 1, `one right edge: ${geo.rights}`);
    assert.ok(geo.cut.includes(LONG), `the long name is cut and whole in the title: ${geo.cut}`);
    assert.deepEqual(geo.dash, ["—"]);
    assert.equal(geo.wide, false);
    await run.page.close();
  }
});

test("the hint of several students: a paragraph per student (the name in bold on its own line), the rule line apart; the text for a screen reader keeps «имя: текст»", async () => {
  for (const [undone, ordinary, rule] of [[["st9", "st7"], [], true], [[], ["st8", "st7"], false]]) {
    const run = await drawer(rule ? [0, 1, 2] : [1, 2], { undone, ordinary, width: 375 });
    await run.page.waitForSelector('[data-testid="leave-undo-many"], [data-testid="leave-return-many"]');
    await run.page.locator('[data-testid="leave-undo-help"] [role="button"]').first().click();
    const tip = run.page.locator('[role="tooltip"]');
    await tip.waitFor();
    const students = tip.locator('[data-testid="leave-hint-student"]');
    assert.equal(await students.count(), 2);
    const first = students.first();
    assert.equal(await first.locator("span.font-semibold").count(), 1);
    assert.equal(await tip.locator('[data-testid="leave-hint-rule"]').count(), rule ? 1 : 0);
    if (rule) assert.equal(plain(await tip.locator('[data-testid="leave-hint-rule"]').textContent()), "Общие «Оплата с» и цена на них не действуют");
    const tops = await students.evaluateAll((els) => els.map((el) => [el.children[0].getBoundingClientRect().top, el.children[1].getBoundingClientRect().top]));
    assert.ok(tops.every(([name, body]) => body > name + 8), "the name is on its own line over the text");
    const reader = await run.page.locator('[role="button"][aria-label="Пояснение"]').first().getAttribute("aria-describedby");
    assert.match(await run.page.locator(`[id="${reader}"]`).textContent(), /Второй Ученик: |Новый Ученик: /);
    await run.page.close();
  }
});

test("«Сразу платить не нужно» replaces «К оплате сразу — ничего»", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "pay-from.ts"), "utf8");
  assert.ok(src.includes('PAY_FROM_NOTHING_NOW = "Сразу платить не нужно"'));
  assert.ok(!src.includes("К оплате сразу — ничего"));
});
