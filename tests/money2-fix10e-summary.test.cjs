// Money-2 fix 10Д: «Зачислить учеников» - ONE frame of the conditions (price + «Оплата с» in a row, the toggle under) and ONE summary card per student instead of four frames: the period said once when it is the same,
// the notes of a student in HIS row (debt / advance of the last time, «записывается заново», «общие цена и дата не действуют»), no sums for a role without money, the list keeps the picked rows on the screen.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, OWNER } = require("./helpers/money2-w2.cjs");
const { shown } = require("./helpers/money2-fix7.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const H = require("./helpers/money2-fix10e.cjs");
const { PART, NOV } = H;

const ctx = setup(test);
const THREE = [["st1", "СцМ14 М14-н7"], ["st2", "СцМ14 М14-2-а"], ["st3", "СцМ14 М14-н6"]];
const LONG = "Золотухин-Белоусов-Сокольников";
const EIGHT = [["st1", "Новый"], ["st2", "Второй"], ["st3", "Третий"], ["st4", "Четвёртый"], ["st5", LONG, "Александр-Константин"], ["st6", "Шестой"], ["st7", "Седьмой"], ["st8", "Восьмой-Подкрепляющийся-Долгофамильный"]];
const NO_MONEY = { role: "admin", org_role: "admin", payments_access: false };

async function drawer(sc, { width = 1280, who = OWNER, money = true } = {}) {
  const run = await openPage(ctx.browser, "money-b.entry.tsx", H.server({ people: sc.people, immediate: sc.imm ?? {}, past: sc.past ?? {}, ordinary: sc.ordinary ?? [], undone: sc.undone ?? [] }), { width, height: width === 375 ? 812 : 900 });
  await run.page.evaluate(([w, m]) => window.mount("addDrawer", w, m ? { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 450000, valid_from: "2026-09-01" } } : { refresh: false }), [who, money]);
  await run.page.waitForSelector('[data-testid="enrol-list"] button');
  for (const [, last] of sc.people) await run.page.click(`[data-testid="enrol-list"] button:has-text("${last}")`);
  await run.page.waitForSelector('[data-testid="enrol-summary"]'); await run.page.waitForTimeout(500);
  return run;
}
const card = (page) => page.locator('[data-testid="enrol-summary"]');
const rowOf = (page, name) => page.locator('[data-testid="enrol-summary-student"]', { hasText: name });
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test("the same period for all: said ONCE under the title, the rows carry only the name and the sum; the sum of the rows is the total; one right edge", async () => {
  for (const width of [1280, 375]) {
    const run = await drawer({ people: THREE, imm: { st1: NOV, st2: NOV, st3: NOV } }, { width });
    assert.equal(await run.page.locator('[data-testid="enrol-summary"]').count(), 1);
    assert.equal(await shown(card(run.page).locator('[data-testid="enrol-summary-head"]')), "Всего к оплате сразу564 000 сум");
    const period = await card(run.page).locator('[data-testid="enrol-summary-period"]').allTextContents();
    assert.deepEqual(period.map(plain), ["Ноябрь, с 19.11 · 5 уроков из 12 — каждому 188 000 сум"]);
    assert.equal(await card(run.page).locator('[data-testid="enrol-summary-student"] [data-testid="enrol-summary-period"]').count(), 0, "no period in the rows");
    const sums = (await card(run.page).locator('[data-testid="enrol-summary-sum"]').allTextContents()).map((t) => Number(plain(t).replace(/\D/g, "")));
    assert.equal(sums.reduce((a, b) => a + b, 0), 564000);
    const edges = await run.page.evaluate(() => [...document.querySelectorAll('[data-testid="enrol-summary-sum"], [data-testid="enrol-summary-total"]')].map((el) => Math.round(el.getBoundingClientRect().right)));
    assert.equal(new Set(edges).size, 1, `one right edge: ${edges}`);
    assert.ok(await run.page.evaluate(() => [...document.querySelectorAll('[data-testid="enrol-summary"] .tabular-nums')].length >= 4));
    assert.equal(await noHScroll(run.page), true);
    // one frame of the conditions: the price and the day in it, no yellow / grey plates of the old window
    assert.equal(await run.page.locator('[data-testid="add-price-settings"] [data-testid="pay-from"]').count(), 1);
    assert.equal(await run.page.locator('[data-testid="past-balances"], [data-testid="leave-return-many"], [data-testid="pay-from-immediate-block"]').count(), 0);
    await run.page.close();
  }
});

