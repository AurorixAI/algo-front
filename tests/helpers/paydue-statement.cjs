// PAY-DUE 14Б.7 / 14Б.8: the statements and the preview of the frames 11-14, 21 of the layout (`artifacts/design-paydue/index.html`) in the CONTRACT of the server (`StatementOut`, `PaymentPreview`):
// the words («Долг 600 000», «К оплате 231 000», «просрочено 14 дней», «до 24.11», «Оплачено до 30.11») are written here by hand - a stand-in for the server's texts; the screen shows them as they are (143).
// The numbers are counted by hand next to each case (the equalities of 10.11 hold in every one of them: the sums of `open_*` by name = the summary).
const NB = " ";
const money = (value) => `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, NB)}${NB}сум`;
const digits = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, NB);

const PART = (name, amount, text) => ({ name, amount, text });
const SEGMENT = (id, from, to, charge, paid = 0) => ({
  id, kind: "period", period_from: from, period_to: to, billable_days: 30, days_text: null,
  price: { amount: charge, source: "group", valid_from: "2026-01-01", group_amount: charge, reason: null, set_by_name: null, scheduled: null },
  charge, basis: "full", lessons: null, paid, written_off: 0, recalculated: 0, unpaid: charge - paid, remaining: charge - paid, covered_days: 0, covered_through: null, partial_credit: 0, state: "open", bucket: "past_debt", parts: [],
});
const DETAILS = (segment = null, extra = {}) => ({
  segment, payment_id: null, receipt_no: null, method: null, created_by_name: null, note: null, allocations: [], writeoff_id: null, refund_id: null, reason: null, recorded_on: null,
  from_group_name: null, from_membership_id: null, to_group_name: null, to_membership_id: null, recalc: null, replaces_receipt_no: null, replaces_amount: null, replaced_by_receipt_no: null, ...extra,
});
/** A charge row: «Остаток» = what is open on the row ITSELF today, by the name of the server (10.11). */
const charge = (seq, date, title, amount, segment, parts, openSub = null) => ({
  seq, date, type: "charge", title, debit: amount, credit: 0, outflow: 0, balance_after: null, balance_text: null,
  open_amount: parts.reduce((total, part) => total + part.amount, 0), open_name: parts.length ? parts[0].name : null, open_text: parts.map((part) => part.text).join(" · ") || null, open_parts: parts, open_sub: openSub,
  voided_at: null, void_reason: null, voided_by_name: null, details: DETAILS(segment),
});
const payment = (seq, date, no, amount, parts = [], extra = {}) => ({
  seq, date, type: "payment", title: `Оплата № ${no}`, debit: 0, credit: amount, outflow: 0, balance_after: null, balance_text: null,
  open_amount: parts.reduce((total, part) => total + part.amount, 0), open_name: parts.length ? parts[0].name : null, open_text: parts.map((part) => part.text).join(" · ") || null, open_parts: parts, open_sub: null,
  voided_at: null, void_reason: null, voided_by_name: null, details: DETAILS(null, { receipt_no: no, payment_id: `p${no}`, method: "cash", created_by_name: "Рустам Каримов", ...extra }),
});

const SUMMARY = (over) => ({
  debt_amount: 0, due_amount: 0, due_until: null, overdue_days: null, due_lessons: null, debt_lessons: 0, debt_text: null, debt_sub: null, due_text: null, due_sub: null, debt_also_text: null, due_also_text: null,
  state: "paid", state_text: null, charged: 0, paid: 0, transferred_in: 0, written_off: 0, recalculated: 0, refunded: 0, transferred_out: 0, unpaid: 0, advance: 0, paid_until: null, status: "active", reconciles: true, ...over,
});
const membership = (name, group) => ({ membership_id: "m1", student_id: "s1", student_name: name, display_id: "N13-004", group_id: "g1", group_name: group, teacher_name: "Иванова Мария", is_active: true });
const base = (name, group, summary, rows, upcoming = []) => ({ membership: membership(name, group), as_of: "2026-11-20", mode: "calendar", accounting_start: "2026-09-01", summary, rows, voided: [], upcoming });

