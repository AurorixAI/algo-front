// The numbers of the walk of stage 05.11 (UX pack §5): a student who owes 1 200 000 (September, October, November at 400 000), pays 400 000 in November; September is closed and the payment
// moves the pay of two teachers.  Used by the shots (`40-payment-window-*`) and the tests of the window.
const SEGMENT = (month, bucket, last, paid = 0) => ({
  id: `seg:${month}`, kind: "period", period_from: `2026-${month}-01`, period_to: `2026-${month}-${last}`, billable_days: Number(last), days_text: null,
  price: { amount: 400000, source: "group", valid_from: "2026-01-01", group_amount: 400000, reason: null }, charge: 400000, basis: "full", lessons: null,
  paid, written_off: 0, unpaid: 400000 - paid, remaining: 400000 - paid, covered_days: 0, covered_through: null, partial_credit: 0, state: "open", bucket,
});

/** The answer of `payments/preview` for the amount (null: no amount asked). */
function toshmatovPreview(amount) {
  const segments = [SEGMENT("09", "past_debt", "30"), SEGMENT("10", "past_debt", "31"), SEGMENT("11", "current", "30")];
  const base = {
    as_of: "2026-11-05", mode: "calendar", price: { amount: 400000, source: "group", valid_from: "2026-01-01", group_amount: 400000, reason: null },
    due: { debt: 1200000, past_debt: 800000, current_due: 400000, advance: 0, segments, paid_until: "2026-08-31", days_overdue: 36 },
    suggested_amount: 1200000, amount: amount ?? null, result: null, warnings: [],
  };
  if (!amount) return base;
  // the money goes to the oldest period first: September is closed by 400 000, the rest of the amount (if any) goes to October, then November
  let left = amount;
  const allocations = [];
  const after = {};
  for (const segment of segments) {
    const part = Math.min(left, segment.unpaid);
    if (part > 0) allocations.push({ segment_id: segment.id, period_from: segment.period_from, period_to: segment.period_to, amount: part, days: 30, bucket: segment.bucket, closes: part === segment.unpaid, label: "x", price: 400000, segment_remaining_after: segment.unpaid - part });
    after[segment.bucket] = (after[segment.bucket] ?? 0) + (segment.unpaid - part);
    left -= part;
  }
  const debtAfter = 1200000 - amount;
  return {
    ...base,
    result: {
      allocations, debt_after: debtAfter, past_debt_after: after.past_debt ?? 0, current_due_after: after.current ?? 0, advance_after: 0, paid_until_before: "2026-08-31", paid_until_after: "2026-09-30",
      status_after: "expired", days_overdue_after: 5, partial_credit_after: 0, lessons: null, price_ahead: [], summary_text: "Закроет долг",
    },
  };
}

/** The pay of the two teachers of September the payment moves (closed month): +133 333 and +13 333. */
const STAGE_EFFECTS = {
  students: [], dryRun: true, text: "",
  payroll: [
    { month: "2026-09", state: "closed", sheetId: "s1", teacherId: "t1", teacherName: "Эргашев К.", savedTotal: 860000, paid: 0, freshBefore: 860000, freshAfter: 993333, freshTotal: 993333, changedBy: 133333, driftAfter: 133333 },
    { month: "2026-09", state: "closed", sheetId: "s2", teacherId: "t2", teacherName: "Мирзаева Л.", savedTotal: 36666, paid: 0, freshBefore: 36666, freshAfter: 49999, freshTotal: 49999, changedBy: 13333, driftAfter: 13333 },
  ],
};

const TOSHMATOV = { membership_id: "m1", group_id: "g1", student_name: "Тошматов Бобур", group_name: "Алгебра 7 (вт/пт)" };

module.exports = { toshmatovPreview, STAGE_EFFECTS, TOSHMATOV };
