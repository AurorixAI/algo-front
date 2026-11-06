// «Деньги-1 / А», closing of the re-audit (06.11): one date of a lesson on every money screen (С14), the reason field (required / optional as the SERVER asks, the error under the field),
// the sheet (С1, С18, С19), the payout (С6, С7), the day off (С8), the replace window (С9), the transfer (С15, the individual price), the accordion (С17), the small ones (Н3, Н5, Н8).
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const env = require("./helpers/money1-env.cjs");
const { React, html, textOf, lib, read, plain } = env;
const B = lib("business-time.ts");
const F = lib("payf.ts");
const P = lib("payroll.ts");
const Y = lib("payroll-logica.ts");
const OL = lib("open-lessons.ts");
const LR = lib("lesson-return.ts");
const PP = lib("payment-plan.ts");
const POL = lib("payroll-open-lessons.ts");

const src = (file) => fs.readFileSync(path.join(__dirname, "..", "src", file), "utf8");

// ── С14: ONE date of a lesson ───────────────────────────────────────────────────────────────────
test("С14: a lesson in a heading or a row is «чт, 5 ноября · 18:00», a record is «05.11.2026 · 18:00» - one utility, no «окт» / «ноя»", () => {
  assert.equal(B.formatLessonWhen({ date: "2026-11-05", startTime: "18:00" }), "чт, 5 ноября · 18:00");
  assert.equal(B.formatLessonWhen({ date: "2026-11-03", startTime: "11:00", endTime: "12:00", groupName: "7-А Алгебра" }), "7-А Алгебра · вт, 3 ноября · 11:00–12:00");
  assert.equal(B.formatRecordWhen("2026-11-05", "18:00"), "05.11.2026 · 18:00");
  // the screens that had their own forms speak through it now
  assert.equal(OL.formatLessonDate("2026-10-22"), "чт, 22 октября");
  assert.equal(F.dayOffLessonLine({ groupId: "g", groupName: "7-А Алгебра", lessonId: "l", date: "2026-11-23", startTime: "16:00", endTime: "17:00", reason: null }), "пн, 23 ноября · 16:00–17:00 · 7-А Алгебра");
  assert.equal(LR.returnTitle("2026-11-03"), "Вернуть урок вт, 3 ноября?");
  assert.equal(LR.returnReviewDoneText("2026-11-03"), "Урок вт, 3 ноября возвращён в «Уроки без отметки»");
  assert.match(POL.openLessonItemLine({ lessonDate: "2026-10-12", groupName: "7-А Алгебра", kind: "missed" }), /^пн, 12 октября · 7-А Алгебра/);
  assert.equal(F.dayOffSpan({ dateFrom: "2026-11-23", dateTo: "2026-11-23" }), "23.11.2026", "a record keeps the year (Н3)");
});

test("С14: the replace window says the day of the old payment as the field under it does (05.11.2026), the sheet says «Сохранено 05.11.2026 · 10:00»", () => {
  const line = PP.replaceChangeLine({ amount: 400000, paid_on: "2026-11-05", method: "cash" }, { amount: "200 000", paidOn: "2026-11-05", method: "cash" });
  assert.match(line.was, /05\.11\.2026/);
  assert.match(src("lib/payroll.ts"), /`Сохранено \$\{day\} · \$\{time\}`/);
});

test("С14: no money screen has a form of its own for the date of a lesson (the short «окт», «DD.MM» of a lesson, the old «в 10:00»)", () => {
  for (const file of ["lib/open-lessons.ts", "lib/lesson-return.ts", "lib/payroll-open-lessons.ts", "lib/payf.ts", "components/attendance/open-lessons-view.tsx", "components/schedule/day-off-dialog.tsx"]) {
    const text = src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(text, /formatDateRu\([^)]*\)\.slice\(0, 5\)/, `${file}: DD.MM of a lesson`);
  }
  assert.equal(OL.sortOpenLessons([{ lessonDate: "2026-10-22", startTime: "10:00", groupName: "Б" }, { lessonDate: "2026-10-19", startTime: "10:00", groupName: "А" }]).map((item) => item.lessonDate).join(), "2026-10-19,2026-10-22", "oldest first, as the months go (Н6)");
});

