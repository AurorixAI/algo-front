// PAY-TAILS Б11.39 + Б11.40 (part 16), the window «Пауза ученика» in a real browser (headless Chromium, the CSS of the project).  Each rule Э1-Э8 of the spec is a check of the DOM; the money of a pause is
// the rows of the server's `charge_rows` (the REAL answers of the server: tests/fixtures/paytails/part16/pause_probe_*.json, byte copies of `paytails-r7/answers/`); «the window = the answer»: the labels, the
// counts and the sums on the screen are the rows of the sample, written here by hand from the answer (not from the code).  PNGs: node tests/dom/paytails-part16-shots.cjs <dir>.
const assert = require("node:assert/strict");
const nodeTest = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { setup, plain, mount, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { readReal } = require("./helpers/paytails-part13.cjs");
const { contract, pauseOf, pauseBefore, pauseServer, setWorld, currentWorld, worldDay, FIXTURE_DAY, day, dmy, dm } = require("./helpers/paytails-part16.cjs");

// lesson 178: every test starts in the day of the world of the FIRST answers (24.11.2026); a test of another world (02.12.2026) says so with `setWorld(worldDay(name))` before it builds anything
const test = (name, fn) => nodeTest(name, async (t) => { setWorld(FIXTURE_DAY); return fn(t); });
const ctx = setup(nodeTest);
const root = path.join(__dirname, "..");
const NB = " ";
const open = (server, props = {}, width = 1280, user = OWNER) => mount(ctx, server, "pause", user, { moneyAvailable: true, ...props }, width, { today: currentWorld() });
const footer = (page) => page.locator('[role="dialog"] [data-modal-part="footer"]');
const footerButtons = async (page) => (await footer(page).locator("button").allInnerTexts()).map(plain);
const dialogText = async (page) => plain(await page.locator('[role="dialog"]').innerText());
const dateOf = (iso) => dm(iso);
const factsOf = (first, last, days) => `с ${dateOf(first)} по ${dateOf(last)} · ${days} ${days % 10 === 1 && days % 100 !== 11 ? "день" : [2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100) ? "дня" : "дней"}`;
const fill = async (page, first, last) => { await page.fill("#pause-first", dmy(first)); await page.fill("#pause-last", dmy(last)); };
/** The person types the days of the pause the answer is about: the fields are the answer's own days. */
const fillOf = (page, answer) => fill(page, answer.pause.first_day, answer.pause.last_day);
const digits = (text) => Number(text.replace(/[^\d]/g, "")) * (text.trim().startsWith("−") ? -1 : 1);
/** What a person reads in the block of money: heading, [label, sum|null] per row, the total, the quiet lines. */
async function money(page, scope = "") {
  const block = page.locator(`${scope} [data-testid="pause-money"]`);
  await block.waitFor();
  return block.evaluate((element) => {
    const t = (node) => (node ? node.textContent.replace(/[\s ]+/g, " ").trim() : null);
    return {
      heading: t(element.querySelector('[data-testid="pause-money-heading"]')),
      rows: [...element.querySelectorAll('[data-testid="pause-money-row"]')].map((li) => [t(li.querySelector('[data-testid="pause-money-label"]')), t(li.querySelector('[data-testid="pause-money-amount"]'))]),
      total: t(element.querySelector('[data-testid="pause-money-total-amount"]')),
      deferred: [...element.querySelectorAll('[data-testid="pause-money-deferred"]')].map(t),
      later: t(element.querySelector('[data-testid="pause-money-later"]')),
      note: t(element.querySelector('[data-testid="pause-money-note"]')),
    };
  });
}
/** «Было: долг X сум → станет: долг Y сум» read from the screen: X + Σ rows on the screen + Σ moved periods on the screen = Y (nothing from the answer: the numbers a person reads). */
function reconcile(text, read, label) {
  // Б11.50 Э3: «долга нет» is the zero of the debt on either side
  const [, before, after] = text.match(/Было: (?:долг ([\d\s]+) сум|долга нет) → станет: (?:долг ([\d\s]+) сум|долга нет)/);
  const num = (value) => Number(String(value ?? "0").replace(/\D/g, ""));
  const rowsSum = read.rows.reduce((total, [, amount]) => total + digits(amount), 0);
  const movedSum = read.deferred.reduce((total, line) => total + (/появятся/.test(line) ? -1 : 1) * num(line.match(/: ([\d\s]+) сум/)[1]), 0);
  // Б11.51 С3': (debt - advance) after - before = charged_delta - recalc_delta - forgiven_delta; the two quiet lines of the screen carry the last two (a sign by the word: «меньше» is a negative delta)
  const signed = (word, value) => (word === "меньше" ? -1 : 1) * num(value);
  const recalcHit = text.match(/Перерасчёт за уроки, отменённые центром, стал (меньше|больше) на ([\d\s]+) сум/);
  const forgivenHit = text.match(/Прощение покрывает на ([\d\s]+) сум (меньше|больше)/);
  const recalc = recalcHit ? signed(recalcHit[1], recalcHit[2]) : 0;
  const forgiven = forgivenHit ? signed(forgivenHit[2], forgivenHit[1]) : 0;
  assert.equal(num(before) + rowsSum + movedSum - recalc - forgiven, num(after), `${label}: debt ${before} + rows ${rowsSum} + moved ${movedSum} - recalc ${recalc} - forgiven ${forgiven} = debt ${after}`);
}
const calcOf = async (page) => { await page.waitForSelector('[data-testid="pause-calc-wrap"], [data-testid="pause-calc"] [role="alert"]'); return page; };
const sum = (n) => `${n < 0 ? "−" : "+"}${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} сум`;

const RUNNING = () => pauseOf("pr1", day(-7), day(6), { reason: "уехал к родственникам" });
const PLANNED = () => pauseOf("pf1", day(14), day(20), { reason: "соревнования" });
const askedFor = (run, method, pattern, dry) => run.calls.filter((call) => call.method === method && pattern.test(call.path) && (dry === undefined || /dry_run=true/.test(call.query) === dry));

// ── Э1: what the window shows first ────────────────────────────────────────────────────────────────────

for (const width of [1280, 375]) {
  test(`Э1 (${width}) no live pause: the FORM is first (no cards, no «+ Новая пауза», no fold); one quiet line under the dates; no «Уже есть», no line over the button; focus in «С» only on a wide screen`, async () => {
    const run = await open(pauseServer({ pauses: [] }), {}, width);
    await run.page.waitForSelector("#pause-first");
    await run.page.waitForTimeout(300);
    assert.equal(await run.page.locator('[data-testid="pause-card"], [data-testid="pause-new"], [data-testid="pause-past"], [data-testid="pause-new-title"]').count(), 0);
    assert.equal(plain(await run.page.locator('[data-testid="pause-hint"]').innerText()), "За дни паузы платить не нужно, место в группе сохраняется.");
    const text = await dialogText(run.page);
    for (const gone of ["Уже есть", "Задним числом можно", "Укажите, с какого по какое"]) assert.ok(!text.includes(gone), gone);
    assert.deepEqual(await footerButtons(run.page), ["Отмена", "Поставить на паузу"]);
    assert.equal(await run.page.locator('[data-testid="pause-why"]').count(), 0, "the button is off and nothing is written over it");
    assert.equal(await run.page.locator('button[form="pause-form"]').isDisabled(), true);
    assert.equal(await run.page.evaluate(() => document.activeElement?.id === "pause-first"), width === 1280, width === 1280 ? "the field «С» has the focus on a wide screen" : "no focus in «С» below sm (no keyboard)");
    await run.page.close();
  });
}

test("Э1 / Э2 (rule 142) ONE card: the buttons are named by their visible words (no extra name); the name with the dates appears only when there are two cards or more", async () => {
  const run = await open(pauseServer({ pauses: [RUNNING()] }));
  await run.page.waitForSelector('[data-testid="pause-card"]');
  assert.deepEqual(await run.page.locator('[data-testid="pause-card"] button').evaluateAll((items) => items.map((item) => item.getAttribute("aria-label"))), [null, null]);
  await run.page.close();
});

test("Э1 / Э2: a live pause - NO form, the card «Сейчас на паузе» (facts, the reason on its own quiet line, «Закончить сегодня» main + «Снять паузу целиком»), «+ Новая пауза» under it; the footer is «Закрыть» only", async () => {
  const run = await open(pauseServer({ pauses: [RUNNING()] }));
  await run.page.waitForSelector('[data-testid="pause-card"]');
  assert.equal(await run.page.locator("#pause-first, #pause-last, #pause-reason, #pause-form").count(), 0);
  const card = run.page.locator('[data-testid="pause-card"]');
  assert.equal(await card.getAttribute("data-state"), "running");
  assert.equal(plain(await card.locator('[data-testid="pause-state"]').innerText()), "Сейчас на паузе");
  assert.equal(plain(await card.locator('[data-testid="pause-facts"]').innerText()), factsOf(day(-7), day(6), 14));
  assert.equal(plain(await card.locator('[data-testid="pause-reason"]').innerText()), "уехал к родственникам", "the reason is its own line, not in the facts");
  assert.equal(await card.getByRole("button", { name: "Закончить сегодня" }).getAttribute("data-variant"), "primary");
  assert.equal(await card.getByRole("button", { name: "Снять паузу целиком" }).getAttribute("data-variant"), "secondary");
  assert.equal(await run.page.locator('[data-testid="pause-new"]').innerText(), "+ Новая пауза");
  assert.deepEqual(await footerButtons(run.page), ["Закрыть"]);
  assert.ok(!(await dialogText(run.page)).includes("Идёт сейчас") && !(await dialogText(run.page)).includes("Уже есть"));
  await run.page.close();
});

test("Э2: a pause without a reason has no reason line; the running one goes first, then the planned ones; a planned one has ONE action «Снять паузу» and the calm blue-grey title", async () => {
  const run = await open(pauseServer({ pauses: [PLANNED(), pauseOf("pf2", day(30), day(33)), RUNNING()] }));
  await run.page.waitForSelector('[data-testid="pause-card"]');
  const cards = run.page.locator('[data-testid="pause-card"]');
  assert.deepEqual(await cards.evaluateAll((items) => items.map((item) => item.getAttribute("data-state"))), ["running", "planned", "planned"]);
  assert.deepEqual((await cards.nth(1).locator('[data-testid="pause-facts"]').innerText()).length > 0, true);
  assert.equal(plain(await cards.nth(1).locator('[data-testid="pause-state"]').innerText()), "Пауза запланирована");
  assert.equal(await cards.nth(0).locator('[data-testid="pause-reason"]').count(), 1);
  assert.equal(await cards.nth(2).locator('[data-testid="pause-reason"]').count(), 0, "no reason - no line");
  const planned = cards.nth(1);
  assert.equal(await planned.locator("button").count(), 1);
  // rule 142: with several cards every button has a name that says WHICH pause (the visible words first, then the dates of its card)
  assert.equal(await planned.getByRole("button").getAttribute("data-variant"), "secondary");
  const names = await cards.evaluateAll((items) => items.map((item) => [...item.querySelectorAll("button")].map((button) => button.getAttribute("aria-label"))));
  assert.deepEqual(names, [
    [`Закончить сегодня, пауза ${factsOf(day(-7), day(6), 14).split(" · ")[0]}`, `Снять паузу целиком, пауза ${factsOf(day(-7), day(6), 14).split(" · ")[0]}`],
    [`Снять паузу, пауза ${factsOf(day(14), day(20), 7).split(" · ")[0]}`],
    [`Снять паузу, пауза ${factsOf(day(30), day(33), 4).split(" · ")[0]}`],
  ]);
  assert.equal(new Set(names.flat()).size, 4, "no two buttons of the window have the same name");
  const dots = await cards.evaluateAll((items) => items.map((item) => getComputedStyle(item.querySelector('[data-testid="pause-state"] span span')).backgroundColor));
  assert.notEqual(dots[0], dots[1], "amber for the running one, calm blue-grey for a planned one");
  await run.page.close();
});

test("Э1' a pause that began TODAY cannot be ended «yesterday»: the card has ONE action «Снять паузу целиком»", async () => {
  const run = await open(pauseServer({ pauses: [pauseOf("pt", day(0), day(5))] }));
  await run.page.waitForSelector('[data-testid="pause-card"]');
  const card = run.page.locator('[data-testid="pause-card"]');
  assert.equal(await card.getAttribute("data-state"), "running");
  assert.equal(await card.getByRole("button", { name: "Закончить сегодня" }).count(), 0);
  assert.equal(await card.locator("button").count(), 1);
  assert.equal(await card.getByRole("button", { name: "Снять паузу целиком" }).count(), 1);
  await run.page.close();
});

test("Э2': a live pause with locked days of a student who is IN the group (came back by the ordinary return): the card «Сейчас на паузе», the sentence of the server under the facts, ONE action «Снять паузу целиком»", async () => {
  const text = readReal("pause_closed_by_leave_later").days_locked_text;
  const run = await open(pauseServer({ pauses: [pauseOf("pl", day(-3), day(9), { days_locked: true, days_locked_text: text, reason: "болел" })] }));
  await run.page.waitForSelector('[data-testid="pause-locked-text"]');
  const card = run.page.locator('[data-testid="pause-card"]');
  assert.equal(await card.getAttribute("data-state"), "running");
  assert.equal(plain(await card.locator('[data-testid="pause-locked-text"]').innerText()), plain(text), "the words of the server as they came");
  const facts = await card.locator('[data-testid="pause-facts"]').boundingBox();
  assert.ok(facts.y < (await card.locator('[data-testid="pause-locked-text"]').boundingBox()).y, "the facts first, the sentence under them");
  assert.equal(await card.getByRole("button", { name: "Закончить сегодня" }).count(), 0);
  assert.equal(await card.locator("button").count(), 1);
  assert.equal(await card.getByRole("button", { name: "Снять паузу целиком" }).count(), 1);
  assert.equal(await run.page.locator("textarea, #pause-first").count(), 0, "no form, no field of the reason (the reason of a closed pause is not edited here)");
  await run.page.close();
});

// ── «+ Новая пауза» ────────────────────────────────────────────────────────────────────────────────────

for (const live of [1, 2]) {
  test(`Э1 «+ Новая пауза» with ${live} live pause(s): the cards are squeezed into ${live} row(s), the form «Новая пауза» opens (footer «Отмена» + «Поставить на паузу»); «Отмена» returns to the cards and forgets the form`, async () => {
    const pauses = live === 1 ? [RUNNING()] : [RUNNING(), PLANNED()];
    const run = await open(pauseServer({ pauses }));
    await run.page.locator('[data-testid="pause-new"]').click();
    await run.page.waitForSelector("#pause-first");
    assert.equal(await run.page.locator('[data-testid="pause-summary"]').count(), live);
    assert.equal(await run.page.locator('[data-testid="pause-card"]').count(), 0);
    assert.equal(plain(await run.page.locator('[data-testid="pause-new-title"]').innerText()), "Новая пауза");
    assert.match(plain(await run.page.locator('[data-testid="pause-summary"]').first().innerText()), /^Сейчас на паузе · с \d\d\.\d\d по \d\d\.\d\d$/);
    assert.deepEqual(await footerButtons(run.page), ["Отмена", "Поставить на паузу"]);
    await run.page.fill("#pause-reason", "что-то");
    await footer(run.page).getByRole("button", { name: "Отмена" }).click();
    await run.page.waitForSelector('[data-testid="pause-card"]');
    assert.equal(await run.page.locator('[data-testid="pause-card"]').count(), live);
    assert.equal(await run.page.locator("#pause-first").count(), 0);
    assert.equal(await run.page.locator('[role="dialog"]').count(), 1, "«Отмена» of the form does not close the window");
    await run.page.locator('[data-testid="pause-new"]').click();
    assert.equal(await run.page.locator("#pause-reason").inputValue(), "", "the form starts empty again");
    await run.page.close();
  });
}

// Б11.47 п.2: the day «С» of a new pause over live ones is the first free day not before today.
for (const [name, pauses, expected] of [
  ["one running (today inside it) - the day after its last day", () => [RUNNING()], () => day(7)],
  ["running and planned back to back - after the planned one", () => [pauseOf("pr1", day(-7), day(6)), pauseOf("pf1", day(7), day(13))], () => day(14)],
  ["running, a gap, then planned - the gap day right after the running one", () => [RUNNING(), PLANNED()], () => day(7)],
  ["only a planned one (today is free) - today", () => [PLANNED()], () => day(0)],
]) {
  test(`Б11.47 «+ Новая пауза»: «С» = ${name}`, async () => {
    const run = await open(pauseServer({ pauses: pauses() }));
    await run.page.locator('[data-testid="pause-new"]').click();
    await run.page.waitForSelector("#pause-first");
    assert.equal(await run.page.locator("#pause-first").inputValue(), dmy(expected()));
    await run.page.close();
  });
}

test("Б11.47 no live pauses: the form is open at once and «С» = today", async () => {
  const run = await open(pauseServer({ pauses: [] }));
  await run.page.waitForSelector("#pause-first");
  assert.equal(await run.page.locator("#pause-first").inputValue(), dmy(day(0)));
  await run.page.close();
});

// ── Э3: the confirmation in the card ───────────────────────────────────────────────────────────────────

for (const width of [1280, 375]) {
  test(`Э3 / Э6 (${width}) «Закончить сегодня»: the card squeezed into a row, «Последний день паузы — вчера, ДД.ММ.», the money of the ending as the rows of the answer (heading by the ACTION), «Закончить паузу» main + «Назад»; the write sends yesterday`, async () => {
    const answer = contract("pause_probe_end_today");
    const server = pauseServer({ pauses: [RUNNING()], end: (request) => ({ json: { ...answer, dry_run: /dry_run=true/.test(request.query) } }) });
    const run = await open(server, {}, width);
    await run.page.waitForSelector('[data-testid="pause-card"]');
    await run.page.getByRole("button", { name: "Закончить сегодня" }).click();
    await run.page.waitForSelector('[data-testid="pause-money"]');
    const acting = run.page.locator('[data-testid="pause-card-acting"]');
    assert.equal(await run.page.locator('[data-testid="pause-card"]').count(), 0, "the card is squeezed");
    assert.match(plain(await acting.locator('[data-testid="pause-summary"]').innerText()), width === 1280 ? /^Сейчас на паузе · с \d\d\.\d\d по \d\d\.\d\d$/ : /^Сейчас на паузе с \d\d\.\d\d по \d\d\.\d\d$/, "below sm the dates stand on their own line, no separator");
    assert.equal(plain(await acting.locator('[data-testid="pause-act-sentence"]').innerText()), `Последний день паузы — вчера, ${dateOf(day(-1))}.`);
    assert.deepEqual(await money(run.page, '[data-testid="pause-card-acting"]'), { heading: "За эти уроки снова нужно платить", rows: [["24.11–30.11 · 3 урока", "+150 000 сум"]], total: null, deferred: [], later: null, note: null });
    // Б11.50 Э1: the reason is asked at once (the server wants it for any change of a pause), before the main button; the dry run carries a reason too
    assert.equal(await run.page.locator("#pause-act-reason").count(), 1, "the field of the reason stands in the confirmation at once");
    assert.equal(plain(await acting.locator('label[for="pause-act-reason"]').innerText()), "Причина (обязательно)");
    assert.equal(typeof askedFor(run, "PATCH", /\/pauses\/pr1$/, true).at(-1).body.reason, "string", "the dry run of the ending carries a reason (the server asks it of any edit)");
    await run.page.fill("#pause-act-reason", "ошиблись в дате");
    assert.equal(await acting.getByRole("button", { name: "Закончить паузу", exact: true }).getAttribute("data-variant"), "primary");
    assert.equal(await acting.getByRole("button", { name: "Назад", exact: true }).count(), 1);
    assert.deepEqual(await footerButtons(run.page), ["Закрыть"]);
    assert.equal(askedFor(run, "PATCH", /\/pauses\/pr1$/, true).at(-1).body.last_day, day(-1));
    const probe = await run.page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(probe.bad, []);
    await acting.getByRole("button", { name: "Закончить паузу", exact: true }).click();
    await run.page.waitForFunction(() => window.__log.some((line) => line.startsWith("changed:Пауза закончена")));
    assert.equal(askedFor(run, "PATCH", /\/pauses\/pr1$/, false).at(-1).body.last_day, day(-1));
    assert.equal(askedFor(run, "PATCH", /\/pauses\/pr1$/, false).at(-1).body.reason, "ошиблись в дате");
    await run.page.close();
  });
}

test("Э3 / Э6 / Э7' «Снять паузу целиком» (running): the sentence, the rows «6 уроков, из них 3 уже прошли» +300 000, the reason is REQUIRED between the money and the buttons (an empty one is refused IN the card), the void sends the reason", async () => {
  const answer = contract("pause_probe_void_running");
  const server = pauseServer({ pauses: [RUNNING()], void: (request) => ({ json: { ...answer, dry_run: /dry_run=true/.test(request.query) } }) });
  const run = await open(server);
  await run.page.getByRole("button", { name: "Снять паузу целиком" }).click();
  await run.page.waitForSelector('[data-testid="pause-money"]');
  const acting = run.page.locator('[data-testid="pause-card-acting"]');
  assert.equal(plain(await acting.locator('[data-testid="pause-act-sentence"]').innerText()), "Пауза будет снята целиком, как будто её не было.");
  assert.deepEqual(await money(run.page, '[data-testid="pause-card-acting"]'), { heading: "За эти уроки снова нужно платить", rows: [["17.11–30.11 · 6 уроков, из них 3 уже прошли", "+300 000 сум"]], total: null, deferred: [], later: null, note: null });
  const label = acting.locator('label[for="pause-act-reason"]');
  assert.equal(plain(await label.innerText()), "Причина (обязательно)");
  assert.ok((await acting.locator('[data-testid="pause-money"]').boundingBox()).y < (await label.boundingBox()).y, "the reason stands under the money");
  assert.ok((await label.boundingBox()).y < (await acting.getByRole("button", { name: "Снять паузу целиком" }).boundingBox()).y, "and over the buttons");
  assert.equal(await acting.getByRole("button", { name: "Снять паузу целиком" }).getAttribute("data-variant"), "primary", "Б11.47: the one main button of the confirmation");
  assert.equal(await acting.getByRole("button", { name: "Назад", exact: true }).getAttribute("data-variant"), "secondary");
  await acting.getByRole("button", { name: "Снять паузу целиком" }).click();
  assert.match(plain(await acting.locator('[role="alert"]').innerText()), /^Укажите причину/, "the refusal of an empty reason stands in the card where the person pressed");
  assert.equal(askedFor(run, "POST", /\/void$/, false).length, 0);
  await run.page.fill("#pause-act-reason", "ученик передумал");
  await acting.getByRole("button", { name: "Снять паузу целиком" }).click();
  await run.page.waitForFunction(() => window.__log.includes("changed:Пауза снята"));
  assert.equal(askedFor(run, "POST", /\/void$/, false).at(-1).body.reason, "ученик передумал");
  await run.page.close();
});

test("Э3 / Э7' «Снять паузу» of a planned pause: «Пауза не начнётся: за её дни нужно будет платить.»; no rows, only the quiet line of the period that is not charged yet; «Назад» returns to the cards", async () => {
  const answer = contract("pause_probe_void_future");
  const server = pauseServer({ pauses: [PLANNED()], void: { ...answer } });
  const run = await open(server);
  await run.page.getByRole("button", { name: "Снять паузу", exact: true }).click();
  await run.page.waitForSelector('[data-testid="pause-money"]');
  const acting = run.page.locator('[data-testid="pause-card-acting"]');
  assert.match(plain(await acting.locator('[data-testid="pause-summary"]').innerText()), /^Пауза запланирована · с /);
  assert.equal(plain(await acting.locator('[data-testid="pause-act-sentence"]').innerText()), "Пауза не начнётся: за её дни нужно будет платить.");
  assert.deepEqual(await money(run.page), { heading: null, rows: [], total: null, deferred: [], later: "01.12–10.12 — следующий период: за эти дни снова нужно платить.", note: null }, "only the quiet line: NO heading over it (Б11.45 Э2)");
  assert.equal(await acting.getByRole("button", { name: "Снять паузу", exact: true }).count(), 1);
  await acting.getByRole("button", { name: "Назад", exact: true }).click();
  await run.page.waitForSelector('[data-testid="pause-card"]');
  assert.equal(await run.page.locator('[data-testid="pause-card-acting"]').count(), 0);
  await run.page.close();
});

test("Б11.50 Э1 «Закончить сегодня»: the field «Причина (обязательно)» stands in the confirmation at once; an empty / short reason is refused IN the card and nothing is sent; the FIRST write already carries the reason and there is no 422 REASON_REQUIRED in the scenario", async () => {
  const answer = contract("pause_probe_end_today");
  let refusals = 0;
  const server = pauseServer({ pauses: [RUNNING()], end: (request) => {
    const body = request.body ?? {};
    if (!body.reason) { refusals += 1; return { status: 422, json: { detail: { code: "REASON_REQUIRED", message: "Укажите причину" } } }; }
    return { json: { ...answer, dry_run: /dry_run=true/.test(request.query) } };
  } });
  const run = await open(server);
  await run.page.getByRole("button", { name: "Закончить сегодня" }).click();
  await run.page.waitForSelector("#pause-act-reason");
  await run.page.waitForSelector('[data-testid="pause-money"]');
  assert.equal(refusals, 0, "even the dry run was not refused: it carries a reason");
  await run.page.getByRole("button", { name: "Закончить паузу", exact: true }).click();
  assert.match(plain(await run.page.locator('[data-testid="pause-card-acting"] [role="alert"]').innerText()), /^Укажите причину/, "an empty reason is refused in the card, nothing is sent");
  assert.equal(askedFor(run, "PATCH", /\/pauses\/pr1$/, false).length, 0);
  await run.page.fill("#pause-act-reason", "ab");
  await run.page.getByRole("button", { name: "Закончить паузу", exact: true }).click();
  assert.match(plain(await run.page.locator('[data-testid="pause-card-acting"] [role="alert"]').innerText()), /^Укажите причину/, "two letters are short, as in the taking off");
  assert.equal(askedFor(run, "PATCH", /\/pauses\/pr1$/, false).length, 0);
  await run.page.fill("#pause-act-reason", "ошиблись в дате");
  await run.page.getByRole("button", { name: "Закончить паузу", exact: true }).click();
  await run.page.waitForFunction(() => window.__log.some((line) => line.startsWith("changed:Пауза закончена")));
  const writes = askedFor(run, "PATCH", /\/pauses\/pr1$/, false);
  assert.equal(writes.length, 1, "ONE write");
  assert.equal(writes[0].body.reason, "ошиблись в дате", "the first write carries the reason");
  assert.equal(refusals, 0, "no 422 REASON_REQUIRED at all");
  await run.page.close();
});

// ── Э3': the refusals of the confirmation stand IN the card ───────────────────────────────────────────

test("Э3' a refusal of the dry run (any CODE) blocks the confirmation, stands in the card in the server's words, has NO «Повторить»; a failure WITHOUT a code has «Повторить» that asks again", async () => {
  const refused = { status: 409, json: { detail: { code: "PAUSE_BREAKS_REFUND", message: "Из группы «Физика 9» уже возвращены деньги" } } };
  const run = await open(pauseServer({ pauses: [RUNNING()], void: refused }));
  await run.page.getByRole("button", { name: "Снять паузу целиком" }).click();
  await run.page.waitForSelector('[data-testid="pause-act-effects"]');
  assert.equal(plain(await run.page.locator('[data-testid="pause-act-effects"]').innerText()), "Из группы «Физика 9» уже возвращены деньги");
  assert.equal(await run.page.locator('[data-testid="pause-act-confirm"]').isDisabled(), true);
  assert.equal(await run.page.locator('[data-testid="pause-retry"]').count(), 0);
  await run.page.close();

  const other = await open(pauseServer({ pauses: [RUNNING()], void: { status: 409, json: { detail: { code: "SOMETHING_ELSE", message: "Паузу сейчас нельзя изменить" } } } }));
  await other.page.getByRole("button", { name: "Снять паузу целиком" }).click();
  await other.page.waitForSelector('[data-testid="pause-act-effects"]');
  assert.equal(await other.page.locator('[data-testid="pause-act-confirm"]').isDisabled(), true, "ANY refusal of the dry run blocks the button");
  assert.equal(await other.page.locator('[data-testid="pause-retry"]').count(), 0);
  await other.page.close();

  let tries = 0;
  const flaky = pauseServer({ pauses: [RUNNING()], void: (request) => { tries += 1; return tries === 1 ? { status: 500, json: {} } : { json: { ...contract("pause_probe_void_running"), dry_run: true } }; } });
  const retry = await open(flaky);
  await retry.page.getByRole("button", { name: "Снять паузу целиком" }).click();
  await retry.page.waitForSelector('[data-testid="pause-retry"]');
  assert.equal(await retry.page.locator('[data-testid="pause-act-confirm"]').isDisabled(), true);
  await retry.page.locator('[data-testid="pause-retry"]').click();
  await retry.page.waitForSelector('[data-testid="pause-money"]');
  assert.equal(await retry.page.locator('[data-testid="pause-act-confirm"]').isDisabled(), false, "the repeated probe came - the button is on");
  await retry.page.close();
});

test("Э3' the closed month: the dry run says it (422 PAUSE_LOCKED) - the notice of the closed month stands in the card, the button is off; the real refusal of the write is shown in the card too", async () => {
  const locked = { status: 422, json: { detail: { code: "PAUSE_LOCKED", message: "Месяц преподавателя закрыт ведомостью: паузу за эти дни не изменить", month: "2026-11", teacherId: "t1", teacherName: "Эргашев К.", closedOn: "2026-11-23" } } };
  const run = await open(pauseServer({ pauses: [RUNNING()], void: locked }));
  await run.page.getByRole("button", { name: "Снять паузу целиком" }).click();
  await run.page.waitForSelector('[data-testid="pause-card-acting"] >> text=закрыт');
  assert.equal(await run.page.locator('[data-testid="pause-act-confirm"]').isDisabled(), true);
  assert.equal(await run.page.locator('[data-testid="pause-retry"]').count(), 0);
  await run.page.close();

  const write = pauseServer({ pauses: [RUNNING()], void: (request) => (/dry_run=true/.test(request.query) ? { json: { ...contract("pause_probe_void_running"), dry_run: true } } : locked) });
  const second = await open(write);
  await second.page.getByRole("button", { name: "Снять паузу целиком" }).click();
  await second.page.waitForSelector('[data-testid="pause-money"]');
  await second.page.fill("#pause-act-reason", "ошибка");
  await second.page.locator('[data-testid="pause-act-confirm"]').click();
  await second.page.waitForSelector('[data-testid="pause-card-acting"] >> text=закрыт');
  assert.equal(await second.page.locator('[data-testid="pause-card-acting"]').count(), 1, "the card stays, the refusal is in it");
  await second.page.close();

  const plainRefusal = pauseServer({ pauses: [RUNNING()], void: (request) => (/dry_run=true/.test(request.query) ? { json: { ...contract("pause_probe_void_running"), dry_run: true } } : { status: 409, json: { detail: { code: "PAUSE_RANGE", message: "Слишком давняя дата" } } }) });
  const third = await open(plainRefusal);
  await third.page.getByRole("button", { name: "Снять паузу целиком" }).click();
  await third.page.waitForSelector('[data-testid="pause-money"]');
  await third.page.fill("#pause-act-reason", "ошибка");
  await third.page.locator('[data-testid="pause-act-confirm"]').click();
  await third.page.waitForSelector('[data-testid="pause-card-acting"] [role="alert"]');
  assert.equal(plain(await third.page.locator('[data-testid="pause-card-acting"] [role="alert"]').innerText()), "Слишком давняя дата");
  await third.page.close();
});

// ── Э4: the past pauses ────────────────────────────────────────────────────────────────────────────────

test("Э4 the past pauses: one quiet fold «Прошлые паузы · N» under the form, CLOSED when the window opens; inside the rows «с 05.10 по 11.10 · 7 дней · болел», the newest first, no actions; the year is written when it is not the current one", async () => {
  const pauses = [pauseOf("a", day(-60), day(-54), { reason: "болел" }), pauseOf("b", day(-100), day(-98)), pauseOf("c", "2025-10-05", "2025-10-11", { reason: "старая" })];
  const run = await open(pauseServer({ pauses }));
  await run.page.waitForSelector("#pause-first");
  const summary = run.page.locator('[data-testid="pause-past-summary"]');
  assert.equal(plain(await summary.innerText()), "Прошлые паузы · 3");
  assert.equal(await run.page.locator('[data-testid="pause-past"]').evaluate((element) => element.open), false);
  assert.ok((await run.page.locator("#pause-reason").boundingBox()).y < (await summary.boundingBox()).y, "under the form");
  await summary.click();
  const rows = (await run.page.locator('[data-testid="pause-past-row"] [data-testid="pause-facts"]').allInnerTexts()).map(plain);
  assert.equal(rows.length, 3);
  assert.equal(rows[0], `${factsOf(day(-60), day(-54), 7)} · болел`, "the newest first, the reason after the dot");
  assert.equal(rows[1], factsOf(day(-100), day(-98), 3));
  assert.equal(rows[2], "с 05.10.2025 по 11.10.2025 · 7 дней · старая", "a year that is not the current one is written");
  assert.equal(await run.page.locator('[data-testid="pause-past-row"] button').count(), 0, "no actions on the past ones");
  await run.page.close();
});

for (const width of [1280, 375]) {
  test(`Э4 (${width}) a past pause with locked days: its row has the sentence of the server and the link «Снять паузу целиком»; the confirmation asks the reason`, async () => {
    const text = readReal("pause_closed_by_leave_later").days_locked_text;
    const locked = pauseOf("pl", day(-30), day(-28), { days_locked: true, days_locked_text: text, reason: "уехал" });
    const server = pauseServer({ pauses: [locked, pauseOf("pp", day(-90), day(-85))], void: (request) => ({ json: { ...contract("pause_probe_void_running"), dry_run: /dry_run=true/.test(request.query) } }) });
    const run = await open(server, {}, width);
    await run.page.locator('[data-testid="pause-past-summary"]').click();
    assert.equal(plain(await run.page.locator('[data-testid="pause-past-row"] [data-testid="pause-locked-text"]').innerText()), plain(text));
    assert.equal(await run.page.locator('[data-testid="pause-past-row"] button').count(), 1, "only the locked one has an action");
    await run.page.getByRole("button", { name: "Снять паузу целиком" }).click();
    await run.page.waitForSelector("#pause-act-reason");
    assert.equal(plain(await run.page.locator('[data-testid="pause-act-sentence"]').innerText()), "Пауза будет снята целиком, как будто её не было.");
    await run.page.fill("#pause-act-reason", "ошибочная пауза");
    await run.page.locator('[data-testid="pause-act-confirm"]').click();
    await run.page.waitForFunction(() => window.__log.includes("changed:Пауза снята"));
    assert.equal(askedFor(run, "POST", /\/void$/, false).at(-1).body.reason, "ошибочная пауза");
    await run.page.close();
  });
}

// ── Э5 / Э4': a student who has left ────────────────────────────────────────────────────────────────────

for (const width of [1280, 375]) {
  test(`Э5 / Э4' (${width}) a student who has LEFT: no form, no «+ Новая пауза»; a card (no state title: facts bold, reason, the sentence, ONE «Снять паузу целиком») ONLY for a pause with locked days; the others are rows without actions in the fold; «Закрыть»`, async () => {
    const text = readReal("pause_closed_by_transfer_later").days_locked_text;
    const locked = pauseOf("pl", day(-5), day(-3), { days_locked: true, days_locked_text: text, reason: "уехал к родственникам" });
    const old = pauseOf("po", day(-40), day(-35), { reason: "болел" });
    const run = await open(pauseServer({ pauses: [locked, old] }), { active: false }, width);
    await run.page.waitForSelector('[data-testid="pause-card"]');
    assert.equal(await run.page.locator("#pause-first, #pause-form, [data-testid=pause-new], [data-testid=pause-state]").count(), 0);
    const card = run.page.locator('[data-testid="pause-card"]');
    assert.equal(await card.count(), 1);
    assert.equal(await card.getAttribute("data-state"), "left");
    assert.equal(plain(await card.locator('[data-testid="pause-facts"]').innerText()), factsOf(day(-5), day(-3), 3));
    assert.equal(await card.locator('[data-testid="pause-facts"]').evaluate((element) => Number(getComputedStyle(element).fontWeight) >= 600), true, "the first line is bold");
    assert.equal(plain(await card.locator('[data-testid="pause-reason"]').innerText()), "уехал к родственникам");
    assert.equal(plain(await card.locator('[data-testid="pause-locked-text"]').innerText()), plain(text));
    assert.equal(await card.locator("button").count(), 1);
    assert.equal(await card.getByRole("button", { name: "Снять паузу целиком" }).count(), 1);
    assert.equal(await run.page.locator('[data-testid="pause-past"]').evaluate((element) => element.open), false, "there is a card, so the fold stays closed");
    await run.page.locator('[data-testid="pause-past-summary"]').click();
    assert.equal(await run.page.locator('[data-testid="pause-past-row"]').count(), 1);
    assert.equal(await run.page.locator('[data-testid="pause-past-row"] button').count(), 0, "a past pause of the one who left WITHOUT locked days has no button");
    assert.deepEqual(await footerButtons(run.page), ["Закрыть"]);
    const probe = await run.page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(probe.bad, []);
    await run.page.close();
  });
}

test("Э4' a student who has left and has NO card (only a pause without locked days): the fold is open, no button anywhere, only «Закрыть»", async () => {
  const run = await open(pauseServer({ pauses: [pauseOf("po", day(-40), day(-35), { reason: "болел" })] }), { active: false });
  await run.page.waitForSelector('[data-testid="pause-past-row"]');
  assert.equal(await run.page.locator('[data-testid="pause-past"]').evaluate((element) => element.open), true);
  assert.equal(await run.page.locator('[role="dialog"] button').evaluateAll((items) => items.map((item) => item.textContent.trim()).filter((text) => text && text !== "Закрыть")).then((list) => list.length), 0);
  await run.page.close();
});

// ── Э6 / Э7: the calculation under the form ─────────────────────────────────────────────────────────────

const LATER_SET = (label) => `${label} — следующий период: за эти дни тоже платить не нужно.`;
const DEFER_CREATE = (label, sum, from) => `${label}: ${sum} сум появятся в долге ${from}, после паузы.`;
const CALC_CASES = [
  { name: "pause_probe_create_week", rows: [["24.11–30.11 · 3 урока", -150000]], total: null, deferred: [], later: null },
  { name: "pause_probe_create_two_months", rows: [["24.11–30.11 · 3 урока", -150000]], total: null, deferred: [], later: LATER_SET("01.12–03.12") },
  { name: "pause_probe_create_two_months_begun", rows: [["24.11–30.11 · 3 урока", -150000], ["01.12–03.12 · 2 урока", -86000]], total: -236000, deferred: [], later: null },
  { name: "pause_probe_create_backdated", rows: [["17.11–30.11 · 6 уроков", -300000]], total: null, deferred: [], later: null },
  { name: "pause_probe_create_future_month", rows: [], total: null, deferred: [], later: LATER_SET("01.12–10.12"), heading: null },
  // Б11.45: the worlds with a period the pause MOVES across the working day: an ordinary row (the difference of the price) and the quiet line of what the move takes out of the bill today
  { name: "pause_probe_create_two_months_begun_0212", rows: [["24.11–30.11 · 3 урока", -150000], ["01.12–03.12 · 2 урока", -86000]], total: -236000, deferred: [DEFER_CREATE("Декабрь", "514 000", "04.12")], later: null },
  { name: "pause_probe_create_backdated_month_start", rows: [["01.12–10.12 · 5 уроков", -214000]], total: null, deferred: [DEFER_CREATE("Декабрь", "386 000", "11.12")], later: null },
];
for (const width of [1280, 375]) {
  for (const one of CALC_CASES) {
    test(`Э6 (${width}) ${one.name}: heading «За эти уроки платить не нужно», the rows ARE the charge_rows of the answer${one.total !== null ? ", «Итого» under a line" : ""}, «Место в группе сохраняется.»; the line under the dates is gone`, async () => {
      setWorld(worldDay(one.name));
      const answer = contract(one.name);
      const run = await open(pauseServer({ pauses: [], create: (request) => ({ json: { ...answer, dry_run: /dry_run=true/.test(request.query) } }) }), {}, width);
      await run.page.waitForSelector("#pause-first");
      await fillOf(run.page, answer);
      await run.page.waitForSelector('[data-testid="pause-money"]');
      const read = await money(run.page, '[data-testid="pause-calc"]');
      assert.deepEqual(read.rows.map(([label, amount]) => [label, amount && Number(amount.replace(/[^\d]/g, "")) * (amount.startsWith("−") ? -1 : 1)]), one.rows.map(([label, amount]) => [label, amount]));
      for (const [index, [, amount]] of read.rows.entries()) assert.equal(amount, sum(one.rows[index][1]), "a real minus sign and a space that does not break");
      assert.equal(read.heading, one.heading === undefined ? "За эти уроки платить не нужно" : one.heading);
      assert.equal(read.total, one.total === null ? null : sum(one.total));
      assert.deepEqual(read.deferred, one.deferred, "one quiet line per moved period, the server's label first");
      assert.equal(read.later, one.later);
      // the check of the number on the screen: the debt before + the rows + what the move puts in / takes out of the bill = the debt after
      const balance = plain(await run.page.locator('[data-testid="pause-calc"]').innerText());
      if (/Было: долг/.test(balance)) reconcile(balance, read, one.name);
      assert.equal(answer.charge_rows.length, one.rows.length, "the sample is the one the test describes");
      assert.equal(read.note, "Место в группе сохраняется.");
      assert.equal(answer.charge_rows.reduce((total, row) => total + row.amount + (row.deferred ?? 0), 0), answer.impact.charged_delta, "the sample itself keeps «Σ amount + Σ deferred = charged_delta» (Б11.45)");
      assert.equal(await run.page.locator('[data-testid="pause-hint"]').count(), 0, "the calculation replaces the quiet line");
      const text = await dialogText(run.page);
      assert.ok(!text.includes("За дни паузы платить не нужно:"), "no old line next to the rows");
      assert.equal(await run.page.locator('[data-testid="pause-why"]').count(), 0);
      assert.equal(await run.page.locator('button[form="pause-form"]').isEnabled(), true);
      const probe = await run.page.evaluate(layoutProbe, '[role="dialog"]');
      assert.deepEqual(probe.bad, []);
      await run.page.close();
    });
  }
}

test("Э6 the lines under the rows: «Оплачено до станет …» and the debt line stay under the block, inside the same box; the whole write goes with the same dates", async () => {
  // the real answer of a week; its `paid_until_after` is moved by hand to 30.11 (no real probe moves it) - the only field changed
  const real = contract("pause_probe_create_week");
  const answer = { ...real, impact: { ...real.impact, paid_until_after: "2026-11-30" } };
  const run = await open(pauseServer({ pauses: [], create: (request) => ({ status: /dry_run=true/.test(request.query) ? 200 : 201, json: { ...answer, dry_run: /dry_run=true/.test(request.query) } }) }));
  await run.page.waitForSelector("#pause-first");
  await fill(run.page, day(0), day(6));
  await run.page.waitForSelector('[data-testid="pause-money"]');
  const box = run.page.locator('[data-testid="pause-calc"]');
  const text = plain(await box.innerText());
  assert.ok(text.includes("Оплачено до станет 30.11."), text);
  assert.ok(text.includes("Было: долг 600 000 сум → станет: долг 450 000 сум"), text);
  assert.ok((await box.locator('[data-testid="pause-money-note"]').boundingBox()).y < (await box.getByText("Оплачено до станет 30.11.").boundingBox()).y, "under the rows and the note");
  await footer(run.page).getByRole("button", { name: "Поставить на паузу" }).click();
  await run.page.waitForFunction(() => window.__log.some((line) => line.startsWith("changed:Пауза поставлена")));
  assert.equal(askedFor(run, "POST", /\/memberships\/m-a\/pauses$/, false).at(-1).body.first_day, day(0));
  await run.page.close();
});

test("Э6 a role WITHOUT the right to money: the rows have the period and the lessons, NO sums, no «Итого»", async () => {
  const answer = contract("pause_probe_create_no_money_role");
  const run = await open(pauseServer({ pauses: [], create: { ...answer } }), { moneyAvailable: false }, 1280, ADMIN);
  await run.page.waitForSelector("#pause-first");
  await fillOf(run.page, answer);
  await run.page.waitForSelector('[data-testid="pause-money"]');
  const read = await money(run.page, '[data-testid="pause-calc"]');
  assert.deepEqual(read, { heading: "За эти уроки платить не нужно", rows: [["24.11–30.11 · 3 урока", null]], total: null, deferred: [], later: LATER_SET("01.12–03.12"), note: "Место в группе сохраняется." });
  assert.ok(!/сум|\d{3}/.test(plain(await run.page.locator('[data-testid="pause-calc"]').innerText()).replace(/\d\d\.\d\d/g, "")), "no money digits");
  await run.page.close();
});

for (const name of ["pause_probe_create_packages", "pause_probe_create_personal"]) {
  test(`Э6 / Б11.40 С1' ${name} (no rows, no later): the OLD one line stays (the sentence with the sum, «Место в группе сохраняется.»), no block of rows`, async () => {
    const answer = contract(name);
    const run = await open(pauseServer({ pauses: [], create: { ...answer } }));
    await run.page.waitForSelector("#pause-first");
    await fillOf(run.page, answer);
    await run.page.waitForSelector('[data-testid="pause-calc-wrap"]');
    assert.equal(await run.page.locator('[data-testid="pause-money"]').count(), 0);
    // the real answers: the pause has `days` 15 (packages) / 7 (personal); the sum of the change is 0, so the sentence has no sum
    assert.equal(plain(await run.page.locator('[data-testid="pause-calc"]').innerText()), `За дни паузы платить не нужно: ${answer.pause.days} дней. Место в группе сохраняется.`);
    await run.page.close();
  });
}

test("Э6 an OLD server (no `charge_rows`, no `charge_later` in the answer at all): the old one line, the same words as before the pack", async () => {
  const answer = contract("pause_probe_create_week");
  delete answer.charge_rows;
  delete answer.charge_later;
  const run = await open(pauseServer({ pauses: [], create: { ...answer } }));
  await run.page.waitForSelector("#pause-first");
  await fill(run.page, day(0), day(6));
  await run.page.waitForSelector('[data-testid="pause-calc-wrap"]');
  assert.equal(await run.page.locator('[data-testid="pause-money"]').count(), 0);
  assert.equal(plain(await run.page.locator('[data-testid="pause-calc"]').innerText()), "За дни паузы платить не нужно: 7 дней, −150 000 сум. Место в группе сохраняется. Было: долг 600 000 сум → станет: долг 450 000 сум");
  await run.page.close();
});

test("Э7 the warnings (backdated, attended lessons, payroll) are SEPARATE yellow blocks UNDER the block of money, the words as before", async () => {
  const answer = { ...contract("pause_probe_create_backdated"), lessons: { excluded: [], attended: [{ date: day(-2), marks: "был" }] }, payroll: { months: ["2026-11"], saved_sheets_changed: 1 } };
  const run = await open(pauseServer({ pauses: [], create: { ...answer } }));
  await run.page.waitForSelector("#pause-first");
  await fill(run.page, day(-7), day(6));
  await run.page.waitForSelector('[data-testid="pause-warnings"]');
  const lines = (await run.page.locator('[data-testid="pause-warnings"] p').allInnerTexts()).map(plain);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Пауза в прошлом: уроки \d\d\.\d\d–\d\d\.\d\d ученик не оплачивает, преподавателю они не засчитываются\.$/);
  assert.match(lines[1], /^Ученик был отмечен на уроках \d\d\.\d\d — на эти даты паузу поставить нельзя$/);
  assert.equal(lines[2], "Зарплата за ноябрь изменится — потом сохраните новую сумму");
  const money = await run.page.locator('[data-testid="pause-calc"]').boundingBox();
  assert.ok((await run.page.locator('[data-testid="pause-warnings"]').boundingBox()).y >= money.y + money.height - 1, "under the box of money, not inside it");
  assert.equal(await run.page.locator('[data-testid="pause-calc"] [data-testid="pause-warnings"]').count(), 0);
  await run.page.close();
});

