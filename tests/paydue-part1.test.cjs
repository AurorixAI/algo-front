// PAY-DUE, screens part 1: the rules of the screens in pure functions - the tone of every state, the label of a row by the server's names, the cards, the tabs, the summary, the term of the settings,
// the tile of the dashboard, the chips of the group header and of the student's card.  The server's answers here are the CONTRACT of section 12 (`payments_schemas.py`), the numbers are worked out by hand
// in the comments.  LESSONS 143 (the screen shows the server's words), 144 (an explicit tolerance), 151 (the server said nothing - the screen says nothing).
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
require("./helpers/money1-env.cjs");
const root = path.join(__dirname, "..");
const P = require(path.join(root, "src/lib/payments.ts"));
const S = require(path.join(root, "src/lib/pay-state.ts"));
const C = require(path.join(root, "src/lib/chip-tone.ts"));
const SUM = require(path.join(root, "src/lib/payments-summary.ts"));
const D = require(path.join(root, "src/lib/pay-due-setting.ts"));
const T = require(path.join(root, "src/lib/owner-dashboard-links.ts"));
const GW = require(path.join(root, "src/lib/group-workspace.ts"));
const GP = require(path.join(root, "src/lib/group-payments.ts"));
const SC = require(path.join(root, "src/lib/student-card.ts"));
const L = require(path.join(root, "src/lib/payments-ledger.ts"));
const N = (s) => String(s).replace(/[\u00A0\u202F]/g, " ");

// ── the rows of the contract (today is Friday 20.11.2026, the term is 5 days) ───────────────────────────
// Анвар: записан сегодня, 600 000 × 5 / 13 уроков = 230 769 → 231 000; срок = 5-й день с 20.11 = 24.11
const ANVAR = { membership_id: "m1", student_id: "s1", state: "to_pay", state_text: "К оплате 231 000 сум", due_amount: 231000, debt_amount: 0, due_until: "2026-11-24", due_text: "К оплате 231 000 сум", due_sub: "до 24.11", debt_text: null, debt_sub: null, unpaid: 231000 };
// Тимур: ушёл 31.10 с долгом за октябрь 600 000 (срок был 06.10 → просрочено 45 дней), вернулся сегодня: за ноябрь 231 000 до 24.11
const TIMUR = { membership_id: "m2", student_id: "s2", state: "debt", state_text: "Долг 600 000 сум", debt_amount: 600000, due_amount: 231000, due_until: "2026-11-24", overdue_days: 45, debt_text: "Долг 600 000 сум", debt_sub: "просрочено 45 дней · оплачено до 30.09", due_text: "К оплате 231 000 сум", due_sub: "до 24.11", debt_also_text: "и долг 600 000 сум · просрочено 45 дней", due_also_text: "и к оплате 231 000 сум до 24.11", unpaid: 831000 };
// Лола: 600 000 с 02.11, срок был 06.11 → просрочено 14 дней, оплачено до 31.10
const LOLA = { membership_id: "m3", student_id: "s3", state: "debt", state_text: "Долг 600 000 сум", debt_amount: 600000, due_amount: 0, overdue_days: 14, debt_text: "Долг 600 000 сум", debt_sub: "просрочено 14 дней · оплачено до 31.10", due_text: null, due_sub: null, unpaid: 600000 };
const MADINA = { membership_id: "m4", student_id: "s4", state: "paid", state_text: "Оплачено до 30.11", debt_amount: 0, due_amount: 0, unpaid: 0 };
const PAUSED = { membership_id: "m5", student_id: "s5", state: "paused", state_text: "Пауза до 25.11", debt_amount: 0, due_amount: 0, unpaid: 0 };
const EXPIRING = { membership_id: "m6", student_id: "s6", state: "expiring", state_text: "Оплачено до 22.11", debt_amount: 0, due_amount: 0, unpaid: 0 };
const SILENT = { membership_id: "m7", student_id: "s7", state: "none", state_text: null, debt_amount: 0, due_amount: 0, unpaid: 0 };

