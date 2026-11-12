// The screens of wave 3 with the fixtures that draw them (shared by tests/dom/wave3-shots.cjs - the pictures - and tests/ds-data-table.test.cjs - the checks).
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..", "..");
const X = require("./money-b-fixture.cjs");
const { monthServer } = require("./month-list-fixture.cjs");

const paymentsServer = (request) => {
  if (request.path === "/auth/org/payments/summary") return { json: X.SUMMARY };
  if (request.path === "/auth/org/payments/status") {
    const tab = /bucket=([a-z]+)/.exec(request.query)[1];
    const items = tab === "debtors" ? [X.DEBTOR, X.WAITING, { ...X.DEBTOR, membership_id: "m9", student_id: "s9", student_name: "Очень Длинное Имя Ученика Абдурахмонов" }] : [];
    return { json: { items, total: items.length, limit: 50, offset: 0 } };
  }
  if (request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "7-А Алгебра", teacher_id: "t1" }] };
  return null;
};
const item = (id, date, group, extra = {}) => ({ id, attendance_id: `a${id}`, lesson_date: date, lesson_key: `${date}_l`, group: { id: `g${id}`, name: group, ...extra }, teacher: { id: "t1", name: "Каримова Камола" }, student: { id: `s${id}`, full_name: `Ученик ${id}`, display_id: `AL-00${id}` }, status: "pending", reason: "Болел, справка у родителей, температура три дня", reason_by_name: "Мама", reason_at: "2026-11-06T09:00:00", files: [], deadline_at: "2026-11-30T23:59:00", teacher_name: "Каримова Камола" });
const EXROWS = [item("1", "2026-10-14", "7-А Алгебра"), item("2", "2026-09-22", "7-А Алгебра"), item("3", "2026-10-02", "5-Б Геометрия", { archived: true }), item("4", "2026-11-05", "7-Б Геометрия")];
const excusesServer = (r) => {
  if (r.path === "/auth/org/attendance/excuses/summary") return { json: { pending_total: EXROWS.length, open_lessons_total: 0 } };
  if (r.path === "/auth/org/attendance/excuses") return { json: { items: EXROWS, total: EXROWS.length, pending_total: EXROWS.length } };
  return null;
};
const STUDENTS = [
  { id: "s1", first_name: "Азиз", last_name: "Эргашев", full_name: "Эргашев Азиз Абдуллаевич", class_level: 7, display_id: "DS-0012345", student_phone: "+998901234567", joined_at: "2026-09-01T05:00:00", status: "active" },
  { id: "s2", first_name: "Мадина", last_name: "Каримова", full_name: "Каримова Мадина", class_level: 7, display_id: "DS-0012346", student_phone: "+998907654321", joined_at: "2026-10-12T05:00:00", status: "active" },
  { id: "s3", first_name: "Тимур", last_name: "Алиев", full_name: "Алиев Тимур", class_level: 8, display_id: "DS-0012347", student_phone: "+998909990011", joined_at: "2026-10-20T05:00:00", status: "active" },
];
const DEC = [
  { id: "d1", at: "2026-11-05T09:20:00", kind: "payment_void", kind_label: "Оплата отменена", student_id: "s1", student_name: "Тошматов Бобур", group_name: "Алгебра 7", amount: 400000, amount_after: null, debt_before: 0, debt_after: 400000, actor_name: "Иванова Д.", reason: "Ошибка", receipt_no: 21 },
  { id: "d2", at: "2026-11-04T07:00:00", kind: "payment_replace", kind_label: "Оплата исправлена", student_id: "s2", student_name: "Каримова Дилноза", group_name: "Геометрия 8", amount: 400000, amount_after: 200000, debt_before: 0, debt_after: 200000, actor_name: "Иванова Д.", reason: "Сумма", receipt_no: 22 },
];
const jr = (id, extra = {}) => ({ id, receipt_no: 5, paid_on: "2026-11-05", paid_time: "10:00", created_at: null, student_id: "s1", student_name: "Тошматов Бобур", display_id: null, membership_id: "m1", group_id: "g1", group_name: "Алгебра 7", amount: 400000, method: "cash", status: "live", view: "live", ...extra });
const JOURNAL = { as_of: "2026-11-15", from: "2026-11-01", to: "2026-11-30", page: 1, size: 25, total: 3, pages: 1, totals: { count: 3, sum: 1000000, voided_count: 0 }, rows: [jr("j1"), jr("j2", { student_name: "Очень Длинное Имя Ученика Абдурахмонов", amount: 1200000, method: "card" }), jr("j3", { student_name: "Каримова Дилноза", amount: 350000, method: "transfer" })], authors: [], history: [] };

const SHOTS = [
  { name: "payments", entry: "money-b.entry.tsx", server: paymentsServer, mount: "payments", props: { refresh: true, search: "bucket=debtors" }, wait: ".dt-row, li" },
  { name: "payroll-month", entry: "money.entry.tsx", server: monthServer(), mount: "monthPage", props: {}, search: "month=2026-11", wait: ".dt-row, li", time: "2026-11-05T10:00:00+05:00" },
  { name: "roster", entry: "ds.entry.tsx", server: () => null, mount: "roster", props: { students: STUDENTS }, wait: ".dt-row, tbody tr" },
  { name: "excuses", entry: "ds.entry.tsx", server: excusesServer, mount: "excuses", props: {}, wait: "li", time: "2026-11-10T10:00:00+05:00" },
  { name: "income-decisions", entry: "money-v.entry.tsx", server: (r) => (r.path === "/auth/org/payments/decisions" ? { json: { as_of: "2026-11-10", from: "2026-11-01", to: "2026-11-30", page: 1, size: 25, total: DEC.length, pages: 1, since: "2026-11-02", rows: DEC } } : null), mount: "decisions", props: {}, wait: '[data-testid="decision-row"]' },
  { name: "income-journal", entry: "money-v.entry.tsx", server: () => null, mount: "journal", props: { journal: JOURNAL, showVoided: false }, wait: '[data-testid="journal-row"]' },
  { name: "statement", entry: "ds.entry.tsx", server: () => null, mount: "statement", props: { statement: JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/pay2/e1_statement_790000.json"), "utf8")) }, wait: "li" },
];
module.exports = { SHOTS };
