// PAY-TAILS Б11.39 + Б11.40 (part 16), the window «Пауза ученика» in a real browser (headless Chromium, the CSS of the project).  Each rule Э1-Э8 of the spec is a check of the DOM; the money of a pause is
// the rows of the server's `charge_rows` (the REAL answers of the server: tests/fixtures/paytails/part16/pause_probe_*.json, byte copies of `paytails-r7/answers/`); «the window = the answer»: the labels, the
// counts and the sums on the screen are the rows of the sample, written here by hand from the answer (not from the code).  PNGs: node tests/dom/paytails-part16-shots.cjs <dir>.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { setup, plain, mount, OWNER, ADMIN } = require("./helpers/money2-w2.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { readReal } = require("./helpers/paytails-part13.cjs");
const { contract, pauseOf, pauseServer, day, dmy, dm } = require("./helpers/paytails-part16.cjs");

const ctx = setup(test);
const root = path.join(__dirname, "..");
const NB = " ";
const open = (server, props = {}, width = 1280, user = OWNER) => mount(ctx, server, "pause", user, { moneyAvailable: true, ...props }, width);
const footer = (page) => page.locator('[role="dialog"] [data-modal-part="footer"]');
const footerButtons = async (page) => (await footer(page).locator("button").allInnerTexts()).map(plain);
const dialogText = async (page) => plain(await page.locator('[role="dialog"]').innerText());
const dateOf = (iso) => dm(iso);
const factsOf = (first, last, days) => `с ${dateOf(first)} по ${dateOf(last)} · ${days} ${days % 10 === 1 && days % 100 !== 11 ? "день" : [2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100) ? "дня" : "дней"}`;
const fill = async (page, first, last) => { await page.fill("#pause-first", dmy(first)); await page.fill("#pause-last", dmy(last)); };
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
      later: t(element.querySelector('[data-testid="pause-money-later"]')),
      note: t(element.querySelector('[data-testid="pause-money-note"]')),
    };
  });
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
    assert.equal(plain(await run.page.locator('[data-testid="pause-hint"]').innerText()), "Дни паузы не входят в стоимость, место в группе сохраняется.");
    const text = await dialogText(run.page);
    for (const gone of ["Уже есть", "Задним числом можно", "Укажите, с какого по какое"]) assert.ok(!text.includes(gone), gone);
    assert.deepEqual(await footerButtons(run.page), ["Отмена", "Поставить на паузу"]);
    assert.equal(await run.page.locator('[data-testid="pause-why"]').count(), 0, "the button is off and nothing is written over it");
    assert.equal(await run.page.locator('button[form="pause-form"]').isDisabled(), true);
    assert.equal(await run.page.evaluate(() => document.activeElement?.id === "pause-first"), width === 1280, width === 1280 ? "the field «С» has the focus on a wide screen" : "no focus in «С» below sm (no keyboard)");
    await run.page.close();
  });
}

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
  assert.equal(await planned.getByRole("button", { name: "Снять паузу", exact: true }).getAttribute("data-variant"), "secondary");
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
    assert.deepEqual(await money(run.page, '[data-testid="pause-card-acting"]'), { heading: "Снова входят в стоимость", rows: [["24.11–30.11 · 3 урока", "+150 000 сум"]], total: null, later: null, note: null });
    assert.equal(await run.page.locator("#pause-act-reason").count(), 0, "a plain ending asks no reason until the server wants it");
    assert.equal(await acting.getByRole("button", { name: "Закончить паузу", exact: true }).getAttribute("data-variant"), "primary");
    assert.equal(await acting.getByRole("button", { name: "Назад", exact: true }).count(), 1);
    assert.deepEqual(await footerButtons(run.page), ["Закрыть"]);
    assert.equal(askedFor(run, "PATCH", /\/pauses\/pr1$/, true).at(-1).body.last_day, day(-1));
    const probe = await run.page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(probe.bad, []);
    await acting.getByRole("button", { name: "Закончить паузу", exact: true }).click();
    await run.page.waitForFunction(() => window.__log.some((line) => line.startsWith("changed:Пауза закончена")));
    assert.equal(askedFor(run, "PATCH", /\/pauses\/pr1$/, false).at(-1).body.last_day, day(-1));
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
  assert.deepEqual(await money(run.page, '[data-testid="pause-card-acting"]'), { heading: "Снова входят в стоимость", rows: [["17.11–30.11 · 6 уроков, из них 3 уже прошли", "+300 000 сум"]], total: null, later: null, note: null });
  const label = acting.locator('label[for="pause-act-reason"]');
  assert.equal(plain(await label.innerText()), "Причина (обязательно)");
  assert.ok((await acting.locator('[data-testid="pause-money"]').boundingBox()).y < (await label.boundingBox()).y, "the reason stands under the money");
  assert.ok((await label.boundingBox()).y < (await acting.getByRole("button", { name: "Снять паузу целиком" }).boundingBox()).y, "and over the buttons");
  assert.equal(await acting.getByRole("button", { name: "Снять паузу целиком" }).getAttribute("data-variant"), "secondary");
  await acting.getByRole("button", { name: "Снять паузу целиком" }).click();
  assert.match(plain(await acting.locator('[role="alert"]').innerText()), /^Укажите причину/, "the refusal of an empty reason stands in the card where the person pressed");
  assert.equal(askedFor(run, "POST", /\/void$/, false).length, 0);
  await run.page.fill("#pause-act-reason", "ученик передумал");
  await acting.getByRole("button", { name: "Снять паузу целиком" }).click();
  await run.page.waitForFunction(() => window.__log.includes("changed:Пауза снята"));
  assert.equal(askedFor(run, "POST", /\/void$/, false).at(-1).body.reason, "ученик передумал");
  await run.page.close();
});

