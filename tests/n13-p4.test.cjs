/**
 * N13 P4: #102 diagnostics (no «предварительно» anywhere, one size of badges and buttons) and
 * #103 attendance (confirmation dialog before «Подтвердить» / «Отклонить», one alignment axis).
 */
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
require.extensions[".tsx"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const sources = walk(path.join(root, "src")).filter((f) => /\.(tsx?|jsx?)$/.test(f));
const rel = (file) => path.relative(root, file).replace(/\\/g, "/");

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// ── #102: «предварительно» is gone ─────────────────────────────────────────────────────────────

test("#102: the word «предварительн…» stays only where it means something else (payroll month, student questionnaire, exam fallback text)", () => {
  const hits = sources.filter((f) => /предварительн/i.test(fs.readFileSync(f, "utf8"))).map(rel).sort();
  assert.deepEqual(hits, [
    "src/app/admin/students/new/page.tsx",        // «Предварительная оценка уровня (со слов)» in the student questionnaire
    "src/app/teacher/exams/[id]/report/page.tsx", // fallback summary of an EXAM report, not a diagnostic
    "src/components/payroll/month-status.tsx",    // «расчёт предварительный» of an unfinished month (the line over the payroll)
    "src/lib/payroll.ts",                         // the text of that line (`monthStatusText`)
  ]);
  for (const f of sources) {
    const text = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(text, /PROVISIONAL_LABEL|diagnostic-report-provisional/, rel(f));
  }
});

test("#102: the provisional flag is only a tolerated data field - never read in JSX, never shown", () => {
  for (const f of sources) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!/provisional/i.test(line)) return;
      const isTypeOrComment = /^\s*(\/\*\*|\*|\/\/)/.test(line) || /^\s*\w+\?: boolean \| null;/.test(line);
      assert.ok(isTypeOrComment, `${rel(f)}:${i + 1} reads the provisional flag: ${line.trim()}`);
    });
  }
});

test("#102: the report header and the stored level ignore the flag", () => {
  const { ReportScoreHeader } = require(path.join(root, "src/components/diagnostics/report-score-header.tsx"));
  const render = (props) => renderToStaticMarkup(React.createElement(ReportScoreHeader, props));
  const base = { status: "below", levelText: "Ниже уровня класса", solved: 7, total: 12, correct: 7, wrong: 5 };
  assert.equal(render({ ...base, provisional: true }), render(base));
  assert.equal(/предварительн/i.test(textOf(render({ ...base, provisional: true }))), false);
  const L = require(path.join(root, "src/lib/diagnostic-level.ts"));
  assert.equal("provisional" in L.resolveReportLevel({ level: { status: "below", provisional: true } }), false);
  assert.equal("provisional" in L.storedLevelDisplay({ level_status: "below", level_provisional: true }), false);
  assert.equal(L.PROVISIONAL_LABEL, undefined);
});

// ── #102: one size of badges and buttons ───────────────────────────────────────────────────────

const chrome = () => require(path.join(root, "src/components/diagnostics/list-chrome.tsx"));
const STATUS_LABELS = ["Ожидает", "Готов к началу", "Проходит тест", "Завершён", "Истёк", "Отменён", "Зачислен", "Не начата", "В процессе"];
const TONES = [
  ["bg-amber-50 text-amber-700 border-amber-200", "bg-amber-400"],
  ["bg-emerald-50 text-emerald-700 border-emerald-200", "bg-emerald-400"],
  ["bg-slate-100 text-slate-600 border-slate-200", "bg-slate-300"],
];

test("#102: every status badge has the same height, padding, radius, font and width slot; only the colours differ", () => {
  const { DiagnosticStatusBadge } = chrome();
  const shape = (html, tone) => {
    const className = /<span[^>]*class="([^"]*)"/.exec(html)[1];
    return className.split(/\s+/).filter((c) => !tone.split(/\s+/).includes(c)).join(" ");
  };
  const shapes = new Set();
  STATUS_LABELS.forEach((label, i) => {
    const [tone, dot] = TONES[i % TONES.length];
    const html = renderToStaticMarkup(React.createElement(DiagnosticStatusBadge, { tone, dot }, label));
    assert.ok(textOf(html).includes(label));
    shapes.add(shape(html, tone));
  });
  assert.equal(shapes.size, 1, [...shapes].join(" | "));
  const [one] = shapes;
  for (const part of ["h-8", "rounded-full", "px-3", "text-sm", "font-medium", "w-[9.5rem]", "whitespace-nowrap"]) assert.ok(one.includes(part), part);
});

