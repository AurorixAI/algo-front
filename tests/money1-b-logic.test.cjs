// «Деньги-1 / Б» (front), the rules in pure functions: the window of a price / mode shows EVERY student the change moves (+ the next period), the banner and the counters count debtors only
// (not those who «ждём оплату»), «Оплата с» and the price of a new group do not exist without the money right, the journal, the repeated payment, the make-up sentence.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
require("./helpers/money1-env.cjs");
const root = path.join(__dirname, "..");
const W = require(path.join(root, "src/lib/whatif.ts"));
const P = require(path.join(root, "src/lib/payments.ts"));
const L = require(path.join(root, "src/lib/payments-ledger.ts"));
const S = require(path.join(root, "src/lib/payments-summary.ts"));
const B = require(path.join(root, "src/lib/payments-banner.ts"));
const F = require(path.join(root, "src/lib/pay-from.ts"));
const G = require(path.join(root, "src/lib/group-form.ts"));
const H = require(path.join(root, "src/lib/settings-history.ts"));
const E = require(path.join(root, "src/lib/money-effects.ts"));
const N = (s) => s.replace(/ /g, " ");

const base = (o) => ({ membership_id: "m", student_name: "X", debt_before: 0, debt_after: 0, advance_before: 0, advance_after: 0, paid_until_before: null, paid_until_after: null, has_money: true,
  charged_before: 0, charged_after: 0, lessons_before: null, lessons_after: null, next_period: null, text: "", ...o });
const PRICE = {
  as_of: "2026-12-01", text: "Изменится у 3 учеников", items_total: 3, truncated: false, lessons_lost_total: 2, next_period_students: 1, next_period_delta_total: 100000, override_total: 1, override_truncated: false,
  items: [
    base({ membership_id: "a", student_name: "Каримова Алия", advance_before: 600000, advance_after: 600000, lessons_before: { covered: 12, used: 0, left: 12, package_size: 12 }, lessons_after: { covered: 10, used: 0, left: 10, package_size: 12 } }),
    base({ membership_id: "b", student_name: "Назаров Тимур", paid_until_before: "2026-12-04", paid_until_after: "2026-11-29", advance_before: 300000, advance_after: 250000 }),
    base({ membership_id: "c", student_name: "Юлдашев Рустам", next_period: { period_from: "2026-12-05", period_to: "2027-01-04", amount_before: 300000, amount_after: 400000, difference: 100000 } }),
    base({ membership_id: "d", student_name: "Ничего Неменяется" }),
  ],
  override_students: [{ membership_id: "o", student_name: "Юсупов Бек", price: 250000, group_price_before: 600000, group_price_after: 700000, difference_after: -450000, reason: "скидка" }],
};

test("Б3: the price window lists EVERY affected student in lessons, dates and the next period; the unaffected one is not listed", () => {
  const w = W.normalizeWhatIf(PRICE, "price");
  const students = W.whatIfStudents(w);
  assert.deepEqual(students.map((s) => s.name), ["Каримова Алия", "Назаров Тимур", "Юлдашев Рустам"]);
  const rows = (name) => Object.fromEntries(students.find((s) => s.name === name).rows.map((r) => [r.key, r]));
  assert.deepEqual([rows("Каримова Алия").covered.before, rows("Каримова Алия").covered.after, rows("Каримова Алия").covered.delta], ["12", "10", "−2 урока"]);
  assert.equal(rows("Каримова Алия").left.after, "10");
  assert.deepEqual([rows("Назаров Тимур")["paid-until"].before, rows("Назаров Тимур")["paid-until"].after, rows("Назаров Тимур")["paid-until"].delta], ["04.12.2026", "29.11.2026", "−5 дней"]);
  assert.equal(N(rows("Назаров Тимур").advance.delta), "−50 000 сум");
  const next = rows("Юлдашев Рустам")["next-period"];
  assert.equal(next.label, "Следующий период с 05.12.2026");
  assert.deepEqual([N(next.before), N(next.after), N(next.delta)], ["300 000 сум", "400 000 сум", "+100 000 сум"]);
  assert.equal(students[0].when, null);
  assert.equal(W.whatIfAsOfText(w), "Числа — на 01.12.2026, когда цена дойдёт до учеников");
});

