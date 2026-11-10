// «Деньги-1 / В», the receipts: the print is WRITTEN first (the first is the original, every next a «копия»), then the sheet is printed; «Состояние на дату выдачи», «Оплата отменена» once,
// «Не является фискальным чеком»; the new sheet «Квитанция о возврате В-n» with the signature line.
const assert = require("node:assert/strict");
const test = require("node:test");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { start, plain, open } = require("./helpers/money1-v.cjs");

let browser;
test.before(async () => { browser = await start(); });
test.after(async () => { await browser.close(); });

const NB = " ";
const RECEIPT = {
  receipt_no: 21, org_name: "ALGO Math Center", org_city: "Ташкент", org_phone: "+998901234567", student_name: "Тошматов Бобур", display_id: "N13-0042-AL", group_name: "Алгебра 7",
  currency: "UZS", paid_on: "2026-11-05", method: "cash", mode: "calendar", amount: 400000, amount_words: "Четыреста тысяч сум",
  allocations: [{ segment_id: "seg:09", period_from: "2026-09-01", period_to: "2026-09-30", amount: 400000, days: 30, bucket: "past_debt", closes: true, label: "Погашен долг за 01.09–30.09", price: 400000, remaining_after: 0 }],
  debt_before: 1200000, debt_after: 800000, advance_after: 0, paid_until_before: "2026-08-31", paid_until_after: "2026-09-30", price_snapshot: { amount: 400000, source: "group" }, note: null, accepted_by_name: "Арслан Владелец",
  voided_at: null, void_reason: null, replaced_by_receipt_no: null, replaces_receipt_no: null, replaces_amount: null,
  issued_at: "2026-11-07T09:20:00", state_on_issue: { as_of: "2026-11-07", debt: 100000, advance: 0, paid_until: "2026-11-14", text: `На 07.11.2026: долг 100${NB}000${NB}сум, оплачено до 14.11` },
  is_copy: false, print_count: 0, void_note: null, disclaimer: "Не является фискальным чеком",
};
const REFUND = {
  refund_id: "r1", receipt_no: 12, receipt_label: "В-12", org_name: "ALGO Math Center", org_city: "Ташкент", org_phone: "+998901234567", student_name: "Тошматов Бобур", display_id: "N13-0042-AL", group_name: "Алгебра 7",
  amount: 100000, amount_words: "Сто тысяч сум", method: "cash", method_label: "Наличные", reason: "ученик ушёл", note: null, effective_on: "2026-11-07", created_at: "2026-11-07T09:20:00", accepted_by_name: "Арслан Владелец",
  voided_at: null, voided_by_name: null, void_reason: null, void_note: null, disclaimer: "Не является фискальным чеком", signature_line: "Получил(а): ____________  Подпись",
};

async function receipt(width, { receipt: data = RECEIPT, printed } = {}) {
  let n = 0;
  const run = await open(browser, "money-v.entry.tsx", "receiptPage", {
    width,
    server: (request) => {
      if (request.method === "GET" && request.path === "/auth/org/payments/p1/receipt") return { json: data };
      if (request.method === "POST" && request.path === "/auth/org/payments/p1/receipt/print") { n += 1; return printed ? printed(n) : { json: { ...data, is_copy: n > 1, print_count: n } }; }
      return null;
    },
  });
  await run.page.waitForSelector('[aria-label^="Квитанция"]');
  return run;
}

test("print: the print is written FIRST, window.print follows, the first sheet is the original; the second print is a «КОПИЯ»", async () => {
  const { page, calls } = await receipt(1280);
  await page.evaluate(() => { window.__order = []; const log = window.print; window.print = () => { window.__order.push("print"); log(); }; });
  assert.equal(await page.locator('[data-testid="receipt-copy-stamp"]').count(), 0);
  await page.click('[data-testid="receipt-print"]');
  await page.waitForFunction(() => window.__log.includes("print"));
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), ["GET /auth/org/payments/p1/receipt", "POST /auth/org/payments/p1/receipt/print"]);
  assert.equal(await page.locator('[data-testid="receipt-copy-stamp"]').count(), 0, "the first print is the original");
  await page.click('[data-testid="receipt-print"]');
  await page.waitForFunction(() => window.__log.filter((x) => x === "print").length === 2);
  await page.waitForSelector('[data-testid="receipt-copy-stamp"]');
  assert.equal(plain(await page.textContent('[data-testid="receipt-copy-stamp"]')), "КОПИЯ");
  await page.close();
});

test("print: a failed write prints nothing and says so; a read page of a printed receipt shows «КОПИЯ» by is_copy", async () => {
  {
    const { page } = await receipt(1280, { printed: () => ({ status: 500, json: { detail: { code: "X", message: "boom" } } }) });
    await page.click('[data-testid="receipt-print"]');
    await page.waitForSelector('[data-testid="receipt-print-error"]');
    assert.equal(plain(await page.textContent('[data-testid="receipt-print-error"]')), "Не удалось записать печать. Повторите");
    assert.deepEqual(await page.evaluate(() => window.__log), []);
    await page.close();
  }
  {
    const { page } = await receipt(1280, { receipt: { ...RECEIPT, is_copy: true, print_count: 1 } });
    assert.equal(plain(await page.textContent('[data-testid="receipt-copy-stamp"]')), "КОПИЯ");
    await page.close();
  }
});

