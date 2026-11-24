// PAY-TAILS Б11.33, screens part 13, in a real browser (headless Chromium, the CSS of the project).
//   А. The window «Внести оплату», block «Куда пойдут N сум» (п.2): a row per period, the total under a line; the rows, the words and the sums are the server's (fixtures «по договору Б11.33»).
//      Lesson 174 in every state: the sum of the rows on the screen IS the typed amount; the total IS the number of the answer (and the pieces of the quiet line add up to it).
//   Б. The pause closed by a leaving (п.1): the days are text, one calm sentence of the server, the reason is edited, the pause is taken off whole; a 409 is said on the spot.
// PNGs: node tests/dom/paytails-part13-shots.cjs <dir>.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, F, OWNER } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { STATES, previewState, paymentServer, read, TOSHMATOV } = require("./helpers/paytails-part13.cjs");

const ctx = setup(test);
const NB = " ";
const digitsOf = (text) => Number(String(text).replace(/\D/g, ""));

async function openWindow(state, width, extra) {
  const run = await openPage(ctx.browser, "money.entry.tsx", paymentServer(state, extra), { width, height: width === 375 ? 812 : 900 });
  await run.page.evaluate(([u, membership]) => window.mount("till", u, { membership }), [undefined, TOSHMATOV]);
  for (let waited = 0; !run.calls.some((call) => call.path.endsWith("/payments/preview")) && waited < 5000; waited += 25) await run.page.waitForTimeout(25);
  const amount = state === null ? 400000 : previewState(state).amount;
  await run.page.fill("#payment-amount", String(amount));
  await run.page.click('[data-testid="payment-methods"] >> text=Наличные');
  return { ...run, amount };
}

/** What a person reads: [label, amount, mark] per row, then the total and the quiet line. */
async function read13(page) {
  const rows = await page.locator('[data-testid="payment-split-row"]').evaluateAll((items) => items.map((item) => [
    item.querySelector('[data-testid="payment-split-label"]').textContent,
    item.querySelector('[data-testid="payment-split-amount"]').textContent,
    item.querySelector('[data-testid="payment-split-mark"]')?.textContent ?? null,
  ]));
  const text = async (testid) => ((await page.locator(`[data-testid="${testid}"]`).count()) ? plain(await page.locator(`[data-testid="${testid}"]`).innerText()) : null);
  return {
    title: await text("payment-calc-title"), rows, totalLabel: await text("payment-split-total-label"), totalAmount: await text("payment-split-total-amount"), rest: await text("payment-split-rest"),
  };
}

// what each state must say - written by hand from the contract, not from the code
const EXPECTED = {
  partial_one_period: { title: "Куда пойдут 200 000 сум", rows: [["Октябрь", "200 000", "из 550 000"]], totalLabel: "Останется долг", totalAmount: "900 000 сум", rest: "октябрь — 350 000 · ноябрь — 550 000" },
  owner_example_two_periods: {
    title: "Куда пойдут 550 000 сум", rows: [["Сентябрь, остаток", "42 000", "✓ закрыт"], ["Октябрь", "508 000", "из 550 000"]],
    totalLabel: "Останется долг", totalAmount: "1 142 000 сум", rest: "октябрь — 42 000 · ноябрь — 550 000 · декабрь — 550 000",
  },
  four_periods_fold_advance: {
    title: "Куда пойдут 1 800 000 сум", rows: [["Сентябрь, остаток", "42 000", "✓ закрыт"], ["Октябрь – декабрь", "1 650 000", "✓ закрыты"], ["Аванс на январь", "108 000", null]],
    totalLabel: "Долга не останется", totalAmount: "аванс 108 000 сум", rest: null,
  },
  within_term_due: { title: "Куда пойдут 231 000 сум", rows: [["Ноябрь", "231 000", "из 550 000"]], totalLabel: "Долг закрыт", totalAmount: null, rest: null },
  single_closed: { title: "Куда пойдут 550 000 сум", rows: [["Октябрь", "550 000", "✓ закрыт"]], totalLabel: "Долг закрыт", totalAmount: null, rest: null },
  packages: {
    title: "Куда пойдут 550 000 сум", rows: [["Пакет № 3", "400 000", "✓ закрыт"], ["Пакет № 4", "150 000", "из 400 000"]], totalLabel: "Останется долг", totalAmount: "250 000 сум", rest: "пакет № 4 — 250 000",
  },
  personal_periods_dates: {
    title: "Куда пойдут 400 000 сум", rows: [["15.10–14.11", "300 000", "✓ закрыт"], ["15.11–14.12", "100 000", "из 300 000"]], totalLabel: "Останется долг", totalAmount: "200 000 сум", rest: "15.11–14.12 — 200 000",
  },
  year_and_long_labels: {
    title: "Куда пойдут 200 000 сум", rows: [["Декабрь 2025, остаток", "80 000", "✓ закрыт"], ["Январь 2026", "120 000", "из 600 000"]], totalLabel: "Останется долг", totalAmount: "1 080 000 сум", rest: "январь 2026 — 480 000 · февраль 2026 — 600 000",
  },
};

