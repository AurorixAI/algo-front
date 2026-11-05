// UX pack №16: the page «Замены» - the decisions about the additional lessons stand OVER the table of the requests; the column «Причина» is not drawn when no row has a reason.
const assert = require("node:assert/strict");
const test = require("node:test");
const { component, read } = require("./helpers/money1-env.cjs");

const cells = component("substitutions/journal-cells.tsx");

test("a row has a reason to show: a request of a teacher with a label or a code, a record of the system with its plate; a record without a request (a move, an assignment) has none", () => {
  assert.equal(cells.hasReason({ origin: "teacher", reasonCode: "sick", reasonLabel: "Болезнь" }), true);
  assert.equal(cells.hasReason({ origin: "teacher", reasonCode: "sick", reasonLabel: null }), true);
  assert.equal(cells.hasReason({ origin: "teacher", reasonCode: null, reasonLabel: null }), false);
  assert.equal(cells.hasReason({ origin: "system", trigger: null, comment: "Заменяющий Иванов больше не ведёт уроки" }), true, "the plate «Замена выбыла»");
  assert.equal(cells.hasReason({ origin: "system", trigger: "day_off", comment: null }), false, "an action without a request: no reason");
});

test("the page draws the column only when a row has a reason: the template, the header, the aligns and the cells follow; the decisions are over the table", () => {
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /const showReason = items\.some\(hasReason\);/);
  assert.match(page, /filter\(\(label\) => showReason \|\| label !== "Причина"\)/);
  assert.match(page, /COLS_PENDING_NO_REASON = "xl:grid-cols-\[minmax\(0,1\.3fr\)_minmax\(0,1fr\)_220px_104px_40px\]"/);
  assert.match(page, /COLS_DECIDED_NO_REASON = "xl:grid-cols-\[minmax\(0,1\.3fr\)_minmax\(0,1\.3fr\)_minmax\(0,1\.1fr\)_104px_40px\]"/);
  assert.equal((page.match(/\{showReason && <div/g) || []).length, 2, "both cells follow the column");
  assert.ok(page.indexOf("<OneOffDecisionsBlock") < page.indexOf('<section className={!loading && !loadError && items.length > 0'), "the decisions are over the section of the requests");
});
