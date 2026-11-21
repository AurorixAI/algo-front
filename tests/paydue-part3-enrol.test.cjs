// PAY-DUE 16А.2: the windows of enrolment name the sum at once with the words of the SERVER (10.4): «К оплате до ДД.ММ» / «Долг сразу … · срок был ДД.ММ» / two lines for a debt and a sum in term /
// «Всего к оплате до ДД.ММ» for a batch (the nearest term, each student's own in «По ученикам»); a silent server names nothing (LESSONS 151); the balances of the past stays are named by the server's `kind`.
// The pure part: the table «field of the answer -> where it is shown» is checked here and in the DOM test dom-paydue-part3.test.cjs.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
require("./helpers/money1-env.cjs");
const root = path.join(__dirname, "..");
const B = require(path.join(root, "src/lib/enrol-bar.ts"));
const F = require(path.join(root, "src/lib/pay-from.ts"));
const PB = require(path.join(root, "src/lib/past-balances.ts"));
const TE = require(path.join(root, "src/lib/transfer-effects.ts"));
const G = require(path.join(root, "src/lib/payments-logica.ts"));
const L = require(path.join(root, "src/lib/payments-ledger.ts"));
const M = require(path.join(root, "src/lib/membership-actions.ts"));
const S = require("./helpers/paydue-statement.cjs");
const { dueLines } = require("./helpers/enrol-words.cjs");
const plain = (text) => String(text).replace(/ /g, " ");

const PART = { label: "ноябрь", from: "2026-11-19", amount: 231000, lessons: 5, lessons_in_period: 13, whole: false };
const row = (id, amount, lines, parts = [PART]) => ({ id, name: id, amount, parts, lines });

test("captionOf: the sum is cut out of the server's sentence (it is drawn big under the words), the rest is the server's own", () => {
  assert.equal(B.captionOf(plain(dueLines(231000, 5)[0])), "К оплате до 24.11");
  assert.equal(B.captionOf(plain(dueLines(0, 0, { until: null })[0].replace("0 сум", "5 000 сум"))), "К оплате");
  assert.equal(B.captionOf(plain(dueLines(300000, 14, { debt: true, was: "03.11" })[0])), "Долг сразу · срок был 03.11");
  assert.equal(B.captionOf(plain(dueLines(693000, 15, { until: "24.11", total: true })[0])), "Всего к оплате до 24.11");
  // two lines of a debt and a sum in term: another shape, stay whole
  assert.equal(B.captionOf("Долг 100 000 сум · срок был 03.11"), "Долг 100 000 сум · срок был 03.11");
  assert.equal(B.captionOf("К оплате 50 000 сум до 24.11"), "К оплате 50 000 сум до 24.11");
});

test("the bar: ONE student - his own sentence; a batch - the sentence of the batch; the server silent - no words, the sum alone", () => {
  const own = dueLines(231000, 5, { until: "24.11" });
  const one = B.enrolBarOf([row("a", 231000, own)]);
  assert.deepEqual(one.captions.map(plain), ["К оплате до 24.11"]);
  assert.deepEqual(one.words.map(plain), own.map(plain));
  const total = dueLines(693000, 15, { until: "24.11", total: true });
  const three = B.enrolBarOf([row("a", 231000, own), row("b", 231000, own), row("c", 231000, own)], total);
  assert.deepEqual(three.captions.map(plain), ["Всего к оплате до 24.11"]);
  assert.equal(plain(three.line).startsWith("по 231 000"), true, "the line under the sum (the fields) is as before");
  // one pays of three: his own sentence, not the batch's
  const some = B.enrolBarOf([row("a", 231000, own), row("b", null, [], []), row("c", null, [], [])], total);
  assert.deepEqual(some.captions.map(plain), ["К оплате до 24.11"]);
  // the server said nothing about the words: the sum stays, no word is made up
  const silent = B.enrolBarOf([row("a", 231000, []), row("b", 231000, [])]);
  assert.deepEqual([silent.captions, silent.words, silent.total], [[], [], 462000]);
  assert.deepEqual(B.enrolBarOf([row("a", null, [], [])]).captions, [], "nobody pays: nothing is said");
});