test("the tone map: one tone per state, the five on the layout's map are all different, «К оплате» is a calm blue and only a debt is red", () => {
  assert.deepEqual(S.PAY_STATE_TONE, { debt: "danger", to_pay: "due", expiring: "warn", paused: "neutral", paid: "ok", free: "neutral", none: "neutral", starts: "outline", settled: "neutral", no_charges: "neutral" });
  // PAY-TAILS Б2.6: «Начнётся» is white with a grey outline - a sixth look, no colour of money or of a debt
  assert.notEqual(C.chipClass({ tone: "outline" }), C.chipClass({ tone: "neutral" }));
  assert.doesNotMatch(C.CHIP_TONE_CLASS.outline, /rose|danger|success|accent/);
  const classes = ["danger", "due", "warn", "ok", "neutral"].map((tone) => C.chipClass({ tone }));
  assert.equal(new Set(classes).size, 5, "debt / to pay / ends soon / paid / pause are five different looks");
  assert.match(C.CHIP_TONE_CLASS.due, /bg-accent-100/);
  assert.match(C.CHIP_TONE_CLASS.due, /text-accent-900/);
  assert.doesNotMatch(C.CHIP_TONE_CLASS.due, /rose|red|danger/);
  assert.match(C.CHIP_TONE_CLASS.danger, /danger-50/);
  for (const state of ["to_pay", "expiring", "paid", "paused"]) assert.doesNotMatch(C.CHIP_TONE_CLASS[S.PAY_STATE_TONE[state]], /rose|danger/, `${state} is never red`);
  assert.equal(S.payStateTone("nonsense"), "neutral");
});

test("«everything unpaid» is read in ONE place: rowUnpaid - the server's `unpaid` (14А.6); the normalised row keeps it in its older field", () => {
  assert.equal(S.rowUnpaid({ unpaid: 831000 }), 831000);
  assert.equal(S.rowUnpaid({}), 0);
  assert.equal(S.rowUnpaid(null), 0);
  assert.equal(S.rowUnpaid({ unpaid: -5 }), 0);
  assert.equal(S.rowUnpaid({ debt: 831000 }), 0, "the old name is not read: a row without `unpaid` owes nothing on the screens");
  // the normaliser of the rows goes through it too
  assert.equal(L.normalizeRow({ unpaid: 100 }).debt, 100);
  const src = require("node:fs").readFileSync(path.join(root, "src/lib/pay-state.ts"), "utf8");
  assert.equal((src.match(/row\?\.unpaid/g) ?? []).length, 1, "`.unpaid` of a row is read exactly once in pay-state.ts");
  assert.equal((src.match(/row\?\.debt\b/g) ?? []).length, 0);
});

test("the label of a row: the tab chooses which sum leads, every word is the server's", () => {
  // «К оплате» (Анвар): the label and the term
  const a = S.payLabel(ANVAR, "to_pay");
  assert.deepEqual([a.text, a.tone, a.sub, a.second], ["К оплате 231 000 сум", "due", "до 24.11", null]);
  // Тимур has BOTH: on «Должники» the debt leads, the sum within its term is the second line; on «К оплате» the other way round
  const d = S.payLabel(TIMUR, "debtors");
  assert.deepEqual([d.text, d.tone, d.sub, d.second], ["Долг 600 000 сум", "danger", "просрочено 45 дней · оплачено до 30.09", "и к оплате 231 000 сум до 24.11"]);
  const t = S.payLabel(TIMUR, "to_pay");
  assert.deepEqual([t.text, t.tone, t.sub, t.second], ["К оплате 231 000 сум", "due", "до 24.11", "и долг 600 000 сум · просрочено 45 дней"]);
  // a debtor alone: no second line
  const l = S.payLabel(LOLA, "debtors");
  assert.deepEqual([l.text, l.sub, l.second], ["Долг 600 000 сум", "просрочено 14 дней · оплачено до 31.10", null]);
  // the other tabs and a single label: the worst state, the server's `state_text`
  assert.deepEqual([S.payLabel(TIMUR).text, S.payLabel(TIMUR).tone], ["Долг 600 000 сум", "danger"]);
  assert.deepEqual([S.payLabel(MADINA, "active").text, S.payLabel(MADINA, "active").tone, S.payLabel(MADINA, "active").sub], ["Оплачено до 30.11", "ok", null]);
  assert.deepEqual([S.payLabel(EXPIRING, "expiring").text, S.payLabel(EXPIRING, "expiring").tone], ["Оплачено до 22.11", "warn"]);
  assert.deepEqual([S.payLabel(PAUSED, "paused").text, S.payLabel(PAUSED, "paused").tone], ["Пауза до 25.11", "neutral"]);
  // 151: the server said nothing - the screen says nothing, and never fills a word of its own
  const silent = S.payLabel(SILENT, "active");
  assert.deepEqual([silent.text, silent.sub, silent.second], [null, null, null]);
  assert.equal(S.payLabel({}, "debtors").text, null);
  // a tab that is asked for a part the row does not have falls back to the state, it does not invent the part
  assert.equal(S.payLabel(MADINA, "debtors").text, "Оплачено до 30.11");
  // the old words of the screen are gone from the logic
  const all = JSON.stringify([a, d, t, l]);
  for (const word of ["Не оплачено", "Ждём оплату", "Ещё не платил", "Не доплачено", "осталось"]) assert.ok(!all.includes(word), word);
});

