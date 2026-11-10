// «Деньги-1 / В», front Ф2 - the owner's payroll: Н7 (one name of a teacher), the row of an advance of a removed teacher, «RATE_UNUSUAL», the payroll block of the removal window, the hint «начислить» on a phone.
// Contract: the server `money-v` (the answers carry `teacher_first_name` / `teacher_last_name`, `advance_only` / `carry_in` / `member_active`).
const assert = require("node:assert/strict");
const test = require("node:test");
const env = require("./helpers/money1-env.cjs");
const { React, html, textOf, lib, component } = env;
const P = lib("person-name.ts");
const R = lib("payroll.ts");

test("Н7 personName: the full «Имя Фамилия»; one part alone; no parts - the ready name as it is; nothing - «Преподаватель»", () => {
  assert.equal(P.personName({ first: "Камол", last: "Эргашев", ready: "Эргашев К." }), "Камол Эргашев");
  assert.equal(P.personName({ first: " Камол ", last: null, ready: "Эргашев К." }), "Камол");
  assert.equal(P.personName({ first: null, last: "Эргашев" }), "Эргашев");
  assert.equal(P.personName({ first: null, last: null, ready: "Эргашев К." }), "Эргашев К.");
  assert.equal(P.personName({ ready: "  " }), "Преподаватель");
  assert.equal(P.personName({}, "—"), "—");
});

test("Н7: the short name inside a sentence is the one the server declined (as it came), the full one is built only when it did not come", () => {
  assert.equal(P.personShortName({ first: "Камол", last: "Эргашев", ready: "Эргашева К." }), "Эргашева К.");
  assert.equal(P.personShortName({ first: "Камол", last: "Эргашев" }), "Камол Эргашев");
});

test("Н7: the row of the list and the title of the sheet name one person one way (whatever form `teacher_name` has)", () => {
  const parts = { teacher_first_name: "Камол", teacher_last_name: "Эргашев" };
  const row = { teacher_id: "t1", teacher_name: "Эргашев К.", ...parts };
  const sheet = { teacher_id: "t1", teacher_name: "Камол Эргашев", ...parts };
  const rate = { teacher_id: "t1", teacher_name: "Камол Эргашев", ...parts };
  assert.equal(P.teacherFullName(row), "Камол Эргашев");
  assert.equal(P.teacherFullName(row), P.teacherFullName(sheet));
  assert.equal(P.teacherFullName(row), P.teacherFullName(rate));
  assert.equal(P.teacherFullName({ teacher_name: null }), "Преподаватель");
  assert.equal(R.sheetFileName(P.teacherFullName(row), "2026-10"), "Зарплата_Камол_Эргашев_2026-10.xlsx");
});

// ── the row of an advance of a removed teacher ───────────────────────────────────────────

const advanceRow = (extra = {}) => ({
  teacher_id: "t9", teacher_name: "Эргашев К.", teacher_first_name: "Камол", teacher_last_name: "Эргашев", lessons_count: 0, lesson_types: [], rates: {}, missing_rates: [],
  sheet: null, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 }, payout: null, advance_only: true, carry_in: 500000, member_active: false, ...extra,
});
const sheeted = (id, total, balance, paid) => ({
  teacher_id: id, teacher_name: `Учитель ${id}`, lessons_count: 4, lesson_types: [], rates: { group: "50" }, missing_rates: [],
  sheet: { id: `s-${id}`, revision: 1, total_amount: total, stale: false, updated_at: null }, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 },
  payout: { basis: "saved", saved_total: total, fresh_total: null, paid, balance, changed_by: null },
});

test("an advance row: «—» · «—» · «вперёд 500 000», chip «Аванс» (not «Требует действия»), «Удалён из центра», one quiet line, no button, no «Рассчитать»", () => {
  const { TeacherRow } = component("payroll/payroll-month-page.tsx");
  const markup = html(React.createElement(TeacherRow, { teacher: { ...advanceRow(), teacher_name: P.teacherFullName(advanceRow()) }, month: "2026-11", busy: false, onCalculate() {}, onOpen() {} }));
  const text = textOf(markup);
  assert.match(text, /Камол Эргашев/);
  assert.match(text, /Удалён из центра/);
  assert.match(text, /Уроков в месяце нет · аванс прошлых месяцев/);
  assert.match(text, /вперёд 500 000/);
  assert.match(text, /Аванс/);
  assert.match(text, /Ведомости нет/);
  assert.doesNotMatch(text, /Требует действия|Рассчитать|Открыть|ставка не задана|Указать/);
  assert.doesNotMatch(markup, /<button[^>]*>\s*(Рассчитать|Открыть)/);
  assert.match(env.plain(R.advanceHint(500000)), /Выплачено вперёд 500 000 сум\. Покроется начислениями в следующих месяцах или останется как долг преподавателя/);
});

test("an active teacher with an advance and no lessons has no «Удалён из центра»; the advance row never asks for a calculation", () => {
  const { TeacherRow } = component("payroll/payroll-month-page.tsx");
  const text = textOf(html(React.createElement(TeacherRow, { teacher: advanceRow({ member_active: true }), month: "2026-11", busy: false, onCalculate() {}, onOpen() {} })));
  assert.doesNotMatch(text, /Удалён из центра/);
  assert.deepEqual(R.calculationScope([advanceRow(), sheeted("a", 1, 0, 1)]), []);
  assert.deepEqual(R.calculationScope([advanceRow(), { ...sheeted("b", 1, 0, 0), sheet: null, payout: null }]).map((t) => t.teacher_id), ["b"]);
});

test("the tiles are the sum of the rows (LESSONS 104): an advance row adds its carry to «Выплачено вперёд» and to nothing else; «сохранено» does not count it", () => {
  const rows = [advanceRow(), sheeted("a", 300000, 100000, 200000), sheeted("b", 200000, -50000, 250000)];
  const numbers = rows.map(R.teacherMonthNumbers);
  assert.deepEqual(numbers[0], { salary: null, caption: null, was: null, paid: null, rest: { kind: "ahead", amount: 500000 } });
  const totals = R.monthTotals("2026-10", rows, false);
  const tile = (key) => totals.tiles.find((t) => t.key === key)?.value;
  assert.equal(tile("accrued"), 500000);
  assert.equal(tile("paid"), 450000);
  assert.equal(tile("left"), 100000);
  assert.equal(tile("ahead"), numbers.reduce((all, n) => all + (n.rest.kind === "ahead" || n.rest.kind === "more" ? n.rest.amount : 0), 0));
  assert.equal(tile("ahead"), 550000);
  assert.equal(totals.saved, "сохранено 2 из 2");
});

test("«Рассчитать всех» with only advance rows has nothing to do and does not say «сохранена у всех»", () => {
  const gate = R.calculationGate([advanceRow()]);
  assert.equal(gate.ready, false);
  assert.equal(gate.total, 0);
  assert.equal(gate.text, null);
  assert.equal(R.calculationGate([advanceRow(), sheeted("a", 1, 0, 1)]).text, R.ALL_SAVED_TEXT);
});
