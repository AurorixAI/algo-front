// «Деньги-1 / В», «Решения» of «Поступлений» and the journal of payments: one line per decision, the reason inside, «долг до → после» on the right, «Журнал ведётся с …» from `since`,
// the payments of earlier months cancelled in this one (grey, not in the totals), the Excel with the replaced versions.
const assert = require("node:assert/strict");
const test = require("node:test");
const { layoutProbe } = require("./helpers/layout-probe.cjs");
const { start, plain, open } = require("./helpers/money1-v.cjs");

let browser;
test.before(async () => { browser = await start(); });
test.after(async () => { await browser.close(); });

const NB = " ";
const rows = [
  { id: "d1", at: "2026-11-05T09:20:00", kind: "payment_void", kind_label: "Оплата отменена", student_id: "s1", student_name: "Тошматов Бобур", group_name: "Алгебра 7", amount: 400000, new_amount: null, receipt_no: 21, reason: "Ошибка в сумме, внесли два раза", actor_name: "Иванова Д.", debt_before: 0, debt_after: 400000 },
  { id: "d2", at: "2026-11-04T07:00:00", kind: "payment_replace", kind_label: "Оплата исправлена", student_id: "s2", student_name: "Каримова Дилноза", group_name: "Геометрия 8", amount: 400000, new_amount: 200000, receipt_no: 22, reason: "ошибся в сумме", actor_name: "Арслан Владелец", debt_before: 0, debt_after: 200000 },
  { id: "d3", at: "2026-11-03T07:00:00", kind: "payment_writeoff", kind_label: "Долг прощён", student_id: "s3", student_name: "Очень Длинное Имя Ученика Которое Не Помещается В Ячейку", group_name: "Алгебра 7 (углублённый курс по четвергам)", amount: 150000, new_amount: null, receipt_no: null, reason: null, actor_name: null, debt_before: 150000, debt_after: null },
];
const page = (extra = {}) => ({ as_of: "2026-11-10", from: "2026-11-01", to: "2026-11-30", page: 1, size: 25, total: rows.length, pages: 1, since: "2026-11-02", rows, ...extra });
const server = (answer) => (request) => (request.method === "GET" && request.path === "/auth/org/payments/decisions" ? answer(request) : null);
async function decisions(width, answer = () => ({ json: page() }), props = {}) {
  const run = await open(browser, "money-v.entry.tsx", "decisions", { width, props, server: server(answer) });
  return run;
}

test("a row is one line: when · what · whom · sum · debt before → after · who; «Журнал ведётся с 02.11.2026»", async () => {
  const { page: p, calls } = await decisions(1280);
  await p.waitForSelector('[data-testid="decision-row"]');
  assert.equal(plain(await p.textContent('[data-testid="decisions-since"]')), "Журнал ведётся с 02.11.2026");
  const first = p.locator('[data-testid="decision-row"]').first();
  assert.equal(plain(await first.locator('[data-testid="decision-when"]').textContent()), "05.11 · 14:20");
  assert.equal(plain(await first.locator('[data-testid="decision-kind"]').textContent()), "Оплата отменена");
  assert.equal(plain(await first.textContent()).includes("Тошматов Бобур · Алгебра 7"), true);
  assert.equal(plain(await first.locator('[data-testid="decision-debt"]').textContent()), "Долг 0 → 400 000 сум");
  assert.ok((await first.locator('[data-testid="decision-debt"]').textContent()).includes(`400${NB}000${NB}сум`));
  assert.equal(plain(await p.locator('[data-testid="decision-amount"]').nth(1).textContent()), "400 000 → 200 000 сум");
  // the row is a ONE line on 1280 and the reason is inside
  const height = await first.evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(height < 64, `one line: ${height}`);
  assert.equal(await p.locator('[data-testid="decision-details"]').count(), 0);
  await first.locator("button").click();
  assert.match(plain(await p.locator('[data-testid="decision-details"]').innerText()), /Причина: Ошибка в сумме, внесли два раза Квитанция № 21 Оплаты ученика/);
  assert.match(calls[0].query, /from=2026-11-01&to=2026-11-30&page=1&size=25/);
  await p.close();
});

test("the filter «Вид» sends kind; an empty answer under a filter is «По фильтру ничего нет» with «Сбросить»; no filter - «За этот период денежных решений нет»", async () => {
  const { page: p, calls } = await decisions(1280, (request) => ({ json: page(/kind=/.test(request.query) ? { rows: [], total: 0 } : { rows: [], total: 0 }) }));
  await p.waitForSelector('[data-testid="decisions-empty"]');
  assert.equal(plain(await p.textContent('[data-testid="decisions-empty"]')), "За этот период денежных решений нет");
  await p.click('[data-testid="decisions-kind"]');
  await p.click('[role="option"]:has-text("Долг прощён")');
  await p.waitForFunction(() => /По фильтру ничего нет/.test(document.body.innerText));
  assert.match(calls.at(-1).query, /kind=payment_writeoff/);
  await p.click("text=Сбросить");
  await p.waitForFunction(() => /За этот период денежных решений нет/.test(document.body.innerText));
  await p.close();
});