test("the worst state of a student's groups (his card): debt → to pay → ends soon → pause → paid; of equals the bigger part; a silent group is skipped", () => {
  assert.equal(S.worstRow([MADINA, ANVAR, EXPIRING]), ANVAR);
  assert.equal(S.worstRow([MADINA, TIMUR, ANVAR]), TIMUR);
  assert.equal(S.worstRow([PAUSED, EXPIRING, MADINA]), EXPIRING);
  assert.equal(S.worstRow([MADINA, PAUSED]), PAUSED);
  // two debts: the bigger one is the label
  const small = { ...LOLA, debt_amount: 100000 };
  assert.equal(S.worstRow([small, LOLA]), LOLA);
  assert.equal(S.worstRow([SILENT]), null);
  assert.equal(S.worstRow([]), null);
  assert.equal(S.worstRow(undefined), null);
});

test("the tabs of «Оплаты»: the server's keys, the old links open «Должники», the counts are the server's students", () => {
  assert.deepEqual(P.PAYMENT_BUCKETS.map((b) => [b.key, b.label]), [["debtors", "Должники"], ["to_pay", "К оплате"], ["expiring", "Заканчивается оплата"], ["active", "Без долга"], ["advance", "Аванс"]]);
  for (const key of ["debtors", "to_pay", "expiring", "active", "advance", "paused"]) assert.equal(P.parseBucket(key), key);
  for (const old of ["debt", "waiting", "due", "none", "", null, undefined, "x"]) assert.equal(P.parseBucket(old), "debtors", String(old));
  // the tab «На паузе» appears only while somebody is on a pause (or is the open one)
  assert.equal(P.visibleBuckets({ students_paused: 0 }, "debtors").length, 5);
  assert.equal(P.visibleBuckets({ students_paused: 2 }, "debtors").length, 6);
  assert.equal(P.visibleBuckets({ students_paused: 0 }, "paused").length, 6);
  assert.equal(P.bucketTabLabel("Должники", 12), "Должники 12");
  assert.equal(P.bucketTabLabel("Должники", null), "Должники");
  assert.equal(P.bucketCount({ debtors: 12, to_pay: 6 }, "to_pay"), 6);
  assert.equal(P.bucketCount({ debtors: 12 }, "to_pay"), null);
  assert.equal(P.bucketCount(null, "debtors"), null);
  // the address: «К оплате» and the age filter only on «Должники»
  const q = (s) => P.parsePaymentsListQuery(new URLSearchParams(s));
  assert.equal(q("bucket=to_pay&age=to_30").age, "");
  assert.equal(q("bucket=debtors&age=to_30").age, "to_30");
  assert.equal(P.paymentsListQueryString({ bucket: "to_pay", groupId: "", teacherId: "", q: "", page: 0, age: "" }), "?bucket=to_pay");
  assert.equal(P.paymentsListQueryString({ bucket: "debtors", groupId: "g1", teacherId: "", q: "", page: 1, age: "31_60" }), "?bucket=debtors&group_id=g1&age=31_60&page=2");
  // the screen no longer counts rows itself
  for (const gone of ["filteredTabCounts", "narrowedTabSummary", "debtReasonText", "debtReasonLine", "moneyChip", "membershipChip", "debtRoleOf", "isWaitingRow", "waitingLine", "bannerDismissed", "debtorsCount", "WAITING_BUCKET"]) {
    assert.equal(P[gone], undefined, `${gone} is deleted`);
  }
});

