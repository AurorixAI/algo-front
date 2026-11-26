// Money-2 fix 10Д in the form of the mock-up of 19.11: ONE line of the conditions and ONE bottom bar instead of the frames and the cards: the period said once when it is the same (one line under the sum), the list «По ученикам»
// when the sums or the periods differ, the notes of a student in HIS row (debt / advance of the last time, «зачисляется обычным порядком», «общие цена и дата не действуют»), no sums for a role without money, the chosen stay on the screen.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain } = require("./helpers/money2-w2.cjs");
const H = require("./helpers/enrol-v2.cjs");
const F = require("./helpers/money2-fix10e.cjs");
const { PART, NOV } = F;

const ctx = setup(test);
const person = (id, first, last = "СцМ14") => H.STUDENT(id, first, last);
const THREE = [person("st1", "М14-н7"), person("st2", "М14-2-а"), person("st3", "М14-н6")];
const LONG = "Золотухин-Белоусов-Сокольников";
const EIGHT = [person("st1", "Новый", "Ученик"), person("st2", "Второй", "Ученик"), person("st3", "Третий", "Ученик"), person("st4", "Четвёртый", "Ученик"), person("st5", "Александр-Константин", LONG), person("st6", "Шестой", "Ученик"), person("st7", "Седьмой", "Ученик"), person("st8", "Восьмой", "Долгофамильный-Подкрепляющийся-Невероятный")];
const NO_MONEY = { role: "admin", org_role: "admin", payments_access: false };
const DEBT_SAME = F.DEBT_SAME; const ADVANCE_OTHER = F.ADVANCE_OTHER;

/** the drawer with the given students chosen; `imm` - id -> parts of what is charged at once */
async function drawer(sc, { width = 1280, who = H.OWNER, money = true } = {}) {
  const parts = (id) => (sc.imm && sc.imm[id] ? sc.imm[id] : null);
  const run = await H.openDrawer(ctx, H.server({ people: sc.people, parts, past: sc.past ?? {}, ordinary: sc.ordinary ?? [], undone: sc.undone ?? [] }), { width, user: who, props: { money } });
  for (const person of sc.people) await H.pick(run.page, person.first_name);
  await run.page.waitForTimeout(500);
  return run;
}
const bar = (page) => page.locator('[data-testid="summary-bar"]');
const sum = (page) => bar(page).locator('[data-testid="summary-bar-sum"]').innerText().then(plain);
const line = (page) => bar(page).locator('[data-testid="summary-bar-line"]').innerText().then(plain);
const rowOf = (page, name) => page.locator('[data-testid="enrol-exceptions"] > [data-row-tone]', { hasText: name });
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test("the same period for all: said ONCE in the line under the sum; the sum is the total; no frames of the old window, no «?»", async () => {
  for (const width of [1280, 375]) {
    const run = await drawer({ people: THREE, imm: { st1: NOV, st2: NOV, st3: NOV } }, { width });
    const p = run.page;
    assert.equal(await bar(p).count(), 1);
    assert.equal(await sum(p), "564 000 сум");
    assert.equal(await line(p), "по 188 000 · 5 уроков из 12 в ноябре");
    assert.equal(await p.locator('[data-testid="enrol-by-student-toggle"]').count(), 0, "the same for all: no list of sums");
    // the right edge of the sum and of the button is one block; nothing leaves the screen
    assert.equal(await noHScroll(p), true);
    // ONE line of the conditions: the price and the day are in it, no yellow / grey plates of the old window
    assert.equal(await p.locator('[data-testid="enrol-terms"]').count(), 1);
    assert.equal(await p.locator('[data-testid="past-balances"], [data-testid="leave-return-many"], [data-testid="pay-from-immediate-block"], [data-testid="enrol-summary"], [data-testid="add-price-settings"]').count(), 0);
    assert.equal(await p.getByLabel("Пояснение").count(), 0);
    await p.close();
  }
});

