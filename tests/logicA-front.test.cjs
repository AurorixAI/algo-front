// LOGIC-A («деньги»): the front reads the frozen contract (tests/fixtures/logicA = logicA_fixtures of the backend) and words it:
// opening balance, pause, leaving / archiving with the money settled, a payment of a student who has left, the price window, the
// billing mode, payouts, the divisor by month, the sheet split by lesson type, and the owner's vocabulary of the statement.
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
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/logicA", `${name}.json`), "utf8"));
const pay2 = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/pay2", `${name}.json`), "utf8"));
const named = (prefix) => fixture(fs.readdirSync(path.join(__dirname, "fixtures/logicA")).find((f) => f.startsWith(prefix)).replace(/\.json$/, ""));
const P = require(path.join(root, "src/lib/payments.ts"));
const L = require(path.join(root, "src/lib/payments-ledger.ts"));
const G = require(path.join(root, "src/lib/payments-logica.ts"));
const R = require(path.join(root, "src/lib/payroll.ts"));
const Y = require(path.join(root, "src/lib/payroll-logica.ts"));
const plain = (text) => text.replace(/ /g, " ");

function renderer() {
  require.extensions[".tsx"] = (mod, filename) => {
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
  };
  const Module = require("node:module");
  if (!Module.__logicAAlias) {
    const resolveFilename = Module._resolveFilename;
    Module._resolveFilename = function (request, ...rest) {
      return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, ...rest);
    };
    Module.__logicAAlias = true;
  }
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  return {
    React,
    text: (element) => plain(renderToStaticMarkup(element).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ")),
    html: (element) => renderToStaticMarkup(element),
  };
}

// ── the contract ─────────────────────────────────────────────────────────────────────────────

