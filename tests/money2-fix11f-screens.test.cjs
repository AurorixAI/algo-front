// Money-2 fix 11, part F (screens): the windows of enrolment tell the truth about the money before the button, say who will NOT be written, and keep what matters in view on a phone.
// People go through the product's own routes (the list, the search, the boxes, the button); the server (part S) is answered by the stand: `students[].effects`, `skipped_details`, the new phrases of the day.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { setup } = require("./helpers/money2-w2.cjs");
const H = require("./helpers/enrol-v2.cjs");
const { FRAMES, DEBT } = require("./helpers/enrol-v2-frames.cjs");
const { plain } = H;

const ctx = setup(test);
const text = async (page, selector) => plain(await page.locator(selector).first().innerText());
const barSum = (page) => text(page, '[data-testid="summary-bar-sum"]');
const barLine = (page) => text(page, '[data-testid="summary-bar-line"]');
const buttonOf = (page, id = "enrol-submit") => page.locator(`[data-testid="${id}"]`);
const writes = (calls) => calls.filter((c) => c.method === "POST" && /\/students\/(bulk|\w+)$/.test(c.path) && !/dry_run=true/.test(c.query));
const probes = (calls) => calls.filter((c) => c.method === "POST" && /\/students\/bulk$/.test(c.path) && /dry_run=true/.test(c.query));
const noErrors = (run) => assert.deepEqual(run.errors, [], "no error in the console");
const closed = async (page) => { await page.waitForFunction(() => !document.querySelector('[role="dialog"]')); };
const NB = "‑";

const NO_PLACE = "В группе нет мест: 30 из 30. Увеличьте число мест или выберите другую группу";
const DEBT_STAYS = { kind: "transfer", moves: [], stays: [{ code: "debt", text: "Долг 42 000 сум останется за учеником в группе «Алгебра 7»: его оплатят там", amount: 42000, group_name: "Алгебра 7" }], ends: [] };
const NOTHING = { kind: "transfer", moves: [], stays: [], ends: [] };
const CARD_GROUPS = [
  { id: "g7", name: "Алгебра 7", class_level: 7, status: "active", price_current: { amount: 400000, valid_from: "2026-09-01" }, schedule: [] },
  { id: "g2", name: "М11 БС", class_level: 7, status: "active", teacher_name: "Лола Мирзаева", price_current: { amount: 450000, valid_from: "2026-09-01" }, schedule: [H.SLOT(2)], student_count: 5, max_students: 30 },
];
/** the window of a student's card (`mode`: add / transfer) with the groups of the stand */
async function openCard(o = {}) {
  const run = await H.openPage(ctx.browser, "enrol-v2.entry.tsx", H.server({ groups: o.groups ?? CARD_GROUPS, ...(o.server ?? {}) }), { width: o.width ?? 1280, height: (o.width ?? 1280) === 375 ? 812 : 900 });
  await run.page.evaluate(([u, p]) => window.mount("card", u, p), [o.user ?? H.OWNER, { mode: o.mode ?? "add", currentGroupId: "g7", currentGroupName: "Алгебра 7", excludeGroupIds: ["g7"], sourceGroups: [{ id: "g7", name: "Алгебра 7" }], ...(o.props ?? {}) }]);
  await run.page.waitForSelector('[data-testid="assign-group-card"]');
  return run;
}

// ── F1 ───────────────────────────────────────────────────────────────────────────────────────────────

test("F1 (group window): a student moved with a debt that stays - the words of the server stand under him; the server says nothing - no line about the money at all", async () => {
  const run = await H.openDrawer(ctx, H.server({ effectsOf: () => DEBT_STAYS }), { props: { groupName: "М11 БС" } });
  await H.search(run.page, "Назаров"); await H.pick(run.page, "Назаров");
  await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]');
  assert.match(await text(run.page, '[data-testid="enrol-transfer-choice"]'), /Долг 42 000 сум останется за учеником в группе «Алгебра 7»: его оплатят там/);
  await run.page.close();
  const silent = await H.openDrawer(ctx, H.server({ effectsOf: () => NOTHING }), { props: { groupName: "М11 БС" } });
  await H.search(silent.page, "Назаров"); await H.pick(silent.page, "Назаров");
  await H.settled(silent.page);
  const dialog = plain(await silent.page.locator('[role="dialog"]').innerText());
  assert.doesNotMatch(dialog, /Деньги не изменятся/);
  assert.equal(await silent.page.locator('[data-testid="transfer-preview"], [data-testid="transfer-carried-none"]').count(), 0, "the server said nothing: no line about the money");
  await silent.page.close();
  // an older answer with nothing in `carried` says nothing either
  const older = await H.openDrawer(ctx, H.server({ transferCarried: [] }), { props: { groupName: "М11 БС" } });
  await H.search(older.page, "Назаров"); await H.pick(older.page, "Назаров");
  await H.settled(older.page);
  assert.doesNotMatch(plain(await older.page.locator('[role="dialog"]').innerText()), /Деньги не изменятся/);
  await older.page.close();
});