// ── the reason: what the SERVER asks (table of the report) ─────────────────────────────────────
test("the reason: the field says «обязательно» where the server asks 3..500 characters and «необязательно» where it does not; the error is under the field", () => {
  const field = lib("../components/money/reason-field.tsx");
  const required = textOf(html(React.createElement(field.ReasonField, { id: "r", value: "", onChange() {}, required: true, error: field.reasonFieldError("", true) })));
  assert.match(required, /Причина \(обязательно\)/);
  assert.match(required, /Укажите причину — не короче 3 символов/);
  const optional = textOf(html(React.createElement(field.ReasonField, { id: "r", value: "", onChange() {}, required: false })));
  assert.match(optional, /Причина \(необязательно\)/);
  assert.equal(field.reasonFieldError("ав", false), null, "an untouched field has no error");
  assert.equal(field.reasonFieldError("ав", true), field.REASON_SHORT_TEXT);
  assert.equal(field.reasonFieldError("авв", true), null);
  assert.equal(field.reasonFieldError("", true, false), null, "an optional reason never shows an error");
  const markup = html(React.createElement(field.ReasonField, { id: "r", value: "", onChange() {}, required: true, error: field.REASON_SHORT_TEXT }));
  assert.match(markup, /aria-invalid="true"/);
  assert.match(markup, /aria-describedby="r-error"/);
  assert.match(markup, /border-red-500/);
});

test("the reason: the windows use the field - cancel of a payment / of a forgiveness / of a refund and the forgiveness itself: required; refund and replace: optional (as the server)", () => {
  for (const file of ["components/payments/record-void-modal.tsx", "components/payments/writeoff-dialog.tsx"]) {
    const text = src(file);
    const at = text.indexOf("<ReasonField");
    const element = text.slice(at, text.indexOf("/>", at));
    assert.match(element, /\srequired\s/, `${file}: the reason is required (a bare \`required\`, not required={false})`);
  }
  assert.match(src("components/payments/refund-dialog.tsx"), /Причина <span[^>]*>\(необязательно\)/);
  assert.match(src("components/payments/payment-dialog.tsx"), /Причина исправления <span[^>]*>\(необязательно\)/);
  assert.match(src("components/schedule/day-off-dialog.tsx"), /Причина <span[^>]*>\(обязательно\)/);
});

// ── the sheet ───────────────────────────────────────────────────────────────────────────────────
test("С1: the saved sum is said once (no «−45 000» in the card), the undecided lessons are an item with their number, not a tail of «Ставка»", () => {
  const payout = { saved_total: 120834, fresh_total: 75834, target: 75834, paid: 150000, balance: -74166, state: "overpaid", basis: "fresh", changed_by: -45000, change_text: null, text: "x", items: [], carry_in: 0, carry_used: 0, advance_out: 0 };
  assert.equal(plain(Y.savedChangeLine({ payout, updatedAt: "2026-11-05T05:00:00" })), "Сохранено 05.11.2026: 120 834 сум");
  const sheet = { percents: { group: "50" }, divisor_default: 12, counted_total: 7, unpaid_total: 0, pending_excused_total: 0, undecided_total: 3, lines: [], groups: [], warnings: {}, total_amount: 1 };
  assert.ok(!P.sheetFactsParts(sheet, 0, null).some((part) => /ждут решения/.test(part)), "the facts say the rate and the counts only");
  const items = P.sheetTodoItems({ counts: null, undecidedVisits: 3, undecidedLessons: 1 });
  assert.equal(items[0].text, "1 дополнительный урок ждёт решения");
  assert.equal(P.sheetTodoItems({ counts: null, undecidedLessons: 2 })[0].text, "2 дополнительных урока ждут решения");
  assert.equal(P.sheetTodoItems({ counts: null, undecidedLessons: 5 })[0].text, "5 дополнительных уроков ждут решения");
});