test("the contract: 36 operations, every one the front needs has a helper in orgApi", () => {
  const contract = fixture("_contract");
  const operations = Object.entries(contract.paths).flatMap(([route, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${route}`));
  assert.equal(operations.length, 36);
  const api = read("src/lib/api.ts");
  const needed = {
    "opening get/put": /opening-balance\$\{options\?\.dryRun \? "\?dry_run=true" : ""\}/, "opening void": /opening-balances\/\$\{encodePathId\(openingId\)\}\/void/,
    "pauses": /\/pauses\$\{options\?\.dryRun/, "pause patch": /\/pauses\/\$\{encodePathId\(pauseId\)\}\$\{options\?\.dryRun/, "pause void": /pauses\/\$\{encodePathId\(pauseId\)\}\/void/,
    "leave preview": /leave-preview/, "leave": /\/leave`/, "archive preview": /archive-preview/, "payouts": /payroll\/sheets\/\$\{encodePathId\(sheetId\)\}\/payouts/,
    "payout void": /payroll\/payouts\/\$\{encodePathId\(payoutId\)\}\/void/, "payouts list": /payroll\/payouts\?month=/, "divisor": /payroll\/settings", \{ method: "PUT", body \}/,
    "opening in add": /opening_balance/, "price dry run": /price-override\$\{options\?\.dryRun \? "\?dry_run=true" : ""\}/, "Idempotency-Key": /"Idempotency-Key"/,
  };
  for (const [name, pattern] of Object.entries(needed)) assert.match(api, pattern, name);
});

test("every response fixture reads through the tolerant parsers", () => {
  for (const file of fs.readdirSync(path.join(__dirname, "fixtures/logicA")).filter((f) => /^A\d\d_/.test(f))) {
    const data = fixture(file.replace(/\.json$/, ""));
    const json = JSON.stringify(data);
    assert.ok(!json.includes("NaN"), file);
    if (/^A(09|10|11|12)/.test(file) && data.memberships) {
      const preview = G.normalizeLeavePreview(data);
      assert.ok(preview.memberships.every((m) => m.allowed.length > 0 && (m.money === null || Number.isInteger(m.money.debt))), file);
    }
    if (/^A2[0-8]/.test(file) && /payout_state|created|void/.test(file)) {
      const state = Y.normalizePayoutState(data.state ?? data);
      assert.ok(state && Number.isInteger(state.balance) && Array.isArray(state.items), file);
    }
  }
});

// ── decision 1: opening balance ──────────────────────────────────────────────────────────────

test("opening balance: the form, its live line and the body of the request (G-OPEN A / B / C)", () => {
  const ctx = { enrolDate: "2026-10-21", accountingStart: "2026-10-01", today: "2026-10-21" };
  const empty = G.emptyOpeningValues();
  assert.equal(G.openingIsEmpty(empty), true);
  assert.equal(G.validateOpening(empty, ctx), null); // nothing to record is fine
  assert.equal(G.buildOpeningIn(empty), null);
  // A: «оплачено до 31.10»
  const a = { ...empty, paidUntil: "2026-10-31" };
  assert.equal(G.validateOpening(a, ctx), null);
  assert.equal(G.openingLine(a, ctx), "Стоимость считается с 01.11. Оплачено до 31.10.");
  assert.deepEqual(G.buildOpeningIn(a), { paid_until: "2026-10-31", debt_amount: null, debt_on: null });
  // B: «долг 250 000 на 30.09»
  const b = { ...empty, debt: "250 000", debtOn: "2026-09-30" };
  assert.equal(G.validateOpening(b, ctx), null);
  assert.equal(plain(G.openingLine(b, ctx)), "Стоимость считается с 21.10. Долг на начало: 250 000 сум на 30.09.");
  assert.deepEqual(G.buildOpeningIn(b), { paid_until: null, debt_amount: 250000, debt_on: "2026-09-30" });
  // C: both
  const c = { ...empty, paidUntil: "2026-10-25", debt: "100 000", debtOn: "2026-09-30" };
  assert.equal(plain(G.openingLine(c, ctx)), "Стоимость считается с 26.10. Оплачено до 25.10. Долг на начало: 100 000 сум на 30.09.");
  // refusals, in words
  assert.match(G.validateOpening({ ...empty, paidUntil: "2026-09-15" }, ctx), /не раньше 21\.10\.2026/);
  assert.match(G.validateOpening({ ...empty, debt: "250 000" }, ctx), /на какую дату был долг/);
  assert.match(G.validateOpening({ ...empty, debt: "250 000", debtOn: "2026-10-22" }, ctx), /не позже дня зачисления/);
  assert.match(G.validateOpening({ ...empty, paidUntil: "2028-01-01" }, ctx), /не дальше чем на год/);
  assert.match(G.validateOpening({ ...empty, debtOn: "2026-09-30" }, ctx), /сумму долга/);
  // a PUT with an empty form voids the live record
  assert.deepEqual(G.buildOpeningPut({ ...empty, reason: " ошибка " }), { paid_until: null, debt_amount: null, debt_on: null, reason: "ошибка" });
  // the words of the owner on the form
  assert.equal(G.OPENING_TITLE, "Остаток на начало учёта");
  assert.equal(G.OPENING_PAID_UNTIL_HINT, "Ученик уже заплатил до этой даты — до запуска в ALGO. Эти дни не начисляются и не превращаются в аванс.");
});

test("opening balance fixtures: the impact in words, the card line, the void", () => {
  const a01 = named("A01_");
  const impact = G.normalizeImpact(a01.impact);
  assert.deepEqual(G.openingImpactLines(impact).map(plain), ["Баланс: долг 213 000 сум → 0", "Оплачено до: 20.10.2026 → 31.10.2026", "Стоимость: −213 000 сум"]);
  assert.equal(G.openingSummary(a01.row.opening), "Оплачено до 31.10.2026 (до ALGO)");
  const a02 = named("A02_");
  assert.equal(plain(G.openingSummary(a02.row.opening)), "Долг на начало 250 000 сум на 30.09.2026");
  assert.equal(named("A05_").opening.voided_at !== null, true);
  // the list row carries the opening and the pause
  assert.equal(a01.row.status, "active");
  assert.equal(G.normalizeImpact(null), null);
});

// ── decision 2: pause ────────────────────────────────────────────────────────────────────────

test("pause: the form, the server's calculation, the warnings, the chip and the end of a pause (G-PAUSE)", () => {
  const today = "2026-10-21";
  assert.equal(G.pauseEarliest(today), "2026-09-21");
  assert.equal(G.validatePause({ first: "2026-10-20", last: "2026-10-24", reason: "" }, today), null);
  assert.match(G.validatePause({ first: "2026-09-01", last: "2026-10-24", reason: "" }, today), /не раньше чем 30 дней назад/);
  assert.match(G.validatePause({ first: "2026-10-24", last: "2026-10-20", reason: "" }, today), /раньше, чем начинается/);
  assert.match(G.validatePause({ first: "2026-10-20", last: "2028-01-01", reason: "" }, today), /не длиннее 366 дней/);
  assert.equal(G.pauseDays("2026-10-20", "2026-10-24"), 5);
  assert.deepEqual(G.buildPauseBody({ first: "2026-10-20", last: "2026-10-24", reason: " уехал " }), { first_day: "2026-10-20", last_day: "2026-10-24", reason: "уехал" });
  const saved = named("A06_");
  const calc = { pause: saved.pause, impact: G.normalizeImpact(saved.impact) };
  assert.deepEqual(G.pauseCalcLines(calc).map(plain), [
    "За паузу не начисляется 5 дней: −100 000 сум. Место в группе сохраняется.", "Оплачено до станет 03.11.", "Баланс: долг 20 000 сум → аванс 80 000 сум",
  ]);
  // a role without money sees no sum
  assert.deepEqual(G.pauseCalcLines({ pause: saved.pause, impact: null }), ["За паузу не начисляется 5 дней. Место в группе сохраняется."]);
  const warnings = G.pauseWarnings(saved, today);
  assert.ok(warnings[0].startsWith("Пауза задним числом: уроки с 20.10 по 20.10 не будут засчитаны ни ученику, ни преподавателю"));
  assert.ok(warnings.some((line) => /Ведомость за октябрь покажет «Есть изменения»/.test(line)));
  assert.match(G.attendedText(["2026-10-12", "2026-10-14"]), /^Ученик был отмечен на уроках 12\.10, 14\.10 — на эти даты паузу поставить нельзя$/);
  // the chip: «На паузе до 20.10»; in the list and in the card
  assert.equal(G.pausedChipText({ from: "2026-10-11", to: "2026-10-20" }), "На паузе до 20.10");
  assert.equal(P.statusLabel({ status: "paused", paused: { from: "2026-10-20", to: "2026-10-24" } }), "На паузе до 24.10");
  assert.equal(P.statusDetail({ status: "paused", period_mode: "calendar", paid_until: "2026-11-03" }), "оплачено до 03.11.2026");
  assert.equal(saved.row.status, "paused");
  // end: a running pause is shortened to yesterday, one that has not begun is cancelled
  assert.equal(G.pauseEndAction({ first_day: "2026-10-11", last_day: "2026-10-30" }, today), "end");
  assert.equal(G.pauseEndAction({ first_day: "2026-10-25", last_day: "2026-10-30" }, today), "cancel");
  assert.equal(G.pauseEndAction({ first_day: "2026-10-01", last_day: "2026-10-10" }, today), null);
  assert.equal(G.pauseEndDay(today), "2026-10-20");
  assert.equal(named("A07_").pause.voided_at !== null, true);
});

// ── F9: leaving and archiving with the money ────────────────────────────────────────────────

test("leave: the dialog's blocks, the settle body with what the owner saw, BALANCE_CHANGED (chain 1 and chain 4)", () => {
  const refund = G.normalizeLeavePreview(named("A09_"));
  const [m] = refund.memberships;
  assert.equal(G.settleKind(m), "advance");
  assert.equal(plain(G.settleHeadline(m)), "После ухода у ученика аванс 135 000 сум. Что сделать?");
  assert.equal(plain(G.SETTLE_LABEL.refund(135000)), "Вернуть 135 000 сум");
  // «keep» by default: the request says what the owner saw
  assert.deepEqual(G.buildSettle(refund, {}), [{ membership_id: m.membership_id, action: "keep" }]);
  const choices = { [m.membership_id]: { action: "refund", method: null, reason: "" } };
  assert.match(G.validateSettle(refund, choices), /выберите, как вернули деньги/);
  choices[m.membership_id].method = "cash";
  assert.equal(G.validateSettle(refund, choices), null);
  assert.deepEqual(G.buildSettle(refund, choices), [{ membership_id: m.membership_id, action: "refund", expected_refundable: 135000, method: "cash" }]);
  assert.deepEqual(G.settledLines(named("A10_").settled).map(plain), ["Возвращено 135 000 сум"]);
  // a debt after leaving (chain 4): keep, or forgive with a reason
  const archive = G.normalizeLeavePreview(named("A11_"));
  const debt = archive.memberships[0];
  assert.equal(plain(G.settleHeadline(debt)), "После ухода у ученика долг 347 000 сум.");
  assert.equal(plain(G.SETTLE_LABEL.keepDebt), "Оставить долг — оплатить его можно и после ухода");
  assert.equal(G.SETTLE_LABEL.forgive, "Простить долг");
  const forgive = { [debt.membership_id]: { action: "writeoff", method: null, reason: "ab" } };
  assert.match(G.validateSettle(archive, forgive), /причину прощения долга/);
  forgive[debt.membership_id].reason = " договорённость с родителем ";
  assert.deepEqual(G.buildSettle(archive, forgive), [{ membership_id: debt.membership_id, action: "writeoff", expected_debt: 347000, reason: "договорённость с родителем" }]);
  // no money to see, no settlements, a hidden balance
  assert.equal(G.settleHeadline({ money: null, has_open_balance: true, allowed: ["keep"] }), "У ученика есть расчёты по оплате — их видит владелец");
  assert.equal(G.settleHeadline({ money: { debt: 0, advance: 0, refundable: 0 }, has_open_balance: false, allowed: ["keep"] }), "Расчётов нет — можно убирать");
  assert.deepEqual(G.buildSettle({ memberships: [{ membership_id: "x", money: null, has_open_balance: true, allowed: ["keep"] }] }, {}), []);
  // an individual price ends with the stay (F13)
  assert.equal(G.normalizeLeavePreview(named("A12_")).memberships[0].money.individual_price_ends, true);
  // BALANCE_CHANGED: the fresh numbers replace the old ones and the choice falls back
  const errors = fixture("errors");
  const changed = G.logicaError({ code: "BALANCE_CHANGED", message: "x", detail: errors.BALANCE_CHANGED.body.detail });
  assert.equal(changed.fresh.length, 1);
  const next = G.applyFreshBalances(refund, [{ membership_id: m.membership_id, debt: 0, advance: 150000, refundable: 150000 }]);
  assert.equal(next.preview.memberships[0].money.refundable, 150000);
  assert.deepEqual(next.reset, [m.membership_id]);
  assert.equal(G.BALANCE_CHANGED_TEXT, errors.BALANCE_CHANGED.body.detail.message);
});

test("a student who has left pays at most the debt (S-5, chain 4)", () => {
  const errors = fixture("errors");
  assert.equal(plain(G.leftPaymentProblem(400000, 347000)), "Ученик ушёл: принять можно не больше долга 347 000 сум");
  assert.equal(plain(errors.PAYMENT_EXCEEDS_DEBT.body.detail.message), plain(G.leftPaymentProblem(400000, 347000)));
  assert.equal(G.leftPaymentProblem(347000, 347000), null);
  assert.equal(G.leftPaymentProblem(1000, 0), errors.NOTHING_TO_PAY.body.detail.message);
  assert.equal(G.isLeftDebtOnly({ warnings: [{ code: "left_debt_only", message: G.LEFT_DEBT_ONLY_TEXT }] }), true);
  assert.equal(G.isLeftDebtOnly({ warnings: [] }), false);
  assert.equal(G.LEFT_DEBT_ONLY_TEXT, "Ученик ушёл: можно оплатить только долг");
  assert.equal(G.canPayLeftDebt({ is_active: false, debt: 347000 }), true);
  assert.equal(G.canPayLeftDebt({ is_active: false, debt: 0 }), false);
  assert.equal(G.canPayLeftDebt({ is_active: true, debt: 5 }), false);
  assert.equal(G.canPayLeftDebt({ is_active: true, debt: 5 }, true), true); // an archived student
});

test("leave dialog and settle block draw the blocks of the spec", () => {
  const { React, text, html } = renderer();
  const { SettleBlock } = require(path.join(root, "src/components/payments/settle-block.tsx"));
  const preview = G.normalizeLeavePreview(named("A09_"));
  const m = preview.memberships[0];
  const body = text(React.createElement(SettleBlock, { preview, choices: { [m.membership_id]: { action: "refund", method: null, reason: "" } }, onChoice: () => undefined }));
  for (const part of ["После ухода у ученика аванс 135 000 сум. Что сделать?", "Вернуть 135 000 сум", "Оставить аванс на счёте", "Как вернули", "Наличные"]) assert.ok(body.includes(part), part);
  const debt = text(React.createElement(SettleBlock, { preview: G.normalizeLeavePreview(named("A11_")), choices: {}, onChoice: () => undefined }));
  for (const part of ["После ухода у ученика долг 347 000 сум.", "Оставить долг — оплатить его можно и после ухода", "Простить долг"]) assert.ok(debt.includes(part), part);
  const ends = text(React.createElement(SettleBlock, { preview: G.normalizeLeavePreview(named("A12_")), choices: {}, onChoice: () => undefined }));
  assert.ok(ends.includes("Индивидуальная цена закончится"));
  assert.match(html(React.createElement(SettleBlock, { preview, choices: {}, onChoice: () => undefined })), /Расчёты при уходе/);
  // the table opens the leave dialog (owner / admin); a teacher keeps the plain confirmation
  const table = read("src/components/groups/group-student-table.tsx");
  assert.match(table, /groupId && onLeft && !isTeacher/);
  assert.match(read("src/components/students/student-archive-modal.tsx"), /orgApi\.archiveStudentSettled\(studentId, \{ reason: normalizeArchiveReason\(reason\), settle: settle\.settle \}\)/);
});

// ── decision 4: the price window ─────────────────────────────────────────────────────────────

test("price: the money part of «Что изменится», the refusal and the past-day warning (chain 7)", () => {
  const future = named("A14_");
  const money = G.normalizePriceMoney(future.impact.money);
  assert.deepEqual(G.priceMoneyLines(money).map(plain), ["У 1 ученика аванс купит меньше дней: «оплачено до» сдвинется на 2 дня назад."]);
  assert.equal(plain(G.priceItemLine(money.items[0])), "Ахмедов Б.: оплачено до 12.11 → 10.11");
  assert.equal(G.lostDaysOf(money.items[0]), 2);
  const past = named("A15_");
  const backdated = G.normalizePriceMoney(past.impact.money);
  assert.equal(backdated.backdated, true);
  assert.ok(G.priceMoneyLines(backdated).every((line) => !/NaN/.test(line)));
  // with a debt: «С этого дня у 2 учеников появится долг: 140 000 сум.»
  const debt = G.priceMoneyLines({ ...money, memberships_with_new_debt: 2, debt_delta: 140000, memberships_with_less_advance: 0, days_lost_total: 0, advance_delta: 0 });
  assert.equal(plain(debt[0]), "С этого дня у 2 учеников появится долг: 140 000 сум.");
  assert.equal(G.PRICE_PAYMENTS_NOTE, "Внесённые оплаты не меняются, но долг и аванс пересчитываются — ниже, у кого.");
  assert.equal(require(path.join(root, "src/lib/group-price.ts")).PAID_NEVER_CHANGE_TEXT, G.PRICE_PAYMENTS_NOTE);
  // the refusal carries the students (the first 20)
  const refusal = fixture("errors").PRICE_BACKDATE_WITH_PAYMENTS.body.detail;
  const error = G.logicaError({ code: refusal.code, message: refusal.message, detail: refusal });
  assert.equal(error.code, "PRICE_BACKDATE_WITH_PAYMENTS");
  assert.deepEqual(G.priceBlockedText(error).students, ["Каримов А."]);
  assert.match(error.message, /^Нельзя изменить цену задним числом: у 1 ученика уже есть оплаты за период, который это затронет/);
  const { React, text, html } = renderer();
  const { PriceBlockedBanner, PriceImpactMoneyBlock } = require(path.join(root, "src/components/payments/price-impact.tsx"));
  const banner = text(React.createElement(PriceBlockedBanner, { error }));
  assert.ok(banner.includes("Нельзя изменить цену задним числом") && banner.includes("Каримов А."));
  assert.match(html(React.createElement(PriceBlockedBanner, { error })), /role="alert"/);
  const block = text(React.createElement(PriceImpactMoneyBlock, { money }));
  assert.ok(block.includes("аванс купит меньше дней") && block.includes("Ахмедов Б.: оплачено до 12.11 → 10.11"));
  assert.match(plain(G.priceEndedText(600000)), /^Индивидуальная цена закончилась\. Сейчас — цена группы 600 000/);
});

// ── F12: the billing mode ────────────────────────────────────────────────────────────────────

test("billing mode: «Новый режим начнёт действовать с …» comes from the dry run (chain 5)", () => {
  const impact = named("A16_").regime_impact;
  assert.deepEqual(G.regimeImpactLines(impact), [
    "Новый режим начнёт действовать с 01.11.2026 — у каждого ученика с начала его следующего периода, последний переход 14.11.2026.",
    "Затронет 38 учеников: первый переход 01.11, последний 14.11",
  ]);
  assert.equal(G.REGIME_HINT, "Новый режим начнёт действовать для каждого ученика с начала его следующего периода — идущие периоды не меняются.");
  assert.equal(G.regimeSavedText(impact), "Новый режим начнёт действовать с 01.11.2026");
  assert.deepEqual(G.regimeImpactLines({ students_affected: 0, first_switch: null, latest_switch: null, defer: true }), ["Режим сменится без последствий: ни у кого нет идущего периода."]);
  assert.deepEqual(G.regimeChanges({ period_mode: "lessons", expiring_days: 5, billing_day: 3 }), { period_mode: "lessons", billing_day: 3 });
  const page = read("src/app/owner/settings/page.tsx");
  assert.match(page, /orgApi\.previewPaymentSettings\(regimeDiff\)/);
  assert.match(page, /\{REGIME_HINT\}/);
  assert.ok(G.CANCELLED_LESSON_TEXT.startsWith("Отменённый центром урок не уменьшает оплату месяца"));
});

// ── decision 6: payouts ──────────────────────────────────────────────────────────────────────

test("payouts: chips, parts, the form and the overpayment question (G-PAY)", () => {
  const unpaid = Y.normalizePayoutState(named("A28_"));
  const due = Y.normalizePayoutState(named("A21_"));
  const over = Y.normalizePayoutState(named("A24_"));
  assert.equal(Y.payoutChip(unpaid).text, "Не выплачено");
  assert.equal(plain(Y.payoutChip(due).text), "Доплатить 125 000 сум");
  assert.equal(plain(Y.payoutChip(over).text), "Переплачено 125 000 сум");
  assert.equal(Y.payoutChip({ ...due, basis: "saved", target: 600000, paid: 475000, balance: 125000 }).text.replace(/ /g, " "), "Выплачено 475 000 сум из 600 000 сум");
  assert.equal(Y.payoutChip({ ...due, state: "settled", balance: 0 }).text, "Выплачено полностью");
  assert.equal(Y.payoutChip(null), null);
  assert.equal(due.text, "Выплачено 475 000 · после изменений данных доплатить 125 000"); // the server's sentence stays as it came
  assert.deepEqual(Y.sheetPayoutParts(due).map((part) => [part.label, plain(part.value)]), [["К выплате", "600 000 сум"], ["Выплачено", "475 000 сум"], ["Доплатить", "125 000 сум"]]);
  assert.deepEqual(Y.sheetPayoutParts(over).map((part) => part.label), ["К выплате", "Выплачено", "Переплачено"]);
  assert.equal(plain(Y.monthPayoutText("2026-10", [{ payout: due }, { payout: null }])), "К выплате за октябрь: 600 000 сум · выплачено 475 000 сум · доплатить 125 000 сум");
  assert.equal(Y.monthPayoutText("2026-10", [{ payout: null }]), null);
  assert.equal(plain(Y.monthPayoutTail([{ payout: due }, { payout: null }])), "выплачено 475 000 сум · доплатить 125 000 сум");
  assert.equal(Y.monthPayoutTail([{ payout: null }]), null);
  // the form: the amount starts as what is left; more than that asks
  const values = Y.emptyPayoutValues("2026-11-12", due);
  assert.equal(values.amount, "125 000");
  assert.equal(Y.validatePayout(values, "2026-11-12"), "Выберите способ выплаты");
  const ready = { ...values, method: "cash" };
  assert.equal(Y.validatePayout(ready, "2026-11-12"), null);
  assert.deepEqual(Y.buildPayoutBody(ready), { amount: 125000, paid_on: "2026-11-12", method: "cash" });
  assert.equal(Y.payoutOverpay(125000, due), null);
  assert.equal(Y.payoutOverpay(155000, due), 30000);
  assert.equal(plain(Y.payoutOverpayQuestion(30000)), "Это больше, чем осталось выплатить. Переплата 30 000 сум. Продолжить?");
  assert.equal(plain(Y.payoutAfterText(100000, due)), "Останется выплатить 25 000 сум");
  assert.equal(Y.payoutAfterText(125000, due), "Выплачено полностью");
  assert.match(Y.validatePayout({ ...ready, paidOn: "2026-11-13" }, "2026-11-12"), /не может быть в будущем/);
  assert.match(Y.validatePayout({ ...ready, amount: "" }, "2026-11-12"), /Укажите сумму/);
  assert.equal(plain(Y.payoutLine(named("A20_").payout)), "05.11.2026 · 475 000 сум · Наличные · Арслан");
  assert.equal(Y.payoutError({ code: "DUPLICATE_PAYOUT", message: "Выплата уже внесена" }).kind, "duplicate");
  assert.equal(Y.payoutError({ code: "SHEET_NOT_SAVED", message: "Сначала сохраните ведомость" }).kind, "not_saved");
  // the void of a payout puts the balance back by its amount
  const voided = named("A25_");
  assert.ok(voided.payout.voided_at);
  assert.equal(Y.payoutChip(Y.normalizePayoutState(voided.state)).tone, "ok");
  assert.equal(Y.livePayouts(Y.normalizePayoutState(voided.state)).length, 1);
});

test("the sheet block and the month row draw the payout", () => {
  const { React, text, html } = renderer();
  const { SheetPayoutBlock } = require(path.join(root, "src/components/payroll/payout-block.tsx"));
  const due = named("A21_");
  const block = text(React.createElement(SheetPayoutBlock, { sheetId: "s1", month: "2026-10", teacherName: "Каримова", payout: due, onChanged: () => undefined }));
  for (const part of ["Выплата", "Доплатить 125 000 сум", "К выплате", "600 000 сум", "Выплачено", "475 000 сум", "Выплачено 475 000 · после изменений данных доплатить 125 000", "Отметить выплату", "05.11.2026 · 475 000 сум · Наличные · Арслан", "Отменить"]) assert.ok(block.includes(part), part);
  const over = text(React.createElement(SheetPayoutBlock, { sheetId: "s1", month: "2026-10", teacherName: "Каримова", payout: named("A24_"), onChanged: () => undefined }));
  assert.ok(over.includes("Переплачено 125 000 сум"));
  assert.equal(html(React.createElement(SheetPayoutBlock, { sheetId: "s1", month: "2026-10", teacherName: "К", payout: null, onChanged: () => undefined })), "");
  const { TeacherRow } = require(path.join(root, "src/components/payroll/payroll-month-page.tsx"));
  const teacher = { teacher_id: "t", teacher_name: "Каримова", lessons_count: 12, lesson_types: [], rates: { group: "50" }, missing_rates: [], sheet: { id: "s1", revision: 1, total_amount: 475000, stale: true, updated_at: null }, warnings: {}, payout: due };
  const row = text(React.createElement(TeacherRow, { teacher, month: "2026-10", busy: false, onCalculate: () => undefined, onOpen: () => undefined }));
  assert.ok(row.includes("Доплатить 125 000 сум"));
  const rowHtml = html(React.createElement(TeacherRow, { teacher, month: "2026-10", busy: false, onCalculate: () => undefined, onOpen: () => undefined }));
  assert.match(rowHtml, /data-testid="payout-chip"/);
  assert.doesNotMatch(rowHtml, /Действия: Каримова/); // owner 22.10: no «⋯» on the month row
});

// ── F7, F14: the divisor by month, the sheet split by type, the fingerprint ──────────────────

test("divisor by month: «С октября 2026 — 13 · раньше 12» (chain 8)", () => {
  const settings = named("A19_");
  assert.deepEqual(Y.divisorHistoryRows(settings.history).map((row) => row.text), ["С октября 2026 — 13 · раньше 12", "С самого начала — 12"]);
  assert.equal(Y.divisorFor(settings.history, "2026-09"), 12);
  assert.equal(Y.divisorFor(settings.history, "2026-10"), 13);
  assert.equal(Y.divisorFor([], "2026-10"), 12);
  assert.deepEqual(Y.buildDivisorBody(13, "2026-10"), { divisor: 13, valid_from: "2026-10" });
  assert.equal(Y.divisorChangeText(13, "2026-10", 12), "С октября 2026 делитель 13 (сейчас 12). Старые месяцы не меняются.");
  assert.equal(Y.divisorChangeText(12, "2026-10", 12), "С октября 2026 делитель 12, как сейчас.");
  assert.equal(Y.DIVISOR_HELP, "Старые месяцы не меняются. Ведомости, рассчитанные с другим делителем, покажут «Есть изменения».");
  assert.equal(fixture("errors").DIVISOR_RANGE.body.detail.message, "Делитель: от 1 до 31");
  const page = read("src/app/owner/settings/page.tsx");
  assert.match(page, /orgApi\.setPayrollDivisor\(buildDivisorBody\(parsed\.value, validFrom\)\)/);
  assert.match(page, /data-testid="divisor-history"/);
});

test("the sheet: lines split by lesson type are sub-rows of one student in one block; written-off lessons are said", () => {
  const sheet = named("A27_");
  assert.deepEqual(sheet.lines.map((line) => [line.line_key.split(":")[1], line.amount]), [["group", 150000], ["pair", 180000]]);
  assert.equal(sheet.total_amount, 330000);
  assert.deepEqual(Y.splitLayout(sheet.lines).map((row) => [row.first, row.typeLabel]), [[true, "Группа · 6 уроков"], [false, "Парный · 6 уроков"]]);
  // an ordinary line has no sub-label
  assert.deepEqual(Y.splitLayout(named("A26_").lines), [{ first: true, typeLabel: null }]);
  // the server sends one block per (group, lesson type), keyed `<group>:<type>`; the lines of a block are those of that type
  assert.deepEqual(sheet.groups.map((g) => g.block_key.split(":")[1]), ["group", "pair"]);
  const views = R.buildLineViews(sheet, R.EMPTY_EDITS);
  const blocks = R.buildBlocks(sheet, views);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map((b) => [b.lessonTypes, b.lines.length, b.amount, b.columns.length]), [[["group"], 1, 150000, 6], [["pair"], 1, 180000, 6]]);
  // a sheet that came without blocks gets them from its lines (one per type when the group has several)
  const bare = R.buildBlocks({ ...sheet, groups: [] }, views);
  assert.deepEqual(bare.map((b) => [b.lessonTypes, b.amount]), [[["group"], 150000], [["pair"], 180000]]);
  assert.equal(Y.writtenOffText(2), "из них списано центром: 2 урока");
  assert.equal(Y.writtenOffText(0), null);
  assert.equal(Y.writtenOffLessons({ marks: [{ cover: "writeoff" }, { cover: "money" }, { cover: "writeoff" }] }), 2);
  const { React, text } = renderer();
  const { PayrollSheetTable } = require(path.join(root, "src/components/payroll/sheet-table.tsx"));
  const drawn = text(React.createElement(PayrollSheetTable, { sheet, edits: R.EMPTY_EDITS }));
  for (const part of ["Каримов Алишер", "Группа", "Парный", "150 000 сум", "180 000 сум"]) assert.ok(drawn.includes(part), part);
  assert.equal((drawn.match(/Каримов Алишер/g) || []).length, 2); // the student is in both blocks, one row in each
  // the ticks «начислить» belong to a sheet line: they carry its line_key
  const ticked = R.setIncludeEdit(R.EMPTY_EDITS, { ...sheet, lines: sheet.lines.map((l) => ({ ...l, unpaid: 1 })) }, sheet.lines[1].line_key, true);
  assert.deepEqual(R.buildLineOverrides(sheet, ticked), [{ membership_id: sheet.lines[1].membership_id, line_key: sheet.lines[1].line_key, include_unpaid: true }]);
  assert.deepEqual(Object.keys(ticked.include), [sheet.lines[1].line_key]); // the other line of the student is not ticked
  assert.equal(R.lineKeyOf({ membership_id: "m" }), "m");
});

test("the fingerprint is required to save a calculation (F14)", () => {
  const error = fixture("errors").FINGERPRINT_REQUIRED.body.detail;
  assert.equal(Y.FINGERPRINT_REQUIRED_TEXT, error.message);
  assert.equal(Y.isFingerprintRequired({ code: "FINGERPRINT_REQUIRED" }), true);
  assert.equal(Y.payrollLogicaErrorText({ code: "FINGERPRINT_REQUIRED", message: "x" }), "Откройте расчёт заново: сохранение без проверки данных невозможно");
  const page = read("src/components/payroll/payroll-sheet-page.tsx");
  assert.match(page, /if \(recalculate && !fingerprint\)/); // no trip to the server without it
  assert.match(page, /isFingerprintRequired\(error\)\) setDataChanged/);
  assert.match(read("src/components/payroll/payroll-month-page.tsx"), /isFingerprintRequired\(error\)\) patchPreview/);
  // a sheet carries its payout and the divisor of its month
  assert.equal(named("A26_").payout.state, "unpaid");
});

