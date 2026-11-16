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
const MEMBERS = [{ id: "t1", user_id: "t1", org_role: "teacher", first_name: "Эргашев", last_name: "К." }];

/** The common answers of the windows (the lists); `rest` answers the rest. */
function baseServer(rest) {
  return (request) => {
    if (request.method === "GET" && request.path === "/auth/org/groups") return { json: GROUPS };
    if (request.method === "GET" && request.path === "/auth/org/members") return { json: MEMBERS };
    return rest(request);
  };
}

// Money-2 T3: the transfer of the student from «Алгебра…» to «Физика…»: money, a pause and «Оплата с» go along; a debt stays; an individual price and a planned price end.
const nbsp = (text) => text.replace(/(\d) (?=\d{3}(?!\d))/g, "$1\u00a0").replace(/(\d) (?=сум)/g, "$1\u00a0");
function transferEffects({ money = true, carried = 440000 } = {}) {
  const base = { membership_id: "m-a", group_id: "ga", group_name: A };
  const sum = (n) => (money ? { amount: n } : {});
  return {
    kind: "transfer",
    moves: [
      ...(money ? [{ ...base, code: "money", amount: carried, text: `Деньги ученика — ${nbsp(String(carried).replace(/\B(?=(\d{3})+$)/g, " "))} сум — переходят в группу «${T}»; аванс останется 40 000 сум` }] : []),
      { ...base, code: "pause", first_day: "2026-11-23", last_day: "2026-11-26", text: `Пауза 23.11–26.11 перейдёт в группу «${T}»: дни паузы там не начисляются` },
      { ...base, code: "billing_from", date: "2026-11-30", text: `«Оплата с 30.11.2026» перейдёт в группу «${T}»: начисление там начнётся с этого дня` },
    ],
    stays: [{ ...base, code: "debt", ...sum(120000), text: money ? `Долг 120\u00a0000\u00a0сум останется за учеником в группе «${A}»: принять или простить его можно в её выписке` : `В группе «${A}» останется долг: принять или простить его можно в её выписке` }],
    ends: [
      { ...base, code: "individual_price", ...sum(300000), since: "2026-10-01", reason: money ? "договорённость" : null, text: money ? `Индивидуальная цена 300\u00a0000\u00a0сум в группе «${A}» закончится: в новой группе будет цена этой группы` : `Индивидуальная цена в группе «${A}» закончится: в новой группе будет цена этой группы` },
      { ...base, code: "scheduled_price", valid_from: "2026-12-01", ...sum(250000), text: `Запланированная с 01.12.2026 индивидуальная цена в группе «${A}» (${money ? "цена 250\u00a0000\u00a0сум" : "новая индивидуальная цена"}) будет отменена` },
    ],
    money_text: money ? `Деньги ученика — ${carried} сум — переходят в группу «${T}»` : null,
    texts: [],
  };
}

module.exports = { transferEffects, A, B, C, T, GROUPS, SOURCES, MEMBERS, baseServer };
