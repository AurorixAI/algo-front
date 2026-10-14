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
const rules = require(path.join(__dirname, "../src/lib/payments.ts"));

const TODAY = "2026-10-14";
/** Normal spaces instead of the non-breaking ones: what the user reads. */
const plain = (text) => text.replace(/ /g, " ");

test("formatMoney groups thousands and adds «сум» with non-breaking spaces", () => {
  assert.equal(plain(rules.formatMoney(450000)), "450 000 сум");
  assert.equal(rules.formatMoney(450000), "450 000 сум");
  assert.equal(plain(rules.formatMoney(0)), "0 сум");
  assert.equal(plain(rules.formatMoney(999)), "999 сум");
  assert.equal(plain(rules.formatMoney(1000)), "1 000 сум");
  assert.equal(plain(rules.formatMoney(10_000_000_000)), "10 000 000 000 сум");
  assert.equal(plain(rules.formatMoney(null)), "0 сум");
  assert.equal(plain(rules.formatMoney(450000.4)), "450 000 сум");
});

test("parseMoneyInput keeps digits only; an empty field is null", () => {
  assert.equal(rules.parseMoneyInput("450 000"), 450000);
  assert.equal(rules.parseMoneyInput("450 000"), 450000);
  assert.equal(rules.parseMoneyInput("450000"), 450000);
  assert.equal(rules.parseMoneyInput("450 000 сум"), 450000);
  assert.equal(rules.parseMoneyInput("450,000"), 450000);
  assert.equal(rules.parseMoneyInput("0"), 0);
  assert.equal(rules.parseMoneyInput(""), null);
  assert.equal(rules.parseMoneyInput("   "), null);
  assert.equal(rules.parseMoneyInput("сум"), null);
  assert.equal(rules.parseMoneyInput(null), null);
  // typing re-formats the field
  assert.equal(plain(rules.reformatMoneyTyping("4500000")), "4 500 000");
  assert.equal(rules.reformatMoneyTyping("abc"), "");
  assert.equal(rules.formatMoneyInput(450000), "450 000");
  assert.equal(rules.formatMoneyInput(null), "");
});

test("money fields are limited to 0..10 000 000 000", () => {
  assert.deepEqual(rules.parseMonthlyFee(""), { value: null, error: null });
  assert.deepEqual(rules.parseMonthlyFee("450 000"), { value: 450000, error: null });
  assert.deepEqual(rules.parseMonthlyFee("10 000 000 000"), { value: 10_000_000_000, error: null });
  assert.ok(rules.parseMonthlyFee("10 000 000 001").error);
});

test("dates are shown as ДД.ММ.ГГГГ", () => {
  assert.equal(rules.formatDateRu("2026-11-04"), "04.11.2026");
  assert.equal(rules.formatDateRu("2026-11-04T10:00:00"), "04.11.2026");
  assert.equal(rules.formatDateRu(null), "");
  assert.equal(rules.formatDateRu("junk"), "");
});

test("«с» + 1 месяц − 1 день, including the short-month edge", () => {
  assert.equal(rules.addMonthMinusDay("2026-10-05"), "2026-11-04");
  assert.equal(rules.addMonthMinusDay("2026-10-01"), "2026-10-31");
  assert.equal(rules.addMonthMinusDay("2026-02-01"), "2026-02-28");
  assert.equal(rules.addMonthMinusDay("2028-02-01"), "2028-02-29");
  // the next month is shorter: the period ends on its last day
  assert.equal(rules.addMonthMinusDay("2026-01-31"), "2026-02-28");
  assert.equal(rules.addMonthMinusDay("2028-01-31"), "2028-02-29");
  assert.equal(rules.addMonthMinusDay("2026-01-30"), "2026-02-28");
  assert.equal(rules.addMonthMinusDay("2026-01-29"), "2026-02-28");
  assert.equal(rules.addMonthMinusDay("2026-01-28"), "2026-02-27");
  // year edge
  assert.equal(rules.addMonthMinusDay("2026-12-15"), "2027-01-14");
  assert.equal(rules.addMonthMinusDay("2026-12-31"), "2027-01-30");
  // not a date: returned as is
  assert.equal(rules.addMonthMinusDay("junk"), "junk");
});

