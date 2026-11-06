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
  assert.deepEqual([rows("Назаров Тимур")["paid-until"].before, rows("Назаров Тимур")["paid-until"].after, rows("Назаров Тимур")["paid-until"].delta], ["04.12", "29.11", "−5 дней"]);
  assert.equal(N(rows("Назаров Тимур").advance.delta), "−50 000 сум");
  const next = rows("Юлдашев Рустам")["next-period"];
  assert.equal(next.label, "Следующий период с 05.12");
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
  assert.equal(s[0].when, "с 01.11, на 30.11");
  assert.equal(N(s[0].rows.find((r) => r.key === "charged").delta), "+276 000 сум");
  assert.equal(s[1].when, "когда закончится пакет");
  assert.equal(N(s[1].rows[0].before), "600 000 сум за пакет из 12 уроков");
  assert.ok(!s[1].rows.some((r) => r.key === "debt" || r.key === "charged"), "no figures of a day that does not exist");
  assert.equal(W.regimeChangeKind({ billing_day: 10 }), "day");
  assert.equal(W.regimeChangeKind({ period_mode: "lessons" }), "mode");
  assert.equal(W.regimeChangeKind({ lessons_per_payment: 8 }), "package");
});

test("Б7: the banner, the cards and the badge count the DEBTORS (debt_split); the waiting ones are apart and named", () => {
  const state = S.summaryToState({
    due: 5, expired: 3, students_due: 5, students_expired: 3, debt_total: 900000, students_with_debt: 2, debtors: 2, memberships_with_debt: 2,
    buckets: { debt: 2, expiring: 0, active: 1, paused: 0 },
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
  const cards = P.positionCards({ debt_total: state.debtTotal, debtors: state.debtors, debt_waiting_total: state.debtWaitingTotal, students_waiting: state.studentsWaiting });
  assert.equal(N(cards[0].amount), "600 000 сум");
  assert.equal(N(cards[0].waiting), "Ждём оплату: 300 000 сум · 1 ученик");
  // an older server (no split): the old numbers, nobody waits
  const old = S.summaryToState({ due: 2, expired: 1, debt_total: 500000, students_with_debt: 2, debtors: 2 });
  assert.equal(old.debtTotal, 500000);
  assert.equal(old.studentsWaiting, 0);
});

test("Б7: the tab «Ждём оплату» stands next to «Должники» while somebody waits; the waiting row is grey, never the red «Просрочено»", () => {
  const keys = (summary, open = "debt") => P.visibleBuckets(summary, open).map((b) => b.key);
  assert.deepEqual(keys({ students_waiting: 2 }), ["debt", "waiting", "expiring", "active"]);
  assert.deepEqual(keys({ students_waiting: 0 }), ["debt", "expiring", "active"]);
  assert.deepEqual(keys({ students_waiting: 0 }, "waiting"), ["debt", "waiting", "expiring", "active"]);
  assert.equal(P.bucketCount({ students_waiting: 2, debtors: 7 }, "waiting"), 2);
  assert.equal(P.bucketCount({ students_waiting: 2, debtors: 7 }, "debt"), 7);
  const row = { status: "expired", debt: 300000, days_overdue: 1, debt_reason: "overdue", tab: "waiting", waiting_reason: "Ждём оплату до 07.11", reason: "Просрочено на 1 день" };
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
  assert.equal(F.payFromDefaultLine(def), "Оплата считается с 06.11.2026 — с первого занятия группы");
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

test("Б9: the repeated payment is a note with a question, not a ban; the journal of the settings", () => {
  const preview = { warnings: [{ code: "payment_repeated", message: "Такая же оплата внесена 5 минут назад — Owner Иван" }, { code: "large_overpay", message: "Большая переплата" }], result: { allocations: [], debt_after: 0, advance_after: 0 } };
  const view = L.previewView(preview);
  assert.equal(view.repeated, "Такая же оплата внесена 5 минут назад — Owner Иван");
  assert.deepEqual(view.warnings, ["Большая переплата"], "the repeat is not a plain bullet");
  assert.equal(L.PAYMENT_REPEATED_QUESTION, "Внести ещё одну?");
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
