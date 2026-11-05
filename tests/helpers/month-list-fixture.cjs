// The list of the salaries of the walk of stage 05.11 (UX pack §5.2): November is going, Камол Эргашев is paid ahead and his salary moved after the saving (120 834 -> 75 834), Лола Мирзаева has nothing
// saved, Назарова Сабина has a saved sum nobody paid yet.  935 834 accrued · 150 000 paid · 860 000 left · 74 166 paid ahead.
const PAYOUT = (over) => ({ saved_total: 0, fresh_total: 0, target: 0, paid: 0, balance: 0, state: "unpaid", basis: "fresh", changed_by: 0, change_text: null, text: "x", items: [], carry_in: 0, carry_used: 0, advance_out: 0, ...over });
const KAMOL = { teacher_id: "t1", teacher_name: "Камол Эргашев", lessons_count: 4, lesson_types: [], rates: { group: "50", individual: "60" }, missing_rates: [], undecided_lessons: 1,
  sheet: { id: "s1", revision: 2, total_amount: 120834, stale: true, updated_at: "2026-11-05T05:00:00" }, warnings: { open_lessons: 1, pending_excused: 0, no_fee: 0, unpaid: 8, unpaid_students: 1 },
  payout: PAYOUT({ saved_total: 120834, fresh_total: 75834, target: 75834, paid: 150000, balance: -74166, state: "overpaid", changed_by: -45000 }) };
const LOLA = { teacher_id: "t2", teacher_name: "Лола Мирзаева", lessons_count: 0, lesson_types: [], rates: { group: "50" }, missing_rates: [], sheet: null, warnings: { open_lessons: 1, pending_excused: 0, no_fee: 0, unpaid: 0 }, undecided_lessons: 0, payout: null };
const SABINA = { teacher_id: "t3", teacher_name: "Назарова Сабина", lessons_count: 9, lesson_types: [], rates: { group: "50", pair: "45" }, missing_rates: [],
  sheet: { id: "s3", revision: 1, total_amount: 860000, stale: false, updated_at: "2026-11-05T05:00:00" }, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 },
  payout: PAYOUT({ saved_total: 860000, fresh_total: 860000, target: 860000, paid: 0, balance: 860000, state: "unpaid", basis: "saved" }) };
const TEACHERS = [KAMOL, LOLA, SABINA];
const OVERVIEW = { month: "2026-11", period_start: "2026-11-01", period_end: "2026-11-30", month_open: true, divisor: 12, lessons_without_teacher: 0, teachers: TEACHERS };

/** The server of the page «Зарплата» for November 2026; `changed` is the answer of the months whose saved salary moved (the owner's bar). */
function monthServer({ changed = [{ month: "2026-09", teachers: 2 }, { month: "2026-10", teachers: 1 }], teachers = TEACHERS } = {}) {
  return (request) => {
    if (request.method !== "GET") return null;
    if (request.path === "/auth/org/payroll/months/2026-11") return { json: { ...OVERVIEW, teachers } };
    if (request.path === "/auth/org/payroll-periods") return { json: { month: "2026-11", items: [] } };
    if (request.path === "/auth/org/payroll/changed-months") return changed === null ? { status: 404, json: { detail: { code: "NOT_FOUND", message: "x" } } } : { json: { items: changed } };
    return null;
  };
}

module.exports = { KAMOL, LOLA, SABINA, TEACHERS, OVERVIEW, monthServer };