test("F1 (card window): the transfer of ONE student with nothing from the server - no «Деньги не изменятся», no block", async () => {
  const run = await openCard({ mode: "transfer", server: { transferCarried: [] } });
  await run.page.getByRole("radio", { name: "М11 БС" }).check();
  await run.page.waitForFunction(() => { const b = document.querySelector('[data-testid="assign-submit"]'); return b && !b.disabled; }, null, { timeout: 5000 });
  assert.doesNotMatch(plain(await run.page.locator('[role="dialog"]').innerText()), /Деньги не изменятся/);
  assert.equal(await run.page.locator('[data-testid="transfer-preview"]').count(), 0);
  assert.equal(await run.page.locator('[data-testid="enrol-exceptions"]:visible').count(), 0, "nothing to say - no block");
  await run.page.close();
});

// ── F2 ───────────────────────────────────────────────────────────────────────────────────────────────

test("F2: a NEW student and a MOVED one together, «Перевести сюда» - the bar says what the new one pays at once (the sum of the server, his name); the moved one adds nothing", async () => {
  const run = await H.openDrawer(ctx, H.server({ effectsOf: () => DEBT_STAYS }), { props: { groupName: "М11 БС" } });
  await H.pick(run.page, "Каримов");
  await H.search(run.page, "Назаров"); await H.pick(run.page, "Назаров");
  await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]'); await H.settled(run.page);
  assert.equal(await run.page.getByRole("radio", { name: "Перевести сюда" }).getAttribute("aria-checked"), "true");
  assert.equal(await text(run.page, '[data-testid="summary-bar"] p'), "К оплате сразу");
  assert.equal(await barSum(run.page), "188 000 сум");
  assert.equal(await barLine(run.page), "Анвар Каримов — 188 000 · 5 уроков из 12 в ноябре");
  assert.equal(plain(await buttonOf(run.page).innerText()), "Зачислить двоих");
  // the money of the moved one is in his row, in the words of the server - not added to the sum
  assert.match(await text(run.page, '[data-testid="enrol-transfer-choice"]'), /Долг 42 000 сум останется/);
  // one probe of the transfer answers for everything: no probe of the mode `add` next to it (LESSONS 143: one probe, one write)
  assert.equal(probes(run.calls).filter((c) => /mode=add/.test(c.query) && c.body.student_ids.length === 2).length, 0);
  assert.ok(probes(run.calls).some((c) => /mode=transfer/.test(c.query)));
  await run.page.close();
  // only the moved ones chosen: no sum (their money is in their rows), as before
  const only = await H.openDrawer(ctx, H.server({ effectsOf: () => DEBT_STAYS }), { props: { groupName: "М11 БС" } });
  await H.search(only.page, "Назаров"); await H.pick(only.page, "Назаров");
  await only.page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]'); await H.settled(only.page);
  assert.equal(await only.page.locator('[data-testid="summary-bar-sum"]').count(), 0);
  await only.page.close();
});

// ── F3 ───────────────────────────────────────────────────────────────────────────────────────────────

test("F3: one of three will not be written - his own row with the server's reason, the label stays, the button counts those who go through, the sum is the server's", async () => {
  for (const width of [1280, 375]) {
    const run = await H.openDrawer(ctx, H.server({ refuse: { st3: { reason: NO_PLACE, code: "GROUP_FULL" } } }), { width, props: { groupName: "М11 БС" } });
    await H.pick(run.page, "Каримов", "Юсупова", "Рашидов");
    await run.page.waitForSelector('[data-testid="enrol-refused-st3"]'); await H.settled(run.page);
    const row = run.page.locator('[data-testid="enrol-refused-st3"]');
    assert.equal(plain(await row.innerText()), `Тимур Рашидов — не будет записан ${NO_PLACE}`);
    assert.equal(await row.getAttribute("data-row-tone"), "warn");
    assert.equal(await run.page.locator('[data-testid="picked-chip"]').count(), 3, "the label stays: the person takes it off himself");
    assert.equal(plain(await buttonOf(run.page).innerText()), "Зачислить двоих");
    assert.equal(await barSum(run.page), "376 000 сум", "the server counts without the refused one");
    assert.equal(await run.page.locator('[data-testid="enrol-refused-all"]').count(), 0);
    // the label taken off: the row is gone
    await run.page.getByRole("button", { name: "Убрать: Тимур Рашидов" }).click(); await run.page.waitForTimeout(600);
    assert.equal(await run.page.locator('[data-testid="enrol-refused-st3"]').count(), 0);
    noErrors(run);
    await run.page.close();
  }
});

