// «Деньги-1 / В» (а): the front no longer reads the OLD fields of the debtors (the server removes them in its last commit): `summary.debt_total / students_with_debt / debtors / memberships_with_debt /
// due / expired / students_due / students_expired / buckets.debt`, `row.reason`, `position.debt_total / students_with_debt`, `collection.*.debt`.  One definition of a debtor: `debt_split`, `debtors_debt`.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const { summaryToState } = require(path.join(root, "src/lib/payments-summary.ts"));
const P = require(path.join(root, "src/lib/payments.ts"));
const V = require(path.join(root, "src/lib/payments-income-v2.ts"));

const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));

test("no source reads the old fields of the debtors", () => {
  const banned = [
    /summary\??\.debt_total/, /summary\??\.students_with_debt/, /summary\??\.memberships_with_debt/, /summary\??\.students_due/, /summary\??\.students_expired/,
    /summary\??\.(due|expired)\b/, /buckets\??\.debt\b.*summary|summary.*buckets\??\.debt\b/, /\brow\.reason\b/, /position\??\.debt_total/, /position\??\.students_with_debt/, /position\??\.memberships_with_debt/,
  ];
  const found = [];
  for (const file of [...walk("src"), ...walk("console")].filter((f) => !f.includes("node_modules") && !f.includes(".next"))) {
    const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
    lines.forEach((line, i) => { if (!line.trim().startsWith("//") && !line.trim().startsWith("*") && banned.some((re) => re.test(line))) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 100)}`); });
  }
  // `row.reason` of other things (a decision row, a price) is not a debtor's: only the files of the list of payments are checked for it
  const real = found.filter((entry) => !/^console\/|income-decisions|group-price|payments-decisions|refund-receipt|openings|attendance|excuse|substitution|payf|lesson/.test(entry));
  assert.deepEqual(real, []);
});

test("the summary is read from the split alone: the same numbers with and without the old fields; without the split every debt number is 0", () => {
  const split = { debtors: 3, debtors_memberships: 4, debtors_debt_total: 600000, waiting_students: 1, waiting_memberships: 1, waiting_debt_total: 300000, all_debt_total: 900000, all_students_with_debt: 4, expired: 2, due: 5, students_expired: 2, students_due: 4 };
  const base = { as_of: "2026-11-10", expiring: 1, none: 0, active: 4, tracked_total: 9, period_mode: "calendar", advance_total: 5000, buckets: { expiring: 1, active: 4, paused: 0 }, debt_split: split };
  const withOld = summaryToState({ ...base, due: 99, expired: 99, students_due: 99, students_expired: 99, debt_total: 999, students_with_debt: 99, debtors: 99, memberships_with_debt: 99, buckets: { debt: 99, expiring: 1, active: 4, paused: 0 } });
  const without = summaryToState(base);
  assert.deepEqual(without, withOld);
  assert.deepEqual([without.debtTotal, without.debtors, without.due, without.expired, without.studentsDue, without.studentsExpired, without.buckets.debt, without.buckets.waiting], [600000, 3, 5, 2, 4, 2, 4, 1]);
  const none = summaryToState({ ...base, debt_split: undefined, debt_total: 999, students_with_debt: 5, debtors: 5, due: 7 });
  assert.deepEqual([none.debtTotal, none.debtors, none.due, none.studentsWithDebt], [0, 0, 0, 0]);
});

test("the reason line of a debtor does not use row.reason; the type has no such field", () => {
  assert.equal(P.debtReasonText({ status: "expired", debt: 100000, days_overdue: 3, last_payment: { paid_on: "2026-10-01" }, reason: "ИЗ СТАРОГО ПОЛЯ" }), "Просрочено на 3 дня");
  assert.equal(P.debtReasonText({ status: "none", debt: 100000, days_overdue: 0, last_payment: null }), "Ещё не платил");
  assert.doesNotMatch(read("src/lib/payments.ts"), /why the row is among the debtors, in the server's words/);
});

test("the debt of the position is debtors + waiting; the collection reads debtors_debt; the card needs no old field", () => {
  const overview = V.normalizeOverview({ position: { debtors_debt_total: 600000, debt_waiting_total: 300000, students_debtors: 3, students_waiting: 1, advance_total: 0, students_with_advance: 0 }, collection: { month: "2026-11", month_label: "ноябрь 2026", total: { charged: 100, paid: 50, debtors_debt: 40, debt_waiting: 10, students_with_debt: 3, students_waiting: 1 }, groups: [{ group_id: "g", group_name: "A", charged: 100, paid: 50, debtors_debt: 40, debt_waiting: 10, students_with_debt: 3, students_waiting: 1 }] } });
  assert.equal(V.debtCard(overview).amount.replace(/\s/g, " "), "600 000 сум");
  assert.deepEqual(Object.keys(overview.position).filter((k) => /^(debt_total|students_with_debt|memberships_with_debt)$/.test(k)), []);
  assert.equal(V.collectionRows(overview.collection)[0].debt, 40);
  assert.equal(V.collectionDebtNote(overview.collection, 600000 + 300000)?.includes("50"), true);
  assert.match(read("src/components/payments/income-page.tsx"), /position\.debtors_debt_total \+ overview\.data\.position\.debt_waiting_total/);
});

test("the toast after a forgiveness names the period of the server and nothing of the teacher", () => {
  const text = (closes) => P.writeoffDoneText({ writeoff: { amount: 300000 }, closes }).replace(/ /g, " ");
  assert.equal(text({ from: "2026-10-06", to: "2026-11-05", label: "06.10–05.11" }), "Прощён долг 300 000 сум за 06.10–05.11");
  assert.equal(text(null), "Прощён долг 300 000 сум");
  assert.doesNotMatch(text({ from: "a", to: "b", label: "06.10–05.11" }), /учител|зарплат/i);
});
