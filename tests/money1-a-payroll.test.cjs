// «Деньги-1», пакет А (front), part 2 - the owner's payroll (item 1): the state of the month and «Переоткрыть месяц», «изменилось на ±N — Пересохранить», the payout by the saved total,
// the unfinished lessons of the month at the saving («не удалось проверить» instead of 0).  Contract: MONEY1_A_SERVER_REPORT.md; fixtures logicA/A21, A24, A25 (the server's).
const assert = require("node:assert/strict");
const test = require("node:test");
const env = require("./helpers/money1-env.cjs");
const { React, html, textOf, lib, component, read, named, signIn, plain } = env;
const path = require("node:path");
const R = lib("payroll.ts");
const Y = lib("payroll-logica.ts");
const CP = lib("closed-period.ts");
const OL = lib("payroll-open-lessons.ts");

const sheet = (extra = {}) => ({
  id: "s1", saved: true, month: "2026-10", period_start: "2026-10-01", period_end: "2026-10-31", month_open: false, teacher_id: "t1", teacher_name: "Каримова К.", revision: 2,
  percents: { group: "50" }, divisor_default: 12, lines: [], groups: [], total_amount: 475000, counted_total: 38, unpaid_total: 0, pending_excused_total: 0,
  warnings: { open_lessons: null, pending_excused: 0, no_fee: 0, unpaid: 0 }, source_fingerprint: "f", stale: false, note: null,
  created_by_name: null, created_at: null, updated_by_name: "Арслан", updated_at: "2026-11-03T05:00:00", ...extra,
});

// ── warnings: «не удалось проверить», never 0 ────────────────────────────────────────────────────

test("the month overview: a failed check says «Не удалось проверить незакрытые уроки», never «0»; a count is a count; null of a SAVED sheet is «not looked up» and says nothing", () => {
  const base = { pending_excused: 0, no_fee: 0, unpaid: 0 };
  const unknown = R.warningViews({ ...base, open_lessons: null, open_lessons_unknown: true });
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].text, "Не удалось проверить незакрытые уроки");
  assert.equal(unknown[0].key, "open_lessons");
  assert.match(unknown[0].hint, /проверьте сами, прежде чем сохранять ведомость/);
  assert.deepEqual(R.warningViews({ ...base, open_lessons: 3 }).map((v) => v.text), ["3 незакрытых урока"]);
  assert.deepEqual(R.warningViews({ ...base, open_lessons: 0 }), []);
  assert.deepEqual(R.warningViews({ ...base, open_lessons: null }), []);                            // a saved sheet: not looked up
  assert.deepEqual(R.warningViews({ ...base, open_lessons: null }, { openUnknown: true }).map((v) => v.text), ["Не удалось проверить незакрытые уроки"]);          // a calculation not saved yet
  assert.equal(R.warningViews({ ...base, open_lessons: 2, open_lessons_unknown: true })[0].text, "Не удалось проверить незакрытые уроки");          // unknown wins over a stale count
});

test("the card of a calculation not saved yet says it; the card of a saved sheet with the fresh counts of the month does the same", () => {
  signIn({ org_role: "owner" });
  const { SheetSummaryCard } = component("payroll/sheet-summary.tsx");
  const card = (props) => textOf(html(React.createElement(SheetSummaryCard, { total: 0, accrued: 0, status: R.sheetCardStatus({ saved: false, stale: null, dirty: false, updatedAt: null, delta: null }), busy: false, onPrimary() {}, onPrint() {}, ...props })));
  assert.ok(card({ sheet: sheet({ id: null, saved: false }) }).includes("Не удалось проверить незакрытые уроки"), "a preview: null = the check failed");
  assert.ok(!card({ sheet: sheet() }).includes("Не удалось проверить"), "a saved sheet: null = not looked up");
  assert.ok(card({ sheet: sheet(), warnings: { open_lessons: null, open_lessons_unknown: true, pending_excused: 0, no_fee: 0, unpaid: 0 } }).includes("Не удалось проверить незакрытые уроки"));
  assert.ok(card({ sheet: sheet({ id: null, saved: false, warnings: { open_lessons: 2, pending_excused: 0, no_fee: 0, unpaid: 0 } }) }).includes("2 незакрытых урока"));
});

// ── the unfinished lessons at the saving ──────────────────────────────────────────────────────────