for (const width of [1280, 375]) {
  for (const state of STATES) {
    test(`А (${width}) «${state}»: rows, marks, total and the quiet line are the server's; the rows add up to the typed amount, the total is the number of the answer (174); sums right-aligned, never broken`, async () => {
      const { page, amount } = await openWindow(state, width);
      await page.waitForSelector('[data-testid="payment-split"]');
      const answer = previewState(state);
      const got = await read13(page);
      const want = EXPECTED[state];
      assert.equal(got.title, want.title);
      assert.deepEqual(got.rows.map(([label, sum, mark]) => [plain(label), plain(sum), mark === null ? null : plain(mark)]), want.rows);
      assert.equal(got.totalLabel, want.totalLabel);
      assert.equal(got.totalAmount, want.totalAmount);
      assert.equal(got.rest, want.rest);
      // the sentence of the old answer is not shown, the block is one h3
      assert.equal(await page.locator('[data-testid="payment-plan-sentence"]').count(), 0);
      assert.equal(await page.locator('[data-testid="payment-calc"] h3').count(), 1);
      // lesson 174: every number is found on the screen as a sum of the numbers next to it
      assert.equal(got.rows.reduce((total, row) => total + digitsOf(row[1]), 0), amount, "the rows add up to the typed amount");
      assert.equal(digitsOf(got.title), amount, "the title says the typed amount");
      if (answer.debt_after > 0) {
        assert.equal(digitsOf(got.totalAmount), answer.debt_after, "the total is the debt of the answer");
        const pieces = await page.locator('[data-testid="payment-split-rest"] > span > span').allTextContents();
        assert.equal(pieces.reduce((total, piece) => total + digitsOf(/\d+(?:\u00a0\d{3})*$/.exec(piece)[0]), 0), answer.debt_after, "the quiet line adds up to the total");
      }
      if (answer.advance_after > 0) assert.equal(digitsOf(got.totalAmount), answer.advance_after);
      // «✓ закрыт» for a period, «✓ закрыты» only when the row folds several
      for (const [index, row] of answer.money_rows.entries()) {
        if (row.state === "closed") assert.equal(plain(got.rows[index][2]), row.periods > 1 ? "✓ закрыты" : "✓ закрыт");
      }
      // a single closed period with no debt is one row and the total (no table frame of its own)
      if (state === "single_closed") assert.equal(got.rows.length, 1);
      // lessons mode: the number of lessons is a quiet line of its own
      if (state === "packages") assert.match(plain(await page.locator('[data-testid="payment-plan"]').innerText()), /Уроков оплачено: 0 → 12, осталось 0/);
      // the look: the sums of the rows and of the total end on ONE vertical line, no sum is broken into two lines, nothing leaves its box
      const geometry = await page.evaluate(() => {
        const box = (element) => element.getBoundingClientRect();
        const rights = [...document.querySelectorAll('[data-testid="payment-split-amount"]')].map((cell) => Math.round(box(cell).right));
        const edge = Math.round(box(document.querySelector('[data-testid="payment-split-total"]')).right);
        const marks = [...document.querySelectorAll('[data-testid="payment-split-mark"]')].map((cell) => Math.round(box(cell).right));
        const total = document.querySelector('[data-testid="payment-split-total-amount"]');
        const broken = [...document.querySelectorAll('[data-testid="payment-split-amount"], [data-testid="payment-split-mark"], [data-testid="payment-split-total-amount"]')].filter((element) => {
          const line = parseFloat(getComputedStyle(element).lineHeight) || 20;
          return box(element).height > line * 1.4;
        }).map((element) => element.textContent);
        const frame = box(document.querySelector('[data-testid="payment-calc"]'));
        const outside = [...document.querySelectorAll('[data-testid="payment-split"] *')].filter((element) => getComputedStyle(element).display !== "contents" && (box(element).right > frame.right + 0.5 || box(element).left < frame.left - 0.5)).map((element) => element.textContent);
        return { rights, marks, edge, total: total ? Math.round(box(total).right) : null, broken, outside };
      });
      assert.equal(new Set(geometry.rights).size, 1, `the sums of the rows are right-aligned on one line: ${geometry.rights}`);
      assert.ok(geometry.marks.length === 0 || geometry.marks.every((right) => Math.abs(right - geometry.edge) <= 1), `the marks end at the right edge of the block: ${geometry.marks} / ${geometry.edge}`);
      if (geometry.total !== null) assert.ok(Math.abs(geometry.total - geometry.edge) <= 1, "the total ends at the right edge too");
      assert.deepEqual(geometry.broken, [], "no sum or mark is broken into two lines");
      assert.deepEqual(geometry.outside, []);
      const probe = await page.evaluate(layoutProbe, '[data-testid="payment-calc"]');
      assert.deepEqual(probe.bad, []);
      assert.equal(probe.scroll, 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, "no sideways scroll");
      if (width === 375) assert.ok(await page.locator('[data-testid="payment-split-total-label"]').isVisible());
      await page.close();
    });
  }
}