test("the summary is read as the server sends it: the numbers of the cards, the tabs and the term", () => {
  // Данные макета: Долг 3 780 000 · 12 учеников; К оплате 1 524 000 = 323 000 + 277 000 + 4 × 231 000 · 6 учеников; Аванс 148 000 · 4 ученика
  const state = SUM.summaryToState({
    as_of: "2026-11-20", ends_today: 0, expiring: 0, none: 0, active: 5, free: 0, tracked_total: 23, period_mode: "calendar", lessons_per_payment: 12,
    debt_total: 3780000, debtors: 12, due_total: 1524000, due_students: 6, due_nearest: { date: "2026-11-20", text: "сегодня" },
    advance_total: 148000, students_with_advance: 4, paused: 0, students_paused: 0,
    buckets: { debtors: 12, to_pay: 6, expiring: 0, active: 5, paused: 0 }, price_missing: 0, debt_ages: [], pay_due_days: 5, pay_due_lessons: 2,
  });
  assert.equal(323000 + 277000 + 4 * 231000, 1524000);
  assert.deepEqual([state.debtTotal, state.debtors, state.dueTotal, state.dueStudents, state.advanceTotal, state.studentsWithAdvance], [3780000, 12, 1524000, 6, 148000, 4]);
  assert.deepEqual(state.dueNearest, { date: "2026-11-20", text: "сегодня" });
  assert.deepEqual(state.tabs, { debtors: 12, to_pay: 6, expiring: 0, active: 5, advance: 4, paused: 0 }, "the tab «Аванс» counts the students with an advance (an older server: the card's number)");
  assert.deepEqual([state.payDueDays, state.payDueLessons], [5, 2]);
  // the old fields are not read any more: a server without the new ones has nothing to show (and shows nothing)
  const old = SUM.summaryToState({ debt_split: { debtors: 7, debtors_debt_total: 999 }, students_with_debt: 9, period_mode: "calendar" });
  assert.deepEqual([old.debtTotal, old.debtors, old.dueTotal, old.tabs, old.payDueDays], [0, null, 0, null, null]);
  for (const gone of ["studentsDue", "studentsExpired", "studentsWaiting", "debtWaitingTotal", "studentsWithDebt", "due", "expired", "buckets"]) assert.ok(!(gone in state), `${gone} is gone from the state`);
});

test("the three cards: Долг · К оплате · Аванс - the server's numbers, the nearest term in the server's words; nothing is said about nothing", () => {
  const cards = P.positionCards({ debt_total: 3780000, debtors: 12, due_total: 1524000, due_students: 6, due_nearest: { text: "сегодня" }, advance_total: 148000, students_with_advance: 4 });
  assert.deepEqual(cards.map((c) => c.key), ["debt", "due", "advance"]);
  assert.deepEqual(cards.map((c) => c.label), ["Долг", "К оплате", "Аванс"]);
  assert.deepEqual(cards.map((c) => N(c.amount)), ["3 780 000 сум", "1 524 000 сум", "148 000 сум"]);
  assert.deepEqual(cards.map((c) => c.sub), ["12 учеников · срок прошёл", "6 учеников · ближайший срок сегодня", "4 ученика"]);
  assert.deepEqual(cards.map((c) => c.tone), ["debt", "due", "advance"]);
  const none = P.positionCards({ debt_total: 0, debtors: 0, due_total: 0, due_students: 0, due_nearest: null, advance_total: 0, students_with_advance: 0 });
  assert.deepEqual(none.map((c) => [c.sub, c.tone]), [["", "none"], ["", "none"], ["", "none"]]);
  assert.equal(P.positionCards(null).length, 3);
  // «ближайший срок» is only said when the server said it
  assert.equal(P.positionCards({ due_total: 5, due_students: 1 })[1].sub, "1 ученик");
});