// ── the statement: the owner's vocabulary and the addendum ──────────────────────────────────

test("statement: Стоимость | Оплачено | Баланс, the month's own charge, the exact remainder per allocation (E1)", () => {
  const statement = L.normalizeStatement(pay2("e1_statement_790000"));
  const items = L.buildStatementItems(statement, null);
  // each month header is about the month's OWN charge as of the statement date
  assert.deepEqual(items.filter((i) => i.kind === "month").map((i) => [i.title, plain(i.summary)]), [
    ["Сентябрь 2026", "стоимость 500 000 · оплачено 500 000 · осталось 0"],
    ["Октябрь 2026", "стоимость 500 000 · оплачено 500 000 · осталось 0"],
  ]);
  // «Сентябрь 2026 · стоимость 450 000 · оплачено 81 000 · осталось 369 000»
  const segment = (charge, paid, remaining, extra = {}) => ({ id: "s", kind: "period", period_from: "2026-09-01", period_to: "2026-09-30", charge, paid, remaining, unpaid: remaining, written_off: 0, ...extra });
  assert.equal(plain(L.monthChargeSummary([segment(450000, 81000, 369000)])), "стоимость 450 000 · оплачено 81 000 · осталось 369 000");
  assert.equal(plain(L.monthChargeSummary([segment(450000, 81000, 329000, { written_off: 40000 })])), "стоимость 450 000 · оплачено 81 000 · прощено 40 000 · осталось 329 000");
  assert.equal(L.monthChargeSummary([]), "стоимости нет");
  assert.equal(L.segmentRemaining({ charge: 100, paid: 30, written_off: 20 }), 50); // an older answer without `remaining`
  // the exact remainder after each piece of money comes from the server
  const rows = items.filter((i) => i.kind === "row");
  assert.deepEqual(rows[1].allocations.map(plain), ["за 15.09–14.10 — 231 000 (осталось 269 000)"]);
  const first = statement.rows[1].details.allocations[0];
  assert.equal(first.segment_remaining_after, 269000);
  const tweaked = { ...statement, rows: statement.rows.map((row, index) => (index === 1 ? { ...row, details: { ...row.details, allocations: [{ ...first, segment_remaining_after: 111000 }] } } : row)) };
  assert.deepEqual(L.buildStatementItems(tweaked, null).filter((i) => i.kind === "row")[1].allocations.map(plain), ["за 15.09–14.10 — 231 000 (осталось 111 000)"]);
  // the totals and the balance
  assert.deepEqual(L.statementTotals(statement.summary).map((t) => t.label), ["Стоимость обучения", "Оплачено", "Баланс"]);
  assert.equal(L.balanceCell(0).text, "0");
  assert.equal(L.signedBalanceText(0), "0");
});

