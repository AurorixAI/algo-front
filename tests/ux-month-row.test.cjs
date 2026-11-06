// UX round of the owner (05.11), the list of the salaries: a row says only what a person can act on, the rate in short lines, the change once.  Pure rules; the layout in a real browser is
// `dom-month-list-layout.test.cjs`.
const assert = require("node:assert/strict");
const test = require("node:test");
const env = require("./helpers/money1-env.cjs");
const { lib, plain } = env;
const R = lib("payroll.ts");

const WARN = (over = {}) => ({ open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0, ...over });

test("a row's attention: ONE list of what needs an action - unfinished lessons, excuses that wait, a missing price, additional lessons nobody decided; «ученики не оплатили» is a note and is not here", () => {
  const all = R.teacherAttention({ warnings: WARN({ open_lessons: 1, pending_excused: 2, no_fee: 3, unpaid: 140, unpaid_students: 9 }), undecided_lessons: 1 });
  assert.deepEqual(all.map((view) => view.key), ["open_lessons", "pending_excused", "no_fee", "undecided"]);
  assert.deepEqual(all.map((view) => plain(view.text)), ["1 урок без отметки", "2 уважительные ждут решения", "у 3 учеников нет цены", "1 доп. урок ждёт решения"]);
  assert.deepEqual(all.map((view) => view.href), ["/owner/attendance?tab=open", "/owner/attendance?tab=excuses", "/owner/payments/prices", "/owner/substitutions"], "each one leads to where it is done");
  assert.ok(!all.some((view) => view.key === "unpaid"), "the note stays on the sheet");
  assert.deepEqual(R.teacherAttention({ warnings: WARN({ unpaid: 140, unpaid_students: 9 }), undecided_lessons: 0 }), [], "only a note: nothing to do, no line");
  assert.deepEqual(R.teacherAttention({ warnings: WARN(), undecided_lessons: undefined }), []);
  // the units
  const undecided = (n) => plain(R.teacherAttention({ warnings: WARN(), undecided_lessons: n })[0].text);
  assert.deepEqual([undecided(1), undecided(2), undecided(5), undecided(21)], ["1 доп. урок ждёт решения", "2 доп. урока ждут решения", "5 доп. уроков ждут решения", "21 доп. урок ждёт решения"]);
  // an unfinished check says so (a failure is not a zero)
  assert.equal(plain(R.teacherAttention({ warnings: WARN({ open_lessons: null, open_lessons_unknown: true }), undecided_lessons: 0 })[0].text), "Не удалось проверить уроки без отметки");
});

test("the rate cell: short lines one under the other, no «·»; «Индив.»; a kind with no rate says so; no rate at all is only the link that sets it", () => {
  const lines = (rates, missing = []) => R.monthRateLines({ rates, missing_rates: missing, lesson_types: [] });
  assert.deepEqual(lines({ group: "50", individual: "60" }), { lines: ["Группа 50%", "Индив. 60%"], missing: false, none: false });
  assert.deepEqual(lines({ individual: "40", group: "33.5" }).lines, ["Группа 33,5%", "Индив. 40%"], "the order of the forms, not of the keys");
  assert.deepEqual(lines({ group: "45" }, ["pair"]), { lines: ["Группа 45%", "Парный — нет ставки"], missing: true, none: false });
  assert.deepEqual(lines({ mini_group: "30", pair: "45" }).lines, ["Мини-гр. 30%", "Парный 45%"]);
  assert.deepEqual(lines({}, ["group"]), { lines: [], missing: true, none: true });
  assert.deepEqual(lines({}), { lines: [], missing: false, none: false });
  assert.ok(!lines({ group: "50", individual: "60" }).lines.join("").includes("·"));
});

test("the status of a row is ONE chip by priority: «Требует действия · N» (the items - the changed salary among them) / «Не рассчитано» / «Сохранено 05.11»", () => {
  const sheet = (stale) => ({ id: "s", revision: 1, total_amount: 1, stale, updated_at: "2026-11-05T05:00:00" });
  const payout = (over = {}) => ({ fresh_total: 75834, changed_by: 75834, ...over });
  const row = (over) => ({ warnings: WARN(), undecided_lessons: 0, sheet: sheet(false), payout: payout(), ...over });
  const moved = R.rowStatus(row({ sheet: sheet(true) }));
  assert.deepEqual([moved.tone, moved.label], ["todo", "Требует действия"]);
  assert.equal(plain(moved.items[0].text), "Зарплата изменилась на +75 834 сум — сохраните новую сумму");
  assert.equal(moved.items[0].key, "changed");
  assert.equal(plain(R.rowStatus(row({ sheet: sheet(true), payout: payout({ changed_by: -45000 }) })).items[0].text), "Зарплата изменилась на −45 000 сум — сохраните новую сумму");
  // the data moved but the sum did not (or cannot be counted): still an item, said without a sum
  for (const over of [{ payout: payout({ changed_by: 0 }) }, { payout: payout({ fresh_total: null }) }, { payout: null }]) {
    assert.equal(R.rowStatus(row({ sheet: sheet(true), ...over })).items[0].text, "Данные изменились — проверьте и сохраните новую сумму");
  }
  // priority: what needs an action wins over «Не рассчитано» and «Сохранено»; every kind of item counts
  const busy = R.rowStatus(row({ sheet: sheet(true), warnings: WARN({ open_lessons: 1 }), undecided_lessons: 2 }));
  assert.equal(busy.label, "Требует действия");
  assert.deepEqual(busy.items.map((item) => item.button), ["Отметить", "Решить", "Сохранить новую сумму"]);
  assert.equal(R.rowStatus(row({ sheet: null, payout: null, warnings: WARN({ open_lessons: 1 }) })).label, "Требует действия", "also a teacher with nothing saved");
  assert.deepEqual([R.rowStatus(row({ sheet: null, payout: null })).tone, R.rowStatus(row({ sheet: null, payout: null })).label], ["none", "Не рассчитано"]);
  assert.deepEqual([R.rowStatus(row()).tone, R.rowStatus(row()).label], ["saved", "Сохранено 05.11"]);
});