test("Э7 the failures of the calculation: a refusal with a code (the server's words) stands under the dates and has NO «Повторить» and no line over the button; a failure without a code says «Не удалось посчитать паузу.» with «Повторить» that asks again; the closed month is the notice", async () => {
  const refused = pauseServer({ pauses: [], create: { status: 409, json: { detail: { code: "PAUSE_OVERLAP", message: "На эти дни уже есть пауза: с 17.11 по 30.11" } } } });
  const run = await open(refused);
  await run.page.waitForSelector("#pause-first");
  await fill(run.page, day(0), day(6));
  await run.page.waitForSelector('[data-testid="pause-calc"] [role="alert"]');
  assert.equal(plain(await run.page.locator('[data-testid="pause-calc"] [role="alert"]').innerText()), "На эти дни уже есть пауза: с 17.11 по 30.11");
  assert.equal(await run.page.locator('[data-testid="pause-retry"]').count(), 0);
  assert.equal(await run.page.locator('button[form="pause-form"]').isDisabled(), true);
  assert.equal(await run.page.locator('[data-testid="pause-why"]').count(), 0, "said once, not over the button");
  assert.ok((await run.page.locator('[data-testid="pause-calc"]').boundingBox()).y < (await run.page.locator("#pause-reason").boundingBox()).y, "under the dates (over the reason), where the cause is");
  await run.page.close();

  let tries = 0;
  const flaky = pauseServer({ pauses: [], create: (request) => { tries += 1; return tries === 1 ? { status: 500, json: {} } : { json: { ...contract("pause_probe_create_week"), dry_run: true } }; } });
  const second = await open(flaky);
  await second.page.waitForSelector("#pause-first");
  await fill(second.page, day(0), day(6));
  await second.page.waitForSelector('[data-testid="pause-retry"]');
  assert.equal(plain(await second.page.locator('[data-testid="pause-calc"] [role="alert"]').innerText()), "Не удалось посчитать паузу. Повторить");
  assert.equal(await second.page.locator('button[form="pause-form"]').isDisabled(), true);
  await second.page.locator('[data-testid="pause-retry"]').click();
  await second.page.waitForSelector('[data-testid="pause-money"]');
  assert.equal(await second.page.locator('button[form="pause-form"]').isEnabled(), true);
  await second.page.close();

  const closed = pauseServer({ pauses: [], create: { status: 422, json: { detail: { code: "PAUSE_LOCKED", message: "Месяц преподавателя закрыт ведомостью", month: "2026-11", teacherId: "t1", teacherName: "Эргашев К.", closedOn: "2026-11-23" } } } });
  const third = await open(closed);
  await third.page.waitForSelector("#pause-first");
  await fill(third.page, day(0), day(6));
  await third.page.waitForSelector('[data-testid="pause-calc"] >> text=закрыт');
  assert.equal(await third.page.locator('[data-testid="pause-retry"]').count(), 0);
  await third.page.close();
});

