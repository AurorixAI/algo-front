// Data «as in life» for the tables (owner's stage walk, 12.11): long group names, an ID and a class under the name, «индивидуальная цена» under a price,
// a last payment in two lines next to rows where it is empty, chips of different length.  Used by tests/ds-data-table.test.cjs.
const X = require("./money-b-fixture.cjs");

const PAID = (amount, on) => ({ id: "p" + on, membership_id: "m", amount, currency: "UZS", paid_on: on, method: "cash" });
const OVERRIDE = (amount) => ({ amount, source: "override", valid_from: "2026-01-01", group_amount: 600000, reason: "скидка" });
const PAYMENT_ITEMS = [
  X.ROW({ membership_id: "r1", student_id: "s1", student_name: "Тошматов Бобур", display_id: "DS-002", class_level: 7, group_id: "g1", group_name: "Алгебра 7 (вт/пт)", teacher_name: "Камол Эргашев", price: OVERRIDE(400000), debt: 800000, past_debt: 800000, days_overdue: 44, debt_reason: "overdue", reason: "Просрочено на 44 дня", status: "expired", paid_until: "2026-09-30", last_payment: PAID(400000, "2026-11-05"), tab: "debtors" }),
  X.ROW({ membership_id: "r2", student_id: "s2", student_name: "Ученик 1 Б-тест", display_id: "DS-010", class_level: 7, group_id: "g2", group_name: "Подготовка к экзамену 9 класс", teacher_name: "Камол Эргашев", price: { amount: 360000, source: "group", valid_from: "2026-01-01", group_amount: 360000, reason: null }, debt: 280000, past_debt: 0, status: "none", debt_reason: "never_paid", reason: "Ещё не платил", last_payment: null, tab: "debtors" }),
  X.ROW({ membership_id: "r3", student_id: "s3", student_name: "Ученик 3 Б-тест", display_id: "DS-012", class_level: 7, group_id: "g1", group_name: "Алгебра 7 (вт/пт)", teacher_name: "Камол Эргашев", debt: 250000, past_debt: 250000, days_overdue: 1, debt_reason: "overdue", reason: "Просрочено на 1 день", status: "expired", paid_until: "2026-11-12", last_payment: null, tab: "debtors" }),
  X.ROW({ membership_id: "r4", student_id: "s4", student_name: "Абдурахмонов Достонбек Шухратович", display_id: "DS-0012345", class_level: 11, group_id: "g2", group_name: "Подготовка к экзамену 9 класс", teacher_name: "Камол Эргашев", price: OVERRIDE(1250000), debt: 300000, past_debt: 0, days_overdue: 1, debt_reason: "overdue", reason: "Просрочено на 1 день", tab: "waiting", waiting_until: "2026-11-07", waiting_reason: "Ждём оплату до 07.11", last_payment: PAID(1250000, "2026-10-20") }),
  X.ROW({ membership_id: "r5", student_id: "s5", student_name: "Каримова Мадина", display_id: "DS-003", class_level: 8, group_id: "g3", group_name: "Геометрия 8 (пн/чт)", teacher_name: "Камол Эргашев", debt: 100000, past_debt: 100000, days_overdue: 120, debt_reason: "overdue", reason: "Просрочено на 120 дней", status: "expired", paid_until: "2026-07-14", last_payment: null, tab: "debtors" }),
];
const paymentsRealServer = (request) => {
  if (request.path === "/auth/org/payments/summary") return { json: X.SUMMARY };
  if (request.path === "/auth/org/payments/status") return { json: { items: PAYMENT_ITEMS, total: PAYMENT_ITEMS.length, limit: 50, offset: 0 } };
  if (request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "Алгебра 7 (вт/пт)", teacher_id: "t1" }] };
  return null;
};

const STUDENTS_REAL = [
  { id: "s1", first_name: "Достонбек", last_name: "Абдурахмонов", full_name: "Абдурахмонов Достонбек Шухратович", class_level: 11, display_id: "DS-0012345", student_phone: "+998901234567", joined_at: "2026-09-01T05:00:00", status: "active" },
  { id: "s2", first_name: "Мадина", last_name: "Каримова", full_name: "Каримова Мадина", class_level: 7, display_id: "DS-0012346", student_phone: "", joined_at: "2026-10-12T05:00:00", status: "active" },
  { id: "s3", first_name: "Тимур", last_name: "Алиев", full_name: "Алиев Тимур", class_level: 8, display_id: "DS-0012347", student_phone: "+998909990011", joined_at: "2026-10-20T05:00:00", status: "active" },
];

const crow = (id, name, teacher, o) => ({ group_id: id, group_name: name, teacher_id: "t" + id, teacher_name: teacher, charged: 0, paid: 0, forgiven: 0, debtors_debt: 0, students: 0, students_with_debt: 0, debt_waiting: 0, students_waiting: 0, pct: null, ...o });
const COLLECTION_REAL = {
  month: "2026-11", month_label: "Ноябрь 2026", from: "2026-11-01", to: "2026-11-30", text: "x",
  groups: [
    crow("g1", "Алгебра 7 (вт/пт)", "Камол Эргашев", { charged: 12400000, paid: 8800000, debtors_debt: 3600000, students: 31, students_with_debt: 9, pct: 71 }),
    crow("g2", "Подготовка к экзамену 9 класс", "Камол Эргашев", { charged: 15000000, paid: 13500000, debtors_debt: 1000000, debt_waiting: 500000, students: 25, students_with_debt: 5, students_waiting: 2, pct: 90 }),
    crow("g3", "Геометрия 8 (пн/чт)", "Рустам Юсупов", { charged: 9000000, paid: 9000000, students: 18, pct: 100 }),
    crow("g4", "Группа без цены", "Рустам Юсупов", {}),
  ],
  total: crow(null, "Всего", null, { charged: 36400000, paid: 31300000, debtors_debt: 4600000, debt_waiting: 500000, students: 74, students_with_debt: 14, students_waiting: 2, pct: 86 }),
};
module.exports = { PAYMENT_ITEMS, paymentsRealServer, STUDENTS_REAL, COLLECTION_REAL };
