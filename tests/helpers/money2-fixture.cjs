// Money-2 wave 1: the worst real case for the windows - a student in THREE groups with long names; the answers are in the shape of the contract of the server (MONEY2_TRANSFER_SPEC.md, «Контракт для экранов»).
const A = "Алгебра 7 класс, углублённая программа подготовки к олимпиаде (вторник и пятница, 16:00)";
const B = "Геометрия 8 класс для будущих инженеров и архитекторов";
const C = "Английский язык, разговорный клуб для школьников среднего уровня";
const T = "Физика 9 класс, подготовка к вступительным испытаниям в лицей";
const GROUPS = [
  { id: "ga", name: A, class_level: 7, status: "active", teacher_id: "t1", teacher_name: "Камол Эргашев", price_current: { amount: 500000, label: "x" } },
  { id: "gb", name: B, class_level: 8, status: "active", teacher_id: "t1", teacher_name: "Камол Эргашев", price_current: { amount: 360000, label: "x" } },
  { id: "gc", name: C, class_level: 8, status: "active", teacher_id: "t1", teacher_name: "Камол Эргашев", price_current: { amount: 300000, label: "x" } },
  { id: "gt", name: T, class_level: 9, status: "active", teacher_id: "t1", teacher_name: "Камол Эргашев", price_current: { amount: 400000, label: "x" } },
];
const SOURCES = [{ id: "ga", name: A }, { id: "gb", name: B }, { id: "gc", name: C }];
// the ordinary short names (the set by which the readability is judged); LONG is the set for the wraps only
const LONG = { A, B, C, T };
const SHORT = { A: "Алгебра 7", B: "Геометрия 8", C: "Английский 6", T: "Физика 9" };
const sourcesOf = (names) => [{ id: "ga", name: names.A }, { id: "gb", name: names.B }, { id: "gc", name: names.C }];
const SLOTS = {
  ga: [{ id: "s1", dayOfWeek: 2, startTime: "16:00", endTime: "17:00" }, { id: "s2", dayOfWeek: 5, startTime: "16:00", endTime: "17:00" }],
  gb: [{ id: "s3", dayOfWeek: 1, startTime: "16:00", endTime: "17:00", room: "Каб. 12" }, { id: "s4", dayOfWeek: 3, startTime: "17:30", endTime: "18:30", room: "Каб. 12" }],
  gc: [],
  gt: [{ id: "s5", dayOfWeek: 1, startTime: "16:00", endTime: "17:00", format: "online" }, { id: "s6", dayOfWeek: 3, startTime: "16:00", endTime: "17:00", format: "online" }, { id: "s7", dayOfWeek: 5, startTime: "16:00", endTime: "17:00", format: "online" }],
};
const groupsOf = (names) => GROUPS.map((group) => ({ ...group, name: names[{ ga: "A", gb: "B", gc: "C", gt: "T" }[group.id]], schedule: SLOTS[group.id] }));
const MEMBERS = [{ id: "t1", user_id: "t1", org_role: "teacher", first_name: "Эргашев", last_name: "К." }];

/** The common answers of the windows (the lists); `rest` answers the rest. */
function baseServer(rest, names = LONG) {
  return (request) => {
    if (request.method === "GET" && request.path === "/auth/org/groups") return { json: groupsOf(names) };
    if (request.method === "GET" && request.path === "/auth/org/members") return { json: MEMBERS };
    return rest(request);
  };
}

// Money-2 T3: the transfer of the student from «Алгебра…» to «Физика…»: money, a pause and «Оплата с» go along; a debt stays; an individual price and a planned price end.
const nbsp = (text) => text.replace(/(\d) (?=\d{3}(?!\d))/g, "$1\u00a0").replace(/(\d) (?=сум)/g, "$1\u00a0");
function transferEffects({ money = true, carried = 440000, packageText = null, names = LONG } = {}) {
  const { A, T } = names;
  const base = { membership_id: "m-a", group_id: "ga", group_name: A };
  const sum = (n) => (money ? { amount: n } : {});
  return {
    kind: "transfer",
    moves: [
      ...(money ? [{ ...base, code: "money", amount: carried, text: packageText ?? `Деньги ученика — ${nbsp(String(carried).replace(/\B(?=(\d{3})+$)/g, " "))} сум — переходят в группу «${T}»; аванс останется 40 000 сум` }] : []),
      { ...base, code: "pause", first_day: "2026-11-23", last_day: "2026-11-26", text: `Пауза 23.11–26.11 перейдёт в группу «${T}»: дни паузы там не начисляются` },
      { ...base, code: "billing_from", date: "2026-11-30", text: `«Оплата с 30.11.2026» перейдёт в группу «${T}»: начисление там начнётся с этого дня` },
    ],
    // one story: 480 000 paid in the source, 440 000 go with the student, 40 000 stay there as an advance (a group has a debt OR an advance, never both)
    stays: [{ ...base, code: "advance", ...sum(40000), text: money ? `Аванс 40\u00a0000\u00a0сум останется в группе «${A}»: вернуть его можно сейчас или позже в её выписке` : `В группе «${A}» останется аванс: вернуть его можно сейчас или позже в её выписке` }],
    ends: [
      { ...base, code: "individual_price", ...sum(300000), since: "2026-10-01", reason: money ? "договорённость" : null, text: money ? `Индивидуальная цена 300\u00a0000\u00a0сум в группе «${A}» закончится: в новой группе будет цена этой группы` : `Индивидуальная цена в группе «${A}» закончится: в новой группе будет цена этой группы` },
      { ...base, code: "scheduled_price", valid_from: "2026-12-01", ...sum(250000), text: `Запланированная с 01.12.2026 индивидуальная цена в группе «${A}» (${money ? "цена 250\u00a0000\u00a0сум" : "новая индивидуальная цена"}) будет отменена` },
    ],
    money_text: money ? `Деньги ученика — ${carried} сум — переходят в группу «${T}»` : null,
    texts: [],
  };
}