test("day arithmetic never depends on the browser zone", () => {
  assert.equal(rules.addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(rules.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(rules.addDays("2028-03-01", -1), "2028-02-29");
  assert.equal(rules.daysBetween("2026-10-14", "2026-10-17"), 3);
  assert.equal(rules.daysBetween("2026-10-17", "2026-10-14"), -3);
  assert.equal(rules.periodDays("2026-10-05", "2026-11-04"), 31);
  assert.equal(rules.periodDays("2026-10-05", "2026-10-05"), 1);
  assert.equal(rules.subtractYears("2028-02-29", 3), "2025-02-28");
  assert.equal(rules.isIsoDate("2026-02-30"), false);
  assert.equal(rules.isIsoDate("2026-02-28"), true);
});

test("status wording: calendar mode", () => {
  const base = { period_mode: "calendar", paid_until: "2026-11-04", days_overdue: null, days_left: null, lessons_total: null, lessons_left: null };
  assert.equal(rules.statusLabel({ ...base, status: "active" }), "Оплачено до 04.11.2026");
  assert.equal(rules.statusLabel({ ...base, status: "expiring", days_left: 2 }), "Через 2 дн.");
  assert.equal(rules.statusLabel({ ...base, status: "ends_today" }), "Сегодня последний день");
  assert.equal(rules.statusLabel({ ...base, status: "expired", days_overdue: 3 }), "Закончилась 3 дн. назад");
  assert.equal(rules.statusLabel({ ...base, status: "none", period_mode: null, paid_until: null }), "Нет данных");
  assert.equal(rules.statusLabel({ ...base, status: "free", period_mode: null, paid_until: null }), "Бесплатно");
  // the date the payment runs to is the second line of the badge
  assert.equal(rules.statusDetail({ ...base, status: "expiring" }), "до 04.11.2026");
  assert.equal(rules.statusDetail({ ...base, status: "expired" }), "до 04.11.2026");
  assert.equal(rules.statusDetail({ ...base, status: "active" }), "");
});

test("status wording: lessons mode", () => {
  const base = { period_mode: "lessons", paid_until: null, days_overdue: null, days_left: null, lessons_total: 12, lessons_left: 3 };
  assert.equal(rules.statusLabel({ ...base, status: "expiring" }), "Осталось 3 урока из 12");
  assert.equal(rules.statusLabel({ ...base, status: "active", lessons_left: 9 }), "Осталось 9 уроков из 12");
  assert.equal(rules.statusLabel({ ...base, status: "expiring", lessons_left: 1 }), "Осталось 1 урок из 12");
  assert.equal(rules.statusLabel({ ...base, status: "active", lessons_left: 21 }), "Осталось 21 урок из 12");
  assert.equal(rules.statusLabel({ ...base, status: "expired", lessons_left: 0 }), "Уроки закончились");
  assert.equal(rules.statusLabel({ ...base, status: "active", lessons_left: null, lessons_total: null }), "Оплачено");
  assert.equal(rules.statusDetail({ ...base, status: "expiring" }), "");
});

test("tones: overdue is red, soon is amber, paid is green", () => {
  assert.equal(rules.statusTone("expired"), "danger");
  assert.equal(rules.statusTone("ends_today"), "danger");
  assert.equal(rules.statusTone("expiring"), "warning");
  assert.equal(rules.statusTone("active"), "ok");
  assert.equal(rules.statusTone("free"), "free");
  assert.equal(rules.statusTone("none"), "muted");
});

test("plural forms of «урок» and the banner", () => {
  assert.deepEqual([1, 2, 4, 5, 11, 12, 21, 22, 25].map(rules.lessonsWord),
    ["урок", "урока", "урока", "уроков", "уроков", "уроков", "урок", "урока", "уроков"]);
  assert.equal(rules.bannerText(1), "Оплата закончилась у 1 ученика");
  assert.equal(rules.bannerText(2), "Оплата закончилась у 2 учеников");
  assert.equal(rules.bannerText(11), "Оплата закончилась у 11 учеников");
  assert.equal(rules.bannerText(21), "Оплата закончилась у 21 ученика");
});

test("form defaults, calendar mode", () => {
  // first payment: from the payment date, a month minus a day, the fee as the amount
  const first = rules.paymentFormDefaults({ mode: "calendar", today: "2026-10-05", monthlyFee: 450000, paidUntil: null, lessonsDefault: null });
  assert.equal(plain(first.amount), "450 000");
  assert.equal(first.paidOn, "2026-10-05");
  assert.equal(first.validFrom, "2026-10-05");
  assert.equal(first.validTo, "2026-11-04");
  assert.equal(first.lessons, "");
  // the previous period ran past today: continue the day after it
  const early = rules.paymentFormDefaults({ mode: "calendar", today: "2026-10-30", monthlyFee: 450000, paidUntil: "2026-11-04", lessonsDefault: null });
  assert.equal(early.validFrom, "2026-11-05");
  assert.equal(early.validTo, "2026-12-04");
  // the previous period ended before the payment date: start at the payment date
  const late = rules.paymentFormDefaults({ mode: "calendar", today: "2026-10-14", monthlyFee: 450000, paidUntil: "2026-10-01", lessonsDefault: null });
  assert.equal(late.validFrom, "2026-10-14");
  assert.equal(late.validTo, "2026-11-13");
  // the previous period ends today: tomorrow is not "before the payment date"
  const edge = rules.paymentFormDefaults({ mode: "calendar", today: "2026-10-14", monthlyFee: 450000, paidUntil: "2026-10-14", lessonsDefault: null });
  assert.equal(edge.validFrom, "2026-10-15");
  // no fee yet: the amount is empty; a zero fee is not a default amount either
  assert.equal(rules.paymentFormDefaults({ mode: "calendar", today: TODAY, monthlyFee: null, paidUntil: null, lessonsDefault: null }).amount, "");
  assert.equal(rules.paymentFormDefaults({ mode: "calendar", today: TODAY, monthlyFee: 0, paidUntil: null, lessonsDefault: null }).amount, "");
  // the month-end edge
  assert.equal(rules.paymentFormDefaults({ mode: "calendar", today: "2026-01-31", monthlyFee: 1, paidUntil: null, lessonsDefault: null }).validTo, "2026-02-28");
});

test("form defaults, lessons mode", () => {
  const known = rules.paymentFormDefaults({ mode: "lessons", today: TODAY, monthlyFee: 450000, paidUntil: null, lessonsDefault: 12 });
  assert.equal(known.lessons, "12");
  assert.equal(known.validFrom, TODAY);
  assert.equal(known.validTo, "");
  // number of lessons unknown: empty, the server applies the center's setting
  assert.equal(rules.paymentFormDefaults({ mode: "lessons", today: TODAY, monthlyFee: 450000, paidUntil: null, lessonsDefault: null }).lessons, "");
  // lessons never start from the previous calendar date
  assert.equal(rules.paymentFormDefaults({ mode: "lessons", today: TODAY, monthlyFee: 1, paidUntil: "2026-10-30", lessonsDefault: 12 }).validFrom, TODAY);
});

test("a correction starts from the payment being replaced", () => {
  const payment = {
    id: "p1", membership_id: "m1", amount: 450000, currency: "UZS", paid_on: "2026-10-01", valid_from: "2026-10-01",
    valid_to: "2026-10-31", lessons_count: null, note: "наличные", replaces_payment_id: null, created_by: null,
    created_by_name: null, created_at: null, voided_at: null, voided_by: null, voided_by_name: null, void_reason: null,
  };
  const values = rules.paymentFormDefaults({ mode: "calendar", today: TODAY, monthlyFee: 1, paidUntil: null, lessonsDefault: null, payment });
  assert.equal(plain(values.amount), "450 000");
  assert.equal(values.paidOn, "2026-10-01");
  assert.equal(values.validTo, "2026-10-31");
  assert.equal(values.note, "наличные");
  assert.equal(values.reason, "");
  // the mode of a correction is the mode of the payment, not of the center today
  assert.equal(rules.periodModeOf(payment, "lessons"), "calendar");
  assert.equal(rules.periodModeOf({ lessons_count: 12 }, "calendar"), "lessons");
  assert.equal(rules.periodModeOf(null, "lessons"), "lessons");
  const byLessons = rules.paymentFormDefaults({ mode: "lessons", today: TODAY, monthlyFee: 1, paidUntil: null, lessonsDefault: 8, payment: { ...payment, valid_to: null, lessons_count: 12 } });
  assert.equal(byLessons.lessons, "12");
});

test("payment form validation", () => {
  const ok = { amount: "450 000", paidOn: TODAY, validFrom: TODAY, validTo: "2026-11-13", lessons: "", note: "", reason: "" };
  assert.equal(rules.validatePaymentForm(ok, "calendar", TODAY), null);
  assert.ok(rules.validatePaymentForm({ ...ok, amount: "" }, "calendar", TODAY));
  assert.ok(rules.validatePaymentForm({ ...ok, amount: "10 000 000 001" }, "calendar", TODAY));
  assert.equal(rules.validatePaymentForm({ ...ok, amount: "0" }, "calendar", TODAY), null);
  assert.ok(rules.validatePaymentForm({ ...ok, paidOn: "" }, "calendar", TODAY));
  assert.match(rules.validatePaymentForm({ ...ok, paidOn: "2026-10-15" }, "calendar", TODAY), /будущем/);
  assert.equal(rules.validatePaymentForm({ ...ok, paidOn: "2023-10-14" }, "calendar", TODAY), null);
  assert.match(rules.validatePaymentForm({ ...ok, paidOn: "2023-10-13" }, "calendar", TODAY), /3 лет/);
  assert.match(rules.validatePaymentForm({ ...ok, validTo: "2026-10-13" }, "calendar", TODAY), /раньше/);
  assert.ok(rules.validatePaymentForm({ ...ok, validTo: "" }, "calendar", TODAY));
  // 400 days at most, both ends included
  assert.equal(rules.validatePaymentForm({ ...ok, validFrom: "2026-01-01", validTo: "2027-02-04" }, "calendar", TODAY), null); // 400 days
  assert.match(rules.validatePaymentForm({ ...ok, validFrom: "2026-01-01", validTo: "2027-02-05" }, "calendar", TODAY), /400/);
  // lessons mode: the count is optional (server default) but bounded
  const byLessons = { ...ok, validTo: "", lessons: "12" };
  assert.equal(rules.validatePaymentForm(byLessons, "lessons", TODAY), null);
  assert.equal(rules.validatePaymentForm({ ...byLessons, lessons: "" }, "lessons", TODAY), null);
  assert.ok(rules.validatePaymentForm({ ...byLessons, lessons: "0" }, "lessons", TODAY));
  assert.ok(rules.validatePaymentForm({ ...byLessons, lessons: "121" }, "lessons", TODAY));
  assert.ok(rules.validatePaymentForm({ ...byLessons, lessons: "1.5" }, "lessons", TODAY));
  assert.ok(rules.validatePaymentForm({ ...ok, note: "x".repeat(501) }, "calendar", TODAY));
  assert.ok(rules.validatePaymentForm({ ...ok, reason: "x".repeat(501) }, "calendar", TODAY));
});

test("request body: exactly one of «оплачено до» / «уроков»", () => {
  const values = { amount: "450 000", paidOn: TODAY, validFrom: "2026-10-14", validTo: "2026-11-13", lessons: "12", note: "  нал  ", reason: "" };
  assert.deepEqual(rules.buildPaymentPayload(values, "calendar"), {
    amount: 450000, paid_on: TODAY, valid_from: "2026-10-14", valid_to: "2026-11-13", note: "нал",
  });
  assert.deepEqual(rules.buildPaymentPayload(values, "lessons"), {
    amount: 450000, paid_on: TODAY, valid_from: "2026-10-14", lessons_count: 12, note: "нал",
  });
  // an empty count and no comment are left out: the server applies its defaults
  assert.deepEqual(rules.buildPaymentPayload({ ...values, lessons: "", note: "" }, "lessons"), {
    amount: 450000, paid_on: TODAY, valid_from: "2026-10-14",
  });
});

test("period hint counts both ends", () => {
  assert.equal(rules.periodHint({ validFrom: "2026-10-05", validTo: "2026-11-04" }, "calendar"), "Период 31 дн.");
  assert.equal(rules.periodHint({ validFrom: "2026-11-05", validTo: "2026-11-04" }, "calendar"), null);
  assert.equal(rules.periodHint({ validFrom: "2026-10-05", validTo: "" }, "calendar"), null);
  assert.equal(rules.periodHint({ validFrom: "2026-10-05", validTo: "2026-11-04" }, "lessons"), null);
});

test("period and last payment lines", () => {
  assert.equal(rules.paymentPeriodLabel({ valid_from: "2026-10-05", valid_to: "2026-11-04", lessons_count: null }), "05.10.2026 — 04.11.2026");
  assert.equal(rules.paymentPeriodLabel({ valid_from: "2026-10-05", valid_to: null, lessons_count: 12 }), "12 уроков с 05.10.2026");
  assert.equal(plain(rules.lastPaymentLabel({ paid_on: "2026-10-05", amount: 450000 })), "05.10.2026 · 450 000 сум");
  assert.equal(rules.lastPaymentLabel(null), "—");
});

test("cancellation reason is 3..500 characters", () => {
  assert.ok(rules.validateVoidReason(""));
  assert.ok(rules.validateVoidReason(" ab "));
  assert.equal(rules.validateVoidReason("abc"), null);
  assert.equal(rules.validateVoidReason("x".repeat(500)), null);
  assert.ok(rules.validateVoidReason("x".repeat(501)));
});

test("tabs: ?bucket= falls back to the most urgent one; counters only where the spec shows them", () => {
  assert.deepEqual(rules.PAYMENT_BUCKETS.map((b) => b.key), ["due", "expiring", "none", "active"]);
  assert.equal(rules.parseBucket("none"), "none");
  assert.equal(rules.parseBucket("active"), "active");
  assert.equal(rules.parseBucket("all"), "due");
  assert.equal(rules.parseBucket(null), "due");
  assert.equal(rules.parseBucket("<script>"), "due");
  assert.equal(rules.bucketCount({ due: 4, none: 7 }, "due"), 4);
  assert.equal(rules.bucketCount({ due: 4, none: 7 }, "none"), 7);
  assert.equal(rules.bucketCount({ due: 4, none: 7 }, "expiring"), null);
  assert.equal(rules.bucketCount(null, "due"), null);
});

test("center settings: ranges and PATCH diff", () => {
  const base = { ...rules.DEFAULT_PAYMENT_SETTINGS };
  assert.equal(rules.validatePaymentSettings(base), null);
  assert.ok(rules.validatePaymentSettings({ ...base, lessons_per_payment: 0 }));
  assert.ok(rules.validatePaymentSettings({ ...base, lessons_per_payment: 61 }));
  assert.ok(rules.validatePaymentSettings({ ...base, lessons_per_payment: NaN }));
  assert.ok(rules.validatePaymentSettings({ ...base, expiring_days: 15 }));
  assert.equal(rules.validatePaymentSettings({ ...base, expiring_days: 0 }), null);
  assert.ok(rules.validatePaymentSettings({ ...base, expiring_lessons: 11 }));
  assert.equal(base.period_mode, "calendar");
  assert.equal(base.lessons_per_payment, 12);
  assert.equal(base.admin_can_manage, false);
  assert.deepEqual(rules.diffPaymentSettings(base, base), {});
  assert.deepEqual(rules.diffPaymentSettings(base, { ...base, period_mode: "lessons", admin_can_manage: true }),
    { period_mode: "lessons", admin_can_manage: true });
});

// ── The shared summary store (no network: fetch is replaced) ────────────────

function withFetch(handler, run) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push(String(url));
    return handler(String(url), init);
  };
  return Promise.resolve(run(calls)).finally(() => { global.fetch = original; });
}
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const store = () => require(path.join(__dirname, "../src/lib/payments-summary.ts")).usePaymentsSummary;

