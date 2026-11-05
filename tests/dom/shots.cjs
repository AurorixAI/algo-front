// R3 (unconfirmed 4): `node tests/dom/shots.cjs <out dir> [css file]` - PNGs of the windows of the round at 1280 and 375, by the REAL components in the REAL Modal, with checks: no horizontal scroll of the page, no
// control of a window outside the screen, no window wider than the screen.  The same stub of the server as the DOM tests; the tailwind CSS of the project is the second argument.
const fs = require("node:fs");
const path = require("node:path");
const out = process.argv[2];
if (process.argv[3]) process.env.DOM_CSS = process.argv[3];
const { launch, openPage } = require("../helpers/dom-page.cjs");
const { fixture, OWNER_EFFECTS, EMPTY_EFFECTS } = require("../helpers/dom-answers.cjs");

const isDry = (call) => /dry_run=true/.test(call.query);
let currentEffects = null;      // a shot may set the block of money the server answers (the payment of the walk: a CLOSED month, two teachers)
const PAUSE_LOCKED = { code: "PAUSE_LOCKED", message: "Месяц октябрь 2026 у преподавателя Каримова К. закрыт: ведомость сохранена 03.11.2026. Чтобы исправить, владелец переоткрывает месяц.", month: "2026-10", teacherId: "t1", teacherName: "Каримова К.", closedOn: "2026-11-03" };
const STUDENT = { id: "st1", first_name: "Иван", last_name: "Иванов", full_name: "Иванов Иван", class_level: 7, status: "active", group_id: "g1", current_group_id: "g1", groups_count: 1 };
const DAYS_OFF = [{ id: "d1", dateFrom: "2026-11-23", dateTo: "2026-11-23", reason: "Праздник", createdAt: "2026-11-01T10:00:00", createdByName: "Арслан", voidedAt: null, active: true }];
const ROW = { membership_id: "m1", student_id: "st1", student_name: "Иванов Иван", group_id: "g1", group_name: "7-А Алгебра", is_primary: true, is_active: true, status: "ok", debt: 350000, refundable: 344000 };
const MEMBERSHIP = { membership_id: "m1", group_id: "g1", student_name: "Иванов Иван", group_name: "7-А Алгебра" };