test("conditions frame at 1280: the price of the group on the left and «Оплата с» on the right of ONE row; at 375 one under the other", async () => {
  for (const width of [1280, 375]) {
    const run = await drawer({ people: THREE.slice(0, 2), imm: { st1: NOV, st2: NOV } }, { width });
    const geo = await run.page.evaluate(() => {
      const price = [...document.querySelectorAll('[data-testid="add-price-settings"] span')].find((el) => /Цена группы/.test(el.textContent)).getBoundingClientRect();
      const field = document.querySelector("#add-student-pay-from").getBoundingClientRect();
      return { sameRow: price.top < field.bottom && price.bottom > field.top, priceRight: price.right, fieldLeft: field.left };
    });
    if (width === 1280) { assert.equal(geo.sameRow, true); assert.ok(geo.priceRight < geo.fieldLeft); } else assert.equal(geo.sameRow, false);
    await run.page.close();
  }
});

test("different periods: every student has his own period under his name, no shared line", async () => {
  const run = await drawer({ people: THREE, imm: { st1: NOV, st2: [PART("октябрь", "2026-10-27", 89000, 2, 9), PART("ноябрь", "", 450000, 12, 12, true)], st3: [PART("ноябрь", "2026-11-26", 75000, 2, 12)] } });
  assert.equal(await card(run.page).locator(':scope > header [data-testid="enrol-summary-period"]').count(), 0);
  assert.equal(plain(await rowOf(run.page, "М14-н7").locator('[data-testid="enrol-summary-period"]').textContent()), "Ноябрь, с 19.11 · 5 уроков из 12");
  assert.deepEqual((await rowOf(run.page, "М14-2-а").locator('[data-testid="enrol-summary-period"] li span').allTextContents()).map(plain), ["Октябрь, с 27.10 · 2 урока из 9", "89 000 сум", "Ноябрь, весь месяц", "450 000 сум"]);
  assert.equal(plain(await rowOf(run.page, "М14-2-а").locator('[data-testid="enrol-summary-sum"]').textContent()), "539 000 сум");
  assert.match(plain(await rowOf(run.page, "М14-н6").locator('[data-testid="enrol-summary-period"]').textContent()), /^Ноябрь, с 26.11 · 2 урока из 12$/);
  await run.page.close();
});

test("the notes stand in the row of THEIR student: the debt of this group (the sum in the note, not in the right column), the advance of another group, «записывается заново»; one «Выписка» per balance", async () => {
  const run = await drawer({ people: THREE, imm: { st1: NOV, st2: NOV, st3: NOV }, past: { st2: [H.DEBT_SAME], st3: [H.ADVANCE_OTHER] }, ordinary: ["st2"] });
  const two = rowOf(run.page, "М14-2-а");
  assert.match(plain(await two.locator('[data-testid="enrol-note-past"]').textContent()), /^Долг с прошлого раза 15 000 сум · в этой же группе, ушёл 19\.11 Выписка$/);
  assert.equal(await two.locator('[data-testid="past-balance-link"]').count(), 1);
  assert.equal(plain(await two.locator('[data-testid="enrol-note-rewrite"] [data-testid="leave-undo-line"]').textContent()), "Записывается заново");
  assert.ok(plain(await two.locator('[data-testid="enrol-note-rewrite"] .sr-only').textContent()).includes("записывается заново"), "the server's words are in the «?»");
  assert.equal(plain(await two.locator('[data-testid="enrol-summary-sum"]').textContent()), "188 000 сум", "the debt is not added to the column");
  const three = rowOf(run.page, "М14-н6");
  assert.match(plain(await three.locator('[data-testid="enrol-note-past"]').textContent()), /^Аванс с прошлого раза 40 000 сум · в «Физика 9», ушёл 17\.11 Выписка$/);
  assert.equal(await rowOf(run.page, "М14-н7").locator('[data-testid="enrol-summary-notes"]').count(), 0);
  // the «?» of the title is ONE and explains the charge at once; the statement is the link «Выписка» in the row (no second «?» about it)
  assert.equal(await card(run.page).locator('[data-testid="enrol-summary-help"]').count(), 1);
  assert.ok(!(await card(run.page).locator('[data-testid="enrol-summary-help"] .sr-only').textContent()).includes("в выписке"));
  await run.page.close();
});

