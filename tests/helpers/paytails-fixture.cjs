// PAY-TAILS, screens part 1: the answers of the server by the CONTRACT of package Б (artifacts/analysis/PAY_TAILS_SPEC.md, Б1.1 and Б1.2), with the data of the layout (artifacts/design-paytails/index.html, frames 1-4, 20-23).
// The server does not send these fields yet: THIS file is the stub (the only one), the screens read them through `src/lib/paytails.ts`.  Today is Saturday 21.11.2026.
//   Advance: four students of «Математика 4» left on 28.10 with 37 000 each (closed memberships), Анвар Каримов (open, «Математика 7») paid ahead 600 000 → 4 × 37 000 + 600 000 = 748 000 сум, 5 students, 4 of them left.
//   Group «Математика 7» (open: Лола - debt, Анвар - advance, Мадина - paid; closed: Феруза - debt 415 000, Дилшод - due 92 000, Камола - advance 85 000).
const X = require("./paydue-fixture.cjs");

const NB = " ";
const money = X.money;

const closed = (id, name, group, over) => X.base({
  membership_id: `m-${id}`, student_id: `s-${id}`, student_name: name, group_id: group.id, group_name: group.name, is_active: false, left_on: "2026-10-28", ...over,
});
const M4 = { id: "g4", name: "Математика 4" };
const M7 = { id: "g1", name: "Математика 7" };

const adv = (id, name, left = "28.10") => closed(id, name, M4, {
  advance: 37000, state: "paid", state_text: `Аванс ${money(37000)}`, state_sub: `ушёл ${left}`, tab_text: `Аванс ${money(37000)}`, tab_sub: `ушёл ${left}`, class_level: 4,
});
const YAHYO = adv("yahyo", "Яхё Саидов");
const ALINA = adv("alina", "Алина Ким");
const ELDOR = adv("eldor", "Эльдор Рахимов");
const AMIR = adv("amir", "Амир Назаров");
/** Open, paid ahead for the next month: «Аванс 600 000 сум · оплачено до 31.12». */
const ANVAR_ADV = X.base({
  membership_id: "m-anvar-adv", student_id: "s-anvar", student_name: "Анвар Каримов", advance: 600000, state: "paid", state_text: "Оплачено до 31.12", state_sub: null, tab_text: `Аванс ${money(600000)}`, tab_sub: "оплачено до 31.12", paid_until: "2026-12-31",
});

const ADVANCE_ALL = [YAHYO, ALINA, ELDOR, AMIR, ANVAR_ADV];
const ADVANCE_LEFT = [YAHYO, ALINA, ELDOR, AMIR];

/** Frame 2b: the summary with the contract of Б1.1 (`buckets.advance`, `advance_left_students`, `advance_text`). */
const SUMMARY = {
  ...X.SUMMARY, advance_total: 748000, students_with_advance: 5, advance_left_students: 4, advance_text: "5 учеников · из них 4 ушли",
  buckets: { ...X.SUMMARY.buckets, advance: 5 }, price_missing: 5,
};
const SUMMARY_NOBODY = { ...SUMMARY, advance_total: 0, students_with_advance: 0, advance_left_students: 0, advance_text: "", buckets: { ...SUMMARY.buckets, advance: 0 } };

// Group «Математика 7» (frame 4)
const grp = (id, name, over) => X.base({ membership_id: `m-${id}`, student_id: `s-${id}`, student_name: name, ...over });
const LOLA = X.LOLA;
const MADINA = X.MADINA;
const FERUZA = closed("feruza", "Феруза Орипова", M7, {
  left_on: "2026-11-20", unpaid: 415000, debt: 415000, debt_amount: 415000, overdue_days: 14, state: "debt", state_text: `Долг ${money(415000)}`, debt_text: `Долг ${money(415000)}`, debt_sub: "ушёл 20.11 · просрочено 14 дней",
});
const DILSHOD = closed("dilshod", "Дилшод Эрматов", M7, {
  left_on: "2026-11-20", unpaid: 92000, debt: 92000, due_amount: 92000, due_until: "2026-11-22", state: "to_pay", state_text: `К оплате ${money(92000)}`, due_text: `К оплате ${money(92000)}`, due_sub: "ушёл 20.11 · до 22.11",
});
const KAMOLA = closed("kamola", "Камола Эшонова", M7, {
  left_on: "2026-11-20", advance: 85000, state: "paid", state_text: `Аванс ${money(85000)}`, state_sub: "ушёл 20.11", tab_text: `Аванс ${money(85000)}`, tab_sub: "ушёл 20.11",
});
const SETTLED_NONE = closed("nodue", "Расчётов Нет", M7, { left_on: "2026-11-20", state: "paid", state_text: null });

