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
    "src/components/payroll/payroll-month-page.tsx", // «расчёт предварительный» of an unfinished month
    "src/components/payroll/payroll-sheet-page.tsx",
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
const STATUS_LABELS = ["Ожидает подтверждения", "Готов к началу", "Проходит тест", "Завершён", "Истёк", "Отменён", "Зачислен", "Ожидает прохождения", "В процессе"];
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
  for (const part of ["h-7", "rounded-full", "px-3", "text-xs", "font-medium", "w-full", "sm:w-52", "whitespace-nowrap"]) assert.ok(one.includes(part), part);
});

test("#102: every action has the same height and width class whatever its tone; the actions column is fixed", () => {
  const c = chrome();
  const tones = ["primary", "neutral", "solid"].map((tone) => c.diagnosticActionClass(tone).split(/\s+/));
  for (const classes of tones) for (const part of ["h-8", "w-full", "sm:w-36", "rounded-lg", "px-3", "text-xs", "whitespace-nowrap"]) assert.ok(classes.includes(part), part);
  // the slot of the badge + the slot of the action + the gap = the fixed column from lg up (13 + 9 rem + 0.5 rem)
  assert.match(c.DIAGNOSTIC_ACTIONS_COLUMN, /lg:w-\[22\.5rem\]/);
  assert.match(c.DIAGNOSTIC_BADGE_WIDTH, /sm:w-52/);
  assert.match(c.DIAGNOSTIC_ACTION_WIDTH, /sm:w-36/);
  // a row without an action keeps the slot, so its badge stays in the column
  assert.match(renderToStaticMarkup(React.createElement(c.DiagnosticActionSpacer)), /hidden h-8 w-36 shrink-0 lg:block/);
});