test("statement: a forgiven debt, a correction and the opening rows are told in the owner's words", () => {
  const statement = L.normalizeStatement(pay2("e1_statement_790000"));
  const base = statement.rows[1];
  const rows = [
    statement.rows[0],
    { ...base, details: { ...base.details, replaces_amount: 450000, replaces_receipt_no: 12 } },
    { ...base, seq: 7, type: "writeoff", title: "Долг прощён — причина болезнь", debit: 0, credit: 40000, outflow: 0, balance_after: -229000, details: { ...base.details, allocations: [], reason: "болезнь", created_by_name: "Рустам", writeoff_id: "w1", payment_id: null } },
    { ...base, seq: 8, type: "opening_debt", title: "Долг на начало учёта на 30.09.2026", date: "2026-09-30", debit: 250000, credit: 0, outflow: 0, balance_after: -250000, details: { ...base.details, allocations: [], segment: null } },
    { ...base, seq: 9, type: "opening_paid_until", title: "Остаток на начало: оплачено до 31.10 (до ALGO)", date: "2026-10-21", debit: 0, credit: 0, outflow: 0, balance_after: -250000, details: { ...base.details, allocations: [] } },
  ];
  const view = L.buildStatementItems({ ...statement, rows }, null).filter((i) => i.kind === "row");
  assert.equal(view[0].type, "charge");
  assert.equal(plain(view[1].replaced), "исправлена: было 450 000");
  assert.equal(view[2].title, "Долг прощён — причина: болезнь · Рустам");
  assert.equal(view[2].tag, "прощено");
  const opening = view.find((r) => r.type === "opening_debt");
  assert.equal(opening.charged, 250000); // in the «Стоимость» column
  assert.equal(opening.title, "Долг на начало учёта на 30.09.2026");
  const info = view.find((r) => r.type === "opening_paid_until");
  assert.deepEqual([info.charged, info.paid, info.title], [null, null, "Остаток на начало: оплачено до 31.10 (до ALGO)"]);
  // the cancelled original names its correction
  const original = L.normalizeStatement({ ...pay2("e1_statement_790000"), voided: [{ ...base, balance_after: null, voided_at: "2026-10-22T09:00:00", void_reason: "исправлена", voided_by_name: "Рустам", details: { ...base.details, replaced_by_receipt_no: 18 } }] });
  assert.match(L.statementRowView(original.voided[0]).cancelNote, /заменена оплатой № 18/);
  // receipt of a correction
  assert.equal(plain(P.receiptReplacesNote({ replaces_receipt_no: 17, replaces_amount: 450000 })), "Исправление оплаты № 17 (было 450 000 сум)");
  assert.equal(L.STATEMENT_TYPE_LABEL.charge, "Стоимость");
  assert.equal(L.STATEMENT_TYPE_LABEL.writeoff, "Долг прощён");
  // «Простить долг» everywhere
  assert.equal(require(path.join(root, "src/components/payments/writeoff-dialog.tsx")).WRITEOFF_ACTION_LABEL, "Простить долг");
  assert.equal(L.validateWriteoff({ amount: "", all: true, reason: "ok ok" }, 0), "Долга нет — прощать нечего");
  assert.equal(plain(L.balanceAfterText(469000, 0)), "Баланс после оплаты: долг 469 000 сум");
});