test("a common price is entered and a student comes back as he was: his row says so; the frame says it once in a short line; the probe is asked once per change", async () => {
  const run = await drawer({ people: THREE, imm: { st1: NOV, st2: NOV, st3: NOV }, undone: ["st2"] });
  assert.equal(await run.page.locator('[data-testid="enrol-note-shared"]').count(), 0, "nothing common entered - nothing said");
  await run.page.click('[role="switch"]:has-text("Индивидуальная цена")');
  await run.page.fill("#add-student-price-amount", "300000"); await run.page.fill("#add-student-price-reason", "Договорённость"); await run.page.waitForTimeout(900);
  assert.equal(plain(await rowOf(run.page, "М14-2-а").locator('[data-testid="enrol-note-shared"] [data-testid="leave-undo-line"]').textContent()), "Общие цена и дата не действуют — остаются прежние");
  assert.equal(await rowOf(run.page, "М14-н7").locator('[data-testid="enrol-note-shared"]').count(), 0);
  assert.match(plain(await run.page.locator('[data-testid="leave-shared-line"]').textContent()), /^На СцМ14 М14-2-а Ученик общие цена и дата не действуют/);
  assert.equal(await run.page.locator('[data-testid="add-price-settings"] [data-testid="leave-shared-note"]').count(), 1, "the line is inside the frame of the conditions");
  await run.page.close();
});

test("one student: the same card - «К оплате сразу», the period right under the title, his notes as lines under it without his name again", async () => {
  for (const width of [1280, 375]) {
    const run = await openPage(ctx.browser, "money-b.entry.tsx", H.server({ people: THREE.slice(0, 1), immediate: { st1: NOV }, past: { st1: [H.DEBT_SAME] }, ordinary: ["st1"] }), { width, height: width === 375 ? 812 : 900 });
    await run.page.evaluate(() => window.mount("addDrawer", { role: "owner", org_role: "owner" }, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 450000, valid_from: "2026-09-01" } }));
    await run.page.waitForSelector('[data-testid="enrol-list"] button'); await run.page.click('[data-testid="enrol-list"] button:has-text("М14-н7")');
    await run.page.waitForSelector('[data-testid="enrol-summary"]'); await run.page.waitForTimeout(500);
    const c = card(run.page);
    assert.match(await shown(c.locator('[data-testid="enrol-summary-head"]')), /^К оплате сразу188 000 сум$/);
    assert.equal(plain(await c.locator('[data-testid="enrol-summary-period"]').textContent()), "Ноябрь, с 19.11 · 5 уроков из 12");
    assert.equal(await c.locator('[data-testid="enrol-summary-student"]').count(), 0, "no row with the name");
    assert.equal(await c.locator('[data-testid="enrol-note-past"]').count(), 1);
    assert.equal(await c.locator('[data-testid="enrol-note-rewrite"]').count(), 1);
    assert.ok(!/М14-н7/.test(await shown(c)));
    assert.equal(await noHScroll(run.page), true);
    await run.page.close();
  }
});

test("a student with nothing to pay at once: «—» on the right, his name is there", async () => {
  const run = await drawer({ people: THREE, imm: { st1: NOV, st2: NOV } });
  assert.equal(plain(await rowOf(run.page, "М14-н6").locator('[data-testid="enrol-summary-sum"]').textContent()), "—");
  assert.equal(plain(await card(run.page).locator('[data-testid="enrol-summary-total"]').textContent()), "376 000 сум");
  assert.match(plain(await card(run.page).locator('[data-testid="enrol-summary-period"]').first().textContent()), /по 188 000 сум$/, "not «каждому»: one of them pays nothing");
  await run.page.close();
});

test("a role without the right to money: «Выбрано: N», names and notes, no sums, no «Выписка», no frame of the price", async () => {
  for (const width of [1280, 375]) {
    const run = await drawer({ people: THREE, imm: {}, past: { st2: [{ ...H.DEBT_SAME, amount: undefined }] }, ordinary: ["st3"] }, { width, who: NO_MONEY, money: false });
    const c = card(run.page);
    assert.equal(await shown(c.locator('[data-testid="enrol-summary-head"]')), "Выбрано: 3");
    assert.equal(await c.locator('[data-testid="enrol-summary-sum"], [data-testid="enrol-summary-total"]').count(), 0);
    assert.equal(await c.locator('[data-testid="past-balance-link"]').count(), 0);
    assert.match(plain(await rowOf(run.page, "М14-2-а").locator('[data-testid="enrol-note-past"]').textContent()), /^Долг с прошлого раза · в этой же группе, ушёл 19\.11$/);
    assert.equal(await rowOf(run.page, "М14-н6").locator('[data-testid="enrol-note-rewrite"]').count(), 1);
    assert.equal(await run.page.locator('[data-testid="add-price-settings"]').count(), 0);
    assert.ok(!/сум/.test(await shown(c)));
    await run.page.close();
  }
});

