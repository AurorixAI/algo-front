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

test("the month overview: a failed check says «Не удалось проверить уроки без отметки», never «0»; a count is a count; null of a SAVED sheet is «not looked up» and says nothing", () => {
  const base = { pending_excused: 0, no_fee: 0, unpaid: 0 };
  const unknown = R.warningViews({ ...base, open_lessons: null, open_lessons_unknown: true });
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].text, "Не удалось проверить уроки без отметки");
  assert.equal(unknown[0].key, "open_lessons");
  assert.match(unknown[0].hint, /проверьте сами, прежде чем сохранять ведомость/);
  assert.deepEqual(R.warningViews({ ...base, open_lessons: 3 }).map((v) => v.text), ["3 урока без отметки"]);
  assert.deepEqual(R.warningViews({ ...base, open_lessons: 0 }), []);
  assert.deepEqual(R.warningViews({ ...base, open_lessons: null }), []);                            // a saved sheet: not looked up
  assert.deepEqual(R.warningViews({ ...base, open_lessons: null }, { openUnknown: true }).map((v) => v.text), ["Не удалось проверить уроки без отметки"]);          // a calculation not saved yet
  assert.equal(R.warningViews({ ...base, open_lessons: 2, open_lessons_unknown: true })[0].text, "Не удалось проверить уроки без отметки");          // unknown wins over a stale count
});

