// PAY-DUE 16А (frames 17 and 18 of the layout): the answers of the server for the windows of enrolment, leaving, the archive of a student and the archive of a group, the words are the server's
// (`payments_texts.py`, `leave_effects.py`, `group_lifecycle.py`); the screen shows them as they are.  One place for the DOM test and for the snapshots.
const F = require("./money2-fixture.cjs");
const { dueLines, money } = require("./enrol-words.cjs");

const NB = " ";
const LONG_NAME = "Мухаммаджонова Фарангиз Абдурахмоновна-Каримова";
const LONG_GROUP = "Подготовка к олимпиаде по математике, 7 класс (углублённый курс по понедельникам, средам и пятницам)";

/** The leave preview of one membership: `stays` is the sentence of the server by the state AFTER the leaving (leave_effects.debt_text / due_text). */
function leaveRow({ group = "Математика 7", amount = 231000, stay, becomes = 0, dueUntil = null, id = "m-a", groupId = "ga", money: withMoney = true }) {
  const base = { membership_id: id, group_id: groupId, group_name: group };
  return {
    membership_id: id, group_id: groupId, group_name: group,
    money: withMoney ? { debt: amount, debt_amount: becomes ? amount : (dueUntil ? 0 : amount), due_amount: dueUntil ? amount : 0, due_until: dueUntil, becomes_debt: becomes, advance: 0, refundable: 0, paid_until: null, charged_after_leave: amount, individual_price_ends: false } : null,
    has_open_balance: true, allowed: withMoney ? ["keep", "writeoff"] : ["keep"],
    effects: { kind: "leave", moves: [], money_text: null, texts: [], ends: [], stays: [{ ...base, code: dueUntil && !becomes ? "due" : "debt", ...(withMoney ? { amount } : {}), text: stay }] },
  };
}
const ONLY_GROUP = (group = "Математика 7", amount = 231000) => leaveRow({ group, amount, becomes: amount, stay: `К оплате ${money(amount)}. Это единственная группа ученика: после ухода сумма станет долгом` });
const OTHER_GROUP_LEFT = (group = "Математика 7", amount = 231000) => leaveRow({ group, amount, dueUntil: "2026-11-24", stay: `К оплате ${money(amount)} до 24.11, срок не меняется: оплатить или простить сумму можно в выписке группы «${group}»` });
const ARCHIVE_ROW = (group, amount, id, groupId) => leaveRow({ group, amount, becomes: amount, id, groupId, stay: `Ученик уходит из центра: вся неоплаченная сумма ${money(amount)} в группе «${group}» станет долгом` });

/** `OPEN_BALANCES` of the archive of a group (group_lifecycle.py): the rows, and the two sentences of the decision 3 - each only when its number is not zero. */
function archiveImpact(rows, texts) {
  return { groupId: "gz", groupName: "Математика 7", status: "active", canArchive: false, examService: "ok", blockers: [{ code: "OPEN_BALANCES", count: rows.length, balances: rows, texts }], autoActions: [], warnings: [] };
}
const BALANCES = [
  { student_id: "s1", membership_id: "m1", name: "Иванов Али", left_on: "2026-11-20", kind: "debt", amount: 190000, text: `Иванов Али: долг ${money(190000)} — принять оплату или простить его можно в выписке группы`, actions: [{ code: "payment", label: "Принять оплату" }, { code: "writeoff", label: `Простить ${money(190000)}` }] },
  { student_id: "s2", membership_id: "m2", name: "Саидова Мадина", left_on: null, kind: "due", amount: 231000, text: `Саидова Мадина: к оплате ${money(231000)} до 24.11 — принять оплату или простить сумму можно в выписке группы`, actions: [{ code: "payment", label: "Принять оплату" }, { code: "writeoff", label: `Простить ${money(231000)}` }] },
];
const ARCHIVE_TEXTS = [`У 1 ученика осталась неоплаченная сумма ${money(190000)} — это долг`, `У 1 ученика это последняя группа: неоплаченная сумма ${money(231000)} станет долгом`];

module.exports = { NB, LONG_NAME, LONG_GROUP, leaveRow, ONLY_GROUP, OTHER_GROUP_LEFT, ARCHIVE_ROW, archiveImpact, BALANCES, ARCHIVE_TEXTS, dueLines, money, F };