test("statement page: no old words are left on the money screens", () => {
  const files = ["src/components/payments/statement-view.tsx", "src/components/payments/writeoff-dialog.tsx", "src/components/payments/income-page.tsx", "src/components/payments/membership-payments.tsx",
    "src/components/payments/payments-page.tsx", "src/lib/payments-ledger.ts", "src/lib/payments-income.ts", "src/lib/payments-logica.ts"];
  for (const file of files) {
    const code = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /Начислено|Списано|Списать долг|Остаток долга|Нет долга|Начисление"/, file);
  }
});

// ── the page «Оплаты» (owner 21.10) ──────────────────────────────────────────────────────────

test("payments page: two cards before the tabs; the card count is the «Должники» tab count", () => {
  const summary = { debt_total: 1250000, advance_total: 340000, debtors: 33, students_with_debt: 33, students_with_advance: 5, expiring: 4, active: 120 };
  const cards = P.positionCards(summary);
  assert.deepEqual(cards.map((card) => [card.label, plain(card.amount), card.sub, card.tone]), [
    ["Долг учеников", "1 250 000 сум", "33 ученика с долгом", "debt"],
    ["Аванс", "340 000 сум", "5 учеников оплатили вперёд", "advance"],
  ]);
  // one number for both
  const debtTab = P.bucketTabLabel(P.PAYMENT_BUCKETS[0].label, P.bucketCount(summary, "debt"));
  assert.equal(debtTab, "Должники (33)");
  assert.equal(P.debtorsCount(summary), 33);
  assert.ok(cards[0].sub.startsWith(`${P.bucketCount(summary, "debt")} `));
  // an answer without `debtors` falls back to the students with a debt on both
  const old = { debt_total: 70000, advance_total: 0, students_with_debt: 2 };
  assert.equal(P.positionCards(old)[0].sub, "2 ученика с долгом");
  assert.equal(P.bucketCount(old, "debt"), 2);
  assert.equal(P.positionCards({ debt_total: 0, advance_total: 0, debtors: 0 })[0].tone, "none");
  assert.deepEqual(P.PAYMENT_BUCKETS.map((b) => b.label), ["Должники", "Скоро платить", "Оплачено"]);
  // the reason line of a debtor
  assert.equal(P.debtReasonText({ reason: "Не доплачено за октябрь: 150 000", status: "active" }), "Не доплачено за октябрь: 150 000");
  assert.equal(P.debtReasonText({ status: "expired", days_overdue: 12, debt: 5 }), "Просрочено на 12 дней");
  assert.equal(P.debtReasonText({ status: "none", last_payment: null, debt: 0 }), "Ещё не платил");
  assert.equal(P.priceMissingText(3), "У 3 учеников не задана цена");
  assert.equal(P.priceMissingText(0), null);
  const page = read("src/components/payments/payments-page.tsx");
  assert.ok(page.indexOf("data-testid=\"payments-position\"") < page.indexOf("role=\"tablist\"")); // the cards come before the tabs
  assert.match(page, /sm:grid-cols-2/);
  assert.match(page, /priceMissingText\(priceMissing\)/);
  assert.match(page, /Задать<\/Link>/);
  assert.match(page, /debtReasonText\(row\)/);
  assert.doesNotMatch(page, /QuickEntry|isFirstPaymentRow/, "no inline quick entry: every debtor row is a plain row with «Внести оплату»");
});