test("the card of a calculation not saved yet says it; the card of a saved sheet with the fresh counts of the month does the same", () => {
  signIn({ org_role: "owner" });
  const { SheetSummaryCard } = component("payroll/sheet-summary.tsx");
  const card = (props) => textOf(html(React.createElement(SheetSummaryCard, { total: 0, accrued: 0, status: R.sheetCardStatus({ saved: false, stale: null, dirty: false, updatedAt: null, delta: null }), busy: false, onPrimary() {}, onPrint() {}, ...props })));
  // UX pack §5.2-бис: what needs an action is the block «Что нужно сделать» over the card, not a line inside it
  const { SheetTodoBlock } = component("payroll/sheet-todo.tsx");
  const todo = (counts, options = {}) => textOf(html(React.createElement(SheetTodoBlock, { items: R.sheetTodoItems({ counts, ...options }) })));
  assert.ok(todo(sheet({ id: null, saved: false }).warnings, { openUnknown: true }).includes("Не удалось проверить уроки без отметки"), "a preview: null = the check failed");
  assert.ok(!todo(sheet().warnings).includes("Не удалось проверить"), "a saved sheet: null = not looked up");
  assert.ok(todo({ open_lessons: null, open_lessons_unknown: true, pending_excused: 0, no_fee: 0, unpaid: 0 }).includes("Не удалось проверить уроки без отметки"));
  assert.ok(todo({ open_lessons: 2, pending_excused: 0, no_fee: 0, unpaid: 0 }).includes("2 урока без отметки"));
  assert.ok(!card({ sheet: sheet() }).includes("Не удалось проверить"), "the card itself carries no warnings any more");
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

test("UX pack №18: «Сохранить с уроками без отметки?» - «N урок без отметки не попадёт в зарплату: 12.10 · Геометрия 8», the way to the journal, «После сохранения месяц закроется», «Отмена» / «Сохранить и закрыть месяц»", () => {
  const refusal = { status: 409, code: "OPEN_LESSONS_CONFIRM_REQUIRED", message: "x",
    detail: { message: "x", count: 2, alreadyConfirmed: 3,
      items: [{ lessonDate: "2026-10-12", groupId: "g1", groupName: "7-А Алгебра", lessonId: "l1", kind: "missed" }, { lessonDate: "2026-10-14", groupId: "g2", groupName: "9-Б Геометрия", lessonId: "l2", kind: "in_progress" }] } };
  const q = OL.openLessonsQuestion(OL.gateOfConfirmRefusal(refusal));
  assert.equal(q.title, "Сохранить с уроками без отметки?");
  assert.equal(q.confirmLabel, "Сохранить и закрыть месяц");
  assert.equal(q.cancelLabel, "Отмена");
  // re-audit С10: the sentence, the LIST (rows: the date on the left, the group, a quiet tail), the journal link, the last line
  assert.equal(q.message, "2 урока без отметки не попадут в зарплату:");
  assert.deepEqual(q.items, [{ label: "пн, 12 октября", text: "7-А Алгебра" }, { label: "ср, 14 октября", text: "9-Б Геометрия", note: "урок не завершён" }]);
  assert.equal(q.footnote, "Ещё 3 урока без отметки вы уже решили не включать в зарплату.\nПосле сохранения месяц закроется.");
  assert.deepEqual(q.link, { label: "Открыть журнал", href: "/owner/groups/g1?tab=attendance&month=2026-10&lesson=l1&date=2026-10-12" }, "the journal of the first lesson");
  assert.doesNotMatch(`${q.message}${q.footnote}`, /Сохранить всё равно|ведомост|подтвердили раньше/);
  // one lesson: the singular; nothing confirmed before - no such line
  const first = OL.openLessonsQuestion(OL.gateOfConfirmRefusal({ code: "OPEN_LESSONS_CONFIRM_REQUIRED", detail: { count: 1, items: [refusal.detail.items[0]] } }));
  assert.equal(first.message, "1 урок без отметки не попадёт в зарплату:");
  assert.equal(first.footnote, "После сохранения месяц закроется.", "nothing was decided before - no such line");
  const five = OL.openLessonsQuestion({ kind: "list", count: 5, items: [] });
  assert.equal(five.message, "5 уроков без отметки не попадут в зарплату.", "no list: a full stop, no link");
  assert.equal(five.link, undefined);
  const unknown = OL.openLessonsQuestion({ kind: "unknown" });
  assert.equal(unknown.title, "Не удалось проверить уроки без отметки");
  assert.match(unknown.message, /После сохранения месяц закроется\./);
  assert.equal(unknown.confirmLabel, "Сохранить и закрыть месяц");
  assert.equal(OL.openLessonsQuestion({ kind: "none" }), null);
  // a long list is capped, the rest is counted
  const many = Array.from({ length: 12 }, (_, i) => ({ lessonDate: `2026-10-${String(i + 1).padStart(2, "0")}`, groupId: "g", lessonId: `l${i}`, kind: "missed" }));
  const capped = OL.openLessonsQuestion({ kind: "list", count: 12, items: many }).items;
  assert.equal(capped.filter((row) => row.label).length, 8);
  assert.ok(capped.some((row) => row.text === "и ещё 4"));
});

test("m3: the save AND the re-save ask what the server asks - `false` first; the 409 is shown (its list); only «Сохранить и закрыть месяц» sends the same request again with `true`", async () => {
  const CD = lib("confirm-dialog.ts");
  const { sendConfirmingOpenLessons } = require(path.join(env.root, "src/components/payroll/confirm-open-lessons.ts"));
  const refusal = Object.assign(new Error("Сохранить всё равно?"), { status: 409, code: "OPEN_LESSONS_CONFIRM_REQUIRED", detail: { message: "Новых уроков без отметки: 1", count: 1, alreadyConfirmed: 0, items: [{ lessonDate: "2026-10-12", groupId: "g1", groupName: "7-А", lessonId: "l1", kind: "missed" }] } });
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
  assert.match(yes.asked[0].message, /^1 урок без отметки не попадёт в зарплату:/);
  assert.deepEqual(yes.asked[0].items.map((row) => `${row.label} · ${row.text}`), ["пн, 12 октября · 7-А"]);
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
  assert.equal(plain(status.text), "Зарплата изменилась на +125 000 сум — сохраните новую сумму");
  assert.equal(status.action, "recalculate");
  signIn({ org_role: "owner" });
  const { SheetSummaryCard } = component("payroll/sheet-summary.tsx");
  const markup = html(React.createElement(SheetSummaryCard, { sheet: sheet({ stale: true }), total: 475000, accrued: 0, status, busy: false, onPrimary() {}, onPrint() {} }));
  // the button that saves the new sum is the one of the block «Что нужно сделать» (not the card's): exactly one
  const block = html(React.createElement(component("payroll/sheet-todo.tsx").SheetTodoBlock, { items: R.sheetTodoItems({ counts: null, changed: R.changedItem({ sheet: { id: "s1", stale: true }, payout: { changed_by: 125000, fresh_total: 600000 } }) }), onSave() {} }));
  assert.ok(textOf(block).includes("Сохранить новую сумму") && textOf(block).includes("Зарплата изменилась на +125 000 сум — сохраните новую сумму"));
  assert.ok(!textOf(markup).includes("Пересохранить") && !textOf(block).includes("Пересохранить") && !textOf(markup).includes("Пересчитать"), "the old words are gone");
  assert.equal((markup.match(/bg-primary-600/g) || []).length + (block.match(/bg-primary-600/g) || []).length, 1, "exactly one main button");
});

test("A24 / A25: the data FELL by 125 000 - the payout is still by the saved 600 000; voiding a payout puts the balance back by the saved total", () => {
  const lower = Y.normalizePayoutState(named("logicA", "A24_"));
  assert.deepEqual([lower.target, lower.state, lower.changed_by], [600000, "settled", -125000]);
  assert.equal(plain(Y.payoutChangeLine(lower).text), "Зарплата изменилась на −125 000 сум");
  const voided = Y.normalizePayoutState(named("logicA", "A25_").state);
  assert.deepEqual([voided.target, voided.paid, voided.balance, voided.state], [600000, 475000, 125000, "due"]);
  assert.equal(plain(Y.payoutChip(voided).text), "Выплачено 475 000 сум из 600 000 сум");
});

test("the month row: ONE payout chip (only the state of the payout), the change after the saving ONCE - in the status chip -, the state of the month, ONE action", () => {
  const { TeacherRow } = component("payroll/payroll-month-page.tsx");
  const payout = named("logicA", "A21_");
  const teacher = { teacher_id: "t1", teacher_name: "Каримова К.", lessons_count: 12, lesson_types: [], rates: { group: "50" }, missing_rates: [],
    sheet: { id: "s1", revision: 2, total_amount: 475000, stale: true, updated_at: "2026-11-03T05:00:00" }, warnings: { open_lessons: 0, pending_excused: 0, no_fee: 0, unpaid: 0 }, payout };
  const row = (period) => html(React.createElement(TeacherRow, { teacher, month: "2026-10", period, busy: false, onCalculate() {}, onOpen() {} }));
  const closed = row(CP.periodView({ state: "closed", closedOn: "2026-11-03", reopened: null }));
  const text = textOf(closed);
  assert.ok(text.includes("выплачено ✓"), "paid in full: the column «Остаток» says so");
  assert.ok(text.includes("Требует действия · 1"), "the change is an item of the ONE status chip (its items open on hover): not a chip of its own");
  assert.ok(!text.includes("Есть изменения") && !text.includes("изменилось на") && !text.includes("Изменилась"), "once: not a second line under the payout, not a second chip");
  assert.ok(text.includes("Месяц закрыт"));
  assert.match(closed, /data-testid="period-chip"[^>]*data-tone="closed"/);
  assert.equal((closed.match(/aria-label="Открыть: Каримова К\."/g) || []).length, 1, "one action");
  assert.doesNotMatch(closed, /Переоткрыть месяц/, "the way out is on the sheet, not in the row");
  const reopened = textOf(row(CP.periodView({ state: "reopened", closedOn: "2026-11-03", reopened: null })));
  assert.ok(reopened.includes("Месяц переоткрыт"));
  assert.ok(!textOf(row(null)).includes("Месяц "), "no state read, nothing said");
  const open = row(CP.periodView({ state: "open", closedOn: null, reopened: null }));
  assert.ok(textOf(open).includes("Месяц открыт"));
  assert.match(open, /data-testid="period-chip"[^>]*data-tone="open"/, "an open month is a small line (the page leaves it out while the month is going: `monthPeriodView`)");
  // the sum did not change: «Есть изменения» is not invented, and nothing is said about a change
  const calm = textOf(html(React.createElement(TeacherRow, { teacher: { ...teacher, sheet: { ...teacher.sheet, stale: false }, payout: { ...payout, changed_by: 0, change_text: null } }, month: "2026-10", busy: false, onCalculate() {}, onOpen() {} })));
  assert.ok(!calm.includes("изменилась") && !calm.includes("Изменилась") && !calm.includes("Есть изменения"));
  // the data moved but the sum did not (or could not be counted): the plain chip
  const same = textOf(html(React.createElement(TeacherRow, { teacher: { ...teacher, payout: { ...payout, changed_by: 0, change_text: null } }, month: "2026-10", busy: false, onCalculate() {}, onOpen() {} })));
  assert.ok(same.includes("Требует действия · 1"), "the data moved, the sum did not: still an item to act on («Данные изменились — проверьте и сохраните новую сумму»)");
});

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
  assert.ok(reopened.includes("Исправьте уроки и нажмите «Сохранить и закрыть месяц» — месяц закроется снова"));
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
  for (const part of ["Переоткрыть месяц?", "Каримова К. · октябрь 2026", "Пока месяц открыт, уроки этого месяца можно исправлять", "после исправлений нажмите «Сохранить и закрыть месяц»", "Причина", "Причина и ваше имя останутся в журнале", "Отмена"]) {
    assert.ok(text.includes(part), part);
  }
  assert.match(open, /<button type="submit" form="reopen-month-form"[^>]*>[\s\S]*?Переоткрыть месяц<\/button>/);
  assert.match(open, /<textarea id="reopen-month-reason"[^>]*maxLength="500"|maxlength="500"/i);
  assert.equal(html(React.createElement(ReopenMonthDialog, { target: null, onClose() {}, onReopened() {} })), "");
  const src = read("src/lib/use-reopen-month.ts");
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
    // UX pack rule 2: the block says the month and the teacher from the FACTS of the refusal, then what to do - or who can
    assert.match(textOf(markup), /Октябрь(?: 2026)? у Каримовой К\. закрыт/, `${who}: the month and the teacher`);
    assert.ok(textOf(markup).includes(button ? "Чтобы изменить урок, переоткройте месяц." : "Месяц переоткрывает владелец или администратор с доступом к деньгам."), `${who}: what to do`);
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
  assert.match(page, /"Новая сумма сохранена"/);
  const month = read("src/components/payroll/payroll-month-page.tsx");
  assert.match(month, /orgApi\.getPayrollPeriods\(month\)\.catch\(\(\) => null\)/);
  assert.match(month, /period=\{monthPeriodView\(periodView\(periodOf\(periods, teacher\.teacher_id\)\), monthOpen\)\}/);
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
  const src = read("src/lib/use-reopen-month.ts");
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
  assert.equal(q.title, "Сохранить с уроками без отметки?");
  assert.equal(q.confirmLabel, "Сохранить и закрыть месяц");
  assert.deepEqual(q.items.map((row) => [row.label, row.text, row.note ?? null]), [["пн, 12 октября", "7-А Алгебра", null], ["ср, 14 октября", "9-Б Геометрия", "урок не завершён"]], "the group name is the server's `groupName`");
  // a refusal without a list still asks (the count is the server's)
  assert.equal(OL.gateOfConfirmRefusal({ code: "OPEN_LESSONS_CONFIRM_REQUIRED", detail: { count: 3 } }).count, 3);
  assert.equal(OL.openLessonItemLine({ lessonDate: "2026-10-12", groupId: "g", lessonId: "l", kind: "missed", groupName: "  " }, new Map()), "12.10 · Посещаемость не отмечена");
});

