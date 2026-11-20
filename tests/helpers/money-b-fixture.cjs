// The shapes of «Деньги-1 / Б» as the server sends them (MONEY1_B_SERVER_REPORT.md, «Контракт для фронта» and «Раунд R3»).
const lessons = (covered, left) => ({ covered, used: 0, left, package_size: 12 });
const item = (o) => ({ membership_id: "m", student_name: "X", debt_before: 0, debt_after: 0, advance_before: 0, advance_after: 0, paid_until_before: null, paid_until_after: null, has_money: true,
  charged_before: 0, charged_after: 0, lessons_before: null, lessons_after: null, next_period: null, text: "", ...o });

const PRICE_IMPACT = {
  students_following: 4, students_with_override: 1, stale_payroll_sheets: 0, stale_sheets: [],
  money: {
    memberships_with_new_debt: 0, debt_delta: 0, memberships_with_less_advance: 2, advance_delta: -50000, days_lost_total: 5, lessons_lost_total: 2, next_period_students: 1, next_period_delta_total: 100000, backdated: false,
    as_of: "2026-12-01", text: "Изменится у 3 учеников: аванс уменьшится на 50 000 сум, оплаченных дней станет меньше на 5, оплаченных уроков станет меньше на 2, следующий период дороже на 100 000 сум у 1 ученика",
    items_total: 3, truncated: false, override_total: 1, override_truncated: false,
    items: [
      item({ membership_id: "a", student_name: "Каримова Алия", advance_before: 600000, advance_after: 600000, lessons_before: lessons(12, 12), lessons_after: lessons(10, 10), text: "Каримова Алия: оплачено уроков 12 → 10; осталось уроков 12 → 10" }),
      item({ membership_id: "b", student_name: "Назаров Тимур", advance_before: 300000, advance_after: 250000, paid_until_before: "2026-12-04", paid_until_after: "2026-11-29", text: "x" }),
      item({ membership_id: "c", student_name: "Юлдашев Рустам", next_period: { period_from: "2026-12-05", period_to: "2027-01-04", amount_before: 300000, amount_after: 400000, difference: 100000 }, text: "x" }),
    ],
    override_students: [{ membership_id: "o", student_name: "Юсупов Бек", price: 250000, group_price_before: 600000, group_price_after: 700000, difference_after: -450000, reason: "скидка" }],
  },
};

const REGIME_IMPACT = {
  students_affected: 4, first_switch: "2026-11-01", latest_switch: "2026-11-01", defer: true, horizon_days: 30, items_total: 3, truncated: false, pending_package_students: 1,
  charged_before_total: 1800000, charged_after_total: 2176000, override_total: 1, override_truncated: false,
  text: "Перейдут на новый способ 3 ученика: за первые 30 дней после перехода начислено 1 800 000 сум → 2 176 000 сум; у 1 ученика идёт пакет — новый способ начнётся, когда он закончится",
  items: [
    item({ membership_id: "a", student_name: "Каримова Алия", switch_on: "2026-11-01", as_of: "2026-11-30", price_amount: 300000, price_unit_before: "за общий месяц", price_unit_after: "за общий месяц с 10-го числа", charged_before: 900000, charged_after: 1176000, debt_before: 900000, debt_after: 1176000, text: "x" }),
    item({ membership_id: "b", student_name: "Назаров Тимур", switch_on: "2026-11-01", as_of: "2026-11-30", price_amount: 300000, price_unit_before: "за общий месяц", price_unit_after: "за общий месяц с 10-го числа", charged_before: 900000, charged_after: 1000000, debt_before: 900000, debt_after: 1000000, text: "x" }),
    item({ membership_id: "p", student_name: "Пакетов Закир", switch_on: null, as_of: null, price_amount: 600000, price_unit_before: "за пакет из 12 уроков", price_unit_after: "за общий месяц", per_lesson_before: 50000, per_lesson_after: 23077, text: "x" }),
  ],
  override_students: [{ membership_id: "o", student_name: "Юсупов Бек", price: 250000, reason: "скидка", text: "Юсупов Бек: индивидуальная цена 250 000 сум не меняется" }],
};

// PAY-DUE 10.2: the rows and the summary by the contract of section 12 - `debt_amount` / `due_amount` with the server's words, `state` the worst state; `debt` is everything unpaid.
const ROW = (o) => ({ membership_id: "m1", student_id: "s1", student_name: "Иванов Иван", group_id: "g1", group_name: "7-А Алгебра", teacher_name: "Каримова К.", is_primary: true, is_active: true, status: "active", period_mode: "calendar", paid_until: null, advance: 0,
  price: { amount: 300000, source: "group", valid_from: "2026-01-01", group_amount: 300000, reason: null }, last_payment: null,
  debt: 0, debt_amount: 0, due_amount: 0, due_until: null, overdue_days: null, debt_text: null, debt_sub: null, due_text: null, due_sub: null, state: "paid", state_text: null, ...o });
const DEBTOR = ROW({ membership_id: "m1", student_name: "Иванов Иван", debt: 600000, debt_amount: 600000, overdue_days: 20, state: "debt", state_text: "Долг 600 000 сум", debt_text: "Долг 600 000 сум", debt_sub: "просрочено 20 дней" });
const WAITING = ROW({ membership_id: "m2", student_id: "s2", student_name: "Петров Пётр", debt: 300000, due_amount: 300000, due_until: "2026-11-07", state: "to_pay", state_text: "К оплате 300 000 сум", due_text: "К оплате 300 000 сум", due_sub: "до 07.11" });

const SUMMARY = {
  as_of: "2026-11-06", ends_today: 0, expiring: 0, none: 0, active: 0, free: 0, tracked_total: 2, period_mode: "calendar", debt_total: 600000, debtors: 1, due_total: 300000, due_students: 1,
  due_nearest: { date: "2026-11-07", text: "до завтра, 07.11" }, advance_total: 0, students_with_advance: 0, memberships_with_debt: 1, paused: 0, students_paused: 0, price_missing: 0,
  buckets: { debtors: 1, to_pay: 1, expiring: 0, active: 0, paused: 0 }, debt_ages: [], pay_due_days: 5, pay_due_lessons: 2, accounting_start_date: "2026-09-01",
};

module.exports = { PRICE_IMPACT, REGIME_IMPACT, DEBTOR, WAITING, SUMMARY, ROW };