test("#102: every action has the same height and width class whatever its tone; the actions column is fixed", () => {
  const c = chrome();
  const tones = ["primary", "neutral", "solid"].map((tone) => c.diagnosticActionClass(tone).split(/\s+/));
  for (const classes of tones) for (const part of ["h-8", "w-[9.5rem]", "rounded-lg", "px-3", "text-sm", "whitespace-nowrap"]) assert.ok(classes.includes(part), part);
  // the column is as wide as its content (badge + gap-2 + action), it does not stretch from lg up
  assert.match(c.DIAGNOSTIC_ACTIONS_COLUMN, /lg:w-auto/);
  assert.match(c.DIAGNOSTIC_BADGE_WIDTH, /w-\[9\.5rem\]/);
  assert.match(c.DIAGNOSTIC_ACTION_WIDTH, /w-\[9\.5rem\]/);
  // a row without an action keeps the slot, so its badge stays in the column
  assert.match(renderToStaticMarkup(React.createElement(c.DiagnosticActionSpacer)), /hidden h-8 shrink-0 lg:block w-\[9\.5rem\]/);
});

test("#102: the diagnostics list and the student card use the shared badge and action, no ad-hoc sizes", () => {
  const page = read("src/app/admin/diagnostics/page.tsx");
  assert.match(page, /<DiagnosticStatusBadge testId="diagnostic-status"/);
  assert.match(page, /<div className=\{DIAGNOSTIC_ACTIONS_COLUMN\}>/);
  assert.equal((page.match(/diagnosticActionClass\(/g) || []).length, 3, "«Ссылка», «Отчёт», «Профиль»");
  assert.match(page, /<DiagnosticActionSpacer \/>/);
  assert.doesNotMatch(page, /w-\[110px\]|px-3 py-1\.5 text-xs font-medium bg-/);
  const card = read("src/components/students/student-profile-view.tsx");
  assert.match(card, /<DiagnosticStatusBadge\s+testId="student-diagnostic-status"\s+tone=\{isDead \?/);
  assert.match(card, /diagnosticActionClass\("solid"\)/);
  assert.doesNotMatch(card, /px-3 py-1\.5 rounded-full text-xs font-medium border/);
});

// ── #103: the confirmation dialog ──────────────────────────────────────────────────────────────

const decision = () => require(path.join(root, "src/lib/excuse-decision.ts"));

const PAYROLL_CONFIRM = "Урок не будет засчитан преподавателю в зарплату.";
const PAYROLL_REJECT = "Пропуск останется неуважительным: урок засчитывается преподавателю как обычный урок.";
const CHANGED_TO_CONFIRMED = "Решение изменится: урок не будет засчитан преподавателю в зарплату.";
const CHANGED_TO_REJECTED = "Решение изменится: урок снова будет засчитан преподавателю как обычный урок.";

test("#103: the consequence is true for every decision x current status x billing mode (the rule of payroll_engine / lesson_counts)", () => {
  const D = decision();
  const E = D.excuseConsequenceLines;
  // calendar mode, no payment (null) and a mode that is not given: the payroll sentence only (no payment effect, nothing guessed)
  for (const mode of ["calendar", null, undefined]) {
    assert.deepEqual(E("confirmed", "pending", mode), [PAYROLL_CONFIRM], `confirm from pending, ${mode}`);
    assert.deepEqual(E("rejected", "pending", mode), [PAYROLL_REJECT], `reject from pending, ${mode}`);
    assert.deepEqual(E("rejected", "confirmed", mode), [CHANGED_TO_REJECTED], `reject a confirmed one, ${mode}`);
    assert.deepEqual(E("confirmed", "rejected", mode), [CHANGED_TO_CONFIRMED], `confirm a rejected one, ${mode}`);
  }
  // package mode: what happens to the student's package follows
  assert.deepEqual(E("confirmed", "pending", "package"), [PAYROLL_CONFIRM, "Урок не спишется из пакета ученика."]);
  assert.deepEqual(E("rejected", "pending", "package"), [PAYROLL_REJECT, "Урок спишется из пакета ученика."]);
  assert.deepEqual(E("rejected", "confirmed", "package"), [
    "Решение изменится: урок снова будет засчитан преподавателю как обычный урок и снова спишется из пакета ученика.",
  ]);
  assert.deepEqual(E("confirmed", "rejected", "package"), [CHANGED_TO_CONFIRMED, "Урок вернётся в пакет ученика."]);
  // the current status defaults to waiting; a decision that is already the current one reads like the first one
  assert.deepEqual(E("confirmed"), [PAYROLL_CONFIRM]);
  assert.deepEqual(E("confirmed", "confirmed", "package"), E("confirmed", "pending", "package"));
  assert.deepEqual(E("rejected", "rejected", "package"), E("rejected", "pending", "package"));
  // a confirmed excuse never promises the lesson to the teacher, a rejected one never takes it away
  for (const status of ["pending", "confirmed", "rejected"]) for (const mode of ["calendar", "package", null]) {
    assert.ok(!/засчитывается|засчитан преподавателю как/.test(E("confirmed", status, mode).join(" ")) || status === "rejected", `${status} ${mode}`);
    assert.ok(!E("rejected", status, mode).join(" ").includes("не будет засчитан"), `${status} ${mode}`);
  }
});

test("#103: the dialog copy: title, buttons, the lines and their joined text", () => {
  const D = decision();
  const one = D.excuseDecisionCopy("confirmed");
  assert.deepEqual(one, { title: "Подтвердить пропуск?", confirmLabel: "Подтвердить", cancelLabel: "Отмена", consequenceLines: [PAYROLL_CONFIRM], consequence: PAYROLL_CONFIRM, countLine: null });
  const rejectPack = D.excuseDecisionCopy("rejected", 1, { excuses: [{ status: "pending", billingMode: "package" }] });
  assert.deepEqual(rejectPack, {
    title: "Отклонить пропуск?", confirmLabel: "Отклонить", cancelLabel: "Отмена",
    consequenceLines: [PAYROLL_REJECT, "Урок спишется из пакета ученика."], consequence: `${PAYROLL_REJECT} Урок спишется из пакета ученика.`, countLine: null,
  });
  assert.deepEqual(D.excuseDecisionCopy("rejected", 1, { excuses: [{ status: "confirmed" }] }).consequenceLines, [CHANGED_TO_REJECTED]);
});

test("#103: a bulk action says how many (with the right plural) and keeps the same consequence", () => {
  const D = decision();
  assert.deepEqual([1, 2, 4, 5, 11, 12, 21, 22, 25, 111].map(D.excusesWord),
    ["пропуск", "пропуска", "пропуска", "пропусков", "пропусков", "пропусков", "пропуск", "пропуска", "пропусков", "пропусков"]);
  const three = D.excuseDecisionCopy("confirmed", 3);
  assert.equal(three.title, "Подтвердить 3 пропуска?");
  assert.equal(three.countLine, "Пропусков: 3");
  assert.equal(three.confirmLabel, "Подтвердить");
  assert.equal(three.consequence, PAYROLL_CONFIRM);
  // mixed current statuses: the lines of each, without repeats; a bulk of the same status says it once
  assert.deepEqual(D.excuseDecisionCopy("confirmed", 3, { excuses: [
    { status: "pending", billingMode: "package" }, { status: "pending", billingMode: "package" }, { status: "rejected", billingMode: "package" },
  ] }).consequenceLines, [
    PAYROLL_CONFIRM, "Урок не спишется из пакета ученика.", CHANGED_TO_CONFIRMED, "Урок вернётся в пакет ученика.",
  ]);
  assert.deepEqual(D.excuseConsequenceLinesFor("rejected", []), [PAYROLL_REJECT]);
  // each excuse brings its own mode: one in a package, one in a calendar period and one without payment say the package sentence once
  assert.deepEqual(D.excuseConsequenceLinesFor("confirmed", [
    { status: "pending", billingMode: "package" }, { status: "pending", billingMode: "calendar" }, { status: "pending", billingMode: null },
  ]), [PAYROLL_CONFIRM, "Урок не спишется из пакета ученика."]);
  assert.equal(D.excuseDecisionCopy("rejected", 7).title, "Отклонить 7 пропусков?");
  assert.deepEqual(D.previewTargets([1, 2, 3, 4, 5, 6, 7], 5), { shown: [1, 2, 3, 4, 5], more: 2 });
  assert.deepEqual(D.previewTargets([1, 2], 5), { shown: [1, 2], more: 0 });
});

test("#103: the dialog sends nothing while a required note is empty or while busy; a plain confirm sends no note", () => {
  const D = decision();
  assert.equal(D.canSubmitExcuseDecision("none", "", false), true);
  assert.equal(D.canSubmitExcuseDecision("optional", "", false), true);
  assert.equal(D.canSubmitExcuseDecision("required", "   ", false), false);
  assert.equal(D.canSubmitExcuseDecision("required", "Справка в офисе", false), true);
  for (const mode of ["none", "optional", "required"]) assert.equal(D.canSubmitExcuseDecision(mode, "текст", true), false, `busy ${mode}`);
  assert.equal(D.excuseNoteToSend("none", "случайный текст"), "");
  assert.equal(D.excuseNoteToSend("optional", "  не подтверждено  "), "не подтверждено");
  assert.equal(D.excuseNoteToSend("required", " Справка "), "Справка");
});

const item = (over = {}) => ({
  id: "ex-1", attendance_id: "a1", lesson_date: "2026-10-15", lesson_key: "k",
  group: { id: "g", name: "Математика 9А" }, teacher: { id: "t", name: "Дилноза Каримова" },
  student: { id: "s", full_name: "Иванова Ольга", display_id: "ST-1" },
  reason: "Болела, справка", reason_by: { id: "t", name: "Дилноза Каримова" }, reason_at: "2026-10-09T16:35:00",
  status: "pending", reviewed_by: null, reviewed_at: null, review_note: null, files: [], ...over,
});

test("#103: the dialog body shows the student, the lesson (date + group), the reason and the consequence", () => {
  const { ExcuseDecisionBody } = require(path.join(root, "src/components/attendance/excuse-decision-body.tsx"));
  const subject = decision().subjectOfItem(item());
  const confirm = textOf(renderToStaticMarkup(React.createElement(ExcuseDecisionBody, { items: [subject], decision: "confirmed" })));
  for (const part of ["Ученик", "Иванова Ольга", "Урок", "Чт, 15.10 · Математика 9А", "Причина", "Болела, справка", "Дилноза Каримова · 09.10.2026 16:35",
    PAYROLL_CONFIRM]) assert.ok(confirm.includes(part), part);
  assert.equal(confirm.includes("пакет"), false, "no package sentence without a package payment");
  // the mode comes from the excuse itself (billing_mode of the item): only "package" adds the sentence
  const bodyOf = (over, decisionName = "confirmed") => textOf(renderToStaticMarkup(React.createElement(ExcuseDecisionBody, {
    items: [decision().subjectOfItem(item(over))], decision: decisionName,
  })));
  assert.ok(bodyOf({ billing_mode: "package" }).includes(`${PAYROLL_CONFIRM} Урок не спишется из пакета ученика.`));
  for (const mode of ["calendar", null, undefined, "garbage"]) {
    assert.equal(bodyOf({ billing_mode: mode }).includes("пакет"), false, `billing_mode ${mode}`);
  }
  // the key is absent (a teacher, an older server): no line either
  const noKey = item(); delete noKey.billing_mode;
  assert.equal(textOf(renderToStaticMarkup(React.createElement(ExcuseDecisionBody, { items: [decision().subjectOfItem(noKey)], decision: "confirmed" }))).includes("пакет"), false);
  // a centre in package mode does not matter: an excuse whose student pays by calendar shows no package line (the dialog has no centre input at all)
  const dialogSource = read("src/components/attendance/excuse-decision-dialog.tsx") + read("src/components/attendance/excuse-decision-body.tsx");
  assert.doesNotMatch(dialogSource, /billingMode=|periodMode|usePaymentsSummary/);
  // the current decision decides the words: changing a confirmed excuse to a refusal says so
  assert.ok(bodyOf({ status: "confirmed", billing_mode: "package" }, "rejected").includes("Решение изменится: урок снова будет засчитан преподавателю как обычный урок и снова спишется из пакета ученика."));
  assert.equal(bodyOf({ status: "confirmed", billing_mode: "calendar" }, "rejected").includes("пакет"), false);
  const reject = textOf(renderToStaticMarkup(React.createElement(ExcuseDecisionBody, { items: [subject], decision: "rejected" })));
  assert.ok(reject.includes(PAYROLL_REJECT));
  assert.equal(reject.includes("не будет засчитан"), false);
});

test("#103: the bulk body shows the count and the first students, «и ещё N» for the rest", () => {
  const { ExcuseDecisionBody } = require(path.join(root, "src/components/attendance/excuse-decision-body.tsx"));
  const items = Array.from({ length: 7 }, (_, i) => decision().subjectOfItem(item({ id: `ex-${i}`, student: { id: `s${i}`, full_name: `Ученик ${i + 1}`, display_id: null } })));
  const text = textOf(renderToStaticMarkup(React.createElement(ExcuseDecisionBody, { items, decision: "confirmed" })));
  assert.ok(text.includes("Пропусков: 7"));
  assert.ok(text.includes("Ученик 1") && text.includes("Ученик 5") && !text.includes("Ученик 6"));
  assert.ok(text.includes("и ещё 2"));
  assert.ok(text.includes("не будет засчитан преподавателю"));
});

test("#103: every «Подтвердить» / «Отклонить» of the list goes through the dialog; the request is sent only from its button, once", () => {
  const page = read("src/components/attendance/excuses-page.tsx");
  // the row button and the menu items open the dialog
  assert.match(page, /onClick=\{\(\) => openDialog\(item, "confirmed", "none"\)\}/);
  assert.match(page, /onClick=\{\(\) => openDialog\(item, "rejected", "optional"\)\}/); // the visible «Отклонить» of a waiting row (UX-1 B)
  assert.match(page, /key: "reject", label: "Отклонить…", icon: XCircle, danger: true, onSelect: \(\) => openDialog\(item, "rejected", "optional"\)/);
  assert.match(page, /key: "confirm-note", label: "Подтвердить с примечанием…", icon: MessageSquare, onSelect: \(\) => openDialog\(item, "confirmed", "required"\)/);
  assert.match(page, /key: "confirm", label: "Подтвердить", icon: Check, onSelect: \(\) => openDialog\(item, "confirmed", "none"\)/);
  // ...and `review` (the only caller of the API) is reached from the dialog's submit only
  assert.equal(page.match(/\breview\(/g).length, 1, "the only call of review() is in submitDialog");
  assert.match(page, /const error = await review\(item, dialog\.decision, note\);\s*if \(error\) \{ setDialogError\(error\); return; \}/);
  assert.equal((page.match(/orgApi\.reviewAttendanceExcuse/g) || []).length, 1);
  // a second request for the same excuse is dropped, with or without the dialog
  assert.match(page, /if \(reviewing\.current\.has\(item\.id\)\) return "Решение уже отправляется";/);
  assert.match(page, /reviewing\.current\.delete\(item\.id\);/);
  // the success toasts are unchanged; a refusal is shown inside the dialog, not as a toast
  assert.match(page, /showToast\(decision === "confirmed" \? "Пропуск подтверждён" : "Пропуск отклонён"\)/);
  assert.doesNotMatch(page, /showToast\(error instanceof Error \? error\.message : "Не удалось сохранить решение"/);
  assert.match(page, /<ExcuseDecisionDialog target=\{dialog\} busy=\{dialogBusy\} error=\{dialogError\} onClose=\{closeDialog\}/);
  const dialog = read("src/components/attendance/excuse-decision-dialog.tsx");
  assert.match(dialog, /if \(!target \|\| sending\.current \|\| !canSubmit\) return;/);
  assert.match(dialog, /disabled=\{!canSubmit\}/);
  assert.match(dialog, /busy=\{busy\}/); // no close while the request runs
  assert.match(dialog, /\{copy\.cancelLabel\}/);
  assert.match(dialog, /\{copy\.confirmLabel\}/);
});

// ── #103: one alignment axis ───────────────────────────────────────────────────────────────────

test("#103: a header and its cells share the template, the padding and the gap; both tabs use the same chrome", () => {
  const chromeSrc = read("src/components/attendance/table-chrome.tsx");
  assert.match(chromeSrc, /py-2\.5 \$\{TABLE_PAD_X\} \$\{visible\} items-center gap-x-3 \$\{gridClass\}/);
  const excuses = read("src/components/attendance/excuses-page.tsx");
  assert.match(excuses, /<TableHeader\s+show="xl"\s+gridClass=\{cols\}/);
  assert.match(excuses, /xl:grid xl:items-start xl:gap-x-3 xl:gap-y-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:px-4 xl:py-3 \$\{cols\}/);
  assert.match(excuses, /COLS_PENDING = "xl:grid-cols-\[minmax\(0,1\.1fr\)_104px_minmax\(0,1\.5fr\)_208px_240px\]"/);
  const open = read("src/components/attendance/open-lessons-view.tsx");
  assert.match(open, /<TableHeader show="lg" gridClass=\{COLS\} labels=\{\["Урок", "Группа", "Статус", ""\]\} aligns=\{\["center", "center", "center", "right"\]\}/);
  assert.match(open, /lg:grid lg:items-start lg:gap-x-3 lg:gap-y-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-4 lg:py-3 \$\{COLS\}/);
  // the same horizontal padding in both (px-4) and the same header look
  assert.match(chromeSrc, /TABLE_PAD_X = "px-4"/);
  assert.match(chromeSrc, /TABLE_HEAD_CELL = "min-w-0 text-\[13px\] font-semibold text-slate-500"/); // ordinary case, never ALL CAPS (UX-1 B)
  // badges: one base class (size, radius, type), tones from the shared palette; placed as flex items so no line box shifts them
  const tone = require(path.join(root, "src/lib/chip-tone.ts"));
  assert.match(tone.CHIP_BASE_CLASS, /rounded-md border px-2 py-0\.5 text-left text-xs font-medium leading-4/);
  assert.match(excuses, /\$\{CHIP_BASE_CLASS\} \$\{CHIP_TONE_CLASS\[deadline\.tone\]\}/);
  assert.match(open, /\$\{CHIP_BASE_CLASS\} \$\{CHIP_TONE_CLASS\[CHIP_TONE\[item\.actionType\]\]\}/);
  assert.match(excuses, /<div className="flex min-w-0 xl:-my-px xl:justify-center">/);
  assert.match(open, /<div className="flex min-w-0 lg:-my-px lg:justify-center">/);
  // the controls of a row are pulled onto the first line: 32 px buttons on a 20 px line
  assert.match(excuses, /flex items-center justify-end gap-1\.5 xl:-my-1\.5 /);
  assert.match(open, /absolute right-2 top-2 lg:static lg:-my-1\.5 lg:justify-self-end/);
  // empty states are one component
  assert.match(excuses, /<EmptyState icon=\{CheckCircle2\}/);
  assert.match(open, /<EmptyState icon=\{ClipboardCheck\} title="Все уроки закрыты"/);
});

// ── #103: the group journal asks the same way ──────────────────────────────────────────────────

test("#103: the journal cell and the list give the dialog the same facts", () => {
  const D = decision();
  const fromList = D.subjectOfItem(item());
  const fromJournal = D.subjectOfJournalCell({
    excuse: { id: "ex-1", status: "pending", reason: "Болела, справка", reason_by_name: "Дилноза Каримова", reason_at: "2026-10-09T16:35:00" },
    studentName: "Иванова Ольга", lessonDate: "2026-10-15", groupName: "Математика 9А",
  });
  assert.deepEqual(fromJournal, fromList);
  // a journal that does not know the group names the lesson by its date alone
  const { ExcuseDecisionBody } = require(path.join(root, "src/components/attendance/excuse-decision-body.tsx"));
  const noGroup = D.subjectOfJournalCell({ excuse: { id: "e", status: "pending", reason: "Болел", reason_by_name: null, reason_at: null }, studentName: "Петров Иван", lessonDate: "2026-10-15" });
  const text = textOf(renderToStaticMarkup(React.createElement(ExcuseDecisionBody, { items: [noGroup], decision: "rejected" })));
  assert.ok(text.includes("Чт, 15.10") && !text.includes("Чт, 15.10 ·"), text);
  assert.ok(text.includes(PAYROLL_REJECT));
});

test("#103: in the journal «Подтвердить» / «Отклонить» open the dialog; only «Сбросить решение» and the dialog send a request", () => {
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /onClick=\{\(\) => askReview\(excuse, key, student, lesson, "confirmed"\)\}/);
  assert.match(journal, /onClick=\{\(\) => askReview\(excuse, key, student, lesson, "rejected"\)\}/);
  assert.match(journal, /onClick=\{\(\) => void handleReview\(excuse, key, student\.id, "reset"\)\}/);
  assert.doesNotMatch(journal, /handleReview\(excuse, key, student\.id, "(confirmed|rejected)"\)/);
  // the same dialog, the same note rule as the list (none for a confirm, optional for a refusal), one request at a time
  assert.match(journal, /<ExcuseDecisionDialog\s+target=\{reviewDialog\}/);
  assert.match(journal, /noteMode: decision === "rejected" \? "optional" : "none"/);
  assert.match(journal, /if \(reviewingRef\.current\.has\(excuse\.id\)\) return "Решение уже отправляется";/);
  assert.match(journal, /reviewingRef\.current\.delete\(excuse\.id\);/);
  // a failed attempt stays in the dialog (its note survives), a saved one closes it
  assert.match(journal, /if \(error\) setReviewDialog\(\(current\) => \(current \? \{ \.\.\.current, error \} : current\)\);\s*else closeReviewDialog\(\);/);
  // role rules are untouched: only the administrator / owner journal (adminMode) can review
  assert.match(journal, /const reviewable = adminMode && !inCorrection && Boolean\(excuse\);/);
  assert.doesNotMatch(read("src/app/teacher/groups/[id]/page.tsx"), /adminMode/);
  for (const role of ["owner", "admin"]) {
    const page = read(`src/app/${role}/groups/[id]/page.tsx`);
    assert.match(page, /adminMode\s+groupName=\{group\.name\}/, role);
  }
});

test("#103: no other path of the front sends an excuse decision: two callers of the API, both behind the dialog", () => {
  const callers = sources.filter((f) => /reviewAttendanceExcuse\(/.test(fs.readFileSync(f, "utf8"))).map(rel).sort();
  assert.deepEqual(callers, [
    "src/components/attendance/excuses-page.tsx",
    "src/components/groups/group-attendance-journal.tsx",
  ]);
  assert.equal((read("src/components/groups/group-attendance-journal.tsx").match(/orgApi\.reviewAttendanceExcuse/g) || []).length, 1);
  // the review endpoint is not reached any other way (no raw fetch / api() call to it)
  for (const f of sources) {
    if (rel(f) === "src/lib/api.ts") continue;
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /excuses\/[^`'"]*\/review/, rel(f));
  }
  const dialog = read("src/components/attendance/excuse-decision-dialog.tsx");
  assert.match(dialog, /error = null/);
  assert.match(dialog, /role="alert"/);
  // the typed note survives an error shown in the dialog: the reset key is the excuse and the decision, not the object
  assert.match(dialog, /useEffect\(\(\) => \{ setNote\(""\); \}, \[targetKey\]\);/);
});

// ── R3 decisions: where the billing mode comes from, focus, backdrop, badge title, profile links ────────────

test("#103: the package sentence follows the excuse's own billing_mode (the student's latest payment), not the centre's setting", () => {
  const D = decision();
  assert.deepEqual(["package", "calendar", null, undefined, "lessons", 5, ""].map(D.normalizeBillingMode), ["package", "calendar", null, null, null, null, null]);
  // the list and the journal read it from the item / the journal entry; neither asks the payments summary any more
  for (const file of ["src/components/attendance/excuses-page.tsx", "src/components/groups/group-attendance-journal.tsx"]) {
    const src = read(file);
    assert.doesNotMatch(src, /usePaymentsSummary|getPaymentSettings|getPaymentsSummary|periodMode/, file);
  }
  const fromList = D.subjectOfItem(item({ billing_mode: "package" }));
  const fromJournal = D.subjectOfJournalCell({
    excuse: { id: "ex-1", status: "pending", billing_mode: "package", reason: "Болела, справка", reason_by_name: "Дилноза Каримова", reason_at: "2026-10-09T16:35:00" },
    studentName: "Иванова Ольга", lessonDate: "2026-10-15", groupName: "Математика 9А",
  });
  assert.deepEqual(fromJournal, fromList);
  assert.equal(fromJournal.billingMode, "package");
  // the journal entry of a teacher has no such key: nothing is said about packages
  const noKey = D.subjectOfJournalCell({ excuse: { id: "e", status: "pending", reason: "Болел", reason_by_name: null, reason_at: null }, studentName: "Петров Иван", lessonDate: "2026-10-15" });
  assert.equal(noKey.billingMode, null);
  // the typed fields
  const api = read("src/lib/api.ts");
  assert.match(api.match(/interface AttendanceExcuseItem[\s\S]*?\n\}/)[0], /billing_mode\?: ExcuseBillingModeValue \| null;/);
  assert.match(api.match(/interface AttendanceExcuseInfo[\s\S]*?\n\}/)[0], /billing_mode\?: ExcuseBillingModeValue \| null;/);
  assert.match(api, /export type ExcuseBillingModeValue = "calendar" \| "package";/);
  // a decision in the journal keeps the cell's mode in step with the server's answer
  // (the copy lives in applyExcuseItem now, next to the «после срока» fields)
  assert.match(read("src/lib/excuse-conflict.ts"), /\.\.\.\(item\.billing_mode !== undefined \? \{ billing_mode: item\.billing_mode \} : \{\}\),/);
  assert.match(read("src/components/groups/group-attendance-journal.tsx"), /applyExcuseItem\(current, item\)/);
});

test("#103: the journal gives the focus back to the cell that asked the question; the dialog shows a refusal inline", () => {
  const journal = read("src/components/groups/group-attendance-journal.tsx");
  assert.match(journal, /reviewOpenerRef\.current = document\.querySelector<HTMLElement>\(`\[aria-controls="attendance-menu-\$\{student\.id\}-\$\{lessonKey\}"\]`\);/);
  assert.match(journal, /if \(opener\) window\.setTimeout\(\(\) => \{ if \(document\.contains\(opener\)\) opener\.focus\(\); \}, 0\);/);
  assert.match(journal, /onClose=\{closeReviewDialog\}/);
  assert.match(journal, /else closeReviewDialog\(\);/);
});

test("nit: a click on the backdrop right after the dialog opened is not a dismissal (the tail of a double click)", () => {
  const modal = read("src/components/ui/modal.tsx");
  assert.match(modal, /export const BACKDROP_GRACE_MS = 300;/);
  assert.match(modal, /useEffect\(\(\) => \{ if \(open\) openedAtRef\.current = Date\.now\(\); \}, \[open\]\);/);
  assert.match(modal, /onClick=\{\(\) => \{ if \(!busy && Date\.now\(\) - openedAtRef\.current >= BACKDROP_GRACE_MS\) onClose\(\); \}\}/);
});

test("nit: a badge cut by its slot still tells its full label (title)", () => {
  const { DiagnosticStatusBadge } = chrome();
  const html = renderToStaticMarkup(React.createElement(DiagnosticStatusBadge, { tone: "x", dot: "y" }, "Ожидает подтверждения"));
  assert.match(html, /<span class="min-w-0 truncate" title="Ожидает подтверждения">Ожидает подтверждения<\/span>/);
});

test("#102: a pending invite of an enrolled student shows «Ссылка» only; the student is reached by name and avatar, both visibly links", () => {
  const page = read("src/app/admin/diagnostics/page.tsx");
  assert.match(page, /aria-label=\{`Профиль ученика: \$\{inv\.student_name\}`\}/);
  assert.match(page, /hover:text-primary-600 hover:underline focus-visible:underline/);
  assert.match(page, /focus-visible:ring-2 focus-visible:ring-primary-500/);
});
