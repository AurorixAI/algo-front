// «Внести оплату» (22.10): amount first, chips that carry what is due, «Что будет после сохранения» in the future tense,
// a required method without «Другое», the amount in the button.  Matrix: artifacts/partner_doc_check/paydialog_spec.md.
// The money is the server's (pay2 fixtures + previews built in the contract's shape); the words are lib/payment-plan.ts.
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
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/pay2", `${name}.json`), "utf8"));
const P = require(path.join(root, "src/lib/payments.ts"));
const L = require(path.join(root, "src/lib/payments-ledger.ts"));
const X = require(path.join(root, "src/lib/payment-plan.ts"));
const plain = (text) => text.replace(/ /g, " ");
const money = (n) => plain(P.formatMoney(n));

// ── a preview in the contract's shape, filled like the server fills it (oldest unpaid first) ─────────────────────────
const seg = (id, from, to, charge, paid, bucket, kind = "period") => ({
  id, kind, period_from: from, period_to: to, billable_days: 30, days_text: null, price: { amount: charge }, charge, basis: "full", lessons: null,
  paid, written_off: 0, unpaid: charge - paid, covered_days: 0, covered_through: null, partial_credit: 0, state: "open", bucket, remaining: charge - paid,
});
function preview({ segments, amount = null, mode = "calendar", asOf = "2026-10-15", paidUntil = null, advanceStart = ["2026-11-01", "2026-11-30"], warnings = [], price = 550000 }) {
  const open = segments.filter((s) => s.unpaid > 0);
  const pastDebt = open.filter((s) => s.bucket === "past_debt").reduce((a, s) => a + s.unpaid, 0);
  const currentDue = open.filter((s) => s.bucket === "current").reduce((a, s) => a + s.unpaid, 0);
  const due = { debt: pastDebt + currentDue, past_debt: pastDebt, current_due: currentDue, advance: 0, segments: open, paid_until: null, days_overdue: null };
  let result = null;
  if (amount !== null) {
    let left = amount;
    const allocations = [];
    for (const s of open) {
      if (left <= 0) break;
      const part = Math.min(left, s.unpaid);
      left -= part;
      allocations.push({ segment_id: s.id, period_from: s.period_from, period_to: s.period_to, amount: part, days: 1, bucket: s.bucket, closes: part === s.unpaid, label: "Закрыла долг (серверная подпись прошедшего времени)", price: s.charge, segment_remaining_after: s.unpaid - part });
    }
    if (left > 0) allocations.push({ segment_id: "seg:next", period_from: advanceStart[0], period_to: advanceStart[1], amount: left, days: 1, bucket: "advance", closes: false, label: "Аванс на следующий период", price, segment_remaining_after: price - left });
    const pastAfter = open.filter((s) => s.bucket === "past_debt").reduce((a, s) => a + (allocations.find((x) => x.segment_id === s.id)?.segment_remaining_after ?? s.unpaid), 0);
    const currentAfter = open.filter((s) => s.bucket === "current").reduce((a, s) => a + (allocations.find((x) => x.segment_id === s.id)?.segment_remaining_after ?? s.unpaid), 0);
    result = {
      allocations, debt_after: pastAfter + currentAfter, past_debt_after: pastAfter, current_due_after: currentAfter, advance_after: left > 0 ? left : 0,
      paid_until_before: null, paid_until_after: paidUntil, status_after: "active", days_overdue_after: null, partial_credit_after: 0, lessons: null, price_ahead: [], summary_text: "Закроет долг",
    };
  }
  return L.normalizePreview({ as_of: asOf, mode, price: { amount: price }, due, suggested_amount: pastDebt + currentDue, amount, result, warnings });
}
// August had 508 000 of 550 000 paid (42 000 left), September unpaid, October is running: 592 000 debt + 550 000 current.
const SEGS = () => [
  seg("aug", "2026-08-01", "2026-08-31", 550000, 508000, "past_debt"),
  seg("sep", "2026-09-01", "2026-09-30", 550000, 0, "past_debt"),
  seg("oct", "2026-10-01", "2026-10-31", 550000, 0, "current"),
];
const plan = (amount, extra = {}) => X.planView(preview({ segments: SEGS(), amount, ...extra }));
const lines = (p) => p.lines.map((line) => [line.label, line.amount]);
const said = (p) => plain(p.sentence);