test("А: the labels wrap, the sums do not - a long label of a period with two years on a phone", async () => {
  const long = { ...previewState("year_and_long_labels") };
  long.money_rows = [{ label: "Декабрь 2025 – февраль 2026, остаток по всем трём периодам", amount: 80000, of: null, state: "closed", periods: 1 }, long.money_rows[1]];
  const run = await openPage(ctx.browser, "money.entry.tsx", async (request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m1/payments/preview") {
      const { toshmatovPreview } = require("./helpers/stage-numbers.cjs");
      const base = toshmatovPreview(200000);
      const { amount, ...result } = long;
      return { json: { ...base, amount, result: { ...base.result, ...result } } };
    }
    return null;
  }, { width: 375, height: 812 });
  await run.page.evaluate(([u, membership]) => window.mount("till", u, { membership }), [undefined, TOSHMATOV]);
  await run.page.waitForTimeout(300);
  await run.page.fill("#payment-amount", "200000");
  await run.page.waitForSelector('[data-testid="payment-split"]');
  const labelLines = await run.page.locator('[data-testid="payment-split-label"]').first().evaluate((element) => Math.round(element.getBoundingClientRect().height / (parseFloat(getComputedStyle(element).lineHeight) || 20)));
  assert.ok(labelLines >= 2, `the label wraps (${labelLines} lines)`);
  const sums = await run.page.locator('[data-testid="payment-split-amount"]').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height < 30));
  assert.deepEqual(sums, [true, true]);
  assert.deepEqual((await run.page.evaluate(layoutProbe, '[data-testid="payment-calc"]')).bad, []);
  await run.page.close();
});