test("conditions open at 1280: the day and the price stand in ONE row; at 375 one under the other", async () => {
  for (const width of [1280, 375]) {
    const run = await drawer({ people: THREE.slice(0, 2), imm: { st1: NOV, st2: NOV } }, { width });
    await run.page.click('[data-testid="enrol-terms-toggle"]');
    const geo = await run.page.evaluate(() => {
      const price = document.querySelector("#add-student-price-amount").getBoundingClientRect();
      const field = document.querySelector("#add-student-pay-from").getBoundingClientRect();
      return { sameRow: price.top < field.bottom && price.bottom > field.top, fieldRight: field.right, priceLeft: price.left };
    });
    if (width === 1280) { assert.equal(geo.sameRow, true); assert.ok(geo.fieldRight <= geo.priceLeft, "the day on the left, the price on the right"); } else assert.equal(geo.sameRow, false);
    await run.page.close();
  }
});

test("different periods: a short line «за октябрь и ноябрь» and «По ученикам» with each student's own periods and sum", async () => {
  const run = await drawer({ people: THREE, imm: { st1: NOV, st2: [PART("октябрь", "2026-10-27", 89000, 2, 9), PART("ноябрь", "", 450000, 12, 12, true)], st3: [PART("ноябрь", "2026-11-26", 75000, 2, 12)] } });
  const p = run.page;
  assert.equal(await sum(p), "802 000 сум");
  assert.match(await line(p), /^за октябрь и ноябрь По ученикам$/);
  await p.click('[data-testid="enrol-by-student-toggle"]');
  const rows = (await p.locator('[data-testid="enrol-by-student-row"]').allInnerTexts()).map(plain);
  assert.deepEqual(rows, ["М14-н7 СцМ14 188 000 сум", "М14-2-а СцМ14 Октябрь, с 27.10 · 2 урока из 9 89 000 сум Ноябрь, весь месяц 450 000 сум 539 000 сум", "М14-н6 СцМ14 75 000 сум"]);
  await p.close();
});

test("the notes stand in the row of THEIR student: the debt of this group, the advance of another group, «зачисляется обычным порядком»; one «Выписка» per balance; a student with nothing special has no row", async () => {
  const run = await drawer({ people: THREE, imm: { st1: NOV, st2: NOV, st3: NOV }, past: { st2: [DEBT_SAME], st3: [ADVANCE_OTHER] }, ordinary: ["st2"] });
  const p = run.page;
  const two = rowOf(p, "М14-2-а");
  assert.equal(await two.count(), 1, "ONE row of his (Money-2 fix 11, F7): the debt and «зачисляется обычным порядком» stand on lines of their own in it");
  assert.match(plain(await p.locator('[data-testid="enrol-note-past"]', { hasText: "М14-2-а" }).innerText()), /^М14-2-а СцМ14 — Долг с прошлого раза 15 000 сум · в этой же группе, ушёл 19\.11 Выписка$/);
  assert.equal(await p.locator('[data-testid="enrol-note-past"]', { hasText: "М14-2-а" }).getByRole("link", { name: "Выписка" }).count(), 1);
  assert.equal(plain(await p.locator('[data-testid="enrol-note-rewrite"] [data-testid="leave-undo-line"]').innerText()), "Зачисляется обычным порядком", "the second thing of the row: a line of its own, with a capital");
  assert.ok(plain(await p.locator('[data-testid="enrol-note-rewrite"]').innerText()).includes(H.REWRITE), "the server's words are under the line, as they are");
  assert.match(plain(await p.locator('[data-testid="enrol-note-past"]', { hasText: "М14-н6" }).innerText()), /^М14-н6 СцМ14 — Аванс с прошлого раза 40 000 сум · в «Физика 9», ушёл 17\.11 Выписка$/);
  assert.equal(await rowOf(p, "М14-н7").count(), 0);
  assert.equal(await sum(p), "564 000 сум", "a debt is not added to the sum at once");
  assert.equal(await p.getByLabel("Пояснение").count(), 0, "no «?»: the statement is the link «Выписка» in the row");
  await p.close();
});