// ── chips: they carry what the old top block said ───────────────────────────────────────────────────────────────────

test("chips: «Закрыть долг · 592 000 сум» and «Долг + октябрь · 1 142 000 сум»; no top block, no «2 периода»", () => {
  const chips = X.quickAmounts(preview({ segments: SEGS() }));
  assert.deepEqual(chips.map((chip) => [chip.key, plain(chip.label), chip.amount]), [
    ["debt", "Закрыть долг · 592 000 сум", 592000],
    ["all", "Долг + октябрь · 1 142 000 сум", 1142000],
  ]);
  const dialog = read("src/components/payments/payment-dialog.tsx");
  assert.doesNotMatch(dialog, /DueBlock|Всего к оплате|Текущий период|Только долг|Долг и текущий период|periода|2 периода/);
});

test("chips: no debt → «За октябрь», «Остаток за октябрь» after a part payment; a period that is not a month is «текущий период»", () => {
  const only = X.quickAmounts(preview({ segments: [seg("oct", "2026-10-01", "2026-10-31", 550000, 0, "current")] }));
  assert.deepEqual(only.map((chip) => [chip.key, plain(chip.label)]), [["current", "За октябрь · 550 000 сум"]]);
  const part = X.quickAmounts(preview({ segments: [seg("oct", "2026-10-01", "2026-10-31", 550000, 200000, "current")] }));
  assert.equal(plain(part[0].label), "Остаток за октябрь · 350 000 сум");
  const shifted = X.quickAmounts(L.normalizePreview(fixture("e1_preview_due")));
  assert.deepEqual(shifted.map((chip) => plain(chip.label)), ["Закрыть долг · 269 000 сум", "Долг + текущий период · 769 000 сум"]);
  const noDebt = X.quickAmounts(L.normalizePreview(fixture("e2_preview_due")));
  assert.deepEqual(noDebt.map((chip) => plain(chip.label)), ["За октябрь · 323 000 сум"]);
  // nothing due: no chip, a calm line (and the «+ следующий месяц» chip is not invented: the server gives no next price in the due block)
  const paidUp = preview({ segments: [seg("oct", "2026-10-01", "2026-10-31", 550000, 550000, "current")] });
  assert.deepEqual(X.quickAmounts(paidUp), []);
  assert.equal(X.noChipsHint(paidUp), "Долга нет. Всё, что внесёте, пойдёт вперёд.");
  assert.equal(X.noChipsHint(preview({ segments: SEGS() })), null);
  assert.equal(X.quickAmounts(null).length, 0);
});

test("chips: selected only while the field holds exactly that amount; a student who has left is offered the debt only", () => {
  const [debt, all] = X.quickAmounts(preview({ segments: SEGS() }));
  assert.equal(X.chipSelected(all, 1142000), true);
  assert.equal(X.chipSelected(all, 1142001), false); // typing another value clears the selection
  assert.equal(X.chipSelected(debt, 592000), true);
  assert.equal(X.chipSelected(debt, null), false);
  assert.deepEqual(X.quickAmounts(preview({ segments: SEGS() }), { leftOnly: true }).map((chip) => chip.key), ["debt"]);
});

// ── the matrix: sentence and breakdown for every amount ────────────────────────────────────────────────────────────

test("= exact debt: closes August and September, October stays unpaid", () => {
  const p = plan(592000);
  assert.equal(said(p), "Закроет долг за август и сентябрь. Октябрь останется неоплаченным: 550 000 сум.");
  assert.deepEqual(lines(p).map(([l, a]) => [l, a]), [["Долг за август (остаток)", 42000], ["Долг за сентябрь", 550000]]);
});

