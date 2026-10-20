/**
 * UX-1, stream B («Посещаемость»): the deadline in words with a tone and an urgency order, the «после срока» mark of a
 * late decision, whole words in the journal (no «Н/Б», «Ув.», «Ув.?») with a legend above the table, sentence-case headers,
 * «Подтвердить» and «Отклонить» side by side, the phone link.
 */
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
require.extensions[".tsx"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const lib = (name) => require(path.join(root, "src/lib", `${name}.ts`));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const { pluralRu } = lib("plural");
const deadline = lib("excuse-deadline");
const decision = lib("excuse-decision");
const marks = lib("attendance-marks");
const excuses = lib("attendance-excuses");

const TODAY = "2026-10-15";
const day = (offset) => {
  const [y, m, d] = TODAY.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
};
const dateDeadline = (daysLeft) => ({ kind: "date", date: day(daysLeft), overdue: daysLeft < 0, days_left: daysLeft });
const item = (value, over = {}) => ({ lesson_date: "2026-10-03", status: "pending", deadline: value, ...over });
const cell = (value, over) => deadline.excuseDeadlineCell(item(value, over), TODAY);
const brief = (c) => c && { headline: c.headline, tone: c.tone };

// ---- the shared plural helper -------------------------------------------------------------

test("pluralRu(n, one, few, many): 1 день, 2 дня, 5 дней, 11 дней, 21 день, 22 дня, 25 дней, 0 дней", () => {
  const days = (n) => pluralRu(n, "день", "дня", "дней");
  assert.deepEqual([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111, 112].map(days),
    ["дней", "день", "дня", "дня", "дней", "дней", "дней", "дней", "день", "дня", "дней", "день", "дней", "дней"]);
  assert.equal(days(-3), "дня", "the sign is ignored");
  assert.equal(days(2.9), "дня", "the fraction is ignored");
  assert.equal(days(Number.NaN), "дней");
});

// ---- the «Срок» column in words ------------------------------------------------------------

test("a calendar deadline reads «Осталось 25 дней» / «Срок сегодня» / «Срок прошёл 3 дня назад», the date is the small line", () => {
  assert.deepEqual(brief(cell(dateDeadline(25))), { headline: "Осталось 25 дней", tone: "neutral" });
  assert.deepEqual(brief(cell(dateDeadline(0))), { headline: "Срок сегодня", tone: "warn" });
  assert.deepEqual(brief(cell(dateDeadline(-3))), { headline: "Срок прошёл 3 дня назад", tone: "danger" });
  assert.equal(cell(dateDeadline(25)).sub, "до 09.11");
  assert.equal(cell(dateDeadline(-3)).sub, "до 12.10");
  assert.equal(cell(dateDeadline(0)).sub, "до 15.10");
});

test("the verb and the noun agree with the number: Остался 1 день, Осталось 2 дня, Осталось 5 дней, Остался 21 день", () => {
  const head = (n) => cell(dateDeadline(n)).headline;
  assert.equal(head(1), "Остался 1 день");
  assert.equal(head(2), "Осталось 2 дня");
  assert.equal(head(4), "Осталось 4 дня");
  assert.equal(head(5), "Осталось 5 дней");
  assert.equal(head(11), "Осталось 11 дней");
  assert.equal(head(21), "Остался 21 день");
  const ago = (n) => cell(dateDeadline(-n)).headline;
  assert.equal(ago(1), "Срок прошёл 1 день назад");
  assert.equal(ago(2), "Срок прошёл 2 дня назад");
  assert.equal(ago(5), "Срок прошёл 5 дней назад");
  assert.equal(ago(31), "Срок прошёл 31 день назад");
});

test("tones: grey above 7 days, amber at 7 days or less and today, red once passed", () => {
  const tone = (n) => cell(dateDeadline(n)).tone;
  assert.equal(tone(25), "neutral");
  assert.equal(tone(8), "neutral");
  assert.equal(tone(7), "warn");
  assert.equal(tone(1), "warn");
  assert.equal(tone(0), "warn");
  assert.equal(tone(-1), "danger");
  assert.equal(tone(-31), "danger");
  assert.equal(deadline.EXCUSE_DEADLINE_SOON_DAYS, 7);
});

test("days_left is optional (counted from the date); the server's overdue flag is trusted; the year shows only when it is another year", () => {
  assert.equal(cell({ kind: "date", date: "2026-10-31", overdue: false }).headline, "Осталось 16 дней");
  assert.equal(cell({ kind: "date", date: "2026-10-10", overdue: false }).headline, "Срок прошёл 5 дней назад");
  // flagged overdue by the server although the client counts a positive number: no invented number of days
  const flagged = cell({ kind: "date", date: "2026-10-25", overdue: true, days_left: 10 });
  assert.deepEqual(brief(flagged), { headline: "Срок прошёл", tone: "danger" });
  assert.equal(cell({ kind: "date", date: "2027-01-15", overdue: false, days_left: 92 }).sub, "до 15.01.2027");
  assert.equal(cell({ kind: "date", date: "2026-12-31", overdue: false, days_left: 77 }).sub, "до 31.12");
});

test("a lessons package: «Осталось 5 уроков» grey, the last lesson amber, fewer red; the line under it says it is a package", () => {
  const pick = (value) => brief(cell(value));
  assert.deepEqual(pick({ kind: "lessons", lessons_left: 5, urgent: false, due_now: false, overdue: false }), { headline: "Осталось 5 уроков", tone: "neutral" });
  assert.deepEqual(pick({ kind: "lessons", lessons_left: 3, urgent: false, due_now: false, overdue: false }), { headline: "Осталось 3 урока", tone: "neutral" });
  assert.deepEqual(pick({ kind: "lessons", lessons_left: 1, urgent: false, due_now: false, overdue: false }), { headline: "Остался 1 урок", tone: "neutral" });
  assert.deepEqual(pick({ kind: "lessons", lessons_left: 2, urgent: true, due_now: true, overdue: false }), { headline: "Последний урок для подтверждения", tone: "warn" });
  assert.deepEqual(pick({ kind: "lessons", lessons_left: 1, urgent: true, due_now: false, overdue: true }), { headline: "Срок прошёл", tone: "danger" });
  assert.deepEqual(pick({ kind: "lessons", lessons_left: 0, urgent: true, due_now: false, overdue: true }), { headline: "Срок прошёл", tone: "danger" });
  // an empty package nobody flagged is over; a server without due_now reads urgent as the last lesson
  assert.deepEqual(pick({ kind: "lessons", lessons_left: 0, urgent: false, overdue: false }), { headline: "Срок прошёл", tone: "danger" });
  assert.deepEqual(pick({ kind: "lessons", lessons_left: 2, urgent: true, overdue: false }), { headline: "Последний урок для подтверждения", tone: "warn" });
  for (const value of [
    { kind: "lessons", lessons_left: 5, urgent: false, due_now: false, overdue: false },
    { kind: "lessons", lessons_left: 0, urgent: true, due_now: false, overdue: true },
  ]) assert.equal(cell(value).sub, "по пакету уроков");
});

test("an older server (no deadline) or a broken value: the last day of the lesson's month is used; decided excuses have no deadline", () => {
  assert.deepEqual(brief(cell(undefined)), { headline: "Осталось 16 дней", tone: "neutral" });
  assert.deepEqual(brief(cell(null)), { headline: "Осталось 16 дней", tone: "neutral" });
  assert.equal(cell(undefined).sub, "до 31.10");
  assert.deepEqual(brief(cell(undefined, { lesson_date: "2026-09-20" })), { headline: "Срок прошёл 15 дней назад", tone: "danger" });
  for (const broken of [{}, { kind: "date" }, { kind: "date", date: "31.10" }, { kind: "lessons" }, { kind: "x" }, "soon", 7]) {
    assert.deepEqual(brief(cell(broken)), { headline: "Осталось 16 дней", tone: "neutral" }, JSON.stringify(broken));
  }
  assert.equal(cell(undefined, { lesson_date: "nope" }), null);
  for (const status of ["confirmed", "rejected"]) assert.equal(cell(dateDeadline(25), { status }), null, status);
});

test("the tooltip names the full date and says a late decision is allowed; no abbreviations like «дн.» anywhere", () => {
  const c = cell(dateDeadline(25));
  assert.equal(c.title, "Подтвердить пропуск нужно до 09.11.2026. После срока решение тоже можно принять.");
  const everything = [
    cell(dateDeadline(25)), cell(dateDeadline(0)), cell(dateDeadline(-3)),
    cell({ kind: "lessons", lessons_left: 5, urgent: false, due_now: false, overdue: false }),
    cell({ kind: "lessons", lessons_left: 2, urgent: true, due_now: true, overdue: false }),
  ];
  for (const one of everything) assert.doesNotMatch(`${one.headline} ${one.sub} ${one.title}`, /дн\.|ур\./);
});

test("urgency order: passed first (the longest ago first), then today, then the nearest; a package after the amber dates; unknown last", () => {
  const rows = [
    { id: "far", ...item(dateDeadline(25)) },
    { id: "ago3", ...item(dateDeadline(-3)) },
    { id: "pkg-ok", ...item({ kind: "lessons", lessons_left: 5, urgent: false, due_now: false, overdue: false }) },
    { id: "soon", ...item(dateDeadline(2)) },
    { id: "ago31", ...item(dateDeadline(-31)) },
    { id: "pkg-over", ...item({ kind: "lessons", lessons_left: 0, urgent: true, due_now: false, overdue: true }) },
    { id: "today", ...item(dateDeadline(0)) },
    { id: "pkg-last", ...item({ kind: "lessons", lessons_left: 2, urgent: true, due_now: true, overdue: false }) },
    { id: "unknown", lesson_date: "nope", status: "pending", deadline: null },
    { id: "week", ...item(dateDeadline(7)) },
  ];
  const sorted = deadline.sortExcusesByUrgency(rows, TODAY).map((row) => row.id);
  assert.deepEqual(sorted, ["ago31", "ago3", "pkg-over", "today", "pkg-last", "soon", "week", "pkg-ok", "far", "unknown"]);
  // a new array, the input is untouched
  assert.equal(rows[0].id, "far");
  assert.notEqual(deadline.sortExcusesByUrgency(rows, TODAY), rows);
});

test("equal deadlines keep the order the server sent", () => {
  const rows = ["a", "b", "c", "d"].map((id) => ({ id, ...item(dateDeadline(4)) }));
  assert.deepEqual(deadline.sortExcusesByUrgency(rows, TODAY).map((row) => row.id), ["a", "b", "c", "d"]);
  assert.deepEqual(deadline.sortExcusesByUrgency([], TODAY), []);
});

// ---- «после срока» -------------------------------------------------------------------------

test("a late decision is marked «после срока» with the deadline in the tooltip; false, null and an absent key show nothing", () => {
  const late = decision.afterDeadlineMark({ status: "confirmed", decided_after_deadline: true, deadline_at_decision: "2026-10-12" });
  assert.deepEqual(late, { label: "после срока", date: "12.10", title: "Решение принято после срока (до 12.10)" });
  assert.deepEqual(decision.afterDeadlineMark({ status: "rejected", decided_after_deadline: true, deadline_at_decision: null }),
    { label: "после срока", date: "", title: "Решение принято после срока" });
  assert.equal(decision.afterDeadlineMark({ status: "confirmed", decided_after_deadline: true, deadline_at_decision: "soon" }).title, "Решение принято после срока");
  for (const source of [
    { status: "confirmed", decided_after_deadline: false, deadline_at_decision: "2026-10-12" },
    { status: "confirmed", decided_after_deadline: null },
    { status: "confirmed" },
    {},
    null,
    undefined,
  ]) assert.equal(decision.afterDeadlineMark(source), null, JSON.stringify(source));
  // only a decided excuse is marked
  assert.equal(decision.afterDeadlineMark({ status: "pending", decided_after_deadline: true }), null);
  // a journal excuse has no `status` argument problem: the journal passes the whole excuse
  assert.notEqual(decision.afterDeadlineMark({ status: "confirmed", decided_after_deadline: true }), null);
});

test("the chip: small, neutral, with the tooltip; the date is in the DOM for a screen reader; absent mark renders nothing", () => {
  const { AfterDeadlineChip } = require(path.join(root, "src/components/attendance/after-deadline-chip.tsx"));
  const mark = decision.afterDeadlineMark({ status: "confirmed", decided_after_deadline: true, deadline_at_decision: "2026-10-12" });
  const html = renderToStaticMarkup(React.createElement(AfterDeadlineChip, { mark }));
  assert.match(html, /title="Решение принято после срока \(до 12\.10\)"/);
  assert.equal(textOf(html), "после срока (до 12.10)");
  assert.match(html, /class="sr-only"> \(до 12\.10\)</);
  assert.match(html, /border-slate-200 bg-slate-50 text-slate-600/, "neutral, not a warning");
  assert.doesNotMatch(html, /rose|amber|red-/);
});

test("the page and the journal show the mark only for decided excuses; the types are optional", () => {
  const page = read("src/components/attendance/excuses-page.tsx");
  assert.match(page, /const lateMark = pendingTab \? null : afterDeadlineMark\(item\);/);
  assert.match(page, /\{lateMark && <div className="mt-1 flex"><AfterDeadlineChip mark=\{lateMark\} \/><\/div>\}/);
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /afterDeadlineMark\(excuse\) && <div className="mt-1\.5 flex"><AfterDeadlineChip mark=\{afterDeadlineMark\(excuse\)!\} \/><\/div>/);
  assert.match(journal, /const late = withLate \? afterDeadlineMark\(excuse\) : null;\s*if \(late\) lines\.push\(late\.title\);/);
  const api = read("src/lib/api.ts");
  assert.equal((api.match(/decided_after_deadline\?: boolean \| null;/g) || []).length, 2, "the list item and the journal excuse");
  assert.equal((api.match(/deadline_at_decision\?: string \| null;/g) || []).length, 2);
});