test("F3: everybody refused for the same reason - ONE line «Никто не будет записан» with the reason, the button is off; one chosen and refused - his row, the button off", async () => {
  const all = { st1: { reason: NO_PLACE, code: "GROUP_FULL" }, st2: { reason: NO_PLACE, code: "GROUP_FULL" }, st3: { reason: NO_PLACE, code: "GROUP_FULL" } };
  const run = await H.openDrawer(ctx, H.server({ refuse: all }), { props: { groupName: "М11 БС" } });
  await H.pick(run.page, "Каримов", "Юсупова", "Рашидов");
  await run.page.waitForSelector('[data-testid="enrol-refused-all"]');
  assert.equal(plain(await run.page.locator('[data-testid="enrol-refused-all"]').innerText()), `Никто не будет записан ${NO_PLACE}`);
  assert.equal(await run.page.locator('[data-testid^="enrol-refused-st"]').count(), 0, "not a row per student");
  assert.equal(await buttonOf(run.page).isDisabled(), true);
  assert.equal(await run.page.locator('[data-testid="picked-chip"]').count(), 3);
  assert.equal(await run.page.locator('[data-testid="summary-bar-sum"]').count(), 0);
  await run.page.close();
  const one = await H.openDrawer(ctx, H.server({ refuse: { st1: { reason: NO_PLACE, code: "GROUP_FULL" } } }), { props: { groupName: "М11 БС" } });
  await H.pick(one.page, "Каримов");
  await one.page.waitForSelector('[data-testid="enrol-refused-st1"]');
  assert.equal(plain(await one.page.locator('[data-testid="enrol-refused-st1"]').innerText()), `Анвар Каримов — не будет записан ${NO_PLACE}`);
  assert.equal(await buttonOf(one.page).isDisabled(), true);
  assert.equal(await writes(one.calls).length, 0);
  await one.page.close();
});

test("F3 (card window): the probe of one student is refused in the server's words - his row before the button, the button is off, no «Повторить»", async () => {
  const run = await openCard({ server: { refuseSingle: NO_PLACE } });
  await run.page.getByRole("radio", { name: "М11 БС" }).check();
  await run.page.waitForSelector('[data-testid="enrol-refused-st1"]');
  assert.equal(plain(await run.page.locator('[data-testid="enrol-refused-st1"]').innerText()), `Анвар Каримов — не будет записан ${NO_PLACE}`);
  assert.equal(await buttonOf(run.page, "assign-submit").isDisabled(), true);
  assert.equal(await run.page.locator('[data-testid="pay-from-retry"]').count(), 0, "a refusal is not «Повторить»");
  assert.equal(await run.page.locator('[data-testid="summary-bar-idle"]').count(), 0, "no «не удалось посчитать»");
  await run.page.close();
});

// ── F4 ───────────────────────────────────────────────────────────────────────────────────────────────

test("F4: a whole period given by dates says «13 уроков · весь период 20.11–19.12» (never «из 0»); a month keeps «из N в ноябре»", async () => {
  const B = require("../src/lib/enrol-bar.ts");
  const nb = (t) => plain(t);
  assert.equal(nb(B.lessonsLine({ label: "20.11–19.12", from: "", amount: 450000, lessons: 13, lessons_in_period: 0, whole: true })), "13 уроков · весь период 20.11–19.12");
  assert.equal(nb(B.lessonsLine({ label: "20.11–19.12", from: "", amount: 450000, lessons: 13, lessons_in_period: 13, whole: true })), "13 уроков · весь период 20.11–19.12");
  assert.equal(nb(B.lessonsLine({ label: "ноябрь", from: "", amount: 188000, lessons: 5, lessons_in_period: 12, whole: false })), "5 уроков из 12 в ноябре");
  assert.equal(nb(B.lessonsLine({ label: "ноябрь", from: "", amount: 450000, lessons: 12, lessons_in_period: 12, whole: true })), "12 уроков из 12 в ноябре");
  assert.equal(nb(B.lessonsLine({ label: "19.11–18.12", from: "2026-11-19", amount: 100000, lessons: 5, lessons_in_period: 13, whole: false })), "5 уроков из 13 за период 19.11–18.12");
  // on the screen: the centre with a payment for a period (the server sends no number of the period's lessons)
  const parts = () => [{ label: "20.11–19.12", from: "", amount: 450000, lessons: 13, lessons_in_period: null, whole: true }];
  const run = await H.openDrawer(ctx, H.server({ parts }), { props: { groupName: "М11 БС" } });
  await H.pick(run.page, "Каримов"); await H.settled(run.page);
  assert.equal(await barSum(run.page), "450 000 сум");
  assert.equal(await barLine(run.page), "13 уроков · весь период 20.11–19.12");
  assert.doesNotMatch(plain(await run.page.locator('[data-testid="summary-bar"]').innerText()), /из 0/);
  await run.page.close();
});