test("= debt + current: pays October too, until 31 October, no debt left", () => {
  const p = plan(1142000, { paidUntil: "2026-10-31" });
  assert.equal(said(p), "Закроет долг за август и сентябрь и оплатит октябрь. Оплачено до 31 октября, долга не останется.");
  assert.deepEqual(lines(p), [["Долг за август (остаток)", 42000], ["Долг за сентябрь", 550000], ["Октябрь", 550000]]);
  assert.equal(lines(p).reduce((a, [, n]) => a + n, 0), 1142000); // the lines add up to the amount
});

test("< debt: partial - August closes, September keeps 92 000", () => {
  const p = plan(500000);
  assert.equal(said(p), "Закроет долг за август, за сентябрь останется 92 000 сум.");
  assert.deepEqual(lines(p), [["Долг за август (остаток)", 42000], ["Долг за сентябрь (часть)", 458000]]);
  // smaller than the first period: a part of the debt only, and the whole overdue rest is said once
  assert.equal(said(plan(30000)), "Оплатит часть долга за август, останется 12 000 сум. Всего долга останется 562 000 сум.");
});

test("part of the running period after the debt: «за октябрь останется …»", () => {
  const p = plan(800000);
  assert.equal(said(p), "Закроет долг за август и сентябрь, за октябрь останется 342 000 сум.");
  assert.deepEqual(lines(p).at(-1), ["Октябрь (часть)", 208000]);
  const only = X.planView(preview({ segments: [seg("oct", "2026-10-01", "2026-10-31", 550000, 0, "current")], amount: 100000 }));
  assert.equal(said(only), "Оплатит октябрь частично, останется 450 000 сум.");
});

test("> total: an advance, until the date the server gives", () => {
  const p = plan(1342000, { paidUntil: "2026-11-12" });
  assert.equal(said(p), "Закроет долг за август и сентябрь и оплатит октябрь, 200 000 сум останутся авансом (хватит до 12 ноября).");
  assert.deepEqual(lines(p).at(-1), ["Аванс", 200000]);
  // no debt: the owner's own example
  const free = X.planView(preview({ segments: [seg("oct", "2026-10-01", "2026-10-31", 550000, 0, "current")], amount: 750000, paidUntil: "2026-11-12" }));
  assert.equal(said(free), "Оплатит октябрь, 200 000 сум останутся авансом (хватит до 12 ноября).");
  assert.deepEqual(lines(free), [["Октябрь", 550000], ["Аванс", 200000]]);
  // no date from the server (a package of lessons): just «останутся авансом»
  const bare = plan(1342000);
  assert.match(said(bare), /200 000 сум останутся авансом\.$/);
  assert.doesNotMatch(said(bare), /хватит до/);
});

test("no debt and the running period already paid: the whole amount is an advance", () => {
  const paidUp = preview({ segments: [seg("oct", "2026-10-01", "2026-10-31", 550000, 550000, "current")], amount: 300000, paidUntil: "2026-11-17" });
  const p = X.planView(paidUp);
  assert.equal(said(p), "Вся сумма останется авансом (хватит до 17 ноября).");
  assert.deepEqual(lines(p), [["Аванс", 300000]]);
});

test("only the running period due: «Оплатит октябрь. Оплачено до 31 октября.»", () => {
  const p = X.planView(preview({ segments: [seg("oct", "2026-10-01", "2026-10-31", 550000, 0, "current")], amount: 550000, paidUntil: "2026-10-31" }));
  assert.equal(said(p), "Оплатит октябрь. Оплачено до 31 октября.");
});

test("a year that is not this year is named; a period that is not a month is named by dates", () => {
  const old = X.planView(preview({ asOf: "2027-01-10", segments: [seg("dec", "2026-12-01", "2026-12-31", 550000, 0, "past_debt"), seg("jan", "2027-01-01", "2027-01-31", 550000, 0, "current")], amount: 550000 }));
  assert.match(said(old), /^Закроет долг за декабрь 2026\./);
  const real = X.planView(L.normalizePreview(fixture("e1_preview_769000")));
  assert.equal(said(real), "Закроет долг за период 15.09–14.10 и оплатит период 15.10–14.11. Оплачено до 14 ноября, долга не останется.");
  assert.deepEqual(lines(real), [["Долг за 15.09–14.10 (остаток)", 269000], ["15.10–14.11", 500000]]);
  const over = X.planView(L.normalizePreview(fixture("e1_preview_790000")));
  assert.equal(said(over), "Закроет долг за период 15.09–14.10 и оплатит период 15.10–14.11, 21 000 сум останутся авансом (хватит до 15 ноября).");
  const part = X.planView(L.normalizePreview(fixture("e1_preview_250000")));
  assert.equal(said(part), "Оплатит часть долга за период 15.09–14.10, останется 19 000 сум.");
  assert.deepEqual(lines(part), [["Долг за 15.09–14.10 (часть)", 250000]]);
});

