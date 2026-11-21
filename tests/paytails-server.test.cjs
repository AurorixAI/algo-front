// PAY-TAILS, screens part 3: the readers of the screens on the REAL answers of the server (tests/fixtures/paytails, tests/helpers/paytails-server.cjs).  What the stub of part 1 / 2 only promised,
// the fixtures of the server prove: the names and the forms (recalc as a list or {lines, more}; `upcoming` of the answer / of a student / of a row; `upcoming_total`; `receipt_state_text` on the top level of a receipt;
// the record of a forgiveness; `others` with the group named; the outcome `effects.stays`; the closed rows' sub-lines; `left_on` / `state_sub`; `covered_by` of four kinds).  LESSONS 143, 151.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
require("./helpers/money1-env.cjs");
const root = path.join(__dirname, "..");
const C = require(path.join(root, "src/lib/paytails-contract.ts"));
const T = require(path.join(root, "src/lib/paytails.ts"));
const S = require(path.join(root, "src/lib/pay-state.ts"));
const L = require(path.join(root, "src/lib/payments-ledger.ts"));
const LG = require(path.join(root, "src/lib/payments-logica.ts"));
const SUM = require(path.join(root, "src/lib/payments-summary.ts"));
const A = require(path.join(root, "src/lib/membership-actions.ts"));
const { fx, NAMES, plain } = require("./helpers/paytails-server.cjs");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));

test("the fixtures of the server are all here: the 20 answers of package Б", () => {
  assert.equal(NAMES.length, 20, NAMES.join(", "));
});

test("recalc of a leaving / an archiving / a transfer / a result: a list of lines of the server; the group is named in `others` by the server (printed as it is)", () => {
  const preview = fx("leave_preview_recalc_others").memberships[0];
  const block = C.recalcOf(preview);
  assert.deepEqual({ ...block, lines: block.lines.map((line) => ({ ...line, text: plain(line.text) })) }, { lines: [{ text: "Ноябрь: 600 000 → 450 000 сум", basisText: "пересчёт по день ухода · 9 уроков из 12", isForgiven: false }], more: 0 });
  assert.deepEqual(C.othersOf(preview).map(plain), ["В группе «Английский 7»: 500 000 → 400 000 сум — сегодняшний урок оплачен в группе «Математика 7»"]);
  const transfer = fx("transfer_probe_others");
  assert.equal(C.recalcOf(transfer).lines.length, 1);
  assert.deepEqual(C.othersOf(transfer).map(plain), ["Начисление в группе «Английский 7» начнётся с 21.11"]);
  assert.equal(plain(C.recalcOf(fx("archive_preview_recalc").memberships[0]).lines[0].text), "Ноябрь: 600 000 → 450 000 сум");
  const result = fx("leave_result_recalc_others");
  assert.equal(result.recalc.lines[0].done, true, "the result is in the past tense: the server's `done`");
  assert.deepEqual(C.resultMoneyLines(result).map(plain), ["Ноябрь: 600 000 → 450 000 сум", "В группе «Английский 7»: 500 000 → 400 000 сум — сегодняшний урок оплачен в группе «Математика 7»"]);
  assert.deepEqual(C.resultMoneyLines({}), []);
});

test("recalc cut by the server ({lines, more}): the line «Прощено: N → M» goes ABOVE the two periods and after «и ещё N периодов»; the object is the only form", () => {
  const cut = { recalc: { lines: [{ label: "Ноябрь", text: "Ноябрь: 600 000 → 415 000 сум", basis_text: null }, { label: "Декабрь", text: "Декабрь: 600 000 → 0 сум" }, { label: "Прощено", text: "Прощено: 600 000 → 415 000 сум" }], more: 2 } };
  const block = C.recalcOf(cut);
  assert.equal(block.lines.length, 3);
  assert.deepEqual(block.lines.map((line) => line.isForgiven), [false, false, true]);
  assert.equal(block.more, 2);
  assert.deepEqual(C.resultMoneyLines(cut).map(plain), ["Ноябрь: 600 000 → 415 000 сум", "Декабрь: 600 000 → 0 сум", "и ещё 2 периода", "Прощено: 600 000 → 415 000 сум"], "the tail of the periods stands before the forgiveness that goes with all of them");
  assert.equal(C.recalcOf({ recalc: cut.recalc.lines }), null, "the server sends the object ALWAYS (`more` 0 when all is shown): a bare list is not read");
});