// ── the final contract (addenda 2-4) ─────────────────────────────────────────────────────────

test("the opening reason: required when a replacement meets money (m13); the form says so after REASON_REQUIRED", () => {
  const values = { ...G.emptyOpeningValues(), paidUntil: "2026-10-31", reason: " вносим вручную " };
  assert.deepEqual(G.buildOpeningIn(values), { paid_until: "2026-10-31", debt_amount: null, debt_on: null, reason: "вносим вручную" });
  assert.equal(G.buildOpeningIn({ ...values, reason: "" }).reason, undefined);
  assert.equal(G.isReasonRequired({ code: "REASON_REQUIRED" }), true);
  assert.match(G.validateOpeningReason("ab"), /не короче 3/);
  assert.equal(G.validateOpeningReason("ok ok"), null);
  const { React, text } = renderer();
  const { OpeningToggle } = require(path.join(root, "src/components/payments/opening-balance-fields.tsx"));
  const props = { idPrefix: "o", enabled: true, onEnabled: () => undefined, values, onChange: () => undefined, enrolDate: "2026-10-21", today: "2026-10-21" };
  assert.ok(!text(React.createElement(OpeningToggle, props)).includes("Причина"));
  assert.ok(text(React.createElement(OpeningToggle, { ...props, needsReason: true })).includes("обязательно: у ученика уже есть оплаты"));
  for (const file of ["src/components/groups/add-student-drawer.tsx", "src/components/groups/assign-group-modal.tsx"]) assert.match(read(file), /isReasonRequired\(failure\) && openingOn/, file);
});