test("package (lessons) mode keeps working: packages are named, the lessons line stays, no «оплачено до»", () => {
  const held = X.planView(L.normalizePreview(fixture("e5_preview_650000_held14")));
  assert.equal(said(held), "Закроет долг за пакет 25.09–21.10, за пакет 23.10–26.10 останется 50 000 сум.");
  assert.deepEqual(lines(held), [["Долг за пакет 25.09–21.10", 600000], ["Пакет 23.10–26.10 (часть)", 50000]]);
  assert.equal(plain(held.lessons), "Уроков оплачено: 0 → 13, осталось 0, не оплачено 1");
  const adv = X.planView(L.normalizePreview(fixture("e5_preview_630000_held12")));
  assert.equal(said(adv), "Закроет долг за пакет 25.09–21.10, 30 000 сум останутся авансом.");
  assert.deepEqual(lines(adv).at(-1), ["Аванс", 30000]);
  assert.doesNotMatch(said(adv), /Оплачено до/);
  const chips = X.quickAmounts(L.normalizePreview(fixture("e5_preview_650000_held14")));
  assert.deepEqual(chips.map((chip) => plain(chip.label)), ["Закрыть долг · 600 000 сум", "Долг + текущий пакет · 700 000 сум"]);
});

test("lessons mode, nothing due: «Пойдёт на будущие уроки — хватит на N уроков», the line «На будущие уроки» (inc5 P08); the month mode keeps «аванс»", () => {
  const lessonsPreview = (left) => {
    const p = preview({ segments: [], amount: 600000, mode: "lessons" });
    p.result.lessons = left === null ? null : { covered_before: 0, covered_after: left, left_after: left, unpaid_after: 0 };
    return p;
  };
  const twelve = X.planView(lessonsPreview(12));
  assert.equal(said(twelve), "Пойдёт на будущие уроки — хватит на 12 уроков.");
  assert.deepEqual(lines(twelve), [["На будущие уроки", 600000]]);
  assert.equal(plain(twelve.lessons), "Уроков оплачено: 0 → 12, осталось 12");
  assert.equal(said(X.planView(lessonsPreview(1))), "Пойдёт на будущие уроки — хватит на 1 урок.");
  assert.equal(said(X.planView(lessonsPreview(3))), "Пойдёт на будущие уроки — хватит на 3 урока.");
  // N is not known: no number is invented
  assert.equal(said(X.planView(lessonsPreview(null))), "Пойдёт на будущие уроки.");
  assert.equal(said(X.planView(lessonsPreview(0))), "Пойдёт на будущие уроки.");
  for (const left of [12, 1, null]) assert.doesNotMatch(said(X.planView(lessonsPreview(left))) + lines(X.planView(lessonsPreview(left))).flat().join(" "), /аванс/i);
  // the month mode is unchanged
  const month = X.planView(preview({ segments: [seg("oct", "2026-10-01", "2026-10-31", 550000, 550000, "current")], amount: 300000, paidUntil: "2026-11-17" }));
  assert.equal(said(month), "Вся сумма останется авансом (хватит до 17 ноября).");
  assert.deepEqual(lines(month), [["Аванс", 300000]]);
});

test("the price rise warning of the server stays (amber note), not as a sentence of ours", () => {
  const rise = X.planView(L.normalizePreview(fixture("e9_preview_price_ahead_1069000")));
  assert.match(plain(rise.priceAhead.join(" ")), /Цена периода 15\.11–14\.12 — 600 000 сум \(сейчас 500 000 сум\)/);
  assert.deepEqual(rise.warnings, []);
});