// ---- whole words in the journal -------------------------------------------------------------

test("label map: a mark and a decision read the same in a cell, in the menu and in the legend", () => {
  assert.deepEqual(marks.MARK_CELL_LABEL, { present: "Был", late: "Опоздал", absent: "Не был", excused: "Уважительная" });
  assert.deepEqual(marks.MARK_MENU_LABEL, { present: "Был на уроке", late: "Опоздал", absent: "Не был", excused: "Уважительная причина" });
  assert.deepEqual(marks.EXCUSE_REVIEW_LABEL, { pending: "Ждёт решения", confirmed: "Подтверждена", rejected: "Отклонена" });
  for (const [status, label] of Object.entries(marks.EXCUSE_REVIEW_LABEL)) {
    assert.deepEqual(excuses.excuseCellView(status), { label, tone: status });
  }
  assert.deepEqual(excuses.excuseCellView(undefined), { label: "Уважительная", tone: "plain" });
  assert.deepEqual(excuses.excuseCellView(null), { label: "Уважительная", tone: "plain" });
  // no abbreviation, no glyph in any word
  const all = [...Object.values(marks.MARK_CELL_LABEL), ...Object.values(marks.MARK_MENU_LABEL), ...Object.values(marks.EXCUSE_REVIEW_LABEL), ...Object.values(marks.EXCUSE_REVIEW_MEANING)];
  for (const word of all) assert.doesNotMatch(word, /Н\/Б|Ув\.|[?✓✗]/, word);
  // the longest word still has to fit a cell: 12 characters (see the measured widths in the report)
  for (const word of [...Object.values(marks.MARK_CELL_LABEL), ...Object.values(marks.EXCUSE_REVIEW_LABEL)]) assert.ok(word.length <= 12, word);
});