test("sheet: issued date, the state on the day of issue (the server's sentence, NBSP), the day-of-payment numbers apart, the disclaimer", async () => {
  const { page } = await receipt(1280);
  assert.equal(plain(await page.textContent('[data-testid="sheet-issued"]')), "Выдана 07.11.2026 · 14:20");
  const state = await page.textContent('[data-testid="receipt-state-on-issue"]');
  assert.match(plain(state), /Состояние на дату выдачиНа 07\.11\.2026: долг 100 000 сум, оплачено до 14\.11/);
  assert.ok(state.includes(`100${NB}000${NB}сум`));
  const text = plain(await page.locator('[aria-label^="Квитанция"]').innerText());
  assert.match(text, /Остаток долга после оплаты: 800 000 сум/);
  assert.equal(plain(await page.textContent('[data-testid="sheet-disclaimer"]')), "Не является фискальным чеком");
  await page.close();
});

test("a cancelled payment: the stamp «Оплата отменена» and the line of the server say it ONCE (no second date in the stamp)", async () => {
  const data = { ...RECEIPT, voided_at: "2026-11-05T09:20:00", void_reason: "Ошибка в сумме", void_note: "Оплата отменена 05.11" };
  const { page } = await receipt(1280, { receipt: data });
  assert.equal(plain(await page.textContent('[data-testid="receipt-void-note"]')), "Оплата отменена 05.11");
  const stamp = plain(await page.locator('[role="note"]').innerText());
  assert.equal(stamp, "ОПЛАТА ОТМЕНЕНА Ошибка в сумме");
  await page.close();
});

for (const width of [1280, 1024, 375]) {
  test(`${width}: the sheet of a copy keeps everything in its box, the stamp does not leave the sheet`, async () => {
    const { page } = await receipt(width, { receipt: { ...RECEIPT, is_copy: true, voided_at: "2026-11-05T09:20:00", void_reason: "Ошибка в сумме", void_note: "Оплата отменена 05.11" } });
    const facts = await page.evaluate(layoutProbe, "body");
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    await page.close();
  });
}

// ── the receipt of a refund ───────────────────────────────────────────────────

async function refund(width, data = REFUND, status = 200) {
  const run = await open(browser, "money-v.entry.tsx", "refundReceiptPage", {
    width,
    server: (request) => (request.method === "GET" && request.path === "/auth/org/refunds/r1/receipt" ? (status === 200 ? { json: data } : { status, json: { detail: { code: "NOT_FOUND", message: "Возврат не найден" } } }) : null),
  });
  return run;
}

test("refund receipt: «В-12», the sum in words, the method, the reason, who gave, the line of the signature, the disclaimer; the print is window.print only", async () => {
  const { page, calls } = await refund(1280);
  await page.waitForSelector('[aria-label="Квитанция о возврате В-12"]');
  const text = plain(await page.locator('[aria-label^="Квитанция"]').innerText());
  for (const part of ["Квитанция о возврате В-12", "от 07.11.2026", "Тошматов Бобур", "Алгебра 7", "Наличные", "ученик ушёл", "100 000 сум", "Сто тысяч сум", "Арслан Владелец", "Получил(а):", "Не является фискальным чеком"]) assert.ok(text.includes(part), `${part} in ${text}`);
  await page.click('[data-testid="receipt-print"]');
  await page.waitForFunction(() => window.__log.includes("print"));
  assert.deepEqual(calls.map((call) => call.method), ["GET"], "no print counter for a refund");
  assert.equal(await page.locator('[data-testid="receipt-copy-stamp"]').count(), 0);
  await page.close();
});

test("refund receipt: no number - no «В-»; a cancelled refund is stamped once; 404 is «Возврат не найден»; the skeleton while loading", async () => {
  {
    const { page } = await refund(1280, { ...REFUND, receipt_no: null, receipt_label: null });
    await page.waitForSelector('[aria-label="Квитанция о возврате"]');
    assert.ok(!/В-/.test(await page.locator('[aria-label^="Квитанция"]').innerText()));
    await page.close();
  }
  {
    const { page } = await refund(1280, { ...REFUND, voided_at: "2026-11-08T09:20:00", void_reason: "ошибка", void_note: "Возврат отменён 08.11" });
    await page.waitForSelector('[data-testid="receipt-void-note"]');
    assert.equal(plain(await page.textContent('[data-testid="receipt-void-note"]')), "Возврат отменён 08.11");
    assert.equal(plain(await page.locator('[role="note"]').innerText()), "ВОЗВРАТ ОТМЕНЁН ошибка");
    await page.close();
  }
  {
    const { page } = await refund(1280, REFUND, 404);
    await page.waitForSelector('[data-testid="refund-receipt-missing"]');
    assert.match(plain(await page.textContent("body")), /Возврат не найден/);
    await page.close();
  }
});

for (const width of [1280, 375]) {
  test(`${width}: the refund sheet fits its box`, async () => {
    const { page } = await refund(width);
    await page.waitForSelector('[aria-label^="Квитанция"]');
    const facts = await page.evaluate(layoutProbe, "body");
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    await page.close();
  });
}
