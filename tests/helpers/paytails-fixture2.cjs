// PAY-TAILS, screens part 2: the answers of the server by the CONTRACT of package Б (artifacts/analysis/PAY_TAILS_SPEC.md, Б1.3-Б1.5 + Б5.1-Б5.5), with the data of the layout (artifacts/design-paytails/index.html, frames 6-19).
// The server does not send these fields yet: THIS file is the stub (the only one for part 2); the screens read them through `src/lib/paytails-contract.ts`.  Today is Saturday 21.11.2026.
const P3 = require("./paydue-part3.cjs");
const { money, F } = P3;

/** `recalc` of the server is ALWAYS `{lines, more}` (`more` 0: all shown). */
const recalcBlock = (lines, more = 0) => ({ lines, more });
const RECALC_NOV = { label: "Ноябрь", before: 600000, after: 415000, basis_text: "пересчёт по день ухода · 9 уроков из 13", text: "Ноябрь: 600 000 → 415 000 сум" };

/** Frame 6: Лола (a debt) leaves «Математика 7»: the month 600 000 → 415 000, a debt 415 000 stays. */
const LEAVE_DEBT = (over = {}) => ({
  ...P3.leaveRow({ group: "Математика 7", amount: 415000, becomes: 415000, stay: `Останется долг ${money(415000)}` }),
  recalc: recalcBlock([RECALC_NOV]),
  ...over,
});
/** Frame 7: Мадина paid the whole month: an advance 185 000 stays; it can be given back. */
const LEAVE_ADVANCE = (over = {}) => ({
  membership_id: "m-a", group_id: "ga", group_name: "Математика 7",
  money: { unpaid: 0, debt_amount: 0, due_amount: 0, due_until: null, becomes_debt: 0, advance: 185000, paid_until: null, charged_after_leave: 415000, individual_price_ends: false },
  has_open_balance: true, allowed: ["keep", "refund"],
  effects: { kind: "leave", moves: [], money_text: null, texts: [], ends: [], stays: [{ membership_id: "m-a", group_id: "ga", group_name: "Математика 7", code: "advance", amount: 185000, text: `Останется аванс ${money(185000)}` }] },
  recalc: recalcBlock([RECALC_NOV]),
  ...over,
});
/** Frame 9: Нодир is also in «Английский 7» (today's lesson was paid in «Математика 7»): the sentence about the second group says the MONEY (Б5.2). */
const OTHERS_9 = `В группе «Английский 7»: ${money(200000)} → ${money(160000)} — сегодняшний урок оплачен в «Математике 7»`;
/** A sum «к оплате» that stays within its term (another group remains): not a debt. */
const LEAVE_DUE = (over = {}) => ({
  ...P3.OTHER_GROUP_LEFT("Математика 7", 125000),
  recalc: recalcBlock([{ ...RECALC_NOV, before: 600000, after: 125000, text: "Ноябрь: 600 000 → 125 000 сум" }]),
  ...over,
});
/** Two periods + the tail + the line of the forgiveness that falls with them (it goes above the two, after «и ещё N периодов»). */
const RECALC_CUT = { lines: [RECALC_NOV, { label: "Декабрь", before: null, after: null, basis_text: null, text: `Декабрь не начнётся: ${money(300000)} останутся авансом` }, { label: "Прощено", before: 600000, after: 415000, basis_text: null, text: `Прощено: 600 000 → ${money(415000)}` }], more: 2 };

const LEAVE_RESULT_DEBT = { message: "ok", settled: [], effects: { kind: "leave", moves: [], texts: [], ends: [], stays: [{ code: "debt", amount: 415000, text: `Долг ${money(415000)} остался за учеником` }] }, recalc: recalcBlock([{ ...RECALC_NOV }]) };
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

// ── Б1.4 / Б2.5: the charge that STARTS LATER (frames 10, 14, 15) ───────────────────────────────────────
const UPCOMING_10 = { from: "2026-11-24", amount: 120000, lessons_text: "2 урока из 8 в ноябре", due_until: "2026-11-28", text: `Начисление с 24.11: ${money(120000)}`, sub: "платить до 28.11", terms_note: null };
const UPCOMING_14 = { from: "2026-11-23", amount: 160000, lessons_text: "4 урока из 13 в ноябре", due_until: "2026-11-27", text: `Начисление с 23.11: ${money(160000)}`, sub: "платить до 27.11", terms_note: "сегодня ученик ещё числился в «Математике 7»" };
/** The single window (money2 entry, `assign`): the probe of adding «Физика 9» answers `billing` of a charge that starts on `payFrom` with `upcoming`; the write answers the same with the sentence of the message. */
const enrolServer = ({ upcoming = UPCOMING_10, payFrom = "2026-11-24", today = "2026-11-21" } = {}) => F.baseServer((r) => {
  if (r.method === "GET" && r.path === "/auth/org/groups/gt/pay-from-default") return { json: { today, first_lesson: payFrom, default_pay_from: payFrom, text: `Оплата с ${payFrom.slice(8, 10)}.${payFrom.slice(5, 7)}.${payFrom.slice(0, 4)} — ближайшее занятие группы` } };
  if (r.method === "POST" && r.path === "/auth/org/groups/gt/students/st1") {
    const dry = /dry_run=true/.test(r.query);
    return { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: dry, billing: { pay_from: payFrom, explicit: false, default_pay_from: payFrom, first_lesson: payFrom, text: "Оплата с", immediate: null, upcoming } } };
  }
  return null;
}, F.SHORT);