// ── F5 ───────────────────────────────────────────────────────────────────────────────────────────────

test("F5 (group window): an own price without the reason - the probe goes with the stand-in reason (the sum follows the price), the press shows the error AT the field and opens the conditions; no plate, no line in the bar", async () => {
  const run = await FRAMES[2](ctx);
  const p = run.page;
  await p.click('[data-testid="enrol-terms-toggle"]');
  await p.fill("#add-student-price-amount", "520000"); await p.waitForTimeout(700); await H.settled(p);
  const last = probes(run.calls).pop();
  assert.deepEqual(last.body.price_override, { amount: 520000, reason: "Проверка последствий" }, "the probe carries the price on the screen");
  assert.equal(await text(p, '[data-testid="enrol-terms-line"]'), "Оплата с 19 ноября, своя цена 520 000");
  assert.equal(await p.locator('[data-testid="enrol-why"], [data-testid="enrol-error"], [data-testid="field-error"]').count(), 0, "nothing is said until the person tries to write");
  assert.equal(await barSum(p), "651 000 сум", "3 x 217 000: the sum of the probe follows the price on the screen (520 000 x 5 / 12, up to a thousand)");
  // the conditions are folded - the press opens them and puts the error at the field
  await p.click('[data-testid="enrol-terms-toggle"]');
  assert.equal(await p.locator('[data-testid="enrol-terms-edit"]').count(), 0);
  await p.click('[data-testid="enrol-submit"]');
  await p.waitForSelector('[data-testid="field-error"]');
  assert.equal(await p.locator('[data-testid="enrol-terms-edit"]').count(), 1, "the conditions opened themselves");
  assert.equal(plain(await p.locator('[data-testid="field-error"]').innerText()), "Укажите причину — от 3 до 200 символов");
  assert.equal(await p.locator('[data-testid="field-error"]').count(), 1, "said once");
  const reason = p.locator("#add-student-price-reason");
  assert.equal(await reason.getAttribute("aria-invalid"), "true");
  assert.equal(await reason.getAttribute("aria-describedby"), "add-student-price-reason-error");
  const [red, green] = (await reason.evaluate((el) => getComputedStyle(el).borderTopColor)).match(/\d+/g).map(Number);
  assert.ok(red > 200 && green < 160, "the red frame of the field");
  assert.equal(await reason.evaluate((el) => document.activeElement === el), true, "the field has the focus");
  assert.equal(await p.locator('[data-testid="enrol-error"], [data-testid="enrol-why"]').count(), 0, "no plate over the bar, no line in it");
  assert.equal(await text(p, '[data-testid="summary-bar-line"]'), "по 217 000 · 5 уроков из 12 в ноябре", "the line of the bar is the sum's, not the error");
  assert.equal(writes(run.calls).length, 0, "nothing is written without the reason");
  // typing the reason takes the error away; then the write goes with the price and the reason
  await reason.fill("Скидка: брат и сёстры");
  assert.equal(await p.locator('[data-testid="field-error"]').count(), 0);
  await p.waitForTimeout(700); await H.settled(p);
  await p.click('[data-testid="enrol-submit"]'); await closed(p);
  const written = writes(run.calls);
  assert.equal(written.length, 1); assert.deepEqual(written[0].body.price_override, { amount: 520000, reason: "Скидка: брат и сёстры" });
  noErrors(run);
  await p.close();
});

test("F5 (card window): the same - the error stands at «Почему своя цена», nothing is written, no plate over the bar", async () => {
  const run = await openCard();
  const p = run.page;
  await p.getByRole("radio", { name: "М11 БС" }).check(); await p.waitForTimeout(600);
  await p.waitForFunction(() => { const b = document.querySelector('[data-testid="assign-submit"]'); return b && !b.disabled; }, null, { timeout: 5000 });
  await p.click('[data-testid="enrol-terms-toggle"]');
  await p.fill("#assign-group-price-amount", "520000"); await p.waitForTimeout(700);
  await p.click('[data-testid="enrol-terms-toggle"]');
  await p.waitForFunction(() => !document.querySelector('[data-testid="assign-submit"]').disabled);
  await p.click('[data-testid="assign-submit"]');
  await p.waitForSelector('[data-testid="field-error"]');
  assert.equal(await p.locator('[data-testid="enrol-terms-edit"]').count(), 1);
  assert.equal(plain(await p.locator('[data-testid="field-error"]').innerText()), "Укажите причину — от 3 до 200 символов");
  assert.equal(await p.locator('[role="dialog"] [role="alert"]').count(), 1, "the only alert is the one at the field");
  assert.equal(writes(run.calls).length, 0);
  await p.close();
});

