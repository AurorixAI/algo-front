// PAY-TAILS, screens part 2: the answers of the server by the CONTRACT of package Б (artifacts/analysis/PAY_TAILS_SPEC.md, Б1.3-Б1.5 + Б5.1-Б5.5), with the data of the layout (artifacts/design-paytails/index.html, frames 6-19).
// The server does not send these fields yet: THIS file is the stub (the only one for part 2); the screens read them through `src/lib/paytails-contract.ts`.  Today is Saturday 21.11.2026.
const P3 = require("./paydue-part3.cjs");
const { money } = P3;

const RECALC_NOV = { label: "Ноябрь", before: 600000, after: 415000, basis_text: "пересчёт по день ухода · 9 уроков из 13", text: "Ноябрь: 600 000 → 415 000 сум" };

/** Frame 6: Лола (a debt) leaves «Математика 7»: the month 600 000 → 415 000, a debt 415 000 stays. */
const LEAVE_DEBT = (over = {}) => ({
  ...P3.leaveRow({ group: "Математика 7", amount: 415000, becomes: 415000, stay: `Останется долг ${money(415000)}` }),
  recalc: [RECALC_NOV],
  ...over,
});
/** Frame 7: Мадина paid the whole month: an advance 185 000 stays; it can be given back. */
const LEAVE_ADVANCE = (over = {}) => ({
  membership_id: "m-a", group_id: "ga", group_name: "Математика 7",
  money: { unpaid: 0, debt_amount: 0, due_amount: 0, due_until: null, becomes_debt: 0, advance: 185000, refundable: 185000, paid_until: null, charged_after_leave: 415000, individual_price_ends: false },
  has_open_balance: true, allowed: ["keep", "refund"],
  effects: { kind: "leave", moves: [], money_text: null, texts: [], ends: [], stays: [{ membership_id: "m-a", group_id: "ga", group_name: "Математика 7", code: "advance", amount: 185000, text: `Останется аванс ${money(185000)}` }] },
  recalc: [RECALC_NOV],
  ...over,
});
/** Frame 9: Нодир is also in «Английский 7» (today's lesson was paid in «Математика 7»): the sentence about the second group says the MONEY (Б5.2). */
const OTHERS_9 = `В группе «Английский 7»: ${money(200000)} → ${money(160000)} — сегодняшний урок оплачен в «Математике 7»`;
/** A sum «к оплате» that stays within its term (another group remains): not a debt. */
const LEAVE_DUE = (over = {}) => ({
  ...P3.OTHER_GROUP_LEFT("Математика 7", 125000),
  recalc: [{ ...RECALC_NOV, before: 600000, after: 125000, text: "Ноябрь: 600 000 → 125 000 сум" }],
  ...over,
});
/** Two lines + the tail: the server cuts at two. */
const RECALC_CUT = { lines: [RECALC_NOV, { label: "Декабрь", before: null, after: null, basis_text: null, text: `Декабрь не начнётся: ${money(300000)} останутся авансом` }], more: 2 };

const LEAVE_RESULT_DEBT = { message: "ok", settled: [], effects: { kind: "leave", moves: [], texts: [], ends: [], stays: [{ code: "debt", amount: 415000, text: `Долг ${money(415000)} остался за учеником` }] }, recalc: [{ ...RECALC_NOV }] };
const STALE_409 = { status: 409, json: { detail: { code: "BALANCE_CHANGED", message: "Сумма изменилась, откройте окно заново", fresh: [] } } };

/** The server of the leave window: the preview of `memberships`, the POST answered by `post`. */
const leaveServer = (memberships, post = () => ({ json: LEAVE_RESULT_DEBT }), as_of = "2026-11-21") => (r) => {
  if (r.method === "GET" && r.path === "/auth/org/groups/ga/students/st1/leave-preview") return { json: { as_of, memberships } };
  if (r.method === "POST" && r.path === "/auth/org/groups/ga/students/st1/leave") return post(r);
  return null;
};
const archiveServer = (memberships, post = () => ({ json: { id: "st1", status: "archived", closed_groups: [], settled: [], ...LEAVE_RESULT_DEBT } }), as_of = "2026-11-21") => (r) => {
  if (r.method === "GET" && r.path === "/auth/org/students/st1/archive-preview") return { json: { as_of, memberships } };
  if (r.method === "POST" && r.path === "/auth/org/students/st1/archive") return post(r);
  return null;
};

module.exports = { ...P3, RECALC_NOV, LEAVE_DEBT, LEAVE_ADVANCE, LEAVE_DUE, OTHERS_9, RECALC_CUT, LEAVE_RESULT_DEBT, STALE_409, leaveServer, archiveServer };