test("Б3: the totals of the server, individual prices apart, a truncated list says how many are left", () => {
  const w = W.normalizeWhatIf({ ...PRICE, truncated: true, items_total: 9 }, "price");
  assert.equal(W.whatIfMoreText(w), "и ещё 5 учеников");
  assert.equal(w.lessonsLostTotal, 2);
  assert.equal(w.nextPeriodDeltaTotal, 100000);
  assert.equal(w.nextPeriodStudents, 1);
  assert.equal(w.overrides.length, 1);
  assert.equal(N(W.overrideLine(w.overrides[0], "price")), "Юсупов Бек · 250 000 сум · цена группы 600 000 сум → 700 000 сум");
  assert.equal(W.overrideMoreText(W.normalizeWhatIf({ ...PRICE, override_truncated: true, override_total: 5 }, "price")), "и ещё 4");
});

test("Б3: the window of the mode - a student with a package in progress waits for its end; the charge of 30 days; the price in its new meaning", () => {
  const regime = W.normalizeWhatIf({
    text: "Перейдут на новый способ 2 ученика", items_total: 2, horizon_days: 30, charged_before_total: 900000, charged_after_total: 1176000, pending_package_students: 1,
    items: [
      base({ membership_id: "a", student_name: "Алия", switch_on: "2026-11-01", as_of: "2026-11-30", price_amount: 300000, price_unit_before: "за общий месяц", price_unit_after: "за общий месяц с 10-го числа", charged_before: 900000, charged_after: 1176000, debt_before: 900000, debt_after: 1176000 }),
      base({ membership_id: "p", student_name: "Пакетов", switch_on: null, as_of: null, price_amount: 600000, price_unit_before: "за пакет из 12 уроков", price_unit_after: "за месяц" }),
    ],
    override_students: [],
  }, "regime");
  const s = W.whatIfStudents(regime);
  assert.equal(s[0].when, "с 01.11.2026, на 30.11.2026");
  assert.equal(N(s[0].rows.find((r) => r.key === "charged").delta), "+276 000 сум");
  assert.equal(s[1].when, "когда закончится пакет");
  assert.equal(N(s[1].priceNote), "Цена 600 000 сум: за пакет из 12 уроков → за месяц", "the meaning of the price is ONE line, not a cell of the numbers");
  assert.ok(!s[1].rows.some((r) => r.key === "price"));
  assert.ok(!s[1].rows.some((r) => r.key === "debt" || r.key === "charged"), "no figures of a day that does not exist");
  assert.equal(W.regimeChangeKind({ billing_day: 10 }), "day");
  assert.equal(W.regimeChangeKind({ period_mode: "lessons" }), "mode");
  assert.equal(W.regimeChangeKind({ lessons_per_payment: 8 }), "package");
});

test("Б7: the banner, the cards and the badge count the DEBTORS (debt_split); the waiting ones are apart and named", () => {
  const state = S.summaryToState({
    expiring: 0,
    buckets: { expiring: 0, active: 1, paused: 0 },
    debt_split: { debtors: 1, debtors_memberships: 1, debtors_debt_total: 600000, waiting_students: 1, waiting_memberships: 1, waiting_debt_total: 300000, all_debt_total: 900000, all_students_with_debt: 2, expired: 0, due: 1, students_expired: 0, students_due: 1 },
  });
  assert.equal(state.debtTotal, 600000);
  assert.equal(state.debtors, 1);
  assert.equal(state.studentsExpired, 0);
  assert.equal(state.studentsWaiting, 1);
  assert.equal(state.debtWaitingTotal, 300000);
  assert.equal(state.buckets.debt, 1);
  assert.equal(state.buckets.waiting, 1);
  const copy = B.debtBannerCopy({ debtors: state.debtors, debtTotal: state.debtTotal, overdue: state.studentsExpired });
  assert.equal(N(copy.text), "1 ученик с долгом — 600 000 сум");
  assert.equal(copy.chip, null);
  const cards = P.positionCards({ debtors_debt_total: state.debtTotal, debtors: state.debtors, debt_waiting_total: state.debtWaitingTotal, students_waiting: state.studentsWaiting });
  assert.equal(N(cards[0].amount), "600 000 сум");
  assert.equal(N(cards[0].waiting), "Ждём оплату: 300 000 сум · 1 ученик");
  // Money-1 V (а): an answer without the split does not fall back to the old fields (the server drops them): no debt, nobody waits
  const old = S.summaryToState({ due: 2, expired: 1, debt_total: 500000, students_with_debt: 2, debtors: 2 });
  assert.equal(old.debtTotal, 0);
  assert.equal(old.debtors, 0);
  assert.equal(old.studentsWaiting, 0);
});