test("Э7 the write of a new pause refused by the server: the refusal stands in the form (words of the server), the window stays; PAUSE_OVERLAPS_ATTENDED names the dates", async () => {
  const server = pauseServer({ pauses: [], create: (request) => (/dry_run=true/.test(request.query) ? { json: { ...contract("pause_probe_create_week"), dry_run: true } } : { status: 409, json: { detail: { code: "LESSON_IN_PROGRESS", message: "Сейчас идёт урок группы: поставить паузу можно после его завершения" } } }) });
  const run = await open(server);
  await run.page.waitForSelector("#pause-first");
  await fill(run.page, day(0), day(6));
  await run.page.waitForSelector('[data-testid="pause-money"]');
  await footer(run.page).getByRole("button", { name: "Поставить на паузу" }).click();
  await run.page.waitForSelector('[data-testid="pause-error"]');
  assert.equal(plain(await run.page.locator('[data-testid="pause-error"]').innerText()), "Сейчас идёт урок группы: поставить паузу можно после его завершения");
  assert.equal(await run.page.locator('[role="dialog"]').count(), 1);
  await run.page.close();
});

// ── the 375 measure ─────────────────────────────────────────────────────────────────────────────────────

test("stress_ Э6 (375) the sum of a row stands in ONE line on the right and does not leave the box - a seven-digit sum, the longest label (two years, many lessons, «из них … уже прошли»); the SYNTHETIC answer is written in one day: the fields, the rows and the debt agree", async () => {
  const real = contract("pause_probe_create_two_months_begun");
  const answer = {
    ...real,
    pause: { ...real.pause, first_day: "2026-11-24", last_day: "2027-01-30", days: 68 },
    charge_rows: [
      { label: "24.11.2026–10.01.2027", first_day: "2026-11-24", last_day: "2027-01-10", days: 48, lessons: 120, lessons_passed: 37, amount: -1234567 },
      { label: "11.01.2027–30.01.2027", first_day: "2027-01-11", last_day: "2027-01-30", days: 20, lessons: 8, lessons_passed: null, amount: -9876543 },
    ],
    impact: { ...real.impact, charged_delta: -11111110, debt_before: 20000000, debt_after: 8888890 },
  };
  const run = await open(pauseServer({ pauses: [], create: { ...answer } }), {}, 375);
  await run.page.waitForSelector("#pause-first");
  await fillOf(run.page, answer);
  await run.page.waitForSelector('[data-testid="pause-money"]');
  const rows = await run.page.locator('[data-testid="pause-money-row"]').evaluateAll((items) => items.map((li) => {
    const amount = li.querySelector('[data-testid="pause-money-amount"]');
    const label = li.querySelector('[data-testid="pause-money-label"]');
    const box = amount.getBoundingClientRect();
    const dialog = li.closest('[role="dialog"]').getBoundingClientRect();
    const line = parseFloat(getComputedStyle(amount).lineHeight) || 20;
    return { amount: amount.textContent.replace(/[\s ]+/g, " ").trim(), height: Math.round(box.height), line, right: Math.round(box.right), dialogRight: Math.round(dialog.right), labelBottom: label.getBoundingClientRect().bottom, labelRight: label.getBoundingClientRect().right, amountLeft: box.left };
  }));
  assert.equal(rows[0].amount, "−1 234 567 сум");
  assert.equal(rows[1].amount, "−9 876 543 сум");
  for (const row of rows) {
    assert.ok(row.height <= row.line * 1.3, `the sum is one line: ${JSON.stringify(row)}`);
    assert.ok(row.right <= row.dialogRight - 8, `the sum stays in the window: ${JSON.stringify(row)}`);
    assert.ok(row.labelRight <= row.amountLeft + 1, "the label does not run under the sum");
  }
  assert.equal(plain(await run.page.locator('[data-testid="pause-money-total-amount"]').innerText()), "−11 111 110 сум");
  const label = plain(await run.page.locator('[data-testid="pause-money-label"]').first().innerText());
  assert.equal(label, "24.11.2026–10.01.2027 · 120 уроков, из них 37 уже прошли");
  const probe = await run.page.evaluate(layoutProbe, '[role="dialog"]');
  assert.deepEqual(probe.bad, []);
  assert.equal(probe.scroll, 0);
  await run.page.close();
});

