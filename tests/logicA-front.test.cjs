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
const SUMM = require(path.join(root, "src/lib/payments-summary.ts"));
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

test("the contract: 36 operations, every one a screen of the front calls has a helper in orgApi (opening void and the payouts list have no screen: their helpers are gone, wave D)", () => {
  const contract = fixture("logicA_contract");
  const operations = Object.entries(contract.paths).flatMap(([route, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${route}`));
  assert.equal(operations.length, 36);
  const api = read("src/lib/api.ts");
  const needed = {
    "opening get/put": /opening-balance\$\{options\?\.dryRun \? "\?dry_run=true" : ""\}/,
    "pauses": /\/pauses\$\{options\?\.dryRun/, "pause patch": /\/pauses\/\$\{encodePathId\(pauseId\)\}\$\{options\?\.dryRun/, "pause void": /pauses\/\$\{encodePathId\(pauseId\)\}\/void/,
    "leave preview": /leave-preview/, "leave": /\/leave`/, "archive preview": /archive-preview/, "payouts": /payroll\/sheets\/\$\{encodePathId\(sheetId\)\}\/payouts/,
    "payout void": /payroll\/payouts\/\$\{encodePathId\(payoutId\)\}\/void/, "divisor": /payroll\/settings", \{ method: "PUT", body \}/,
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
      assert.ok(preview.memberships.every((m) => m.allowed.length > 0 && (m.money === null || Number.isInteger(m.money.unpaid))), file);
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
  // enrolment after the start: L = the enrolment day, the hint is about the enrolment (not «внесите как долг»)
  assert.match(G.validateOpening({ ...empty, paidUntil: "2026-09-15" }, ctx), /не раньше 21\.10\.2026: дня зачисления/);
  assert.match(G.validateOpening({ ...empty, debt: "250 000" }, ctx), /на какую дату был долг/);
  assert.match(G.validateOpening({ ...empty, debt: "250 000", debtOn: "2026-10-22" }, ctx), /не позже дня зачисления/);
  assert.match(G.validateOpening({ ...empty, paidUntil: "2028-01-01" }, ctx), /не дальше чем на год/);
  assert.match(G.validateOpening({ ...empty, debtOn: "2026-09-30" }, ctx), /сумму долга/);
  // a PUT with an empty form voids the live record
  assert.deepEqual(G.buildOpeningPut({ ...empty, reason: " ошибка " }), { paid_until: null, debt_amount: null, debt_on: null, reason: "ошибка" });
  // the words of the owner on the form
  assert.equal(G.OPENING_TITLE, "Остаток на начало учёта");
  assert.equal(G.OPENING_PAID_UNTIL_HINT, "Ученик уже заплатил до этой даты — до запуска в ALGO. Эти дни не входят в стоимость и не превращаются в аванс.");
});

// S0 (22.10): the single opening follows the server rule `L = max(enrolDate, accountingStart − 1)` (`LogicaService.floor_of`), the same as the bulk page
test("S0 parity: the form of the single opening checks against L = max(enrolDate, accountingStart − 1 day)", () => {
  const empty = G.emptyOpeningValues();
  const paid = (paidUntil) => ({ ...empty, paidUntil });
  const owes = (debtOn) => ({ ...empty, debt: "100 000", debtOn });
  // came before the start: L = start − 1
  const before = { enrolDate: "2026-09-10", accountingStart: "2026-11-01", today: "2026-10-22" };
  assert.equal(G.openingFloor(before), "2026-10-31");
  assert.equal(G.validateOpening(paid("2026-10-31"), before), null); // paidUntil = start − 1: OK
  assert.equal(G.validateOpening(owes("2026-10-31"), before), null); // debtOn = start − 1: OK
  assert.match(G.validateOpening(owes("2026-11-01"), before), /не позже 31\.10\.2026/); // debtOn = start: refused
  assert.match(G.validateOpening(paid("2026-10-30"), before), /не раньше 31\.10\.2026: за более ранние дни внесите как долг/);
  // enrolment on / after the start: L = the enrolment day
  const after = { enrolDate: "2026-11-05", accountingStart: "2026-11-01", today: "2026-11-05" };
  assert.equal(G.openingFloor(after), "2026-11-05");
  assert.equal(G.validateOpening(paid("2026-11-05"), after), null);
  assert.match(G.validateOpening(paid("2026-11-04"), after), /не раньше 05\.11\.2026: дня зачисления/);
  assert.doesNotMatch(G.validateOpening(paid("2026-11-04"), after), /как долг/);
  assert.equal(G.validateOpening(owes("2026-11-05"), after), null);
  assert.match(G.validateOpening(owes("2026-11-06"), after), /не позже дня зачисления \(05\.11\.2026\)/);
  // enrolDate = start: the enrolment day is later than the seam
  assert.equal(G.openingFloor({ enrolDate: "2026-11-01", accountingStart: "2026-11-01" }), "2026-11-01");
  // the server's own floor wins over the local rule
  const served = { ...before, floor: "2026-10-15" };
  assert.equal(G.openingFloor(served), "2026-10-15");
  assert.equal(G.validateOpening(paid("2026-10-15"), served), null);
  assert.match(G.validateOpening(owes("2026-10-16"), served), /не позже 15\.10\.2026/);
  // the enrolment is not known (the card): the seam alone bounds «оплачено до»; the debt date is left to the server
  const unknown = { enrolDate: null, accountingStart: "2026-11-01", today: "2026-10-22" };
  assert.match(G.validateOpening(paid("2026-10-30"), unknown), /не раньше 31\.10\.2026/);
  assert.equal(G.openingDebtMax(unknown), null);
  assert.equal(G.validateOpening(owes("2026-11-20"), unknown), null); // L may be later than the seam (the enrolment): not for the front to refuse
  // no accounting start known at all: only the enrolment rule is left
  assert.match(G.validateOpening(paid("2026-09-01"), { enrolDate: "2026-09-10", today: "2026-10-22" }), /не раньше 10\.09\.2026/);
});

test("S0 parity: every caller passes the accounting start and the date inputs carry L", () => {
  assert.match(read("src/lib/payments-summary.ts"), /accountingStart: .*accounting_start_date/);
  const summaryOf = require(path.join(root, "src/lib/payments-summary.ts")).summaryToState;
  assert.equal(summaryOf({ accounting_start_date: "2026-11-01" }).accountingStart, "2026-11-01");
  assert.equal(summaryOf({}).accountingStart, null);
  for (const file of ["src/components/groups/assign-group-modal.tsx", "src/components/groups/add-student-drawer.tsx"]) {
    const code = read(file);
    assert.match(code, /state\.accountingStart/, file);
    assert.match(code, /validateOpening\(opening, \{ enrolDate: [^}]*accountingStart/, file);
    assert.match(code, /accountingStart=\{accountingStart\}/, file);
  }
  const actions = read("src/components/payments/membership-row-actions.tsx");
  assert.match(actions, /state\.accountingStart/);
  assert.match(actions, /accountingStart=\{accountingStart\}/);
  const fields = read("src/components/payments/opening-balance-fields.tsx");
  assert.match(fields, /openingFloor\(\{ enrolDate, accountingStart, floor \}\)/);
  assert.match(fields, /min=\{earliest\}/);
  assert.match(fields, /max=\{openingDebtMax\(\{ enrolDate, accountingStart, floor \}\) \?\? today\}/); // the debt date: not later than L
  const dialog = read("src/components/payments/opening-balance-dialog.tsx");
  assert.match(dialog, /validateOpening\(values, \{ enrolDate: enrolDate \?\? null, accountingStart, floor, today \}\)/);
});

test("opening balance fixtures: the impact in words, the card line, the void", () => {
  const a01 = named("A01_");
  const impact = G.normalizeImpact(a01.impact);
  assert.deepEqual(G.openingImpactLines(impact).map(plain), ["Остаток: долг 213 000 сум → 0", "Оплачено до: 20.10.2026 → 31.10.2026", "Стоимость: −213 000 сум"]);
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
  // Money-1 A1: the 30 days of the pause are gone - the closed month of the teacher is the one rule (the server: 422 PAUSE_LOCKED), so the form lets a backdated start through
  assert.equal(G.pauseEarliest, undefined);
  assert.equal(G.PAUSE_BACKDATE_DAYS, undefined);
  assert.equal(G.validatePause({ first: "2026-10-20", last: "2026-10-24", reason: "" }, today), null);
  assert.equal(G.validatePause({ first: "2026-09-01", last: "2026-10-24", reason: "" }, today), null);
  assert.equal(G.PAUSE_BACKDATE_HINT, "Задним числом можно, пока месяц не закрыт");
  assert.match(G.validatePause({ first: "2026-10-24", last: "2026-10-20", reason: "" }, today), /раньше, чем начинается/);
  assert.match(G.validatePause({ first: "2026-10-20", last: "2028-01-01", reason: "" }, today), /не длиннее 366 дней/);
  assert.equal(G.pauseDays("2026-10-20", "2026-10-24"), 5);
  assert.deepEqual(G.buildPauseBody({ first: "2026-10-20", last: "2026-10-24", reason: " уехал " }), { first_day: "2026-10-20", last_day: "2026-10-24", reason: "уехал" });
  const saved = named("A06_");
  const calc = { pause: saved.pause, impact: G.normalizeImpact(saved.impact) };
  assert.deepEqual(G.pauseCalcLines(calc).map(plain), [
    "Дни паузы не входят в стоимость: 5 дней, −100 000 сум. Место в группе сохраняется.", "Оплачено до станет 03.11.", "Остаток: долг 20 000 сум → аванс 80 000 сум",
  ]);
  // a role without money sees no sum
  assert.deepEqual(G.pauseCalcLines({ pause: saved.pause, impact: null }), ["Дни паузы не входят в стоимость: 5 дней. Место в группе сохраняется."]);
  const warnings = G.pauseWarnings(saved, today);
  assert.ok(warnings[0].startsWith("Пауза задним числом: уроки с 20.10 по 20.10 не будут засчитаны ни ученику, ни преподавателю"));
  assert.ok(warnings.some((line) => /Зарплата за октябрь изменится — потом сохраните новую сумму/.test(line)));
  assert.match(G.attendedText(["2026-10-12", "2026-10-14"]), /^Ученик был отмечен на уроках 12\.10, 14\.10 — на эти даты паузу поставить нельзя$/);
  // the chip: «На паузе до 20.10»; in the list and in the card
  assert.equal(G.pausedChipText({ from: "2026-10-11", to: "2026-10-20" }), "На паузе до 20.10");
  // PAY-DUE: the label of a paused membership is the server's `state_text` («Пауза до 24.10»), the screen builds none
  assert.equal(require(path.join(root, "src/lib/pay-state.ts")).payLabel({ state: "paused", state_text: "Пауза до 24.10" }).text, "Пауза до 24.10");
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
  // PAY-TAILS Б2.4: the outcome is ONE sentence of the server («Останется аванс …»); the fixture of the server carries none - the screen says nothing (LESSONS 151)
  assert.equal(G.settleHeadline(m), "");
  const advanceSaid = { ...m, effects: { kind: "leave", moves: [], ends: [], stays: [{ code: "advance", amount: 135000, text: "Останется аванс 135 000 сум" }] } };
  assert.equal(plain(G.settleHeadline(advanceSaid)), "Останется аванс 135 000 сум");
  assert.equal(plain(G.SETTLE_LABEL.refund(135000)), "Вернуть 135 000 сум");
  // «keep» by default: the request says what the owner saw
  // PAY-TAILS Б5.1: an item for every membership with what was shown (the sum unpaid, the advance, the business day of the probe)
  const seen = { membership_id: m.membership_id, expected_unpaid: m.money.unpaid, expected_advance: m.money.advance, expected_as_of: refund.as_of };
  assert.deepEqual(G.buildSettle(refund, {}), [{ ...seen, action: "keep" }]);
  const choices = { [m.membership_id]: { action: "refund", method: null, reason: "" } };
  assert.match(G.validateSettle(refund, choices), /выберите, как вернули деньги/);
  choices[m.membership_id].method = "cash";
  assert.equal(G.validateSettle(refund, choices), null);
  assert.deepEqual(G.buildSettle(refund, choices), [{ ...seen, action: "refund", expected_refundable: 135000, method: "cash" }]);
  assert.deepEqual(G.settledLines(named("A10_").settled).map(plain), ["Возвращено 135 000 сум"]);
  // a debt after leaving (chain 4): keep, or forgive with a reason
  const archive = G.normalizeLeavePreview(named("A11_"));
  const debt = archive.memberships[0];
  // the fixture of the server carries no `effects`: the server is silent, the screen says nothing about what stays (LESSONS 151, PAY-DUE 10.5)
  assert.equal(G.settleHeadline(debt), "");
  const said = { ...debt, effects: { kind: "archive", moves: [], ends: [], stays: [{ code: "debt", amount: 347000, text: "Долг 347 000 сум останется за учеником в группе «A-1»: принять или простить его можно в её выписке" }] } };
  assert.equal(plain(G.settleHeadline(said)), "Долг 347 000 сум останется за учеником в группе «A-1»: принять или простить его можно в её выписке");
  assert.equal(plain(G.SETTLE_LABEL.keepDebt), "Оставить долг — оплатить можно и после ухода");
  assert.equal(plain(G.SETTLE_LABEL.keepUnpaid), "Оставить как есть — оплатить можно и после ухода");
  assert.equal(plain(G.SETTLE_LABEL.forgive(347000)), "Простить 347 000 сум");
  assert.equal(G.keepUnpaidLabel({ debt_amount: 347000, due_amount: 0 }), G.SETTLE_LABEL.keepDebt, "a whole debt after the leaving: «Оставить долг»");
  assert.equal(G.keepUnpaidLabel({ debt_amount: 0, due_amount: 125000 }), G.SETTLE_LABEL.keepUnpaid, "a sum «к оплате» that stays is not named a debt");
  assert.equal(G.keepUnpaidLabel({ debt_amount: 100000, due_amount: 25000 }), G.SETTLE_LABEL.keepUnpaid);
  const forgive = { [debt.membership_id]: { action: "writeoff", method: null, reason: "ab" } };
  assert.match(G.validateSettle(archive, forgive), /причину прощения долга/);
  forgive[debt.membership_id].reason = " договорённость с родителем ";
  assert.deepEqual(G.buildSettle(archive, forgive), [{ membership_id: debt.membership_id, action: "writeoff", expected_unpaid: 347000, expected_advance: debt.money.advance, expected_as_of: archive.as_of, reason: "договорённость с родителем" }]);
  // no money to see, no settlements, a hidden balance
  assert.equal(G.settleHeadline({ money: null, has_open_balance: true, allowed: ["keep"] }), "У ученика есть расчёты по оплате — их видит владелец");
  assert.equal(G.settleHeadline({ money: { unpaid: 0, advance: 0 }, has_open_balance: false, allowed: ["keep"] }), "Расчётов нет — можно убирать");
  assert.deepEqual(G.buildSettle({ memberships: [{ membership_id: "x", money: null, has_open_balance: true, allowed: ["keep"] }] }, {}), []);
  // an individual price ends with the stay (F13)
  assert.equal(G.normalizeLeavePreview(named("A12_")).memberships[0].money.individual_price_ends, true);
  // BALANCE_CHANGED (PAY-TAILS Б5.1): nothing is written; the window closes and the page says the server's words (no fresh numbers are merged into the window any more: the next opening reads the probe again)
  const errors = fixture("errors");
  const changed = G.logicaError({ code: "BALANCE_CHANGED", message: "x", detail: errors.BALANCE_CHANGED.body.detail });
  assert.equal(changed.fresh.length, 1);
  assert.equal(G.isShownChanged(changed), true);
  assert.equal(G.isShownChanged({ code: "MONEY_RIGHT_REQUIRED" }), false);
  assert.equal(G.applyFreshBalances, undefined, "the merge of the fresh numbers is gone");
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
  for (const part of ["Вернуть 135 000 сум", "Оставить на счёте", "Как вернули", "Наличные"]) assert.ok(body.includes(part), part);
  assert.ok(!body.includes("Что сделать?"), "the screen makes up no sentence about the advance: it says the server's outcome or nothing");
  const advanceWords = { ...preview, memberships: [{ ...m, effects: { kind: "leave", moves: [], ends: [], stays: [{ code: "advance", amount: 135000, text: "Останется аванс 135 000 сум" }] } }] };
  assert.ok(text(React.createElement(SettleBlock, { preview: advanceWords, choices: {}, onChoice: () => undefined })).includes("Останется аванс 135 000 сум"));
  const withWords = G.normalizeLeavePreview(named("A11_"));
  withWords.memberships[0].effects = { kind: "archive", moves: [], ends: [], stays: [{ code: "debt", amount: 347000, text: "Ученик уходит из центра: вся неоплаченная сумма 347 000 сум в группе «A-1» станет долгом" }] };
  const debt = text(React.createElement(SettleBlock, { preview: withWords, choices: {}, onChoice: () => undefined }));
  for (const part of ["Ученик уходит из центра: вся неоплаченная сумма 347 000 сум в группе «A-1» станет долгом", "Оставить долг — оплатить можно и после ухода", "Простить 347 000 сум"]) assert.ok(debt.includes(part), part);
  assert.ok(!debt.includes("После ухода у ученика долг"), "no own sentence about the debt: the words are the server's");
  // Money-2 wave 2 (Б3): no own sentence about the individual price - the server's `effects.ends` say it (tests of the window: money2-w1-leave)
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
  // Money-1 B3: the window is a table «было → станет» of every student (the sentence of the server over it), not the old bullet lines
  assert.ok(["Ахмедов Б.", "Оплачено до", "12.11", "10.11"].every((part) => block.includes(part)), block);
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
  // Money-1 B3: «Сохранить» of a change of the mode opens the window that asks the dry run (one per student)
  assert.match(page, /<RegimeChangeDialog open=\{regimeOpen\} changes=\{regimeDiff\}/);
  assert.match(read("src/components/settings/regime-change-dialog.tsx"), /orgApi\.previewPaymentSettings\(body\)/);
  assert.match(page, /\{REGIME_HINT\}/);
  assert.ok(G.CANCELLED_LESSON_TEXT.startsWith("Отменённый центром урок не уменьшает оплату месяца"));
});

// ── decision 6: payouts ──────────────────────────────────────────────────────────────────────

test("payouts: chips, parts, the form and the overpayment question (G-PAY)", () => {
  const unpaid = Y.normalizePayoutState(named("A28_"));
  const due = Y.normalizePayoutState(named("A21_"));
  const lower = Y.normalizePayoutState(named("A24_"));      // the data FELL by 125 000 after the saving: the payout still stands by the saved 600 000
  // an overpaid month (a payout above the saved sum was confirmed as an advance)
  const over = { ...lower, state: "overpaid", target: 350000, saved_total: 350000, balance: -125000, changed_by: 0, change_text: null, text: "Переплачено 125 000" };
  assert.equal(Y.payoutChip(unpaid).text, "Не выплачено");
  // Money-1 A1b (A21): the data moved by +125 000 after the saving - the payout stays by the SAVED 475 000 (settled), the change is its own line
  assert.equal(due.basis, "saved");
  assert.equal(due.target, 475000);
  assert.equal(due.state, "settled");
  assert.equal(Y.payoutChip(due).text, "Выплачено полностью");
  assert.equal(Y.payoutChangedBy(due), 125000);
  assert.equal(plain(Y.payoutChangeLine(due).text), "Зарплата изменилась на +125 000 сум");
  assert.equal(plain(Y.payoutChangeLine(due).title), "После сохранения зарплата изменилась на +125 000 сум. Сохраните новую сумму, чтобы учесть изменение");     // the server's sentence, as it came
  assert.equal(Y.payoutChangeLine(unpaid), null);
  assert.equal(plain(Y.payoutChangeLine({ changed_by: -50000, change_text: null }).text), "Зарплата изменилась на −50 000 сум");
  assert.deepEqual([lower.state, lower.target, lower.balance, lower.changed_by], ["settled", 600000, 0, -125000]);
  assert.equal(plain(Y.payoutChangeLine(lower).text), "Зарплата изменилась на −125 000 сум");
  // a month still owing: saved 600 000, paid 475 000
  const owing = { ...due, state: "due", target: 600000, saved_total: 600000, balance: 125000, changed_by: 0, change_text: null, text: "Выплачено 475 000 из 600 000 · осталось 125 000" };
  assert.equal(plain(Y.payoutChip(over).text), "Выплачено больше на 125 000 сум");
  assert.equal(plain(Y.payoutChip(owing).text), "Выплачено 475 000 сум из 600 000 сум");
  assert.equal(Y.payoutChip({ ...owing, state: "settled", balance: 0 }).text, "Выплачено полностью");
  assert.equal(Y.payoutChip(null), null);
  assert.equal(due.text, "Выплачено полностью"); // the server's sentence stays as it came
  // the totals of the month are the tiles of the list (monthTotals = the sums of the rows: tests/ux-pack-month-list.test.cjs)
  // the form: the amount starts as what is left; more than that asks
  const values = Y.emptyPayoutValues("2026-11-12", owing);
  assert.equal(values.amount, "125\u00a0000");     // WAVE E (DUP-6): the prefilled sum holds the same characters as a typed one
  assert.equal(Y.validatePayout(values, "2026-11-12"), "Выберите способ выплаты");
  const ready = { ...values, method: "cash" };
  assert.equal(Y.validatePayout(ready, "2026-11-12"), null);
  assert.deepEqual(Y.buildPayoutBody(ready), { amount: 125000, paid_on: "2026-11-12", method: "cash" });
  assert.equal(plain(Y.payoutOverpayQuestion(30000)), "Это на 30 000 сум больше, чем осталось выплатить: эти 30 000 сум запишем как выплату вперёд и вычтем из следующей выплаты.");     // MN-32 (wave B P4): the server decides, the owner confirms
  assert.equal(plain(Y.payoutAfterText(100000, owing)), "Останется выплатить 25 000 сум");
  assert.equal(Y.payoutAfterText(125000, owing), "Это вся сумма — останется выплатить 0 сум");
  assert.equal(Y.payoutAfterText(125000, owing, "2026-10"), "Это вся сумма — останется выплатить 0 сум");
  assert.match(Y.validatePayout({ ...ready, paidOn: "2026-11-13" }, "2026-11-12"), /не может быть в будущем/);
  assert.match(Y.validatePayout({ ...ready, amount: "" }, "2026-11-12"), /Укажите сумму/);
  assert.equal(plain(Y.payoutLine(named("A20_").payout)), "05.11.2026 · 475 000 сум · Наличные · Арслан");
  assert.equal(Y.payoutError({ code: "DUPLICATE_PAYOUT", message: "Выплата уже внесена" }).kind, "duplicate");
  // the void of a payout puts the balance back by its amount
  const voided = named("A25_");
  assert.ok(voided.payout.voided_at);
  assert.equal(Y.payoutChip(Y.normalizePayoutState(voided.state)).tone, "due");     // Money-1 A1b: the saved 600 000, the 475 000 of the live payout: «осталось 125 000»
  assert.equal(plain(Y.payoutChip(Y.normalizePayoutState(voided.state)).text), "Выплачено 475 000 сум из 600 000 сум");
  assert.equal(Y.livePayouts(Y.normalizePayoutState(voided.state)).length, 1);
});

test("the sheet block and the month row draw the payout", () => {
  const { React, text, html } = renderer();
  const { SheetPayoutBlock } = require(path.join(root, "src/components/payroll/payout-block.tsx"));
  const due = named("A21_");
  const block = text(React.createElement(SheetPayoutBlock, { sheetId: "s1", month: "2026-10", teacherName: "Каримова", payout: due, onChanged: () => undefined }));
  for (const part of ["Выплата", "Выплачено полностью", "Записать выплату", "05.11.2026 · 475 000 сум · Наличные · Арслан", "Отменить"]) assert.ok(block.includes(part), part);
  // D-3 of the walk of 05.11 (rule 87): the sum is the card above, the payouts are this list - no labelled figures that say them again
  assert.ok(!block.includes("К выплате") && !block.includes("Осталось выплатить"), block);
  assert.equal((plain(block).match(/475 000/g) || []).length, 1, "the 475 000 is said once: in the list of payouts");
  // one fact once (LESSONS 87): the change after the saving is said by the card of the sheet («Пересохранить»), not again under the payout
  assert.ok(!block.includes("изменилась на") && !block.includes("125 000"), block);
  const over = text(React.createElement(SheetPayoutBlock, { sheetId: "s1", month: "2026-10", teacherName: "Каримова", payout: { ...named("A24_"), state: "overpaid", target: 350000, balance: -125000, changed_by: 0, change_text: null }, onChanged: () => undefined }));
  assert.ok(over.includes("Выплачено больше на 125 000 сум"));
  assert.equal(html(React.createElement(SheetPayoutBlock, { sheetId: "s1", month: "2026-10", teacherName: "К", payout: null, onChanged: () => undefined })), "");
  const { TeacherRow } = require(path.join(root, "src/components/payroll/payroll-month-page.tsx"));
  const teacher = { teacher_id: "t", teacher_name: "Каримова", lessons_count: 12, lesson_types: [], rates: { group: "50" }, missing_rates: [], sheet: { id: "s1", revision: 1, total_amount: 475000, stale: true, updated_at: null }, warnings: {}, payout: due };
  const row = text(React.createElement(TeacherRow, { teacher, month: "2026-10", busy: false, onCalculate: () => undefined, onOpen: () => undefined }));
  assert.ok(row.includes("выплачено ✓"), "the column «Остаток» of the row says it (UX pack §5.2)");
  assert.ok(plain(row).includes("Требует действия"), "the month row names the change after the saving - ONCE, as an item of the ONE status chip (UX pack §5.2-бис)");
  assert.ok(!plain(row).includes("изменилось на"), "not a second time under the payout");
  const rowHtml = html(React.createElement(TeacherRow, { teacher, month: "2026-10", busy: false, onCalculate: () => undefined, onOpen: () => undefined }));
  assert.match(rowHtml, /data-testid="teacher-rest"/, "the payout is the columns «Выплачено» and «Остаток» of the row (UX pack §5.2): no chip of its own");
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
  assert.equal(Y.DIVISOR_HELP, "Старые месяцы не меняются. Месяцы, рассчитанные с другим делителем, покажут «Данные изменились».");
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

test("statement: Стоимость | Оплачено | Остаток, the month's own charge, the exact remainder per allocation (E1)", () => {
  const statement = L.normalizeStatement(pay2("e1_statement_790000"));
  const items = L.buildStatementItems(statement, null);
  // a month header is only the name of the month (owner 23.10: the figures are in the columns, the summary repeated them)
  assert.deepEqual(items.filter((i) => i.kind === "month").map((i) => [i.title, "summary" in i]), [["Сентябрь 2026", false], ["Октябрь 2026", false]]);
  assert.equal(L.monthChargeSummary, undefined);
  // the exact remainder after each piece of money comes from the server
  const rows = items.filter((i) => i.kind === "row");
  assert.deepEqual(rows[1].allocations.map(plain), ["за 15.09–14.10 — 231 000 (осталось 269 000)"]);
  const first = statement.rows[1].details.allocations[0];
  assert.equal(first.segment_remaining_after, 269000);
  const tweaked = { ...statement, rows: statement.rows.map((row, index) => (index === 1 ? { ...row, details: { ...row.details, allocations: [{ ...first, segment_remaining_after: 111000 }] } } : row)) };
  assert.deepEqual(L.buildStatementItems(tweaked, null).filter((i) => i.kind === "row")[1].allocations.map(plain), ["за 15.09–14.10 — 231 000 (осталось 111 000)"]);
  // the totals and the balance
  assert.deepEqual(L.statementTotals(statement.summary).map((t) => t.label), ["Стоимость обучения", "Оплачено"]);       // 14Б.7: the state is on the right of the summary, not a tile
  // the running balance of a row is the server's `balance_text` (PAY-TAILS: the screen makes no sentence of its own)
  assert.equal(L.signedBalanceText, undefined);
});

test("statement: a forgiven debt, a correction and the opening rows are told in the owner's words", () => {
  const statement = L.normalizeStatement(pay2("e1_statement_790000"));
  const base = statement.rows[1];
  const rows = [
    statement.rows[0],
    { ...base, details: { ...base.details, replaces_amount: 450000, replaces_receipt_no: 12 } },
    { ...base, seq: 7, type: "writeoff", title: "Прощено 40 000 сум — причина: болезнь · Рустам", debit: 0, credit: 40000, outflow: 0, balance_after: -229000, details: { ...base.details, allocations: [], reason: "болезнь", created_by_name: "Рустам", writeoff_id: "w1", payment_id: null } },
    { ...base, seq: 8, type: "opening_debt", title: "Долг на начало учёта на 30.09.2026", date: "2026-09-30", debit: 250000, credit: 0, outflow: 0, balance_after: -250000, details: { ...base.details, allocations: [], segment: null } },
    { ...base, seq: 9, type: "opening_paid_until", title: "Остаток на начало: оплачено до 31.10 (до ALGO)", date: "2026-10-21", debit: 0, credit: 0, outflow: 0, balance_after: -250000, details: { ...base.details, allocations: [] } },
  ];
  const view = L.buildStatementItems({ ...statement, rows }, null).filter((i) => i.kind === "row");
  assert.equal(view[0].type, "charge");
  assert.equal(plain(view[1].replaced), "исправлена: было 450 000");
  assert.equal(plain(view[2].title), "Прощено 40 000 сум — причина: болезнь · Рустам"); // the title of the server (dictionary 3.3)
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
  assert.equal(L.STATEMENT_TYPE_LABEL.writeoff, "Прощено");
  // «Простить сумму» everywhere (the action is named neutrally, the sum is in the button)
  assert.equal(require(path.join(root, "src/components/payments/writeoff-dialog.tsx")).WRITEOFF_ACTION_LABEL, "Простить сумму");
  assert.equal(L.validateWriteoff({ amount: "", all: true, reason: "ok ok" }, 0), "Долга нет — прощать нечего");
  assert.equal(plain(L.balanceAfterText(469000, 0)), "Останется неоплаченным после оплаты: 469 000 сум");
});

test("fix 10Д → PAY-DUE 9.7: the notice of the debt stands NOWHERE (its source test is money2-fix10e-banner.test.cjs); the summary is kept fresh by the shell", () => {
  assert.ok(!fs.existsSync(path.join(root, "src/lib/payments-banner.ts")));
  assert.ok(!fs.existsSync(path.join(root, "src/components/payments/payments-alert-banner.tsx")));
  assert.match(read("src/components/layout/sidebar.tsx"), /usePaymentsSummarySync\(showExcuses, pathname\)/);
});

test("payments page: three cards before the tabs; the card count is the tab count (one number, the server's)", () => {
  const summary = { debt_total: 1250000, debtors: 33, due_total: 400000, due_students: 4, due_nearest: { date: "2026-10-23", text: "завтра, 23.10" }, advance_total: 340000, students_with_advance: 5, expiring: 4, active: 120 };
  const cards = P.positionCards(summary);
  assert.deepEqual(cards.map((card) => [card.label, plain(card.amount), card.sub, card.tone]), [
    ["Долг", "1 250 000 сум", "33 ученика · срок прошёл", "debt"],
    ["К оплате", "400 000 сум", "4 ученика · ближайший срок завтра, 23.10", "due"],
    ["Аванс", "340 000 сум", "5 учеников", "advance"],
  ]);
  // one number for both: the tab and the card are the server's `debtors`
  const tabs = SUMM.summaryToState({ ...summary, period_mode: "calendar", buckets: { debtors: 33, to_pay: 4, expiring: 4, active: 120, paused: 0 } }).tabs;
  assert.equal(P.bucketTabLabel(P.PAYMENT_BUCKETS[0].label, P.bucketCount(tabs, "debtors")), "Должники 33");
  assert.ok(cards[0].sub.startsWith(`${P.bucketCount(tabs, "debtors")} `));
  assert.ok(cards[1].sub.startsWith(`${P.bucketCount(tabs, "to_pay")} `));
  // an answer without the new fields has no count (the old `students_with_debt` / `debt_split` are not read)
  const old = { debtors_debt_total: 70000, advance_total: 0, students_with_debt: 2 };
  assert.equal(P.positionCards(old)[0].sub, "");
  assert.equal(P.positionCards({ debt_total: 0, debtors: 0 })[0].tone, "none");
  assert.deepEqual(P.PAYMENT_BUCKETS.map((b) => b.label), ["Должники", "К оплате", "Заканчивается оплата", "Без долга", "Аванс"]);
  // the line under a row comes from the server too: the reason / «Ещё не платил» / «Просрочено на N дней» of the screen are gone
  for (const gone of ["debtReasonText", "debtReasonLine", "moneyChip"]) assert.equal(P[gone], undefined, gone);
});

test("payment tabs: the numbers of each tab come from the summary, a tab «На паузе» appears with somebody on a pause; the statement keeps the new rows", () => {
  // students (14А.6: `buckets` count STUDENTS): 3 debtors (one of them owes in two groups), 1 on a pause, 1 expiring, 4 without a debt
  const summary = { period_mode: "calendar", debtors: 3, due_students: 0, expiring: 1, active: 4, paused: 2, students_paused: 1, price_missing: 1, advance_total: 100000, students_with_advance: 1, buckets: { debtors: 3, to_pay: 0, expiring: 1, active: 4, paused: 1 } };
  const state = SUMM.summaryToState(summary);
  assert.deepEqual(P.PAYMENT_BUCKETS.map((b) => P.bucketTabLabel(b.label, P.bucketCount(state.tabs, b.key))), ["Должники 3", "К оплате 0", "Заканчивается оплата 1", "Без долга 4", "Аванс 1"]);
  assert.equal(P.bucketCount(state.tabs, "paused"), 1, "the badge counts STUDENTS (1), not memberships (2)");
  assert.deepEqual(P.visibleBuckets(state, "debtors").map((b) => b.label), ["Должники", "К оплате", "Заканчивается оплата", "Без долга", "Аванс", "На паузе"]);
  assert.deepEqual(P.visibleBuckets({ students_paused: 0 }, "debtors").length, 5);
  assert.equal(P.parseBucket("paused"), "paused");
  // the card shows students like the tab does
  assert.equal(P.positionCards(summary)[0].sub, "3 ученика · срок прошёл");
  assert.equal(P.positionCards(summary)[0].sub.split(" ")[0], String(P.bucketCount(state.tabs, "debtors")));
  assert.equal(P.positionCards(summary)[2].sub, "1 ученик");
  assert.equal(P.priceMissingText(summary.price_missing), "У 1 ученика не задана цена");
  const opening = L.buildStatementItems(L.normalizeStatement(named("A31_")), null);
  assert.deepEqual(opening.filter((i) => i.kind === "row").map((r) => [r.type, r.charged]), [["opening_debt", 250000], ["charge", 213000]]);
  assert.equal(opening.find((i) => i.kind === "month").title.includes("2026"), true);
  const info = L.buildStatementItems(L.normalizeStatement(named("A32_")), null).filter((i) => i.kind === "row");
  assert.deepEqual(info.map((r) => [r.type, r.title, r.charged, r.paid]), [["opening_paid_until", "Остаток на начало: оплачено до 15.11", null, null], ["pause", "Пауза 05.11–20.11 — стоимость не считается", null, null]]);
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

test("the label never contradicts the money next to it (owner 22.10, PAY-DUE: the tone is the state's, the words are the server's)", () => {
  const P2 = require(path.join(root, "src/lib/pay-state.ts"));
  const tone = (state, text, extra = {}) => P2.payLabel({ state, state_text: text, ...extra }).tone;
  // a row with an unpaid sum is NEVER green or grey: red after its term, calm blue within it
  assert.equal(tone("debt", "Долг 300 000 сум"), "danger");
  assert.equal(tone("to_pay", "К оплате 300 000 сум"), "due");
  // the sum is paid: green; the period ends soon: amber; a pause stays grey
  assert.equal(tone("paid", "Оплачено до 02.11"), "ok");
  assert.equal(tone("expiring", "Оплачено до 02.11"), "warn");
  assert.equal(tone("paused", "Пауза до 01.11"), "neutral");
  // the invariant: «Оплачено…» never stands for a row with an unpaid part - the server's state is debt / to pay there, whatever the date status says
  for (const [state, debtAmount, dueAmount] of [["debt", 1, 0], ["to_pay", 0, 1], ["debt", 5, 9]]) {
    const label = P2.payLabel({ state, state_text: state === "debt" ? "Долг 1 сум" : "К оплате 1 сум", debt_amount: debtAmount, due_amount: dueAmount, debt_text: "Долг 1 сум", due_text: "К оплате 1 сум" }, state === "debt" ? "debtors" : "to_pay");
    assert.doesNotMatch(label.text, /Оплачено/);
    assert.notEqual(label.tone, "ok");
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

test("schedule cards of the group (owner/admin): information only; the actions by situation live in the lesson sheet (income2 §1)", () => {
  const C = require(path.join(root, "src/lib/schedule-card-actions.ts"));
  const base = { role: "owner", archived: false, today: "2026-10-22", hasTeacherInfo: true };
  assert.deepEqual(C.scheduleCardActions({ ...base, state: "scheduled", date: "2026-10-24" }), ["assign", "reschedule", "cancel"]);
  assert.deepEqual(C.scheduleCardActions({ ...base, state: "scheduled", date: "2026-10-22" }), ["assign", "reschedule", "cancel"]);
  assert.deepEqual(C.scheduleCardActions({ ...base, moneyRight: true, state: "scheduled", date: "2026-10-20" }), ["mark", "assign"], "past, nobody marked: «кто провёл» is the money right's (Money-1 Г-3)");
  assert.deepEqual(C.scheduleCardActions({ ...base, state: "scheduled", date: "2026-10-20" }), ["mark", "assign"], "no right: «кто провёл» stays, off with the reason (К3 круг 3)");
  assert.ok(C.assignLockReason({ ...base, state: "scheduled", date: "2026-10-20" }));
  assert.deepEqual(C.scheduleCardActions({ ...base, state: "completed", date: "2026-10-20" }), ["journal"]);
  assert.deepEqual(C.scheduleCardActions({ ...base, state: "in_progress", date: "2026-10-22" }), ["journal"]);
  assert.deepEqual(C.scheduleCardActions({ ...base, state: "cancelled", date: "2026-10-24" }), ["restore"], "W1 F3: a cancelled lesson to come can be returned");
  assert.deepEqual(C.scheduleCardActions({ ...base, state: "cancelled", date: "2026-10-20" }), [], "a cancelled lesson that has passed has nothing to offer");
  assert.deepEqual(C.scheduleCardActions({ ...base, role: "admin", state: "scheduled", date: "2026-10-24" }), ["assign", "reschedule", "cancel"]);
  assert.deepEqual(C.scheduleCardActions({ ...base, role: "teacher", state: "scheduled", date: "2026-10-24" }), []);
  assert.deepEqual(C.scheduleCardActions({ ...base, archived: true, state: "scheduled", date: "2026-10-24" }), []);
  assert.deepEqual(C.scheduleCardActions({ ...base, hasTeacherInfo: false, state: "scheduled", date: "2026-10-24" }), ["reschedule", "cancel"], "an older server: no assignment");
  assert.equal(C.assignActionLabel({ past: false, lacksTeacher: false, isSubstitution: false }), "Назначить замену");
  assert.equal(C.assignActionLabel({ past: false, lacksTeacher: false, isSubstitution: true }), "Заменить преподавателя");
  assert.equal(C.assignActionLabel({ past: true, lacksTeacher: false, isSubstitution: false }), "Назначить того, кто провёл");
  assert.equal(C.assignActionLabel({ past: false, lacksTeacher: true, isSubstitution: false }), "Назначить");
  const card = read("src/components/groups/group-schedule-overview.tsx");
  const articles = card.slice(card.indexOf("<article"), card.indexOf("</article>"));
  assert.ok(articles.length > 100);
  assert.doesNotMatch(articles, /<button/, "no buttons on the cards");
  assert.doesNotMatch(card, /REPLACE_TEACHER_ACTION|ASSIGN_TEACHER_ACTION/);
  assert.match(card, /<LessonActionSheet/);
  assert.match(card, /data-testid="schedule-card"/);
});

test("schedule cards v2 (owner review 22.10): titles, room, teacher line, moved lesson, 24 h time", () => {
  const C = require(path.join(root, "src/lib/schedule-card-actions.ts"));
  assert.equal(C.lessonTitle({ topic: "  Алгебра  " }, "Группа"), "Алгебра");
  assert.equal(C.lessonTitle({ topic: "" }, "Алгебра 7А"), "Алгебра 7А", "the group name, never «Занятие»");
  assert.equal(C.lessonTitle({}, null), "Урок");
  assert.equal(C.roomLabel({ room: null }), null, "no room: nothing is shown");
  assert.equal(C.roomLabel({ room: " 12 " }), "12");
  assert.equal(C.roomLabel({ format: "online", room: "12" }), "Онлайн");
  const no = "Преподаватель не назначен";
  assert.equal(C.teacherLine({ teacherId: "a", teacherName: "Основной У." }, no), "Ведёт: Основной У.");
  assert.equal(C.teacherLine({ teacherId: "b", teacherName: "Коллега У.", isSubstitution: true, defaultTeacherName: "Основной У." }, no), "Ведёт: Коллега У. — замена за Основной У.");
  assert.equal(C.teacherLine({ teacherId: "b", teacherName: "Коллега У.", isSubstitution: true }, no), "Ведёт: Коллега У. — замена");
  assert.equal(C.teacherLine({ teacherId: null }, no), no);
  assert.equal(C.teacherLine(undefined, no), null);
  assert.equal(C.movedReasonOf("Перенесён на 29.10, 16:00–17:30: Личные обстоятельства"), "Личные обстоятельства");
  assert.equal(C.movedReasonOf("Каникулы"), null);
  assert.deepEqual(C.sheetNotes({ moved: true, movedToText: "пн, 26.10, 10:00", reason: "Перенесён на 26.10, 10:00–11:00: Перенос по просьбе преподавателя", cancelled: true }),
    ["Урок перенесён на пн, 26.10, 10:00", "Причина: Перенос по просьбе преподавателя"]);
  assert.deepEqual(C.sheetNotes({ moved: false, reason: "Каникулы центра", cancelled: true }), ["Причина: Каникулы центра"]);
  assert.deepEqual(C.sheetNotes({ moved: false, reason: null, cancelled: false }), []);
  assert.equal(C.normalizeTime("930"), "09:30");
  assert.equal(C.normalizeTime("9:30"), "09:30");
  assert.equal(C.normalizeTime("16.45"), "16:45");
  assert.equal(C.normalizeTime("2460"), null);
  assert.equal(C.normalizeTime("abc"), null);
  const card = read("src/components/groups/group-schedule-overview.tsx");
  assert.doesNotMatch(card, /По расписанию"|Кабинет не указан/, "one word for not-yet-held lessons; no «Кабинет не указан»");
  assert.match(card, /label: "Запланирован"/);
  assert.match(card, /label: "Перенесён"/);
  assert.match(card, /нет занятий/, "an empty day is one line on a phone");
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  assert.doesNotMatch(sheet, /type="time"/, "24 h whatever the browser's locale");
  for (const role of ["owner", "admin"]) {
    const page = read("src/components/groups/group-detail-view.tsx");
    assert.match(page, /max-w-full[^"]*overflow-x-auto/, `${role}: the tab row scrolls inside itself`);
    assert.match(page, /groupName=\{group\.name\}/);
  }
});

test("#124: the move from the lesson sheet - error texts, live check lines, the exam precheck, «Перенесён с …»", () => {
  const C = require(path.join(root, "src/lib/schedule-card-actions.ts"));
  const S = require(path.join(root, "src/lib/substitutions.ts"));
  const err = (code, extra = {}) => ({ status: 409, code, message: "server", detail: { code, message: "server", ...extra } });
  // the refusals of lesson-move
  assert.equal(C.lessonMoveErrorText(err("LESSON_CHANGED", { current: { startTime: "16:00", endTime: "17:30" } })), "Урок уже изменили — обновите");
  assert.equal(C.lessonMoveErrorText(err("SUBSTITUTION_ALREADY_DECIDED", { item: null })), "Урок уже изменили — обновите");
  assert.equal(C.isLessonChanged(err("LESSON_CHANGED")), true);
  assert.equal(C.isLessonChanged(err("SUBSTITUTION_ALREADY_DECIDED")), true);
  assert.equal(C.isLessonChanged(err("TEACHER_BUSY")), false);
  assert.match(C.lessonMoveErrorText(err("LESSON_HAS_NO_TEACHER")), /нет преподавателя.*назначьте/);
  assert.equal(C.lessonMoveErrorText(err("EXAM_SERVICE_UNAVAILABLE")), "Не удалось проверить экзамены группы. Повторите попытку.");
  assert.match(C.lessonMoveErrorText(err("LESSON_ALREADY_STARTED")), /уже начался или прошёл/);
  assert.equal(C.lessonMoveErrorText(err("MOVE_IN_PAST")), "Новое время урока уже прошло");
  assert.equal(C.lessonMoveErrorText(err("MOVE_TOO_FAR")), "Перенести можно не дальше чем на 60 дней");
  assert.equal(C.lessonMoveErrorText(err("GROUP_BUSY")), "У группы уже есть урок в это время");
  assert.match(C.lessonMoveErrorText(err("TEACHER_BUSY", { conflicts: [{ date: "2026-10-27", startTime: "10:00", endTime: "11:30", groupId: "G1", groupName: "9-А", withGroupName: "7-Б" }] })), /^Преподаватель занят в это время: «7-Б», .*10:00–11:30$/);
  // the live check (fixtures K01, K02)
  const K01 = { ok: false, teacherId: "A", teacherName: "Иванов И.", teacherConflicts: [{ date: "2026-10-27", startTime: "10:00", endTime: "11:30", groupId: "G1", groupName: "9-А", withGroupName: "7-Б" }], groupConflicts: [], warnings: [] };
  const busy = C.lessonMoveCheckLines(K01);
  assert.equal(busy.ok, false);
  assert.match(busy.lines[0], /^Преподаватель занят в это время: «7-Б»/);
  const grp = C.lessonMoveCheckLines({ ok: false, teacherConflicts: [], groupConflicts: [{ date: "2026-10-27", startTime: "10:00", endTime: "11:30", groupId: "G", groupName: "9-А", withGroupName: "9-А" }], warnings: [] });
  assert.match(grp.lines[0], /^У группы уже есть урок/);
  const free = C.lessonMoveCheckLines({ ok: true, teacherName: "Иванов И.", teacherConflicts: [], groupConflicts: [], warnings: [{ code: "ROOM_BUSY", message: "Кабинет занят" }] });
  assert.equal(free.ok, true);
  assert.match(free.lines[0], /^Время свободно/);
  assert.deepEqual(free.warnings, ["Кабинет занят"]);
  // the exam precheck (fixtures K05..K08, K11)
  assert.deepEqual(Object.values(C.examCancelState(null)).slice(0, 2), [true, true], "not read yet: confirm stays off");
  const none = C.examCancelState({ state: "none", title: null, canCancel: true, message: null });
  assert.equal(none.blocked, false); assert.equal(none.message, null);
  const lobby = C.examCancelState({ state: "ok", title: "Контрольная №3", canCancel: true, message: null });
  assert.equal(lobby.blocked, false); assert.equal(lobby.message, "Экзамен «Контрольная №3» вернётся в черновик, код доступа будет закрыт.");
  const active = C.examCancelState({ state: "ok", title: "Контрольная №3", canCancel: false, message: null });
  assert.equal(active.blocked, true); assert.equal(active.message, "Экзамен «Контрольная №3» уже идёт — отменить урок нельзя");
  const attempts = C.examCancelState({ state: "ok", title: "Контрольная №3", canCancel: false, message: "Нельзя отменить урок с активным экзаменом" });
  assert.equal(attempts.blocked, true); assert.equal(attempts.message, "Нельзя отменить урок с активным экзаменом");
  const down = C.examCancelState({ state: "unavailable", title: null, canCancel: false, message: "Не удалось проверить экзамены группы. Повторите попытку." });
  assert.equal(down.blocked, true); assert.equal(down.retry, true); assert.equal(down.tone, "error");
  // «Перенесён с …» (fixture K12) on the card, the teacher's chips and the student's rows
  const from = { lessonId: "lesson-l2", date: "2026-10-28", startTime: "16:00", endTime: "17:30" };
  assert.equal(C.movedFromText(from), "Перенесён с 28.10, 16:00");
  assert.equal(C.movedFromText(null), null);
  assert.equal(S.occurrenceChips({ movedFrom: from }, "u").map((c) => c.text).join("|"), "Перенесён с 28.10, 16:00");
  assert.deepEqual(S.occurrenceChips({}, "u"), []);
  const rows = S.studentLessonRows([{ lesson_id: "x", date: "2026-10-29", group_name: "9-А", status: "present", movedFrom: from }], [], (s) => s);
  assert.equal(rows[0].movedFromText, "Перенесён с 28.10, 16:00");
  // wiring
  const api = read("src/lib/api.ts");
  assert.match(api, /lesson-move-check\?/); assert.match(api, /lesson-move`/); assert.match(api, /lesson-exam-binding\?/);
  const sheet = read("src/components/groups/lesson-action-sheet.tsx");
  assert.match(sheet, /expectedStartTime: lessonStart/); assert.match(sheet, /expectedEndTime: lessonEnd/);
  assert.doesNotMatch(sheet, /rescheduleLessonOccurrence/, "the same-day-only move is gone");
  assert.match(sheet, /id="sheet-date"/);
  assert.match(sheet, /examState\.blocked/);
});
