// «Деньги-1», обход stage 05.11, D-6: the window of a transfer says the state AFTER it - «Перенесено 640 000 сум; аванс останется 640 000 сум. Со следующего дня начислят ещё 350 000 сум (…)».
// Contract: MONEY1_A_SERVER_REPORT.md, «Контракт для фронта» → «Перевод»: `carry_after` + the same sentence in `carried[]` and `warnings[]` with the code `transfer_balance_after`
// (a BULK answer has no `carried`: only `warnings[]` with `student_id`).  Unit level; the real window in a DOM: `dom-enrol.test.cjs`, `dom-extra-transfer.test.cjs`.
const assert = require("node:assert/strict");
const test = require("node:test");
const env = require("./helpers/money1-env.cjs");
const { lib, plain } = env;
const D0 = lib("dry-run.ts");
// the sums of the server carry non-breaking spaces now (re-audit В5): the words are compared with ordinary ones
const D = { ...D0, carriedOf: (...args) => D0.carriedOf(...args).map((line) => ({ ...line, message: line.message.replace(/\u00a0/g, " ") })) };
const P = lib("payments.ts");

const ARRIVED = (id) => ({ code: "payment_carried_over", message: "Остаток денег 640 000 сум перенесён в «Алгебра 7»", ...(id ? { student_id: id } : {}) });
const AFTER = (id, text = "Перенесено 640 000 сум; аванс останется 640 000 сум. Со следующего дня начислят ещё 350 000 сум (аванс останется 290 000 сум)") => ({ code: "transfer_balance_after", message: text, ...(id ? { student_id: id } : {}) });
const CARRY_AFTER = { carried: 640000, charged_now: 0, advance: 640000, debt: 0, charged_tomorrow: 350000, advance_tomorrow: 290000, text: AFTER().message };

test("D-6 single: the window shows the sentence of the new account once - the older «перенесён» of the same transfer is not said next to it (the same 640 000 twice)", () => {
  const answer = { carried: [ARRIVED(), AFTER()], warnings: [ARRIVED(), AFTER()], carry_after: CARRY_AFTER, dry_run: true };
  const lines = D.carriedOf(answer);
  assert.deepEqual(lines.map((line) => line.code), ["transfer_balance_after"]);
  assert.equal(lines[0].message, CARRY_AFTER.text);
  assert.equal((lines.map((line) => line.message).join(" ").match(/640\s000/g) || []).length, 2, "640 000 «перенесено» and 640 000 «аванс» - two different facts, said once each");
  // the way back: «из них сразу 280 000 на оплату остатка месяца; аванс останется 360 000»
  const back = D.carriedOf({ carried: [AFTER(undefined, "Перенесено 640 000 сум, из них сразу 280 000 сум на оплату остатка месяца; аванс останется 360 000 сум")] });
  assert.equal(back[0].message, "Перенесено 640 000 сум, из них сразу 280 000 сум на оплату остатка месяца; аванс останется 360 000 сум");
});

test("D-6: an older server (no sentence of the balance) - the old line stays; `carry_after.text` alone is enough; no money - the window says nothing is carried", () => {
  assert.deepEqual(D.carriedOf({ carried: [ARRIVED()] }).map((line) => line.message), ["Остаток денег 640 000 сум перенесён в «Алгебра 7»"]);
  assert.deepEqual(D.carriedOf({ carry_after: CARRY_AFTER }).map((line) => [line.code, line.message]), [["transfer_balance_after", CARRY_AFTER.text]]);
  assert.deepEqual(D.carriedOf({ carried: [], carry_after: null, warnings: [] }), []);
  assert.deepEqual(D.carriedOf(null), []);
  // a warning that is not about money is not a line of «Что переедет»
  assert.deepEqual(D.carriedOf({ warnings: [{ code: "second_group", message: "Ученик уже в другой группе" }] }), []);
});

test("D-6 bulk: the answer has NO `carried` - the lines come from `warnings[]` by `student_id`; with several students each line starts with the name", () => {
  const answer = { group_id: "g2", added: 2, skipped: 0, warnings: [ARRIVED("s1"), AFTER("s1"), ARRIVED("s2"), AFTER("s2", "Перенесено 100 000 сум; аванс останется 100 000 сум"), { code: "second_group", message: "x", student_id: "s2" }], dry_run: true };
  const names = new Map([["s1", "Иванов Иван"], ["s2", "Петрова Мария"]]);
  const lines = D.carriedOf(answer, names);
  assert.deepEqual(lines.map((line) => line.message), [
    "Иванов Иван: Перенесено 640 000 сум; аванс останется 640 000 сум. Со следующего дня начислят ещё 350 000 сум (аванс останется 290 000 сум)",
    "Петрова Мария: Перенесено 100 000 сум; аванс останется 100 000 сум",
  ]);
  // one student: no name in front (the window is about him)
  const one = D.carriedOf({ warnings: [AFTER("s1")] }, names);
  assert.equal(one[0].message, AFTER().message);
  // one student has money, the other has none: the one with money is alone in the list - no name needed
  assert.equal(D.carriedOf({ warnings: [AFTER("s1")] }, names).length, 1);
});

test("D-6 after the transfer: the sentence of the balance is calm information (not an amber warning), and the plain «перенесён» of the same student is not repeated", () => {
  const notes = [ARRIVED("s1"), AFTER("s1"), ARRIVED("s2"), { code: "second_group", message: "Ученик уже в другой группе", student_id: "s2" }];
  const split = P.splitTransferNotes(notes, (id) => ({ s1: "Иванов Иван", s2: "Петрова Мария" })[id]);
  assert.deepEqual(split.infos.map((line) => plain(line).slice(0, 40)), ["Иванов Иван — Перенесено 640 000 сум; ав", "Петрова Мария — Остаток денег 640 000 су"]);
  assert.deepEqual(split.warnings, ["Петрова Мария — Ученик уже в другой группе"]);
  assert.equal(P.TRANSFER_BALANCE_CODE, "transfer_balance_after");
  // a single transfer
  const single = P.splitTransferNotes([ARRIVED(), AFTER()]);
  assert.deepEqual(single, { infos: [AFTER().message], warnings: [] });
});
