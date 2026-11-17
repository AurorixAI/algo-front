// Money-2 fix 7: the page of a group with a roster (`money-b.entry.tsx` -> `groupHeader`), the tab «Ученики», for the «⋯» of a row on a phone.
const X = require("./money-b-fixture.cjs");
const STUDENTS = [1, 2, 3].map((n) => ({ id: `st${n}`, first_name: "Ученик", last_name: `Номер${n}`, full_name: `Номер${n} Ученик`, class_level: 7, status: "active", display_id: `A-10${n}`, student_phone: "+998901234567", joined_at: "2026-10-01T08:00:00", group_id: "g1" }));
const GROUP = { id: "g1", name: "7-А Алгебра", status: "active", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", max_students: 30, student_count: STUDENTS.length, students: STUDENTS, price_current: { amount: 300000 }, lesson_type: "group", schedule: [] };
function groupServer(request) {
  if (request.path === "/auth/org/groups/g1") return { json: GROUP };
  if (request.path === "/auth/org/payments/summary") return { json: X.SUMMARY };
  if (request.path === "/auth/org/payments/status") return { json: { items: [], total: 0 } };
  return null;
}
module.exports = { groupServer, GROUP, STUDENTS };
