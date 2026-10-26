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

test("dates are shown as ДД.ММ.ГГГГ", () => {
  assert.equal(rules.formatDateRu("2026-11-04"), "04.11.2026");
  assert.equal(rules.formatDateRu("2026-11-04T10:00:00"), "04.11.2026");
  assert.equal(rules.formatDateRu(null), "");
  assert.equal(rules.formatDateRu("junk"), "");
});

test("day arithmetic never depends on the browser zone", () => {
  assert.equal(rules.addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(rules.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(rules.addDays("2028-03-01", -1), "2028-02-29");
  assert.equal(rules.daysBetween("2026-10-14", "2026-10-17"), 3);
  assert.equal(rules.daysBetween("2026-10-17", "2026-10-14"), -3);
  assert.equal(rules.subtractYears("2028-02-29", 3), "2025-02-28");
  assert.equal(rules.isIsoDate("2026-02-30"), false);
  assert.equal(rules.isIsoDate("2026-02-28"), true);
});

test("status wording: calendar mode (UX-1 A: human words, plurals, no abbreviations)", () => {
  const base = { period_mode: "calendar", paid_until: "2026-11-04", days_overdue: null, days_left: null, lessons_total: null, lessons_left: null };
  assert.equal(rules.statusLabel({ ...base, status: "active" }), "Оплачено");
  assert.equal(rules.statusLabel({ ...base, status: "expiring", days_left: 2 }), "Осталось 2 дня");
  assert.equal(rules.statusLabel({ ...base, status: "expiring", days_left: 1 }), "Остался 1 день");
  assert.equal(rules.statusLabel({ ...base, status: "expiring", days_left: 5 }), "Осталось 5 дней");
  assert.equal(rules.statusLabel({ ...base, status: "expiring", days_left: null }), "Скоро закончится");
  assert.equal(rules.statusLabel({ ...base, status: "ends_today" }), "Сегодня последний день");
  assert.equal(rules.statusLabel({ ...base, status: "expired", days_overdue: 3 }), "Просрочено на 3 дня");
  assert.equal(rules.statusLabel({ ...base, status: "expired", days_overdue: 31 }), "Просрочено на 31 день");
  assert.equal(rules.statusLabel({ ...base, status: "expired", days_overdue: 11 }), "Просрочено на 11 дней");
  assert.equal(rules.statusLabel({ ...base, status: "expired", days_overdue: null }), "Оплата просрочена");
  assert.equal(rules.statusLabel({ ...base, status: "none", period_mode: null, paid_until: null }), "Без оплат");
  assert.equal(rules.statusLabel({ ...base, status: "free", period_mode: null, paid_until: null }), "Бесплатно");
  // the date the payment runs to is the second line of the badge - for every state that has one
  assert.equal(rules.statusDetail({ ...base, status: "expiring" }), "оплачено до 04.11.2026");
  assert.equal(rules.statusDetail({ ...base, status: "expired" }), "оплачено до 04.11.2026");
  assert.equal(rules.statusDetail({ ...base, status: "ends_today" }), "оплачено до 04.11.2026");
  assert.equal(rules.statusDetail({ ...base, status: "active" }), "оплачено до 04.11.2026");
  assert.equal(rules.statusDetail({ ...base, status: "none", paid_until: null }), "");
  assert.equal(rules.statusDetail({ ...base, status: "free", paid_until: null }), "");
});

test("status wording: lessons mode", () => {
  const base = { period_mode: "lessons", paid_until: null, days_overdue: null, days_left: null, lessons_total: 12, lessons_left: 3 };
  assert.equal(rules.statusLabel({ ...base, status: "expiring" }), "Скоро закончится");            // the count is the progress line of the package
  assert.equal(rules.statusLabel({ ...base, status: "expiring", lessons_left: 1 }), "Скоро закончится");
  assert.equal(rules.statusLabel({ ...base, status: "expiring", lessons_left: null }), "Скоро закончится");
  assert.equal(rules.statusLabel({ ...base, status: "expired", lessons_left: 0 }), "Уроки закончились");
  // a package that is paid and not running out: «Оплачено», the lessons left are the second line
  assert.equal(rules.statusLabel({ ...base, status: "active", lessons_left: 9 }), "Оплачено");
  assert.equal(rules.statusDetail({ ...base, status: "active", lessons_left: 9 }), "осталось 9 уроков из 12");
  assert.equal(rules.statusDetail({ ...base, status: "active", lessons_left: 21 }), "остался 21 урок из 12");
  assert.equal(rules.statusLabel({ ...base, status: "active", lessons_left: null, lessons_total: null }), "Оплачено");
  assert.equal(rules.statusDetail({ ...base, status: "active", lessons_left: null, lessons_total: null }), "");
  assert.equal(rules.statusDetail({ ...base, status: "expiring" }), "");
});

test("tones: overdue is red, the last day and «soon» are amber, paid is grey", () => {
  assert.equal(rules.statusTone("expired"), "danger");
  assert.equal(rules.statusTone("ends_today"), "warning"); // not overdue yet: red is for a real problem
  assert.equal(rules.statusTone("expiring"), "warning");
  assert.equal(rules.statusTone("active"), "ok");
  assert.equal(rules.statusTone("free"), "free");
  assert.equal(rules.statusTone("none"), "muted");
});

test("plural forms of «урок» (the banner words are in tests/ux1-d.test.cjs)", () => {
  assert.deepEqual([1, 2, 4, 5, 11, 12, 21, 22, 25].map(rules.lessonsWord),
    ["урок", "урока", "урока", "уроков", "уроков", "уроков", "урок", "урока", "уроков"]);
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

test("tabs: ?bucket= falls back to the most urgent one; every tab has a counter", () => {
  // owner 21.10: tabs by money; «Без оплат» is gone (its rows are debtors «Ещё не платил»)
  assert.deepEqual(rules.PAYMENT_BUCKETS.map((b) => b.key), ["debt", "expiring", "active"]);
  assert.deepEqual(rules.PAYMENT_BUCKETS.map((b) => b.label), ["Должники", "Скоро платить", "Без долга"]);
  assert.equal(rules.parseBucket("none"), "debt"); // an old link opens the most urgent tab
  assert.equal(rules.parseBucket("due"), "debt");
  assert.equal(rules.parseBucket("active"), "active");
  assert.equal(rules.parseBucket("all"), "debt");
  assert.equal(rules.parseBucket(null), "debt");
  assert.equal(rules.parseBucket("<script>"), "debt");
  const summary = { debtors: 4, expiring: 3, active: 120 };
  assert.deepEqual(rules.PAYMENT_BUCKETS.map((b) => rules.bucketCount(summary, b.key)), [4, 3, 120]);
  assert.equal(rules.bucketCount({ students_with_debt: 9, expiring: 0, active: 0 }, "debt"), 9); // an answer without `debtors`
  assert.equal(rules.bucketCount({ debtors: 0, expiring: 0, active: 0 }, "expiring"), 0);
  assert.equal(rules.bucketCount(null, "debt"), null);
  assert.equal(rules.bucketCount({ debtors: 4 }, "active"), null); // a partial answer: no counter rather than a wrong one
  assert.equal(rules.bucketTabLabel("Должники", 7), "Должники (7)");
  assert.equal(rules.bucketTabLabel("Без долга", 0), "Без долга (0)");
  assert.equal(rules.bucketTabLabel("Без долга", null), "Без долга");
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

test("summary store: 403 and 404 hide everything quietly and are remembered", async () => {
  const usePaymentsSummary = store();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    for (const make of [() => reply(403, { detail: "Нет доступа" }), () => reply(404, { detail: "Not found" })]) {
      usePaymentsSummary.getState().reset();
      await withFetch(make, async (calls) => {
        await usePaymentsSummary.getState().refresh(true);
        const state = usePaymentsSummary.getState();
        assert.equal(state.available, false);
        assert.equal(state.due, 0);
        assert.equal(state.loaded, true);
        // route change / tab visible / a forced refresh do not ask again
        await usePaymentsSummary.getState().refresh();
        await usePaymentsSummary.getState().refresh(true);
        assert.equal(calls.length, 1);
        // the 5-minute timer and saving the settings re-check
        await usePaymentsSummary.getState().refresh(true, { recheck: true });
        assert.equal(calls.length, 2);
      });
    }
    assert.equal(warnings.length, 0, "403 / 404 are expected answers: no console noise");
  } finally {
    console.warn = originalWarn;
  }
});

test("summary store: a recheck that succeeds (the owner enabled the right) lifts the refusal; logout forgets it", async () => {
  const usePaymentsSummary = store();
  usePaymentsSummary.getState().reset();
  let status = 403;
  await withFetch(() => (status === 403 ? reply(403, {}) : reply(200, { due: 1, period_mode: "calendar" })), async (calls) => {
    await usePaymentsSummary.getState().refresh(true);
    assert.equal(usePaymentsSummary.getState().available, false);
    status = 200;
    await usePaymentsSummary.getState().refresh(true); // still remembered: not asked
    assert.equal(calls.length, 1);
    await usePaymentsSummary.getState().refresh(true, { recheck: true });
    assert.equal(usePaymentsSummary.getState().available, true);
    assert.equal(usePaymentsSummary.getState().due, 1);
    status = 403;
    await usePaymentsSummary.getState().refresh(true, { recheck: true });
    assert.equal(usePaymentsSummary.getState().available, false);
    usePaymentsSummary.getState().reset(); // logout / login
    status = 200;
    await usePaymentsSummary.getState().refresh(true);
    assert.equal(usePaymentsSummary.getState().available, true);
  });
});

test("summary store: a network error or 5xx keeps the last state and warns once", async () => {
  const usePaymentsSummary = store();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    usePaymentsSummary.getState().reset();
    await withFetch(() => reply(200, { due: 3, period_mode: "lessons" }), async () => {
      await usePaymentsSummary.getState().refresh(true);
    });
    await withFetch(() => { throw new TypeError("network"); }, async () => {
      await usePaymentsSummary.getState().refresh(true);
      await usePaymentsSummary.getState().refresh(true);
    });
    await withFetch(() => reply(503, { detail: "down" }), async () => {
      await usePaymentsSummary.getState().refresh(true);
    });
    const state = usePaymentsSummary.getState();
    assert.equal(state.available, true, "open dialogs and the menu item must not vanish");
    assert.equal(state.due, 3);
    assert.equal(state.periodMode, "lessons");
    assert.equal(warnings.length, 1, "warned once, not on every refresh");
    // and the next good answer is taken
    await withFetch(() => reply(200, { due: 0, period_mode: "calendar" }), async () => {
      await usePaymentsSummary.getState().refresh(true);
    });
    assert.equal(usePaymentsSummary.getState().due, 0);
  } finally {
    console.warn = originalWarn;
  }
});

test("summary store: a forced refresh during a request queues exactly one more", async () => {
  const usePaymentsSummary = store();
  usePaymentsSummary.getState().reset();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let served = 0;
  await withFetch(async () => { const n = ++served; if (n === 1) await gate; return reply(200, { due: n, period_mode: "calendar" }); }, async (calls) => {
    const first = usePaymentsSummary.getState().refresh(true);
    usePaymentsSummary.getState().refresh(true);
    usePaymentsSummary.getState().refresh(true);
    usePaymentsSummary.getState().refresh();
    assert.equal(calls.length, 1);
    release();
    await first;
    assert.equal(calls.length, 2, "one more read, not one per call");
    assert.equal(usePaymentsSummary.getState().due, 2, "the answer after the action wins");
  });
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
    // each workspace opens the student card under its own prefix (N13 P1.4)
    assert.match(read(`src/app/${role}/payments/page.tsx`), new RegExp(`<PaymentsPage studentProfileBasePath="/${role}/students" groupsBasePath="/${role}/groups" />`), role);
    assert.match(read(`src/app/${role}/layout.tsx`), new RegExp(`<PaymentsAlertBanner paymentsBasePath="/${role}/payments" />`), role);
  }
  const sidebar = read("src/components/layout/sidebar.tsx");
  assert.match(sidebar, /href: "\/admin\/payments", label: "Оплаты"/);
  assert.match(sidebar, /href: "\/owner\/payments", label: "Оплаты"/);
  assert.match(sidebar, /showPayments = !DEMO_MODE && \(rawRole === "owner" \|\| \(role === "admin" && paymentsAvailable\)\)/);
  const teacherNav = sidebar.slice(sidebar.indexOf("const teacherNav"), sidebar.indexOf("const navItems"));
  assert.doesNotMatch(teacherNav, /payments|Оплаты/);
  // the store does not request anything in the demo build and is fed only by owner/admin layouts
  assert.match(read("src/lib/payments-summary.ts"), /if \(DEMO_MODE\)/);
  assert.doesNotMatch(read("src/app/teacher/layout.tsx"), /Payments/);
  // the student card asks for money only when it is not a teacher and the server allowed it
  // (N13 P2.2: money moved from the «Группы» block to its own «Оплаты» tab; «Обучение» holds none)
  const groups = read("src/components/students/student-groups-block.tsx");
  assert.doesNotMatch(groups, /MembershipPayments|getStudentMemberships|usePaymentsSummary/);
  const moneyBlock = read("src/components/students/student-payments-block.tsx");
  assert.match(moneyBlock, /moneyEnabled = !isTeacher && !DEMO_MODE && available/);
  assert.match(moneyBlock, /if \(!moneyEnabled\) \{ setRows\(null\); return; \}/);
  // the add-student drawer offers the fee only when payments are available
  const drawer = read("src/components/groups/add-student-drawer.tsx");
  assert.match(drawer, /moneyAvailable &&/);
  assert.match(drawer, /mode: transfers\.length > 0 \? mode : undefined/);
  assert.match(drawer, /ENROL_HERE_TRANSFER_LABEL/);
  assert.match(drawer, /ENROL_HERE_ADD_LABEL/);
  // the owner settings block belongs to the owner only
  assert.match(read("src/app/owner/settings/page.tsx"), /visibleSettingsSections\(\{ isOwner, paymentSettingsReadable/);
  // the quiet style of the attendance section: no select-all, no bulk actions on the list
  const page = read("src/components/payments/payments-page.tsx");
  assert.doesNotMatch(page, /Выбрать все|checkbox|bulk/i);
  assert.match(page, /CascadingFilter/);
  assert.match(page, /RowMenu/);
});

test("the math-layout browser test mocks the summary the admin layout requests", () => {
  const source = fs.readFileSync(path.join(__dirname, "math-layout.browser.cjs"), "utf8");
  assert.match(source, /path==='\/api\/v1\/auth\/org\/payments\/summary'/);
});
