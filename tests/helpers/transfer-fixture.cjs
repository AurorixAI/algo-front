// The transfer of a student with the numbers of the walk of stage 05.11 (UX pack №15): Фарход Каримов has 640 000 sum paid in «Алгебра 7», moves to «Геометрия 8» (360 000 per month):
// 280 000 go to the rest of the month, 360 000 stay as an advance.  The sentence is the server's own (`payments_texts`, `carry_after.text`).
const { OWNER_EFFECTS } = require("./dom-answers.cjs");

const SENTENCE = "Деньги ученика — 640 000 сум — переходят в группу «Геометрия 8»: сразу 280 000 сум пойдут на остаток месяца; аванс останется 360 000 сум.";
const GROUPS = [
  { id: "g1", name: "Алгебра 7 (вт/пт)", class_level: 7, status: "active", teacher_id: "t1", teacher_name: "Камол Эргашев", price_current: { amount: 500000, label: "x" } },
  { id: "g2", name: "Геометрия 8", class_level: 8, status: "active", teacher_id: "t1", teacher_name: "Камол Эргашев", price_current: { amount: 360000, label: "x" } },
];
const STUDENT = { id: "st1", first_name: "Фарход", last_name: "Каримов", full_name: "Каримов Фарход", class_level: 8, status: "active", group_id: "g1", current_group_id: "g1", groups_count: 1 };

/** The server of the window of a transfer: the single one (`/groups/g2/students/st1`) and the bulk one (`/groups/g2/students/bulk`); both dry runs carry the sentence and the salary effects (the window must NOT show them). */
function transferServer() {
  return (request) => {
    if (request.method === "GET" && request.path === "/auth/org/groups") return { json: GROUPS };
    if (request.method === "GET" && request.path === "/auth/org/members") return { json: [{ id: "t1", user_id: "t1", org_role: "teacher", first_name: "Эргашев", last_name: "К." }] };
    if (request.method === "GET" && request.path === "/auth/org/students") return { json: { items: [STUDENT], total: 1 } };
    const dry = /dry_run=true/.test(request.query);
    if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/st1" && dry) {
      return { json: { student_id: "st1", group_id: "g2", status: "added", dry_run: true, carried: [{ code: "transfer_balance_after", message: SENTENCE }], money_effects: OWNER_EFFECTS } };
    }
    if (request.method === "POST" && request.path === "/auth/org/groups/g2/students/bulk" && dry) {
      return { json: { group_id: "g2", dry_run: true, added: 1, skipped: 0, carried: [{ code: "transfer_balance_after", message: SENTENCE, student_id: "st1" }], money_effects: OWNER_EFFECTS } };
    }
    return null;
  };
}

module.exports = { SENTENCE, GROUPS, STUDENT, transferServer };