/** Frame 12: Лола, the term has passed: «Долг 600 000» + «просрочено 14 дней»; one charge row, a red chip «Долг 600 000» (600 000 = 600 000). */
function lolaDebt(name = "Лола Юсупова", group = "Математика 7 Пн-Ср-Пт") {
  const seg = SEGMENT("seg:11", "2026-11-02", "2026-12-01", 600000);
  return base(name, group, SUMMARY({ debt_amount: 600000, overdue_days: 14, debt_text: `Долг ${money(600000)}`, debt_sub: "просрочено 14 дней", state: "debt", state_text: `Долг ${money(600000)}`, charged: 600000, unpaid: 600000, status: "expired" }),
    [charge(1, "2026-11-02", "Ноябрь 2026 — полный месяц", 600000, seg, [PART("debt", 600000, `Долг ${digits(600000)}`)], "срок был 06.11")]);
}
/** Frame 13: Тимур left on 31.10 with October unpaid (a debt, 600 000, 45 days) and came back on 20.11 (November 231 000 «К оплате» until 24.11); 600 000 + 231 000 = 831 000 charged. */
function timurTwo(name = "Тимур Рашидов", group = "Математика 7 Пн-Ср-Пт") {
  return base(name, group, SUMMARY({
    debt_amount: 600000, due_amount: 231000, due_until: "2026-11-24", overdue_days: 45, debt_text: `Долг ${money(600000)}`, debt_sub: "просрочено 45 дней", due_text: `К оплате ${money(231000)}`, due_sub: "до 24.11",
    state: "debt", state_text: `Долг ${money(600000)}`, charged: 831000, unpaid: 831000, status: "expired",
  }), [
    charge(1, "2026-10-02", "Октябрь 2026 — полный месяц", 600000, SEGMENT("seg:10", "2026-10-02", "2026-11-01", 600000), [PART("debt", 600000, `Долг ${digits(600000)}`)], "срок был 06.10"),
    charge(2, "2026-11-20", "Ноябрь 2026 — неполный месяц", 231000, SEGMENT("seg:11", "2026-11-20", "2026-12-19", 231000), [PART("due", 231000, `К оплате ${digits(231000)}`)], "до 24.11"),
  ]);
}
/** Frame 11: Анвар, the term runs: «К оплате 231 000» + «до 24.11». */
function anvarDue(name = "Анвар Каримов", group = "Математика 7 Пн-Ср-Пт") {
  return base(name, group, SUMMARY({ due_amount: 231000, due_until: "2026-11-24", due_text: `К оплате ${money(231000)}`, due_sub: "до 24.11", state: "to_pay", state_text: `К оплате ${money(231000)}`, charged: 231000, unpaid: 231000 }),
    [charge(1, "2026-11-20", "Ноябрь 2026 — неполный месяц", 231000, SEGMENT("seg:11", "2026-11-20", "2026-12-19", 231000), [PART("due", 231000, `К оплате ${digits(231000)}`)], "до 24.11")]);
}
/** Frame 14 (right): Анвар paid 231 000: «Оплачено до 30.11»; the charge row is «Оплачено» (a quiet word), the payment row says nothing (all the money went to the charge). */
function anvarPaid(name = "Анвар Каримов", group = "Математика 7 Пн-Ср-Пт") {
  return base(name, group, SUMMARY({ state: "paid", state_text: "Оплачено до 30.11", charged: 231000, paid: 231000, paid_until: "2026-11-30" }), [
    charge(1, "2026-11-20", "Ноябрь 2026 — неполный месяц", 231000, SEGMENT("seg:11", "2026-11-20", "2026-12-19", 231000, 231000), [PART("paid", 0, "Оплачено")]),
    payment(2, "2026-11-20", 31, 231000),
  ]);
}
/** An advance: the student paid 800 000 for 600 000 charged: 200 000 are not spread on a charge yet - the payment row says «Аванс 200 000» (13.2), the summary «Аванс 200 000 сум». */
function withAdvance(name = "Нодира Алиева", group = "Математика 7 Пн-Ср-Пт") {
  return base(name, group, SUMMARY({ state: "advance", state_text: `Аванс ${money(200000)}`, charged: 600000, paid: 800000, advance: 200000, paid_until: "2026-12-01" }), [
    charge(1, "2026-11-02", "Ноябрь 2026 — полный месяц", 600000, SEGMENT("seg:11", "2026-11-02", "2026-12-01", 600000, 600000), [PART("paid", 0, "Оплачено")]),
    payment(2, "2026-11-10", 32, 800000, [PART("advance", 200000, `Аванс ${money(200000)}`)]),
  ]);
}
/** PAY-DUE 20.3: a payment ahead - the state of the server is «Оплачено до 21.12», the advance (200 000) stands only in its payment row and in the summary: the line «Аванс 200 000 сум» under the state. */
function aheadPaid(name = "Нодира Алиева", group = "Математика 7 Пн-Ср-Пт") {
  const out = withAdvance(name, group);
  out.summary = { ...out.summary, state: "paid", state_text: "Оплачено до 21.12", paid_until: "2026-12-21" };
  return out;
}
/** PAY-DUE 20.3 (DS-043): the student moved into the group with money (919 000 came with him): 600 000 are the charge, the rest (319 000) is the advance of the group - the row of the transfer says «Аванс 319 000». */
function transferWithAdvance(name = "Тимур Рашидов", group = "Математика 7 Пн-Ср-Пт") {
  const transfer = { ...payment(2, "2026-11-10", 0, 0, [PART("advance", 319000, `Аванс ${money(319000)}`)]), type: "transfer_in", title: "Перевод из группы «Математика 6»", credit: 919000, details: DETAILS(null, { from_group_name: "Математика 6" }) };
  return base(name, group, SUMMARY({ state: "paid", state_text: "Оплачено до 21.12", charged: 600000, paid: 0, transferred_in: 919000, advance: 319000, paid_until: "2026-12-21" }), [
    charge(1, "2026-11-02", "Ноябрь 2026 — полный месяц", 600000, SEGMENT("seg:11", "2026-11-02", "2026-12-01", 600000, 600000), [PART("paid", 0, "Оплачено")]),
    transfer,
  ]);
}
/**
 * 18Б.3 (the contract of 17): October (600 000) forgiven whole - the row says «Прощено» (quiet, not a sum of the open); November (600 000) paid, then the centre cancelled a lesson with the recalculation on
 * (-46 000): the charge is closed by money (554 000) and the recalculation (46 000) - «Оплачено»; the 46 000 of the payment are free again and stand NOWHERE but on the row of the recalculation: «Аванс 46 000».
 * By hand: charged 1 200 000 - paid 600 000 - forgiven 600 000 - recalculated 46 000 = -46 000 = unpaid 0 - advance 46 000; the open parts by name: paid 0, forgiven (not counted), advance 46 000 = the summary.
 */
