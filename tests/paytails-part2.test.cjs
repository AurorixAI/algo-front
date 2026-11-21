// PAY-TAILS, screens part 2 (Б2.4-Б2.6): the readers of the contract (lib/paytails-contract.ts), the words and tones of a state (lib/pay-state.ts), the statement (forecast, «использовано N сум», the state and its sub-line)
// and the line of the receipt - pure functions.  The answers are the CONTRACT of Б1.3-Б1.5 + Б5 (tests/helpers/paytails-fixture2.cjs: the only stub).  LESSONS 143, 151: nothing is counted or worded by the screen.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
require("./helpers/money1-env.cjs");
const root = path.join(__dirname, "..");
const C = require(path.join(root, "src/lib/paytails-contract.ts"));
const S = require(path.join(root, "src/lib/pay-state.ts"));
const L = require(path.join(root, "src/lib/payments-ledger.ts"));
const CT = require(path.join(root, "src/lib/chip-tone.ts"));
const B = require(path.join(root, "src/lib/enrol-bar.ts"));
const X = require("./helpers/paytails-fixture2.cjs");
const N = (s) => String(s ?? "").replace(/[\s  ]+/g, " ").trim();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("recalc: lines with a text only, the basis kept, a cut list says «и ещё N периодов»; no block without lines", () => {
  const block = C.recalcOf({ recalc: X.recalcBlock([X.RECALC_NOV, { text: "  " }, { basis_text: "x" }]) });
  assert.deepEqual(block, { lines: [{ text: "Ноябрь: 600 000 → 415 000 сум", basisText: "пересчёт по день ухода · 9 уроков из 13", isForgiven: false }], more: 0 });
  assert.equal(C.recalcOf({ recalc: X.RECALC_CUT }).more, 2);
  assert.equal(C.recalcMoreText(2), "и ещё 2 периода");
  assert.equal(C.recalcMoreText(5), "и ещё 5 периодов");
  assert.equal(C.recalcOf({}), null);
  assert.equal(C.recalcOf({ recalc: X.recalcBlock([]) }), null);
  assert.equal(C.recalcOf({ recalc: [X.RECALC_NOV] }), null, "the server sends the object only: a bare list is not read");
  assert.equal(C.recalcOf(null), null);
});

test("others: ALWAYS a list of strings (the server's form); empty words are dropped; any other form says nothing", () => {
  assert.deepEqual(C.othersOf({ others: ["a", " ", "b", null] }), ["a", "b"]);
  assert.deepEqual(C.othersOf({ others: "a" }), [], "no string form: the server never sends it");
  assert.deepEqual(C.othersOf({}), []);
});

test("resultMoneyLines: the done lines of `recalc`, the tail, then `others` - the message after an action", () => {
  assert.deepEqual(C.resultMoneyLines({ recalc: X.RECALC_CUT, others: ["x"] }).map(N), ["Ноябрь: 600 000 → 415 000 сум", "Декабрь не начнётся: 300 000 сум останутся авансом", "и ещё 2 периода", "Прощено: 600 000 → 415 000 сум", "x"]);
  assert.deepEqual(C.resultMoneyLines({}), []);
  const names = { s1: "Каримов", s2: "Юсупова" };
  assert.deepEqual(C.bulkMoneyLines({ students: [{ student_id: "s1", recalc: X.recalcBlock([{ text: "a" }]) }, { student_id: "s2", others: ["b"] }] }, (id) => names[id]), ["Каримов: a", "Юсупова: b"]);
  assert.deepEqual(C.bulkMoneyLines({ students: [{ student_id: "s1", recalc: X.recalcBlock([{ text: "a" }]) }] }, (id) => names[id]), ["a"], "one student - no name in front");
});

test("upcoming: of a row, of `billing`, of a student; no date - none; the total of a batch is the SERVER's; the message after", () => {
  const u0 = C.upcomingOf({ upcoming: X.UPCOMING_10 });
  const u = { ...u0, text: N(u0.text) };
  const want = N("Начисление с 24.11: 120 000 сум");
  assert.deepEqual(u, { from: "2026-11-24", amount: 120000, lessonsText: "2 урока из 8 в ноябре", dueUntil: "2026-11-28", text: want, sub: "платить до 28.11", termsNote: null });
  assert.equal(C.upcomingOf({ billing: { upcoming: X.UPCOMING_14 } }).termsNote, "сегодня ученик ещё числился в «Математике 7»");
  assert.equal(C.upcomingOf({ upcoming: { amount: 5 } }), null);
  assert.equal(C.upcomingOf({}), null);
  assert.equal(C.upcomingOf({ upcoming: { from: "2026-11-24", amount: null } }).amount, null, "a role without the right to money: the date only");
  const total = { upcoming_total: { from: "2026-11-24", amount: 240000, text: "T" }, students: [{ billing: { upcoming: X.UPCOMING_10 } }, { billing: { upcoming: X.UPCOMING_10 } }] };
  assert.equal(C.upcomingTotalOf(total).amount, 240000);
  assert.equal(C.upcomingMessageOf(total), "T");
  assert.equal(C.upcomingMessageOf({ students: [{ billing: { upcoming: X.UPCOMING_10 } }, { billing: { upcoming: X.UPCOMING_10 } }] }), null, "several students and no total: nothing is made up");
  assert.equal(N(C.upcomingMessageOf({ billing: { upcoming: X.UPCOMING_10 } })), "Начисление с 24.11: 120 000 сум");
});