test("Б7: the tab «Ждём оплату» stands next to «Должники» while somebody waits; the waiting row is grey, never the red «Просрочено»", () => {
  const keys = (summary, open = "debt") => P.visibleBuckets(summary, open).map((b) => b.key);
  assert.deepEqual(keys({ students_waiting: 2 }), ["debt", "waiting", "expiring", "active"]);
  assert.deepEqual(keys({ students_waiting: 0 }), ["debt", "expiring", "active"]);
  assert.deepEqual(keys({ students_waiting: 0 }, "waiting"), ["debt", "waiting", "expiring", "active"]);
  assert.equal(P.bucketCount({ students_waiting: 2, debtors: 7 }, "waiting"), 2);
  assert.equal(P.bucketCount({ students_waiting: 2, debtors: 7 }, "debt"), 7);
  const row = { status: "expired", debt: 300000, days_overdue: 1, debt_reason: "overdue", tab: "waiting", waiting_reason: "Ждём оплату до 07.11" };
  assert.deepEqual(P.moneyChip(row), { label: "Ждём оплату до 07.11", tone: "muted" });
  assert.deepEqual(P.moneyChip({ ...row, waiting_reason: null }), { label: "Ждём оплату", tone: "muted" });
  assert.equal(P.debtReasonText(row), "Ждём оплату до 07.11");
  assert.match(L.balanceView(row).className, /slate/);
  assert.match(L.balanceView({ debt: 300000, advance: 0, tab: "debtors" }).className, /rose/);
  assert.equal(P.moneyChip({ ...row, tab: "debtors" }).tone, "danger");
  assert.equal(P.parseBucket("waiting"), "waiting");
  assert.equal(P.parseBucket("debt"), "debt");
});