// ── «окно = ответ» and the races ───────────────────────────────────────────────────────────────────────

test("«окно = ответ»: for EVERY sample of the contract the rows on the screen (label, count word, sign and digits of the sum) and the quiet lines of the moved periods are the rows of the answer; a row without sum or lessons is not a row", async () => {
  const names = fs.readdirSync(path.join(root, "tests", "fixtures", "paytails", "part16")).filter((file) => /^pause_probe_(create|end|void).*\.json$/.test(file)).map((file) => file.replace(/\.json$/, ""));
  assert.equal(names.length, 16, names.join());   // 14 + the two of Б11.51 (centre cancel, forgiveness cut)
  const wordFor = (n) => (n % 10 === 1 && n % 100 !== 11 ? "урок" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "урока" : "уроков");
  const unsigned = (n) => sum(Math.abs(n)).slice(1);
  for (const name of names) {
    setWorld(worldDay(name));
    const answer = contract(name);
    const kind = name.includes("_end_") ? "end" : name.includes("_void_") ? "void" : "create";
    const rows = (answer.charge_rows ?? []).filter((row) => row.amount !== 0 && row.lessons !== 0);
    const run = kind === "create"
      ? await open(pauseServer({ pauses: [], create: { ...answer } }))
      : await open(pauseServer({ pauses: [kind === "end" ? RUNNING() : pauseBefore(name)], end: { ...answer }, void: { ...answer } }));
    if (kind === "create") { await run.page.waitForSelector("#pause-first"); await fillOf(run.page, answer); await run.page.waitForSelector('[data-testid="pause-calc-wrap"], [data-testid="pause-calc"] [role="alert"]'); }
    else { await run.page.getByRole("button", { name: kind === "end" ? "Закончить сегодня" : /^Снять паузу/ }).click(); await run.page.waitForSelector('[data-testid="pause-act-calc"], [data-testid="pause-act-sentence"]'); await run.page.waitForTimeout(250); }
    const scope = kind === "create" ? '[data-testid="pause-calc"]' : '[data-testid="pause-card-acting"]';
    const shown = await run.page.locator(`${scope} [data-testid="pause-money-row"]`).evaluateAll((items) => items.map((li) => [li.querySelector('[data-testid="pause-money-label"]').textContent.replace(/[\s\u00a0]+/g, " ").trim(), li.querySelector('[data-testid="pause-money-amount"]')?.textContent.replace(/[\s\u00a0]+/g, " ").trim() ?? null]));
    assert.equal(shown.length, rows.length, `${name}: one row per record that has a sum and lessons`);
    rows.forEach((row, index) => {
      const count = row.lessons !== null ? `${row.lessons} ${wordFor(row.lessons)}` : `${row.days} дней`;
      assert.ok(shown[index][0].startsWith(`${row.label} · ${count}`), `${name}: ${shown[index][0]}`);
      assert.equal(shown[index][0].includes("из них"), Boolean(row.lessons_passed), `${name}: «из них … уже прошли» only where lessons_passed > 0`);
      assert.ok(!/оплата периода|период входит/.test(shown[index][0]), `${name}: the old phrases of a moved period are gone`);
      assert.equal(shown[index][1], row.amount === null ? null : sum(row.amount), name);
    });
    // the quiet line of every row that has `period_label`
    const moved = (answer.charge_rows ?? []).filter((row) => row.period_label);
    const lines = (await run.page.locator(`${scope} [data-testid="pause-money-deferred"]`).allInnerTexts()).map(plain);
    assert.deepEqual(lines, moved.map((row) => `${row.period_label}: ${unsigned(row.deferred)} ${row.deferred < 0 ? `появятся в долге ${dm(row.period_begins)}, после паузы.` : `снова в долге с ${dm(row.period_begins)}.`}`), name);
    const later = await run.page.locator(`${scope} [data-testid="pause-money-later"]`).count();
    assert.equal(later, answer.charge_later ? 1 : 0, `${name}: the line of the period that is not charged yet`);
    if (answer.charge_later) assert.ok(plain(await run.page.locator(`${scope} [data-testid="pause-money-later"]`).innerText()).startsWith(`${answer.charge_later.label} — следующий период: за эти дни`));
    await run.page.close();
  }
});