const ITEMS = [
  { lessonDate: "2026-10-12", groupId: "g1", lessonId: "l1", kind: "missed" },
  { lessonDate: "2026-10-14", groupId: "g2", lessonId: "l2", kind: "in_progress" },
];

test("the gate: a month that is not over saves without a word; a failed check or unfinished lessons of a finished month are asked about", () => {
  assert.deepEqual(OL.openLessonsGate({ monthOpen: true, openLessons: 5, unknown: false, items: ITEMS }), { kind: "none" });
  assert.deepEqual(OL.openLessonsGate({ monthOpen: true, openLessons: null, unknown: true }), { kind: "none" });
  assert.deepEqual(OL.openLessonsGate({ monthOpen: false, openLessons: 0, unknown: false, items: [] }), { kind: "none" });
  assert.deepEqual(OL.openLessonsGate({ monthOpen: false, openLessons: null, unknown: true }), { kind: "unknown" });
  const list = OL.openLessonsGate({ monthOpen: false, openLessons: 2, unknown: false, items: ITEMS });
  assert.deepEqual([list.kind, list.count, list.items.length], ["list", 2, 2]);
  assert.equal(OL.openLessonsGate({ monthOpen: false, openLessons: 4, unknown: false, items: ITEMS }).count, 4);          // the server counted more than it listed
  assert.equal(OL.openLessonsGate({ monthOpen: false, openLessons: 3, unknown: false }).count, 3);          // an older answer without the list
});

test("the question: the SERVER's sentence, the new lessons (date, group, what is wrong), a line about the earlier confirmed ones, «Сохранить всё равно» / «Отмена»; nothing that sends to a list where the lessons are not", () => {
  const refusal = { status: 409, code: "OPEN_LESSONS_CONFIRM_REQUIRED", message: "В месяце незакрытых уроков, которых вы ещё не подтверждали: 2. Они не попадут в ведомость, а месяц закроется. Сохранить всё равно?",
    detail: { message: "В месяце незакрытых уроков, которых вы ещё не подтверждали: 2. Они не попадут в ведомость, а месяц закроется. Сохранить всё равно?", count: 2, alreadyConfirmed: 3,
      items: [{ lessonDate: "2026-10-12", groupId: "g1", groupName: "7-А Алгебра", lessonId: "l1", kind: "missed" }, { lessonDate: "2026-10-14", groupId: "g2", groupName: "9-Б Геометрия", lessonId: "l2", kind: "in_progress" }] } };
  const q = OL.openLessonsQuestion(OL.gateOfConfirmRefusal(refusal));
  assert.equal(q.title, "Сохранить ведомость с незакрытыми уроками?");
  assert.equal(q.confirmLabel, "Сохранить всё равно");
  assert.equal(q.cancelLabel, "Отмена");
  const lines = q.message.split("\n");
  assert.equal(lines[0], refusal.detail.message, "the question is the server's own sentence");
  assert.ok(lines.includes("12.10 · 7-А Алгебра · Посещаемость не отмечена"));
  assert.ok(lines.includes("14.10 · 9-Б Геометрия · Урок не завершён"));
  assert.ok(lines.includes("Ещё 3 урока вы подтвердили раньше."));
  assert.doesNotMatch(q.message, /Закройте их в/, "the old advice sent the owner to a list that does not hold the lessons of a closed month");
  // nothing confirmed before: no such line; a refusal without a sentence: ours stands in, with the count
  const first = OL.openLessonsQuestion(OL.gateOfConfirmRefusal({ code: "OPEN_LESSONS_CONFIRM_REQUIRED", detail: { count: 1, items: [refusal.detail.items[0]] } }));
  assert.match(first.message, /^В месяце 1 незакрытый урок, которых вы ещё не подтверждали/);
  assert.doesNotMatch(first.message, /подтвердили раньше/);
  const unknown = OL.openLessonsQuestion({ kind: "unknown" });
  assert.equal(unknown.title, "Не удалось проверить незакрытые уроки");
  assert.match(unknown.message, /Если сохранить сейчас, месяц закроется/);
  assert.equal(OL.openLessonsQuestion({ kind: "none" }), null);
  // a long list is capped, the rest is counted
  const many = Array.from({ length: 12 }, (_, i) => ({ lessonDate: `2026-10-${String(i + 1).padStart(2, "0")}`, groupId: "g", lessonId: `l${i}`, kind: "missed" }));
  const capped = OL.openLessonsQuestion({ kind: "list", count: 12, items: many }).message.split("\n");
  assert.equal(capped.filter((line) => /^\d\d\.10 /.test(line)).length, 8);
  assert.ok(capped.includes("и ещё 4"));
});