test("effects.stays of the server: debt / due / advance are the outcome words (the codes of the screen), `none` and `money_stays` are not drawn as a result", () => {
  const preview = fx("leave_preview_paid_ahead").memberships[0];
  assert.equal(preview.effects.stays[0].code, "advance");
  assert.equal(plain(preview.effects.stays[0].text), "Останется аванс 700 000 сум");
  const archive = fx("archive_preview_recalc");
  assert.deepEqual(archive.memberships.map((item) => item.effects.stays.map((s) => s.code)), [["debt"], ["none"]]);
  const result = fx("leave_result_recalc_others");
  assert.equal(result.effects.stays[0].code, "debt");
  assert.deepEqual(LG.leaveToastLines(result, {}).map(plain), ["Ноябрь: 600 000 → 450 000 сум", "В группе «Английский 7»: 500 000 → 400 000 сум — сегодняшний урок оплачен в группе «Математика 7»", "Долг 450 000 сум остался за учеником"]);
});

test("upcoming: in `billing.upcoming` of the answer of a probe, in `students[].billing.upcoming` of a batch, in `rows[].upcoming` of a list, `upcoming_total` on the top level of a batch; the sentence of the message is the server's", () => {
  const one = fx("enrol_upcoming_probe");
  const u = C.upcomingOf(one);
  assert.deepEqual({ ...u, text: plain(u.text) }, { from: "2026-11-24", amount: 150000, lessonsText: "3 урока из 12 в ноябре", dueUntil: "2026-11-28", text: "Начисление с 24.11: 150 000 сум", sub: "платить до 28.11", termsNote: null });
  assert.equal(plain(C.upcomingMessageOf(one)), "Начисление с 24.11: 150 000 сум");
  const bulk = fx("enrol_upcoming_bulk_probe");
  assert.equal(C.upcomingEntriesOf(bulk).length, 2);
  assert.ok(C.upcomingEntriesOf(bulk).every((entry) => entry && entry.amount === 150000));
  const total = C.upcomingTotalOf(bulk);
  assert.equal(total.amount, 300000, "the server adds up, the screen does not");
  assert.equal(plain(C.upcomingMessageOf(bulk)), "Начисление с 24.11: 300 000 сум");
  const bar = C.forecastBarOf(C.upcomingEntriesOf(bulk), total);
  assert.deepEqual({ from: bar.from, amount: bar.amount, dueUntil: bar.dueUntil, lessonsText: bar.lessonsText }, { from: "2026-11-24", amount: 300000, dueUntil: "2026-11-28", lessonsText: null });
  const row = fx("status_row_starts").items[0];
  assert.equal(C.upcomingOf(row).from, "2026-11-24", "the row of a list");
  assert.equal(C.upcomingOf(fx("statement_forecast").summary).amount, 150000, "the summary of a statement");
});