// ── no amount, a wrong amount, a huge amount ───────────────────────────────────────────────────────────────────────

test("empty / zero / non-numeric amount: no calculation, a calm hint, the button is off; a huge amount is not asked for", () => {
  assert.equal(X.PLAN_EMPTY_HINT, "Введите сумму — здесь появится, куда пойдут деньги");
  assert.equal(X.PLAN_TITLE, "Что будет после сохранения");
  assert.equal(X.planView(preview({ segments: SEGS() })), null); // asked without an amount: nothing to word
  for (const text of ["", "0", "abc", "  ", "-"]) assert.equal(L.previewAmount(text), null, JSON.stringify(text));
  assert.equal(L.previewAmount(P.reformatMoneyTyping("12abc34")), 1234);
  assert.equal(L.previewAmount("99999999999"), null); // > 10^10
  const form = (amount, method = "cash") => ({ amount, paidOn: "2026-10-22", method, note: "", reason: "" });
  assert.equal(X.payBlocker(form(""), "2026-10-22", null), "Введите сумму");
  assert.equal(X.payBlocker(form("0"), "2026-10-22", null), "Сумма должна быть больше нуля");
  assert.equal(X.payBlocker(form("99 999 999 999"), "2026-10-22", null), "Сумма слишком большая");
  assert.equal(X.payBlocker(form("500 000"), "2026-10-22", null), null);
  // a student who has left and an amount over his debt
  const over = require(path.join(root, "src/lib/payments-logica.ts")).leftPaymentProblem(700000, 592000);
  assert.equal(X.payBlocker(form("700 000"), "2026-10-22", over), over);
});

test("dates: back-dated is allowed within 3 years, a future or a too old date and a missing date block the button", () => {
  const form = (paidOn) => ({ amount: "100 000", paidOn, method: "cash", note: "", reason: "" });
  assert.equal(X.payBlocker(form("2026-09-01"), "2026-10-22", null), null);
  assert.equal(X.payBlocker(form("2026-10-23"), "2026-10-22", null), "Дата оплаты не может быть в будущем");
  assert.equal(X.payBlocker(form("2023-10-21"), "2026-10-22", null), "Дата оплаты старше 3 лет");
  assert.equal(X.payBlocker(form(""), "2026-10-22", null), "Укажите дату оплаты");
  const dialog = read("src/components/payments/payment-dialog.tsx");
  assert.match(dialog, /max=\{today\}/); // the picker itself does not offer a future day
  assert.match(dialog, /\.\.\.\(paidOnOk \? \{ paid_on: values\.paidOn \} : \{\}\)/); // the calculation follows the date
});

// ── method: required, remembered, without «Другое» ─────────────────────────────────────────────────────────────────

test("the method is required: Save is off with a hint until one is chosen", () => {
  const form = { amount: "500 000", paidOn: "2026-10-22", method: null, note: "", reason: "" };
  assert.equal(X.payBlocker(form, "2026-10-22", null), "Выберите способ оплаты");
  assert.equal(X.payBlocker({ ...form, method: "click" }, "2026-10-22", null), null);
  const dialog = read("src/components/payments/payment-dialog.tsx");
  assert.match(dialog, /disabled=\{busy \|\| blocker !== null\}/);
  assert.match(dialog, /id="payment-blocker"/);
  assert.match(dialog, /aria-describedby=\{blocker \? "payment-blocker" : undefined\}/);
});

test("the picker has Наличные, Карта, Перевод, Click, Payme - no «Другое»; old payments still read «Другое» elsewhere", () => {
  assert.deepEqual(X.PAYMENT_METHODS.map((method) => method.label), ["Наличные", "Карта", "Перевод", "Click", "Payme"]);
  assert.deepEqual(X.methodChoices(null).map((method) => method.key), ["cash", "card", "bank_transfer", "click", "payme"]);
  assert.deepEqual(X.methodChoices("cash").map((method) => method.key), ["cash", "card", "bank_transfer", "click", "payme"]);
  // a payment being corrected that was entered as «Другое» keeps its method visible, otherwise it could not be saved
  assert.deepEqual(X.methodChoices("other").map((method) => method.label).slice(-1), ["Другое"]);
  assert.equal(L.methodLabel("other"), "Другое"); // journal / receipts / till filter
  assert.ok(L.METHODS.some((method) => method.key === "other")); // not touched
  const dialog = read("src/components/payments/payment-dialog.tsx");
  assert.doesNotMatch(dialog, /Другое/);
  assert.doesNotMatch(dialog, /\bMETHODS\b/);
});