test("Э3 / Э7' «Снять паузу» of a planned pause: «Пауза не начнётся, её дни войдут в стоимость.»; no rows, only the quiet line of the period that is not charged yet; «Назад» returns to the cards", async () => {
  const answer = contract("pause_probe_void_future");
  const server = pauseServer({ pauses: [PLANNED()], void: { ...answer } });
  const run = await open(server);
  await run.page.getByRole("button", { name: "Снять паузу", exact: true }).click();
  await run.page.waitForSelector('[data-testid="pause-money"]');
  const acting = run.page.locator('[data-testid="pause-card-acting"]');
  assert.match(plain(await acting.locator('[data-testid="pause-summary"]').innerText()), /^Пауза запланирована · с /);
  assert.equal(plain(await acting.locator('[data-testid="pause-act-sentence"]').innerText()), "Пауза не начнётся, её дни войдут в стоимость.");
  assert.deepEqual(await money(run.page), { heading: "Снова входят в стоимость", rows: [], total: null, later: "01.12–10.12 — следующий период: эти дни в стоимость войдут.", note: null });
  assert.equal(await acting.getByRole("button", { name: "Снять паузу", exact: true }).count(), 1);
  await acting.getByRole("button", { name: "Назад", exact: true }).click();
  await run.page.waitForSelector('[data-testid="pause-card"]');
  assert.equal(await run.page.locator('[data-testid="pause-card-acting"]').count(), 0);
  await run.page.close();
});