test("R3 item 9: `open_lesson_items` carry `groupName` - the question needs no second request for the names", () => {
  const item = { lessonDate: "2026-10-12", groupId: "g1", groupName: "7-А Алгебра", lessonId: "l1", kind: "missed" };
  assert.equal(OL.openLessonItemLine(item), "12.10 · 7-А Алгебра · Посещаемость не отмечена");
  assert.equal(OL.openLessonItemLine({ ...item, groupName: " " }), "12.10 · Посещаемость не отмечена", "no name - no group, and no second request for it");
  assert.equal(OL.openLessonItemKey, undefined, "the list of «Уроки без отметки» is not read for names any more");
});

// ── R3 #20 (item 11): an OPEN month is paid by what is accrued now ─────────────────────────────────────

const FRESH = { saved_total: 400000, fresh_total: 600000, target: 600000, paid: 475000, balance: 125000, state: "due", basis: "fresh", changed_by: 200000, change_text: null,
  text: "Месяц открыт: начислено сейчас 600 000 сум, выплачено 475 000 сум, к выплате 125 000 сум", items: [], carry_in: 0, carry_used: 0, advance_out: 0 };

test("R3 item 11 + D-3: an open month's block says its result ONCE (the chip); the sentence of the server stays for the window of the payout", () => {
  const state = Y.normalizePayoutState(FRESH);
  assert.equal(state.basis, "fresh");
  assert.equal(Y.payoutNote(state), FRESH.text, "the window of the payout still shows the server's sentence");
  assert.equal(plain(Y.payoutChip(state).text), "Выплачено 475 000 сум из 600 000 сум", "the chip of a month ROW is self-contained");
  // the block of a sheet (the card above says the sum, the list below the payouts): the chip names what is left, nothing is said again
  assert.equal(plain(Y.sheetPayoutChip(state).text), "Осталось выплатить 125 000 сум");
  const closed = Y.normalizePayoutState({ ...FRESH, basis: "saved", text: "Выплачено 475 000 из 600 000" });
  assert.equal(Y.payoutNote(closed), null, "the closed month keeps its chip, no extra sentence");
  assert.equal(plain(Y.payoutHeadline(closed)), "Осталось выплатить 125 000 сум из 600 000 сум", "the window of the payout: ONE line, two figures for a part paid");
  assert.equal(plain(Y.sheetPayoutChip(closed).text), "Осталось выплатить 125 000 сум");
  signIn({ org_role: "owner" });
  const { SheetPayoutBlock } = component("payroll/payout-block.tsx");
  const render = (payout) => html(React.createElement(SheetPayoutBlock, { sheetId: "s1", month: "2026-11", teacherName: "Каримова К.", payout, onChanged() {} }));
  const block = plain(textOf(render(FRESH)));
  assert.ok(block.includes("Осталось выплатить 125 000 сум"));
  assert.ok(!block.includes("Месяц открыт: начислено сейчас"), "the server's sentence repeats the card's «Начислено на сегодня» and the chip");
  assert.equal((block.match(/600\s000/g) || []).length, 0, "the accrued sum is the card's, not the block's");
  assert.equal((block.match(/475\s000/g) || []).length, 0, "no payouts listed here: nothing says the paid sum twice");
  assert.ok(!/<dl/.test(render(FRESH)), "no list of figures");
  const closedBlock = plain(textOf(render({ ...FRESH, basis: "saved", text: "x" })));
  assert.ok(closedBlock.includes("Осталось выплатить 125 000 сум") && !closedBlock.includes("К выплате"), "a closed month: the chip only, the sum is the card's");
});