test("pause PATCH: REASON_REQUIRED opens the reason, PAUSE_RANGE is said inline; excuses on a pause", () => {
  const dialog = read("src/components/payments/pause-dialog.tsx");
  assert.match(dialog, /isReasonRequired\(failure\) && acting\.action === "end"\) \{ setEndNeedsReason\(true\)/);
  assert.match(dialog, /\.\.\.\(endNeedsReason \? \{ reason: cancelReason\.trim\(\) \} : \{\}\)/);
  assert.equal(fixture("errors").PAUSE_RANGE.body.detail.message, "Пауза начинается не раньше чем 30 дней назад");
  const E = require(path.join(root, "src/lib/attendance-excuses.ts"));
  assert.equal(E.excuseCellView("not_required").label, "Не требуется (пауза)");
  assert.equal(E.EXCUSE_ON_PAUSE_TEXT, "Не требуется: ученик на паузе");
  assert.equal(E.excuseCellView("confirmed").tone, "confirmed");
});

test("B1: the group edit form says the type changes from today", () => {
  assert.equal(Y.LINE_NOT_FOUND_TEXT, "Строка ведомости изменилась — обновите страницу");
  assert.equal(Y.isLineNotFound({ code: "LINE_NOT_FOUND" }), true);
  assert.match(read("src/components/payroll/payroll-sheet-page.tsx"), /isLineNotFound\(error\)\) \{ setSaveError\(LINE_NOT_FOUND_TEXT\); void load\(true\)/);
  assert.equal(Y.LESSON_TYPE_FROM_TODAY_TEXT, "Тип меняется с сегодняшнего дня; прошлые месяцы зарплаты не меняются");
  for (const role of ["owner", "admin"]) assert.match(read(`src/app/${role}/groups/[id]/page.tsx`), /\{LESSON_TYPE_FROM_TODAY_TEXT\}/, role);
});