test("#102: the diagnostics list and the student card use the shared badge and action, no ad-hoc sizes", () => {
  const page = read("src/app/admin/diagnostics/page.tsx");
  assert.match(page, /<DiagnosticStatusBadge testId="diagnostic-status"/);
  assert.match(page, /<div className=\{DIAGNOSTIC_ACTIONS_COLUMN\}>/);
  assert.equal((page.match(/diagnosticActionClass\(/g) || []).length, 3, "«Ссылка», «Отчёт», «Профиль»");
  assert.match(page, /<DiagnosticActionSpacer \/>/);
  assert.doesNotMatch(page, /w-\[110px\]|px-3 py-1\.5 text-xs font-medium bg-/);
  const card = read("src/components/students/student-profile-view.tsx");
  assert.match(card, /<DiagnosticStatusBadge\s+tone=\{isDead \?/);
  assert.match(card, /diagnosticActionClass\("solid"\)/);
  assert.doesNotMatch(card, /px-3 py-1\.5 rounded-full text-xs font-medium border/);
});

// ── #103: the confirmation dialog ──────────────────────────────────────────────────────────────

const decision = () => require(path.join(root, "src/lib/excuse-decision.ts"));

test("#103: the consequence texts are the payroll rule in plain words", () => {
  const D = decision();
  assert.equal(D.EXCUSE_CONSEQUENCE.confirmed, "Урок не будет засчитан преподавателю в зарплату (уважительная причина).");
  assert.equal(D.EXCUSE_CONSEQUENCE.rejected, "Пропуск останется неуважительным: урок засчитывается преподавателю.");
  const one = D.excuseDecisionCopy("confirmed");
  assert.deepEqual(one, { title: "Подтвердить пропуск?", confirmLabel: "Подтвердить", cancelLabel: "Отмена", consequence: D.EXCUSE_CONSEQUENCE.confirmed, countLine: null });
  assert.deepEqual(D.excuseDecisionCopy("rejected", 1), { title: "Отклонить пропуск?", confirmLabel: "Отклонить", cancelLabel: "Отмена", consequence: D.EXCUSE_CONSEQUENCE.rejected, countLine: null });
});

test("#103: a bulk action says how many (with the right plural) and keeps the same consequence", () => {
  const D = decision();
  assert.deepEqual([1, 2, 4, 5, 11, 12, 21, 22, 25, 111].map(D.excusesWord),
    ["пропуск", "пропуска", "пропуска", "пропусков", "пропусков", "пропусков", "пропуск", "пропуска", "пропусков", "пропусков"]);
  const three = D.excuseDecisionCopy("confirmed", 3);
  assert.equal(three.title, "Подтвердить 3 пропуска?");
  assert.equal(three.countLine, "Пропусков: 3");
  assert.equal(three.confirmLabel, "Подтвердить");
  assert.equal(three.consequence, D.EXCUSE_CONSEQUENCE.confirmed);
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
  const confirm = textOf(renderToStaticMarkup(React.createElement(ExcuseDecisionBody, { items: [item()], decision: "confirmed" })));
  for (const part of ["Ученик", "Иванова Ольга", "Урок", "Чт, 15.10 · Математика 9А", "Причина", "Болела, справка", "Дилноза Каримова · 09.10.2026 16:35",
    "Урок не будет засчитан преподавателю в зарплату (уважительная причина)."]) assert.ok(confirm.includes(part), part);
  const reject = textOf(renderToStaticMarkup(React.createElement(ExcuseDecisionBody, { items: [item()], decision: "rejected" })));
  assert.ok(reject.includes("Пропуск останется неуважительным: урок засчитывается преподавателю."));
  assert.equal(reject.includes("не будет засчитан"), false);
});

test("#103: the bulk body shows the count and the first students, «и ещё N» for the rest", () => {
  const { ExcuseDecisionBody } = require(path.join(root, "src/components/attendance/excuse-decision-body.tsx"));
  const items = Array.from({ length: 7 }, (_, i) => item({ id: `ex-${i}`, student: { id: `s${i}`, full_name: `Ученик ${i + 1}`, display_id: null } }));
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
  assert.match(page, /key: "reject", label: "Отклонить…", icon: XCircle, danger: true, onSelect: \(\) => openDialog\(item, "rejected", "optional"\)/);
  assert.match(page, /key: "confirm-note", label: "Подтвердить с примечанием…", icon: MessageSquare, onSelect: \(\) => openDialog\(item, "confirmed", "required"\)/);
  assert.match(page, /key: "confirm", label: "Подтвердить", icon: Check, onSelect: \(\) => openDialog\(item, "confirmed", "none"\)/);
  // ...and `review` (the only caller of the API) is reached from the dialog's submit only
  assert.equal(page.match(/\breview\(/g).length, 1, "the only call of review() is in submitDialog");
  assert.match(page, /if \(!\(await review\(item, dialog\.decision, note\)\)\) return;/);
  assert.equal((page.match(/orgApi\.reviewAttendanceExcuse/g) || []).length, 1);
  // a second request for the same excuse is dropped, with or without the dialog
  assert.match(page, /if \(reviewing\.current\.has\(item\.id\)\) return false;/);
  assert.match(page, /reviewing\.current\.delete\(item\.id\);/);
  // the success toasts are unchanged
  assert.match(page, /showToast\(decision === "confirmed" \? "Пропуск подтверждён" : "Пропуск отклонён"\)/);
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
  assert.match(excuses, /COLS_PENDING = "xl:grid-cols-\[minmax\(0,1\.45fr\)_104px_minmax\(0,1\.55fr\)_176px_184px\]"/);
  const open = read("src/components/attendance/open-lessons-view.tsx");
  assert.match(open, /<TableHeader show="lg" gridClass=\{COLS\} labels=\{\["Урок", "Группа", "Статус", ""\]\}/);
  assert.match(open, /lg:grid lg:items-start lg:gap-x-3 lg:gap-y-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-4 lg:py-3 \$\{COLS\}/);
  // the same horizontal padding in both (px-4) and the same header look
  assert.match(chromeSrc, /TABLE_PAD_X = "px-4"/);
  assert.match(chromeSrc, /TABLE_HEAD_CELL = "min-w-0 text-xs font-semibold uppercase tracking-wider text-slate-500"/);
  // badges: one base class (size, radius, type), tones from the shared palette; placed as flex items so no line box shifts them
  const tone = require(path.join(root, "src/lib/chip-tone.ts"));
  assert.match(tone.CHIP_BASE_CLASS, /rounded-md border px-2 py-0\.5 text-left text-xs font-medium leading-4/);
  assert.match(excuses, /\$\{CHIP_BASE_CLASS\} \$\{CHIP_TONE_CLASS\[chip\.tone\]\}/);
  assert.match(open, /\$\{CHIP_BASE_CLASS\} \$\{CHIP_TONE_CLASS\[CHIP_TONE\[item\.actionType\]\]\}/);
  assert.match(excuses, /<div className="flex min-w-0 xl:-my-px">/);
  assert.match(open, /<div className="flex min-w-0 lg:-my-px">/);
  // the controls of a row are pulled onto the first line: 32 px buttons on a 20 px line
  assert.match(excuses, /flex items-center justify-end gap-1\.5 xl:-my-1\.5 /);
  assert.match(open, /absolute right-2 top-2 lg:static lg:-my-1\.5 lg:justify-self-end/);
  // empty states are one component
  assert.match(excuses, /<EmptyState icon=\{CheckCircle2\}/);
  assert.match(open, /<EmptyState icon=\{ClipboardCheck\} title="Все уроки закрыты"/);
});