test("m3: the save AND the re-save ask what the server asks - `false` first; the 409 is shown (its sentence, its list); only «Сохранить всё равно» sends the same request again with `true`", async () => {
  const CD = lib("confirm-dialog.ts");
  const { sendConfirmingOpenLessons } = require(path.join(env.root, "src/components/payroll/confirm-open-lessons.ts"));
  const refusal = Object.assign(new Error("Сохранить всё равно?"), { status: 409, code: "OPEN_LESSONS_CONFIRM_REQUIRED", detail: { message: "Новых незакрытых уроков: 1", count: 1, alreadyConfirmed: 0, items: [{ lessonDate: "2026-10-12", groupId: "g1", groupName: "7-А", lessonId: "l1", kind: "missed" }] } });
  const run = async (answerYes) => {
    const sent = [];
    const asked = [];
    const stop = CD.subscribeConfirm(() => { const pending = CD.currentConfirm(); if (pending) { asked.push(pending); setImmediate(() => CD.answerConfirm(answerYes)); } });
    const phases = [];
    try {
      const outcome = await sendConfirmingOpenLessons(async (flag) => { sent.push(flag); if (flag === false) throw refusal; return { revision: 5 }; }, (asking) => phases.push(asking));
      return { outcome, sent, asked, phases };
    } finally { stop(); }
  };
  const yes = await run(true);
  assert.deepEqual(yes.sent, [false, true], "the same request again, now with the owner's yes");
  assert.deepEqual(yes.outcome, { cancelled: false, value: { revision: 5 } });
  assert.deepEqual(yes.phases, [true, false], "the screen stops saying «Сохраняем…» while the window is open");
  assert.equal(yes.asked.length, 1);
  assert.match(yes.asked[0].message, /^Новых незакрытых уроков: 1/);
  assert.match(yes.asked[0].message, /12\.10 · 7-А · Посещаемость не отмечена/);
  const no = await run(false);
  assert.deepEqual(no.sent, [false], "«Отмена»: nothing is sent again");
  assert.deepEqual(no.outcome, { cancelled: true });
  // a refusal that is not this one goes to the caller; a save that needs no question is one request
  await assert.rejects(sendConfirmingOpenLessons(async () => { throw Object.assign(new Error("x"), { code: "SHEET_REVISION_CONFLICT" }); }), /x/);
  const quiet = [];
  assert.deepEqual(await sendConfirmingOpenLessons(async (flag) => { quiet.push(flag); return 1; }), { cancelled: false, value: 1 });
  assert.deepEqual(quiet, [false]);
  // the bodies of the save and of the re-save carry the flag
  assert.equal(R.buildPatchBody(sheet(), { lines: {}, groups: {} }, "", { confirmOpenLessons: false }).confirm_open_lessons, false);
  assert.equal(R.buildPatchBody(sheet(), { lines: {}, groups: {} }, "", { confirmOpenLessons: true }).confirm_open_lessons, true);
  assert.ok(!("confirm_open_lessons" in R.buildPatchBody(sheet(), { lines: {}, groups: {} }, "", {})));
  // both pages send through it (the wiring of a page of 900 lines is not mounted here)
  const month = read("src/components/payroll/payroll-month-page.tsx");
  const page = read("src/components/payroll/payroll-sheet-page.tsx");
  assert.match(month, /sendConfirmingOpenLessons\(\s*\(confirmOpenLessons\) => orgApi\.savePayrollSheet\(buildSaveBody\([^)]*confirmOpenLessons\)\)/);
  assert.match(page, /sendConfirmingOpenLessons\(\s*\(confirmOpenLessons\) => orgApi\.patchPayrollSheet\(sheet\.id!, buildPatchBody\(sheet, edits, note, \{ recalculate, expectedFingerprint: fingerprint, confirmOpenLessons \}\)\)/);
  // «не удалось проверить» is the one thing the server cannot see: it is still asked before the request
  assert.match(month, /if \(gate\.kind === "unknown" && !\(await confirmUnfinishedLessons\(gate\)\)\) return;/);
  assert.match(page, /if \(checkGate\.kind === "unknown" && !\(await confirmUnfinishedLessons\(checkGate\)\)\) return;/);
});

// ── «Пересохранить»: the payout by the saved total, the change after the saving ──────────────────────

test("A21: the data moved by +125 000 after the saving - the payout stays by the SAVED 475 000, the card says «изменилась на +125 000» and offers «Пересохранить»", () => {
  const state = Y.normalizePayoutState(named("logicA", "A21_"));
  assert.equal(state.basis, "saved");
  assert.deepEqual([state.saved_total, state.fresh_total, state.target, state.balance, state.changed_by], [475000, 600000, 475000, 0, 125000]);
  const status = R.sheetCardStatus({ saved: true, stale: true, dirty: false, updatedAt: "2026-11-03T05:00:00", delta: state.changed_by });
  assert.equal(plain(status.text), "После сохранения ведомость изменилась на +125 000 сум");
  assert.equal(status.action, "recalculate");
  signIn({ org_role: "owner" });
  const { SheetSummaryCard } = component("payroll/sheet-summary.tsx");
  const markup = html(React.createElement(SheetSummaryCard, { sheet: sheet({ stale: true }), total: 475000, accrued: 0, status, busy: false, onPrimary() {}, onPrint() {} }));
  assert.ok(textOf(markup).includes("Пересохранить"));
  assert.ok(!textOf(markup).includes("Пересчитать"), "the old word is gone");
  assert.equal((markup.match(/bg-primary-600/g) || []).length, 1, "exactly one main button");
});

test("A24 / A25: the data FELL by 125 000 - the payout is still by the saved 600 000; voiding a payout puts the balance back by the saved total", () => {
  const lower = Y.normalizePayoutState(named("logicA", "A24_"));
  assert.deepEqual([lower.target, lower.state, lower.changed_by], [600000, "settled", -125000]);
  assert.equal(plain(Y.payoutChangeLine(lower).text), "изменилось на −125 000 сум");
  const voided = Y.normalizePayoutState(named("logicA", "A25_").state);
  assert.deepEqual([voided.target, voided.paid, voided.balance, voided.state], [600000, 475000, 125000, "due"]);
  assert.equal(plain(Y.payoutChip(voided).text), "Выплачено 475 000 сум из 600 000 сум");
});

test("the month row: ONE payout chip, the change after the saving under it («изменилось на +125 000»), ONE status, the state of the month under it, ONE action", () => {
  const { TeacherRow } = component("payroll/payroll-month-page.tsx");
  const payout = named("logicA", "A21_");
  const teacher = { teacher_id: "t1", teacher_name: "Каримова К.", lessons_count: 12, lesson_types: [], rates: { group: "50" }, missing_rates: [],
    sheet: { id: "s1", revision: 2, total_amount: 475000, stale: true, updated_at: "2026-11-03T05:00:00" }, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 }, payout };
  const row = (period) => html(React.createElement(TeacherRow, { teacher, month: "2026-10", period, busy: false, onCalculate() {}, onOpen() {} }));
  const closed = row(CP.periodView({ state: "closed", closedOn: "2026-11-03", reopened: null }));
  const text = textOf(closed);
  assert.ok(text.includes("Выплачено полностью"));
  assert.ok(text.includes("изменилось на +125 000 сум"));
  assert.ok(text.includes("Есть изменения"));
  assert.ok(text.includes("Месяц закрыт"));
  assert.match(closed, /data-testid="period-chip"[^>]*data-tone="closed"/);
  assert.match(closed, /data-testid="payout-change"/);
  assert.equal((closed.match(/aria-label="Открыть: Каримова К\."/g) || []).length, 1, "one action");
  assert.doesNotMatch(closed, /Переоткрыть месяц/, "the way out is on the sheet, not in the row");
  const reopened = textOf(row(CP.periodView({ state: "reopened", closedOn: "2026-11-03", reopened: null })));
  assert.ok(reopened.includes("Месяц переоткрыт"));
  assert.ok(!textOf(row(null)).includes("Месяц "), "no state read, nothing said");
  assert.ok(textOf(row(CP.periodView({ state: "open", closedOn: null, reopened: null }))).includes("Месяц открыт"));
  // no change: no line
  const calm = html(React.createElement(TeacherRow, { teacher: { ...teacher, payout: { ...payout, changed_by: 0, change_text: null } }, month: "2026-10", busy: false, onCalculate() {}, onOpen() {} }));
  assert.doesNotMatch(calm, /payout-change/);
});

