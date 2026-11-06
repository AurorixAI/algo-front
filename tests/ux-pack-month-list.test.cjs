// UX pack §5.2 (05.11, the owner's redesign): the list of the salaries of a month - four tiles over a table.  The tiles are the sums of the SAME numbers the rows show (LESSONS 104), so they cannot disagree;
// the numbers are those of the walk of stage (935 834 accrued, 150 000 paid, 860 000 left, 74 166 paid ahead).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const root = path.join(__dirname, "..");
const R = require(path.join(root, "src/lib/payroll.ts"));
const plain = (text) => text.replace(/ /g, " ");

const payout = (over) => ({ saved_total: 0, fresh_total: 0, target: 0, paid: 0, balance: 0, state: "unpaid", basis: "fresh", changed_by: 0, change_text: null, text: "", items: [], carry_in: 0, carry_used: 0, advance_out: 0, ...over });
const KAMOL = { sheet: { id: "s1", revision: 2, total_amount: 120834, stale: true }, payout: payout({ saved_total: 120834, fresh_total: 75834, target: 75834, paid: 150000, balance: -74166, state: "overpaid", changed_by: -45000 }) };
const LOLA = { sheet: null, payout: null };
const SABINA = { sheet: { id: "s3", revision: 1, total_amount: 860000, stale: false }, payout: payout({ saved_total: 860000, fresh_total: 860000, target: 860000, paid: 0, balance: 860000, state: "unpaid", basis: "saved" }) };
const TEACHERS = [KAMOL, LOLA, SABINA];

test("the rows: the salary (accrued now / saved), what is paid, what is left - «вперёд» in an open month", () => {
  assert.deepEqual(R.teacherMonthNumbers(KAMOL), { salary: 75834, caption: "начислено сейчас", was: 120834, paid: 150000, rest: { kind: "ahead", amount: 74166 } });
  assert.deepEqual(R.teacherMonthNumbers(SABINA), { salary: 860000, caption: "сохранено", was: null, paid: 0, rest: { kind: "left", amount: 860000 } });
  assert.deepEqual(R.teacherMonthNumbers(LOLA), { salary: null, caption: null, was: null, paid: null, rest: { kind: "none", amount: 0 } });
});

test("a closed month paid more than saved says «больше», paid in full says «выплачено ✓», and nothing paid on a zero says nothing", () => {
  assert.equal(R.teacherMonthNumbers({ sheet: SABINA.sheet, payout: payout({ saved_total: 860000, target: 860000, paid: 876666, balance: -16666, state: "overpaid", basis: "saved" }) }).rest.kind, "more");
  assert.equal(R.teacherMonthNumbers({ sheet: SABINA.sheet, payout: payout({ saved_total: 860000, target: 860000, paid: 860000, balance: 0, state: "settled", basis: "saved" }) }).rest.kind, "done");
  assert.equal(R.teacherMonthNumbers({ sheet: SABINA.sheet, payout: payout({ saved_total: 0, target: 0, paid: 0, balance: 0, state: "settled", basis: "saved" }) }).rest.kind, "none");
});

test("the tiles of a running month: Начислено на сегодня · Выплачено · Осталось выплатить · Выплачено вперёд", () => {
  const totals = R.monthTotals("2026-11", TEACHERS, true);
  assert.deepEqual(totals.tiles.map((tile) => [tile.key, tile.label, tile.value]), [
    ["accrued", "Начислено на сегодня", 935834], ["paid", "Выплачено", 150000], ["left", "Осталось выплатить", 860000], ["ahead", "Выплачено вперёд", 74166],
  ]);
  assert.equal(totals.saved, "сохранено 2 из 3");
  assert.equal(totals.running, true);
});

test("a finished month: the first tile is «К выплате за октябрь», the last one «Выплачено больше»; no sum paid ahead - no fourth tile", () => {
  const totals = R.monthTotals("2026-10", [{ sheet: SABINA.sheet, payout: payout({ saved_total: 860000, target: 860000, paid: 876666, balance: -16666, state: "overpaid", basis: "saved" }) }], false);
  assert.deepEqual(totals.tiles.map((tile) => [tile.label, tile.value]), [["К выплате за октябрь", 860000], ["Выплачено", 876666], ["Осталось выплатить", 0], ["Выплачено больше", 16666]]);
  assert.deepEqual(R.monthTotals("2026-10", [SABINA], false).tiles.map((tile) => tile.key), ["accrued", "paid", "left"]);
});

test("the tiles are the sums of the rows - for any month (LESSONS 104)", () => {
  const sets = [TEACHERS, [KAMOL, KAMOL, SABINA], [LOLA], [SABINA]];
  for (const teachers of sets) for (const open of [true, false]) {
    const rows = teachers.map(R.teacherMonthNumbers);
    const tiles = Object.fromEntries(R.monthTotals("2026-11", teachers, open).tiles.map((tile) => [tile.key, tile.value]));
    assert.equal(tiles.accrued, rows.reduce((all, row) => all + (row.salary ?? 0), 0));
    assert.equal(tiles.paid, rows.reduce((all, row) => all + (row.paid ?? 0), 0));
    assert.equal(tiles.left, rows.reduce((all, row) => all + (row.rest.kind === "left" ? row.rest.amount : 0), 0));
    assert.equal(tiles.ahead ?? 0, rows.reduce((all, row) => all + (row.rest.kind === "ahead" || row.rest.kind === "more" ? row.rest.amount : 0), 0));
  }
});

test("the status of the row is ONE chip (see ux-month-row.test.cjs for the priority); the second small line only when the month differs (running: no «Месяц открыт»)", () => {
  const CL = require(path.join(root, "src/lib/closed-period.ts"));
  const WARN = { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 };
  assert.equal(R.rowStatus({ ...KAMOL, warnings: { ...WARN, open_lessons: 1 }, undecided_lessons: 1 }).label, "Требует действия · 3", "an unfinished lesson, an additional lesson, the changed salary: ONE chip");
  assert.equal(R.rowStatus({ ...LOLA, warnings: WARN, undecided_lessons: 0 }).label, "Не рассчитано");
  assert.equal(R.rowStatus({ ...SABINA, warnings: WARN, undecided_lessons: 0 }).tone, "saved");
  const open = CL.periodView({ state: "open", closedOn: null, reopened: null });
  const closed = CL.periodView({ state: "closed", closedOn: "2026-11-03", reopened: null });
  assert.equal(CL.monthPeriodView(open, true), null, "the header says the month is going");
  assert.equal(CL.monthPeriodView(open, false).label, "Месяц открыт", "in a finished month an open one is a difference");
  assert.equal(CL.monthPeriodView(closed, true).label, "Месяц закрыт");
});

test("re-audit С16: «Начислено − Выплачено + Выплачено вперёд = Осталось выплатить» (935 834 − 150 000 + 74 166 = 860 000) and the tile «Осталось выплатить» says «без учёта выплаченного вперёд» only when something was paid ahead", () => {
  const totals = R.monthTotals("2026-11", TEACHERS, true);
  const value = Object.fromEntries(totals.tiles.map((tile) => [tile.key, tile.value]));
  const salaries = TEACHERS.reduce((all, teacher) => all + (R.teacherMonthNumbers(teacher).salary ?? 0), 0);
  assert.equal(salaries - value.paid + value.ahead, value.left, "the head arithmetic of the owner");
  assert.equal(totals.tiles.find((tile) => tile.key === "left").note, "без учёта выплаченного вперёд");
  const quiet = R.monthTotals("2026-11", [SABINA], true);
  assert.equal(quiet.tiles.find((tile) => tile.key === "left").note, undefined, "nothing ahead - no note");
});
