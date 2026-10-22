// N13 P2.2 - «единый день оплаты», settings sections, quote in the payment forms, receipts and cheques, student-card tabs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
// .tsx too (server-side render of the receipt sheet) and the "@/" alias of the app
require.extensions[".tsx"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const P = require(path.join(root, "src/lib/payments.ts"));
const sections = require(path.join(root, "src/lib/settings-sections.ts"));
const tabs = require(path.join(root, "src/lib/profile-tabs.ts"));
/** Normal spaces instead of the non-breaking ones: what the user reads. */
const plain = (text) => text.replace(/ /g, " ");

// ---- 1. what the amount is called (ROADMAP №68) ----------------------------------------------

test("the price is «Цена в месяц» for months and «Цена пакета» for a package (#105: the centre's mode names it)", () => {
  const G = require(path.join(root, "src/lib/group-price.ts"));
  assert.equal(G.priceLabelOf("calendar"), "Цена в месяц");
  assert.equal(G.priceLabelOf("lessons"), "Цена пакета");
  assert.equal(G.priceLabelOf(undefined), "Цена в месяц");
  // no phrase of the package mentions a month
  assert.equal(plain(G.formatPrice(600000, "Цена пакета")), "600 000 сум за пакет");
  assert.doesNotMatch(G.formatPrice(600000, "Цена пакета"), /мес/);
  assert.equal(plain(G.formatPrice(600000, "Цена в месяц")), "600 000 сум/мес");
});

test("screens take the price wording from the helper, not from literals", () => {
  for (const file of ["components/payments/payments-page.tsx", "components/payments/membership-price.tsx"]) {
    assert.match(read(`src/${file}`), /priceLabelOf\(/, file);
  }
  for (const file of ["components/payments/payments-page.tsx", "components/payments/membership-payments.tsx", "components/payments/membership-price.tsx", "components/payments/group-prices-page.tsx"]) {
    assert.doesNotMatch(read(`src/${file}`), /["'>]Цена в месяц[<"',]/, file);
  }
  assert.match(read("src/components/groups/add-student-drawer.tsx"), /priceLabelOf\(usePaymentsSummary/);
});

// ---- 2. periods of the «единый день оплаты» -------------------------------------------------------

// ---- 3. the quote: what is asked, what is written ---------------------------------------------

const calendarInputs = { mode: "calendar", paidOn: "2026-10-15", validFrom: "2026-10-15", validTo: "2026-11-14", lessons: "", fromTouched: false, toTouched: false };

const answer = (over = {}) => ({
  mode: "calendar", billing_anchor: "fixed_day", billing_day: 1, paid_on: "2026-10-15",
  valid_from: "2026-10-15", valid_to: "2026-10-31", lessons_count: null, partial: true, monthly_fee: 500000,
  suggested_amount: 250000, basis: "lessons", parts: [], explanation: "Неполный месяц: 6 уроков из 12 по расписанию", ...over,
});

const { createRequestSequence } = require(path.join(root, "src/lib/request-sequence.ts"));
const nav = require(path.join(root, "src/lib/receipt-nav.ts"));
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** A deferred fetch: the test decides when (and whether) each request answers. */
function fakeServer() {
  const calls = [];
  return {
    calls,
    fetchQuote: (query) => new Promise((resolve, reject) => { calls.push({ query, resolve, reject }); }),
  };
}

// ---- 4. settings: models, sections ----------------------------------------------------------

test("three cards map to period_mode + billing_anchor", () => {
  assert.deepEqual(P.PAYMENT_MODELS.map((m) => m.title), ["От даты оплаты", "Единый день оплаты", "Пакет уроков"]);
  assert.equal(P.paymentModelOf({ period_mode: "calendar", billing_anchor: "payment_date" }), "payment_date");
  assert.equal(P.paymentModelOf({ period_mode: "calendar", billing_anchor: "fixed_day" }), "fixed_day");
  assert.equal(P.paymentModelOf({ period_mode: "lessons", billing_anchor: "fixed_day" }), "lessons");
  assert.equal(P.paymentModelOf({ period_mode: "calendar" }), "payment_date"); // an older server
  assert.deepEqual(P.paymentModelPatch("payment_date"), { period_mode: "calendar", billing_anchor: "payment_date" });
  assert.deepEqual(P.paymentModelPatch("fixed_day"), { period_mode: "calendar", billing_anchor: "fixed_day" });
  assert.deepEqual(P.paymentModelPatch("lessons"), { period_mode: "lessons" }); // the chosen day is kept
  assert.equal(P.DEFAULT_PAYMENT_SETTINGS.billing_anchor, "payment_date");
  assert.equal(P.DEFAULT_PAYMENT_SETTINGS.billing_day, 1);
});

test("the billing day is 1..28, with a hint in words", () => {
  const ok = { ...P.DEFAULT_PAYMENT_SETTINGS };
  assert.equal(P.validatePaymentSettings({ ...ok, billing_day: 1 }), null);
  assert.equal(P.validatePaymentSettings({ ...ok, billing_day: 28 }), null);
  for (const bad of [0, 29, 31, 1.5, NaN, -1]) assert.match(P.validatePaymentSettings({ ...ok, billing_day: bad }), /Единый день оплаты/, String(bad));
  assert.equal(P.billingDayHint(1), "Период: с 1-го по последнее число месяца");
  assert.equal(P.billingDayHint(10), "Период: с 10-го числа по 9-е число следующего месяца");
  assert.equal(P.billingDayHint(28), "Период: с 28-го числа по 27-е число следующего месяца");
  assert.equal(P.billingDayHint(29), "");
});

test("each settings section validates and saves only its own fields", () => {
  const ok = { ...P.DEFAULT_PAYMENT_SETTINGS };
  const badAttendance = { ...ok, excuse_deadline_days: 99 };
  const badPayments = { ...ok, period_mode: "lessons", lessons_per_payment: 0 };
  assert.match(P.validatePaymentSettings(badAttendance, "attendance"), /пропуска/);
  assert.equal(P.validatePaymentSettings(badAttendance, "payments"), null); // not this section's problem
  assert.match(P.validatePaymentSettings(badPayments, "payments"), /Число уроков/);
  assert.equal(P.validatePaymentSettings(badPayments, "attendance"), null);
  const after = { ...ok, billing_anchor: "fixed_day", billing_day: 10, excuse_deadline_days: 7, admin_can_manage: true };
  assert.deepEqual(P.diffPaymentSettings(ok, after, P.PAYMENTS_SCOPE_KEYS), { billing_anchor: "fixed_day", billing_day: 10, admin_can_manage: true });
  assert.deepEqual(P.diffPaymentSettings(ok, after, P.ATTENDANCE_SCOPE_KEYS), { excuse_deadline_days: 7 });
  assert.deepEqual(P.diffPaymentSettings(ok, after), { billing_anchor: "fixed_day", billing_day: 10, admin_can_manage: true, excuse_deadline_days: 7 });
});

test("?section= falls back to «Организация» for anything unknown or not shown", () => {
  assert.deepEqual(sections.SETTINGS_SECTIONS.map((s) => s.key), ["organization", "payments", "attendance", "payroll", "profile", "security"]);
  assert.equal(sections.DEFAULT_SETTINGS_SECTION, "organization");
  for (const key of ["organization", "payments", "attendance", "payroll", "profile", "security"]) assert.equal(sections.parseSettingsSection(key), key);
  for (const bad of [null, undefined, "", "salary", "Payments", "payments ", "../x", "constructor"]) assert.equal(sections.parseSettingsSection(bad), "organization", String(bad));
  // a section the user may not see is not opened by a link either
  const noPayments = sections.visibleSettingsSections({ isOwner: true, paymentSettingsReadable: false });
  assert.deepEqual(noPayments, ["organization", "payroll", "profile", "security"]);
  assert.equal(sections.parseSettingsSection("payments", noPayments), "organization");
  assert.equal(sections.parseSettingsSection("attendance", noPayments), "organization");
  assert.deepEqual(sections.visibleSettingsSections({ isOwner: true, paymentSettingsReadable: true }).length, 6);
  assert.deepEqual(sections.visibleSettingsSections({ isOwner: false, paymentSettingsReadable: true }), ["organization", "profile", "security"]);
  assert.equal(sections.settingsSectionHref("payments"), "?section=payments");
  // «Зарплата» exists since N13 P3 (the owner's alone) and is never offered as «скоро»
  assert.ok(sections.SETTINGS_SECTIONS.some((s) => s.key === "payroll" && s.label === "Зарплата"));
  assert.doesNotMatch(read("src/lib/settings-sections.ts") + read("src/app/owner/settings/page.tsx"), /скоро|После подключения/i);
});

test("the settings page: sections in the address, replace without scrolling, one Save per section", () => {
  const page = read("src/app/owner/settings/page.tsx");
  assert.match(page, /router\.replace\(`\$\{pathname\}\$\{settingsSectionHref\(key\)\}`, \{ scroll: false \}\)/);
  assert.match(page, /<Suspense/); // useSearchParams needs it for a static page
  assert.match(page, /<SectionNav sections=\{sections\}/);
  assert.match(page, /md:grid-cols-\[220px_minmax\(0,1fr\)\]/); // menu on the left from md
  assert.match(page, /overflow-x-auto/); // tabs scroll on a phone
  for (const key of ["organization", "payments", "attendance", "payroll", "profile", "security"]) {
    assert.match(page, new RegExp(`section === "${key}"`), key);
  }
  assert.equal((page.match(/onSave=/g) || []).length, 6);
  assert.match(page, /FIXED_DAY_HINT/);
  assert.match(page, /BILLING_DAY_RANGE/);
  assert.match(P.FIXED_DAY_HINT, /неполный месяц — сумма пересчитывается по урокам/);
  // while the payment settings load, a link to a payment section waits instead of being rewritten
  assert.match(page, /waitingForPaymentSettings/);
  // after saving one section the other's unsaved typing survives
  assert.match(page, /for \(const key of keys\) merged\[key\] = next\[key\];/);
});

// ---- 5. student card tabs -------------------------------------------------------------------

test("tabs of the student card by role", () => {
  // a teacher never gets money, but reads the contacts (read-only, as before)
  assert.deepEqual(tabs.visibleProfileTabs({ isTeacher: true, paymentsVisible: true }), ["diagnostics", "learning", "contacts"]);
  assert.deepEqual(tabs.visibleProfileTabs({ isTeacher: true, paymentsVisible: false }), ["diagnostics", "learning", "contacts"]);
  assert.deepEqual(tabs.visibleProfileTabs({ isTeacher: false, paymentsVisible: false }), ["diagnostics", "learning", "contacts"]);
  assert.deepEqual(tabs.visibleProfileTabs({ isTeacher: false, paymentsVisible: true }), ["diagnostics", "learning", "payments", "contacts"]);
  assert.deepEqual(Object.values(tabs.PROFILE_TAB_LABEL), ["Диагностика и отчёты", "Обучение", "Оплаты", "Контакты и заметки"]);
});

test("?tab=: missing opens diagnostics, unknown or forbidden opens «Обучение» (a teacher: diagnostics)", () => {
  const owner = tabs.visibleProfileTabs({ isTeacher: false, paymentsVisible: true });
  const adminNoFlag = tabs.visibleProfileTabs({ isTeacher: false, paymentsVisible: false });
  const teacher = tabs.visibleProfileTabs({ isTeacher: true, paymentsVisible: false });
  for (const tab of owner) assert.equal(tabs.parseProfileTab(tab, owner), tab);
  for (const missing of [null, undefined, ""]) assert.equal(tabs.parseProfileTab(missing, owner), "diagnostics");
  // an administrator without the right: ?tab=payments opens «Обучение», never the money
  assert.equal(tabs.parseProfileTab("payments", adminNoFlag), "learning");
  assert.equal(tabs.parseProfileTab("contacts", adminNoFlag), "contacts");
  for (const bad of ["info", "Payments", "money", "__proto__", "payments,contacts"]) {
    assert.equal(tabs.parseProfileTab(bad, owner), "learning", bad);
    assert.equal(tabs.parseProfileTab(bad, teacher, true), "diagnostics", bad);
  }
  // a teacher never reaches money by a link, but opens the contacts
  assert.equal(tabs.parseProfileTab("payments", teacher, true), "diagnostics");
  assert.equal(tabs.parseProfileTab("contacts", teacher, true), "contacts");
  assert.equal(tabs.parseProfileTab("learning", teacher, true), "learning");
});

test("the card keeps money out of «Обучение» and shows the payments tab only when the server allowed it", () => {
  const view = read("src/components/students/student-profile-view.tsx");
  assert.match(view, /const paymentsVisible = !isTeacher && !DEMO_MODE && paymentsAvailable;/);
  assert.match(view, /visibleProfileTabs\(\{ isTeacher: Boolean\(isTeacher\), paymentsVisible \}\)/);
  assert.match(view, /activeTab === "payments" && paymentsVisible/);
  // contacts are visible to every role; the edit controls stay staff-only
  assert.match(view, /activeTab === "contacts" && \(/);
  assert.match(view, /\{!isTeacher && !editingNotes && \(/);
  assert.match(view, /router\.replace\(`\$\{pathname\}\?tab=\$\{tab\}`, \{ scroll: false \}\)/);
  assert.match(view, /overflow-x-auto/); // the tab bar scrolls on a phone
  assert.match(view, /<Suspense/);
  // a link to ?tab=payments waits for the summary instead of flashing «Обучение»
  assert.match(view, /requestedTab === "payments" && !isTeacher && !DEMO_MODE && !paymentsLoaded/);
  const learning = view.slice(view.indexOf('activeTab === "learning"'), view.indexOf("«Оплаты»: only for a role"));
  assert.doesNotMatch(learning, /MembershipPayments|StudentPaymentsBlock/);
  assert.match(read("src/components/students/student-payments-block.tsx"), /paymentsBasePath=\{paymentsBasePath\}/);
});

// ---- 6. receipts and cheques ----------------------------------------------------------------

test("receipt number, receipt and cheque rules of a history row", () => {
  const real = { receipt_no: 123, carried_from: null, voided_at: null };
  const carried = { receipt_no: null, carried_from: { payment_id: "p", group_name: "А" }, voided_at: null };
  assert.equal(P.receiptNumberLabel(real), "№ 123");
  for (const none of [carried, { ...real, receipt_no: null }, { ...real, receipt_no: 0 }, {}, null, undefined]) assert.equal(P.receiptNumberLabel(none), null);
  // a carry-over has neither a receipt nor a cheque
  assert.equal(P.hasReceipt(real), true);
  assert.equal(P.hasReceipt(carried), false);
  assert.equal(P.canAttachFile(real), true);
  assert.equal(P.canAttachFile(carried), false);
  assert.equal(P.canAttachFile({ ...real, voided_at: "2026-10-15T10:00:00" }), false); // the server answers 409 for it
  assert.equal(P.receiptHref("/owner/payments", "abc"), "/owner/payments/receipt/abc");
  assert.equal(P.receiptHref("/admin/payments/", "a b/c"), "/admin/payments/receipt/a%20b%2Fc");
});

test("a cheque: JPEG, PNG or PDF, up to 2 МБ, up to 3 per payment", () => {
  const file = (over) => ({ name: "cheque.png", type: "image/png", size: 100 * 1024, ...over });
  assert.deepEqual(P.checkPaymentFile(file(), 0), { ok: true });
  assert.deepEqual(P.checkPaymentFile(file({ type: "image/jpeg", name: "a.jpg" }), 2), { ok: true });
  assert.deepEqual(P.checkPaymentFile(file({ type: "application/pdf", name: "a.pdf", size: 2 * 1024 * 1024 }), 0), { ok: true }); // exactly 2 МБ
  assert.match(P.checkPaymentFile(file({ size: 2 * 1024 * 1024 + 1 }), 0).error, /2 МБ/);
  assert.match(P.checkPaymentFile(file(), 3).error, /не более 3 файлов/);
  for (const bad of [{ type: "image/gif", name: "a.gif" }, { type: "image/webp", name: "a.webp" }, { type: "image/heic", name: "a.heic" }, { type: "text/plain", name: "a.txt" }, { type: "", name: "a.exe" }]) {
    assert.match(P.checkPaymentFile(file(bad), 0).error, /Допустимы только/, JSON.stringify(bad));
  }
  assert.deepEqual(P.checkPaymentFile(file({ type: "", name: "scan.PDF" }), 0), { ok: true }); // some phones give no type
  assert.match(P.checkPaymentFile(file({ size: 0 }), 0).error, /пустой/);
  assert.equal(P.PAYMENT_FILE_ACCEPT, "image/jpeg,image/png,application/pdf");
});

test("the statement is the one history: receipt + cheque in the «⋯» menu of a payment, files with open and delete (IA audit F10)", () => {
  const statement = read("src/components/payments/statement-view.tsx");
  assert.match(statement, /label: "Квитанция"/);
  assert.match(statement, /const attach = cheques\.menuItem\(id\);\s*if \(attach\) items\.push\(attach\);/);
  assert.match(statement, /router\.push\(receiptHref\(paymentsBase, id\)\)/);
  // the existing actions stay in the same menu, with one wording (F11)
  assert.match(statement, /export const CORRECT_PAYMENT_LABEL = "Исправить оплату"/);
  assert.match(statement, /export const VOID_PAYMENT_LABEL = "Отменить оплату"/);
  const cheques = read("src/components/payments/payment-cheques.tsx");
  assert.match(cheques, /label: "Прикрепить чек"/);
  assert.match(cheques, /canAttachFile\(payment\)/);
  assert.match(cheques, /accept=\{PAYMENT_FILE_ACCEPT\}/);
  assert.match(cheques, /checkPaymentFile\(picked, payment\.files\?\.length \?\? 0\)/);
  assert.match(cheques, /Удалить файл\?/); // a confirmation before the delete
  assert.match(cheques, /window\.open\(""/); // the tab opens inside the click
  // the embedded history of the card is gone: nothing was lost, the actions moved
  const card = read("src/components/payments/membership-payments.tsx");
  assert.doesNotMatch(card, /История оплат|HistoryItem|Прикрепить чек/);
});

test("receipt pages exist for the owner and the administrator and share one component", () => {
  for (const role of ["owner", "admin"]) {
    const page = read(`src/app/${role}/payments/receipt/[id]/page.tsx`);
    assert.match(page, new RegExp(`<ReceiptView paymentsHref="/${role}/payments" />`), role);
  }
  const view = read("src/components/payments/receipt-view.tsx");
  assert.match(view, /window\.print\(\)/);
  assert.match(view, /Печать \/ Сохранить PDF/);
  assert.match(view, /RECEIPT_VOID_STAMP/);
  assert.match(view, /max-w-\[148mm\]/); // A5 width; centred on A4
  assert.match(view, /@page \{ margin: 12mm; \}/);
  // 403 / 404 / 409 are told in words
  assert.match(view, /receiptErrorText\(status/);
  assert.match(view, /noRight = summaryLoaded && !available/); // the same guard as the payments list
});

test("print hides the app chrome of both workspaces", () => {
  assert.match(read("src/components/layout/sidebar.tsx"), /select-none print:hidden/);
  assert.match(read("src/components/payments/payments-alert-banner.tsx"), /print:hidden/);
  for (const role of ["owner", "admin"]) {
    const layout = read(`src/app/${role}/layout.tsx`);
    assert.match(layout, /print:ml-0 print:p-0/, role);
    assert.match(layout, /print:bg-none/, role);
  }
  // the toolbar of the page is not printed
  assert.match(read("src/components/payments/receipt-view.tsx"), /print:hidden/);
});

test("receipt wording: title, replaced / replaces notes, errors", () => {
  assert.equal(P.receiptTitle(123), "Квитанция № 123");
  assert.equal(P.RECEIPT_VOID_STAMP, "АННУЛИРОВАНА");
  assert.equal(P.receiptReplacedNote({ replaced_by_receipt_no: 124 }), "заменена квитанцией № 124");
  assert.equal(P.receiptReplacedNote({ replaced_by_receipt_no: null }), null);
  assert.equal(P.receiptReplacesNote({ replaces_receipt_no: 120 }), "Исправление оплаты № 120");
  assert.equal(plain(P.receiptReplacesNote({ replaces_receipt_no: 120, replaces_amount: 450000 })), "Исправление оплаты № 120 (было 450 000 сум)");
  assert.equal(P.receiptReplacesNote({ replaces_receipt_no: null }), null);
  assert.match(P.receiptErrorText(403, "x"), /Нет доступа/);
  assert.match(P.receiptErrorText(404, "x"), /не найдена/);
  assert.equal(P.receiptErrorText(409, "Перенос оплаты — не денежная операция, квитанции нет"), "Перенос оплаты — не денежная операция, квитанции нет");
  assert.match(P.receiptErrorText(409, undefined), /квитанции нет/);
  assert.equal(P.receiptErrorText(500, "Сервис недоступен"), "Сервис недоступен");
  assert.equal(P.receiptErrorText(undefined, undefined), "Не удалось загрузить квитанцию");
});

test("API helpers follow the contract paths", () => {
  const api = read("src/lib/api.ts");
  assert.match(api, /\/auth\/org\/memberships\/\$\{encodePathId\(membershipId\)\}\/payments\/preview/);
  assert.match(api, /\/auth\/org\/payments\/\$\{encodePathId\(paymentId\)\}\/receipt/);
  assert.match(api, /\/auth\/org\/payments\/\$\{encodePathId\(paymentId\)\}\/files`/);
  assert.match(api, /\/files\/\$\{encodePathId\(fileId\)\}`/);
  assert.doesNotMatch(api, /payments\/quote/); // the period quote is gone: the server distributes the money
  // a delete does not need a JSON body in the answer
  assert.match(api, /async function deleteAuthed/);
});

test("the printed receipt: sheet text, void stamp with reason, replaced / replaces notes", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { ReceiptSheet } = require(path.join(root, "src/components/payments/receipt-view.tsx"));
  const base = {
    receipt_no: 12, org_name: "Школа Алго", org_city: "Ташкент", org_phone: "+998 71 200 00 00", student_name: "Дилноза Каримова",
    display_id: "A-0012", group_name: "Алгебра 8А", amount: 250000, amount_words: "Двести пятьдесят тысяч сум", currency: "UZS",
    paid_on: "2026-10-15", valid_from: "2026-10-15", valid_to: "2026-10-31", lessons_count: null, partial_period: true, note: null,
    accepted_by_name: "Арслан Владелец", created_at: null, voided_at: null, void_reason: null, replaced_by_receipt_no: null, replaces_receipt_no: null,
  };
  const text = (receipt) => plain(renderToStaticMarkup(React.createElement(ReceiptSheet, { receipt })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  const live = text(base);
  for (const part of ["Школа Алго", "Ташкент", "Квитанция № 12", "от 15.10.2026", "Дилноза Каримова", "ID A-0012", "Алгебра 8А",
    "15.10.2026 — 31.10.2026", "неполный месяц", "250 000 сум", "Двести пятьдесят тысяч сум", "Принял", "Арслан Владелец", "Подпись"]) {
    assert.ok(live.includes(part), part);
  }
  assert.doesNotMatch(live, /АННУЛИРОВАНА|заменена|заменяет/i);
  const voided = text({ ...base, voided_at: "2026-10-16T05:00:00", void_reason: "Ошибка в сумме", replaced_by_receipt_no: 13, replaces_receipt_no: 11, partial_period: false, lessons_count: 8 });
  assert.ok(voided.includes("АННУЛИРОВАНА"));
  assert.ok(voided.includes("Ошибка в сумме"));
  assert.ok(voided.includes("Заменена квитанцией № 13"));
  assert.ok(voided.includes("Исправление оплаты № 11"));
  assert.ok(voided.includes("8 уроков с 15.10.2026"));
  assert.doesNotMatch(voided, /неполный месяц/);
});

// ---- R3 follow-ups -----------------------------------------------------------------------------

test("«Оплаты» validates and sends only the fields its card shows", () => {
  const ok = { ...P.DEFAULT_PAYMENT_SETTINGS };
  assert.deepEqual(P.paymentsScopeKeys("payment_date"), ["period_mode", "billing_anchor", "admin_can_manage", "accounting_start_date", "expiring_days"]);
  assert.deepEqual(P.paymentsScopeKeys("fixed_day"), ["period_mode", "billing_anchor", "admin_can_manage", "accounting_start_date", "billing_day", "expiring_days"]);
  assert.deepEqual(P.paymentsScopeKeys("lessons"), ["period_mode", "billing_anchor", "admin_can_manage", "accounting_start_date", "lessons_per_payment", "expiring_lessons"]);
  const junk = { lessons_per_payment: NaN, expiring_lessons: 99, expiring_days: NaN, billing_day: 40 };
  // a calendar card: the package fields and the day are hidden, a leftover in them does not block
  assert.equal(P.validatePaymentSettings({ ...ok, ...junk, expiring_days: 3, period_mode: "calendar", billing_anchor: "payment_date" }, "payments"), null);
  assert.match(P.validatePaymentSettings({ ...ok, ...junk, period_mode: "calendar", billing_anchor: "payment_date" }, "payments"), /в днях/);
  // fixed day: the day counts
  assert.match(P.validatePaymentSettings({ ...ok, ...junk, expiring_days: 3, period_mode: "calendar", billing_anchor: "fixed_day" }, "payments"), /Единый день оплаты/);
  assert.equal(P.validatePaymentSettings({ ...ok, ...junk, expiring_days: 3, billing_day: 10, period_mode: "calendar", billing_anchor: "fixed_day" }, "payments"), null);
  // a package: the days are hidden
  assert.equal(P.validatePaymentSettings({ ...ok, ...junk, lessons_per_payment: 12, expiring_lessons: 3, period_mode: "lessons" }, "payments"), null);
  assert.match(P.validatePaymentSettings({ ...ok, ...junk, period_mode: "lessons" }, "payments"), /Число уроков/);
  // without a scope everything is still checked (older callers)
  assert.match(P.validatePaymentSettings({ ...ok, lessons_per_payment: 0 }), /Число уроков/);
  // the diff for a calendar card ignores a changed hidden field
  const after = { ...ok, lessons_per_payment: NaN, expiring_lessons: 9, expiring_days: 5 };
  assert.deepEqual(P.diffPaymentSettings(ok, after, P.paymentsScopeKeys("payment_date")), { expiring_days: 5 });
  const page = read("src/app/owner/settings/page.tsx");
  assert.match(page, /paymentsScopeKeys\(paymentModelOf\(form\)\)/);
});

test("«Назад» of the receipt: back only inside the app, otherwise the payments page", () => {
  const here = "http://localhost:3000";
  // no history (a link opened in a new tab)
  assert.equal(nav.canGoBack({ historyLength: 1, referrer: here + "/owner/students/1", origin: here, cameFromApp: true }), false);
  assert.equal(nav.canGoBack({ historyLength: 0, referrer: "", origin: here, cameFromApp: false }), false);
  // history, but the previous page is not ours (a pasted link): no mark, no same-origin referrer
  assert.equal(nav.canGoBack({ historyLength: 5, referrer: "", origin: here, cameFromApp: false }), false);
  assert.equal(nav.canGoBack({ historyLength: 5, referrer: "https://t.me/x", origin: here, cameFromApp: false }), false);
  assert.equal(nav.canGoBack({ historyLength: 5, referrer: "http://localhost:30001/x", origin: here, cameFromApp: false }), false); // not the same origin
  // came from the app: a same-origin referrer, or the mark of the history row that opened the receipt
  assert.equal(nav.canGoBack({ historyLength: 2, referrer: here + "/owner/payments", origin: here, cameFromApp: false }), true);
  assert.equal(nav.canGoBack({ historyLength: 3, referrer: "", origin: here, cameFromApp: true }), true);
  // the mark belongs to one payment and is cleared after use
  const store = new Map();
  const fake = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  nav.markReceiptNavigation("p1", fake);
  assert.equal(nav.receiptNavigationMarked("p1", fake), true);
  assert.equal(nav.receiptNavigationMarked("p2", fake), false);
  nav.clearReceiptNavigationMark(fake);
  assert.equal(nav.receiptNavigationMarked("p1", fake), false);
  // blocked storage never throws
  const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
  assert.doesNotThrow(() => { nav.markReceiptNavigation("p", broken); nav.clearReceiptNavigationMark(broken); });
  assert.equal(nav.receiptNavigationMarked("p", broken), false);
  const view = read("src/components/payments/receipt-view.tsx");
  assert.match(view, /if \(inApp\) router\.back\(\);\s*else router\.push\(paymentsHref\);/);
  assert.match(read("src/components/payments/statement-view.tsx"), /markReceiptNavigation\(id\); router\.push\(receiptHref/);
});

test("cheque uploads run one at a time and count files from the latest history", () => {
  const history = read("src/components/payments/payment-cheques.tsx");
  assert.match(history, /uploadBusy\.current/);
  assert.match(history, /paymentsNow\.current\[paymentId\]/);
  assert.match(history, /uploadingId !== null\) return \{ key: "attach", label: "Идёт загрузка файла…"/);
  assert.match(history, /uploadBusy\.current = false;/);
});

test("a settings form is refilled from the store only when it has no unsaved typing", () => {
  const record = { first_name: "Арслан", last_name: "Т", language: "ru" };
  // untouched (equals what it was filled from): takes the new record
  assert.deepEqual(sections.reconcileDraft(record, record, { ...record, last_name: "Новый" }), { ...record, last_name: "Новый" });
  // typed: kept, even though the store changed (session sync on tab focus)
  const typed = { ...record, first_name: "Арсл" };
  assert.equal(sections.reconcileDraft(typed, record, { ...record, last_name: "Новый" }), typed);
  // the first fill
  assert.deepEqual(sections.reconcileDraft({ first_name: "", last_name: "", language: "ru" }, null, record), record);
  const page = read("src/app/owner/settings/page.tsx");
  assert.match(page, /setOrgForm\(\(draft\) => reconcileDraft\(draft, base, next\)\)/);
  assert.match(page, /setProfileForm\(\(draft\) => reconcileDraft\(draft, base, next\)\)/);
  // one store record per effect: saving the organisation does not refill the profile form
  assert.match(page, /\}, \[org\]\);/);
  assert.match(page, /\}, \[user\]\);/);
  assert.doesNotMatch(page, /\[org, user\]/);
});

test("#72: the month label capitalises only its first letter («г.» stays lower case); settings hint wording", () => {
  const bt = require(path.join(root, "src/lib/business-time.ts"));
  assert.equal(plain(bt.capitalizeFirst(bt.monthYearLabelRu("2026-10"))), "Октябрь 2026 г.");
  assert.equal(plain(bt.monthYearLabelRu("2026-03")), "март 2026 г.");
  assert.equal(bt.capitalizeFirst("понедельник, 15 окт."), "Понедельник, 15 окт.");
  assert.equal(bt.capitalizeFirst("ёлка"), "Ёлка");
  assert.equal(bt.capitalizeFirst(""), "");
  const card = read("src/components/students/student-profile-view.tsx");
  assert.match(card, /capitalizeFirst\(monthYearLabelRu\(attendanceMonth\)\)/);
  assert.doesNotMatch(card, /capitalize text-slate-700/);          // the CSS class would turn «г.» into «Г.»
  assert.doesNotMatch(read("src/app/teacher/schedule/page.tsx"), /font-bold capitalize/);
  const settings = read("src/app/owner/settings/page.tsx");
  assert.match(settings, /Каждое правило действует для учеников со своим способом оплаты: по месяцам или пакетом уроков\./);
  assert.doesNotMatch(settings, /Видны оба правила/);
});
