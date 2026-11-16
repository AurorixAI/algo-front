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

module.exports = { A, B, C, T, GROUPS, SOURCES, MEMBERS, baseServer };