// ── the sheet: «Месяц закрыт» + «Переоткрыть месяц» ───────────────────────────────────────────────

test("the sheet: a closed month has the chip and the button; reopened says what to do next and has no button; open has the chip only; the owner decides (no handler, no button)", () => {
  signIn({ org_role: "owner" });
  const { SheetSummaryCard } = component("payroll/sheet-summary.tsx");
  const status = R.sheetCardStatus({ saved: true, stale: false, dirty: false, updatedAt: "2026-11-03T05:00:00", delta: null });
  const card = (view, onReopen) => html(React.createElement(SheetSummaryCard, { sheet: sheet(), total: 475000, accrued: 0, status, busy: false, onPrimary() {}, onPrint() {}, period: view, onReopen }));
  const closed = card(CP.periodView({ state: "closed", closedOn: "2026-11-03", reopened: null }), () => {});
  assert.ok(textOf(closed).includes("Месяц закрыт"));
  assert.match(closed, /data-testid="reopen-month"[^>]*>Переоткрыть месяц</);
  assert.doesNotMatch(card(CP.periodView({ state: "closed", closedOn: "2026-11-03", reopened: null }), undefined), /reopen-month/);
  const reopened = textOf(card(CP.periodView({ state: "reopened", closedOn: "2026-11-03", reopened: null }), () => {}));
  assert.ok(reopened.includes("Месяц переоткрыт"));
  assert.ok(reopened.includes("Исправьте уроки и пересохраните ведомость — месяц закроется снова"));
  assert.doesNotMatch(card(CP.periodView({ state: "reopened", closedOn: "2026-11-03", reopened: null }), () => {}), /reopen-month/);
  const open = card(CP.periodView({ state: "open", closedOn: null, reopened: null }), () => {});
  assert.ok(textOf(open).includes("Месяц открыт"));
  assert.doesNotMatch(open, /reopen-month/);
  assert.doesNotMatch(card(null, () => {}), /sheet-period/, "no state, no line");
});