test("a closed row: `debt_sub` / `due_sub` / `tab_sub` / `state_sub` of the server already say «ушёл ДД.ММ» - the label adds nothing; `left_on` is on every list", () => {
  const rows = fx("group_left_open").items;
  const debt = rows.find((row) => row.state === "debt");
  const worst = S.payLabel(debt, "worst");
  assert.equal(plain(worst.text), "Долг 168 000 сум");
  assert.equal(worst.sub, "ушёл 12.11 · просрочено 16 дней", "the sub-line of the debt is the server's `debt_sub`");
  const advance = rows.find((row) => row.advance > 0);
  assert.equal(S.payLabel(advance, "worst").sub, "ушёл 10.11");
  assert.ok(rows.every((row) => row.left_on && row.is_active === false));
  const tab = fx("advance_tab_all").items;
  const labels = tab.map((row) => { const l = S.payLabel(row, "advance"); return [plain(l.text), l.sub]; });
  assert.deepEqual(labels, [["Аванс 210 000 сум", "ушёл 15.11"], ["Аванс 280 000 сум", "ушёл 10.11"], ["Аванс 420 000 сум", "оплачено до 31.12"]], "the tab «Аванс» says `tab_text` / `tab_sub`, nothing else");
  const statement = fx("statement_settled_with_used_forgiveness").summary;
  assert.equal(statement.state_sub, "ушёл 21.11");
  assert.equal(statement.left_on, "2026-11-21");
  assert.deepEqual(L.statementStates(statement).map((state) => [state.text, state.sub, state.tone]), [["Расчёт закрыт", "ушёл 21.11", "plain"]]);
  assert.deepEqual(L.statementStates(fx("statement_no_charges").summary).map((state) => [state.text, state.sub, state.tone]), [["Расчётов нет", "ушёл 05.11", "plain"]]);
});

test("covered_by of the server: `money` (green), `forgiven` («Прощено до», grey), `recalc` («Оплата не нужна до», grey), `opening` (the opening balance - money, green)", () => {
  const rows = fx("status_words_paid_and_forgiven").items;
  const byCover = Object.fromEntries(rows.map((row) => [row.covered_by, S.payLabel(row, "worst")]));
  assert.equal(plain(byCover.forgiven.text), "Прощено до 30.11");
  assert.equal(byCover.forgiven.tone, "neutral");
  assert.equal(plain(byCover.money.text), "Оплачено до 30.11");
  assert.notEqual(byCover.money.tone, "neutral");
  const recalc = S.payLabel({ state: "paid", covered_by: "recalc", state_text: "Оплата не нужна до 30.11", state_sub: null }, "worst");
  assert.equal(recalc.tone, "neutral");
  assert.equal(C.coveredByOf({ covered_by: "opening" }), "opening");
  assert.equal(S.payLabel({ state: "paid", covered_by: "opening", state_text: "Оплачено до 31.10" }, "worst").tone, S.payLabel({ state: "paid", covered_by: "money", state_text: "Оплачено до 31.10" }, "worst").tone);
});

test("the record of a forgiveness: `text` of the row (the same words as `details.text`) under the title; `details.amount` / `details.used` are not read - the column «Оплачено» is the used part", () => {
  const statement = fx("statement_settled_with_used_forgiveness");
  const record = statement.rows.find((row) => row.type === "writeoff");
  assert.equal(record.text, record.details.text);
  assert.equal(record.details.amount, 220000);
  assert.equal(record.details.used, 194000);
  const item = L.buildStatementItems(L.normalizeStatement(statement), null).find((entry) => entry.tag === "прощено");
  assert.equal(plain(item.sub), "использовано 194 000 сум");
  assert.equal(item.paid, record.credit, "the column is the used part (credit), the sum of the title is the entered one");
  assert.ok(plain(item.title).includes("Прощено 220 000 сум"));
});

test("the forecast row of a statement and the state «Начнётся 24.11»: the server's words, a plain word with its `state_sub`", () => {
  const statement = fx("statement_forecast");
  const forecast = C.forecastOf(statement);
  assert.deepEqual({ ...forecast, sub: plain(forecast.sub) }, { date: "2026-11-24", title: "Ноябрь 2026 — неполный месяц (с 24.11, 3 урока из 12)", sub: "прогноз: начислится 150 000 сум" });
  assert.deepEqual(L.statementStates(statement.summary).map((state) => [plain(state.text), state.sub, state.tone]), [["Начнётся 24.11", "платить до 28.11", "plain"]]);
  const row = fx("status_row_starts").items[0];
  const label = S.payLabel(row, "worst");
  assert.equal(plain(label.text), "Начнётся 24.11");
  assert.equal(plain(label.sub), "≈ 150 000 сум");
});

