// PAY-TAILS Б11.33 + Б11.34, screens part 13, in a real browser (headless Chromium, the CSS of the project).
//   А. The window «Внести оплату», block «Куда пойдут деньги» (п.2, Б11.34): a row per period, the total under a line; the rows, the words and the sums are the server's (fixtures «по договору Б11.34»: the header of the window and the rows come from one world).
//      Lesson 174 in every state: the sum of the rows on the screen IS the typed amount; the total IS the number of the answer (and the pieces of the quiet line add up to it).
//   Б. The window of a pause (the pause closed by a leaving and the rest) moved to tests/dom-paytails-part16.test.cjs (Б11.39 / Б11.40: the structure of the window changed, the reason of a closed pause is no longer edited here).
// PNGs: node tests/dom/paytails-part13-shots.cjs <dir>.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, F, OWNER } = require("./helpers/money2-w2.cjs");
const { openPage } = require("./helpers/dom-page.cjs");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { STATES, previewState, paymentServer, readReal, TOSHMATOV, money } = require("./helpers/paytails-part13.cjs");

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
    title: await text("payment-calc-title"), rows, totalLabel: await text("payment-split-total-label"), totalAmount: await text("payment-split-total-amount"), rest: await text("payment-split-rest"), alsoDue: await text("payment-split-also-due"),
  };
}

// what each state must say - written by hand from the contract (Б11.34), not from the code
const TITLE = "Куда пойдут деньги";
const EXPECTED = {
  // real answers of the server (part14/)
  owner_example_two_periods: {
    rows: [["Сентябрь, остаток", "42 000", "✓ оплачен"], ["Октябрь", "508 000", "из 550 000"]],
    totalLabel: "Останется долг", totalAmount: "1 142 000 сум", alsoDue: null, rest: "Октябрь 42 000 · Ноябрь 550 000 · Декабрь 550 000",
  },
  four_periods_fold_advance: {
    rows: [["Сентябрь, остаток", "42 000", "✓ оплачен"], ["Октябрь – декабрь", "1 650 000", "✓ оплачены"], ["Аванс на январь 2027", "108 000", null]],
    totalLabel: "Всё оплачено", totalAmount: null, alsoDue: null, rest: null,
  },
  // PAY-TAILS Б11.37: two closed months that do not touch - two rows as the server sent them, not folded
  closed_months_gap: { rows: [["Октябрь", "550 000", "✓ оплачен"], ["Декабрь", "550 000", "✓ оплачен"]], totalLabel: "Всё оплачено", totalAmount: null, alsoDue: null, rest: null },
  within_term_part_due: { rows: [["Декабрь", "231 000", "из 550 000"]], totalLabel: "Останется к оплате", totalAmount: "319 000 сум", alsoDue: null, rest: null },
  debt_and_due: {
    rows: [["Сентябрь, остаток", "42 000", "✓ оплачен"], ["Октябрь", "508 000", "из 550 000"]],
    totalLabel: "Останется долг", totalAmount: "592 000 сум", alsoDue: "и к оплате ещё 550 000 сум", rest: "Октябрь 42 000 · Ноябрь 550 000",
  },
  packages: { rows: [["Пакет № 1", "300 000", "из 400 000"]], totalLabel: "Останется долг", totalAmount: "50 000 сум", alsoDue: "и к оплате ещё 100 000 сум", rest: null },
  packages_advance: {
    rows: [["Пакеты № 1–2", "450 000", "✓ оплачены"], ["Аванс: уроки следующего пакета", "250 000", null]], totalLabel: "Всё оплачено", totalAmount: null, alsoDue: null, rest: null,
  },
  personal_periods_dates: {
    rows: [["15.10–14.11, остаток", "320 000", "✓ оплачен"], ["15.11–14.12", "180 000", "из 420 000"]], totalLabel: "Останется долг", totalAmount: "240 000 сум", alsoDue: null, rest: null,
  },
  personal_month_dates: { rows: [["01.11–30.11", "200 000", "из 420 000"]], totalLabel: "Останется долг", totalAmount: "220 000 сум", alsoDue: null, rest: null },
  year_and_long_labels: {
    rows: [["Декабрь 2026", "550 000", "✓ оплачен"], ["Январь", "450 000", "из 550 000"]], totalLabel: "Останется долг", totalAmount: "650 000 сум", alsoDue: null, rest: "Январь 100 000 · Февраль 550 000",
  },
  // written by hand from the contract (the worlds of the server do not have them)
  partial_one_period: { rows: [["Октябрь", "200 000", "из 550 000"]], totalLabel: "Останется долг", totalAmount: "900 000 сум", alsoDue: null, rest: "Октябрь 350 000 · Ноябрь 550 000" },
  single_closed: { rows: [["Октябрь", "550 000", "✓ оплачен"]], totalLabel: "Всё оплачено", totalAmount: null, alsoDue: null, rest: null },
  all_paid: { rows: [["Октябрь – ноябрь", "1 100 000", "✓ оплачены"]], totalLabel: "Всё оплачено", totalAmount: null, alsoDue: null, rest: null },
  packages_two_left: { rows: [["Пакет № 3", "150 000", "из 400 000"]], totalLabel: "Останется долг", totalAmount: "650 000 сум", alsoDue: null, rest: "Пакет № 3 — 250 000 · Пакет № 4 — 400 000" },
};