// ── F6 ───────────────────────────────────────────────────────────────────────────────────────────────

test("F6a: «По ученикам» opens over the bar, inside the pinned block, in view on a phone; at most 40% of the screen with its own scroll; the same on a wide window", async () => {
  for (const width of [375, 1280]) {
    const run = await FRAMES[7](ctx, { width });
    const p = run.page;
    const height = width === 375 ? 812 : 900;
    const box = await p.evaluate(() => {
      const el = document.querySelector('[data-testid="enrol-by-student-box"]'); const r = el.getBoundingClientRect(); const footer = el.closest('[data-modal-part="footer"]');
      const bar = document.querySelector('[data-testid="summary-bar"]').getBoundingClientRect(); const list = el.querySelector("ul");
      return { top: r.top, bottom: r.bottom, inFooter: Boolean(footer), aboveBar: r.bottom <= bar.top + 1, listMax: getComputedStyle(list).maxHeight, overflowY: getComputedStyle(list).overflowY };
    });
    assert.equal(box.inFooter, true, `${width}: a part of the pinned block`);
    assert.equal(box.aboveBar, true);
    assert.ok(box.top >= 0 && box.bottom <= height, `${width}: in the visible area (${box.top}..${box.bottom} of ${height})`);
    assert.equal(box.overflowY, "auto");
    assert.ok(Math.abs(parseFloat(box.listMax) - height * 0.4) < 1, `at most 40% of the screen: ${box.listMax}`);
    assert.equal(await p.locator('[data-testid="enrol-by-student-row"]').count(), 3);
    noErrors(run);
    await p.close();
  }
});

test("F6b: on a phone the special rows stand right under the labels, BEFORE «Ещё ученики»; a wide window keeps them under the list", async () => {
  const order = async (width) => {
    const run = await FRAMES[6](ctx, { width });
    const p = run.page;
    const tops = await p.evaluate(() => {
      const top = (sel) => document.querySelector(sel).getBoundingClientRect().top;
      return { chips: top('[data-testid="picked-chips"]'), rows: top('[data-testid="enrol-exceptions"]'), others: top('[data-testid="enrol-others-title"]'), terms: top('[data-testid="enrol-terms"]') };
    });
    const inView = await p.evaluate(() => { const r = document.querySelector('[data-testid="enrol-exceptions"]').getBoundingClientRect(); const bar = document.querySelector('[data-testid="summary-bar"]').getBoundingClientRect(); return { top: r.top, bar: bar.top }; });
    noErrors(run);
    await p.close();
    return { tops, inView };
  };
  const phone = await order(375);
  assert.ok(phone.tops.chips < phone.tops.rows && phone.tops.rows < phone.tops.others, "chips, then the special rows, then the rest of the students");
  assert.ok(phone.inView.top < phone.inView.bar, "the rows start above the bar: seen without scrolling the list");
  const wide = await order(1280);
  assert.ok(wide.tops.chips < wide.tops.others && wide.tops.others < wide.tops.rows && wide.tops.rows < wide.tops.terms, "as in the mock-up: labels, the list, the special rows, the conditions");
});

// ── F7 ───────────────────────────────────────────────────────────────────────────────────────────────