test("the receipt: `receipt_state_text` on the top level of the answer; the server writes the numbers with non-breaking spaces", () => {
  const partial = fx("receipt_partial_payment");
  assert.equal(C.receiptStateTextOf(partial), partial.receipt_state_text);
  assert.equal(plain(C.receiptStateTextOf(partial)), "оплачено 100 000 из 420 000 сум · к оплате 320 000 сум до 05.11");
  assert.equal(C.receiptStateTextOf(fx("receipt_closed_period")), "оплачено до 30.11");
  assert.match(partial.receipt_state_text, /100 000 из 420 000 сум · к оплате 320 000 сум до/, "no ordinary space inside a sum: the server's, the screen rewrites nothing");
  assert.equal(C.receiptStateTextOf({}), null);
});

test("the tab «Аванс» and the group: `left_students`, `summary.buckets.advance`, `advance_text`, `advance_left_students`; `left_count` of `bucket=left_open`", () => {
  const summary = fx("summary_with_advance");
  const words = T.advanceSummaryOf(summary);
  assert.deepEqual(words, { students: 3, leftStudents: 2, text: "3 ученика · 2 ушли из группы" });
  const state = SUM.summaryToState(summary);
  assert.equal(state.advanceText, "3 ученика · 2 ушли из группы");
  assert.equal(state.advanceLeftStudents, 2);
  assert.equal(T.advanceLeftOf(fx("advance_tab_all")), 2);
  assert.equal(T.advanceLeftOf(fx("advance_tab_left_only")), 2, "the toggle keeps its number");
  const group = fx("group_left_open");
  assert.equal(T.leftCountOf(group), 3);
  assert.equal(T.leftCountOf(fx("status_debtors_closed")), 0);
  assert.equal(T.leftCountOf({}), null, "the server did not say - no number");
  assert.equal(T.leftCountOf({ left_count: -1 }), null);
});

test("the action of a closed row by its state: the sum to give back is the `advance` (the old `refundable` is no longer read)", () => {
  const rows = fx("group_left_open").items.map(L.normalizeRow);
  const [debt, advance] = [rows.find((row) => row.state === "debt"), rows.find((row) => row.advance > 0)];
  assert.deepEqual(T.rowActionsOf(debt), { pay: true, refund: false, menuRefund: false });
  assert.deepEqual(T.rowActionsOf(advance), { pay: false, refund: true, menuRefund: false });
  const withoutOld = { ...advance };
  delete withoutOld.refundable;
  assert.equal(L.canRefund(withoutOld), true, "the answer without `refundable` is enough");
  const open = fx("advance_tab_all").items.map(L.normalizeRow).find((row) => row.is_active);
  assert.deepEqual(T.rowActionsOf(open), { pay: true, refund: false, menuRefund: true });
});

test("the old names are not read: `refundable` of a row / the money of a leaving / the impact, and nothing of the screens rebuilds a sentence of the server", () => {
  const files = walk("src").filter((file) => /\.(ts|tsx)$/.test(file));
  const offenders = [];
  for (const file of files) {
    const body = read(file);
    for (const [index, line] of body.split("\n").entries()) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (/\b(row|membership\.money|money|item\.money|impact|fresh)\??\.refundable\b|refundable_before|refundable_after|refundable_delta|\.refundable\s*[><]/.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim().slice(0, 100)}`);
    }
  }
  assert.deepEqual(offenders, []);
  assert.deepEqual(files.filter((file) => /balance_text/.test(read(file))), [], "the running balance `balance_text` of a statement row is not read: the column is `open_*`");
  assert.ok(!/signedBalanceText/.test(files.map(read).join("\n")), "no sentence of the balance is made on the screen");
});