function forgivenRecalc(name = "Нодира Алиева", group = "Математика 7 Пн-Ср-Пт") {
  const row = (seq, date, type, title, fields, parts, details = {}) => ({
    seq, date, type, title, debit: 0, credit: 0, outflow: 0, balance_after: null, balance_text: null,
    open_amount: parts.reduce((total, part) => total + part.amount, 0), open_name: parts.length ? parts[0].name : null, open_text: parts.map((part) => part.text).join(" · ") || null, open_parts: parts, open_sub: null,
    voided_at: null, void_reason: null, voided_by_name: null, ...fields, details: DETAILS(null, details),
  });
  const oct = SEGMENT("seg:10", "2026-10-02", "2026-11-01", 600000);
  const nov = SEGMENT("seg:11", "2026-11-02", "2026-12-01", 600000, 554000);
  return base(name, group, SUMMARY({ state: "advance", state_text: `Аванс ${money(46000)}`, charged: 1200000, paid: 600000, written_off: 600000, recalculated: 46000, unpaid: 0, advance: 46000, paid_until: "2026-12-01" }), [
    { ...charge(1, "2026-10-02", "Октябрь 2026 — полный месяц", 600000, oct, [PART("forgiven", 0, "Прощено")]), open_amount: 0 },
    row(2, "2026-10-20", "writeoff", "Прощено 600 000 сум", { credit: 600000 }, [], { writeoff_id: "w1", recorded_on: "2026-10-20", reason: "договорённость с родителем", created_by_name: "Рустам Каримов" }),
    charge(3, "2026-11-02", "Ноябрь 2026 — полный месяц", 600000, nov, [PART("paid", 0, "Оплачено")]),
    payment(4, "2026-11-03", 41, 600000),
    row(5, "2026-11-12", "recalc", "Перерасчёт: урок 10.11 отменён центром", { credit: 46000 }, [PART("advance", 46000, `Аванс ${money(46000)}`)], { recalc: { amount: 46000, lesson_date: "2026-11-10", text: null } }),
  ]);
}
/** Nothing is added up: the rows say «К оплате 231 000» but the summary says 200 000 (the red line «Не сходится» must show). */
function broken() {
  const statement = anvarDue();
  return { ...statement, summary: { ...statement.summary, due_amount: 200000, unpaid: 200000, due_text: `К оплате ${money(200000)}` } };
}