test("F7: one student - one row: the name once in bold, a debt and «записывается заново» on lines of their own, the server's detail muted under; only the debt has the colour of a warning", async () => {
  const run = await H.openDrawer(ctx, H.server({ past: { st2: [DEBT] }, ordinary: ["st2"], undone: ["st3"] }), { props: { groupName: "М11 БС" } });
  await H.pick(run.page, "Каримов", "Юсупова", "Рашидов");
  await run.page.waitForSelector('[data-testid="enrol-note-past"]'); await run.page.waitForSelector('[data-testid="enrol-note-undone"]'); await H.settled(run.page);
  const rows = run.page.locator('[data-testid="enrol-exceptions"] > [data-row-tone]');
  assert.equal(await rows.count(), 2, "two students with something to say - two rows");
  const first = rows.nth(0);
  assert.equal(await first.getAttribute("data-testid"), "enrol-student-row");
  assert.equal(await first.getAttribute("data-row-tone"), "warn");
  assert.equal(plain(await first.innerText()), `Лола Юсупова — Долг с прошлого раза 15 000 сум · в этой же группе, ушёл 19.11 Выписка Записывается заново ${H.REWRITE}`);
  assert.equal((plain(await first.innerText()).match(/Лола Юсупова/g) || []).length, 1, "the name once");
  const lines = await first.evaluate((el) => Array.from(el.querySelectorAll('[data-testid="enrol-note-past"], [data-testid="enrol-note-rewrite"]')).map((n) => ({ id: n.dataset.testid, top: Math.round(n.getBoundingClientRect().top) })));
  assert.equal(lines.length, 2); assert.ok(lines[1].top > lines[0].top, "one under the other");
  const styles = await first.evaluate((el) => {
    const bold = el.querySelector("b"); const debt = el.querySelector('[data-testid="enrol-note-past"] span span, [data-testid="enrol-note-past"] > div > span > span');
    const detail = el.querySelector('[data-testid="leave-undo-text"]'); const state = el.querySelector('[data-testid="leave-undo-line"]');
    const css = (n) => (n ? getComputedStyle(n) : null);
    return { boldWeight: css(bold).fontWeight, detailSize: css(detail).fontSize, detailColor: css(detail).color, stateColor: css(state).color, debtColor: debt ? css(debt).color : null };
  });
  assert.ok(Number(styles.boldWeight) >= 600, "the name is bold");
  assert.equal(styles.detailSize, "12px", "the detail is small");
  assert.notEqual(styles.detailColor, styles.stateColor, "the detail is muted");
  assert.notEqual(styles.debtColor, styles.stateColor, "the debt has the colour of a warning, the state of a rewrite does not");
  assert.equal(await run.page.locator('[data-testid="enrol-student-row"]', { hasText: "Тимур Рашидов" }).getAttribute("data-row-tone"), "muted", "only a debt and a refusal are in the warning tone");
  await run.page.close();
});

// ── F8 ───────────────────────────────────────────────────────────────────────────────────────────────

test("F8: a hyphen in the name of a group is the non-breaking one in the titles, the buttons, the cards and the messages of BOTH windows", async () => {
  const L = require("../src/lib/enrol-labels.ts");
  assert.equal(L.groupNameShown("М11 Г Пн-Ср-Пт"), `М11 Г Пн${NB}Ср${NB}Пт`);
  assert.equal(L.groupNameShown("Алгебра 7"), "Алгебра 7");
  const NAME = "М11 Г Пн-Ср-Пт"; const SHOWN = `М11 Г Пн${NB}Ср${NB}Пт`;
  // the group window: the title, then the message after the write
  const run = await H.openDrawer(ctx, H.server({ group: { name: NAME } }), { props: { groupName: NAME } });
  assert.equal(plain(await run.page.locator('[role="dialog"] h2').innerText()), `Зачислить в «${SHOWN}»`);
  await H.pick(run.page, "Каримов"); await H.settled(run.page);
  await run.page.click('[data-testid="enrol-submit"]'); await run.page.waitForSelector('[role="status"]');
  assert.match(await text(run.page, '[role="status"]'), new RegExp(`зачислен в «${SHOWN}»`));
  await run.page.close();
  // the card window: the card of the group, the button, the message
  const groups = [{ ...CARD_GROUPS[0], name: "Алгебра 7 Вт-Чт" }, { ...CARD_GROUPS[1], name: NAME }];
  const card = await openCard({ groups, props: { currentGroupName: "Алгебра 7 Вт-Чт" } });
  assert.equal(await text(card.page, '[data-testid="assign-group-card"] [data-testid="group-card-name"]'), SHOWN);
  await card.page.getByRole("radio", { name: NAME }).check(); await card.page.waitForTimeout(500);
  await card.page.waitForFunction(() => !document.querySelector('[data-testid="assign-submit"]').disabled);
  assert.equal(await text(card.page, '[data-testid="assign-submit"]'), `Зачислить в «${SHOWN}»`);
  await card.page.click('[data-testid="assign-submit"]'); await card.page.waitForSelector('[role="status"]');
  assert.match(await text(card.page, '[role="status"]'), new RegExp(`зачислен в «${SHOWN}»`));
  await card.page.close();
});

// ── F9 ───────────────────────────────────────────────────────────────────────────────────────────────