// ── D-3 (walk of 05.11): the block of «Выплата» says every number once ──────────────────────────────

const itemOf = (amount) => ({ id: "p1", sheet_id: "s1", teacher_id: "t1", month: "2026-11", amount, paid_on: "2026-11-03", method: "cash", note: null, sheet_revision: 1, sheet_total: 1, created_by_name: "Арслан", created_at: null, voided_at: null, void_reason: null });
const stateOf = (extra) => ({ saved_total: 860000, fresh_total: 860000, target: 860000, paid: 0, balance: 860000, state: "unpaid", basis: "saved", changed_by: 0, change_text: null, text: "x", items: [], carry_in: 0, carry_used: 0, advance_out: 0, ...extra });
const wordsOf = (payout) => {
  signIn({ org_role: "owner" });
  const { SheetPayoutBlock } = component("payroll/payout-block.tsx");
  return plain(textOf(html(React.createElement(SheetPayoutBlock, { sheetId: "s1", month: "2026-11", teacherName: "Каримова К.", payout, onChanged() {} }))));
};
const times = (text, number) => (text.match(new RegExp(`(?<!\\d\\s?)${number.toLocaleString("ru-RU").replace(/\s/g, "\\s")}(?![\\d])`, "g")) || []).length;

test("D-3 (а): an OPEN month overpaid - the chip «Переплачено 29 166», one hint of what it means, no sentence that says 120 834 / 150 000 / 29 166 again", () => {
  const open = stateOf({ saved_total: 45000, fresh_total: 120834, target: 120834, paid: 150000, balance: -29166, state: "overpaid", basis: "fresh", changed_by: 75834,
    text: "Месяц открыт: начислено сейчас 120 834, выплачено 150 000: переплачено 29 166", items: [itemOf(150000)] });
  const block = wordsOf(open);
  assert.equal(times(block, 29166), 1, block);
  assert.equal(times(block, 120834), 0, "«начислено сейчас» is the card's");
  assert.equal(times(block, 150000), 1, "the payout is listed once");
  assert.ok(block.includes("Покроется начислениями до конца месяца; если останется — уменьшит следующую выплату."));
  assert.ok(!block.includes("Месяц открыт:"));
});

test("D-3 (б): a CLOSED month overpaid - the chip says 16 666, the line says what happens to it, without the number", () => {
  const closed = stateOf({ saved_total: 860000, target: 860000, paid: 876666, balance: -16666, state: "overpaid", advance_out: 16666, items: [itemOf(876666)] });
  const block = wordsOf(closed);
  assert.equal(times(block, 16666), 1, block);
  assert.equal(times(block, 876666), 1, "listed once");
  assert.equal(times(block, 860000), 0, "«К выплате» is the card's");
  assert.ok(block.includes("Вычтем из следующей выплаты"));
  assert.ok(!block.includes("К выплате") && !block.includes("Аванс 16"));
});

test("D-3 (в): a part paid - one chip «Осталось выплатить 116 667», no «из 993 333», no three signed figures", () => {
  const part = stateOf({ saved_total: 993333, target: 993333, paid: 876666, balance: 116667, state: "due", items: [itemOf(876666)] });
  const block = wordsOf(part);
  assert.equal(times(block, 116667), 1, block);
  assert.equal(times(block, 993333), 0);
  assert.equal(times(block, 876666), 1);
  assert.ok(!block.includes("К выплате") && !block.includes("Выплачено 876"));
});