test("Э3 «Закончить сегодня»: the field of the reason appears only after the server answered REASON_REQUIRED (as before), the write then sends it", async () => {
  const wanted = { status: 422, json: { detail: { code: "REASON_REQUIRED", message: "Укажите причину" } } };
  const answer = contract("pause_probe_end_today");
  const server = pauseServer({ pauses: [RUNNING()], end: (request) => (/dry_run=true/.test(request.query) ? wanted : { json: { ...answer, dry_run: false } }) });
  const run = await open(server);
  await run.page.getByRole("button", { name: "Закончить сегодня" }).click();
  await run.page.waitForSelector("#pause-act-reason");
  assert.equal(await run.page.locator('[data-testid="pause-money"]').count(), 0, "the dry run answered no rows: nothing is invented");
  await run.page.getByRole("button", { name: "Закончить паузу", exact: true }).click();
  assert.match(plain(await run.page.locator('[data-testid="pause-card-acting"] [role="alert"]').innerText()), /^Укажите причину/, "an empty reason is refused in the card, nothing is sent");
  assert.equal(askedFor(run, "PATCH", /\/pauses\/pr1$/, false).length, 0);
  await run.page.fill("#pause-act-reason", "ошиблись в дате");
  await run.page.getByRole("button", { name: "Закончить паузу", exact: true }).click();
  await run.page.waitForFunction(() => window.__log.some((line) => line.startsWith("changed:Пауза закончена")));
  assert.equal(askedFor(run, "PATCH", /\/pauses\/pr1$/, false).at(-1).body.reason, "ошиблись в дате");
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

const LATER_SET = (label) => `${label} — следующий период: эти дни в стоимость не войдут.`;
const BEGINS = (label, from) => `${label} — оплата периода начнётся ${from}, до этого дня он в стоимость не входит`;
const CALC_CASES = [
  { name: "pause_probe_create_week", rows: [["24.11–30.11 · 3 урока", -150000]], total: null, later: null },
  { name: "pause_probe_create_two_months", rows: [["24.11–30.11 · 3 урока", -150000]], total: null, later: LATER_SET("01.12–03.12") },
  { name: "pause_probe_create_two_months_begun", rows: [["24.11–30.11 · 3 урока", -150000], ["01.12–03.12 · 2 урока", -86000]], total: -236000, later: null },
  { name: "pause_probe_create_backdated", rows: [["17.11–30.11 · 6 уроков", -300000]], total: null, later: null },
  { name: "pause_probe_create_future_month", rows: [], total: null, later: LATER_SET("01.12–10.12") },
  // Б11.43: the three worlds with `period_begins` - the number of lessons is NOT written on that row, the sentence says when the period starts to count
  { name: "pause_probe_create_two_months_begun_0212", rows: [["24.11–30.11 · 3 урока", -150000], [BEGINS("01.12–03.12", "04.12"), -600000]], total: -750000, later: null },
  { name: "pause_probe_create_backdated_month_start", rows: [[BEGINS("01.12–10.12", "11.12"), -600000]], total: null, later: null },
];
for (const width of [1280, 375]) {
  for (const one of CALC_CASES) {
    test(`Э6 (${width}) ${one.name}: heading «Не входят в стоимость», the rows ARE the charge_rows of the answer${one.total !== null ? ", «Итого» under a line" : ""}, «Место в группе сохраняется.»; the line under the dates is gone`, async () => {
      const answer = contract(one.name);
      const run = await open(pauseServer({ pauses: [], create: (request) => ({ json: { ...answer, dry_run: /dry_run=true/.test(request.query) } }) }), {}, width);
      await run.page.waitForSelector("#pause-first");
      await fill(run.page, day(0), day(6));
      await run.page.waitForSelector('[data-testid="pause-money"]');
      const read = await money(run.page, '[data-testid="pause-calc"]');
      assert.deepEqual(read.rows.map(([label, amount]) => [label, amount && Number(amount.replace(/[^\d]/g, "")) * (amount.startsWith("−") ? -1 : 1)]), one.rows.map(([label, amount]) => [label, amount]));
      for (const [index, [, amount]] of read.rows.entries()) assert.equal(amount, sum(one.rows[index][1]), "a real minus sign and a space that does not break");
      assert.equal(read.heading, "Не входят в стоимость");
      assert.equal(read.total, one.total === null ? null : sum(one.total));
      assert.equal(read.later, one.later);
      assert.equal(read.note, "Место в группе сохраняется.");
      assert.equal(answer.charge_rows.length, one.rows.length, "the sample is the one the test describes");
      assert.equal(answer.charge_rows.reduce((total, row) => total + row.amount, 0), answer.impact.charged_delta, "the sample itself keeps «Σ rows = charged_delta» (Б11.40 С4')");
      assert.equal(await run.page.locator('[data-testid="pause-hint"]').count(), 0, "the calculation replaces the quiet line");
      const text = await dialogText(run.page);
      assert.ok(!text.includes("Дни паузы не входят в стоимость:"), "no old line next to the rows");
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
  assert.ok(text.includes("Остаток: долг 600 000 сум → долг 450 000 сум"), text);
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
  await fill(run.page, day(0), day(6));
  await run.page.waitForSelector('[data-testid="pause-money"]');
  const read = await money(run.page, '[data-testid="pause-calc"]');
  assert.deepEqual(read, { heading: "Не входят в стоимость", rows: [["24.11–30.11 · 3 урока", null]], total: null, later: LATER_SET("01.12–03.12"), note: "Место в группе сохраняется." });
  assert.ok(!/сум|\d{3}/.test(plain(await run.page.locator('[data-testid="pause-calc"]').innerText()).replace(/\d\d\.\d\d/g, "")), "no money digits");
  await run.page.close();
});

for (const name of ["pause_probe_create_packages", "pause_probe_create_personal"]) {
  test(`Э6 / Б11.40 С1' ${name} (no rows, no later): the OLD one line stays (the sentence with the sum, «Место в группе сохраняется.»), no block of rows`, async () => {
    const answer = contract(name);
    const run = await open(pauseServer({ pauses: [], create: { ...answer } }));
    await run.page.waitForSelector("#pause-first");
    await fill(run.page, day(0), day(6));
    await run.page.waitForSelector('[data-testid="pause-calc-wrap"]');
    assert.equal(await run.page.locator('[data-testid="pause-money"]').count(), 0);
    // the real answers: the pause has `days` 15 (packages) / 7 (personal); the sum of the change is 0, so the sentence has no sum
    assert.equal(plain(await run.page.locator('[data-testid="pause-calc"]').innerText()), `Дни паузы не входят в стоимость: ${answer.pause.days} дней. Место в группе сохраняется.`);
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
  assert.equal(plain(await run.page.locator('[data-testid="pause-calc"]').innerText()), "Дни паузы не входят в стоимость: 7 дней, −150 000 сум. Место в группе сохраняется. Остаток: долг 600 000 сум → долг 450 000 сум");
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
  assert.match(lines[0], /^Пауза задним числом: уроки с \d\d\.\d\d по \d\d\.\d\d не будут засчитаны ни ученику, ни преподавателю$/);
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

test("Э6 (375) the sum of a row stands in ONE line on the right and does not leave the box - a seven-digit sum, the longest label (two years, many lessons, «из них … уже прошли»)", async () => {
  const answer = {
    ...contract("pause_probe_create_two_months_begun"),
    charge_rows: [
      { label: "24.11.2026–10.01.2027", first_day: "2026-11-24", last_day: "2027-01-10", days: 48, lessons: 120, lessons_passed: 37, amount: -1234567 },
      { label: "11.01.2027–30.01.2027", first_day: "2027-01-11", last_day: "2027-01-30", days: 20, lessons: 8, lessons_passed: null, amount: -9876543 },
    ],
    impact: { ...contract("pause_probe_create_two_months_begun").impact, charged_delta: -11111110 },
  };
  const run = await open(pauseServer({ pauses: [], create: { ...answer } }), {}, 375);
  await run.page.waitForSelector("#pause-first");
  await fill(run.page, day(0), day(6));
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

test("«окно = ответ»: for EVERY sample of the contract the rows on the screen (label, count word, sign and digits of the sum) are the rows of the answer", async () => {
  const names = fs.readdirSync(path.join(root, "tests", "fixtures", "paytails", "part16")).filter((file) => /^pause_probe_(create|end|void).*\.json$/.test(file)).map((file) => file.replace(/\.json$/, ""));
  assert.equal(names.length, 14, names.join());
  const wordFor = (n) => (n % 10 === 1 && n % 100 !== 11 ? "урок" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "урока" : "уроков");
  for (const name of names) {
    const answer = contract(name);
    const kind = name.includes("_end_") ? "end" : name.includes("_void_") ? "void" : "create";
    const rows = answer.charge_rows ?? [];
    const run = kind === "create"
      ? await open(pauseServer({ pauses: [], create: { ...answer } }))
      : await open(pauseServer({ pauses: [RUNNING()], end: { ...answer }, void: { ...answer } }));
    if (kind === "create") { await run.page.waitForSelector("#pause-first"); await fill(run.page, day(0), day(6)); await run.page.waitForSelector('[data-testid="pause-calc-wrap"], [data-testid="pause-calc"] [role="alert"]'); }
    else { await run.page.getByRole("button", { name: kind === "end" ? "Закончить сегодня" : "Снять паузу целиком" }).click(); await run.page.waitForSelector('[data-testid="pause-act-calc"], [data-testid="pause-act-sentence"]'); await run.page.waitForTimeout(250); }
    const scope = kind === "create" ? '[data-testid="pause-calc"]' : '[data-testid="pause-card-acting"]';
    const shown = await run.page.locator(`${scope} [data-testid="pause-money-row"]`).evaluateAll((items) => items.map((li) => [li.querySelector('[data-testid="pause-money-label"]').textContent.replace(/[\s ]+/g, " ").trim(), li.querySelector('[data-testid="pause-money-amount"]')?.textContent.replace(/[\s ]+/g, " ").trim() ?? null]));
    assert.equal(shown.length, rows.length, `${name}: one row per record`);
    rows.forEach((row, index) => {
      const count = row.lessons !== null ? `${row.lessons} ${wordFor(row.lessons)}` : `${row.days} дней`;
      if (row.period_begins) {
        // Б11.43: no number of lessons, the date the period starts to count (hand-written from the spec)
        const from = `${row.period_begins.slice(8, 10)}.${row.period_begins.slice(5, 7)}`;
        assert.equal(shown[index][0], row.amount < 0 ? `${row.label} — оплата периода начнётся ${from}, до этого дня он в стоимость не входит` : `${row.label} — период входит в стоимость с ${from}`, name);
        assert.ok(!shown[index][0].includes("урок") && !shown[index][0].includes("из них"), `${name}: no lessons on a row with period_begins`);
      } else {
        assert.ok(shown[index][0].startsWith(`${row.label} · ${count}`), `${name}: ${shown[index][0]}`);
        assert.equal(shown[index][0].includes("из них"), Boolean(row.lessons_passed), `${name}: «из них … уже прошли» only where lessons_passed > 0`);
      }
      assert.equal(shown[index][1], row.amount === null ? null : sum(row.amount), name);
    });
    const later = await run.page.locator(`${scope} [data-testid="pause-money-later"]`).count();
    assert.equal(later, answer.charge_later ? 1 : 0, `${name}: the line of the period that is not charged yet`);
    if (answer.charge_later) assert.ok(plain(await run.page.locator(`${scope} [data-testid="pause-money-later"]`).innerText()).startsWith(`${answer.charge_later.label} — следующий период: эти дни в стоимость`));
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

// ── Б11.43: a row of a period that has not begun (the real answers of the worlds with `period_begins`) ─────────────

for (const width of [1280, 375]) {
  test(`Б11.43 (${width}) «Снять паузу целиком» (the world 02.12): the row of a period that begins later says «период входит в стоимость с 01.12» and NO lessons; the row of November keeps «3 урока, из них 3 уже прошли»; the total is the sum of the rows`, async () => {
    const answer = contract("pause_probe_void_two_months_0212");
    const run = await open(pauseServer({ pauses: [RUNNING()], void: (request) => ({ json: { ...answer, dry_run: /dry_run=true/.test(request.query) } }) }), {}, width);
    await run.page.getByRole("button", { name: "Снять паузу целиком" }).click();
    await run.page.waitForSelector('[data-testid="pause-money"]');
    const read = await money(run.page, '[data-testid="pause-card-acting"]');
    assert.deepEqual(read, {
      heading: "Снова входят в стоимость",
      rows: [["24.11–30.11 · 3 урока, из них 3 уже прошли", "+150 000 сум"], ["01.12–03.12 — период входит в стоимость с 01.12", "+600 000 сум"]],
      total: "+750 000 сум", later: null, note: null,
    });
    assert.equal(answer.charge_rows.reduce((total, row) => total + row.amount, 0), answer.impact.charged_delta, "the sample keeps «Σ rows = charged_delta»");
    const probe = await run.page.evaluate(layoutProbe, '[role="dialog"]');
    assert.deepEqual(probe.bad, []);
    assert.equal(probe.scroll, 0);
    await run.page.close();
  });
}

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
    if (action === "void") await run.page.fill("#pause-act-reason", "ученик передумал");
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
  await run.page.locator('[data-testid="pause-card"][data-state="planned"]').getByRole("button", { name: "Снять паузу", exact: true }).click();
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