test("payment tabs: the rows of each tab come from `buckets`, a tab «На паузе» appears with somebody on a pause; the statement keeps the new rows", () => {
  const summary = named("A30_");
  assert.deepEqual(P.PAYMENT_BUCKETS.map((b) => P.bucketTabLabel(b.label, P.bucketCount(summary, b.key))), ["Должники (3)", "Скоро платить (1)", "Оплачено (4)"]);
  assert.equal(P.bucketCount(summary, "paused"), 1);
  // owner: the badge counts STUDENTS, like the card, even when a student owes in two groups (4 rows, 3 students)
  const twoGroups = { ...summary, debtors: 3, students_with_debt: 3, buckets: { ...summary.buckets, debt: 4, paused: 2 }, students_paused: 1 };
  assert.equal(P.bucketCount(twoGroups, "debt"), 3);
  assert.equal(P.positionCards(twoGroups)[0].sub.split(" ")[0], String(P.bucketCount(twoGroups, "debt"))); // card == tab badge
  assert.equal(P.bucketCount(twoGroups, "paused"), 1);
  assert.deepEqual(P.visibleBuckets(summary, "debt").map((b) => b.label), ["Должники", "Скоро платить", "Оплачено", "На паузе"]);
  assert.deepEqual(P.visibleBuckets({ buckets: { paused: 0 } }, "debt").length, 3);
  assert.equal(P.parseBucket("paused"), "paused");
  // the card shows students, the tab rows: with one debt membership per student they are the same number
  assert.equal(P.positionCards(summary)[0].sub, "3 ученика с долгом");
  assert.equal(P.positionCards(summary)[0].sub.split(" ")[0], String(P.bucketCount(summary, "debt")));
  assert.equal(P.positionCards(summary)[1].sub, "1 ученик оплатил вперёд");
  assert.equal(P.priceMissingText(summary.price_missing), "У 1 ученика не задана цена");
  const row = named("A29_");
  assert.equal(P.debtReasonText(row), "Ещё не платил");
  assert.equal(row.bucket, "debt");
  const opening = L.buildStatementItems(L.normalizeStatement(named("A31_")), null);
  assert.deepEqual(opening.filter((i) => i.kind === "row").map((r) => [r.type, r.charged]), [["opening_debt", 250000], ["charge", 213000]]);
  assert.match(opening.find((i) => i.kind === "month").summary, /долг на начало/);
  const info = L.buildStatementItems(L.normalizeStatement(named("A32_")), null).filter((i) => i.kind === "row");
  assert.deepEqual(info.map((r) => [r.type, r.title, r.charged, r.paid]), [["opening_paid_until", "Остаток на начало: оплачено до 15.11", null, null], ["pause", "Пауза 05.11–20.11 — начислений нет", null, null]]);
});

test("an individual price asks the server what it changes (dry run) and shows the same window as the group price", () => {
  const dry = named("A33_");
  assert.equal(dry.dry_run, true);
  const money = G.normalizePriceMoney(dry.impact.money);
  assert.ok(G.priceMoneyLines(money).length >= 0);
  const code = read("src/components/payments/membership-price.tsx");
  assert.match(code, /orgApi\.setMembershipPrice\(membershipId, request, \{ dryRun: true \}\)/);
  assert.equal((code.match(/<OverrideImpactBlock/g) || []).length, 2); // «Назначить» and «Вернуть цену группы»
});

test("moneyChip: the status chip comes from the money, never contradicts the debt next to it (owner 22.10)", () => {
  const chip = (row) => { const c = P.moneyChip(row); return `${c.label}|${c.tone}`; };
  // a part is paid, the paid period still runs: not «Оплачено», but «Не доплачено»
  assert.equal(chip({ status: "active", debt: 300000, last_payment: { id: "p" }, paid_until: "2026-11-02" }), "Не доплачено|warning");
  assert.equal(chip({ status: "expiring", debt: 100000, last_payment: { id: "p" }, days_left: 3 }), "Не доплачено|warning");
  // the period has ended with a debt: red, with the days
  assert.equal(chip({ status: "expired", debt: 750000, days_overdue: 20, last_payment: null }), "Просрочено на 20 дней|danger");
  assert.equal(chip({ status: "active", debt: 5000, debt_reason: "overdue", days_overdue: 2, last_payment: { id: "p" } }), "Просрочено на 2 дня|danger");
  assert.equal(chip({ status: "expired", period_mode: "lessons", debt: 1, last_payment: { id: "p" } }), "Уроки закончились|danger");
  // never paid, not overdue yet
  assert.equal(chip({ status: "none", debt: 500000, last_payment: null }), "Ещё не платил|warning");
  assert.equal(chip({ status: "active", debt: 500000, debt_reason: "never_paid", last_payment: null }), "Ещё не платил|warning");
  // paused stays paused
  assert.equal(chip({ status: "paused", debt: 0, paused: { from: "2026-10-20", to: "2026-11-01" } }), "На паузе до 01.11|muted");
  // no debt: the date status as before
  assert.equal(chip({ status: "active", debt: 0, last_payment: { id: "p" } }), "Оплачено|ok");
  assert.equal(chip({ status: "active", last_payment: null }), "Оплачено|ok");
  assert.equal(chip({ status: "expiring", debt: 0, days_left: 5 }), "Осталось 5 дней|warning");
  assert.equal(chip({ status: "ends_today", debt: 0 }), "Сегодня последний день|warning");
  assert.equal(chip({ status: "none", debt: 0 }), "Без оплат|muted");
  assert.equal(chip({ status: "free", debt: 0 }), "Бесплатно|free");
  // the invariant: «Оплачено» never stands next to a debt
  for (const status of ["none", "free", "expired", "ends_today", "expiring", "active"]) {
    assert.notEqual(P.moneyChip({ status, debt: 1, last_payment: { id: "p" } }).label, "Оплачено");
  }
});

test("pause on the group list: on_pause hides the student from a lesson of today, the chip says until when", () => {
  const S = require(path.join(root, "src/lib/substitutions.ts"));
  const list = [{ id: "a", on_pause: false }, { id: "b", on_pause: true, paused_until: "2026-11-01" }, { id: "c" }];
  assert.deepEqual(S.withoutPaused(list).map((s) => s.id), ["a", "c"]);
  assert.equal(P.pausedChipText(list[1]), "На паузе до 01.11");
  assert.equal(P.pausedChipText({ on_pause: true }), "На паузе");
  assert.equal(P.pausedChipText(list[0]), null);
  assert.equal(P.pausedChipText(list[2]), null);
});

test("the banner speaks the language of the card «Долг учеников»: debtors, their debt, how many are overdue", () => {
  const B = require(path.join(root, "src/lib/payments-banner.ts"));
  const copy = B.debtBannerCopy({ debtors: 33, debtTotal: 21395000, overdue: 19 });
  assert.equal(plain(copy.text), "33 ученика с долгом — 21 395 000 сум · из них просрочено: 19");
  assert.equal(copy.count, 33);
  assert.equal(copy.chip, "из них просрочено: 19");
  assert.equal(plain(B.debtBannerCopy({ debtors: 1, debtTotal: 500000, overdue: 0 }).text), "1 ученик с долгом — 500 000 сум");
  assert.equal(B.debtBannerCopy({ debtors: 1, debtTotal: 500000, overdue: 9 }).expired, 1, "never more overdue than debtors");
  assert.equal(B.debtBannerCopy({ debtors: null, debtTotal: 0, overdue: null }).count, 0);
  const banner = read("src/components/payments/payments-alert-banner.tsx");
  assert.match(banner, /debtBannerCopy\(/);
  assert.match(banner, /!pathname\?\.startsWith\(paymentsBasePath\)/, "no banner on the «Оплаты» page itself");
  assert.match(banner, /bucket=debt/);
});