test("forecastBarOf / forecastBarWords: one student - his forecast; several - the server's total only (the screen adds nothing up); the earliest day; the term or the server's sub", () => {
  const a = C.upcomingOf({ upcoming: X.UPCOMING_10 });
  const b = C.upcomingOf({ upcoming: { ...X.UPCOMING_10, from: "2026-11-26", amount: 90000 } });
  assert.equal(C.forecastBarOf([], null), null);
  assert.equal(C.forecastBarOf([null], null), null);
  assert.equal(C.forecastBarOf([a], null).amount, 120000);
  const two = C.forecastBarOf([a, b], null);
  assert.equal(two.amount, null, "two forecasts without a total: no sum");
  assert.equal(two.from, "2026-11-24");
  assert.equal(C.forecastBarOf([a, b], { ...a, amount: 210000 }).amount, 210000);
  const words = B.forecastBarWords(C.forecastBarOf([a], null), "2026-11-21");
  assert.deepEqual({ ...words, totalText: N(words.totalText) }, { caption: "Начисление с 24 ноября", totalText: "120 000", unit: "сум", line: "2 урока из 8 в ноябре · платить до 28.11" });
  const debtFirst = B.forecastBarWords(C.forecastBarOf([{ ...a, dueUntil: null, sub: "долг с первого дня" }], null), "2026-11-21");
  assert.equal(debtFirst.line, "2 урока из 8 в ноябре · долг с первого дня");
});

test("state: the new values, `covered_by`, the tone: «Начнётся» is an outline, «Прощено до» is grey (not the green of money), «Оплачено до» stays green", () => {
  assert.ok(C.isNewState("starts") && C.isNewState("settled") && C.isNewState("no_charges") && !C.isNewState("paid"));
  assert.equal(C.coveredByOf({ covered_by: "forgiven" }), "forgiven");
  assert.equal(C.coveredByOf({ covered_by: "x" }), null);
  assert.ok(C.isNotMoneyCover({ covered_by: "forgiven" }) && C.isNotMoneyCover({ covered_by: "recalc" }) && !C.isNotMoneyCover({ covered_by: "money" }) && !C.isNotMoneyCover({}));
  assert.equal(S.payLabel({ state: "starts", state_text: "Начнётся 24.11", state_sub: "≈ 120 000 сум" }).tone, "outline");
  assert.deepEqual(((l) => [l.text, l.sub])(S.payLabel({ state: "starts", state_text: "Начнётся 24.11", state_sub: "≈ 120 000 сум" })), ["Начнётся 24.11", "≈ 120 000 сум"]);
  assert.equal(S.payLabel({ state: "paid", state_text: "Прощено до 30.11", covered_by: "forgiven" }).tone, "neutral");
  assert.equal(S.payLabel({ state: "paid", state_text: "Оплата не нужна до 30.11", covered_by: "recalc" }).tone, "neutral");
  assert.equal(S.payLabel({ state: "paid", state_text: "Оплачено до 30.11", covered_by: "money", state_sub: "из них прощено 300 000 сум" }).tone, "ok");
  assert.equal(S.payLabel({ state: "paid", state_text: "Оплачено до 30.11" }).tone, "ok", "no field - as before");
  assert.equal(S.payLabel({ state: "expiring", state_text: "Заканчивается", covered_by: "forgiven" }).tone, "warn", "an amber warning is not turned grey");
  assert.equal(S.payLabel({ state: "settled", state_text: "Расчёт закрыт" }).state, "settled");
  assert.match(CT.CHIP_TONE_CLASS.outline, /border-slate-300 bg-white/);
  // the worst row of a card: a debt first; «Начнётся» after «Оплачено»
  assert.equal(S.worstRow([{ state: "starts", state_text: "a" }, { state: "paid", state_text: "b" }]).state_text, "b");
  assert.equal(S.worstRow([{ state: "starts", state_text: "a" }, { state: "debt", state_text: "d", debt_amount: 1 }]).state_text, "d");
});

