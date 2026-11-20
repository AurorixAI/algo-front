// Money-2 fix 6: ONE statement with every kind of row (charge, payment, transfer out and in in one day, refund, write-off) for the table tests and the mock-up shots.
const F = require("./money2-fixture.cjs");

function statementAllKinds(names) {
  const base = F.statementWithVoided(names).rows[0];
  // PAY-DUE 10.11: what is open on the row itself, the server's words (both charges are paid up at the end: the write-off closed the last 20 000)
  const PAID = { open_amount: 0, open_name: "paid", open_text: "Оплачено", open_parts: [{ name: "paid", amount: 0, text: "Оплачено" }] };
  const mk = (seq, type, date, title, over, extra) => ({ ...base, seq, type, date, title, debit: 0, credit: 0, outflow: 0, balance_text: "", ...over, details: { ...base.details, payment_id: null, receipt_no: null, replaces_receipt_no: null, ...extra } });
  const data = F.statementWithVoided(names);
  data.rows = [
    mk(1, "charge", "2026-11-01", "Ноябрь 2026", { debit: 1200000, balance_after: -1200000, ...PAID }, {}),
    mk(2, "payment", "2026-11-05", "Оплата № 1", { credit: 1800000, balance_after: 600000 }, { payment_id: "p1", receipt_no: 1 }),
    mk(3, "transfer_out", "2026-11-10", `Перевод в группу «${names.T}»`, { outflow: 500000, balance_after: 100000 }, { to_group_name: names.T }),
    mk(4, "transfer_in", "2026-11-10", `Перевод из группы «${names.T}»`, { credit: 600000, balance_after: 700000 }, { from_group_name: names.T }),
    mk(5, "refund", "2026-11-12", "Возврат аванса", { outflow: 120000, balance_after: 580000 }, { refund_id: "r1", method: "cash", recorded_on: "2026-11-12" }),
    mk(6, "charge", "2026-11-13", "Доплата за занятия", { debit: 600000, balance_after: -20000, ...PAID }, {}),
    mk(7, "writeoff", "2026-11-14", "Прощено 20 000 сум", { credit: 20000, balance_after: 0 }, { writeoff_id: "w1", recorded_on: "2026-11-14" }),
  ];
  data.voided = [];
  data.summary = { ...data.summary, charged: 1800000, paid: 1800000 };
  return data;
}

function statementServer(names) {
  return F.baseServer((r) => {
    if (r.path === "/auth/org/memberships/m-a/statement") return { json: statementAllKinds(names) };
    if (r.path === "/auth/org/memberships/m-a/payments") return { json: [] };
    return null;
  }, names);
}

module.exports = { statementAllKinds, statementServer };