test("Б1: «Оплата с» - without the money right there is no date and nothing is sent; the default is not sent; the range", () => {
  const def = F.normalizePayFromDefault({ today: "2026-10-21", first_lesson: "2026-11-06", default_pay_from: "2026-11-06" });
  assert.equal(F.payFromRequest("2026-10-01", def, false), null, "no money right: nothing");
  assert.equal(F.payFromRequest("2026-11-06", def, true), null, "the default is not sent");
  assert.equal(F.payFromRequest("2026-10-01", def, true), "2026-10-01");
  assert.equal(F.payFromRequest("", def, true), null);
  assert.deepEqual(F.payFromRange("2026-10-21", "2026-09-01"), { min: "2026-09-01", max: "2026-12-22" });
  assert.equal(F.payFromProblem("2026-12-23", def, F.payFromRange("2026-10-21", null)), "«Оплата с» — от 01.01.2020 до 22.12.2026");
  assert.equal(F.payFromDefaultLine({ ...def, text: "Оплата с 06.11.2026 — первое занятие группы с сегодня" }), "Оплата с 06.11.2026 — первое занятие группы с сегодня", "the sentence of the server wins");
  assert.equal(F.payFromDefaultLine(def), "Оплата считается с 06.11.2026 — с первого занятия группы", "only an older server has none");
  const bulk = F.normalizeBulkImmediate({ students: [{ student_id: "a", billing: { pay_from: "2026-10-01", immediate: { amount: 300000, lessons: 14, text: "Сразу начислится 300 000 сум (за 14 уроков)" } } }, { student_id: "b", billing: { pay_from: "2026-10-01" } }], immediate_total: { amount: 300000, lessons: 14, students: 1, text: "Всего сразу начислится 300 000 сум (за 14 уроков)" } });
  assert.deepEqual(bulk.students.map((x) => x.studentId), ["a"]);
  assert.equal(N(bulk.total), "Всего сразу начислится 300 000 сум (за 14 уроков)");
  assert.deepEqual(F.normalizeBulkImmediate({ students: [{ student_id: "a", billing: { pay_from: "2026-10-01" } }], immediate_total: null }), { students: [], total: null }, "no money right: no sums");
  assert.equal(F.payFromDefaultLine({ ...def, first_lesson: null }), "Оплата считается с 06.11.2026: у группы нет занятий в ближайшие дни");
  assert.equal(F.payFromIsPast("2026-10-01", def), true);
  assert.equal(F.payFromIsPast("2026-10-21", def), false);
  assert.equal(F.payFromErrorText({ code: "PAY_FROM_RANGE", message: "" }), F.PAY_FROM_RANGE_TEXT);
  assert.equal(F.payFromErrorText({ code: "PAY_FROM_NOT_APPLICABLE", message: "Только при добавлении" }), "Только при добавлении");
  assert.equal(F.payFromErrorText({ code: "X", message: "m" }), null);
  const billing = F.normalizeBilling({ pay_from: "2026-10-01", explicit: true, default_pay_from: "2026-11-06", first_lesson: "2026-11-06", text: "Оплата считается с 01.10.2026: так выбрал сотрудник", immediate: { amount: 300000, lessons: 14, text: "Сразу начислится 300 000 сум (за 14 уроков)" } });
  assert.equal(N(billing.immediate.text), "Сразу начислится 300 000 сум (за 14 уроков)");
});

test("Б2: the price of a new group exists only with the money right", () => {
  assert.deepEqual(G.groupCreatePrice("450 000", false), { error: null, request: null });
  assert.deepEqual(G.groupCreatePrice("450 000", true), { error: null, request: 450000 });
  assert.deepEqual(G.groupCreatePrice("0", true), { error: null, request: 0 }, "0 is a price: free lessons");
  assert.deepEqual(G.groupCreatePrice("", true), { error: null, request: null });
});

test("Б9: the repeated payment is the server's sentence, not a ban; the journal of the settings", () => {
  const preview = { warnings: [{ code: "payment_repeated", message: "Такая же оплата уже внесена сегодня в 10:15 — внести ещё одну?" }, { code: "large_overpay", message: "Большая переплата" }], result: { allocations: [], debt_after: 0, advance_after: 0 } };
  const view = L.previewView(preview);
  assert.equal(view.repeated, "Такая же оплата уже внесена сегодня в 10:15 — внести ещё одну?");
  assert.deepEqual(view.warnings, ["Большая переплата"], "the repeat is not a plain bullet");
  assert.ok(!/Внести ещё одну\?$/.test(require("fs").readFileSync(path.join(root, "src/components/payments/payment-repeated-note.tsx"), "utf8").replace(/\s+/g, " ").match(/<p>.*?<\/p>/)[0].replace("</p>", "")), "nothing of ours is appended to the server's sentence");
  const list = H.settingsHistoryOf({ items: [{ id: "1", at: "2026-11-06T05:15:00", actor_name: "Owner Иван", action: "billing_regime_changed", text: "Изменён способ оплаты: способ «Свой месяц» → «Пакет уроков»", details: { items_total: 60, items: [{ text: "Алия: долг 0 → 1" }] } }] });
  assert.equal(list[0].when, "06.11.2026 10:15");
  assert.equal(list[0].kind, "Способ оплаты");
  assert.equal(list[0].linesMore, 59);
  assert.deepEqual(H.settingsHistoryOf(null), []);
});