for (const phase of ["dry run", "the press"]) {
  test(`Б (race) 409 PAUSE_CLOSED_BY_LEAVE to «Закончить сегодня» of a pause that was NOT closed when the window opened (at the ${phase}): the window reads the pauses again, the card becomes closed (state title, facts, the sentence ONCE, one action), no alert`, async () => {
    const text = readReal("pause_closed_by_leave_later").days_locked_text;
    let closed = false;
    let reads = 0;
    const refuse = { status: 409, json: { detail: { code: "PAUSE_CLOSED_BY_LEAVE", message: text } } };
    const answer = pauseServer({
      pauses: () => { reads += 1; return [closed ? pauseOf("pr", day(-3), day(9), { days_locked: true, days_locked_text: text }) : pauseOf("pr", day(-3), day(9))]; },
      end: (request) => {
        const dry = /dry_run=true/.test(request.query);
        if (phase === "dry run" || !dry) { closed = true; return refuse; }
        return { json: { ...contract("pause_probe_end_today"), dry_run: true } };
      },
    });
    const run = await open(answer);
    const list = run.page.locator('section[aria-label="Паузы ученика"]');
    await list.waitFor();
    assert.equal(await run.page.locator('[data-testid="pause-locked-text"]').count(), 0, "not closed when the window opened");
    await list.getByRole("button", { name: "Закончить сегодня" }).click();
    if (phase === "the press") {
      await run.page.waitForSelector('[data-testid="pause-act-confirm"]:not([disabled])');
      await run.page.fill("#pause-act-reason", "ошиблись в дате");   // Б11.50 Э1: the reason is asked at once
      await run.page.locator('[data-testid="pause-act-confirm"]').click();
    }
    await run.page.waitForSelector('[data-testid="pause-locked-text"]');
    assert.ok(reads >= 2, "the pauses were read again");
    assert.equal(await run.page.getByText(text.replace(/\.$/, ""), { exact: false }).count(), 1, "the sentence is said once");
    assert.equal(await run.page.locator('[role="alert"]').count(), 0);
    assert.equal(await run.page.locator('[data-testid="pause-card"]').getAttribute("data-state"), "running");
    assert.equal(await list.getByRole("button", { name: "Закончить сегодня" }).count(), 0);
    assert.equal(await list.getByRole("button", { name: "Снять паузу целиком" }).count(), 1);
    assert.equal(await run.page.locator('[role="dialog"]').count(), 1);
    await run.page.close();
  });
}