test("summary store: 200 makes payments available and counts due; one request", async () => {
  const usePaymentsSummary = store();
  usePaymentsSummary.getState().reset();
  await withFetch(() => reply(200, {
    as_of: TODAY, due: 5, ends_today: 2, expired: 3, expiring: 4, none: 6, active: 20, free: 2, tracked_total: 35, period_mode: "lessons",
  }), async (calls) => {
    await usePaymentsSummary.getState().refresh(true);
    const state = usePaymentsSummary.getState();
    assert.equal(state.available, true);
    assert.equal(state.due, 5);
    assert.equal(state.expiring, 4);
    assert.equal(state.none, 6);
    assert.equal(state.active, 20); // the whole «Оплачено» tab; `free` (2) is a sub-count, not added again
    assert.equal(state.periodMode, "lessons");
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/auth\/org\/payments\/summary$/);
    // a second call within a second is skipped
    await usePaymentsSummary.getState().refresh();
    assert.equal(calls.length, 1);
    await usePaymentsSummary.getState().refresh(true);
    assert.equal(calls.length, 2);
  });
});

test("summary store: 403, 404 and a network error hide everything, quietly", async () => {
  const usePaymentsSummary = store();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    for (const make of [() => reply(403, { detail: "Нет доступа" }), () => reply(404, { detail: "Not found" })]) {
      usePaymentsSummary.getState().reset();
      await withFetch(make, async () => {
        await usePaymentsSummary.getState().refresh(true);
      });
      const state = usePaymentsSummary.getState();
      assert.equal(state.available, false);
      assert.equal(state.due, 0);
      assert.equal(state.loaded, true);
    }
    assert.equal(warnings.length, 0, "403 / 404 are expected answers: no console noise");

    usePaymentsSummary.getState().reset();
    await withFetch(() => { throw new TypeError("network"); }, async () => {
      await usePaymentsSummary.getState().refresh(true);
      assert.equal(usePaymentsSummary.getState().available, false);
      await usePaymentsSummary.getState().refresh(true);
    });
    assert.equal(warnings.length, 1, "a network failure is warned about once, not on every refresh");
  } finally {
    console.warn = originalWarn;
  }
});

