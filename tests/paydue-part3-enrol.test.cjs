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