test("«Переоткрыть месяц»: the dialog says what opening does, asks the reason (3..500), has the one button; it is a dialog of the project", () => {
  const { ReopenMonthDialog } = component("payroll/reopen-month-dialog.tsx");
  const open = html(React.createElement(ReopenMonthDialog, { target: { month: "2026-10", teacherId: "t1", teacherName: "Каримова К." }, onClose() {}, onReopened() {} }));
  const text = textOf(open);
  for (const part of ["Переоткрыть месяц?", "Каримова К. · октябрь 2026", "Пока месяц открыт, уроки этого месяца можно исправлять", "после исправлений пересохраните ведомость, и месяц закроется снова", "Причина", "Причина и ваше имя останутся в журнале", "Назад"]) {
    assert.ok(text.includes(part), part);
  }
  assert.match(open, /<button type="submit" form="reopen-month-form"[^>]*>[\s\S]*?Переоткрыть месяц<\/button>/);
  assert.match(open, /<textarea id="reopen-month-reason"[^>]*maxLength="500"|maxlength="500"/i);
  assert.equal(html(React.createElement(ReopenMonthDialog, { target: null, onClose() {}, onReopened() {} })), "");
  const src = read("src/components/payroll/reopen-month-dialog.tsx");
  // a double press and the revision are the behaviour of tests/dom-windows.test.cjs (the revision is read first, the request carries it) and of `useDialogAction` (a ref holds the second press)
  assert.match(src, /const problem = validateReopenReason\(reason\);\s*if \(problem\) \{ setError\(problem\); return; \}/);
  assert.match(src, /orgApi\.reopenPayrollPeriod\(target\.month, buildReopenBody\(target\.teacherId, reason, revision\)\)/);
});

test("the notice of a closed month in a lesson window: the server's sentence for everybody, the button ONLY for the money right (owner, administrator with the right)", () => {
  const { PeriodClosedNotice } = component("money/period-closed-notice.tsx");
  const info = CP.periodClosedOf({ code: "PERIOD_CLOSED", message: "Месяц октябрь 2026 у преподавателя Каримова К. закрыт: ведомость сохранена 03.11.2026. Чтобы исправить урок, владелец или администратор с правом оплат сначала переоткрывает месяц",
    detail: { month: "2026-10", teacherId: "t1", teacherName: "Каримова К." } });
  const notice = (user) => { signIn(user); return html(React.createElement(PeriodClosedNotice, { info, onReopened() {} })); };
  for (const [who, user, button] of [["owner", { org_role: "owner" }, true], ["admin with the right", { org_role: "admin", payments_access: true }, true], ["admin without", { org_role: "admin", payments_access: false }, false],
    ["admin, flag absent", { org_role: "admin" }, false], ["teacher", { org_role: "teacher", role: "teacher" }, false]]) {
    const markup = notice(user);
    assert.ok(textOf(markup).includes("сначала переоткрывает месяц"), `${who}: the server's sentence`);
    assert.equal(/period-closed-reopen/.test(markup), button, `${who}: the button`);
    assert.match(markup, /role="alert"/);
  }
});