test("Б8: the make-up sentence of a confirmed excuse is a line of «Что изменится», not «Деньги не изменятся»", () => {
  const effects = E.moneyEffectsOf({ moneyEffects: { students: [], payroll: [], dryRun: true, text: "Ученик может отработать пропущенный урок на дополнительном уроке или в другой группе", makeup: { studentId: "s", name: "Алия", text: "Ученик может отработать пропущенный урок на дополнительном уроке или в другой группе" } } });
  assert.equal(E.effectsEmpty(effects), false);
  const lines = E.effectLines(effects);
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /Ученик может отработать пропущенный урок/);
  assert.equal(E.effectsEmpty(E.moneyEffectsOf({ moneyEffects: { students: [], payroll: [] } })), true);
});

test("Б5/Б6: the statement shows «Период продлён на N дней: ученик возвращался в группу» and «Оплаченные дни перешли…» in the words of the server; nothing is made up", () => {
  const row = (seq, date, type, title) => ({ seq, date, type, title, debit: 0, credit: 0, outflow: 0, balance_after: 0, balance_text: null, details: {}, voided_at: null, voided_by_name: null, void_reason: null });
  const statement = {
    as_of: "2026-10-20", upcoming: [], summary: {}, membership: {},
    rows: [
      row(1, "2026-10-16", "pause", "Период продлён на 2 дня: ученик возвращался в группу (14.10–15.10)"),
      row(2, "2026-10-25", "opening_paid_until", "Оплаченные дни перешли вместе с учеником: оплачено до 20.11"),
    ],
  };
  const items = L.buildStatementItems(statement, "2026-10");
  const titles = items.map((item) => item.title).filter(Boolean);
  assert.ok(titles.includes("Период продлён на 2 дня: ученик возвращался в группу (14.10–15.10)"), JSON.stringify(titles));
  assert.ok(titles.includes("Оплаченные дни перешли вместе с учеником: оплачено до 20.11"), JSON.stringify(titles));
  assert.ok(items.filter((item) => item.title && /Период продлён/.test(item.title)).every((item) => item.charged === null && item.paid === null), "an information row: no money");
});

test("Б7: the header of a group says «Ждём оплату: M сум · N учеников» by the SAME function as the card of «Оплаты»; nobody waits - nothing", () => {
  const W2 = require(path.join(root, "src/lib/group-workspace.ts"));
  const summary = W2.groupDebtSummary([{ debt: 300000 }, { debt: 200000 }, { debt: 0 }]);
  assert.equal(N(W2.groupWaitingChipText(summary)), "Ждём оплату: 500 000 сум · 2 ученика");
  assert.equal(W2.groupWaitingChipText(summary), P.waitingLine(500000, 2));
  assert.equal(W2.groupWaitingChipText(W2.groupDebtSummary([])), null);
  assert.equal(W2.groupWaitingChipText(null), null);
});

test("R3 №1/2/6/23: ONE question «debtor or waiting» for the list, the tab of a group, the header and the card of a student", () => {
  const GP = require(path.join(root, "src/lib/group-payments.ts"));
  const SC = require(path.join(root, "src/lib/student-card.ts"));
  const base = { is_active: true, status: "expired", advance: 0, paid_until: null, period_mode: "calendar", price: { amount: 300000, source: "group" }, is_primary: true };
  const debtor = { ...base, membership_id: "d", student_id: "sd", student_name: "Должников", debt: 600000, tab: "debtors" };
  const waiting = { ...base, membership_id: "w", student_id: "sw", student_name: "Ждущий", debt: 300000, tab: "waiting", waiting_reason: "Ждём оплату до 07.11" };
  assert.equal(P.debtRoleOf(debtor), "debtor");
  assert.equal(P.debtRoleOf(waiting), "waiting");
  assert.equal(P.debtRoleOf({ ...waiting, debt: 0 }), null);
  assert.equal(P.debtRoleOf({ debt: 5 }), "debtor", "an older server (no tab): a debtor, as before");
  // the tab of the group: «С долгом» holds the debtor only; the waiting one has his own filter and count
  const views = GP.paymentRowViews([debtor, waiting], { periodMode: "calendar", today: "2026-11-06" });
  assert.deepEqual(GP.paymentsCounts(views), { all: 2, individual: 0, debt: 1, waiting: 1 });
  assert.deepEqual(GP.filterPaymentRows(views, "debt").map((v) => v.name), ["Должников"]);
  assert.deepEqual(GP.filterPaymentRows(views, "waiting").map((v) => v.name), ["Ждущий"]);
  assert.equal(GP.filterChipLabel("waiting", GP.paymentsCounts(views)), "Ждём оплату (1)");
  assert.equal(GP.parsePaymentsFilter("waiting"), "waiting");
  // the same row, the same word in the list chip, the tab chip and the card chip
  assert.equal(P.moneyChip(waiting).tone, "muted");
  assert.equal(views[1].chip.tone, "muted");
  assert.match(views[1].chip.label, /^Ждём оплату/);
  assert.equal(views[0].chip.tone, "danger");
  // the card of a student: the waiting group is not «Долг», only the debtor's debt is
  const both = SC.studentMoneyChip([debtor, waiting]);
  assert.deepEqual([N(both.label), both.tone, both.debtGroups], ["Долг 600 000 сум", "danger", 1]);
  const card = SC.studentMoneyChip([waiting]);
  assert.equal(N(card.label), "Ждём оплату · 300 000 сум");
  assert.equal(card.tone, "muted");
  assert.equal(card.debtGroups, 0);
});