test("the term of the settings: the example under the field is the SERVER's (14А.3) - the screen has no arithmetic of it; the ranges and the hint by the server's number", () => {
  // the old screen arithmetic is gone: the sentences come from `pay_due_example` of the owner's GET / the dry run
  for (const gone of ["payDueExample", "payDueLessonsExample", "nextPeriodStart", "PACKAGE_UNPAID_DAYS", "PAY_DUE_LESSONS_HINT"]) assert.equal(D[gone], undefined, `${gone} must be deleted`);
  assert.deepEqual([D.PAY_DUE_DAYS_RANGE, D.PAY_DUE_LESSONS_RANGE], [{ min: 0, max: 14 }, { min: 0, max: 4 }]);
  // «не дольше N дней» - N is `pay_due_package_max_days`; the server said nothing - the screen says nothing (151)
  assert.equal(D.payDueLessonsHint(14), "не дольше 14 дней");
  assert.equal(D.payDueLessonsHint(10), "не дольше 10 дней");
  assert.equal(D.payDueLessonsHint(null), "");
  assert.equal(D.payDueLessonsHint(undefined), "");
  assert.equal(SUM.summaryToState({ pay_due_package_max_days: 14 }).payDueMaxDays, 14);
  assert.equal(SUM.summaryToState({}).payDueMaxDays, null);
});

test("the term of the settings: words, the body of the save and the validity", () => {
  assert.equal(D.payDueSavedText(10), "Срок оплаты — 10 дней");
  assert.equal(D.payDueSavedText(1), "Срок оплаты — 1 день");
  assert.equal(D.payDueSavedText(2), "Срок оплаты — 2 дня");
  assert.equal(D.payDueSavedText(2, true), "Срок оплаты — 2 урока");
  assert.equal(D.payDueReadText(5), "Срок оплаты: 5 дней");
  assert.equal(D.lessonsUnit(1), "урок");
  assert.equal(D.lessonsUnit(2), "урока");
  assert.equal(D.lessonsUnit(0), "уроков");
  // only the changed field is sent
  assert.deepEqual(D.payDueBody({ pay_due_days: 5, pay_due_lessons: 2 }, { pay_due_days: 10, pay_due_lessons: 2 }), { pay_due_days: 10 });
  assert.deepEqual(D.payDueBody({ pay_due_days: 5, pay_due_lessons: 2 }, { pay_due_days: 5, pay_due_lessons: 3 }), { pay_due_lessons: 3 });
  assert.deepEqual(D.payDueBody({ pay_due_days: 5, pay_due_lessons: 2 }, { pay_due_days: 5, pay_due_lessons: 2 }), {});
  assert.equal(D.payDueValid({ pay_due_days: 14, pay_due_lessons: 4 }), true);
  assert.equal(D.payDueValid({ pay_due_days: 0, pay_due_lessons: 0 }), true);
  assert.equal(D.payDueValid({ pay_due_days: 15, pay_due_lessons: 2 }), false);
  assert.equal(D.payDueValid({ pay_due_days: 5, pay_due_lessons: 5 }), false);
  assert.equal(D.payDueValid({ pay_due_days: NaN, pay_due_lessons: 2 }), false);
  // the line about the students is the server's, one per kind, none at zero (10.6)
  assert.deepEqual(D.payDueImpactLines({ texts: ["4 ученика из должников станут «К оплате»"] }), ["4 ученика из должников станут «К оплате»"]);
  assert.deepEqual(D.payDueImpactLines({ texts: ["1 ученик станет должниками", "  "] }), ["1 ученик станет должниками"]);
  assert.deepEqual(D.payDueImpactLines({ texts: [] }), []);
  assert.deepEqual(D.payDueImpactLines(null), []);
  // 14А.3: the term is a PART OF THE FORM - saved by the one button of the section, with the keys of the chosen mode (days: calendar; lessons: package), validated with the section
  assert.deepEqual([P.DEFAULT_PAYMENT_SETTINGS.pay_due_days, P.DEFAULT_PAYMENT_SETTINGS.pay_due_lessons], [5, 2]);
  assert.ok(P.PAYMENTS_SCOPE_KEYS.includes("pay_due_days") && P.PAYMENTS_SCOPE_KEYS.includes("pay_due_lessons"));
  assert.ok(P.paymentsScopeKeys("fixed_day").includes("pay_due_days") && !P.paymentsScopeKeys("fixed_day").includes("pay_due_lessons"));
  assert.ok(P.paymentsScopeKeys("payment_date").includes("pay_due_days") && !P.paymentsScopeKeys("payment_date").includes("pay_due_lessons"));
  assert.ok(P.paymentsScopeKeys("lessons").includes("pay_due_lessons") && !P.paymentsScopeKeys("lessons").includes("pay_due_days"));
  const base = { ...P.DEFAULT_PAYMENT_SETTINGS, period_mode: "calendar", billing_anchor: "fixed_day", billing_day: 1 };
  assert.equal(P.validatePaymentSettings({ ...base, pay_due_days: 14 }, "payments"), null);
  assert.match(P.validatePaymentSettings({ ...base, pay_due_days: 15 }, "payments"), /Срок оплаты: от 0 до 14/);
  assert.match(P.validatePaymentSettings({ ...base, pay_due_days: NaN }, "payments"), /Срок оплаты/);
  assert.equal(P.validatePaymentSettings({ ...base, pay_due_lessons: 9 }, "payments"), null, "the field of the other mode is hidden: not checked");
  assert.match(P.validatePaymentSettings({ ...base, period_mode: "lessons", pay_due_lessons: 5 }, "payments"), /Уроков без оплаты: от 0 до 4/);
  assert.deepEqual(P.diffPaymentSettings({ ...base }, { ...base, pay_due_days: 10 }, P.paymentsScopeKeys("fixed_day")), { pay_due_days: 10 });
});