test("С1: the caption of the table is the head of the table (no card of its own) and an empty table has none", () => {
  const text = src("components/payroll/sheet-table.tsx");
  assert.match(text, /data-testid="saved-table-note" className="px-1 text-xs font-semibold/);
  const empty = text.slice(text.indexOf("if (sheet.lines.length === 0)"), text.indexOf("const toggleDates"));
  assert.doesNotMatch(empty, /captionNode/, "nothing to say a version of");
});

test("С18: while an additional lesson waits, «Решить» is the filled button and «Сохранить новую сумму» an outline; with nothing to decide the saving is the filled one", () => {
  const block = lib("../components/payroll/sheet-todo.tsx");
  const changed = { key: "changed", text: "Зарплата изменилась на −45 000 сум", href: "/x", tone: "warning", hint: "", target: "", button: "Сохранить новую сумму" };
  const undecided = { key: "undecided", text: "1 дополнительный урок ждёт решения", href: "/owner/substitutions", tone: "warning", hint: "", target: "", button: "Решить" };
  const both = html(React.createElement(block.SheetTodoBlock, { items: [undecided, changed], onSave() {} }));
  assert.match(both, /data-testid="sheet-todo-link" data-main="true"/);
  assert.match(both, /data-testid="sheet-todo-save" data-main="false"/);
  const onlySave = html(React.createElement(block.SheetTodoBlock, { items: [changed], onSave() {} }));
  assert.match(onlySave, /data-testid="sheet-todo-save" data-main="true"/);
});

test("С19: the number in the chip «Требует действия · N» is the number of the lines of the block «Что нужно сделать» of the same month", () => {
  const warnings = { open_lessons: 1, pending_excused: 0, no_fee: 0, unpaid: 0 };
  const teacher = { warnings, undecided_lessons: 1, sheet: { id: "s1", stale: true, revision: 1 }, payout: { changed_by: -45000, fresh_total: 75834 } };
  const chip = P.rowStatus(teacher);
  const block = P.sheetTodoItems({ counts: warnings, undecidedLessons: 1, changed: P.changedItem(teacher) });
  assert.equal(chip.items.length, block.length);
  assert.equal(chip.label, "Требует действия", "no counter in the chip (owner 06.11)");
  assert.deepEqual(chip.items.map((item) => item.key), block.map((item) => item.key), "the same items in the same order");
});

test("С2: the print of the changed sheet is a paper document - room inside the frame, the total 14 pt, the notes 10 pt, no card colours", () => {
  const text = src("components/payroll/sheet-summary.tsx");
  assert.match(text, /print:border print:border-slate-500 print:px-3 print:py-2/);
  assert.match(text, /text-\[14pt\][^"]*tabular-nums/);
  assert.match(text, /text-\[10pt\]/);
  assert.match(text, /print:bg-transparent/);
});

test("Н2: the reopened month says one short sentence, the label says that the sum is the saved one", () => {
  const text = src("components/payroll/sheet-summary.tsx");
  assert.match(text, /Исправьте уроки — месяц закроется снова при сохранении/);
  assert.match(text, /К выплате \(сохранено\)/);
  assert.match(text, /min-h-10 w-full[^"]*sm:w-auto/);
});

// ── the payout ──────────────────────────────────────────────────────────────────────────────────
test("С6: the button of an overpay is «Записать выплату N», the sentence names the part that goes ahead, the hint of the full sum does not say «закрыта»", () => {
  assert.equal(plain(Y.payoutOverpayQuestion(50000)), "Это на 50 000 сум больше, чем осталось выплатить: эти 50 000 сум запишем как выплату вперёд и вычтем из следующей выплаты.");
  assert.equal(Y.PAYOUT_ADVANCE_LABEL, undefined, "one name of the action");
  const state = { balance: 125000, basis: "saved" };
  assert.equal(Y.payoutAfterText(125000, state), "Это вся сумма — останется выплатить 0 сум");
  assert.match(Y.payoutAfterText(130000, state), /больше, чем осталось выплатить/);
  const text = src("components/payroll/payout-dialog.tsx");
  assert.match(text, /primary=\{`\$\{PAYOUT_ACTION_LABEL\}\$\{amountText\}`\}/);
  assert.match(text, /месяц идёт/);
});

test("С7: the way of payment is one control in the payment, the payout and the refund; the payout puts it in a row of its own, the date and the note under it", () => {
  for (const file of ["components/payments/payment-dialog.tsx", "components/payroll/payout-dialog.tsx", "components/payments/refund-dialog.tsx"]) assert.match(src(file), /<SegmentedControl/, file);
  const payout = src("components/payroll/payout-dialog.tsx");
  assert.ok(payout.indexOf("payout-methods") < payout.indexOf("payout-paid-on"), "the way first, then the date");
  assert.doesNotMatch(payout, /role="radio"/, "no hand-made chips");
});

// ── the day off, the transfer, the small ones ─────────────────────────────────────────────────
test("С8: the day off has ONE heading over its list, a line about the money and a neutral note about the exams", () => {
  const text = src("components/schedule/day-off-dialog.tsx");
  assert.match(text, /testId="day-off-cancellable" hideTitle/);
  assert.match(text, /DAY_OFF_MONEY_LINE/);
  assert.equal(F.DAY_OFF_MONEY_LINE, "Ученикам перерасчёта нет, в зарплату преподавателей эти уроки не войдут.");
  assert.match(text, /data-testid="day-off-exams-note"><Info/);
  assert.doesNotMatch(text, /\{problem && <p className="text-xs text-slate-500">/, "the reason is not said twice");
});

test("С5: the note of an administrator without the money access is neutral (grey, «i»), not amber", () => {
  const text = src("components/attendance/open-lessons-view.tsx");
  const note = text.slice(text.indexOf('data-testid="open-lessons-no-right"'), text.indexOf('data-testid="open-lessons-no-right"') + 400);
  assert.match(note, /border-slate-200 bg-slate-50/);
  assert.doesNotMatch(note, /amber/);
  assert.equal(OL.OPEN_LESSONS_NO_RIGHT_NOTICE, "Отмечать посещаемость прошедших уроков может владелец или администратор с доступом к деньгам. Вам доступно «Урока не было» — в меню строки (⋯).");
});

test("С15: the bulk window of a transfer names the group in the heading and does not say «from» twice; the individual price of the old group is told only to a student who had one", () => {
  const drawer = src("components/groups/add-student-drawer.tsx");
  assert.match(drawer, /Перевести в «\$\{groupNames\[groupId\]\}»/);
  assert.doesNotMatch(drawer, /— из «\$\{t\.from\}»/);
  const modal = src("components/groups/assign-group-modal.tsx");
  assert.match(modal, /row\.price\?\.source === "override"/);
  assert.match(modal, /isTransfer && hadOverride/);
});

test("С17: below 1280 px the list of «Требует действия» opens INSIDE the card (an accordion); the floating layer stays for the table", () => {
  const text = src("components/payroll/row-status.tsx");
  assert.match(text, /\(max-width: 1279px\)/);
  assert.match(text, /data-inline="true"/);
});

test("Н3 Н4 Н5 Н8 Н10 Н11 Н13: the small texts", () => {
  assert.equal(F.DAY_OFF_NO_RIGHT_TEXT, "Назначает и отменяет владелец или администратор с доступом к деньгам. Список выходных виден вам, менять его нельзя.");
  assert.equal(lib("enrol-labels.ts").TRANSFER_NO_RIGHT_TEXT, "Переводить может владелец или администратор с доступом к деньгам.");
  assert.equal(P.monthSubtitle("2026-11", 3), "3 преподавателя");
  assert.deepEqual(read("src/components/payroll/payroll-month-page.tsx").match(/labels: \[[^\]]*\]/)[0].includes("Выплачено, сум"), true);
  assert.match(src("components/attendance/cancellation-kind-field.tsx"), /grid grid-cols-1 gap-2">/);
  assert.match(src("components/payments/refund-dialog.tsx"), /Возврат можно отменить\./);
  assert.match(src("components/payments/refund-dialog.tsx"), /Можно вернуть: <span className="font-semibold tabular-nums text-slate-900">/);
  assert.match(src("components/groups/assign-group-modal.tsx"), /pt-2 pb-4 overflow-y-auto/);
  assert.match(src("components/payments/money-access-denied.tsx"), /h-10 w-10/);
});