test("R3 №3: after a SAVED payment the warning «payment_repeated» is dropped (the question is for the preview); other warnings stay", () => {
  const answer = [{ code: "payment_repeated", message: "Такая же оплата уже внесена сегодня в 10:15 — внести ещё одну?" }, { code: "large_overpay", message: "Большая переплата" }];
  assert.deepEqual(L.warningsAfterSave(answer).map((w) => w.code), ["large_overpay"]);
  assert.deepEqual(L.warningsAfterSave([answer[0]]), [], "only the repeat: the window closes with the toast");
  assert.deepEqual(L.warningsAfterSave(undefined), []);
});

test("R3 №7/8/10/12/17/18: the window says a fact once, one date format, the meaning of the price as a line, nobody is dropped silently, its own words for one student", () => {
  const w = W.normalizeWhatIf(PRICE, "price");
  assert.equal(W.whatIfCaption(w), "Изменится у 3 учеников", "a count over the table, not the sentence of the server again");
  const GPr = require(path.join(root, "src/lib/group-price.ts"));
  assert.equal(GPr.impactStudentsText({ students_following: 4, students_with_override: 1 }, { overridesListed: true }), "Цену получат 4 ученика", "the individual price is said under the table only");
  assert.match(GPr.impactStudentsText({ students_following: 4, students_with_override: 1 }), /индивидуальная цена/, "without the list the clause stays");
  // №10: one meaning for everybody -> ONE line over the table
  const same = (n) => base({ membership_id: n, student_name: n, switch_on: "2026-11-01", as_of: "2026-11-30", price_amount: 300000, price_unit_before: "за месяц", price_unit_after: "за общий месяц", charged_before: 1, charged_after: 2 });
  const r = W.normalizeWhatIf({ items: [same("a"), same("b")], items_total: 2, override_students: [] }, "regime");
  assert.equal(N(W.whatIfCommonPriceNote(W.whatIfStudents(r))), "Цена 300 000 сум: за месяц → за общий месяц");
  // №17: a student the server counted but whose rows are empty is not dropped
  const lone = W.normalizeWhatIf({ items: [base({ membership_id: "z", student_name: "Зубов", text: "Зубов: оплачено уроков 12 → 10" })], items_total: 1, override_students: [] }, "price");
  assert.deepEqual(W.whatIfStudents(lone).map((x) => [x.name, x.fallback]), [["Зубов", "Зубов: оплачено уроков 12 → 10"]]);
  // №18: ONE student's individual price has its own words
  assert.equal(W.whatIfAsOfText(w, true), "Числа — на 01.12.2026, когда начнёт действовать цена ученика");
  assert.equal(W.whatIfAsOfText(w), "Числа — на 01.12.2026, когда цена дойдёт до учеников");
  const R = require(path.join(root, "src/lib/pay-from.ts"));
  assert.equal(typeof R.normalizeBulkImmediate, "function");
});