// Every student of the stub has an ID of the centre («AL-014»), as the real data: the lists show it under the name (frames 1-4, 20-23).
const idOf = (studentId) => `AL-${String([...String(studentId)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 900, 7) + 100).padStart(3, "0")}`;
const withId = (r) => (r && typeof r === "object" && !Array.isArray(r) && r.student_id && !r.display_id ? { ...r, display_id: idOf(r.student_id) } : r);
/** A page of `GET /org/payments/status` for the stub: `own` answers the buckets of the layout, the rest falls to the fixture of PAY-DUE. */
const page = (items, over = {}) => ({ items: items.map(withId), total: items.length, students: new Set(items.map((r) => r.student_id)).size, amount_total: 0, limit: 50, offset: 0, as_of: "2026-11-21", ...over });

/** The status of the centre: the tab «Аванс» with its filter «Ушедшие» (`left_only=true`) and the numbers of the contract. */
const statusOf = (query, { advance = ADVANCE_ALL } = {}) => {
  const params = new URLSearchParams(query);
  if (params.get("bucket") === "advance") {
    const left = params.get("left_only") === "true";
    const items = left ? advance.filter((r) => !r.is_active) : advance;
    const cut = items.slice(Number(params.get("offset") || 0), Number(params.get("offset") || 0) + Number(params.get("limit") || 50));
    return page(cut, { total: items.length, students: items.length, left_students: advance.filter((r) => !r.is_active).length, amount_total: items.reduce((sum, r) => sum + (r.advance || 0), 0) });
  }
  const answer = X.statusPage(query);
  return { ...answer, items: (answer.items || []).map(withId) };
};

/** The status of the group «Математика 7» by bucket. */
const groupStatus = (query) => {
  const params = new URLSearchParams(query);
  const bucket = params.get("bucket");
  const limit = Number(params.get("limit") || 50);
  const open = [LOLA, ANVAR_ADV_G(), MADINA];
  // PAY-TAILS Б1.2: ONE request - the closed memberships with ANY settlement, picked and sorted by the server (debt, «к оплате», advance), the number is `left_count`
  if (bucket === "left_open") return page([FERUZA, DILSHOD, KAMOLA].slice(0, limit), { total: 3, students: 3, left_count: 3 });
  return page(open.slice(0, limit), { total: open.length, students: open.length, limit });
};
function ANVAR_ADV_G() { return { ...ANVAR_ADV, group_id: "g1", group_name: "Математика 7" }; }

const LONG_NAME = "Абдурахмонов Мухаммадюсуф Абдулазизович";
const LONG_GROUP = "Математика 7 углублённая (вечерняя), длинное название группы";
const BIG = money(12345678);
const longRow = (id, over = {}) => X.base({
  membership_id: `m-${id}`, student_id: `s-${id}`, student_name: LONG_NAME, group_name: LONG_GROUP, unpaid: 12345678, debt: 12345678, debt_amount: 12345678, overdue_days: 100, state: "debt",
  state_text: `Долг ${BIG}`, debt_text: `Долг ${BIG}`, debt_sub: "просрочено 100 дней · оплачено до 31.07", ...over,
});

module.exports = { ...X, NB, money, M4, M7, YAHYO: withId(YAHYO), ALINA: withId(ALINA), ELDOR: withId(ELDOR), AMIR: withId(AMIR), ANVAR_ADV: withId(ANVAR_ADV), ADVANCE_ALL: ADVANCE_ALL.map(withId), ADVANCE_LEFT: ADVANCE_LEFT.map(withId), SUMMARY, SUMMARY_NOBODY, FERUZA: withId(FERUZA), DILSHOD: withId(DILSHOD), KAMOLA: withId(KAMOLA), SETTLED_NONE, LOLA: withId(LOLA), MADINA: withId(MADINA), page, statusOf, groupStatus, LONG_NAME, LONG_GROUP, BIG, longRow: (...a) => withId(longRow(...a)), grp: (...a) => withId(grp(...a)), idOf, withId };