for (const width of [1280, 375]) {
  for (const state of STATES) {
    test(`А (${width}) «${state}»: rows, marks, total and the quiet lines are the server's; the header of the window and the block close (174); sums on one vertical, never broken`, async () => {
      const { page, amount } = await openWindow(state, width);
      await page.waitForSelector('[data-testid="payment-split"]');
      const answer = previewState(state);
      const got = await read13(page);
      const want = EXPECTED[state];
      assert.equal(got.title, TITLE, "the heading says no sum: the sum is in the field and on the button");
      assert.deepEqual(got.rows.map(([label, sum, mark]) => [plain(label), plain(sum), mark === null ? null : plain(mark)]), want.rows);
      assert.equal(got.totalLabel, want.totalLabel);
      assert.equal(got.totalAmount, want.totalAmount);
      assert.equal(got.alsoDue, want.alsoDue);
      assert.equal(got.rest, want.rest);
      // the sentence of the old answer is not shown, the block is one h3
      assert.equal(await page.locator('[data-testid="payment-plan-sentence"]').count(), 0);
      assert.equal(await page.locator('[data-testid="payment-calc"] h3').count(), 1);
      // the sum stands in the field above and on the button
      assert.equal(digitsOf(await page.inputValue("#payment-amount")), amount);
      assert.match(plain(await page.locator("button", { hasText: "Внести" }).last().innerText()), new RegExp(`Внести ${plain(money(amount)).replace(/\s/g, "\\s")}`));
      // one word, one meaning: the block never says «закрыт» (a period is «оплачен», the total is «Всё оплачено»)
      assert.doesNotMatch(plain(await page.locator('[data-testid="payment-split"]').innerText()), /закрыт/i);
      // lesson 174: every number of the block is found on the screen as a sum of the numbers next to it
      const rowsSum = got.rows.reduce((total, row) => total + digitsOf(row[1]), 0);
      assert.equal(rowsSum, amount, "the rows add up to the typed amount");
      const advanceRow = got.rows.filter((row) => row[2] === null).reduce((total, row) => total + digitsOf(row[1]), 0);
      const chipSum = async (key) => ((await page.locator(`[data-testid="payment-due-${key}"]`).count()) ? digitsOf(/(\d[\d\s\u00a0]*)сум/.exec(await page.locator(`[data-testid="payment-due-${key}"] >> .tabular-nums`).first().innerText())[1]) : 0);
      const headDebt = await chipSum("debt");
      const headDue = await chipSum("due");
      const leftDebt = got.totalLabel === "Останется долг" ? digitsOf(got.totalAmount) : 0;
      const leftDue = got.totalLabel === "Останется к оплате" ? digitsOf(got.totalAmount) : got.alsoDue ? digitsOf(got.alsoDue) : 0;
      assert.equal(headDebt + headDue, rowsSum - advanceRow + leftDebt + leftDue, `the header (${headDebt} + ${headDue}) = what the rows pay + what stays (${leftDebt} + ${leftDue})`);
      assert.equal(headDebt, answer.header.debt, "the header says the debt of the answer");
      assert.equal(headDue, answer.header.due, "the header says the sum to pay of the answer");
      assert.equal(leftDebt, answer.debt_amount_after, "the total is the debt of the answer");
      assert.equal(leftDue, answer.due_after, "the total (or its quiet line) is the sum to pay of the answer");
      // the quiet breakdown of the debt: only when the rest lies in two or more periods, and it adds up to the total
      assert.equal(got.rest !== null, answer.debt_rest.length >= 2, "the breakdown stands only for two periods and more");
      if (got.rest !== null) {
        const pieces = await page.locator('[data-testid="payment-split-rest"] > span > span').allTextContents();
        assert.equal(pieces.length, answer.debt_rest.length);
        assert.equal(pieces.reduce((total, piece) => total + digitsOf(/\d+(?:\u00a0\d{3})*$/.exec(piece)[0]), 0), answer.debt_amount_after, "the quiet line adds up to the total");
      }
      // the advance is a row of its own and is NOT said again in the total
      if (answer.advance_after > 0) {
        assert.equal(advanceRow, answer.advance_after);
        assert.doesNotMatch(plain(await page.locator('[data-testid="payment-split-total"]').innerText()), /аванс/i);
      }
      // «✓ оплачен» for a period, «✓ оплачены» only when the row folds several
      for (const [index, row] of answer.money_rows.entries()) {
        if (row.state === "closed") assert.equal(plain(got.rows[index][2]), row.periods > 1 ? "✓ оплачены" : "✓ оплачен");
      }
      // a single paid period with nothing left is one row and the total (no table frame of its own)
      if (state === "single_closed") assert.equal(got.rows.length, 1);
      // lessons mode: the number of lessons is a quiet line of its own, the numbers of the server, no «0 → 12»
      if (answer.lessons) {
        const text = plain(await page.locator('[data-testid="payment-plan"]').innerText());
        assert.ok(text.includes(`Оплачено уроков: ${answer.lessons.covered_after} · не оплачено: ${answer.lessons.unpaid_after}`), text);
        assert.doesNotMatch(text, /→|осталось/);
      }
      // the look: the sums of the rows (the advance row among them) end on ONE vertical, the marks stand in a column of their own, no sum is broken into two lines, nothing leaves its box
      const geometry = await page.evaluate(() => {
        const box = (element) => element.getBoundingClientRect();
        const rights = [...document.querySelectorAll('[data-testid="payment-split-amount"]')].map((cell) => Math.round(box(cell).right));
        const edge = Math.round(box(document.querySelector('[data-testid="payment-split-total"]')).right);
        const marks = [...document.querySelectorAll('[data-testid="payment-split-mark"]')];
        const total = document.querySelector('[data-testid="payment-split-total-amount"]');
        const broken = [...document.querySelectorAll('[data-testid="payment-split-amount"], [data-testid="payment-split-mark"], [data-testid="payment-split-total-amount"]')].filter((element) => {
          const line = parseFloat(getComputedStyle(element).lineHeight) || 20;
          return box(element).height > line * 1.4;
        }).map((element) => element.textContent);
        const frame = box(document.querySelector('[data-testid="payment-calc"]'));
        const outside = [...document.querySelectorAll('[data-testid="payment-split"] *')].filter((element) => !["contents", "none"].includes(getComputedStyle(element).display) && (box(element).right > frame.right + 0.5 || box(element).left < frame.left - 0.5)).map((element) => element.textContent);
        const firstAmount = document.querySelector('[data-testid="payment-split-amount"]');
        const pairs = [...document.querySelectorAll('[data-testid="payment-split-row"]')].map((item) => { const mark = item.querySelector('[data-testid="payment-split-mark"]'); const sum = item.querySelector('[data-testid="payment-split-amount"]'); return mark ? { markRight: Math.round(box(mark).right), sumRight: Math.round(box(sum).right), markTop: box(mark).top, sumBottom: box(sum).bottom } : null; }).filter(Boolean);
        return { pairs, rights, marksRight: marks.map((cell) => Math.round(box(cell).right)), marksLeft: marks.map((cell) => Math.round(box(cell).left)), edge, total: total ? Math.round(box(total).right) : null, broken, outside, firstAmountRight: Math.round(box(firstAmount).right) };
      });
      assert.equal(new Set(geometry.rights).size, 1, `the sums of the rows (the advance row too) are right-aligned on one line: ${geometry.rights}`);
      assert.equal(geometry.rights.length, got.rows.length);
      assert.ok(geometry.marksRight.every((right) => Math.abs(right - geometry.edge) <= 1), `the marks end at the right edge of the block: ${geometry.marksRight} / ${geometry.edge}`);
      if (width >= 640) {
        assert.equal(new Set(geometry.marksLeft).size <= 1, true, `the marks stand in one column: ${geometry.marksLeft}`);
        assert.ok(geometry.marksLeft.every((left) => left >= geometry.firstAmountRight - 1), "the marks stand after the sums");
      } else {
        // Б11.38 п.1: on a phone two columns - the quiet mark is the second line UNDER the sum of its own row, on the right
        for (const pair of geometry.pairs) {
          assert.ok(Math.abs(pair.markRight - pair.sumRight) <= 1, `the mark ends where its sum ends: ${JSON.stringify(pair)}`);
          assert.ok(pair.markTop >= pair.sumBottom - 1, `the mark stands under its sum: ${JSON.stringify(pair)}`);
        }
      }
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

test("А (Б11.38 п.1): on a phone (375) a label of up to 20 signs stays on ONE line beside a sum of seven digits; the sum and the mark are one line each", async () => {
  const { page } = await openWindow("four_periods_fold_advance", 375);
  await page.waitForSelector('[data-testid="payment-split"]');
  const rows = await page.locator('[data-testid="payment-split-row"]').evaluateAll((items) => items.map((item) => {
    const lines = (element) => (element ? Math.round(element.getBoundingClientRect().height / (parseFloat(getComputedStyle(element).lineHeight) || 20) * 10) / 10 : null);
    const label = item.querySelector('[data-testid="payment-split-label"]');
    return { text: label.textContent, labelLines: lines(label), sumLines: lines(item.querySelector('[data-testid="payment-split-amount"]')), markLines: lines(item.querySelector('[data-testid="payment-split-mark"]')), sum: item.querySelector('[data-testid="payment-split-amount"]').textContent };
  }));
  console.log("Б11.38 п.1 measure 375:", JSON.stringify(rows));
  assert.ok(rows.some((row) => row.sum.replace(/\D/g, "").length >= 7), "a sum of seven digits is among the rows");
  for (const row of rows) {
    if ([...row.text].length <= 20) assert.equal(row.labelLines, 1, `a label of up to 20 signs is one line: ${JSON.stringify(row)}`);
    assert.equal(row.sumLines, 1, JSON.stringify(row));
    if (row.markLines !== null) assert.equal(row.markLines, 1, JSON.stringify(row));
  }
  await page.close();
});

test("А: the labels wrap, the sums do not - a long label of a period with two years on a phone", async () => {
  const { previewFor } = require("./helpers/paytails-part13.cjs");
  const run = await openPage(ctx.browser, "money.entry.tsx", async (request) => {
    if (request.method === "GET" && request.path === "/auth/org/memberships/m1/payments/preview") {
      const answer = previewFor("year_and_long_labels", /amount=\d+/.test(request.query));
      if (answer.result) answer.result = { ...answer.result, money_rows: [{ ...answer.result.money_rows[0], label: "Декабрь 2025 – февраль 2026, остаток по всем трём периодам" }, answer.result.money_rows[1]] };
      return { json: answer };
    }
    return null;
  }, { width: 375, height: 812 });
  await run.page.evaluate(([u, membership]) => window.mount("till", u, { membership }), [undefined, TOSHMATOV]);
  await run.page.waitForTimeout(300);
  await run.page.fill("#payment-amount", String(previewState("year_and_long_labels").amount));
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
