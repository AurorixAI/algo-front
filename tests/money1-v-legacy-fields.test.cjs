// «Деньги-1 / В» (а) → PAY-DUE 10.2: the front no longer reads the OLD fields of the debtors (the server removed them): `debt_split.*`, `students_waiting`, `debt_waiting*`, `debtors_debt*`, `students_with_debt`,
// `students_due` / `students_expired`, `past_debt_total`, and on a row `past_debt` / `current_due` / `tab` / `waiting_*` / `debt_reason` / `reason` / `bucket`.  ONE meaning of the unpaid sum: `debt_total` / `due_total` of the summary.
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
    /debt_split/, /students_waiting/, /debt_waiting/, /debtors_debt/, /students_with_debt/, /students_due\b/, /students_expired/, /past_debt_total/, /memberships_with_debt/,
    /\.waiting_(until|reason)/, /\.debt_reason\b/, /\brow\??\.(past_debt|current_due)\b/, /\brow\??\.tab\b/, /\.debt_age_days/,
  ];
  const found = [];
  for (const file of [...walk("src"), ...walk("console")].filter((f) => !f.includes("node_modules") && !f.includes(".next"))) {
    const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
    lines.forEach((line, i) => { if (!line.trim().startsWith("//") && !line.trim().startsWith("*") && banned.some((re) => re.test(line))) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 100)}`); });
  }
  const real = found.filter((entry) => !/^console\//.test(entry));
  assert.deepEqual(real, []);
});

test("the summary is read from the new fields alone: the same numbers with and without the old ones; without them every number is 0 / null", () => {
  const base = { as_of: "2026-11-10", expiring: 1, none: 0, active: 4, tracked_total: 9, period_mode: "calendar", advance_total: 5000, debt_total: 600000, debtors: 3, due_total: 300000, due_students: 1, buckets: { debtors: 3, to_pay: 1, expiring: 1, active: 4, paused: 0 } };
  const withOld = summaryToState({ ...base, due: 99, expired: 99, students_due: 99, students_expired: 99, students_with_debt: 99, memberships_with_debt: 99, debt_split: { debtors: 77, debtors_debt_total: 1 } });
  const without = summaryToState(base);
  assert.deepEqual(without, withOld);
  assert.deepEqual([without.debtTotal, without.debtors, without.dueTotal, without.dueStudents, without.tabs.debtors, without.tabs.to_pay], [600000, 3, 300000, 1, 3, 1]);
  const none = summaryToState({ as_of: "2026-11-10", period_mode: "calendar", students_with_debt: 5, due: 7, debt_split: { debtors: 5 } });
  assert.deepEqual([none.debtTotal, none.debtors, none.dueTotal, none.dueStudents], [0, null, 0, null]);
});

test("a row's words are the server's (`debt_text` / `debt_sub` / `due_text` / `state_text`) - the MONTH of a debt is not worked out on the screen (rule 113 → 143)", () => {
  assert.equal(P.debtReasonText, undefined);
  const PS = require(path.join(root, "src/lib/pay-state.ts"));
  assert.equal(PS.payLabel({ state: "debt", debt_amount: 150000, debt_text: "Долг 150 000 сум", debt_sub: "просрочено 3 дня", state_text: "Долг 150 000 сум" }, "debtors").sub, "просрочено 3 дня");
  assert.equal(PS.payLabel({ state: "none", state_text: null }).text, null);
});

test("the position is the server's debt and «К оплате»; the collection reads `debt` / `due`; the card needs no old field", () => {
  const overview = V.normalizeOverview({ position: { debt_total: 600000, due_total: 300000, debtors: 3, due_students: 1, due_text: "К оплате 300 000 сум", debt_text: "Долг 600 000 сум", advance_total: 0, students_with_advance: 0 }, collection: { month: "2026-11", month_label: "ноябрь 2026", total: { charged: 100, paid: 50, debt: 40, due: 10, students: 3, debtors: 1, due_students: 1, pct: 50 }, groups: [{ group_id: "g", group_name: "Г", charged: 100, paid: 50, debt: 40, due: 10, students: 3, debtors: 1, due_students: 1, pct: 50 }] } });
  assert.equal(V.debtCard(overview).amount.replace(/\s/g, " "), "600 000 сум");
  assert.equal(V.debtCard(overview).due.replace(/\s/g, " "), "К оплате 300 000 сум", "14А.6: the words of the part within its term are the server's `due_text`, nothing is glued on the screen");
  assert.equal(V.debtCard({ ...overview, position: { ...overview.position, due_text: null } }).due, "", "the server said nothing - the card says nothing (151)");
  assert.deepEqual(Object.keys(overview.position).filter((k) => /^(past_debt_total|students_with_debt|debtors_debt_total|debt_waiting_total|students_waiting|students_debtors)$/.test(k)), []);
  assert.equal(V.collectionRows(overview.collection)[0].debt, 40);
  assert.equal(V.collectionRows(overview.collection)[0].dueAmount, 10);
  assert.equal(V.collectionDebtNote(overview.collection, 600000 + 300000)?.includes("50"), true);
  assert.match(read("src/components/payments/income-page.tsx"), /position\.debt_total \+ overview\.data\.position\.due_total/);
});

test("the toast after a forgiveness names the period of the server and nothing of the teacher", () => {
  const text = (closes) => P.writeoffDoneText({ writeoff: { amount: 300000 }, closes }).replace(/ /g, " ");
  assert.equal(text({ from: "2026-10-06", to: "2026-11-05", label: "06.10–05.11" }), "Прощён долг 300 000 сум за 06.10–05.11");
  assert.equal(text(null), "Прощён долг 300 000 сум");
  assert.doesNotMatch(text({ from: "a", to: "b", label: "06.10–05.11" }), /учител|зарплат/i);
});