const server = (request) => {
  const { method, path: p } = request;
  if (method === "GET" && p === "/auth/org/memberships/m1/pauses") return { json: [] };
  if (method === "POST" && p === "/auth/org/memberships/m1/pauses" && isDry(request)) return { status: 422, json: { detail: PAUSE_LOCKED } };
  if (method === "GET" && p === "/auth/org/payroll-periods" && !/2026-11/.test(request.query)) return { json: { month: "2026-10", items: [{ teacherId: "t1", teacherName: "Каримова К.", month: "2026-10", state: "closed", closedOn: "2026-11-03", sheetId: "s1", sheetRevision: 3, reopened: null }] } };
  if (method === "GET" && p === "/auth/org/groups") return { json: [{ id: "g1", name: "7-А Алгебра" }, { id: "g2", name: "7-Б Геометрия" }] };
  if (method === "GET" && p === "/auth/org/students") return { json: { items: [STUDENT], total: 1 } };
  if (method === "POST" && p === "/auth/org/groups/g2/students/bulk" && isDry(request)) return { json: { group_id: "g2", dry_run: true, added: 1, skipped: 0, carried: [{ code: "PAYMENT_CARRIED", message: "Оплата 300 000 сум перенесётся в новую группу" }, { code: "DEBT_CARRIED", message: "Долг 50 000 сум перенесётся вместе с учеником" }], money_effects: { ...OWNER_EFFECTS, students: [{ studentId: "st1", name: "Иванов Иван", delta: 1 }] } } };
  if (method === "GET" && p === "/auth/org/days-off") return { json: DAYS_OFF };
  if (method === "POST" && p === "/auth/org/days-off/preview") return { json: { dateFrom: "2026-11-23", dateTo: "2026-11-23", cancellable: [{ lessonId: "l1", groupId: "g1", groupName: "7-А Алгебра", date: "2026-11-23", startTime: "16:00", endTime: "17:00" }], blocked: [], alreadyCancelled: 0, groups: 1, text: "Будет отменён 1 урок в 1 группе" } };
  if (method === "POST" && p === "/auth/org/memberships/m1/payments" && isDry(request)) return { json: { ...fixture("e1_create_300000"), dry_run: true, money_effects: currentEffects ?? OWNER_EFFECTS } };
  if (method === "GET" && p === "/auth/org/memberships/m1/payments/preview") return { json: fixture(/amount=250000/.test(request.query) ? "e1_preview_250000" : "e1_preview_300000") };
  if (method === "POST" && p === "/auth/org/payments/p1/void" && isDry(request)) return { json: { ...fixture("e1_void_300000"), money_effects: OWNER_EFFECTS } };
  if (method === "POST" && p === "/auth/org/memberships/m1/writeoffs" && isDry(request)) return { json: { ...fixture("e6_writeoff_40000"), money_effects: EMPTY_EFFECTS } };
  if (method === "POST" && p === "/auth/org/groups/g1/lessons/restore") return { json: { ok: true, restored: false, dryRun: true, returnedToReview: true, moneyEffects: OWNER_EFFECTS, deductions: [{ studentId: "s1", name: "Иванов Иван", amount: 46000 }, { studentId: "s2", name: "Петрова Мария", amount: 46000 }, { studentId: "s3", name: "Сидоров Пётр", amount: 46000 }] } };
  if (method === "POST" && p === "/auth/org/one-off-lessons/l1/money-decision" && isDry(request)) return { json: { lessonId: "l1", money: "paid", month: "2026-11", dryRun: true, payrollSheet: { month: "2026-11", status: "unpaid" }, moneyEffects: { students: [], dryRun: true, text: "", payroll: [{ month: "2026-11", state: "open", sheetId: "sh1", teacherId: "t1", teacherName: "Каримова К.", savedTotal: 0, paid: 0, freshBefore: 0, freshAfter: 125000, freshTotal: 125000, changedBy: 125000, driftAfter: 125000 }] } } };
  if (method === "POST" && p === "/auth/org/one-off-lessons/l9/money-decision") return { status: 409, json: { detail: { code: "PERIOD_CLOSED", message: "Месяц ноябрь 2026 у преподавателя Каримова К. закрыт: ведомость сохранена 02.11.2026. Чтобы изменить урок, владелец или администратор с правом оплат сначала переоткрывает месяц", month: "2026-11", teacherId: "t1", teacherName: "Каримова К.", closedOn: "2026-11-02" } } };
  if (method === "GET" && p === "/auth/org/one-off-decisions/decided") return { json: { total: 2, items: [
    { lessonId: "l7", groupId: "g1", groupName: "7-А Алгебра", lessonDate: "2026-11-03", startTime: "16:00", endTime: "17:00", purpose: "extra", title: "…", teacher: { id: "t1", name: "Каримова К." }, createdBy: null, studentsPresent: 2, studentsTotal: 3, payrollSheet: null, money: "paid", decidedAt: "2026-11-04T09:30:00", decidedBy: { id: "o1", name: "Арслан", role: "owner" }, canUndo: true, periodClosed: false }] } };
  if (method === "POST" && p === "/auth/org/one-off-lessons/l7/money-decision" && isDry(request)) return { json: { lessonId: "l7", money: "wait", dryRun: true, payrollSheet: null, moneyEffects: { students: [], dryRun: true, text: "", payroll: [{ month: "2026-11", state: "open", sheetId: "sh1", teacherId: "t1", teacherName: "Каримова К.", savedTotal: 125000, paid: 0, freshBefore: 125000, freshAfter: 0, freshTotal: 0, changedBy: -125000, driftAfter: -125000 }] } } };
  // R2-2а: the sheet page of a month that is open and moved after the saving (saved 120 834, accrued now 75 834)
  if (method === "GET" && p === "/auth/org/payroll/sheets/s1") return { json: { id: "s1", saved: true, month: "2026-11", period_start: "2026-11-01", period_end: "2026-11-30", month_open: true, teacher_id: "t1", teacher_name: "Эргашев К.", revision: 2,
    percents: { group: "50" }, divisor_default: 12, lines: [], groups: [], total_amount: 120834, counted_total: 7, unpaid_total: 1, pending_excused_total: 0, undecided_total: 3, warnings: { open_lessons: null, pending_excused: 0, no_fee: 0, unpaid: 1, unpaid_students: 1 }, written_off_total: 0,
    payout: { saved_total: 120834, fresh_total: 75834, target: 75834, paid: 150000, balance: -74166, state: "overpaid", basis: "fresh", changed_by: -45000, change_text: null, text: "x", items: [], carry_in: 0, carry_used: 0, advance_out: 0 },
    source_fingerprint: "fp", stale: true, note: null, created_by_name: "Арслан", created_at: "2026-11-05T05:00:00", updated_by_name: "Рустам Валиев", updated_at: "2026-11-05T05:00:00" } };
  if (method === "GET" && p === "/auth/org/payroll/sheets/s1/diff") return { json: { sheet_id: "s1", revision: 2, stale: true, source_fingerprint: "fp2", saved_total: 120834, fresh_total: 75834, delta_amount: -45000, reasons: [], rate_changes: [], lines: [] } };
  if (method === "GET" && p === "/auth/org/payroll-periods") return { json: { month: "2026-11", items: [{ teacherId: "t1", teacherName: "Эргашев К.", month: "2026-11", state: "open", closedOn: null, sheetId: "s1", sheetRevision: 2, reopened: null }] } };
  if (method === "GET" && p === "/auth/org/payroll/months/2026-11") return { json: { month: "2026-11", period_start: "2026-11-01", period_end: "2026-11-30", month_open: true, divisor: 12, lessons_without_teacher: 0, teachers: [{ teacher_id: "t1", teacher_name: "Эргашев К.", lessons_count: 12, lesson_types: [], rates: { group: "50" }, missing_rates: [], sheet: null, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 } }] } };
  if (method === "GET" && p === "/auth/org/payroll/rates") return { json: { month: "2026-11", items: [] } };
  if (method === "POST" && p === "/auth/org/one-off-lessons/l1/money-decision" && !isDry(request)) return { json: { lessonId: "l1", money: "paid", month: "2026-11", dryRun: false, payrollSheet: { month: "2026-11", status: "unpaid" }, moneyEffects: { students: [], dryRun: false, text: "", payroll: [{ month: "2026-11", state: "open", sheetId: "sh1", teacherId: "t1", teacherName: "Каримова К.", savedTotal: 0, paid: 0, freshBefore: 0, freshAfter: 125000, freshTotal: 125000, changedBy: 125000, driftAfter: 125000 }] } } };
  if (method === "GET" && /^\/auth\/org\/groups\/g1\/attendance$/.test(p)) {
    const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() + 5 * 3600000 - 86400000).toISOString().slice(0, 10);
    const lessons = [{ id: "a", instanceKey: `${yesterday}_a`, date: yesterday, startTime: "10:00", endTime: "11:00", status: "cancelled" }, { id: "b", instanceKey: `${today}_b`, date: today, startTime: "00:00", endTime: "00:30", status: "cancelled" }];
    return { json: { groupId: "g1", lessons, records: {}, statuses: Object.fromEntries(lessons.map((item) => [item.instanceKey, "cancelled"])), cancellationKinds: Object.fromEntries(lessons.map((item) => [item.instanceKey, "centre"])), cancellationReasons: {}, versions: {}, excuses: {}, corrections: {}, lessonTeachers: {}, rosterStudentIds: {} } };
  }
  return null;
};

