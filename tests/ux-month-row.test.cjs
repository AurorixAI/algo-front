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
  assert.deepEqual(all.map((view) => plain(view.text)), ["1 незакрытый урок", "2 уважительные ждут решения", "у 3 учеников нет цены", "1 доп. урок ждёт решения"]);
  assert.deepEqual(all.map((view) => view.href), ["/owner/attendance?tab=open", "/owner/attendance?tab=excuses", "/owner/payments/prices", "/owner/substitutions"], "each one leads to where it is done");
  assert.ok(!all.some((view) => view.key === "unpaid"), "the note stays on the sheet");
  assert.deepEqual(R.teacherAttention({ warnings: WARN({ unpaid: 140, unpaid_students: 9 }), undecided_lessons: 0 }), [], "only a note: nothing to do, no line");
  assert.deepEqual(R.teacherAttention({ warnings: WARN(), undecided_lessons: undefined }), []);
  // the units
  const undecided = (n) => plain(R.teacherAttention({ warnings: WARN(), undecided_lessons: n })[0].text);
  assert.deepEqual([undecided(1), undecided(2), undecided(5), undecided(21)], ["1 доп. урок ждёт решения", "2 доп. урока ждут решения", "5 доп. уроков ждут решения", "21 доп. урок ждёт решения"]);
  // an unfinished check says so (a failure is not a zero)
  assert.equal(plain(R.teacherAttention({ warnings: WARN({ open_lessons: null, open_lessons_unknown: true }), undecided_lessons: 0 })[0].text), "Не удалось проверить незакрытые уроки");
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

test("the status chip of a row says the change after the saving ONCE: «Изменилась на +75 834 сум»; the plain «Есть изменения» only when the sum did not move or cannot be counted", () => {
  const sheet = (stale) => ({ id: "s", revision: 1, total_amount: 1, stale, updated_at: "2026-11-05T05:00:00" });
  const payout = (over = {}) => ({ fresh_total: 75834, changed_by: 75834, ...over });
  assert.equal(plain(R.rowStatus({ sheet: sheet(true), payout: payout() }).label), "Изменилась на +75 834 сум");
  assert.equal(plain(R.rowStatus({ sheet: sheet(true), payout: payout({ changed_by: -45000 }) }).label), "Изменилась на −45 000 сум");
  assert.equal(R.rowStatus({ sheet: sheet(true), payout: payout() }).tone, "changed");
  assert.equal(R.rowStatus({ sheet: sheet(true), payout: payout({ changed_by: 0 }) }).label, "Есть изменения");
  assert.equal(R.rowStatus({ sheet: sheet(true), payout: payout({ fresh_total: null }) }).label, "Есть изменения", "the fresh total cannot be counted: the sum is not claimed");
  assert.equal(R.rowStatus({ sheet: sheet(true), payout: null }).label, "Есть изменения", "an older answer");
  assert.equal(R.rowStatus({ sheet: sheet(false), payout: payout() }).label, "Сохранено 05.11", "not stale: the saved chip, whatever the payout says");
  assert.equal(R.rowStatus({ sheet: null, payout: null }).label, "Не рассчитано");
});
