// Snapshots of the windows of «Деньги-1 / В» (front F1): norm, 409, empty - 1280 and 375, headless, the server answered by mocks.  Run: node tests/money1-v-shots.cjs <out dir>
const path = require("node:path");
const fs = require("node:fs");
const { start, conflict, ROW, open } = require("./helpers/money1-v.cjs");

const OUT = process.argv[2] || path.join(__dirname, "..", "..", "..", "artifacts", "analysis", "money1_v_front_screens", "f1");
fs.mkdirSync(OUT, { recursive: true });
const NB = " ";

const rows = [
  { id: "d1", at: "2026-11-05T09:20:00", kind: "payment_void", kind_label: "Оплата отменена", student_id: "s1", student_name: "Тошматов Бобур", group_name: "Алгебра 7", amount: 400000, new_amount: null, receipt_no: 21, reason: "Внесли два раза", actor_name: "Иванова Д.", debt_before: 0, debt_after: 400000 },
  { id: "d2", at: "2026-11-04T07:00:00", kind: "payment_replace", kind_label: "Оплата исправлена", student_id: "s2", student_name: "Каримова Дилноза", group_name: "Геометрия 8", amount: 400000, new_amount: 200000, receipt_no: 22, reason: "ошибся в сумме", actor_name: "Арслан Владелец", debt_before: 0, debt_after: 200000 },
  { id: "d3", at: "2026-11-03T07:00:00", kind: "payment_writeoff", kind_label: "Долг прощён", student_id: "s3", student_name: "Юсупов Бек", group_name: "Алгебра 7", amount: 150000, new_amount: null, receipt_no: null, reason: "болезнь", actor_name: "Иванова Д.", debt_before: 150000, debt_after: 0 },
];
const page = (r) => ({ as_of: "2026-11-10", from: "2026-11-01", to: "2026-11-30", page: 1, size: 25, total: r.length, pages: 1, since: "2026-11-02", rows: r });
const REFUND = { refund_id: "r1", receipt_no: 12, receipt_label: "В-12", org_name: "ALGO Math Center", org_city: "Ташкент", org_phone: "+998901234567", student_name: "Тошматов Бобур", display_id: "N13-0042-AL", group_name: "Алгебра 7", amount: 100000, amount_words: "Сто тысяч сум", method: "cash", method_label: "Наличные", reason: "ученик ушёл", effective_on: "2026-11-07", accepted_by_name: "Арслан Владелец", disclaimer: "Не является фискальным чеком", signature_line: "Получил(а): ____________  Подпись" };

(async () => {
  const browser = await start();
  const shot = async (name, width, entry, mount, props, server, act) => {
    const run = await open(browser, entry, mount, { width, props, server });
    await run.page.waitForTimeout(700);
    if (act) await act(run.page);
    await run.page.waitForTimeout(500);
    await run.page.screenshot({ path: path.join(OUT, `${name}-${width}.png`) });
    await run.page.close();
  };
  for (const width of [1280, 375]) {
    const refundServer = (answer) => (r) => (r.method === "POST" && r.path === "/auth/org/memberships/m1/refunds" ? answer : null);
    const fillRefund = async (p) => { await p.click('[data-testid="refund-methods"] >> text=Наличные'); await p.fill("#refund-reason", "ученик ушёл"); };
    await shot("50-refund-norm", width, "money-v.entry.tsx", "refund", {}, null, fillRefund);
    await shot("50-refund-409", width, "money-v.entry.tsx", "refund", {}, refundServer(conflict("BALANCE_CHANGED", `Сумма к возврату изменилась: было 344${NB}000${NB}сум, сейчас 244${NB}000${NB}сум`, { refundable: 244000, advance: 244000 })), async (p) => { await fillRefund(p); await p.click('[data-testid="refund-submit"]'); await p.waitForSelector('[data-testid="balance-changed"]'); });
    await shot("50-refund-empty", width, "money-v.entry.tsx", "refund", {}, refundServer(conflict("BALANCE_CHANGED", "Сумма к возврату изменилась: было 344 000 сум, сейчас 0 сум", { refundable: 0, advance: 0 })), async (p) => { await fillRefund(p); await p.click('[data-testid="refund-submit"]'); await p.waitForSelector('[data-testid="balance-changed-close"]'); });
    const woServer = (answer) => (r) => (r.method === "POST" && r.path === "/auth/org/memberships/m1/writeoffs" ? answer : null);
    await shot("51-writeoff-norm", width, "money-v.entry.tsx", "writeoff", {}, null, async (p) => p.fill("#writeoff-reason", "болезнь"));
    await shot("51-writeoff-409", width, "money-v.entry.tsx", "writeoff", {}, woServer(conflict("BALANCE_CHANGED", "Долг изменился: было 350 000 сум, сейчас 200 000 сум", { debt: 200000, advance: 0 })), async (p) => { await p.fill("#writeoff-reason", "болезнь"); await p.click('[data-testid="writeoff-submit"]'); await p.waitForSelector('[data-testid="balance-changed"]'); });
    await shot("52-void-norm", width, "money-v.entry.tsx", "voidWriteoff", {}, null, async (p) => p.fill("#record-void-reason", "ошиблись"));
    await shot("52-void-already", width, "money-v.entry.tsx", "voidRefund", {}, (r) => (r.method === "POST" ? conflict("ALREADY_VOIDED", "Возврат уже отменён", { voided_at: "2026-11-05T09:20:00", voided_by_name: "Иванова Д." }) : null), async (p) => { await p.fill("#record-void-reason", "ошиблись"); await p.click('button[type="submit"]'); await p.waitForSelector('[data-testid="already-voided"]'); });
    const dec = (r) => (rr) => (rr.path === "/auth/org/payments/decisions" ? { json: page(r) } : null);
    await shot("53-decisions-norm", width, "money-v.entry.tsx", "decisions", {}, dec(rows), async (p) => { await p.waitForSelector('[data-testid="decision-row"]'); await p.locator('[data-testid="decision-row"] button').first().click(); });
    await shot("53-decisions-empty", width, "money-v.entry.tsx", "decisions", {}, dec([]));
    await shot("55-refund-receipt", width, "money-v.entry.tsx", "refundReceiptPage", {}, (r) => (r.path === "/auth/org/refunds/r1/receipt" ? { json: REFUND } : null));
    await shot("55-refund-receipt-404", width, "money-v.entry.tsx", "refundReceiptPage", {}, (r) => (r.path === "/auth/org/refunds/r1/receipt" ? { status: 404, json: { detail: { code: "NOT_FOUND", message: "Возврат не найден" } } } : null));
  }
  await browser.close();
  console.log(fs.readdirSync(OUT).length, "files in", OUT);
})();