test("the journal takes its words from the map: no «Н/Б», «Ув.», «Ув.?» in what a person reads", () => {
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /short: MARK_CELL_LABEL\.absent,\s*label: MARK_MENU_LABEL\.absent,/);
  assert.match(journal, /short: MARK_CELL_LABEL\.excused,\s*label: MARK_MENU_LABEL\.excused,/);
  assert.doesNotMatch(journal, /Н\/Б|«Ув\.»|"Ув\./);
  assert.match(journal, /Нажмите на отметку «Уважительная» у ученика/);
});

test("the legend explains every symbol the cells show, and sits above the table", () => {
  const { AttendanceLegend } = require(path.join(root, "src/components/groups/attendance-legend.tsx"));
  const styles = ["present", "late", "absent", "excused"].map((value) => ({ value, className: "bg-x border-x hover:bg-y", dotClassName: "bg-dot" }));
  const tones = { pending: "t-pending hover:bg-1", confirmed: "t-confirmed hover:bg-2", rejected: "t-rejected hover:bg-3" };
  const html = renderToStaticMarkup(React.createElement(AttendanceLegend, { marks: styles, decisionTones: tones }));
  const text = textOf(html);
  for (const word of [...Object.values(marks.MARK_CELL_LABEL), ...Object.values(marks.EXCUSE_REVIEW_LABEL), ...Object.values(marks.EXCUSE_REVIEW_MEANING)]) {
    assert.ok(text.includes(word), `the legend names «${word}»`);
  }
  assert.match(html, /role="group" aria-label="Обозначения в журнале"/);
  assert.doesNotMatch(html, /hover:/, "a sample is not a button");
  assert.match(html, /t-confirmed/, "the colour of a decision is the colour of its cell");
  // every word a cell can show is in the legend
  const cellWords = new Set([
    ...Object.values(marks.MARK_CELL_LABEL),
    ...["pending", "confirmed", "rejected", undefined].map((status) => excuses.excuseCellView(status).label),
  ]);
  for (const word of cellWords) assert.ok(text.includes(word), `a cell can say «${word}»`);
  // above the table, only when there is a table
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /<AttendanceLegend\s+marks=\{STATUS_OPTIONS\}\s+decisionTones=\{EXCUSE_TONE_CLASS\}\s*\/>\s*<div ref=\{journalScrollRef\}/);
  assert.ok(journal.indexOf("<AttendanceLegend") < journal.indexOf("<table"));
});