test("summary store: an answer that arrives after reset (logout) is dropped", async () => {
  const usePaymentsSummary = store();
  usePaymentsSummary.getState().reset();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await withFetch(async () => { await gate; return reply(200, { due: 9, period_mode: "calendar" }); }, async () => {
    const pending = usePaymentsSummary.getState().refresh(true);
    usePaymentsSummary.getState().reset();
    release();
    await pending;
  });
  assert.equal(usePaymentsSummary.getState().available, false);
  assert.equal(usePaymentsSummary.getState().due, 0);
});

// ── Screens follow the contract ─────────────────────────────────────────────

test("screens exist and follow the contract (routes, menu, banner, teacher, demo)", () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  for (const role of ["admin", "owner"]) {
    assert.match(read(`src/app/${role}/payments/page.tsx`), /<PaymentsPage studentProfileBasePath="\/admin\/students" \/>/, role);
    assert.match(read(`src/app/${role}/layout.tsx`), new RegExp(`<PaymentsAlertBanner paymentsBasePath="/${role}/payments" />`), role);
  }
  const sidebar = read("src/components/layout/sidebar.tsx");
  assert.match(sidebar, /href: "\/admin\/payments", label: "Оплаты"/);
  assert.match(sidebar, /href: "\/owner\/payments", label: "Оплаты"/);
  assert.match(sidebar, /showPayments = !DEMO_MODE && \(rawRole === "owner" \|\| role === "admin"\) && paymentsAvailable/);
  const teacherNav = sidebar.slice(sidebar.indexOf("const teacherNav"), sidebar.indexOf("const navItems"));
  assert.doesNotMatch(teacherNav, /payments|Оплаты/);
  // the store does not request anything in the demo build and is fed only by owner/admin layouts
  assert.match(read("src/lib/payments-summary.ts"), /if \(DEMO_MODE\)/);
  assert.doesNotMatch(read("src/app/teacher/layout.tsx"), /Payments/);
  // the student card asks for money only when it is not a teacher and the server allowed it
  const groups = read("src/components/students/student-groups-block.tsx");
  assert.match(groups, /moneyEnabled = !isTeacher && !DEMO_MODE && available/);
  assert.match(groups, /if \(!moneyEnabled\) \{ setRows\(null\); return; \}/);
  // the add-student drawer offers the fee only when payments are available
  const drawer = read("src/components/groups/add-student-drawer.tsx");
  assert.match(drawer, /moneyAvailable &&/);
  assert.match(drawer, /mode: transfers\.length > 0 \? mode : undefined/);
  assert.match(drawer, /Перевести сюда/);
  assert.match(drawer, /Добавить ещё и в эту группу/);
  // the owner settings block belongs to the owner only
  assert.match(read("src/app/owner/settings/page.tsx"), /isOwner && <PaymentsSettingsSection \/>/);
  // the quiet style of the attendance section: no select-all, no bulk actions on the list
  const page = read("src/components/payments/payments-page.tsx");
  assert.doesNotMatch(page, /Выбрать все|checkbox|bulk/i);
  assert.match(page, /CascadingFilter/);
  assert.match(page, /RowMenu/);
});

test("the business date, not the browser's, is today in the payment dialogs", () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  for (const file of ["src/components/payments/payment-form-modal.tsx", "src/components/payments/payments-page.tsx"]) {
    const source = read(file);
    assert.match(source, /formatBusinessDate\(\)/, file);
    assert.doesNotMatch(source, /new Date\(/, file);
  }
  assert.doesNotMatch(read("src/lib/payments.ts"), /new Date\(\)|Date\.now\(\)/);
});

test("the math-layout browser test mocks the summary the admin layout requests", () => {
  const source = fs.readFileSync(path.join(__dirname, "math-layout.browser.cjs"), "utf8");
  assert.match(source, /path==='\/api\/v1\/auth\/org\/payments\/summary'/);
});