// ── Обход stage «Деньги-1 / Б» (RB): Д1, Д2, замечание З4 ───────────────────────────────────────────────────────────────
test("RB Д1: the footer «Долг и аванс…» is counted from the SAME rows the table draws - it never says «ни у кого» over rows that move", () => {
  const moving = W.normalizeWhatIf({ items: [base({ membership_id: "a", student_name: "А", debt_before: 110000, debt_after: 0 }), base({ membership_id: "b", student_name: "Б", advance_after: 290000 }), base({ membership_id: "c", student_name: "В" })], items_total: 3 }, "regime");
  assert.equal(N(W.debtAdvanceFooter(moving)), "Долг или аванс изменится у 2 учеников");
  const students = W.whatIfStudents(moving).filter((s) => s.rows.some((r) => r.key === "debt" || r.key === "advance"));
  assert.equal(students.length, 2, "the footer and the table count the same students");
  const still = W.normalizeWhatIf({ items: [base({ membership_id: "c", student_name: "В" })], items_total: 1 }, "regime");
  assert.equal(W.debtAdvanceFooter(still), W.DEBT_ADVANCE_NONE);
  const cut = W.normalizeWhatIf({ items: [base({ membership_id: "a", student_name: "А", debt_after: 5 })], items_total: 4, truncated: true }, "regime");
  assert.equal(N(W.debtAdvanceFooter(cut)), "Долг или аванс изменится у 4 учеников", "the students beyond the cut of the list are counted too");
  assert.equal(N(W.debtAdvanceFooter(W.normalizeWhatIf({ items: [base({ debt_after: 5 })], items_total: 1 }, "regime"))), "Долг или аванс изменится у 1 ученика");
});

test("RB Д2 (front): a package shows «осталось уроков» instead of «оплачено до»; no forecast - no sum, the sentence of the server", () => {
  const toPackage = W.whatIfStudentOf(W.normalizeWhatIfItem(base({ student_name: "М", switch_on: "2026-12-01", as_of: "2026-12-30", charged_before: 400000, charged_after: 300000, paid_until_before: "2026-12-31", paid_until_after: null, lessons_before: null, lessons_after: { covered: 12, used: 0, left: 9, package_size: 12 } })), "regime");
  const keys = toPackage.rows.map((r) => r.key);
  assert.ok(keys.includes("left") && !keys.includes("paid-until"), keys.join());
  assert.equal(toPackage.rows.find((r) => r.key === "left").after, "9");
  const none = W.whatIfStudentOf(W.normalizeWhatIfItem({ ...base({ student_name: "Н", switch_on: "2026-12-01", text: "Н: начисления по пакету начнутся с первого урока" }), charged_before: null, charged_after: null }), "regime");
  assert.ok(!none.rows.some((r) => r.key === "charged"), "no sum when there is no forecast");
  assert.equal(none.fallback, "Н: начисления по пакету начнутся с первого урока");
  const win = W.normalizeWhatIf({ items: [], charged_before_total: null, charged_after_total: null }, "regime");
  assert.ok(!W.whatIfTotals(win).some((t) => t.key === "charged"), "no total without a forecast");
});

const SC = require(path.join(root, "src/lib/student-card.ts"));
test("RB З4: the card of a student with an advance says the advance next to «Оплачено до» - the number of the statement", () => {
  const row = (o) => ({ debt: 0, advance: 0, is_active: true, paid_until: "2026-12-22", status: "active", ...o });
  const chip = SC.studentMoneyChip([row({ advance: 290000 })]);
  assert.equal(N(chip.label), "Оплачено до 22.12 · Аванс 290 000 сум");
  assert.equal(chip.tone, "ok");
  assert.equal(N(SC.studentMoneyChip([row({})]).label), "Оплачено до 22.12");
  assert.equal(N(SC.studentMoneyChip([row({ advance: 100, paid_until: null }), row({ advance: 200, paid_until: null })]).label), "Аванс 300 сум", "the sum of the groups; no date - the advance alone");
});