// ── the pages: where the state comes from ─────────────────────────────────────────────────────────

test("the sheet page and the month page read the state of the month from GET payroll-periods (a failed read says nothing, it does not block); the sheet page re-reads it after every save", () => {
  const page = read("src/components/payroll/payroll-sheet-page.tsx");
  assert.match(page, /orgApi\.getPayrollPeriods\(sheet\.month\)\s*\.then\(\(answer\) => \{ if \(!cancelled\) setPeriod\(periodOf\(answer, sheet\.teacher_id\)\); \}\)\s*\.catch\(\(\) => \{ if \(!cancelled\) setPeriod\(null\); \}\)/);
  assert.match(page, /period=\{periodView\(period\)\}/);
  assert.match(page, /onReopen=\{period && sheet\.id \? \(\) => setReopening\(true\) : undefined\}/);
  // ONE number for «изменилась на ±N» (R3 unconfirmed 1): the `changed_by` of the payout, the same fresh-minus-saved the month list shows; null when the server could not count the fresh total
  assert.match(page, /delta: sheet\.payout && sheet\.payout\.fresh_total !== null \? sheet\.payout\.changed_by : null,/);
  assert.match(page, /"Ведомость пересохранена"/);
  const month = read("src/components/payroll/payroll-month-page.tsx");
  assert.match(month, /orgApi\.getPayrollPeriods\(month\)\.catch\(\(\) => null\)/);
  assert.match(month, /period=\{periodView\(periodOf\(periods, teacher\.teacher_id\)\)\}/);
  const api = read("src/lib/api.ts");
  assert.match(api, /getPayrollPeriods: \(month: string\) =>\s*api<PayrollPeriods>\(`\/auth\/org\/payroll-periods\?month=\$\{encodeURIComponent\(month\)\}`\)/);
  assert.match(api, /reopenPayrollPeriod: \(month: string, body: \{ teacher_id: string; reason: string; sheet_revision: number \}\) =>\s*api<ReopenResult>\(`\/auth\/org\/payroll-periods\/\$\{encodePathId\(month\)\}\/reopen`, \{ method: "POST", body \}\)/);
});

test("the client: the two calls go to the paths of the contract with the body of the contract", async () => {
  const { orgApi } = lib("api.ts");
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body ? JSON.parse(init.body) : undefined });
    const body = String(url).includes("/reopen")
      ? { ok: true, changed: true, teacherId: "t1", month: "2026-10", state: "reopened", closedOn: "2026-11-03", sheetId: "s1", reopened: { at: "2026-11-05T09:00:00", by: "Арслан", reason: "ошибка" } }
      : { month: "2026-10", items: [{ teacherId: "t1", teacherName: "Каримова К.", month: "2026-10", state: "closed", closedOn: "2026-11-03", sheetId: "s1", reopened: null }] };
    return { ok: true, status: 200, headers: new Map([["content-type", "application/json"]]), json: async () => body, text: async () => JSON.stringify(body) };
  };
  try {
    const periods = await orgApi.getPayrollPeriods("2026-10");
    assert.equal(periods.items[0].state, "closed");
    const done = await orgApi.reopenPayrollPeriod("2026-10", CP.buildReopenBody("t1", "ошибка", 4));
    assert.equal(done.state, "reopened");
  } finally {
    global.fetch = original;
  }
  assert.match(calls[0].url, /\/auth\/org\/payroll-periods\?month=2026-10$/);
  assert.equal(calls[0].method, "GET");
  assert.match(calls[1].url, /\/auth\/org\/payroll-periods\/2026-10\/reopen$/);
  assert.deepEqual([calls[1].method, calls[1].body], ["POST", { teacher_id: "t1", reason: "ошибка", sheet_revision: 4 }]);
});

// ── R3 #11 (item 1): «Переоткрыть месяц» carries the revision of the sheet the screen saw ─────────────────────