test("D-3: nothing paid, all paid, covered by the advance of the earlier months - the chip and one line, each sum once", () => {
  assert.ok(wordsOf(stateOf()).includes("Не выплачено") && !wordsOf(stateOf()).includes("860"), "unpaid: the sum is the card's");
  assert.ok(wordsOf(stateOf({ paid: 860000, balance: 0, state: "settled", items: [itemOf(860000)] })).includes("Выплачено полностью"));
  assert.ok(wordsOf(stateOf({ basis: "fresh", paid: 860000, balance: 0, state: "settled", items: [itemOf(860000)] })).includes("На сегодня выплачено всё"), "an open month never says «полностью»");
  const covered = wordsOf(stateOf({ saved_total: 150000, target: 0, paid: 0, balance: 0, state: "settled", carry_in: 150000, carry_used: 150000 }));
  assert.ok(covered.includes("Закрыто авансом"));
  assert.equal(times(covered, 150000), 1, covered);
  const carry = wordsOf(stateOf({ saved_total: 100000, target: 70000, balance: 70000, carry_in: 30000, carry_used: 30000 }));
  assert.equal(times(carry, 30000), 1, "the advance of the earlier months is named once, with its sum");
  assert.ok(carry.includes("Осталось выплатить 70 000 сум"), "with an advance taken off the payable sum is not the card's: the chip says it");
  assert.equal(times(carry, 100000), 0);
  assert.ok(carry.includes("к выплате меньше на эту сумму"));
});

// ── D-2 (walk of 05.11): the card of an OPEN month ─────────────────────────────────────────────────

test("D-2: an open month's card says «Начислено на сегодня 120 834» (the fresh number), the saved 45 000 is a small line - no «К выплате» of the saved total; a closed month is as before", () => {
  signIn({ org_role: "owner" });
  const { SheetSummaryCard } = component("payroll/sheet-summary.tsx");
  const open = stateOf({ saved_total: 45000, fresh_total: 120834, target: 120834, paid: 150000, balance: -29166, state: "overpaid", basis: "fresh", changed_by: 75834 });
  const card = (payout, extra = {}) => {
    const props = { sheet: sheet({ month: "2026-11", total_amount: 45000, stale: true, updated_at: "2026-11-03T05:00:00", payout }), total: 45000, accrued: 0, busy: false, onPrimary() {}, onPrint() {}, ...extra };
    props.status = extra.status ?? R.sheetCardStatus({ saved: true, stale: true, dirty: false, updatedAt: "2026-11-03T05:00:00", delta: payout ? payout.changed_by : null });
    return plain(textOf(html(React.createElement(SheetSummaryCard, props))));
  };
  const text = card(open);
  assert.ok(text.includes("Начислено на сегодня"));
  assert.ok(text.includes("120 834 сум"));
  assert.ok(text.includes("Сохранено 3 ноября: 45 000 сум (+75 834)"), text);
  assert.ok(!text.includes("К выплате"), "the saved total is never «К выплате» in an open month");
  assert.equal(times(text, 45000), 2, "the saved sum once on the screen + once in the print-only total (a document with ONE total, UX pack №3)");
  assert.ok(text.includes("Итог ведомости"), "the printed document names its total");
  assert.ok(!text.includes("Сохранить новую сумму"), "the button that saves the new sum is the one of the block «Что нужно сделать», not the card's");
  // the same month, nothing changed since the saving: the fresh number is the saved one, no small line
  const same = card({ ...open, fresh_total: 45000, target: 45000, changed_by: 0, balance: -105000 }, { status: R.sheetCardStatus({ saved: true, stale: false, dirty: false, updatedAt: "2026-11-03T05:00:00", delta: null }) });
  assert.ok(same.includes("Начислено на сегодня") && !same.includes("Сохранено 3 ноября"), same);
  // a closed month, a calculation not saved yet, a server that could not count the fresh total: «К выплате» as before
  assert.ok(card({ ...open, basis: "saved", fresh_total: 120834 }).includes("К выплате"));
  assert.ok(card(null).includes("К выплате"));
  assert.ok(card({ ...open, fresh_total: null, basis: "saved" }).includes("К выплате"));
  // unsaved edits: the total of the table, named as such - not «К выплате» of the saved sum and not «Начислено на сегодня»
  const dirty = card(open, { total: 50000, status: R.sheetCardStatus({ saved: true, stale: true, dirty: true, updatedAt: null, delta: null }) });
  assert.ok(dirty.includes("Итог с правками") && dirty.includes("50 000 сум") && !dirty.includes("Начислено на сегодня") && !dirty.includes("К выплате"), dirty);
});