test("a common price is entered and a student comes back as he was: his row says so; the others have nothing; the probe follows the price at once (a stand-in reason until the real one is typed)", async () => {
  const run = await drawer({ people: THREE, imm: { st1: NOV, st2: NOV, st3: NOV }, undone: ["st2"] });
  const p = run.page;
  assert.equal(await p.locator('[data-testid="enrol-note-shared"]').count(), 0, "nothing common entered - nothing said");
  await p.click('[data-testid="enrol-terms-toggle"]');
  const before = run.calls.filter((c) => /students\/bulk$/.test(c.path) && /dry_run=true/.test(c.query)).length;
  await p.fill("#add-student-price-amount", "300000"); await p.waitForTimeout(700);
  // Money-2 fix 11 (F5): a price without its reason is asked at once with the stand-in reason of a dry run (the sum follows the price); the real write waits for the reason
  const asked = run.calls.filter((c) => /students\/bulk$/.test(c.path) && /dry_run=true/.test(c.query));
  assert.ok(asked.length > before, "an own price without its reason is asked with the stand-in reason");
  assert.deepEqual(asked[asked.length - 1].body.price_override, { amount: 300000, reason: "Проверка последствий" });
  await p.fill("#add-student-price-reason", "Договорённость"); await p.waitForTimeout(900);
  assert.match(plain(await p.locator('[data-testid="enrol-note-undone"]', { hasText: "М14-2-а" }).innerText()), new RegExp(`${H.UNDO.slice(0, 20)}`));
  assert.equal(await p.locator('[data-testid="enrol-note-shared"]').count(), 1);
  assert.match(plain(await p.locator('[data-testid="enrol-note-shared"]').innerText()), /^Общие цена и дата на него не действуют/);
  assert.equal(await p.locator('[data-testid="enrol-note-undone"]', { hasText: "М14-н7" }).count(), 0);
  await p.close();
});

test("one student: the same bar - the words of the server «К оплате до 24.11», the period in the line, his notes as rows without his name again", async () => {
  for (const width of [1280, 375]) {
    const run = await H.openDrawer(ctx, H.server({ people: THREE.slice(0, 1), parts: () => NOV, past: { st1: [DEBT_SAME] }, ordinary: ["st1"] }), { width });
    await H.pick(run.page, "М14-н7"); await run.page.waitForSelector('[data-testid="enrol-note-rewrite"]'); await run.page.waitForTimeout(400);
    const p = run.page;
    assert.equal(await p.locator('[data-testid="summary-bar"] p').first().innerText(), "К оплате до 24.11");
    assert.equal(await sum(p), "188 000 сум");
    assert.equal(await line(p), "5 уроков из 12 в ноябре");
    assert.equal(await p.locator('[data-testid="enrol-note-past"]').count(), 1);
    assert.equal(await p.locator('[data-testid="enrol-note-rewrite"]').count(), 1);
    assert.ok(!/М14-н7/.test(plain(await p.locator('[data-testid="enrol-exceptions"]').innerText())), "no name in the rows of the window about one student");
    assert.equal(await noHScroll(p), true);
    await p.close();
  }
});

test("a student with nothing to pay at once: the line names the count, not «всем» - «двоим по 188 000 · …»", async () => {
  const run = await drawer({ people: THREE, imm: { st1: NOV, st2: NOV } });
  assert.equal(await sum(run.page), "376 000 сум");
  assert.equal(await line(run.page), "двоим по 188 000 · 5 уроков из 12 в ноябре");
  await run.page.close();
});

test("a role without the right to money: names and notes, no sums, no «Выписка», no conditions; the bar is the button", async () => {
  for (const width of [1280, 375]) {
    const run = await drawer({ people: THREE, imm: {}, past: { st2: [{ ...DEBT_SAME, amount: undefined }] }, ordinary: ["st3"] }, { width, who: NO_MONEY, money: false });
    const p = run.page;
    assert.equal(await p.locator('[data-testid="summary-bar-sum"], [data-testid="summary-bar-line"], [data-testid="summary-bar-idle"]').count(), 0);
    assert.equal(await p.getByRole("link", { name: "Выписка" }).count(), 0);
    assert.match(plain(await p.locator('[data-testid="enrol-note-past"]').innerText()), /^М14-2-а СцМ14 — Долг с прошлого раза · в этой же группе, ушёл 19\.11$/);
    assert.equal(await p.locator('[data-testid="enrol-note-rewrite"]', { hasText: "М14-н6" }).count(), 1);
    assert.equal(await p.locator('[data-testid="enrol-terms"]').count(), 0);
    assert.ok(!/сум/.test(plain(await p.getByRole("dialog").innerText())));
    await p.close();
  }
});