test("F9: the sentence of the server about a move is shown WHOLE with its «;» - not cut into lines", async () => {
  const message = "Из «Алгебра 7» перейдёт 400 000 сум: 212 000 сум пойдут на остаток месяца; аванс останется 188 000 сум";
  const run = await H.openDrawer(ctx, H.server({ transferCarried: [{ code: "payment_carried_over", message }] }), { props: { groupName: "М11 БС" } });
  await H.search(run.page, "Назаров"); await H.pick(run.page, "Назаров");
  await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]');
  const items = await run.page.locator('[data-testid="enrol-transfer-choice"] [data-testid="transfer-carried"] li').allInnerTexts();
  assert.deepEqual(items.map(plain), [plain(message)], "one line, with the «;»");
  await run.page.close();
});

// ── F10 ──────────────────────────────────────────────────────────────────────────────────────────────

test("F10: nobody pays at once because the day of the charge is ahead - the bar says «Начисление начнётся 21 ноября» (the day of the server), nothing else; not with a refusal; the reason of the day is the server's new phrase", async () => {
  const future = { defaultPayFrom: "2026-11-21" };
  const run = await H.openDrawer(ctx, H.server(future), { props: { groupName: "М11 БС" } });
  await H.pick(run.page, "Каримов", "Юсупова"); await run.page.waitForTimeout(700); await H.settled(run.page);
  assert.equal(await text(run.page, '[data-testid="summary-bar-idle"]'), "Начисление начнётся 21 ноября");
  assert.equal(await run.page.locator('[data-testid="summary-bar-sum"]').count(), 0);
  assert.equal(await text(run.page, '[data-testid="enrol-terms-line"]'), "Оплата с 21 ноября, по цене группы");
  assert.equal(await text(run.page, '[data-testid="enrol-terms-why"]'), "ближайшее занятие группы");
  await run.page.close();
  // a refusal in the answer: the line is not said (the person has a bigger thing to read)
  const refused = await H.openDrawer(ctx, H.server({ ...future, refuse: { st2: { reason: NO_PLACE, code: "GROUP_FULL" } } }), { props: { groupName: "М11 БС" } });
  await H.pick(refused.page, "Каримов", "Юсупова"); await refused.page.waitForSelector('[data-testid="enrol-refused-st2"]'); await H.settled(refused.page);
  assert.equal(await refused.page.locator('[data-testid="summary-bar-idle"]').count(), 0);
  await refused.page.close();
  // a role without the right to money has no bar of sums
  const poor = await H.openDrawer(ctx, H.server(future), { user: H.ADMIN_NO_MONEY, props: { groupName: "М11 БС", money: false } });
  await H.pick(poor.page, "Каримов"); await poor.page.waitForTimeout(600);
  assert.doesNotMatch(plain(await poor.page.locator('[role="dialog"]').innerText()), /Начисление начнётся/);
  await poor.page.close();
  // the day is today: the phrase «сегодня у группы занятие», and a sum at once
  const today = await FRAMES[2](ctx);
  assert.equal(await text(today.page, '[data-testid="enrol-terms-why"]'), "сегодня у группы занятие");
  assert.equal(await today.page.locator('[data-testid="summary-bar-idle"]').count(), 0);
  await today.page.close();
  // the card window says the same
  const card = await openCard({ server: future });
  await card.page.getByRole("radio", { name: "М11 БС" }).check(); await card.page.waitForTimeout(700);
  await card.page.waitForFunction(() => !document.querySelector('[data-testid="assign-submit"]').disabled);
  assert.equal(await text(card.page, '[data-testid="summary-bar-idle"]'), "Начисление начнётся 21 ноября");
  await card.page.close();
});

// ── F11 ──────────────────────────────────────────────────────────────────────────────────────────────

test("F11a: the message after enrolment from the card names the sum of the last probe, as the window of a group does; a role without money - no sum", async () => {
  const run = await FRAMES[15](ctx);
  await run.page.click('[data-testid="assign-submit"]'); await closed(run.page);
  assert.match(await text(run.page, '[role="status"]'), /^Анвар Каримов зачислен в «Физика 7» К оплате 231 000 сум — на странице «Оплаты»/);
  await run.page.close();
  const poor = await openCard({ user: H.ADMIN_NO_MONEY, props: { money: false } });
  await poor.page.getByRole("radio", { name: "М11 БС" }).check(); await poor.page.waitForTimeout(500);
  await poor.page.waitForFunction(() => !document.querySelector('[data-testid="assign-submit"]').disabled);
  await poor.page.click('[data-testid="assign-submit"]'); await poor.page.waitForSelector('[role="status"]');
  assert.doesNotMatch(await text(poor.page, '[role="status"]'), /К оплате/);
  await poor.page.close();
});