// ── Б1.5 / Б5.4: the words of a state (frames 0, 11, 13, 15, 16, 17) ──────────────────────────────────
const PF = require("./paytails-fixture.cjs");
const row = (id, name, over) => PF.withId(PF.base({ membership_id: `m-${id}`, student_id: `s-${id}`, student_name: name, group_name: "Математика 7", ...over }));
const SARDOR = row("sardor", "Сардор Алиев", { group_id: "g9", group_name: "Физика 7", state: "starts", state_text: "Начнётся 24.11", state_sub: `≈ ${money(120000)}`, upcoming: UPCOMING_10_ROW() });
const TIMUR_PACK = row("timur", "Тимур Саидов", { state: "starts", state_text: "Уроков ещё не было", state_sub: `${money(50000)} за урок · без оплаты 2 урока` });
const ZARINA = row("zarina", "Зарина Умарова", { state: "paid", state_text: "Прощено до 30.11", state_sub: null, covered_by: "forgiven", paid_until: "2026-11-30" });
const BEKZOD = row("bekzod", "Бекзод Тошев", { state: "paid", state_text: "Оплачено до 30.11", state_sub: `из них прощено ${money(300000)}`, covered_by: "money", paid_until: "2026-11-30" });
const MADINA2 = row("madina", "Мадина Турсунова", { state: "paid", state_text: "Оплачено до 30.11", state_sub: null, covered_by: "money", paid_until: "2026-11-30" });
function UPCOMING_10_ROW() { return UPCOMING_10; }
const WORD_ROWS = [SARDOR, MADINA2, BEKZOD, ZARINA];

/** The statements of frames 12, 16, 17, 18 (the shape of `GET /org/memberships/{id}/statement`). */
const statementOf = ({ name, group, summary, rows = [], forecast = null }) => ({
  membership: { membership_id: "m-a", student_id: "st1", student_name: name, display_id: PF.idOf(name), group_id: "ga", group_name: group, teacher_name: null, is_active: !/ушёл/.test(JSON.stringify(summary)) },
  as_of: "2026-11-21", mode: "calendar", accounting_start: "2026-01-01",
  summary: { charged: 0, paid: 0, transferred_in: 0, written_off: 0, refunded: 0, transferred_out: 0, unpaid: 0, advance: 0, status: "paid", reconciles: true, ...summary },
  rows, voided: [], upcoming: [], ...(forecast ? { forecast } : {}),
});
const FORECAST_12 = { date: "2026-11-24", title: "Ноябрь 2026 — неполный месяц (с 24.11, 2 урока из 8)", sub: `прогноз: начислится ${money(120000)}` };
const STATEMENTS = {
  f12: statementOf({ name: "Сардор Алиев", group: "Физика 7 Вт-Чт", summary: { state: "starts", state_text: "Начнётся 24.11", state_sub: "платить до 28.11" }, forecast: FORECAST_12 }),
  f16: statementOf({ name: "Зарина Умарова", group: "Математика 7 Пн-Ср-Пт", summary: { charged: 600000, written_off: 600000, state: "paid", state_text: "Прощено до 30.11", covered_by: "forgiven" } }),
  f17: statementOf({ name: "Бекзод Тошев", group: "Математика 7 Пн-Ср-Пт", summary: { charged: 600000, paid: 300000, written_off: 300000, state: "paid", state_text: "Оплачено до 30.11", covered_by: "money" } }),
  f18a: statementOf({ name: "Фарход Юнусов", group: "Математика 7 · ушёл 20.11", summary: { charged: 415000, paid: 415000, status: "left", state: "settled", state_text: "Расчёт закрыт" } }),
  f18b: statementOf({ name: "Малика Рахимова", group: "Математика 7 · ушёл 20.11", summary: { charged: 415000, paid: 290000, written_off: 125000, status: "left", state: "settled", state_text: "Расчёт закрыт" } }),
  f18c: statementOf({ name: "Игорь Ли", group: "Математика 7 · записан и убран 19.11, урока не было", summary: { status: "left", state: "no_charges", state_text: "Расчётов нет" } }),
  f5: statementOf({
    name: "Нигора Азимова", group: "Математика 7 Пн-Ср-Пт · ушёл 20.11",
    summary: { charged: 415000, paid: 380000, written_off: 35000, status: "left", state: "settled", state_text: "Расчёт закрыт" },
    rows: [
      { seq: 1, date: "2026-11-02", type: "charge", title: "Ноябрь 2026 — неполный месяц (по 20.11, 9 уроков из 13)", debit: 415000, credit: 0, outflow: 0, open_sub: "срок был 06.11", details: {} },
      { seq: 2, date: "2026-11-05", type: "payment", title: "Оплата № 171", debit: 0, credit: 380000, outflow: 0, details: { receipt_no: 171, method: "cash", allocations: [] } },
      { seq: 3, date: "2026-11-18", type: "writeoff", title: "Прощено 220 000 сум — причина: семейные обстоятельства", debit: 0, credit: 35000, outflow: 0, text: "использовано 35 000 сум", details: { reason: "семейные обстоятельства" } },
    ],
  }),
};

module.exports = { recalcBlock, SARDOR, TIMUR_PACK, ZARINA, BEKZOD, MADINA2, WORD_ROWS, STATEMENTS, FORECAST_12, UPCOMING_10, UPCOMING_14, enrolServer, ...P3, RECALC_NOV, LEAVE_DEBT, LEAVE_ADVANCE, LEAVE_DUE, OTHERS_9, RECALC_CUT, LEAVE_RESULT_DEBT, STALE_409, leaveServer, archiveServer };