test("the dashboard: ONE tile of the money with two rows; no row of «К оплате» when nothing is to be paid; no tile without the right to money", () => {
  const input = { moneyAvailable: true, debtTotal: 3780000, debtors: 12, dueTotal: 1524000, dueStudents: 6, attention: 88, pendingSubstitutions: 1, format: (n) => `${n} сум`, debtorsHref: "/owner/payments?bucket=debtors", dueHref: "/owner/payments?bucket=to_pay" };
  const tiles = T.dashboardTiles(input);
  assert.deepEqual(tiles.map((t) => t.key), ["money", "attention", "substitutions"]);
  assert.deepEqual(tiles[0].rows.map((r) => [r.key, r.value, r.label, r.href, r.tone]), [
    ["debt", "3780000 сум", "Долг · 12 учеников", "/owner/payments?bucket=debtors", "alert"],
    ["due", "1524000 сум", "К оплате · 6 учеников", "/owner/payments?bucket=to_pay", "due"],
  ]);
  const calm = T.dashboardTiles({ ...input, debtTotal: 0, debtors: 0, dueTotal: 0, dueStudents: 0, attention: 0, pendingSubstitutions: 0 });
  assert.equal(calm.length, 1);
  assert.deepEqual(calm[0].rows.map((r) => [r.key, r.value, r.tone]), [["debt", "Долга нет", "plain"]]);
  const dueOnly = T.dashboardTiles({ ...input, debtTotal: 0, debtors: 0, attention: 0, pendingSubstitutions: 0 });
  assert.deepEqual(dueOnly[0].rows.map((r) => [r.key, r.value]), [["debt", "Долга нет"], ["due", "1524000 сум"]]);
  assert.equal(T.dashboardTiles({ ...input, moneyAvailable: false }).some((t) => t.key === "money"), false);
});

test("the header of the group: «Долг N · K учеников» and «К оплате N · K учеников» from the server's `students` and `amount_total`, nothing counted on the screen", () => {
  // Группа «Математика 7»: долг 600 000 + 600 000 = 1 200 000 · 2 ученика; к оплате 231 000 × 2 = 462 000 · 2 ученика
  const debt = GW.groupDebtSummary({ students: 2, amount_total: 1200000, items: [] });
  const due = GW.groupDebtSummary({ students: 2, amount_total: 462000 });
  assert.deepEqual([debt, due], [{ count: 2, total: 1200000 }, { count: 2, total: 462000 }]);
  assert.equal(N(GW.groupDebtChipText(debt)), "Долг 1 200 000 сум · 2 ученика");
  assert.equal(N(GW.groupDueChipText(due)), "К оплате 462 000 сум · 2 ученика");
  assert.equal(GW.groupDebtChipText(GW.groupDebtSummary({ students: 0, amount_total: 0 })), null);
  assert.equal(GW.groupDueChipText(null), null);
  assert.equal(GW.groupDebtChipText(GW.groupDebtSummary(null)), null);
  assert.equal(GW.groupDueChipText(GW.groupDebtSummary({ students: 1, amount_total: 231000 })).startsWith("К оплате"), true);
  assert.equal(GW.groupWaitingChipText, undefined);
});