// Money-2 T3: the leaving / archiving of one stay of the student: a debt stays; an individual price, a planned price and a pause end.  `money` false: the same facts without a sum.
function leaveMembership(index, { money = true, kind = "leave", names = LONG } = {}) {
  const name = [names.A, names.B, names.C][index];
  const id = `m-${index}`;
  const base = { membership_id: id, group_id: ["ga", "gb", "gc"][index], group_name: name };
  const rub = (n) => `${String(n).replace(/\B(?=(\d{3})+$)/g, "\u00a0")}\u00a0сум`;
  return {
    membership_id: id, group_id: base.group_id, group_name: name,
    money: money ? { debt: 120000, advance: 0, refundable: 0, paid_until: null, charged_after_leave: 0, individual_price_ends: true } : null,
    has_open_balance: true, allowed: money ? ["keep", "writeoff"] : ["keep"],
    effects: {
      kind, moves: [], money_text: null, texts: [],
      stays: [{ ...base, code: "debt", ...(money ? { amount: 120000 } : {}), text: money ? `Долг ${rub(120000)} останется за учеником в группе «${name}»: принять или простить его можно в её выписке` : `В группе «${name}» останется долг: принять или простить его можно в её выписке` }],
      ends: [
        { ...base, code: "individual_price", ...(money ? { amount: 300000 } : {}), since: "2026-10-01", text: money ? `Индивидуальная цена ${rub(300000)} в группе «${name}» закончится: при возвращении ученик получит цену группы` : `Индивидуальная цена в группе «${name}» закончится: при возвращении ученик получит цену группы` },
        { ...base, code: "scheduled_price", valid_from: "2026-12-01", ...(money ? { amount: 250000 } : {}), text: `Запланированная с 01.12.2026 индивидуальная цена в группе «${name}» (${money ? `цена ${rub(250000)}` : "новая индивидуальная цена"}) будет отменена` },
        { ...base, code: "pause", first_day: "2026-11-23", last_day: "2026-11-26", text: `Пауза 23.11.2026–26.11.2026 в группе «${name}» закончится вместе с пребыванием ученика в ней` },
      ],
    },
  };
}

module.exports = { leaveMembership, transferEffects, A, B, C, T, GROUPS, SOURCES, MEMBERS, baseServer, LONG, SHORT, sourcesOf, groupsOf, SLOTS };