test("А: an older answer (no money_rows) - the window says the server's sentence as before, under «Что изменится»; the amount not typed - the hint", async () => {
  const { page } = await openWindow(null, 1280);
  await page.waitForSelector('[data-testid="payment-plan-sentence"]');
  assert.equal(plain(await page.locator('[data-testid="payment-plan-sentence"]').innerText()), "Погасит долг 400 000 сум");
  assert.equal(plain(await page.locator('[data-testid="payment-calc-title"]').innerText()), "Что изменится");
  assert.equal(await page.locator('[data-testid="payment-split"]').count(), 0);
  await page.fill("#payment-amount", "");
  await page.waitForSelector('[data-testid="payment-plan-hint"]');
  assert.equal(await page.locator('[data-testid="payment-split"]').count(), 0);
  await page.close();
});

test("А: the answer of the preview fails - the window says the failure in its place, no rows (the window is not broken)", async () => {
  const { page } = await openWindow("partial_one_period", 1280, { error: true });
  await page.waitForSelector('[data-testid="payment-calc"] [role="alert"]');
  assert.equal(await page.locator('[data-testid="payment-split"]').count(), 0);
  assert.equal(plain(await page.locator('[data-testid="payment-calc-title"]').innerText()), "Что изменится");
  await page.close();
});

test("А: while the new amount is being counted the rows of the old amount are not shown as its answer (grey bars instead)", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const server = paymentServer("owner_example_two_periods");
  const run = await openPage(ctx.browser, "money.entry.tsx", async (request) => {
    if (request.method === "GET" && request.path.endsWith("/payments/preview") && /amount=300000/.test(request.query)) await gate;
    return server(request);
  }, { width: 1280, height: 900 });
  await run.page.evaluate(([u, membership]) => window.mount("till", u, { membership }), [undefined, TOSHMATOV]);
  await run.page.waitForTimeout(300);
  await run.page.fill("#payment-amount", "550000");
  await run.page.waitForSelector('[data-testid="payment-split"]');
  await run.page.fill("#payment-amount", "300000");
  await run.page.waitForSelector('[data-testid="payment-plan-skeleton"]');
  assert.equal(await run.page.locator('[data-testid="payment-split"]').count(), 0);
  release();
  await run.page.close();
});

// ── Б: the pause closed by a leaving ────────────────────────────────────────────────────────────────────────────────

const day = (shift) => new Date(Date.now() + shift * 86400000).toISOString().slice(0, 10);
const LOCKED_TEXT = read("pause_locked_texts").refusal_text;
const pauseOf = (id, first, last, over = {}) => ({ id, membership_id: "m-a", first_day: first, last_day: last, days: 4, reason: "уехал к родственникам", created_by_name: null, created_at: null, voided_at: null, void_reason: null, days_locked: false, days_locked_text: null, ...over });
const lockedPause = (over = {}) => pauseOf("pl", day(-3), day(9), { days_locked: true, days_locked_text: LOCKED_TEXT, ...over });
const pauseServer = (pauses, handler) => F.baseServer((request) => {
  if (request.method === "GET" && request.path === "/auth/org/memberships/m-a/pauses") return { json: pauses };
  return handler ? handler(request) : null;
});