test("D-2: the headline is told by the server's fields (`basis`), not by the dates of the browser", () => {
  const h = (payout, extra = {}) => {
    const out = Y.sheetHeadline({ total: 45000, dirty: false, payout, updatedAt: "2026-11-03T05:00:00", ...extra });
    return { ...out, saved: out.saved === null ? null : plain(out.saved) };
  };
  assert.deepEqual(h(stateOf({ basis: "fresh", saved_total: 45000, fresh_total: 120834, changed_by: 75834 })), { label: "Начислено на сегодня", value: 120834, saved: "Сохранено 03.11: 45 000 сум" });
  assert.deepEqual(h(stateOf({ basis: "saved", saved_total: 45000, fresh_total: 120834, changed_by: 75834 })), { label: "К выплате", value: 45000, saved: null });
  assert.deepEqual(h(undefined), { label: "К выплате", value: 45000, saved: null });
  // no date known: the sum is still said
  assert.equal(h(stateOf({ basis: "fresh", saved_total: 45000, fresh_total: 120834, changed_by: 75834 }), { updatedAt: null }).saved, "Сохранено: 45 000 сум");
  const src = read("src/lib/payroll-logica.ts");
  const body = src.slice(src.indexOf("export function sheetHeadline"), src.indexOf("export const RESAVE_LABEL"));
  assert.doesNotMatch(body, /new Date|Date\.now|formatBusinessDate\(|isOpenMonth/, "no clock in the rule");
});

test("R3 item 11: a payout above what is accrued needs the owner's yes («больше начисленного сейчас»); the closed month keeps «больше остатка»", () => {
  assert.equal(plain(Y.payoutOverpayQuestion(25000, "fresh")), "Это на 25 000 сум больше начисленного сейчас — запишем как выплату вперёд: она покроется начислениями до конца месяца; если останется — уменьшит следующую выплату.");
  assert.equal(plain(Y.payoutOverpayQuestion(25000, "saved")), "Это на 25 000 сум больше остатка — запишем как выплату вперёд и вычтем из следующей выплаты.");
  assert.equal(plain(Y.payoutOverpayQuestion(25000)), "Это на 25 000 сум больше остатка — запишем как выплату вперёд и вычтем из следующей выплаты.");
  assert.deepEqual(Y.buildPayoutBody({ amount: "150 000", paidOn: "2026-11-05", method: "cash", note: "" }, 25000), { amount: 150000, paid_on: "2026-11-05", method: "cash", confirm_overpay: true, overpay: 25000 });
  assert.ok(!("confirm_overpay" in Y.buildPayoutBody({ amount: "150 000", paidOn: "2026-11-05", method: "cash", note: "" })), "never sent by default");
});

// ── D-2 of the LIST (walk of 05.11, second part): the row and the head of the list say what the sheet says ─────────────────

const rowOf = (payout, extra = {}) => ({ teacher_id: "t1", teacher_name: "Эргашев К.", lessons_count: 9, lesson_types: [], rates: { group: "50" }, missing_rates: [], warnings: {},
  sheet: { id: "s1", revision: 1, total_amount: payout.saved_total, stale: payout.changed_by !== 0, updated_at: "2026-11-03T05:00:00" }, payout, ...extra });
// the server of the walk: November is open, saved 45 000, accrued now 120 834, paid 150 000 (the list said «переплачено 105 000», the sheet 29 166)
const OPEN_NOV = stateOf({ saved_total: 45000, fresh_total: 120834, target: 120834, paid: 150000, balance: -29166, state: "overpaid", basis: "fresh", changed_by: 75834, items: [itemOf(150000)] });
const CLOSED_SEP = stateOf({ saved_total: 860000, target: 860000, paid: 860000, balance: 0, state: "settled", basis: "saved", changed_by: 0 });

test("D-2 list: the sum of an open month's row is what is accrued now; the tiles say the same and the rest is the balance of the rows (29 166 ahead, not 105 000)", () => {
  const teachers = [rowOf(OPEN_NOV)];
  assert.deepEqual(R.teacherMonthSum(teachers[0]), { amount: 120834, fresh: true });
  const tiles = (month, list, open) => Object.fromEntries(R.monthTotals(month, list, open).tiles.map((tile) => [tile.key, tile.value]));
  assert.deepEqual(tiles("2026-11", teachers, true), { accrued: 120834, paid: 150000, left: 0, ahead: 29166 });
  // the tiles are one arithmetic: accrued - paid = what is paid ahead
  assert.equal(tiles("2026-11", teachers, true).accrued - 150000, -29166);
  assert.equal(plain(Y.payoutChip(Y.normalizePayoutState(OPEN_NOV)).text), "Выплачено вперёд 29 166 сум", "the chip of the row = the chip of the block of the sheet");
  assert.equal(plain(Y.sheetPayoutChip(Y.normalizePayoutState(OPEN_NOV)).text), "Выплачено вперёд 29 166 сум");
  // a closed month: the saved sum, «К выплате», as before; a month with no payout field (an older server) too
  assert.deepEqual(R.teacherMonthSum(rowOf(CLOSED_SEP)), { amount: 860000, fresh: false });
  assert.equal(R.monthTotals("2026-09", [rowOf(CLOSED_SEP)], false).tiles[0].label, "К выплате за сентябрь");
  assert.deepEqual(R.teacherMonthSum({ sheet: { total_amount: 1000 } }), { amount: 1000, fresh: false });
  // one open + one closed in a month: the sum is each teacher's own (accrued now / saved)
  assert.equal(tiles("2026-10", [rowOf(OPEN_NOV), rowOf(CLOSED_SEP)], false).accrued, 120834 + 860000);
  // the server could not count the fresh total (a rate is missing): the saved sum stands
  assert.deepEqual(R.teacherMonthSum(rowOf({ ...OPEN_NOV, basis: "saved", fresh_total: null })), { amount: 45000, fresh: false });
  assert.equal(tiles("2026-11", [{ sheet: null }], true).accrued, 0);
});

test("D-2 list: the row of an open month says «начислено сейчас» under the sum, the chip says the balance of the sheet; the row of a closed month is as before", () => {
  signIn({ org_role: "owner" });
  const { TeacherRow } = component("payroll/payroll-month-page.tsx");
  const draw = (payout) => plain(textOf(html(React.createElement(TeacherRow, { teacher: rowOf(payout), month: "2026-11", busy: false, onCalculate() {}, onOpen() {} }))));
  const open = draw(OPEN_NOV);
  assert.ok(open.includes("120 834 сум") && open.includes("начислено сейчас") && open.includes("вперёд 29 166"), open);
  assert.ok(open.includes("было 45 000") && open.includes("Требует действия · 1"), "the change after the saving is said ONCE: under the number («было …»); the item to save it is in the chip");
  assert.ok(!open.includes("изменилось на") && !open.includes("Изменилась"), "not a chip of its own");
  assert.equal(times(open, 45000), 1, "the saved sum is said once, as «было»");
  assert.equal(times(open, 105000), 0, "the old number of the list");
  const closed = draw(CLOSED_SEP);
  assert.ok(closed.includes("860 000 сум") && !closed.includes("начислено сейчас"), closed);
});

// ── 4а: the line of a payout says its KIND, never the state of the month ───────────────────────────────

test("4а: a payout above the sum of the month is marked «аванс» / «с авансом» (the kind); the person's own note is a quotation, so «выплачено полностью» in it cannot read as a state next to «Переплачено»", () => {
  const items = [{ ...itemOf(500000), id: "a" }, { ...itemOf(376666), id: "b", note: "выплачено полностью" }, { ...itemOf(50000), id: "c" }, { ...itemOf(10000), id: "d", voided_at: "2026-11-04T10:00:00" }];
  const state = Y.normalizePayoutState(stateOf({ saved_total: 860000, target: 860000, paid: 926666, balance: -66666, state: "overpaid", items }));
  assert.equal(Y.payoutKindMark(state, { id: "a" }), null, "500 000 of 860 000: an ordinary payout");
  assert.equal(Y.payoutKindMark(state, { id: "b" }), "с авансом", "the payout that crosses 860 000");
  assert.equal(Y.payoutKindMark(state, { id: "c" }), "аванс", "after the month is covered everything is an advance");
  assert.equal(Y.payoutKindMark(state, { id: "d" }), null, "a cancelled payout is not counted");
  assert.equal(Y.payoutKindMark({ items: [], target: 0 }, { id: "z" }), null);
  // a month covered by the advance of earlier months (target 0): every payout is an advance
  assert.equal(Y.payoutKindMark({ items: [itemOf(1000)], target: 0 }, { id: "p1" }), "аванс");
  const block = wordsOf(stateOf({ saved_total: 860000, target: 860000, paid: 876666, balance: -16666, state: "overpaid", advance_out: 16666, items: [{ ...itemOf(876666), note: "выплачено полностью" }] }));
  assert.ok(block.includes("Выплачено больше на 16 666 сум") && block.includes("с авансом"), block);
  assert.ok(block.includes("«выплачено полностью»"), "the note is shown as the person's own words in quotation marks");
  assert.ok(!/ · выплачено полностью/.test(block), "not as a bare status after the line of the payout");
  const plainPayout = wordsOf(stateOf({ paid: 100000, balance: 760000, state: "due", items: [itemOf(100000)] }));
  assert.ok(!plainPayout.includes("аванс"), "an ordinary payout has no mark");
});

// ── 4б: the counts belong to the saved sheet ─────────────────────────────────────────────────────────

test("4б + R2-2в: in an open month the counts follow «Сохранено 03.11: 45 000 сум —», the rate stays outside, and there is no bracket inside a bracket", () => {
  assert.equal(plain(Y.savedFactsLine("Сохранено 03.11: 45\u00a0000 сум", ["Ставка: Группа 50%", "засчитано 3 посещения"])), "Сохранено 03.11: 45 000 сум — засчитано 3 посещения · Ставка: Группа 50%");
  assert.equal(plain(Y.savedFactsLine("Сохранено 03.11: 45\u00a0000 сум", ["Ставка: Группа 50%", "засчитано 3 посещения", "без оплаты 8 посещений у 1 ученика"])), "Сохранено 03.11: 45 000 сум — засчитано 3 посещения, без оплаты 8 посещений у 1 ученика · Ставка: Группа 50%");
  assert.equal(Y.savedFactsLine("Сохранено: 1", ["Ставка: Группа 50%"]), "Сохранено: 1 · Ставка: Группа 50%");
  // the line of the walk: a count that carries a bracket of its own (and «начислено …» of the unpaid one) never lands inside another bracket
  const walk = plain(Y.savedFactsLine("Сохранено 05.11: 120\u00a0834 сум", ["Ставка: Группа 50%", "засчитано 7 посещений", "без оплаты 1 посещение у 1 ученика (начислено 1)", "не решено 3 посещения (в сумму не входят)"]));
  assert.equal(walk, "Сохранено 05.11: 120 834 сум — засчитано 7 посещений, без оплаты 1 посещение у 1 ученика (начислено 1), не решено 3 посещения (в сумму не входят) · Ставка: Группа 50%");
  let depth = 0;
  for (const char of walk) { depth += char === "(" ? 1 : char === ")" ? -1 : 0; assert.ok(depth <= 1, `a bracket inside a bracket: ${walk}`); }
  signIn({ org_role: "owner" });
  const { SheetSummaryCard } = component("payroll/sheet-summary.tsx");
  const open = stateOf({ saved_total: 45000, fresh_total: 120834, target: 120834, paid: 0, balance: 120834, state: "unpaid", basis: "fresh", changed_by: 75834 });
  const card = (payout) => plain(textOf(html(React.createElement(SheetSummaryCard, { sheet: sheet({ month: "2026-11", total_amount: 45000, stale: true, counted_total: 3, payout }), total: 45000, accrued: 0, busy: false, onPrimary() {}, onPrint() {},
    status: R.sheetCardStatus({ saved: true, stale: true, dirty: false, updatedAt: "2026-11-03T05:00:00", delta: 75834 }) }))));
  const text = card(open);
  assert.ok(text.includes("Сохранено 3 ноября: 45 000 сум (+75 834)") && text.includes("Что изменилось") && text.includes("Сохранённая версия: засчитано 3 посещения"), text);
  assert.ok(!/сум · .*засчитано 3 посещения/.test(text), "the counts are not left next to «Начислено на сегодня» on their own: they are under «Что изменилось»");
  // a closed month: the counts are the sheet's own, the line is as it was
  const closed = card(CLOSED_SEP);
  assert.ok(closed.includes("засчитано 3 посещения") && !closed.includes("Сохранено 3 ноября"), closed);
});

// ── round 3 (re-walk of 05.11): a REOPENED month is closed again by a save, also when nothing changed ──────────────────────

test("round 3: the status of a sheet in a reopened month has the button always («Сохранить и закрыть месяц»); a closed or ordinary month does not; a sheet that moved keeps its button", () => {
  const base = { saved: true, dirty: false, updatedAt: "2026-11-03T05:00:00", delta: null };
  assert.equal(R.sheetCardStatus({ ...base, stale: false, reopened: true }).action, "recalculate", "nothing changed, the month is open: the save is what closes it");
  assert.equal(R.sheetCardStatus({ ...base, stale: false, reopened: true }).tone, "saved", "the status line is the usual «Сохранено …»");
  assert.equal(R.sheetCardStatus({ ...base, stale: false }).action, null, "a closed / ordinary month: no button without a change");
  assert.equal(R.sheetCardStatus({ ...base, stale: false, reopened: false }).action, null);
  assert.equal(R.sheetCardStatus({ ...base, stale: true, delta: 5000, reopened: true }).action, "recalculate");
  assert.equal(R.sheetCardStatus({ ...base, stale: true, delta: 5000, reopened: true }).tone, "changed", "a sheet that moved says so");
  assert.equal(R.sheetCardStatus({ ...base, stale: false, reopened: true, dirty: true }).action, null, "unsaved edits: the bar of the page saves them");
  assert.equal(R.sheetCardStatus({ saved: false, stale: null, dirty: false, updatedAt: null, delta: null, reopened: true }).action, "save", "a calculation not saved yet: «Сохранить»");
  assert.equal(CP.CLOSE_MONTH_LABEL, "Сохранить и закрыть месяц");
});

test("round 3: the card of a sheet names the button by the state of the month - «Сохранить и закрыть месяц» in a reopened one; a moved sheet of a month that is not reopened is saved by the block «Что нужно сделать»", () => {
  signIn({ org_role: "owner" });
  const { SheetSummaryCard } = component("payroll/sheet-summary.tsx");
  const card = (period, stale, reopened) => plain(textOf(html(React.createElement(SheetSummaryCard, { sheet: sheet({ stale }), total: 475000, accrued: 0, busy: false, onPrimary() {}, onPrint() {}, period,
    status: R.sheetCardStatus({ saved: true, stale, dirty: false, updatedAt: "2026-11-03T05:00:00", delta: stale ? 5000 : null, reopened }) }))));
  const reopenedView = CP.periodView({ state: "reopened", closedOn: "2026-11-03", reopened: null });
  assert.ok(card(reopenedView, false, true).includes("Сохранить и закрыть месяц"));
  assert.ok(!card(reopenedView, false, true).includes("Пересохранить"));
  // a reopened month that also moved: the ONE button is the block's («Сохранить и закрыть месяц»), the card has none
  assert.ok(!card(reopenedView, true, true).includes("Сохранить и закрыть месяц Сохранить"), "no second button");
  // a moved sheet of a month that is not reopened: the card has NO button of its own - «Сохранить новую сумму» is the button of the block «Что нужно сделать»
  assert.ok(!card(CP.periodView({ state: "open", closedOn: null, reopened: null }), true, false).includes("Сохранить новую сумму"));
  assert.equal(Y.RESAVE_LABEL, "Сохранить новую сумму");
  assert.ok(!card(CP.periodView({ state: "closed", closedOn: "2026-11-03", reopened: null }), false, false).includes("Сохранить и закрыть месяц"));
});

test("UX pack №3 / №19: the caption in the head of the table - «Показана сохранённая версия — 120 834 сум», only when the fresh total is not the saved one; the print has ONE total", () => {
  const moved = stateOf({ saved_total: 120834, fresh_total: 75834, target: 75834, basis: "fresh", changed_by: -45000 });
  const note = (payout) => Y.savedTableNote({ payout });
  assert.equal(plain(note(moved)), "Показана сохранённая версия — 120 834 сум");
  assert.equal(note(stateOf({ changed_by: 0 })), null, "nothing moved");
  assert.equal(note(stateOf({ fresh_total: null, changed_by: 5000 })), null, "the fresh total cannot be counted: nothing to compare");
  assert.equal(note(null), null);
  assert.equal(note(undefined), null);
  // a closed month whose data moved is the same: the table is the saved sheet there too
  assert.equal(plain(note(stateOf({ basis: "saved", saved_total: 860000, fresh_total: 900000, changed_by: 40000 }))), "Показана сохранённая версия — 860 000 сум");
  // the printed sheet: the saved total + ONE line about the accrual of today (an open month: «месяц идёт»)
  const print = Y.sheetPrintTotals({ payout: moved, today: "2026-11-05" });
  assert.deepEqual([print.label, print.value, plain(print.accruedLine)], ["Итог ведомости", 120834, "Начислено на 05.11: 75 834 сум (месяц идёт)"]);
  assert.match(plain(Y.sheetPrintTotals({ payout: stateOf({ basis: "saved", saved_total: 860000, fresh_total: 900000, changed_by: 40000 }), today: "2026-11-05" }).accruedLine), /^Начислено на 05\.11: 900 000 сум \(данные изменились после сохранения\)$/);
  assert.equal(Y.sheetPrintTotals({ payout: stateOf({ changed_by: 0 }), today: "2026-11-05" }), null, "nothing moved: the card prints as it is");
});


test("server a324010: `open_lesson_items[].teacherId` goes into «Открыть журнал» (`teacher=`), so «Кто провёл» starts with the teacher of the lesson", () => {
  const teacherId = "11111111-2222-3333-4444-555555555555";
  const item = { lessonDate: "2026-10-12", groupId: "g1", groupName: "7-А Алгебра", lessonId: "l1", kind: "missed", teacherId };
  const q = OL.openLessonsQuestion(OL.gateOfConfirmRefusal({ code: "OPEN_LESSONS_CONFIRM_REQUIRED", detail: { count: 1, items: [item] } }));
  assert.match(q.link.href, new RegExp(`&teacher=${teacherId}$`));
  const without = OL.openLessonsQuestion(OL.gateOfConfirmRefusal({ code: "OPEN_LESSONS_CONFIRM_REQUIRED", detail: { count: 1, items: [{ ...item, teacherId: undefined }] } }));
  assert.doesNotMatch(without.link.href, /teacher=/);
});