test("the last method of this browser is preselected; a broken storage, junk or «Другое» preselects nothing", () => {
  const memory = new Map();
  const storage = { getItem: (key) => (memory.has(key) ? memory.get(key) : null), setItem: (key, value) => { memory.set(key, value); } };
  assert.equal(X.readLastMethod(storage), null); // never used: nothing is chosen
  X.rememberMethod("payme", storage);
  assert.equal(X.readLastMethod(storage), "payme");
  X.rememberMethod("other", storage); // not in the picker: not remembered
  X.rememberMethod(null, storage);
  assert.equal(X.readLastMethod(storage), "payme");
  memory.set(X.LAST_METHOD_KEY, "bitcoin");
  assert.equal(X.readLastMethod(storage), null);
  memory.set(X.LAST_METHOD_KEY, "other");
  assert.equal(X.readLastMethod(storage), null);
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(X.readLastMethod(broken), null);
  assert.doesNotThrow(() => X.rememberMethod("cash", broken));
  assert.equal(X.readLastMethod(null), null);
  assert.doesNotThrow(() => X.rememberMethod("cash", null));
  // under node there is no window: the defaults do not throw
  assert.equal(X.readLastMethod(), null);
  const dialog = read("src/components/payments/payment-dialog.tsx");
  assert.match(dialog, /method: readLastMethod\(\)/);
  assert.match(dialog, /rememberMethod\(values\.method\)/);
});

// ── the button, the future tense, the layout ───────────────────────────────────────────────────────────────────────

test("the primary button carries the amount and updates live", () => {
  assert.equal(plain(X.payButtonLabel("create", 1142000)), "Внести 1 142 000 сум");
  assert.equal(plain(X.payButtonLabel("create", 592000)), "Внести 592 000 сум");
  assert.equal(X.payButtonLabel("create", null), "Внести");
  assert.equal(X.payButtonLabel("replace", 250000), "Сохранить исправление");
  assert.match(read("src/components/payments/payment-dialog.tsx"), /payButtonLabel\(kind, amountNow\)/);
});

test("future tense: nothing saved yet, so no «Закрыла / Закрыл» in the dialog or in any sentence of the matrix", () => {
  const dialog = read("src/components/payments/payment-dialog.tsx");
  assert.doesNotMatch(dialog, /Закрыла|Закрыл\b|Оплатил|Внесл/);
  assert.doesNotMatch(read("src/lib/payment-plan.ts"), /Закрыла|Закрыл\b|\.label\b/); // the server's past-tense label is never shown
  const all = [
    plan(592000), plan(1142000, { paidUntil: "2026-10-31" }), plan(500000), plan(30000), plan(800000), plan(1342000, { paidUntil: "2026-11-12" }),
    ...["e1_preview_250000", "e1_preview_300000", "e1_preview_769000", "e1_preview_790000", "e2_preview_200000", "e2_preview_323000", "e2_preview_900000", "e3_preview_100000", "e3_preview_213000", "e5_preview_630000_held12", "e5_preview_650000_held14", "e9_preview_price_ahead_1069000"]
      .map((name) => X.planView(L.normalizePreview(fixture(name)))),
  ];
  for (const p of all) {
    const everything = plain([p.sentence, ...p.lines.map((line) => line.label), ...X.quickAmounts(preview({ segments: SEGS() })).map((chip) => chip.label)].join(" | "));
    assert.doesNotMatch(everything, /Закрыла|Закрыл\b|Погасила|Частично погасила|…|\.\.\.|\d+ период/, everything);
    assert.match(p.sentence, /^(Закроет|Оплатит|Вся сумма останется)/, p.sentence); // the future, a plain sentence first
    assert.equal(p.sentence.endsWith("."), true);
    // the breakdown adds up to what the server allocated
    assert.ok(p.lines.every((line) => line.amount > 0));
  }
});