test("F11b: the window of the card keeps its height while the person types in the search (a minimal height of the list)", async () => {
  const groups = [CARD_GROUPS[0], ...Array.from({ length: 2 }, (_, i) => ({ ...CARD_GROUPS[1], id: `gx${i}`, name: `Группа ${i + 1}`, teacher_name: `Преподаватель ${i + 1}` }))];
  for (const width of [1280, 375]) {
    const run = await openCard({ groups, width });
    const p = run.page;
    const dialog = p.locator('[role="dialog"]');
    const heights = [];
    await p.waitForTimeout(600);   // the window has finished opening (it grows from 95% while it appears)
    heights.push(Math.round((await dialog.boundingBox()).height));
    await p.fill("#assign-group-search", "Группа 2"); await p.waitForTimeout(150);
    assert.equal(await p.locator('[data-testid="assign-group-card"]').count(), 1);
    heights.push(Math.round((await dialog.boundingBox()).height));
    await p.fill("#assign-group-search", "Группа 1"); await p.waitForTimeout(150);
    heights.push(Math.round((await dialog.boundingBox()).height));
    await p.fill("#assign-group-search", "нет такой"); await p.waitForTimeout(150);
    heights.push(Math.round((await dialog.boundingBox()).height));
    assert.ok(Math.max(...heights) - Math.min(...heights) <= 1, `${width}: the window does not jump: ${heights.join(" / ")}`);
    noErrors(run);
    await p.close();
  }
});

test("F11c: «Оставить в обеих» - under the switch the sentence of the server about what the student pays at once here (the probe of the mode add); the server says none - nothing", async () => {
  const said = "К оплате сразу 188 000 сум (5 уроков)";
  const run = await H.openDrawer(ctx, H.server({ effectsOf: () => DEBT_STAYS, immediateText: () => said }), { props: { groupName: "М11 БС" } });
  await H.search(run.page, "Назаров"); await H.pick(run.page, "Назаров");
  await run.page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]'); await H.settled(run.page);
  assert.equal(await run.page.locator('[data-testid="enrol-add-words"]').count(), 0, "«Перевести сюда»: his money is told by the move");
  await run.page.getByRole("radio", { name: "Оставить в обеих" }).click(); await run.page.waitForTimeout(700); await H.settled(run.page);
  assert.equal(await text(run.page, '[data-testid="enrol-add-words"]'), said);
  const order = await run.page.evaluate(() => { const row = document.querySelector('[data-testid="enrol-transfer-choice"]'); return row.querySelector('[data-testid="enrol-mode"]').getBoundingClientRect().bottom <= row.querySelector('[data-testid="enrol-add-words"]').getBoundingClientRect().top + 1; });
  assert.equal(order, true, "under the switch");
  await run.page.close();
  const none = await H.openDrawer(ctx, H.server({ parts: () => null }), { props: { groupName: "М11 БС" } });
  await H.search(none.page, "Назаров"); await H.pick(none.page, "Назаров"); await none.page.waitForSelector('[data-testid="transfer-preview"][data-state="ready"]'); await H.settled(none.page);
  await none.page.getByRole("radio", { name: "Оставить в обеих" }).click(); await none.page.waitForTimeout(700);
  assert.equal(await none.page.locator('[data-testid="enrol-add-words"]').count(), 0, "no sentence of the server - nothing");
  await none.page.close();
});

// ── F12 ──────────────────────────────────────────────────────────────────────────────────────────────

test("F12: the reason of the day is read from both new phrases of the server; the old one is gone from the stand", () => {
  const T = require("../src/lib/enrol-terms.ts");
  assert.equal(T.payFromReason("Оплата с 19.11.2026 — сегодня у группы занятие"), "сегодня у группы занятие");
  assert.equal(T.payFromReason("Оплата с 21.11.2026 — ближайшее занятие группы"), "ближайшее занятие группы");
  assert.equal(T.payFromReason("Оплата считается с 19.11.2026: у группы нет занятий в ближайшие дни"), "у группы нет занятий в ближайшие дни");
  assert.equal(T.payStartsLine("2026-11-21", "2026-11-19"), "Начисление начнётся 21 ноября");
  assert.equal(T.payStartsLine("2027-01-05", "2026-11-19"), "Начисление начнётся 5 января 2027");
  assert.deepEqual(T.ownPriceError({ enabled: true, amount: "520 000", reason: "" }), { field: "reason", text: "Укажите причину — от 3 до 200 символов" });
  assert.equal(T.ownPriceError({ enabled: true, amount: "520 000", reason: "Скидка" }), null);
  assert.equal(T.dryRunOverride({ enabled: true, amount: "520 000", reason: "" }).request.reason, "Проверка последствий");
  assert.equal(T.dryRunOverride({ enabled: true, amount: "520 000", reason: "Скидка" }).request.reason, "Скидка");
});
