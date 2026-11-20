// UX pack §5.1 / §5.1-тер (05.11, the owner's decisions): the window «Внести оплату».  The block «Что изменится» is about the STUDENT only (a table: the name on the left, the number on the right);
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
const sentenceOf = (amount) => plain(X.planView(toshmatovPreview(amount)).sentence);

// PAY-DUE 10.10 (14Б.8): the table of rows of the screen («Погасит долг за сентябрь / Останется долг / из них за прошлые») is gone - the screen adds, splits and names nothing: under the amount stands
// the server's ONE sentence «Погасит долг X · к оплате Y» (the money closes the oldest debt first, then what is «К оплате»).  The numbers are the walk of stage, hand-counted: 800 000 of debt (September, October), 400 000 «К оплате» (November).
test("the sentence under the amount is the server's: the debt is closed first, then «К оплате»", () => {
  assert.equal(sentenceOf(400000), "Погасит долг 400 000 сум");
  assert.equal(sentenceOf(800000), "Погасит долг 800 000 сум");
  assert.equal(sentenceOf(1200000), "Погасит долг 800 000 сум · к оплате 400 000 сум");
  assert.equal(sentenceOf(1000000), "Погасит долг 800 000 сум · к оплате 200 000 сум");
  assert.equal(X.planView(toshmatovPreview(400000)).rows, undefined, "the screen builds no rows of its own");
});

test("the top block names both sums in the server's words, the debt first; the field takes `suggested_amount`", () => {
  const block = require(path.join(root, "src/lib/payments-ledger.ts")).dueBlock(toshmatovPreview(null));
  assert.deepEqual(block.states.map((state) => [state.key, plain(state.text), state.sub]), [["debt", "Долг 800 000 сум", "просрочено 61 день · оплачено до 31.08"], ["due", "К оплате 400 000 сум", "до сегодня"]]);
  assert.equal(block.unpaid, 1200000);
  assert.equal(toshmatovPreview(null).suggested_amount, 1200000);
});

test("the sentence never carries the pay of the teachers", () => {
  const all = [400000, 800000, 1200000].map(sentenceOf).join(" ");
  assert.ok(!/зарплат|Эргашев/i.test(all), all);
});

test("the pay of the teachers is not drawn by the screen in a window of a payment, a write-off, a refund (decision of the owner 05.11); the cancel and the correction of a payment say only the server's own sentence (Money-1 Г)", () => {
  const refund = read("src/components/payments/refund-dialog.tsx");
  assert.ok(!/MoneyEffectsBlock|PayrollConsequence|useDryRunForm|usePaymentEffects|dryRun|money_effects|toastWithEffects/.test(refund), "refund-dialog");
  // Money-2 Э6 (decision of the owner 16.11): the window of a forgiveness shows ONE line - what the forgiveness does to the pay of the teacher (`money_effects.forgiveness`, the server's sum); no table of sheets
  const writeoff = read("src/components/payments/writeoff-dialog.tsx");
  assert.ok(!/MoneyEffectsBlock|PayrollConsequence|useDryRunForm|usePaymentEffects|toastWithEffects/.test(writeoff), "writeoff-dialog");
  assert.ok(/<ForgivenessLine/.test(writeoff));
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