test("Б11.37 / Б11.34 the REAL pause objects of the server (closed by a transfer / by a leaving, with the way back; after the leaving is cancelled; without a cut): the sentence of the server stands as it came, once, on the pauses that carry it; the free ones have none", async () => {
  const names = ["pause_closed_by_transfer_today", "pause_closed_by_transfer_later", "pause_closed_by_leave_later", "pause_closed_by_leave_today", "pause_after_the_leaving_is_cancelled", "pause_without_cut"];
  // the words and the flags are the server's; the DATES are moved into the past (the fixtures are of 24.11.2026 and a live pause would be a card, not a row)
  const real = names.map((name) => ({ ...readReal(name), membership_id: "m-a", id: name, first_day: day(-30), last_day: day(-28) }));
  const run = await open(pauseServer({ pauses: real }));
  await run.page.waitForSelector('[data-testid="pause-past-summary"]');
  await run.page.locator('[data-testid="pause-past-summary"]').click();
  const sentences = (await run.page.locator('[data-testid="pause-locked-text"]').allInnerTexts()).map(plain);
  const expected = real.filter((pause) => pause.days_locked === true).map((pause) => plain(pause.days_locked_text));
  assert.equal(expected.length, 4);
  assert.deepEqual([...sentences].sort(), [...expected].sort(), "the words of the server, not built or changed on the screen");
  assert.equal(await run.page.locator('[data-testid="pause-past-row"] button').count(), 4, "a button only on the locked ones");
  assert.equal(await run.page.locator('[data-testid="pause-past-row"]').count(), 6);
  await run.page.close();
});

// ── Б11.45: a period the action moves across the working day (the real answers of the worlds of 02.12) ────────────────────

/** What the text of the block says, read from the screen: the sum of the rows, the sum the move takes out / puts back, the debts before / after - the reconciliation of the person. */
for (const width of [1280, 375]) {
  test(`Б11.45 (${width}) «Снять паузу целиком» (the world 02.12): the row of December is an ordinary one «01.12–03.12 · 2 урока, из них 1 уже прошёл» +86 000, the quiet line says 514 000 «снова в долге с 01.12»; the debt 450 000 + 236 000 + 514 000 = 1 200 000`, async () => {
    setWorld(worldDay("pause_probe_void_two_months_0212"));
    const answer = contract("pause_probe_void_two_months_0212");
    const run = await open(pauseServer({ pauses: [pauseBefore("pause_probe_void_two_months_0212")], void: (request) => ({ json: { ...answer, dry_run: /dry_run=true/.test(request.query) } }) }), {}, width);
    await run.page.getByRole("button", { name: "Снять паузу целиком" }).click();
    await run.page.waitForSelector('[data-testid="pause-money"]');
    const read = await money(run.page, '[data-testid="pause-card-acting"]');
    assert.deepEqual(read, {
      heading: "За эти уроки снова нужно платить",
      rows: [["24.11–30.11 · 3 урока, из них 3 уже прошли", "+150 000 сум"], ["01.12–03.12 · 2 урока, из них 1 уже прошёл", "+86 000 сум"]],
      total: "+236 000 сум", deferred: ["Декабрь: 514 000 сум снова в долге с 01.12."], later: null, note: null,
    });
    const text = plain(await run.page.locator('[data-testid="pause-card-acting"]').innerText());
    reconcile(text, read, "void_two_months_0212");
    assert.ok(text.includes("Было: долг 450 000 сум → станет: долг 1 200 000 сум"), text);
    assert.ok(!/оплата периода|период входит/.test(text));
    const probe = await run.page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(probe.bad, []);
    assert.equal(probe.scroll, 0);
    await run.page.close();
  });
}