test("the tab «Аванс» reads `tab_text` / `tab_sub`; every other tab - `state_text` / `state_sub` (the same on every tab)", () => {
  const row = { state: "paid", state_text: "Оплачено до 31.12", state_sub: "аванс 600 000 сум", tab_text: "Аванс 600 000 сум", tab_sub: "оплачено до 31.12", covered_by: "money" };
  assert.deepEqual(((l) => [l.text, l.sub])(S.payLabel(row, "advance")), ["Аванс 600 000 сум", "оплачено до 31.12"]);
  assert.deepEqual(((l) => [l.text, l.sub])(S.payLabel(row, "paid")), ["Оплачено до 31.12", "аванс 600 000 сум"]);
  assert.deepEqual(((l) => [l.text, l.sub])(S.payLabel({ state: "paid", state_text: "Аванс 1", state_sub: "ушёл 28.10" }, "advance")), ["Аванс 1", "ушёл 28.10"], "a server without `tab_*` - the words of the state");
});

test("statement: the state and ITS sub-line only; a new state / a forgiveness cover is a plain word; the «Аванс N» line is not repeated when the sub says it; forecast row in its month; «использовано N сум»", () => {
  const sumOf = (over) => L.normalizeStatement({ membership: {}, as_of: "2026-11-21", mode: "calendar", accounting_start: "2026-01-01", summary: { charged: 0, paid: 0, ...over }, rows: [], voided: [], upcoming: [] });
  const starts = sumOf({ state: "starts", state_text: "Начнётся 24.11", state_sub: "платить до 28.11" });
  assert.deepEqual(L.statementStates(starts.summary), [{ key: "state", text: "Начнётся 24.11", sub: "платить до 28.11", tone: "plain" }]);
  assert.equal(L.statementStates(sumOf({ state: "settled", state_text: "Расчёт закрыт" }).summary)[0].tone, "plain");
  assert.equal(L.statementStates(sumOf({ state: "no_charges", state_text: "Расчётов нет" }).summary)[0].tone, "plain");
  assert.equal(L.statementStates(sumOf({ state: "paid", state_text: "Прощено до 30.11", covered_by: "forgiven" }).summary)[0].tone, "plain");
  assert.equal(L.statementStates(sumOf({ state: "paid", state_text: "Оплачено до 30.11", covered_by: "money" }).summary)[0].tone, "paid");
  const open = sumOf({ state: "paid", state_text: "Оплачено до 31.12", state_sub: "аванс 600 000 сум", advance: 600000 });
  assert.equal(L.statementAdvanceLine(open.summary), null, "the sub-line already says the advance: not twice");
  assert.equal(N(L.statementAdvanceLine(sumOf({ state: "paid", state_text: "Оплачено до 31.12", advance: 600000 }).summary)), "Аванс 600 000 сум");
  // the forecast row: in the month of its day, in no total; the empty statement is not «записей нет»
  const withForecast = L.normalizeStatement({ ...starts, forecast: { date: "2026-11-24", title: "Ноябрь 2026 — неполный месяц (с 24.11, 2 урока из 8)", sub: "прогноз: начислится 120 000 сум" } });
  const items = L.buildStatementItems(withForecast, null);
  assert.deepEqual(items.map((item) => item.kind), ["month", "forecast"]);
  assert.equal(items[1].sub, "прогноз: начислится 120 000 сум");
  assert.equal(L.statementTotals(withForecast.summary).find((t) => t.key === "charged").amount, 0, "the forecast is not a charge");
  assert.deepEqual(L.buildStatementItems(starts, null), [], "no `forecast` - no row");
  // a forgiveness used in part: the server's line under the record
  const writeoff = { seq: 1, date: "2026-11-18", type: "writeoff", title: "Прощено 220 000 сум — причина: семейные обстоятельства", debit: 0, credit: 35000, outflow: 0, text: "использовано 35 000 сум", details: {} };
  const row = L.buildStatementItems(L.normalizeStatement({ ...starts, rows: [writeoff] }), null).find((item) => item.kind === "row");
  assert.equal(row.sub, "использовано 35 000 сум");
  assert.equal(row.paid, 35000);
});

test("the receipt reads the server's `receipt_state_text`; the screen composes no «оплачено до»", () => {
  assert.equal(C.receiptStateTextOf({ receipt_state_text: " оплачено до 30.11 " }), "оплачено до 30.11");
  assert.equal(C.receiptStateTextOf({ receipt_state_text: null }), null);
  assert.equal(C.receiptStateTextOf({}), null);
  assert.ok(!/Оплачено до: /.test(read("src/lib/payments-ledger.ts")), "no own sentence about the date in the ledger");
});
