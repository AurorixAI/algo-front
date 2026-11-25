// Money-2 fix 10Д: the answers of the server for the drawer «Зачислить учеников» (the dry run of a bulk add always carries `billing.immediate` - the default day is today) and the students of the owner's picture.
const X = require("./money2-fix7.cjs");
const { dueLines } = require("./enrol-words.cjs");

const PART = (label, from, amount, lessons, inPeriod, whole = false) => ({ label, from, amount, lessons, lessons_in_period: inPeriod, whole });
const NOV = [PART("ноябрь", "2026-11-19", 188000, 5, 12)];
const DEBT_SAME = { group_id: "g2", group_name: "M11 БС Вт-Чт-Сб", membership_id: "m-same", left_on: "2026-11-19", kind: "debt", amount: 15000, same_group: true, text: "В этой группе с прошлого раза остался долг 15 000 сум" };
const ADVANCE_OTHER = { group_id: "g9", group_name: "Физика 9", membership_id: "m-other", left_on: "2026-11-17", kind: "advance", amount: 40000, same_group: false, text: "В группе «Физика 9» остался аванс 40 000 сум" };
const REWRITE = "Ученика убрали сегодня, но после этого ему простили долг 15 000 сум — поэтому уход не отменяется, ученик зачисляется обычным порядком: прежние индивидуальная цена и паузы не возвращаются.";
const UNDO = "Ученика убрали сегодня — возвращаем как было: индивидуальная цена 300 000 сум.";
const sumOf = (parts) => parts.reduce((s, p) => s + p.amount, 0);
const nameOf = ([, last, first = "Ученик"]) => `${last} ${first}`;

/**
 * people: [[id, last, first]]; immediate: id -> parts | null; past: id -> rows; ordinary / undone: ids.
 * The pay-from default is today (19.11); a chosen day is echoed back; the bulk dry run answers `immediate` for every student that has parts.
 */
function server({ people, immediate = {}, past = {}, ordinary = [], undone = [], today = "2026-11-19" } = {}) {
  const base = X.drawerServer(undone, (r) => {
    if (r.method === "GET" && r.path === "/auth/org/students") return { json: { items: people.map(([id, last, first]) => X.STUDENT(id, last, first)), total: people.length } };
    if (r.method === "GET" && r.path === "/auth/org/groups/g2/pay-from-default") return { json: { today, first_lesson: today, default_pay_from: today, text: `Оплата с 19.11.2026 — сегодня у группы занятие` } };
    if (r.method === "POST" && /\/students\/bulk$/.test(r.path) && X.isDry(r)) {
      const ids = r.body.student_ids;
      const from = r.body.pay_from || today;
      const billing = (id) => (immediate[id] ? { pay_from: from, explicit: Boolean(r.body.pay_from), default_pay_from: today, first_lesson: today, text: "Оплата с выбранного дня", immediate: { amount: sumOf(immediate[id]), lessons: 5, ...(() => { const lines = dueLines(sumOf(immediate[id]), 5); return { text: lines.join("\n"), lines }; })(), parts: immediate[id] } } : null);
      const payers = ids.filter((id) => immediate[id]);
      const totalLines = payers.length === 0 ? null : dueLines(payers.reduce((s, id) => s + sumOf(immediate[id]), 0), 5 * payers.length, { total: true });
      return { json: { group_id: "g2", added: ids.length, skipped: 0, skipped_details: [], warnings: [], dry_run: true, immediate_total: totalLines && { amount: payers.reduce((s, id) => s + sumOf(immediate[id]), 0), lessons: 5 * payers.length, students: payers.length, text: totalLines.join("\n"), lines: totalLines }, students: ids.map((id) => ({ student_id: id, group_id: "g2", status: "added", billing: billing(id), past_balances: past[id] || [], leave_undo: undone.includes(id) ? X.undoOf(true, UNDO) : ordinary.includes(id) ? { undone: false, text: REWRITE, restored: [] } : null })) } };
    }
    return null;
  }, false, {});
  return base;
}
module.exports = { X, PART, NOV, DEBT_SAME, ADVANCE_OTHER, REWRITE, UNDO, sumOf, nameOf, server };