test("every fixture's lines add up to the amount asked", () => {
  for (const name of fs.readdirSync(path.join(__dirname, "fixtures/pay2")).map((file) => file.replace(/\.json$/, "")).filter((n) => n.includes("preview"))) {
    const p = L.normalizePreview(fixture(name));
    const view = X.planView(p);
    if (!p.result) { assert.equal(view, null, name); continue; }
    assert.equal(view.lines.reduce((total, line) => total + line.amount, 0), p.amount, name);
  }
});

test("the dialog layout: amount first, chips under it, then the plan, then method + date, a comment on demand", () => {
  const dialog = read("src/components/payments/payment-dialog.tsx");
  const at = (text) => { const i = dialog.indexOf(text); assert.ok(i > 0, text); return i; };
  const order = [at('htmlFor="payment-amount"'), at("payment-chips"), at("{PLAN_TITLE}"), at("Способ оплаты"), at("Дата оплаты"), at("Комментарий")];
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(dialog, /autoFocus/);
  assert.match(dialog, />сум<\/span>/);
  assert.match(dialog, /commentOpen \|\| values\.note/); // expanded when a comment exists
  assert.match(dialog, /Комментарий\n\s*<\/button>/);
  assert.match(dialog, /plan\.sentence/);
  // method: its OWN full-width row, all five on one line from sm up; a phone: 3 + 2 of equal width (never a lone orphan); the date is the next row
  const methodRow = dialog.slice(dialog.indexOf('data-testid="payment-methods"'), dialog.indexOf("Дата оплаты"));
  assert.match(methodRow, /className="grid grid-cols-3 gap-1\.5 sm:grid-cols-5"/);
  assert.match(methodRow, /\bw-full\b[^"]*\btext-center\b/, "equal-width buttons");
  assert.doesNotMatch(methodRow, /flex-wrap/);
  assert.doesNotMatch(dialog, /sm:grid-cols-\[minmax\(0,1fr\)_10rem\]/, "the date no longer shares the row with the methods");
  assert.match(dialog, /<div className="sm:w-44">\s*<label htmlFor="payment-paid-on"/);
  // the primary button is in the footer (never scrolls away)
  assert.match(dialog, /footerClassName=/);
  assert.match(dialog, /flex flex-col-reverse gap-2 sm:flex-row/);
  // the pay2 rules stay: server calculation, idempotency key, duplicate, correction
  assert.match(dialog, /usePaymentPreview\(\{/);
  assert.match(dialog, /orgApi\.createPayment\(membership\.membership_id, body, idempotencyKey\.current\)/);
  assert.match(dialog, /replace_payment_id: payment\.id/);
});

test("naming: a calendar month by its name, otherwise dates; a package by dates", () => {
  assert.deepEqual(X.calendarMonth("2026-02-01", "2026-02-28"), { year: 2026, month: 2 });
  assert.equal(X.calendarMonth("2028-02-01", "2028-02-28"), null); // a leap February is 29 days: not exactly a month
  assert.equal(X.calendarMonth("2026-10-15", "2026-11-14"), null);
  assert.equal(X.calendarMonth("2026-10-01", "2026-11-30"), null);
  assert.equal(X.periodName("2026-10-01", "2026-10-31").bare, "октябрь");
  assert.equal(X.periodName("2026-10-01", "2026-10-31", "period", "2025-12-01").bare, "октябрь 2026");
  assert.equal(X.periodName("2026-10-01", "2026-10-15").sentence, "период 01.10–15.10");
  assert.equal(X.periodName("2026-10-01", "2026-10-31", "package").bare, "пакет 01.10–31.10");
  assert.equal(X.longDate("2026-10-31", "2026-10-22"), "31 октября");
  assert.equal(X.longDate("2027-01-05", "2026-10-22"), "5 января 2027");
  assert.equal(X.longDate(null), null);
  assert.equal(X.joinNames(["июль", "август", "сентябрь"]), "июль, август и сентябрь");
  assert.equal(X.joinNames(["август"]), "август");
});