for (const width of [1280, 375]) {
  test(`Б (${width}) without a cut: the fields «С» and «По» are edited, the pause line has no calm sentence and no field of reason`, async () => {
    const run = await mount(ctx, pauseServer([pauseOf("pa", day(-3), day(9))]), "pause", OWNER, { moneyAvailable: true }, width);
    await run.page.waitForSelector('section[aria-label="Паузы ученика"]');
    for (const id of ["#pause-first", "#pause-last"]) assert.equal(await run.page.locator(id).isEditable(), true, id);
    assert.equal(await run.page.locator('[data-testid="pause-locked-text"]').count(), 0);
    assert.equal(await run.page.locator('[data-testid="pause-locked-reason"]').count(), 0);
    await run.page.getByRole("button", { name: "Закончить паузу" }).first().waitFor();
    assert.equal(await run.page.getByRole("button", { name: "Снять паузу" }).count(), 0);
    await run.page.close();
  });

  test(`Б (${width}) cut by a leaving: the days are text, ONE calm sentence of the server over them, «Закончить паузу» is gone, «Снять паузу» is there; saving is on only when the reason changed`, async () => {
    const run = await mount(ctx, pauseServer([lockedPause()]), "pause", OWNER, { moneyAvailable: true }, width);
    await run.page.waitForSelector('[data-testid="pause-locked-text"]');
    const text = run.page.locator('[data-testid="pause-locked-text"]');
    assert.equal(plain(await text.innerText()), LOCKED_TEXT);
    // the sentence stands over the days; the days are a line of text, there is no date field in the line (the form above makes a NEW pause)
    const days = run.page.locator('[data-testid="pause-locked-days"]');
    assert.ok((await text.boundingBox()).y < (await days.boundingBox()).y);
    assert.equal(await days.locator("input").count(), 0);
    assert.match(plain(await days.innerText()), /^с \d\d\.\d\d по \d\d\.\d\d · /);
    assert.ok(!plain(await days.innerText()).includes("уехал"), "the reason is in its field, not twice");
    // the calm sentence is not an alarm: no red, no amber frame
    assert.doesNotMatch(await text.getAttribute("class"), /rose|amber|border/);
    assert.equal(await run.page.getByRole("button", { name: "Закончить паузу" }).count(), 0, "the days cannot be changed - nothing offers to shorten");
    assert.equal(await run.page.getByRole("button", { name: "Снять паузу" }).count(), 1);
    const field = run.page.locator('[data-testid="pause-locked-reason"]');
    assert.equal(await field.inputValue(), "уехал к родственникам");
    assert.equal(await run.page.locator('[data-testid="pause-locked-save"]').isDisabled(), true, "the reason is not changed: nothing to save");
    await field.fill("уехал к родственникам в Самарканд");
    assert.equal(await run.page.locator('[data-testid="pause-locked-save"]').isDisabled(), false);
    await field.fill("уехал к родственникам");
    assert.equal(await run.page.locator('[data-testid="pause-locked-save"]').isDisabled(), true, "typed back as it was: nothing to save again");
    const probe = await run.page.evaluate(layoutProbe, 'section[aria-label="Паузы ученика"]');
    assert.deepEqual(probe.bad, []);
    assert.equal(probe.scroll, 0);
    await run.page.close();
  });
}

test("Б: the reason of a cut pause is saved - only the reason goes to the server (no days), the window stays open and the list shows the new one", async () => {
  let current = lockedPause();
  let patched = null;
  const answer = F.baseServer((request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m-a/pauses") return { json: [current] };
    if (request.method === "PATCH" && request.path === "/auth/org/pauses/pl") { patched = request.body; current = { ...current, reason: patched.reason }; return { json: { pause: current, impact: null, lessons: { excluded: [], attended: [] }, payroll: null, dry_run: false, row: null, other_groups_text: null } }; }
    return null;
  });
  const next = await mount(ctx, answer, "pause", OWNER, { moneyAvailable: true });
  const field = next.page.locator('[data-testid="pause-locked-reason"]');
  await field.waitFor();
  await field.fill("перевёлся в другой центр");
  await next.page.locator('[data-testid="pause-locked-save"]').click();
  await next.page.waitForFunction(() => document.querySelector('[data-testid="pause-locked-save"]')?.disabled === true && document.querySelector('[data-testid="pause-locked-reason"]').value === "перевёлся в другой центр");
  assert.deepEqual(patched, { reason: "перевёлся в другой центр" });
  assert.equal(await next.page.locator('[role="dialog"]').count(), 1, "the window stays");
  await next.page.close();
});