test("a cell keeps its size: the longest words fit the 132 px column of a lesson", () => {
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.equal((journal.match(/items-center justify-center gap-1 rounded-xl border px-1\.5 py-1\.5 font-bold/g) || []).length, 3);
  assert.doesNotMatch(journal, /gap-1\.5 rounded-xl border px-2 py-1\.5 font-bold/);
  assert.equal((journal.match(/min-h-8 min-w-\[92px\]/g) || []).length, 5, "the minimum size of a cell is unchanged");
  assert.match(journal, /min-w-\[132px\]/);
});

// ---- headers, buttons, phone --------------------------------------------------------------------

test("table headers and captions of the attendance screens are ordinary case, never ALL CAPS", () => {
  for (const file of [
    "src/components/attendance/table-chrome.tsx",
    "src/components/attendance/excuses-page.tsx",
    "src/components/attendance/open-lessons-view.tsx",
    "src/components/attendance/attendance-section.tsx",
    "src/components/attendance/excuse-decision-body.tsx",
    "src/components/attendance/excuse-decision-dialog.tsx",
    "src/components/groups/group-attendance-journal.tsx",
    "src/components/groups/attendance-legend.tsx",
  ]) {
    assert.doesNotMatch(read(file), /\buppercase\b|tracking-wider|tracking-widest/, file);
  }
  const chrome = read("src/components/attendance/table-chrome.tsx");
  assert.match(chrome, /TABLE_HEAD_CELL = "min-w-0 text-\[13px\] font-semibold text-slate-500"/);
});