// every window of the round: the scenario, what to do after it is mounted, and the name of the picture
const SHOTS = [
  { name: "01-till", entry: "money.entry.tsx", mount: "till", user: undefined, act: async (page) => {
    await page.waitForTimeout(600);
    await page.fill("#payment-amount", "300000");
    await page.click('[data-testid="payment-methods"] >> text=Наличные');
    await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  } },
  { name: "02-pause-closed", entry: "shots.entry.tsx", mount: "pause", act: async (page) => {
    await page.waitForSelector("#pause-last");
    const today = await page.evaluate(() => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10));
    const last = new Date(Date.parse(today) + 3 * 86400000).toISOString().slice(0, 10);
    await page.fill("#pause-last", `${last.slice(8, 10)}${last.slice(5, 7)}${last.slice(0, 4)}`);
    await page.waitForSelector('[data-testid="period-closed-reopen"]');
  } },
  { name: "03-pause-reopen-nested", entry: "shots.entry.tsx", mount: "pause", act: async (page) => {
    await page.waitForSelector("#pause-last");
    const today = await page.evaluate(() => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10));
    const last = new Date(Date.parse(today) + 3 * 86400000).toISOString().slice(0, 10);
    await page.fill("#pause-last", `${last.slice(8, 10)}${last.slice(5, 7)}${last.slice(0, 4)}`);
    await page.click('[data-testid="period-closed-reopen"]');
    await page.fill("#reopen-month-reason", "ошибочно отметили урок");
    await page.waitForSelector('[data-testid="reopen-submit"]:not([disabled])');
  } },
  { name: "04-add-student-owner-transfer", entry: "shots.entry.tsx", mount: "addStudent", act: async (page) => {
    await page.fill('input[placeholder^="Поиск по имени"]', "Ив");
    await page.click('button:has-text("Иванов Иван")');
    await page.waitForSelector('[data-testid="transfer-carried"]');
  } },
  { name: "05-add-student-admin-no-right", entry: "shots.entry.tsx", mount: "addStudent", user: { role: "admin", org_role: "admin", payments_access: false }, act: async (page) => {
    await page.fill('input[placeholder^="Поиск по имени"]', "Ив");
    await page.click('button:has-text("Иванов Иван")');
    await page.waitForSelector('[data-testid="enrol-second-group"]');
  } },
  { name: "06-days-off-owner", entry: "shots.entry.tsx", mount: "daysOff", act: async (page) => { await page.waitForSelector('[data-testid="day-off-new"]'); } },
  { name: "07-days-off-admin-no-right", entry: "shots.entry.tsx", mount: "daysOff", user: { role: "admin", org_role: "admin", payments_access: false }, act: async (page) => { await page.waitForSelector('[data-testid="day-off-no-right"]'); } },
  { name: "08-day-off-dialog", entry: "shots.entry.tsx", mount: "dayOffDialog", act: async (page) => {
    await page.waitForTimeout(500);
    const field = page.locator('input[placeholder="дд.мм.гггг"]').nth(1);
    await field.fill("23112026");
    await page.waitForTimeout(800);
  } },
  { name: "09-void-payment", entry: "money.entry.tsx", mount: "voidPayment", act: async (page) => { await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]'); await page.fill("#record-void-reason", "оплата внесена по ошибке"); } },
  { name: "10-writeoff", entry: "money.entry.tsx", mount: "writeoff", act: async (page) => { await page.waitForTimeout(500); await page.fill("#writeoff-reason", "болезнь, договорились с родителем"); await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]'); } },
  { name: "11-return-to-review", entry: "money.entry.tsx", mount: "review", act: async (page) => { await page.waitForSelector('[data-testid="return-review-deductions"]'); await page.fill("#return-review-reason", "нажали «Урока не было» по ошибке"); } },
  { name: "12-open-lessons-question", entry: "shots.entry.tsx", mount: "openLessonsQuestion", act: async (page) => { await page.waitForSelector('[role="dialog"]'); } },
  { name: "13-payout-open-month", entry: "shots.entry.tsx", mount: "payoutBlock", act: async (page) => { await page.waitForSelector('[data-testid="sheet-payout"]'); } },
  { name: "14-payout-dialog-open-month", entry: "shots.entry.tsx", mount: "payoutDialog", act: async (page) => { await page.waitForSelector('[role="dialog"]'); await page.waitForTimeout(300); } },
  { name: "16-sheet-open-overpaid", entry: "shots.entry.tsx", mount: "sheetOpenOverpaid", act: async (page) => { await page.waitForSelector('[data-testid="sheet-payout"]'); } },
  { name: "17-sheet-closed-overpaid", entry: "shots.entry.tsx", mount: "sheetClosedOverpaid", act: async (page) => { await page.waitForSelector('[data-testid="sheet-payout"]'); } },
  { name: "18-sheet-closed-part", entry: "shots.entry.tsx", mount: "sheetClosedPart", act: async (page) => { await page.waitForSelector('[data-testid="sheet-payout"]'); } },
  { name: "19-decision-pay", entry: "shots.entry.tsx", mount: "queue", act: async (page) => { await page.click('button[aria-label^="Оплатить: 7-А"]'); await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]'); } },
  { name: "20-decision-queue-closed-month", entry: "shots.entry.tsx", mount: "queue", act: async (page) => { await page.waitForSelector('[data-testid="period-closed"]'); } },
  { name: "21-decision-closed-in-window", entry: "shots.entry.tsx", mount: "queueClosedInWindow", act: async (page) => { await page.click('button[aria-label^="Оплатить: 7-А"]'); await page.waitForSelector('[data-testid="period-closed"]'); } },
  { name: "22-undo-decision", entry: "money.entry.tsx", mount: "decided", act: async (page) => { await page.click('[data-testid="decided-undo"]'); await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]'); } },
  { name: "23-month-list-open", entry: "shots.entry.tsx", mount: "monthList", act: async (page) => { await page.waitForSelector('[data-testid="payroll-month-summary"]'); } },
  { name: "24-till-partial", entry: "money.entry.tsx", mount: "till", user: undefined, act: async (page) => {
    await page.waitForTimeout(600);
    await page.fill("#payment-amount", "250000");
    await page.click('[data-testid="payment-methods"] >> text=Наличные');
    await page.waitForSelector('[data-testid="payment-plan-sentence"]');
    await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]');
  } },
  { name: "25-sheet-reopened-no-changes", entry: "shots.entry.tsx", mount: "sheetReopened", act: async (page) => { await page.waitForSelector('[data-testid="sheet-payout"]'); } },
  { name: "26-sheet-saved-table-note", entry: "money.entry.tsx", mount: "sheetPage", act: async (page) => { await page.waitForSelector('[data-testid="saved-table-note"]'); } },
  { name: "27-decision-toast", entry: "money.entry.tsx", mount: "decisionsToast", props: { items: [{ lessonId: "l1", groupId: "g1", groupName: "7-А Алгебра", lessonDate: "2026-11-03", startTime: "16:00", endTime: "17:00", purpose: "extra", title: "Дополнительный урок — оплатить преподавателю?", teacher: { id: "t1", name: "Каримова К." }, createdBy: { id: "o1", name: "Арслан", role: "owner" }, studentsPresent: 2, studentsTotal: 3, studentsPaid: 3, moneyEstimate: { amount: 125000, reason: null }, payrollSheet: { month: "2026-11", status: "unpaid" }, periodClosed: false }] }, act: async (page) => {
    await page.click('button[aria-label^="Оплатить: 7-А"]'); await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]'); await page.click('[data-testid="one-off-decision-confirm"]'); await page.waitForSelector('[role="status"]');
  } },
  { name: "28-journal-return-review-today", entry: "money.entry.tsx", mount: "journal", props: { students: [{ id: "st1", first_name: "Иван", last_name: "Иванов", full_name: "Иванов Иван", class_level: 7, status: "active", group_id: "g1", current_group_id: "g1", groups_count: 1 }] }, act: async (page) => {
    await page.waitForSelector("table"); const today = await page.evaluate(() => { const d = new Date(Date.now() + 5 * 3600000); return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`; });
    await page.locator(`button[aria-label="Действия с уроком ${today}"]`).first().click(); await page.waitForSelector('[data-testid="menu-return-review"]');
  } },
  { name: "29-month-list", entry: "money.entry.tsx", mount: "monthRows", sizes: [[1280, 900], [1024, 900], [375, 812]], props: { teachers: [
    { teacher_id: "t1", teacher_name: "Камол Эргашев", lessons_count: 4, lesson_types: [], rates: { group: "50", individual: "60" }, missing_rates: [], undecided_lessons: 1,
      sheet: { id: "s1", revision: 2, total_amount: 120834, stale: true, updated_at: "2026-11-05T05:00:00" }, warnings: { open_lessons: 1, pending_excused: 0, no_fee: 0, unpaid: 8, unpaid_students: 1 },
      payout: { saved_total: 120834, fresh_total: 75834, target: 75834, paid: 150000, balance: -74166, state: "overpaid", basis: "fresh", changed_by: -45000, change_text: null, text: "x", items: [], carry_in: 0, carry_used: 0, advance_out: 0 }, __period: { state: "open", closedOn: null, reopened: null } },
    { teacher_id: "t2", teacher_name: "Лола Мирзаева", lessons_count: 0, lesson_types: [], rates: { group: "50" }, missing_rates: [], sheet: null, warnings: { open_lessons: 1, pending_excused: 0, no_fee: 0, unpaid: 0 }, payout: null, __period: null },
    { teacher_id: "t3", teacher_name: "Назарова Сабина", lessons_count: 9, lesson_types: [], rates: { group: "50", pair: "45" }, missing_rates: [], sheet: { id: "s3", revision: 1, total_amount: 860000, stale: false, updated_at: "2026-11-05T05:00:00" }, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 },
      payout: { saved_total: 860000, fresh_total: 860000, target: 860000, paid: 0, balance: 860000, state: "unpaid", basis: "saved", changed_by: 0, change_text: null, text: "x", items: [], carry_in: 0, carry_used: 0, advance_out: 0 }, __period: { state: "closed", closedOn: "2026-11-05", reopened: null } },
  ] }, act: async (page) => { await page.waitForSelector('[data-testid="teacher-attention"]'); } },
  { name: "30-till-closed-month-two-teachers", entry: "money.entry.tsx", mount: "till", user: undefined, sizes: [[1280, 900], [1024, 900], [375, 812]],
    effects: { students: [], dryRun: true, text: "", payroll: [
      { month: "2026-09", state: "closed", sheetId: "s1", teacherId: "t1", teacherName: "Эргашев К.", savedTotal: 860000, paid: 0, freshBefore: 860000, freshAfter: 993333, freshTotal: 993333, changedBy: 133333, driftAfter: 133333 },
      { month: "2026-09", state: "closed", sheetId: "s2", teacherId: "t2", teacherName: "Мирзаева Л.", savedTotal: 36666, paid: 0, freshBefore: 36666, freshAfter: 49999, freshTotal: 49999, changedBy: 13333, driftAfter: 13333 }] },
    act: async (page) => { await page.waitForTimeout(600); await page.fill("#payment-amount", "300000"); await page.click('[data-testid="payment-methods"] >> text=Наличные'); await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]'); } },
  { name: "31-till-open-month-and-admin", entry: "money.entry.tsx", mount: "till", user: { role: "admin", org_role: "admin", payments_access: true },
    effects: { students: [], dryRun: true, text: "", payroll: [{ month: "2026-09", state: "closed" }, { month: "2026-09", state: "closed" }] },
    act: async (page) => { await page.waitForTimeout(600); await page.fill("#payment-amount", "300000"); await page.click('[data-testid="payment-methods"] >> text=Наличные'); await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]'); } },
  { name: "15-sheet-restore", entry: "money.entry.tsx", mount: "sheet", act: async (page) => { await page.click('[data-testid="sheet-restore"]'); await page.fill("#sheet-reason", "центр работает, выходной отменили"); await page.waitForSelector('[data-testid="return-review-deductions"]'); } },
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await launch();
  const report = [];
  const only = process.env.SHOTS ? process.env.SHOTS.split(",") : null; // SHOTS=16,17 - only the pictures whose name starts with one of these
  for (const shot of SHOTS.filter((item) => !only || only.some((prefix) => item.name.startsWith(prefix)))) {
    for (const [width, height] of shot.sizes ?? [[1280, 900], [375, 812]]) {
      currentEffects = shot.effects ?? null;
      const { page, errors } = await openPage(browser, shot.entry, server, { width, height });
      await page.evaluate(([fn, name, user, props]) => (fn === "mountShot" ? window.mountShot(name, user) : window.mount(name, user, props)), [shot.entry === "shots.entry.tsx" ? "mountShot" : "mount", shot.mount, shot.user ?? { role: "owner", org_role: "owner" }, shot.props ?? {}]);
      try { await shot.act(page); } catch (error) { report.push(`${shot.name} ${width}: ACT FAILED ${String(error).split("\n")[0]}`); }
      await page.waitForTimeout(500);
      const metrics = await page.evaluate(() => {
        const vw = window.innerWidth;
        const dialog = document.querySelector('[role="dialog"]');
        const box = dialog ? dialog.getBoundingClientRect() : null;
        const controls = [...document.querySelectorAll('[role="dialog"] button, [role="dialog"] a, [role="dialog"] input, [role="dialog"] textarea')].filter((el) => el.getBoundingClientRect().width > 0)
          .filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; }).map((el) => (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30));
        const cut = dialog ? [...dialog.querySelectorAll("button")].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim().slice(0, 30)) : [];
        return { scrollX: document.documentElement.scrollWidth - vw, dialogWider: box ? Math.round(box.right - vw) : null, outside: controls, truncated: cut };
      });
      const file = path.join(out, `${shot.name}-${width}.png`);
      await page.screenshot({ path: file });
      report.push(`${shot.name} ${width}: pageScroll=${metrics.scrollX} dialogOverflow=${metrics.dialogWider} controlsOutside=${JSON.stringify(metrics.outside)} buttonsCut=${JSON.stringify(metrics.truncated)}${errors.filter((e) => !/404|Failed to load/.test(e)).length ? ` errors=${errors.length}` : ""}`);
      await page.close();
    }
  }
  await browser.close();
  console.log(report.join("\n"));
})();