test("two names: a debt and a sum in term are two lines of the server, both are shown", () => {
  const lines = ["Долг 100 000 сум · срок был 03.11", "К оплате 50 000 сум до 24.11"];
  const bar = B.enrolBarOf([row("a", 150000, lines, [PART])]);
  assert.deepEqual(bar.captions, lines);
});

test("every student has his own term: the details name it only when the terms differ", () => {
  const a = row("a", 231000, dueLines(231000, 5, { until: "24.11" }));
  const b = row("b", 231000, dueLines(231000, 5, { until: "26.11" }));
  assert.equal(B.captionsDiffer([a, b]), true);
  assert.equal(B.captionsDiffer([a, { ...a, id: "c" }]), false);
  assert.equal(B.captionsDiffer([a, row("n", null, [], [])]), false, "somebody who pays nothing says nothing");
  // equal sums and periods but different terms: the list «По ученикам» is offered
  assert.equal(B.enrolBarOf([a, b], dueLines(462000, 10, { until: "24.11", total: true })).expandable, true);
  assert.equal(B.enrolBarOf([a, { ...a, id: "c" }], dueLines(462000, 10, { until: "24.11", total: true })).expandable, false);
});

test("the answer: `lines` of a student and of the batch are read, an answer with the sentence only is split into lines, the silent one gives none", () => {
  const billing = (extra) => ({ pay_from: "2026-11-19", immediate: { amount: 231000, lessons: 5, text: "К оплате до 24.11: 231 000 сум (за 5 уроков)", parts: [], ...extra } });
  assert.deepEqual(F.normalizeBilling(billing({ lines: ["К оплате до 24.11: 231 000 сум (за 5 уроков)"] })).immediate.lines.map(plain), ["К оплате до 24.11: 231 000 сум (за 5 уроков)"]);
  assert.deepEqual(F.normalizeBilling(billing({ text: "A\nB" })).immediate.lines, ["A", "B"]);
  const bulk = F.normalizeBulkImmediate({ students: [{ student_id: "a", billing: billing({ lines: ["x"] }) }, { student_id: "b", billing: null }], immediate_total: { text: "Всего к оплате до 24.11: 231 000 сум", lines: ["Всего к оплате до 24.11: 231 000 сум"] } });
  assert.deepEqual(bulk.rows.map((r) => [r.studentId, r.amount, r.lines]), [["a", 231000, ["x"]], ["b", null, []]]);
  assert.deepEqual(bulk.totalLines.map(plain), ["Всего к оплате до 24.11: 231 000 сум"]);
  assert.deepEqual(F.normalizeBulkImmediate({ students: [{ student_id: "a", billing: null }], immediate_total: null }).totalLines, []);
});

test("the balances of the past stays: the name of the state is the server's `kind` - «к оплате» with its term, «долг», «аванс»", () => {
  const rows = PB.pastBalancesOf({ past_balances: [
    { group_id: "g1", group_name: "Физика 9", membership_id: "m1", left_on: "2026-11-17", kind: "due", amount: 100000, due_until: "2026-11-24", text: "В группе «Физика 9» осталось к оплате" },
    { group_id: "g2", group_name: "Алгебра 7", membership_id: "m2", left_on: "2026-11-10", kind: "debt", amount: 120000, text: "x" },
    { group_id: "g3", group_name: "Химия", membership_id: "m3", left_on: "2026-11-10", kind: "advance", amount: 80000, text: "x" },
    { group_id: "g1", group_name: "Физика 9", membership_id: "m4", left_on: "2026-11-17", kind: "due", same_group: true, text: "Уже был в этой группе — осталась сумма к оплате" },
  ] });
  assert.deepEqual(rows.map((r) => plain(PB.pastBalanceNote(r))), [
    "К оплате с прошлого раза 100 000 сум до 24.11 · в «Физика 9», ушёл 17.11",
    "Долг с прошлого раза 120 000 сум · в «Алгебра 7», ушёл 10.11",
    "Аванс с прошлого раза 80 000 сум · в «Химия», ушёл 10.11",
    "К оплате с прошлого раза · в этой же группе, ушёл 17.11",
  ]);
});

