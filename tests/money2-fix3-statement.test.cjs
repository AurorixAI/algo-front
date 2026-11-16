// Money-2 fix 3 / п.3: «внесено ДД.ММ» at a refund and a write-off of the statement (live and cancelled) from `details.recorded_on`; nothing when the day is the same / absent.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, F, OWNER } = require("./helpers/money2-w2.cjs");

const ctx = setup(test);
function statement() {
  const data = F.statementWithVoided(F.SHORT);
  const mk = (seq, type, date, title, over, extra) => ({ ...data.rows[0], seq, type, date, title, credit: 0, debit: 0, outflow: 0, ...over, details: { ...data.rows[0].details, payment_id: null, receipt_no: null, replaces_receipt_no: null, ...extra } });
  data.rows.push(mk(5, "refund", "2026-11-12", "Возврат аванса", { outflow: 120000 }, { refund_id: "r1", recorded_on: "2026-11-20" }));
  data.rows.push(mk(6, "writeoff", "2026-11-13", "Долг прощён", { credit: 30000 }, { writeoff_id: "w1", recorded_on: "2026-11-13" }));
  data.voided.push(mk(7, "writeoff", "2026-11-14", "Долг прощён", { credit: 10000, voided_at: "2026-11-21T08:00:00", void_reason: "Ошибка", voided_by_name: "Рустам Каримов" }, { writeoff_id: "w2", recorded_on: "2026-11-19" }));
  data.voided.push(mk(8, "refund", "2026-11-15", "Возврат аванса", { outflow: 5000, voided_at: "2026-11-21T08:00:00", void_reason: "Ошибка", voided_by_name: "Рустам Каримов" }, { refund_id: "r2", recorded_on: "2026-11-18" }));
  return data;
}
const server = F.baseServer((request) => (request.path === "/auth/org/memberships/m-a/statement" ? { json: statement() } : request.path === "/auth/org/memberships/m-a/payments" ? { json: F.paymentsList().map((p) => ({ ...p, created_at: `${p.paid_on}T07:00:00` })) } : null), F.SHORT);

test("п.3: «внесено 20.11» у возврата, нет у прощения того же дня; у отменённых — свои пометки", async () => {
  const run = await mount(ctx, server, "statement", OWNER, { moneyAvailable: true });
  await run.page.waitForSelector('[data-testid="statement-months"]');
  await run.page.waitForSelector('[data-testid="entered-later"]');
  const marks = (await run.page.locator('[data-testid="entered-later"]').allTextContents()).map(plain);
  assert.deepEqual(marks, ["внесено 20.11"], "live rows");
  await run.page.getByText("Показать отменённые").click();
  await run.page.waitForSelector('section[aria-label="Отменённые записи"] li');
  const cancelled = (await run.page.locator('section[aria-label="Отменённые записи"] [data-testid="entered-later"]').allTextContents()).map(plain);
  assert.deepEqual(cancelled, ["внесено 19.11", "внесено 18.11"], "cancelled writeoff and refund");
  await run.page.close();
});

test("п.3 (375): пометка внесено не ломает карточку выписки", async () => {
  const run = await mount(ctx, server, "statement", OWNER, { moneyAvailable: true }, 375);
  await run.page.waitForSelector('[data-testid="entered-later"]');
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  await run.page.close();
});