test("«Подтвердить» and «Отклонить» sit side by side in every waiting row, both through the dialog; the menu keeps only rare actions", () => {
  const page = read("src/components/attendance/excuses-page.tsx");
  const confirmAt = page.indexOf('onClick={() => openDialog(item, "confirmed", "none")}\n                            className="flex h-8');
  const rejectAt = page.indexOf('onClick={() => openDialog(item, "rejected", "optional")}\n                            className="flex h-8');
  const menuAt = page.indexOf("<RowMenu items={menuFor(item)}");
  assert.ok(confirmAt > 0 && rejectAt > confirmAt && menuAt > rejectAt, "Подтвердить, then Отклонить, then «⋯» in one row");
  assert.match(page, /aria-label=\{`Подтвердить: \$\{item\.student\.full_name\}`\}/);
  assert.match(page, /aria-label=\{`Отклонить: \$\{item\.student\.full_name\}`\}/);
  assert.equal((page.match(/disabled=\{busy\}\s+aria-label=\{`(Подтвердить|Отклонить)/g) || []).length, 2, "a row that is being decided blocks both");
  // the menu of a waiting row: note, certificate, journal, card - no second «Отклонить»
  assert.match(page, /if \(item\.status === "pending"\) return \[confirmWithNote, attach, journal, card\];/);
  // a decision that is already made can still be changed from the menu
  assert.match(page, /if \(item\.status === "confirmed"\) return \[reject, reset, attach, journal, card\];/);
  // the dialog keeps its protection and its texts
  const dialog = read("src/components/attendance/excuse-decision-dialog.tsx");
  assert.match(dialog, /if \(!target \|\| sending\.current \|\| !canSubmit\) return;/);
  assert.match(dialog, /data-testid="excuse-decision-submit"/);
});

test("the waiting list is shown in urgency order and the column says it in words", () => {
  const page = read("src/components/attendance/excuses-page.tsx");
  assert.match(page, /pendingTab \? sortExcusesByUrgency\(items, businessToday\) : items/);
  assert.match(page, /\{rows\.map\(\(item\) => \{/);
  assert.match(page, /\{deadline\.headline\}/);
  assert.match(page, /<p className="mt-0\.5 text-xs text-slate-500">\{deadline\.sub\}<\/p>/);
  assert.doesNotMatch(page, /excuseDeadlineChip/);
  assert.match(page, /pendingTab \? "Срок" : "Решение"/);
});

test("the phone icon is a real call: a tel: link named «Позвонить: +998…» with the same tooltip; no number, no icon", () => {
  const page = read("src/components/attendance/excuses-page.tsx");
  assert.equal((page.match(/href=\{phoneHref\}/g) || []).length, 2, "the icon on the wide table and the visible number on a card");
  assert.equal((page.match(/title=\{`Позвонить: \$\{item\.student\.phone\}`\}/g) || []).length, 2);
  assert.match(page, /aria-label=\{`Позвонить: \$\{item\.student\.phone\}`\}/);
  assert.match(page, /\{phoneHref && \(/);
  const { telHref } = lib("phone");
  assert.equal(telHref("+998 90 123 45 67"), "tel:+998901234567");
  assert.equal(telHref("90 123-45-67"), "tel:901234567");
  assert.equal(telHref(""), null);
  assert.equal(telHref(null), null);
  assert.equal(telHref("123"), null);
});