test("Б11.45 the same worlds, the debt of the window: «Было: долг … → станет: долг …» of the three real answers = the debt before + Σ rows + Σ moved, read from the screen", async () => {
  for (const [name, kind] of [["pause_probe_create_two_months_begun_0212", "create"], ["pause_probe_create_backdated_month_start", "create"], ["pause_probe_void_two_months_0212", "void"]]) {
    setWorld(worldDay(name));
    const answer = contract(name);
    const run = kind === "create"
      ? await open(pauseServer({ pauses: [], create: { ...answer } }))
      : await open(pauseServer({ pauses: [pauseBefore(name)], void: { ...answer } }));
    if (kind === "create") { await run.page.waitForSelector("#pause-first"); await fillOf(run.page, answer); } else await run.page.getByRole("button", { name: "Снять паузу целиком" }).click();
    const scope = kind === "create" ? '[data-testid="pause-calc"]' : '[data-testid="pause-card-acting"]';
    const read = await money(run.page, scope);
    const text = plain(await run.page.locator(scope).innerText());
    assert.match(text, /Было: долг [\d\s]+ сум → станет: долг [\d\s]+ сум/, name);
    reconcile(text, read, name);
    await run.page.close();
  }
});

test("Б11.45 a role WITHOUT money: the same real worlds, the moved period is a quiet line WITHOUT a sum («появится в долге 04.12» / «снова в долге с 01.12»), the rows have no sums, no «Итого»", async () => {
  const stripped = (name) => ({ ...contract(name), impact: null, charge_rows: contract(name).charge_rows.map((row) => ({ ...row, amount: null, deferred: null })) });
  for (const [name, kind, line] of [["pause_probe_create_two_months_begun_0212", "create", "Декабрь: оплата появится в долге 04.12, после паузы."], ["pause_probe_void_two_months_0212", "void", "Декабрь: оплата снова в долге с 01.12."]]) {
    setWorld(worldDay(name));
    const answer = stripped(name);
    const run = kind === "create"
      ? await open(pauseServer({ pauses: [], create: { ...answer } }), { moneyAvailable: false }, 1280, ADMIN)
      : await open(pauseServer({ pauses: [pauseBefore(name)], void: { ...answer } }), { moneyAvailable: false }, 1280, ADMIN);
    if (kind === "create") { await run.page.waitForSelector("#pause-first"); await fillOf(run.page, answer); } else await run.page.getByRole("button", { name: "Снять паузу целиком" }).click();
    const read = await money(run.page, kind === "create" ? '[data-testid="pause-calc"]' : '[data-testid="pause-card-acting"]');
    assert.deepEqual(read.deferred, [line], name);
    assert.ok(read.rows.every(([, amount]) => amount === null) && read.total === null, name);
    assert.ok(!/сум/.test(plain(await run.page.locator(kind === "create" ? '[data-testid="pause-calc"]' : '[data-testid="pause-card-acting"]').innerText())), `${name}: no money words`);
    await run.page.close();
  }
});

test("stress_ Б11.45 a pause on a day without a lesson at the start of the period: the real answer of the backdated month start with `amount` 0 and `lessons` 0 (a SYNTHETIC change of two fields) - no row, no heading, no «Итого»: only the quiet line «Декабрь: 600 000 сум появятся в долге 11.12, после паузы.»; «из них прошло» is not written", async () => {
  setWorld(worldDay("pause_probe_create_backdated_month_start"));
  const real = contract("pause_probe_create_backdated_month_start");
  const answer = { ...real, charge_rows: real.charge_rows.map((row) => ({ ...row, lessons: 0, lessons_passed: null, amount: 0, deferred: -600000 })) };
  const run = await open(pauseServer({ pauses: [], create: { ...answer } }));
  await run.page.waitForSelector("#pause-first");
  await fillOf(run.page, answer);
  await run.page.waitForSelector('[data-testid="pause-money"]');
  assert.deepEqual(await money(run.page, '[data-testid="pause-calc"]'), { heading: null, rows: [], total: null, deferred: [DEFER_CREATE("Декабрь", "600 000", "11.12")], later: null, note: "Место в группе сохраняется." });
  assert.ok(!plain(await run.page.locator('[data-testid="pause-calc"]').innerText()).includes("из них"));
  await run.page.close();
});

test("stress_ Б11.45 (375) the quiet line of a moved period with a seven-digit sum and a long label stays inside the box (a SYNTHETIC answer written in one day: the fields, the rows, the line and the debt agree)", async () => {
  setWorld(worldDay("pause_probe_create_two_months_begun_0212"));
  const real = contract("pause_probe_create_two_months_begun_0212");
  const answer = {
    ...real,
    pause: { ...real.pause, first_day: "2026-11-24", last_day: "2027-01-30", days: 68 },
    charge_rows: [
      { label: "24.11.2026–10.01.2027", first_day: "2026-11-24", last_day: "2027-01-10", days: 48, lessons: 120, lessons_passed: 37, amount: -1234567 },
      { label: "11.01.2027–30.01.2027", first_day: "2027-01-11", last_day: "2027-01-30", days: 20, lessons: 8, lessons_passed: null, amount: -1876543, period_begins: "2027-01-31", deferred: -7654321, period_label: "11.01.2027–30.01.2027" },
    ],
    impact: { ...real.impact, charged_delta: -10765431, debt_before: 20000000, debt_after: 9234569 },
  };
  const run = await open(pauseServer({ pauses: [], create: { ...answer } }), {}, 375);
  await run.page.waitForSelector("#pause-first");
  await fillOf(run.page, answer);
  await run.page.waitForSelector('[data-testid="pause-money"]');
  const read = await money(run.page, '[data-testid="pause-calc"]');
  assert.deepEqual(read.deferred, ["11.01.2027–30.01.2027: 7 654 321 сум появятся в долге 31.01, после паузы."]);
  assert.equal(read.total, "−3 111 110 сум");
  reconcile(plain(await run.page.locator('[data-testid="pause-calc"]').innerText()), read, "stress deferred");
  const probe = await run.page.evaluate(layoutProbe, '[role="dialog"]');
  assert.deepEqual(probe.bad, []);
  assert.equal(probe.scroll, 0);
  await run.page.close();
});

test("stress_ Б11.45 Э2: the quiet lines (moved period, `charge_later`) stand UNDER the rows and the total, apart from them (an offset from above), at the width of the block", async () => {
  setWorld(worldDay("pause_probe_create_two_months_begun_0212"));
  const answer = { ...contract("pause_probe_create_two_months_begun_0212"), charge_later: { first_day: "2026-12-04", last_day: "2026-12-10", label: "04.12–10.12" } };
  const run = await open(pauseServer({ pauses: [], create: { ...answer } }));
  await run.page.waitForSelector("#pause-first");
  await fillOf(run.page, answer);
  await run.page.waitForSelector('[data-testid="pause-money"]');
  const box = await run.page.locator('[data-testid="pause-money"]').boundingBox();
  const total = await run.page.locator('[data-testid="pause-money-total"]').boundingBox();
  const deferred = await run.page.locator('[data-testid="pause-money-deferred"]').boundingBox();
  const later = await run.page.locator('[data-testid="pause-money-later"]').boundingBox();
  assert.ok(deferred.y >= total.y + total.height + 4, "under «Итого», with an offset");
  assert.ok(later.y > deferred.y, "the line of the period that is not charged yet after it");
  assert.ok(deferred.width > box.width * 0.9, "at the width of the block");
  assert.ok(await run.page.locator('[data-testid="pause-money-deferred"]').evaluate((element) => getComputedStyle(element).color !== getComputedStyle(document.querySelector('[data-testid="pause-money-label"]')).color), "muted, not the colour of the rows");
  await run.page.close();
});

test("Б11.45 Э3 the warning of a backdated pause of ONE day (the real answer of the backdated month start, the world 02.12): «уроки за 01.12», not «с 01.12 по 01.12»; a range keeps its words", async () => {
  setWorld(worldDay("pause_probe_create_backdated_month_start"));
  const answer = contract("pause_probe_create_backdated_month_start");
  const run = await open(pauseServer({ pauses: [], create: { ...answer } }));
  await run.page.waitForSelector("#pause-first");
  await fillOf(run.page, answer);
  await run.page.waitForSelector('[data-testid="pause-warnings"]');
  assert.equal(plain(await run.page.locator('[data-testid="pause-warnings"] p').first().innerText()), "Пауза в прошлом: урок 01.12 ученик не оплачивает, преподавателю он не засчитывается.");
  await run.page.close();
});

test("Б11.45 Э5 «Оплачено до станет …» is shown in the confirmation of the ENDING too (the block of the money of the card, under the rows) when the server moves the day", async () => {
  const real = contract("pause_probe_end_today");
  const answer = { ...real, impact: { ...real.impact, paid_until_after: "2026-11-23" } };   // the only field changed by hand: no real probe of an ending moves it
  const run = await open(pauseServer({ pauses: [RUNNING()], end: (request) => ({ json: { ...answer, dry_run: /dry_run=true/.test(request.query) } }) }));
  await run.page.getByRole("button", { name: "Закончить сегодня" }).click();
  await run.page.waitForSelector('[data-testid="pause-act-calc"]');
  const box = run.page.locator('[data-testid="pause-act-calc"]');
  assert.ok(plain(await box.innerText()).includes("Оплачено до станет 23.11."), plain(await box.innerText()));
  assert.ok((await box.locator('[data-testid="pause-money-label"]').first().boundingBox()).y < (await box.getByText("Оплачено до станет 23.11.").boundingBox()).y, "under the rows");
  await run.page.close();
});

// ── Б11.41 п. 2: after the ending / the taking off ──────────────────────────────────────────────────────────

for (const action of ["end", "void"]) {
  test(`Б11.41 п.2 (${action}) the LAST live pause is finished: the success message and the window CLOSES (no form of a new pause)`, async () => {
    const answer = contract(action === "end" ? "pause_probe_end_today" : "pause_probe_void_running");
    const answerOf = (request) => {
      const dry = /dry_run=true/.test(request.query);
      if (!dry) server.setPauses([pauseOf("pr1", day(-7), action === "end" ? day(-1) : day(6), action === "end" ? {} : { voided_at: "x" })]);
      return { json: { ...answer, dry_run: dry } };
    };
    const server = pauseServer({ pauses: [RUNNING()], end: answerOf, void: answerOf });
    const run = await open(server);
    await run.page.getByRole("button", { name: action === "end" ? "Закончить сегодня" : "Снять паузу целиком" }).click();
    await run.page.waitForSelector('[data-testid="pause-act-confirm"]:not([disabled])');
    await run.page.fill("#pause-act-reason", "ученик передумал");   // Б11.50 Э1: both actions ask the reason at once
    await run.page.locator('[data-testid="pause-act-confirm"]').click();
    await run.page.waitForFunction(() => window.__log.includes("close"));
    const log = await run.page.evaluate(() => window.__log);
    assert.ok(log.some((line) => line.startsWith("changed:Пауза")), "the toast text went out first");
    assert.ok(log.indexOf("close") > log.findIndex((line) => line.startsWith("changed:")), "the window closed after the change");
    await run.page.close();
  });
}