// Money-2 T7 / Э3: the statement of a student who left, with the worst real case - one cancelled payment that can be restored, one that was ALREADY restored (nothing to press), the restoration itself.
const MEMBERSHIP = "m-a";
function statementWithVoided(names = LONG) {
  const { A } = names;
  const details = (extra) => ({ segment: null, method: "cash", created_by_name: "Рустам Каримов", note: null, allocations: [], writeoff_id: null, refund_id: null, reason: null, from_group_name: null, from_membership_id: null, to_group_name: null, to_membership_id: null, replaces_receipt_no: null, replaces_amount: null, replaced_by_receipt_no: null, ...extra });
  const row = (seq, date, title, credit, extra, over = {}) => ({ seq, date, type: "payment", title, debit: 0, credit, outflow: 0, balance_after: 0, balance_text: "", voided_at: null, void_reason: null, voided_by_name: null, ...over, details: details(extra) });
  return {
    membership: { membership_id: MEMBERSHIP, student_id: "st1", student_name: "Каримов Фарход", display_id: "N13-004", group_id: "ga", group_name: A, teacher_name: "Камол Эргашев", is_active: false },
    as_of: "2026-11-16", mode: "calendar", accounting_start: "2026-01-01",
    summary: { charged: 200000, paid: 600000, transferred_in: 0, written_off: 0, refunded: 0, transferred_out: 0, debt: 0, advance: 400000, paid_until: null, status: "left", reconciles: true },
    rows: [row(2, "2026-11-22", "Оплата № 2", 600000, { payment_id: "p2", receipt_no: 2, replaces_receipt_no: 1 })],
    voided: [
      row(1, "2026-11-22", "Оплата № 1", 600000, { payment_id: "p1", receipt_no: 1, replaced_by_receipt_no: 2 }, { voided_at: "2026-11-23T08:00:00", void_reason: "Отменили по ошибке", voided_by_name: "Рустам Каримов" }),
      row(0, "2026-11-10", "Оплата № 3", 390000, { payment_id: "p3", receipt_no: 3 }, { voided_at: "2026-11-12T08:00:00", void_reason: "Дубль", voided_by_name: "Рустам Каримов" }),
    ],
    upcoming: [],
  };
}
const paymentsList = () => [
  { id: "p2", membership_id: MEMBERSHIP, amount: 600000, currency: "UZS", paid_on: "2026-11-22", method: "cash", kind: "payment", receipt_no: 2, restorable: false, replaced_by_receipt_no: null, restored_from_receipt_no: 1, voided_at: null, voided_by: null, voided_by_name: null, void_reason: null, created_by: null, created_by_name: null, created_at: null },
  { id: "p1", membership_id: MEMBERSHIP, amount: 600000, currency: "UZS", paid_on: "2026-11-22", method: "cash", kind: "payment", receipt_no: 1, restorable: false, replaced_by_receipt_no: 2, voided_at: "2026-11-23T08:00:00", voided_by: "u", voided_by_name: "Рустам Каримов", void_reason: "Отменили по ошибке", created_by: null, created_by_name: null, created_at: null },
  { id: "p3", membership_id: MEMBERSHIP, amount: 390000, currency: "UZS", paid_on: "2026-11-10", method: "cash", kind: "payment", receipt_no: 3, restorable: true, replaced_by_receipt_no: null, restored_from_receipt_no: null, voided_at: "2026-11-12T08:00:00", voided_by: "u", voided_by_name: "Рустам Каримов", void_reason: "Дубль", created_by: null, created_by_name: null, created_at: null },
];
module.exports.statementWithVoided = statementWithVoided;
module.exports.paymentsList = paymentsList;
module.exports.MEMBERSHIP = MEMBERSHIP;

// Money-2 Э7: the journal of decisions - the four new kinds, the worst case: long names of the groups, the same student, a payment restored the day it was cancelled.
function decisionsPage(names = LONG) {
  const { A, T } = names;
  const base = { student_id: "st1", student_name: "Каримов Фарход Абдуллаевич", actor_name: "Рустам Каримов", new_amount: null, debt_before: null, debt_after: null, consequence: null, reason: null, receipt_no: null, amount: 0, group_name: A };
  const rows = [
    { ...base, id: "d1", at: "2026-11-22T09:00:00", kind: "student_transferred", kind_label: "Ученик переведён: деньги перенесены в новую группу", amount: 440000, group_name: T, from_group_name: A, to_group_name: T, carried_pay_from: "2026-11-25", text: `Перевод из «${A}» в «${T}»: перенесено 440 000 сум; «Оплата с 25.11.2026» перенесена вместе с учеником` },
    { ...base, id: "d2", at: "2026-11-22T10:00:00", kind: "leave_undone", kind_label: "Уход отменён", restored: { individual_price: 1, scheduled_price: 1, pause: 2 }, text: "Ученик вернулся в день ухода: уход отменён, цены и паузы возвращены (3)" },
    { ...base, id: "d3", at: "2026-11-22T11:00:00", kind: "payment_restored", kind_label: "Оплата восстановлена", amount: 600000, receipt_no: 1, new_receipt_no: 2, paid_on: "2026-11-02", reason: "Отменили по ошибке", text: "Оплата № 1 на 600 000 сум от 22.11.2026 восстановлена как № 2" },
    { ...base, id: "d4", at: "2026-11-22T12:00:00", kind: "pause_moved", kind_label: "Пауза перенесена в новую группу", group_name: T, from_group_name: A, to_group_name: T, first_day: "2026-11-23", last_day: "2026-11-26", text: `Пауза 23.11.2026–26.11.2026 перенесена в группу «${T}» вместе с учеником` },
    { ...base, id: "d5", at: "2026-11-21T12:00:00", kind: "payment_void", kind_label: "Оплата отменена", amount: 600000, receipt_no: 1, reason: "Ошибка кассира", text: null },
    { ...base, id: "d6", at: "2026-11-20T12:00:00", kind: "payment_refund", kind_label: "Аванс возвращён", amount: 120000, paid_on: "2026-11-12", reason: "Ученик ушёл", text: null },
  ];
  return { as_of: "2026-11-22", from: "2026-11-01", to: "2026-11-30", page: 1, size: 25, total: rows.length, pages: 1, since: "2026-11-01", rows };
}
module.exports.decisionsPage = decisionsPage;