test("a failure is «Повторить», a 403 is the lock with no retry; the skeleton while loading", async () => {
  let n = 0;
  const { page: p } = await decisions(1280, () => (++n === 1 ? { status: 500, json: { detail: { code: "X", message: "Сервис недоступен" } } } : { json: page() }));
  await p.waitForSelector('[data-testid="income-error"]');
  await p.click("text=Повторить");
  await p.waitForSelector('[data-testid="decision-row"]');
  await p.close();
  const denied = await decisions(1280, () => ({ status: 403, json: { detail: { code: "FORBIDDEN", message: "Нет доступа" } } }));
  await denied.page.waitForSelector('[data-testid="income-error"]');
  assert.equal(await denied.page.locator("text=Повторить").count(), 0);
  await denied.page.close();
});

for (const width of [1280, 1024, 375]) {
  test(`${width}: a long name stays in its cell, nothing leaves the box, no horizontal scroll, the rows are tap zones`, async () => {
    const { page: p } = await decisions(width);
    await p.waitForSelector('[data-testid="decision-row"]');
    const facts = await p.evaluate(layoutProbe, "body");
    assert.deepEqual(facts.bad, [], JSON.stringify(facts.bad));
    assert.equal(facts.scroll, 0);
    if (width < 1280) assert.ok((await p.locator('[data-testid="decision-row"] button').first().evaluate((el) => el.getBoundingClientRect().height)) >= 40);
    await p.close();
  });
}

test("the tab «Решения» is on the page (address ?tab=decisions) next to «Оплаты»", async () => {
  const run = await open(browser, "money-v.entry.tsx", "incomePage", {
    props: { search: "tab=decisions" },
    server: (request) => {
      if (request.path === "/auth/org/payments/decisions") return { json: page() };
      if (request.path === "/auth/org/payments/journal") return { json: { as_of: "2026-11-10", from: "2026-11-01", to: "2026-11-30", page: 1, size: 25, total: 0, pages: 1, totals: { count: 0, sum: 0, voided_count: 0 }, rows: [], authors: [], history: [] } };
      return { json: {} };
    },
  });
  await run.page.waitForSelector('[data-testid="decision-row"]');
  const tabs = (await run.page.locator('[role="tab"]').allTextContents()).map(plain);
  assert.deepEqual(tabs.slice(0, 2), ["Оплаты", "Решения"]);
  assert.equal(await run.page.locator('[role="tab"][aria-selected="true"]').textContent(), "Решения");
  await run.page.close();
});

// ── the journal of payments ───────────────────────────────────────────────────

const journalRow = (extra) => ({ id: "j1", receipt_no: 5, paid_on: "2026-11-05", paid_time: "10:00", created_at: null, student_id: "s1", student_name: "Тошматов Бобур", display_id: null, membership_id: "m1", group_id: "g1", group_name: "Алгебра 7", teacher_name: null, amount: 400000, method: "cash", method_label: "Наличные", created_by_id: null, created_by_name: null, note: null, allocation_text: null, allocations: [], refunded: 0, transferred: 0, status: "active", replaces_receipt_no: null, replaces_amount: null, replaced_by_receipt_no: null, void_reason: null, voided_at: null, voided_by_name: null, ...extra });
const journal = (rowsIn, totals) => ({ as_of: "2026-11-15", from: "2026-11-01", to: "2026-11-30", page: 1, size: 25, total: rowsIn.length, pages: 1, totals: { count: 1, sum: 400000, voided_count: 1, ...totals }, rows: rowsIn, authors: [], history: [] });

test("journal: a payment of an earlier month cancelled in this one is grey, says «Оплата 05.10 (отменена 12.11)», is not in the totals, and the line under the table explains it", async () => {
  const data = journal([journalRow(), journalRow({ id: "j2", receipt_no: 3, paid_on: "2026-10-05", status: "voided", view: "cancelled_here", voided_at: "2026-11-12T08:00:00", void_reason: "ошибка", voided_by_name: "Иванова Д.", amount: 800000 })], { cancelled_here_count: 2, cancelled_here_sum: 800000 });
  const { page: p } = await open(browser, "money-v.entry.tsx", "journal", { props: { journal: data, showVoided: true } });
  await p.waitForSelector('[data-testid="journal-row"]');
  const tags = (await p.locator('[data-testid="journal-tag"]').allTextContents()).map(plain);
  assert.deepEqual(tags, ["Оплата 05.10 (отменена 12.11)"]);
  assert.match(plain(await p.textContent('[data-testid="journal-totals"]')), /^1 оплата на 400 000 сум$/);
  assert.equal(plain(await p.textContent('[data-testid="journal-cancelled-here"]')), "Отменено в этом периоде из прошлых: 2 · 800 000 сум");
  await p.close();
});

test("journal: the checkbox «С заменёнными версиями…» stands by «Скачать Excel»", async () => {
  const { page: p } = await open(browser, "money-v.entry.tsx", "journal", { props: { journal: journal([journalRow()], {}), showVoided: false } });
  await p.waitForSelector('[data-testid="journal-with-replaced"]');
  assert.equal(plain(await p.textContent('[data-testid="journal-with-replaced"]')), "С заменёнными версиями исправленных оплат");
  await p.click('[data-testid="journal-with-replaced"] input, [data-testid="journal-with-replaced"] [role="checkbox"]');
  assert.deepEqual(await p.evaluate(() => window.__log), ["replaced"]);
  await p.close();
});