test("16А.3 transfer: a sum that stays «к оплате» is a row «К оплате до ДД.ММ · N» (the name by the server's code `due`), a debt - «Долг · N»", () => {
  const due = TE.effectRow({ code: "due", amount: 100000, due_until: "2026-11-24", text: "x" }, 0);
  assert.deepEqual([due.label, plain(due.value)], ["К оплате до 24.11", "100 000 сум"]);
  assert.equal(TE.effectRow({ code: "due", amount: 100000, text: "x" }, 0).label, "К оплате");
  assert.equal(TE.effectRow({ code: "debt", amount: 100000, text: "x" }, 0).label, "Долг");
});

test("16А.3 leaving: the headline of the block is the sentences of the server (stays `debt` / `due`), none of its own; a server without them - silent", () => {
  const stays = [{ code: "debt", text: "К оплате 86 000 сум. Это единственная группа ученика: после ухода сумма станет долгом" }, { code: "advance", text: "Аванс" }, { code: "due", text: "К оплате 10 000 сум до 24.11, срок не меняется" }];
  const membership = { membership_id: "m", group_id: "g", group_name: "A", money: { unpaid: 96000, advance: 0, paid_until: null, charged_after_leave: 0, individual_price_ends: false }, has_open_balance: true, allowed: ["keep", "writeoff"], effects: { kind: "leave", moves: [], ends: [], stays } };
  // PAY-TAILS Б2.4: the outcome of the server by the kind of the block - the debt and the sum «к оплате» here (the advance has its own kind: `settleOutcomeLines`)
  assert.deepEqual(G.settleOutcomeLines(membership), [stays[0].text, stays[2].text]);
  assert.deepEqual(G.settleOutcomeLines({ ...membership, money: { ...membership.money, unpaid: 0, advance: 5 } }), [stays[1].text]);
  assert.equal(G.settleHeadline(membership), `${stays[0].text} ${stays[2].text}`);
  assert.deepEqual(G.settleOutcomeLines({ ...membership, effects: null }), []);
  assert.equal(G.SETTLE_LABEL.forgive(96000).replace(/\s/g, " "), "Простить 96 000 сум");
  assert.ok(!/долг/i.test(G.SETTLE_LABEL.keepUnpaid), "a sum «к оплате» that stays is named neutrally; «Оставить долг» only for a whole debt (`keepUnpaidLabel`)");
});

test("16А.4 the dictionary 3.3 on the screens: «Простить сумму» (menu, window), «Прощено» (row, filter), «Прощено N сум» (message), no «Простить долг» in src", () => {
  assert.equal(M.WRITEOFF_MENU_LABEL, "Простить сумму");
  assert.equal(L.STATEMENT_TYPE_LABEL.writeoff, "Прощено");
  assert.equal(plain(G.settledLines([{ membership_id: "m", action: "writeoff", amount: 120000 }]).join("")), "Прощено 120 000 сум");
  assert.equal(L.writeoffPreviewText({ amount: "", all: true, reason: "" }, 100000), "Будет прощено полностью");
  const fs = require("node:fs");
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const old = walk(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f)).filter((f) => /«Простить долг»|"Простить долг"|прощён\b|Прощение долга|После ухода у ученика долг|К оплате сразу/.test(fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
  assert.deepEqual(old, [], "the old words of the action are gone from the code");
});

test("16А.5 statement: the term under the title of a charge is the server's `open_sub` («до 19.11» / «срок был 06.11»), before the price; the field is absent - no term", () => {
  const full = S.anvarDue();
  const raw = { ...full, rows: full.rows.map((row) => ({ ...row, open_sub: null })) };   // the field is absent (the helper now carries the server's `open_sub`)
  const withSub = { ...raw, rows: raw.rows.map((row) => (row.type === "charge" ? { ...row, open_sub: "до 24.11" } : row)) };
  const subOf = (statement) => L.buildStatementItems(L.normalizeStatement(statement), null).find((item) => item.kind === "row" && item.type === "charge").sub;
  assert.match(plain(subOf(withSub)), /^до 24\.11 · цена /);
  const without = subOf(raw);
  assert.ok(!/до 24\.11/.test(plain(without ?? "")), "no field - no term");
  const debt = { ...raw, rows: raw.rows.map((row) => (row.type === "charge" ? { ...row, open_sub: "срок был 06.11" } : row)) };
  assert.match(plain(subOf(debt)), /^срок был 06\.11/);
});