test("R3 item 1: the reopening sends `sheet_revision`; the button waits for it; 409 SHEET_CHANGED reads it again and asks once more (a late duplicate cannot reopen a month twice)", () => {
  assert.equal(CP.buildReopenBody("t1", " ошибка ", 7).sheet_revision, 7);
  assert.equal(CP.revisionOf({ items: [{ teacherId: "t1", sheetRevision: 5, state: "closed", month: "2026-10" }] }, "t1"), 5);
  assert.equal(CP.revisionOf({ items: [{ teacherId: "t1", sheetRevision: null, state: "none", month: "2026-10" }] }, "t1"), null);
  assert.equal(CP.revisionOf({ items: [] }, "t1"), null);
  const src = read("src/components/payroll/reopen-month-dialog.tsx");
  assert.match(src, /typeof revision !== "number"\) return;/, "no request without a revision");
  assert.match(src, /if \(isSheetChanged\(cause\)\) void readRevision\(target\.month, target\.teacherId\);/);
  const open = html(React.createElement(component("payroll/reopen-month-dialog.tsx").ReopenMonthDialog, { target: { month: "2026-10", teacherId: "t1", teacherName: "Каримова К." }, onClose() {}, onReopened() {} }));
  assert.match(open, /data-testid="reopen-reading"/, "while the revision is read the dialog says so");
  assert.match(open, /data-testid="reopen-submit"[^>]*disabled/, "and the button waits");
  const known = html(React.createElement(component("payroll/reopen-month-dialog.tsx").ReopenMonthDialog, { target: { month: "2026-10", teacherId: "t1", teacherName: "Каримова К.", sheetRevision: 3 }, onClose() {}, onReopened() {} }));
  assert.ok(!/reopen-reading/.test(known));
});

// ── R3 #21 (item 10): the save with `confirm_open_lessons` ───────────────────────────────────────────────

test("R3 item 10: the body of a save carries `confirm_open_lessons`; the 409 OPEN_LESSONS_CONFIRM_REQUIRED becomes the list (date, group) and «Сохранить всё равно»", () => {
  const body = (flag) => R.buildSaveBody(sheet({ saved: false, revision: null }), { lines: {}, groups: {} }, "", null, flag);
  assert.equal(body(false).confirm_open_lessons, false);
  assert.equal(body(true).confirm_open_lessons, true);
  assert.ok(!("confirm_open_lessons" in body(undefined)), "nothing is sent when the caller did not ask");
  const refusal = { status: 409, code: "OPEN_LESSONS_CONFIRM_REQUIRED", message: "x", detail: { message: "x", count: 2, items: [
    { lessonDate: "2026-10-12", groupId: "g1", groupName: "7-А Алгебра", lessonId: "l1", kind: "missed" },
    { lessonDate: "2026-10-14", groupId: "g2", groupName: "9-Б Геометрия", lessonId: "l2", kind: "in_progress" }] } };
  assert.equal(OL.isOpenLessonsConfirm(refusal), true);
  assert.equal(OL.isOpenLessonsConfirm({ status: 409, code: "SHEET_REVISION_CONFLICT" }), false);
  const gate = OL.gateOfConfirmRefusal(refusal);
  assert.deepEqual([gate.kind, gate.count, gate.items.length], ["list", 2, 2]);
  const q = OL.openLessonsQuestion(gate);
  assert.equal(q.title, "Сохранить ведомость с незакрытыми уроками?");
  assert.equal(q.confirmLabel, "Сохранить всё равно");
  const lines = q.message.split("\n");
  assert.ok(lines.includes("12.10 · 7-А Алгебра · Посещаемость не отмечена"), "the group name is the server's `groupName`");
  assert.ok(lines.includes("14.10 · 9-Б Геометрия · Урок не завершён"));
  // a refusal without a list still asks (the count is the server's)
  assert.equal(OL.gateOfConfirmRefusal({ code: "OPEN_LESSONS_CONFIRM_REQUIRED", detail: { count: 3 } }).count, 3);
  assert.equal(OL.openLessonItemLine({ lessonDate: "2026-10-12", groupId: "g", lessonId: "l", kind: "missed", groupName: "  " }, new Map()), "12.10 · Посещаемость не отмечена");
});