test("the group's tab «Оплаты»: one label per student (the worst state), the two filters overlap, the left ones with a debt", () => {
  const row = (extra) => ({ student_name: "X", display_id: null, group_id: "g", is_active: true, price: { amount: 600000, source: "group" }, ...extra });
  const views = GP.paymentRowViews([row(TIMUR), row(ANVAR), row(LOLA), row(MADINA)], { periodMode: "calendar", today: "2026-11-20" });
  assert.deepEqual(views.map((v) => [v.chip.label, v.chip.tone, v.chip.sub]), [
    ["Долг 600 000 сум", "danger", "просрочено 45 дней · оплачено до 30.09"],
    ["К оплате 231 000 сум", "due", "до 24.11"],
    ["Долг 600 000 сум", "danger", "просрочено 14 дней · оплачено до 31.10"],
    ["Оплачено до 30.11", "ok", null],
  ]);
  const counts = GP.paymentsCounts(views);
  assert.deepEqual([counts.all, counts.debt, counts.due], [4, 2, 2], "Тимур is in BOTH: «С долгом» and «К оплате» (the categories overlap)");
  assert.deepEqual(GP.filterPaymentRows(views, "debt").map((v) => v.membershipId), ["m2", "m3"]);
  assert.deepEqual(GP.filterPaymentRows(views, "due").map((v) => v.membershipId), ["m2", "m1"], "the bigger part first: 231 000 each - then by name");
  assert.equal(GP.filterChipLabel("due", counts), "К оплате (2)");
  assert.equal(GP.filterChipLabel("debt", counts), "С долгом (2)");
  assert.equal(GP.parsePaymentsFilter("due"), "due");
  assert.equal(GP.parsePaymentsFilter("waiting"), "all", "the old filter is gone");
  assert.equal(GP.emptyFilterText("due", ""), "К оплате никого нет");
});

test("the student's card: ONE label - the worst state of his groups in the server's words; two groups in one state are added up with the same word", () => {
  const rows = (...list) => list.map((r) => ({ is_active: true, advance: 0, status: "active", paid_until: null, ...r }));
  const one = SC.studentMoneyChip(rows(ANVAR));
  assert.deepEqual([one.label, one.tone, one.sub, one.debtGroups], ["К оплате 231 000 сум", "due", "до 24.11", 0]);
  const debt = SC.studentMoneyChip(rows(TIMUR, MADINA));
  assert.deepEqual([debt.label, debt.tone, debt.debtGroups], ["Долг 600 000 сум", "danger", 1]);
  // two groups, both debts 600 000 + 100 000 → «Долг 700 000 сум»; the badge of the tab counts the groups with a debt
  const two = SC.studentMoneyChip(rows(LOLA, { ...LOLA, membership_id: "m9", debt_amount: 100000 }));
  assert.equal(N(two.label), "Долг 700 000 сум");
  assert.equal(two.debtGroups, 2);
  assert.equal(two.sub, null);
  const paid = SC.studentMoneyChip(rows({ ...MADINA, advance: 21000 }));
  assert.equal(N(paid.label), "Оплачено до 30.11 · Аванс 21 000 сум");
  assert.equal(paid.tone, "ok");
  assert.equal(SC.studentMoneyChip(rows(SILENT)), null, "151: the server said nothing");
  assert.equal(SC.studentMoneyChip([]), null);
  assert.equal(SC.studentMoneyChip(null), null);
  assert.equal(N(SC.studentMoneyChip(rows({ ...SILENT, advance: 5000 })).label), "Аванс 5 000 сум");
});
