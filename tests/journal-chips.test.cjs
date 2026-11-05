// UX pack №26: the head of a column of the journal has at most TWO chips (the rest behind «ещё N»), and the menu of a column says in one grey line what each action does.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const root = path.join(__dirname, "..");
const { lib } = require("./helpers/money1-env.cjs");
const J = lib("journal-chips.ts");

const mark = (text) => ({ text, tone: "blue" });

test("at most two chips: the marks first, then who held the lesson, «исправлен», «задним числом»; the rest is counted and named", () => {
  const all = J.headerChipPlan({ marks: [mark("Доп. урок: ждёт решения"), mark("Замена: Иванов И.")], teacherLabel: "Иванов И.", correctionLabel: "исправлен", backdatedLabel: "Оформлен задним числом" });
  assert.deepEqual([all.marks.length, all.teacher, all.correction, all.backdated], [2, false, false, false]);
  assert.deepEqual(all.hidden, ["Иванов И.", "исправлен", "Оформлен задним числом"]);
  const one = J.headerChipPlan({ marks: [mark("Доп. урок: ждёт решения")], teacherLabel: "Иванов И.", correctionLabel: "исправлен", backdatedLabel: null });
  assert.deepEqual([one.marks.length, one.teacher, one.correction, one.backdated, one.hidden], [1, true, false, false, ["исправлен"]]);
  const none = J.headerChipPlan({ marks: [], teacherLabel: null, correctionLabel: "исправлен", backdatedLabel: "Оформлен задним числом" });
  assert.deepEqual([none.marks.length, none.teacher, none.correction, none.backdated, none.hidden], [0, false, true, true, []]);
  const few = J.headerChipPlan({ marks: [mark("a"), mark("b"), mark("c")], teacherLabel: null, correctionLabel: null, backdatedLabel: null });
  assert.deepEqual([few.marks.map((m) => m.text), few.hidden], [["a", "b"], ["c"]]);
});

test("every item of the menu of a column that moves money has its grey line, in the words of the dictionary; the journal draws them and caps the head", () => {
  assert.deepEqual(Object.keys(J.COLUMN_ACTION_HINT).sort(), ["cancel_missed", "correct", "reconcile", "return", "return_review", "undo_decision"]);
  for (const text of Object.values(J.COLUMN_ACTION_HINT)) assert.ok(/[.]$/.test(text) && !/Вычет|вычет|оплатит|разбор/.test(text), text);
  const journal = fs.readFileSync(path.join(root, "src/components/groups/group-attendance-journal.tsx"), "utf8");
  for (const action of Object.keys(J.COLUMN_ACTION_HINT)) assert.match(journal, new RegExp(`COLUMN_ACTION_HINT\\.${action}\\b`), action);
  assert.match(journal, /const chipPlan = headerChipPlan\(/);
  assert.match(journal, /marks=\{chipPlan\.marks\}/);
});
