// PAY-DUE, screens part 1: the answers of the server by the CONTRACT of section 12 (`payments_schemas.py`), with the DATA OF THE LAYOUT (artifacts/design-paydue/index.html, «Данные макета»):
// today is Friday 20.11.2026, the term is 5 days, the group «Математика 7» (Пн-Ср-Пт) costs 600 000 a month, 13 lessons in November.
//   231 000 = 600 000 × 5 / 13 = 230 769 → rounded to thousands; Камила (record Mon 16.11): 7 of 13 = 323 000, due 20.11; Санжар (Wed 18.11): 6 of 13 = 277 000, due 22.11;
//   Анвар, Нодира, Азиз, Тимур (Fri 20.11): 231 000 each, due 24.11.  Лола: 600 000 from 02.11, the term was 06.11 → 14 days overdue.  Тимур left 31.10 with 600 000 (term 06.10 → 45 days) and came back today.
//   Totals: Долг 3 780 000 · 12 учеников; К оплате 1 524 000 = 323 000 + 277 000 + 4 × 231 000 · 6 учеников; Аванс 148 000 · 4 ученика.  Group: Долг 1 200 000 · 2 ученика, К оплате 462 000 · 2 ученика.
const NB = " ";
const money = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NB)}${NB}сум`;

const base = (over) => ({
  membership_id: "m", student_id: "s", student_name: "X", display_id: null, class_level: 7, group_id: "g1", group_name: "Математика 7", teacher_id: "t1", teacher_name: "Каримова К.",
  is_primary: true, is_active: true, price: { amount: 600000, source: "group", valid_from: "2026-01-01", group_amount: 600000, reason: null }, monthly_fee: 600000,
  status: "active", period_mode: "calendar", paid_until: null, days_left: null, lessons_total: null, lessons_used: null, lessons_left: null, last_payment: null,
  unpaid: 0, advance: 0, partial_credit: 0, price_missing: false, lessons_unpaid: 0, refundable: 0, writeoff_allowed: true,
  debt_amount: 0, due_amount: 0, due_until: null, overdue_days: null, due_lessons: null, debt_lessons: 0, debt_text: null, debt_sub: null, due_text: null, due_sub: null,
  state: "paid", state_text: null, debt_age_bucket: null, ...over,
});

const due = (id, name, amount, until, untilText, over = {}) => base({
  membership_id: `m-${id}`, student_id: `s-${id}`, student_name: name, unpaid: amount, due_amount: amount, due_until: until, state: "to_pay",
  state_text: `К оплате ${money(amount)}`, due_text: `К оплате ${money(amount)}`, due_sub: untilText, ...over,
});

const KAMILA = due("kamila", "Камила Шарипова", 323000, "2026-11-20", "до сегодня");
const SANJAR = due("sanjar", "Санжар Умаров", 277000, "2026-11-22", "до 22.11");
const AZIZ = due("aziz", "Азиз Салимов", 231000, "2026-11-24", "до 24.11");
const ANVAR = due("anvar", "Анвар Каримов", 231000, "2026-11-24", "до 24.11");
const NODIRA = due("nodira", "Нодира Хасанова", 231000, "2026-11-24", "до 24.11");
const TIMUR = base({
  membership_id: "m-timur", student_id: "s-timur", student_name: "Тимур Рашидов", unpaid: 831000, debt_amount: 600000, due_amount: 231000, due_until: "2026-11-24", overdue_days: 45, state: "debt",
  state_text: `Долг ${money(600000)}`, debt_text: `Долг ${money(600000)}`, debt_sub: "просрочено 45 дней · оплачено до 30.09", due_text: `К оплате ${money(231000)}`, due_sub: "до 24.11", debt_also_text: `и долг ${money(600000)} · просрочено 45 дней`, due_also_text: `и к оплате ${money(231000)} до 24.11`, debt_age_bucket: "31_60",
});
const LOLA = base({
  membership_id: "m-lola", student_id: "s-lola", student_name: "Лола Юсупова", unpaid: 600000, debt_amount: 600000, overdue_days: 14, state: "debt",
  state_text: `Долг ${money(600000)}`, debt_text: `Долг ${money(600000)}`, debt_sub: "просрочено 14 дней · оплачено до 31.10", paid_until: "2026-10-31", debt_age_bucket: "to_30",
});
const MADINA = base({ membership_id: "m-madina", student_id: "s-madina", student_name: "Мадина Турсунова", paid_until: "2026-11-30", state: "paid", state_text: "Оплачено до 30.11" });

/** The summary of the centre (`GET /org/payments/summary`). */
const SUMMARY = {
  as_of: "2026-11-20", ends_today: 0, expiring: 0, none: 0, active: 5, free: 0, tracked_total: 23, period_mode: "calendar", lessons_per_payment: 12,
  debt_total: 3780000, debtors: 12, due_total: 1524000, due_students: 6, due_nearest: { date: "2026-11-20", text: "сегодня" },
  advance_total: 148000, students_with_advance: 4, memberships_with_debt: 12, accounting_start_date: "2026-09-01", paused: 0,
  buckets: { debtors: 12, to_pay: 6, expiring: 0, active: 5, paused: 0 }, price_missing: 0,
  debt_ages: [
    { bucket: "to_30", students: 6, memberships: 6, debt_total: 2100000 }, { bucket: "31_60", students: 4, memberships: 4, debt_total: 1380000 },
    { bucket: "61_90", students: 2, memberships: 2, debt_total: 300000 }, { bucket: "over_90", students: 0, memberships: 0, debt_total: 0 },
  ],
  students_paused: 0, pay_due_days: 5, pay_due_lessons: 2, pay_due_package_max_days: 14,
};

const TABS = {
  debtors: { items: [TIMUR, LOLA], total: 12, students: 12, amount_total: 3780000 },
  to_pay: { items: [KAMILA, SANJAR, AZIZ, ANVAR, NODIRA, TIMUR], total: 6, students: 6, amount_total: 1524000 },
  expiring: { items: [], total: 0, students: 0, amount_total: 0 },
  active: { items: [MADINA], total: 1, students: 5, amount_total: 0 },
  paused: { items: [], total: 0, students: 0, amount_total: 0 },
};

/** A page of `GET /org/payments/status`: the rows of the tab and the server's `students` / `amount_total` (the tab's own numbers; one row asked for → one row). */
const statusPage = (query) => {
  const params = new URLSearchParams(query);
  const bucket = params.get("bucket");
  const tab = TABS[bucket] ?? { items: [], total: 0, students: 0, amount_total: 0 };
  const limit = Number(params.get("limit") || 50);
  return { ...tab, items: tab.items.slice(0, limit), limit, offset: Number(params.get("offset") || 0), as_of: "2026-11-20" };
};

/** A STUB of the server's example under the term (`pay_due_example`: the real sentences are the server's, `payments_texts.py`): the next period of the centre from 01.12, the package sentence by M and the limit of days. */
const example = (days, lessons, maxDays = 14) => {
  const ddmm = (d) => `${String(d).padStart(2, "0")}.12`;
  const ordinals = ["Первый", "Второй", "Третий", "Четвёртый", "Пятый"];
  const period = days <= 0 ? "Неоплата — долг с первого дня" : `Период с 01.12 — платить до ${ddmm(days)} включительно`;
  const pack = `${ordinals[lessons]} неоплаченный урок или ${maxDays + 1}-й день после урока — уже долг`;
  return { period, package: pack, text: period };
};

/** The settings of the centre (`GET /org/settings/payments`; the owner only). */
const SETTINGS = {
  period_mode: "calendar", billing_anchor: "fixed_day", billing_day: 1, lessons_per_payment: 12, expiring_days: 3, expiring_lessons: 3, pay_due_days: 5, pay_due_lessons: 2,
  excuse_deadline_days: 5, excuse_deadline_lessons: 2, admin_can_manage: false, centre_cancel_recalc: false, accounting_start_date: "2026-09-01", updated_by: null, updated_at: null,
  pay_due_example: example(5, 2),
};

/** The dry run of a new term: the server's lines (the screen never rebuilds them). */
const impact = (to_due, to_debt) => {
  const word = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
  const texts = [];
  if (to_due) texts.push(`${to_due} ${word(to_due, "ученик", "ученика", "учеников")} из должников ${word(to_due, "станет", "станут", "станут")} «К оплате»`);
  if (to_debt) texts.push(`${to_debt} ${word(to_debt, "ученик", "ученика", "учеников")} ${word(to_debt, "станет", "станут", "станут")} должниками`);
  return { to_due, to_debt, texts };
};

module.exports = { example, money, SUMMARY, SETTINGS, TABS, KAMILA, SANJAR, AZIZ, ANVAR, NODIRA, TIMUR, LOLA, MADINA, statusPage, impact, base };
