// UX pack §5.1 / §5.1-тер (05.11, the owner's decisions): the window «Оплата от ученика».  The block «Что изменится» is about the STUDENT only (a table: the name on the left, the number on the right);
// the pay of the teachers is NOT in the windows of a payment at all (nor in their toasts) - it lives in «Зарплата».  The numbers are the walk of stage: Тошматов Бобур owes 1 200 000 (Sept., Oct., Nov. 400 000
// each) and pays 400 000.
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
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const X = require(path.join(root, "src/lib/payment-plan.ts"));
const E = require(path.join(root, "src/lib/money-effects.ts"));
const { toshmatovPreview, STAGE_EFFECTS } = require("./helpers/stage-numbers.cjs");
const plain = (text) => text.replace(/ /g, " ");
const rowsOf = (amount) => X.planView(toshmatovPreview(amount)).rows.map((row) => [plain(row.label), row.amount, row.tone]);

test("the student's rows: 400 000 closes September, 800 000 of debt stay, 400 000 of it for the past months (muted)", () => {
  assert.deepEqual(rowsOf(400000), [
    ["Погасит долг за сентябрь", 400000, "plain"],
    ["Останется долг", 800000, "strong"],
    ["из них за прошлые месяцы", 400000, "muted"],
  ]);
});

test("the rows follow the amount: two months, the whole debt, a part of a month", () => {
  assert.deepEqual(rowsOf(800000), [
    ["Погасит долг за сентябрь", 400000, "plain"], ["Погасит долг за октябрь", 400000, "plain"], ["Останется долг", 400000, "strong"],
  ], "past debt paid in full: the rest is the running month only, so no «из них за прошлые»");
  assert.deepEqual(rowsOf(1200000).slice(0, 4), [
    ["Погасит долг за сентябрь", 400000, "plain"], ["Погасит долг за октябрь", 400000, "plain"], ["Пойдёт в ноябрь", 400000, "plain"], ["Долга не останется", null, "strong"],
  ], "no debt left: said without a number");
  assert.deepEqual(rowsOf(150000).slice(0, 3), [["Погасит часть долга за сентябрь", 150000, "plain"], ["Останется долг", 1050000, "strong"], ["из них за прошлые месяцы", 650000, "muted"]]);
});

test("the rows never carry the pay of the teachers", () => {
  const all = rowsOf(400000).map((row) => row[0]).join(" ");
  assert.ok(!/зарплат|Эргашев/i.test(all), all);
});

test("the pay of the teachers is not drawn by the screen in a window of a payment, a write-off, a refund (decision of the owner 05.11); the cancel and the correction of a payment say only the server's own sentence (Money-1 Г)", () => {
  for (const file of ["writeoff-dialog", "refund-dialog"]) {
    const source = read(`src/components/payments/${file}.tsx`);
    assert.ok(!/MoneyEffectsBlock|PayrollConsequence|useDryRunForm|usePaymentEffects|dryRun|money_effects|toastWithEffects/.test(source), file);
  }
  for (const file of ["payment-dialog", "record-void-modal"]) {
    const source = read(`src/components/payments/${file}.tsx`);
    assert.ok(/<MoneyEffectsBlock[^>]*serverText/.test(source), `${file}: «Что изменится» is the server's sentence`);
    assert.ok(!/PayrollConsequence|useDryRunForm|usePaymentEffects|toastWithEffects/.test(source), file);
  }
  for (const file of ["payments-page", "statement-view", "membership-payments", "membership-row-actions"]) {
    assert.ok(!/toastWithEffects/.test(read(`src/components/payments/${file}.tsx`)), `${file}: the toast of a payment is the student's only`);
  }
  assert.ok(!/toastWithEffects/.test(read("src/components/groups/group-payments-tab.tsx")));
  // the toast of the student's money carries what the window lists, and no sheet
  assert.deepEqual(E.studentToast(["Долг был 100 000 сум"]), { tone: "success", details: ["Долг был 100 000 сум"] });
  assert.deepEqual(E.studentToast(), { tone: "success", details: [] });
});

test("the lessons keep the pay of the teachers as before: the answer of an action on a lesson still reads as «Зарплата за сентябрь вырастет …»", () => {
  const lines = E.effectLines(E.normalizeMoneyEffects(STAGE_EFFECTS), { today: "2026-11-05" });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, "Зарплата за сентябрь вырастет:");
  assert.equal(lines[0].note, "Сентябрь закрыт: сохраните новые суммы, чтобы они вошли в выплату.");
});