test("R3 item 9: `open_lesson_items` carry `groupName` - the question needs no second request for the names", () => {
  const item = { lessonDate: "2026-10-12", groupId: "g1", groupName: "7-А Алгебра", lessonId: "l1", kind: "missed" };
  assert.equal(OL.openLessonItemLine(item), "12.10 · 7-А Алгебра · Посещаемость не отмечена");
  assert.equal(OL.openLessonItemLine({ ...item, groupName: " " }), "12.10 · Посещаемость не отмечена", "no name - no group, and no second request for it");
  assert.equal(OL.openLessonItemKey, undefined, "the list of «Незакрытые уроки» is not read for names any more");
});

// ── R3 #20 (item 11): an OPEN month is paid by what is accrued now ─────────────────────────────────────

const FRESH = { saved_total: 400000, fresh_total: 600000, target: 600000, paid: 475000, balance: 125000, state: "due", basis: "fresh", changed_by: 200000, change_text: null,
  text: "Месяц открыт: начислено сейчас 600 000 сум, выплачено 475 000 сум, к выплате 125 000 сум", items: [], carry_in: 0, carry_used: 0, advance_out: 0 };

test("R3 item 11: an open month says «начислено сейчас N, выплачено M, к выплате N−M» (the server's sentence) and labels the sum «Начислено сейчас»; a closed month is as before", () => {
  const state = Y.normalizePayoutState(FRESH);
  assert.equal(state.basis, "fresh");
  assert.equal(Y.payoutNote(state), FRESH.text);
  assert.deepEqual(Y.sheetPayoutParts(state), [], "R3 m2: the three figures would repeat the sentence of the server word for word");
  assert.equal(plain(Y.payoutChip(state).text), "Выплачено 475 000 сум из 600 000 сум");
  const closed = Y.normalizePayoutState({ ...FRESH, basis: "saved", text: "Выплачено 475 000 из 600 000" });
  assert.equal(Y.payoutNote(closed), null, "the closed month keeps its chip and figures, no extra sentence");
  assert.equal(Y.sheetPayoutParts(closed)[0].label, "К выплате");
  // the sentence is on the screens: the block of a sheet and the window of the payout
  signIn({ org_role: "owner" });
  const { SheetPayoutBlock } = component("payroll/payout-block.tsx");
  const block = textOf(html(React.createElement(SheetPayoutBlock, { sheetId: "s1", month: "2026-11", teacherName: "Каримова К.", payout: FRESH, onChanged() {} })));
  assert.ok(block.includes("Месяц открыт: начислено сейчас 600 000 сум, выплачено 475 000 сум, к выплате 125 000 сум"));
  assert.equal((block.match(/600\s000/g) || []).length, 2, "the sum is said twice at most: the chip and the one sentence - not a third time as a figure");
  assert.ok(!block.includes("Осталось выплатить"), "no figures that repeat the sentence");
  assert.ok(!/<dl/.test(html(React.createElement(SheetPayoutBlock, { sheetId: "s1", month: "2026-11", teacherName: "Каримова К.", payout: FRESH, onChanged() {} }))), "no empty list of figures");
  const closedBlock = textOf(html(React.createElement(SheetPayoutBlock, { sheetId: "s1", month: "2026-11", teacherName: "Каримова К.", payout: { ...FRESH, basis: "saved", text: "x" }, onChanged() {} })));
  assert.ok(closedBlock.includes("К выплате") && closedBlock.includes("Осталось выплатить"), "a closed month keeps its figures");
});

test("R3 item 11: a payout above what is accrued needs the owner's yes («больше начисленного сейчас»); the closed month keeps «больше остатка»", () => {
  assert.equal(plain(Y.payoutOverpayQuestion(25000, "fresh")), "Выплата больше начисленного сейчас на 25 000 сум — записать как аванс?");
  assert.equal(plain(Y.payoutOverpayQuestion(25000, "saved")), "Выплата больше остатка на 25 000 сум — записать как аванс?");
  assert.equal(plain(Y.payoutOverpayQuestion(25000)), "Выплата больше остатка на 25 000 сум — записать как аванс?");
  assert.deepEqual(Y.buildPayoutBody({ amount: "150 000", paidOn: "2026-11-05", method: "cash", note: "" }, 25000), { amount: 150000, paid_on: "2026-11-05", method: "cash", confirm_overpay: true, overpay: 25000 });
  assert.ok(!("confirm_overpay" in Y.buildPayoutBody({ amount: "150 000", paidOn: "2026-11-05", method: "cash", note: "" })), "never sent by default");
});