test("eight students (long names): the labels take two lines at most and a long name wraps inside its label (never cut), the sum is the total of those who pay, nothing leaves the screen", async () => {
  for (const width of [1280, 375]) {
    const run = await drawer({ people: EIGHT, imm: { st1: NOV, st2: NOV, st3: NOV, st4: NOV, st5: NOV, st6: NOV, st8: NOV }, past: { st5: [DEBT_SAME] }, ordinary: ["st2"] }, { width });
    const p = run.page;
    const geo = await p.evaluate(() => {
      const box = document.querySelector('[data-testid="picked-chips"]');
      const rows = new Set([...box.children].map((el) => el.offsetTop)).size;
      const cut = [...document.querySelectorAll('[data-testid="picked-chip"] > span:first-child')].filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.getAttribute("title"));
      return { rows, cut, hidden: box.querySelector('[data-testid="picked-chips-more"]')?.textContent ?? null };
    });
    assert.ok(geo.rows <= 2, `two lines at most: ${geo.rows}`);
    assert.ok(geo.hidden === null || /^ещё \d+$/.test(plain(geo.hidden)));
    assert.equal(await sum(p), "1 316 000 сум");
    assert.equal(await noHScroll(p), true);
    // the long name is whole in the list of the exceptions (it wraps there, never cut)
    assert.match(plain(await p.locator('[data-testid="enrol-note-past"]').innerText()), new RegExp(`^Александр-Константин ${LONG} — Долг`));
    await p.close();
  }
});

test("1280x900, the chosen stay on the screen: the labels of the last chosen are visible after the lower part has grown and the list shrank", async () => {
  const people = Array.from({ length: 14 }, (_, i) => H.STUDENT(`st${i + 1}`, `Ученик${String(i + 1).padStart(2, "0")}`, "Тест"));
  const run = await H.openDrawer(ctx, H.server({ people, parts: () => NOV, past: { st12: [DEBT_SAME] }, ordinary: ["st12"] }), { width: 1280 });
  await H.pick(run.page, "Ученик10", "Ученик11", "Ученик12");
  await run.page.waitForSelector('[data-testid="enrol-note-rewrite"]'); await run.page.waitForTimeout(700);
  const visible = await run.page.evaluate(() => [...document.querySelectorAll('[data-testid="picked-chip"]')].map((chip) => { const r = chip.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }));
  assert.deepEqual(visible, [true, true, true]);
  await run.page.close();
});

test("typing a common price: the bar does not jump - the probe carries the price at once (a stand-in reason until the real one is typed), the sum follows the screen, nothing is said in the bar; the height is the same", async () => {
  const run = await drawer({ people: THREE, imm: { st1: NOV, st2: NOV, st3: NOV } });
  const p = run.page;
  await p.click('[data-testid="enrol-terms-toggle"]'); await p.waitForTimeout(400);
  const height = () => bar(p).evaluate((el) => Math.round(el.getBoundingClientRect().height));
  const before = await height();
  await p.fill("#add-student-price-amount", "300000"); await p.waitForTimeout(900);
  assert.equal(await height(), before, "the price without a reason: the same bar");
  assert.equal(await sum(p), "564 000 сум");
  assert.doesNotMatch(await bar(p).locator('[data-testid="summary-bar-sum"]').getAttribute("class"), /opacity-50/, "not faded: the probe was asked with the price on the screen");
  const probe = run.calls.filter((c) => c.method === "POST" && /\/students\/bulk$/.test(c.path) && /dry_run=true/.test(c.query)).pop();
  assert.deepEqual(probe.body.price_override, { amount: 300000, reason: "Проверка последствий" });
  assert.doesNotMatch(await line(p), /Укажите причину/, "the missing reason is said at its field when the person presses the button, not in the bar");
  await p.fill("#add-student-price-reason", "Договорённость"); await p.waitForTimeout(900);
  assert.equal(await height(), before);
  assert.doesNotMatch(await bar(p).locator('[data-testid="summary-bar-sum"]').getAttribute("class"), /opacity-50/);
  assert.equal(await sum(p), "564 000 сум", "the stand answers the same parts whatever the price: the sum is the answer of the server, the screen does not recount it");
  await p.close();
});