test("eight students (long names): the card is about 280 px and scrolls inside, the sums keep ONE right edge with the total, the list keeps three rows, the picked row stays on the screen", async () => {
  for (const width of [1280, 375]) {
    const run = await drawer({ people: EIGHT, imm: { st1: NOV, st2: NOV, st3: NOV, st4: NOV, st5: NOV, st6: NOV, st8: NOV }, past: { st5: [H.DEBT_SAME] }, ordinary: ["st2"] }, { width });
    const geo = await run.page.evaluate(() => {
      const c = document.querySelector('[data-testid="enrol-summary"]');
      const list = document.querySelector('[data-testid="enrol-list"]').getBoundingClientRect();
      const edges = [...new Set([...document.querySelectorAll('[data-testid="enrol-summary-sum"], [data-testid="enrol-summary-total"]')].map((el) => Math.round(el.getBoundingClientRect().right)))];
      const cut = [...document.querySelectorAll('[data-testid="enrol-summary-name"]')].filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.getAttribute("title"));
      return { h: c.getBoundingClientRect().height, scrolls: c.scrollHeight > c.clientHeight + 4, edges, cut, list: list.height };
    });
    assert.ok(geo.h <= 284, `card ${geo.h}`);
    assert.equal(geo.scrolls, true);
    assert.equal(geo.edges.length, 1, `one right edge: ${geo.edges}`);
    assert.ok(geo.cut.some((t) => t.startsWith(LONG)), `the long name is cut and whole in the title: ${geo.cut}`);
    if (width === 1280) assert.ok(geo.list >= 183, `list ${geo.list}`);
    assert.equal(await noHScroll(run.page), true);
    await run.page.close();
  }
});

test("1280x900, the picked students stay on the screen: the last picked row is visible after the lower part has grown and the list shrank", async () => {
  const people = Array.from({ length: 14 }, (_, i) => [`st${i + 1}`, `Ученик${String(i + 1).padStart(2, "0")}`, "Тест"]);
  const imm = Object.fromEntries(people.map(([id]) => [id, NOV]));
  const run = await openPage(ctx.browser, "money-b.entry.tsx", H.server({ people, immediate: imm, past: { st12: [H.DEBT_SAME] }, ordinary: ["st12"] }), { width: 1280, height: 900 });
  await run.page.evaluate(() => window.mount("addDrawer", { role: "owner", org_role: "owner" }, { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 450000, valid_from: "2026-09-01" } }));
  await run.page.waitForSelector('[data-testid="enrol-list"] button');
  for (const n of ["Ученик10", "Ученик11", "Ученик12"]) { await run.page.evaluate((name) => [...document.querySelectorAll('[data-testid="enrol-list"] button')].find((b) => b.textContent.includes(name)).scrollIntoView({ block: "center" }), n); await run.page.click(`[data-testid="enrol-list"] button:has-text("${n}")`); }
  await run.page.waitForSelector('[data-testid="enrol-summary"]'); await run.page.waitForTimeout(900);
  const visible = await run.page.evaluate(() => {
    const list = document.querySelector('[data-testid="enrol-list"]').getBoundingClientRect();
    return [...document.querySelectorAll('[data-testid="enrol-list"] button')].filter((b) => /Ученик12/.test(b.textContent)).map((b) => { const r = b.getBoundingClientRect(); return r.top >= list.top - 1 && r.bottom <= list.bottom + 1; });
  });
  assert.deepEqual(visible, [true]);
  await run.page.close();
});

test("typing a common price: the card does not jump - while the form is half filled the previous sums stay (muted), the height of the lower part is the same", async () => {
  const run = await drawer({ people: THREE, imm: { st1: NOV, st2: NOV, st3: NOV } });
  await run.page.click('[role="switch"]:has-text("Индивидуальная цена")'); await run.page.waitForTimeout(600);
  const height = () => run.page.evaluate(() => Math.round(document.querySelector('[data-testid="enrol-summary"]').getBoundingClientRect().height));
  const before = await height();
  await run.page.fill("#add-student-price-amount", "300000"); await run.page.waitForTimeout(500);
  assert.equal(await height(), before, "half filled: same card");
  assert.equal(plain(await card(run.page).locator('[data-testid="enrol-summary-total"]').textContent()), "564 000 сум");
  assert.match(await shown(card(run.page).locator('[data-testid="enrol-summary-head"]')), /^Всего к оплате сразу/);
  await run.page.fill("#add-student-price-reason", "Договорённость"); await run.page.waitForTimeout(900);
  assert.equal(await height(), before);
  await run.page.close();
});