test("Б: the 409 PAUSE_CLOSED_BY_LEAVE to a save of the reason (a race) is said in the server's words on the spot, the window is not closed, the reason stays in the field", async () => {
  const answer = F.baseServer((request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m-a/pauses") return { json: [pauseOf("pr", day(-3), day(9))] };
    if (request.method === "PATCH" && request.path === "/auth/org/pauses/pr") return { status: 409, json: { detail: { code: "PAUSE_CLOSED_BY_LEAVE", message: LOCKED_TEXT } } };
    return null;
  });
  const run = await mount(ctx, answer, "pause", OWNER, { moneyAvailable: true });
  await run.page.waitForSelector('section[aria-label="Паузы ученика"]');
  // a pause that was not cut when the window opened: the race is the 409 to a «Закончить паузу»
  await run.page.getByRole("button", { name: "Закончить паузу" }).first().click();
  await run.page.waitForTimeout(300);
  await run.page.getByRole("button", { name: "Закончить паузу" }).last().click();
  await run.page.waitForSelector('[role="alert"]');
  assert.ok(plain(await run.page.locator('[role="alert"]').last().innerText()).includes(LOCKED_TEXT.replace(/\.$/, "")), "the sentence of the server (the product writes a refusal without the final dot)");
  assert.equal(await run.page.locator('[role="dialog"]').count(), 1);
  await run.page.close();
});

test("Б: the 409 to the save of the reason of a pause that became cut meanwhile - the sentence stands UNDER the pause, the field keeps what was typed", async () => {
  const answer = F.baseServer((request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m-a/pauses") return { json: [lockedPause()] };
    if (request.method === "PATCH" && request.path === "/auth/org/pauses/pl") return { status: 409, json: { detail: { code: "PAUSE_CLOSED_BY_LEAVE", message: "Пауза закрыта уходом ученика. Верните ученика в группу, затем измените паузу." } } };
    return null;
  });
  const run = await mount(ctx, answer, "pause", OWNER, { moneyAvailable: true });
  const field = run.page.locator('[data-testid="pause-locked-reason"]');
  await field.waitFor();
  await field.fill("новая причина");
  await run.page.locator('[data-testid="pause-locked-save"]').click();
  await run.page.waitForSelector('[data-testid="pause-locked-failure"]');
  assert.equal(plain(await run.page.locator('[data-testid="pause-locked-failure"]').innerText()), "Пауза закрыта уходом ученика. Верните ученика в группу, затем измените паузу");
  assert.equal(await field.inputValue(), "новая причина");
  assert.equal(await run.page.locator('[role="dialog"]').count(), 1);
  await run.page.close();
});

test("Б: «Снять паузу» of a cut pause - a reason is required, the void goes to the server, the pause leaves the list; the days were never sent", async () => {
  let current = [lockedPause()];
  const calls = [];
  const answer = F.baseServer((request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m-a/pauses") return { json: current };
    if (request.method === "POST" && request.path === "/auth/org/pauses/pl/void") {
      calls.push({ dry: /dry_run=true/.test(request.query), body: request.body });
      if (!/dry_run=true/.test(request.query)) current = [];
      return { json: { pause: lockedPause({ voided_at: "2026-11-24T10:00:00" }), impact: null, row: null, dry_run: /dry_run=true/.test(request.query), other_groups_text: null } };
    }
    return null;
  });
  const run = await mount(ctx, answer, "pause", OWNER, { moneyAvailable: true });
  await run.page.getByRole("button", { name: "Снять паузу" }).waitFor();
  await run.page.getByRole("button", { name: "Снять паузу" }).click();
  await run.page.waitForSelector("#pause-act-reason");
  assert.match(plain(await run.page.locator('section[aria-label="Паузы ученика"]').innerText()), /Пауза будет снята целиком/);
  await run.page.fill("#pause-act-reason", "ученик ушёл насовсем");
  await run.page.getByRole("button", { name: "Снять паузу" }).last().click();
  await run.page.waitForFunction(() => !document.querySelector('section[aria-label="Паузы ученика"]'));
  assert.equal(calls.at(-1).dry, false);
  assert.equal(calls.at(-1).body.reason, "ученик ушёл насовсем");
  await run.page.close();
});