/** `PaymentPreview` of frame 14: Анвар owes 231 000 «К оплате» until 24.11; the field takes the server's `suggested_amount`; the sentence under it is the server's. */
function anvarPreview(amount) {
  const due = { unpaid: 231000, debt_amount: 0, due_amount: 231000, due_until: "2026-11-24", overdue_days: null, debt_text: null, debt_sub: null, due_text: `К оплате ${money(231000)}`, due_sub: "до 24.11", advance: 0, segments: [], paid_until: null };
  const out = { as_of: "2026-11-20", mode: "calendar", price: { amount: 600000, source: "group", valid_from: "2026-01-01", group_amount: 600000, reason: null }, due, suggested_amount: 231000, amount: amount ?? null, result: null, warnings: [] };
  if (!amount) return out;
  const left = Math.max(0, 231000 - amount);
  return { ...out, result: { allocations: [], unpaid_after: left, debt_amount_after: 0, due_amount_after: left, due_until_after: left ? "2026-11-24" : null, overdue_days_after: null, advance_after: Math.max(0, amount - 231000), paid_until_before: null, paid_until_after: "2026-11-30", status_after: "active", partial_credit_after: 0, lessons: null, price_ahead: [], summary_text: left ? `Закроет ${money(amount)} из «К оплате» ${money(231000)}` : `Закроет «К оплате» ${money(231000)}` } };
}
/** Timur's window: a debt of 600 000 (45 days) and «К оплате» 231 000 - the text under the field says which sum the money closes first (10.10). */
function timurPreview(amount) {
  const due = { unpaid: 831000, debt_amount: 600000, due_amount: 231000, due_until: "2026-11-24", overdue_days: 45, debt_text: `Долг ${money(600000)}`, debt_sub: "просрочено 45 дней", due_text: `К оплате ${money(231000)}`, due_sub: "до 24.11", advance: 0, segments: [], paid_until: null };
  const out = { as_of: "2026-11-20", mode: "calendar", price: { amount: 600000, source: "group", valid_from: "2026-01-01", group_amount: 600000, reason: null }, due, suggested_amount: 831000, amount: amount ?? null, result: null, warnings: [] };
  if (!amount) return out;
  const debtGoes = Math.min(amount, 600000);
  const dueGoes = Math.max(0, Math.min(amount - 600000, 231000));
  return { ...out, result: { allocations: [], unpaid_after: 831000 - amount, debt_amount_after: 600000 - debtGoes, due_amount_after: 231000 - dueGoes, due_until_after: dueGoes < 231000 ? "2026-11-24" : null, overdue_days_after: debtGoes < 600000 ? 45 : null, advance_after: 0, paid_until_before: null, paid_until_after: null, status_after: "expired", partial_credit_after: 0, lessons: null, price_ahead: [], summary_text: dueGoes > 0 ? `Погасит долг ${money(debtGoes)} · к оплате ${money(dueGoes)}` : `Погасит долг ${money(debtGoes)}` } };
}

module.exports = { aheadPaid, transferWithAdvance, forgivenRecalc, lolaDebt, timurTwo, anvarDue, anvarPaid, withAdvance, broken, anvarPreview, timurPreview, money };