test("Б11.41 п.2 another live pause is left: the window stays on the cards (one card), nothing closes, the form of a new pause does NOT open by itself", async () => {
  const server = pauseServer({
    pauses: [RUNNING(), PLANNED()],
    void: (request) => { const dry = /dry_run=true/.test(request.query); if (!dry) server.setPauses([RUNNING(), { ...PLANNED(), voided_at: "x" }]); return { json: { ...contract("pause_probe_void_future"), dry_run: dry } }; },
  });
  const run = await open(server);
  await run.page.waitForSelector('[data-testid="pause-card"]');
  await run.page.locator('[data-testid="pause-card"][data-state="planned"]').getByRole("button").click();
  await run.page.waitForSelector('[data-testid="pause-act-confirm"]:not([disabled])');
  await run.page.fill("#pause-act-reason", "ученик передумал");
  await run.page.locator('[data-testid="pause-act-confirm"]').click();
  await run.page.waitForFunction(() => window.__log.includes("changed:Пауза снята"));
  await run.page.waitForSelector('[data-testid="pause-card"][data-state="running"]');
  assert.equal(await run.page.locator('[data-testid="pause-card"]').count(), 1);
  assert.equal(await run.page.locator("#pause-first, #pause-form").count(), 0);
  assert.equal(await run.page.evaluate(() => window.__log.includes("close")), false, "the window did not close");
  assert.equal(await run.page.locator('[data-testid="pause-new"]').count(), 1);
  await run.page.close();
});

// ── Б11.41 п. 3: a student who has left - the button as before the pack ─────────────────────────────────────────

test("Б11.41 п.3 a student who has LEFT: «Снять паузу целиком» in the fold on a pause with locked days AND on a free one whose last day is not before today (old data without a cut); a free PAST pause has no button", async () => {
  const text = readReal("pause_closed_by_leave_later").days_locked_text;
  const pauses = [
    pauseOf("lk", day(-30), day(-28), { days_locked: true, days_locked_text: text }),
    pauseOf("fr", day(-3), day(4), { reason: "старые данные" }),
    pauseOf("pa", day(-60), day(-55), { reason: "давно" }),
  ];
  const run = await open(pauseServer({ pauses }), { active: false });
  await run.page.locator('[data-testid="pause-past-summary"]').click();
  const rows = run.page.locator('[data-testid="pause-past-row"]');
  await rows.first().waitFor();
  assert.equal(await rows.count(), 2, "the locked one is a card; the other two are rows");
  const withButton = await rows.evaluateAll((items) => items.map((item) => [item.querySelector('[data-testid="pause-facts"]').textContent.includes("давно"), item.querySelectorAll("button").length]));
  assert.deepEqual(withButton.map(([old]) => old), [false, true], "the free running one first (newest), the old one last");
  assert.deepEqual(withButton.map(([, buttons]) => buttons), [1, 0], "a button on the free one that is not over, none on the past one");
  await run.page.close();
});

// ── Б11.41 п. 4: the squeezed row of a pause on a phone ────────────────────────────────────────────────────────

test("Б11.41 п.4 (375) the squeezed row of a pause: the dates stand on the second line WHOLE, no separator dot is left at the end of the first one; (1280) one line with the dot", async () => {
  for (const width of [375, 1280]) {
    const run = await open(pauseServer({ pauses: [RUNNING()] }), {}, width);
    await run.page.locator('[data-testid="pause-new"]').click();
    await run.page.waitForSelector('[data-testid="pause-summary"]');
    const row = await run.page.locator('[data-testid="pause-summary"]').evaluate((element) => {
      const title = element.querySelector("span.inline-flex").getBoundingClientRect();
      const dates = [...element.children].at(-1);
      const box = dates.getBoundingClientRect();
      const shown = [...element.querySelectorAll("span")].filter((node) => node.getAttribute("aria-hidden") === "true" && node.textContent.includes("·")).map((node) => getComputedStyle(node).display);
      return { sameLine: Math.abs(box.top - title.top) < title.height, dateLines: Math.round(box.height / parseFloat(getComputedStyle(dates).lineHeight)), dots: shown, text: element.innerText.replace(/\s+/g, " ").trim() };
    });
    if (width === 375) assert.deepEqual({ sameLine: row.sameLine, dateLines: row.dateLines, dots: row.dots, noDot: !row.text.includes("·") }, { sameLine: false, dateLines: 1, dots: ["none"], noDot: true }, JSON.stringify(row));
    else assert.deepEqual({ sameLine: row.sameLine, dots: row.dots, hasDot: row.text.includes(" · ") }, { sameLine: true, dots: ["inline"], hasDot: true }, JSON.stringify(row));
    await run.page.close();
  }
});

// ── what is gone, and what stays ───────────────────────────────────────────────────────────────────────

test("Э8' / Э7 the old things are GONE from the window (the field of the reason of a closed pause and its save, «Уже есть», «Идёт сейчас», the hint of a backdate, the line over the button, «Отменить будущую паузу»), the server's route of the reason stays", () => {
  const source = fs.readFileSync(path.join(root, "src", "components", "payments", "pause-dialog.tsx"), "utf8");
  for (const gone of ["pause-locked-reason", "pause-locked-save", "Сохранить причину", "reasonDrafts", "Уже есть", "Идёт сейчас", "PAUSE_BACKDATE_HINT", "Укажите, с какого по какое число пауза", "Отменить будущую паузу", "pause-cancel-title"]) assert.ok(!source.includes(gone), gone);
  const api = fs.readFileSync(path.join(root, "src", "lib", "api.ts"), "utf8");
  assert.match(api, /patchPause/, "the route of the server stays (the reason of a pause is changed through the API)");
});

// ── Б11.51 С3': what else moves the debt - the deductions for the lessons the centre cancelled and the forgiveness (`impact.recalc_delta`, `impact.forgiven_delta`) ─────────────────

const PROBES = fs.readdirSync(path.join(root, "tests", "fixtures", "paytails", "part16")).filter((name) => /^pause_probe_/.test(name)).map((name) => name.replace(/\.json$/, ""));
test("Б11.51 С3' the identity on EVERY real answer of a pause with `impact`: (debt - advance) after - before = charged_delta - recalc_delta - forgiven_delta (the two fields are there; null without the right to money)", () => {
  let checked = 0;
  for (const name of PROBES) {
    const { impact } = contract(name);
    if (impact === null) continue;
    assert.equal(typeof impact.recalc_delta, "number", `${name}: recalc_delta is in the answer`);
    assert.equal(typeof impact.forgiven_delta, "number", `${name}: forgiven_delta is in the answer`);
    assert.equal((impact.debt_after - impact.advance_after) - (impact.debt_before - impact.advance_before), impact.charged_delta - impact.recalc_delta - impact.forgiven_delta, name);
    checked += 1;
  }
  assert.ok(checked >= 10, `the identity was checked on ${checked} answers`);
});

const SET_LINES = [
  ["pause_probe_create_with_centre_cancel", ["Перерасчёт за уроки, отменённые центром, стал меньше на 40 000 сум."], "Было: долг 200 000 сум → станет: долг 160 000 сум"],
  ["pause_probe_create_with_forgiveness_cut", ["Перерасчёт за уроки, отменённые центром, стал меньше на 40 000 сум.", "Прощение покрывает на 40 000 сум меньше."], null],
];
for (const width of [1280, 375]) {
  for (const [name, lines, balance] of SET_LINES) {
    test(`Б11.51 С3' (${width}) ${name}: the quiet lines «${lines.join(" ")}» under the rows of the lessons; the debt line of the window holds the identity read from the screen`, async () => {
      const answer = contract(name);
      const run = await open(pauseServer({ pauses: [], create: (request) => ({ json: { ...answer, dry_run: /dry_run=true/.test(request.query) } }) }), {}, width);
      await run.page.waitForSelector("#pause-first");
      await fillOf(run.page, answer);
      await run.page.waitForSelector('[data-testid="pause-money"]');
      const text = plain(await run.page.locator('[data-testid="pause-calc"]').innerText());
      const quiet = await run.page.locator('[data-testid="pause-calc"] p.text-xs').allInnerTexts();
      assert.deepEqual(quiet.map(plain).filter((line) => /^(Перерасчёт|Прощение)/.test(line)), lines, "exactly these quiet lines, in this order, as written");
      const rows = text.indexOf("26.11–30.11 · 2 урока"), first = text.indexOf(lines[0]);
      assert.ok(rows >= 0 && first > rows, `the lines stand UNDER the rows of the lessons: ${text}`);
      assert.ok(!/в эти дни/.test(text), "no «в эти дни»");
      if (balance) assert.ok(text.includes(balance), text);
      const read = await money(run.page, '[data-testid="pause-calc"]');
      if (/Было: долг/.test(text)) reconcile(text, read, name);
      assert.deepEqual((await run.page.evaluate(layoutProbe, '[role="dialog"]')).bad, []);
      await run.page.close();
    });
  }
}

test("Б11.51 С3' the answer with zeros (`recalc_delta` 0, `forgiven_delta` 0): no such lines; an OLD server (the fields are absent) and a role without money (`impact` null): none either", async () => {
  const real = contract("pause_probe_create_week");
  assert.deepEqual([real.impact.recalc_delta, real.impact.forgiven_delta], [0, 0], "the real answer of a world without cancelled lessons");
  const old = { ...real, impact: Object.fromEntries(Object.entries(real.impact).filter(([key]) => !/^(recalc|forgiven)_delta$/.test(key))) };
  for (const [label, answer, props] of [["zeros", real, {}], ["old server", old, {}], ["no money", { ...real, impact: null }, { moneyAvailable: false }]]) {
    const run = await open(pauseServer({ pauses: [], create: (request) => ({ json: { ...answer, dry_run: /dry_run=true/.test(request.query) } }) }), props);
    await run.page.waitForSelector("#pause-first");
    await fillOf(run.page, answer);
    await run.page.waitForSelector('[data-testid="pause-calc"] [data-testid="pause-money"], [data-testid="pause-calc"] p');
    const text = plain(await run.page.locator('[data-testid="pause-calc"]').innerText());
    assert.ok(!/Перерасчёт за уроки, отменённые|Прощение покрывает/.test(text), `${label}: ${text}`);
    await run.page.close();
  }
});
