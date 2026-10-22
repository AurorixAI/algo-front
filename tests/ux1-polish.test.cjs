/**
 * UX-1 final polish round: payroll copy, sentence-case headers in the owner/admin areas, no decorative gradient strips,
 * the honest late-decision note, the one map of attendance marks, the payments banner on a phone and the matching
 * counter of the menu.
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
// the "@/" alias of the app (attendance-summary.ts imports the map and the plural by it)
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const lib = (name) => require(path.join(root, "src/lib", name));

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(relative));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(relative);
  }
  return out;
}

// ── 1. payroll copy ─────────────────────────────────────────────────────────────────────────────────

test("payroll: «Не задана ставка у N преподавателей», plurals by the count", () => {
  const R = lib("payroll.ts");
  const many = (n) => Array.from({ length: n }, (_, i) => ({ teacher_id: `t${i}`, missing_rates: ["group"] }));
  const text = (n) => R.calculationGate(many(n)).text;
  assert.equal(text(1), "Не задана ставка у 1 преподавателя");
  assert.equal(text(2), "Не задана ставка у 2 преподавателей");
  assert.equal(text(5), "Не задана ставка у 5 преподавателей");
  assert.equal(text(21), "Не задана ставка у 21 преподавателя");
  assert.doesNotMatch(read("src/lib/payroll.ts"), /осталось \$\{missing\}/);
});

test("payroll: status chips start with a capital letter", () => {
  const R = lib("payroll.ts");
  assert.equal(R.sheetStatus(null).label, "Не рассчитано");
  assert.equal(R.sheetStatus({ stale: true, updated_at: "2026-10-02T08:00:00" }).label, "Есть изменения");
  assert.equal(R.sheetStatus({ stale: false, updated_at: "2026-10-02T08:00:00" }).label, "Сохранено 02.10");
});

// ── 2. sentence-case headers ────────────────────────────────────────────────────────────────────────

const SENTENCE_CASE_FILES = [
  "src/app/owner/teachers/page.tsx", "src/app/owner/groups/[id]/page.tsx", "src/app/owner/dashboard/page.tsx",
  "src/app/admin/groups/[id]/page.tsx", "src/app/admin/students/new/page.tsx", "src/app/admin/diagnostics/page.tsx",
  "src/app/admin/exams/page.tsx", "src/app/admin/exams/[id]/page.tsx",
  "src/components/groups/group-student-table.tsx", "src/components/students/students-list-view.tsx",
  "src/components/students/student-profile-view.tsx", "src/components/groups/assign-group-modal.tsx",
  "src/components/groups/group-create-modal.tsx", "src/components/ui/select.tsx", "src/components/ui/cascading-filter.tsx",
  "src/components/attendance/cancel-missed-lesson-modal.tsx", "src/components/layout/sidebar.tsx",
];

test("owner and admin areas: no ALL CAPS labels (`uppercase` / wide tracking), only the letter of an avatar may be capital", () => {
  for (const file of SENTENCE_CASE_FILES) {
    for (const [index, line] of read(file).split("\n").entries()) {
      if (/\buppercase\b|tracking-(wide|wider|widest|\[)/.test(line)) {
        assert.match(line, /rounded-full[\s\S]*(uppercase)/, `${file}:${index + 1} is not an avatar initial: ${line.trim().slice(0, 100)}`);
      }
    }
  }
  assert.doesNotMatch(read("src/components/groups/group-create-modal.tsx"), /ОШИБКА/);
});

test("teacher area: no ALL CAPS labels either (only avatar initials; the PIN digits keep their spacing), no capital literals", () => {
  const files = [...sourceFiles("src/app/teacher"), "src/components/attendance/excuse-reason-field.tsx", "src/components/exam/schedule-exam-modal.tsx", "src/components/exam/rename-exam-modal.tsx"];
  for (const file of files) {
    for (const [index, line] of read(file).split("\n").entries()) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (/\buppercase\b/.test(line)) assert.match(line, /rounded-full/, `${file}:${index + 1} is not an avatar initial`);
      if (/tracking-(wide|wider|widest)\b/.test(line)) assert.match(line, /font-mono/, `${file}:${index + 1}: only a code (PIN, access code) may be spaced out`);
      assert.doesNotMatch(line, /["'>`][^"'<`{}]*[А-ЯЁ]{5,}[ А-ЯЁ]*[^"'<`{}]*["'<`]/, `${file}:${index + 1}: a literal in capitals`);
    }
  }
  const schedule = read("src/components/exam/schedule-exam-modal.tsx");
  assert.ok(schedule.includes('"Подготовка печатного комплекта"') && schedule.includes('"Перенос проведения"') && schedule.includes('"Назначение на занятие"'));
  assert.ok(read("src/app/teacher/exams/[id]/page.tsx").includes('"Отмена проведения" : "Требуется решение"'));
  assert.match(read("src/components/attendance/excuse-reason-field.tsx"), /text-xs font-semibold text-slate-500">\s*<span>Причина/);
});

test("the group roster and the Select label use the style of table-chrome: semibold 13 px slate-500", () => {
  const table = read("src/components/groups/group-student-table.tsx");
  assert.match(table, /px-4 py-3\.5 text-\[13px\] font-semibold text-slate-500 cursor-pointer/);
  for (const label of ["Ученик", "ID ученика", "Класс", "Телефон", "Дата зачисления"]) assert.ok(table.includes(`label="${label}"`), label);
  assert.match(read("src/components/ui/select.tsx"), /block text-\[13px\] font-semibold text-slate-500 mb-1\.5/);
  assert.match(read("src/components/students/students-list-view.tsx"), /border-b border-slate-100 bg-slate-50\/80 text-\[13px\] font-semibold text-slate-500/);
});

// ── 3. no decorative gradient strips ────────────────────────────────────────────────────────────────

test("no blue-violet-green strips: the shared Modal, the group dialogs, the import dialog, change password, the teacher group page", () => {
  for (const file of [
    "src/components/ui/modal.tsx", "src/components/groups/group-create-modal.tsx", "src/components/import/import-modal.tsx",
    "src/app/change-password/page.tsx", "src/app/teacher/groups/[id]/page.tsx",
  ]) {
    assert.doesNotMatch(read(file), /via-violet-400|via-sky-400 to-indigo-500|via-violet-600 to-emerald-400/, file);
    assert.doesNotMatch(read(file), /h-1(\.5)? w-full[^"]*bg-gradient|absolute top-0 left-0 right-0 h-1\.5/, file);
  }
  // what encodes something stays: the status ribbon and the pin stripe of an exam
  assert.match(read("src/app/teacher/exams/[id]/page.tsx"), /exam\.status === "closed" && "bg-gradient-to-r/);
});

// ── 4. the late note of the excuse dialog ───────────────────────────────────────────────────────────

test("late decision note: «Срок подтверждения прошёл (до 12.10). Решение будет отмечено «после срока».»", () => {
  const D = lib("excuse-decision.ts");
  const late = { deadlinePassed: { date: "2026-10-12" } };
  assert.equal(D.lateDecisionNote([late]), "Срок подтверждения прошёл (до 12.10). Решение будет отмечено «после срока».");
  assert.ok(D.lateDecisionNote([late]).includes(`«${D.AFTER_DEADLINE_LABEL}»`), "the word of the chip");
  assert.equal(D.lateDecisionNote([{ deadlinePassed: null }]), null);
  assert.doesNotMatch(read("src/lib/excuse-decision.ts"), /server does NOT flag|останется, кто принял/);
});

// ── 5. the one map of attendance marks ──────────────────────────────────────────────────────────────

test("no «Н/Б», «Ув.», «Ув.?», «Уваж.» in what a person reads: every screen takes the words of attendance-marks", () => {
  for (const file of sourceFiles("src")) {
    for (const [index, line] of read(file).split("\n").entries()) {
      if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line)) continue; // comments may name the old words
      assert.doesNotMatch(line, /Н\/Б|Ув\.\?|Ув\.(?![а-яё])|Уваж\.(?![а-яё])/, `${file}:${index + 1}`);
    }
  }
  const marks = lib("attendance-marks.ts");
  assert.deepEqual(marks.MARK_CELL_LABEL, { present: "Был", late: "Опоздал", absent: "Не был", excused: "Уважительная" });
  assert.deepEqual(marks.EXCUSE_REVIEW_LABEL, { pending: "Ждёт решения", confirmed: "Подтверждена", rejected: "Отклонена" });
  for (const file of ["src/app/teacher/dashboard/page.tsx", "src/app/teacher/schedule/page.tsx"]) {
    const page = read(file);
    for (const key of ["present", "late", "absent", "excused"]) assert.ok(page.includes(`{MARK_CELL_LABEL.${key}}`), `${file} ${key}`);
    assert.match(page, /grid w-full grid-cols-2 gap-1 sm:flex/); // 2 × 2 on a phone, one row from sm
  }
});

test("the summary lines use the same words: «Был: 3 · Не был: 1 · Уважительная: 1», the group of a month without zeros", () => {
  const { formatAttendanceSummary, formatGroupMonthLine } = lib("attendance-summary.ts");
  assert.equal(formatAttendanceSummary({ a: "present", b: "excused" }, 2), "Был: 1 · Уважительная: 1");
  assert.equal(
    formatAttendanceSummary({ a: "present", b: "present", c: "late", d: "absent", e: "excused" }, 7),
    "Был: 2 · Опоздал: 1 · Не был: 1 · Уважительная: 1 · Осталось: 2",
  );
  assert.equal(formatAttendanceSummary({}, 0), "");
  assert.equal(formatGroupMonthLine({ total_lessons: 12, present: 8, late: 1, absent: 2, excused: 1 }), "12 занятий · Был 8 · Опоздал 1 · Не был 2 · Уважительная 1");
  assert.equal(formatGroupMonthLine({ total_lessons: 1, present: 1, late: 0, absent: 0, excused: 0 }), "1 занятие · Был 1");
  assert.equal(formatGroupMonthLine({ total_lessons: 3, present: 0, late: 0, absent: 0, excused: 0 }), "3 занятия");
});

test("payroll cells: the pending excuse is «Ждёт» (short form of «Ждёт решения») and the legend of the same screen explains it", () => {
  const R = lib("payroll.ts");
  const H = lib("payroll-help.ts");
  const cell = R.markCell(1, "excused_pending");
  assert.equal(cell.label, "Ждёт");
  assert.ok(cell.title.startsWith("Ждёт решения"), cell.title);
  const legend = H.SHEET_LEGEND.find((item) => item.key === "pending");
  assert.equal(legend.mark, cell.label, "the legend names exactly what the cell says");
  assert.match(legend.text, /уважительная/);
  assert.ok(read("src/components/payroll/sheet-table.tsx").includes("SHEET_LEGEND.map"), "the sheet shows the legend");
});

// ── 6 and 7. the payments banner on a phone and the counter of the menu ──────────────────────────────

test("payments banner on a phone: the whole sentence, 14 px, wraps, no ellipsis; «Открыть» and the cross stay", () => {
  const { bannerCopy } = lib("payments-banner.ts");
  const mixed = bannerCopy({ due: 7, expired: 3, studentsDue: 5, studentsExpired: 2 });
  assert.equal(`${mixed.compactSubject} ${mixed.compactPredicate}`.replace(/ /g, " "), "5 учеников ждут оплаты (7 оплат), 2 просрочено");
  const banner = read("src/components/payments/payments-alert-banner.tsx");
  assert.match(banner, /<p className="min-w-0 flex-1 text-sm leading-5 text-slate-600 sm:hidden">/);
  assert.doesNotMatch(banner, /line-clamp|truncate|text-ellipsis/);
  assert.match(banner, /<span className="sm:hidden">Открыть<\/span>/);
  assert.match(banner, /aria-label="Скрыть напоминание"/);
});

test("the badge of «Оплаты» counts the debtors - the number of the banner and of the card «Долг учеников» (owner 22.10)", () => {
  const { debtBannerCopy } = lib("payments-banner.ts");
  const { debtorsCount } = lib("payments.ts");
  assert.equal(debtorsCount({ debtors: 33, students_with_debt: 30 }), 33);
  assert.equal(debtorsCount({ students_with_debt: 4 }), 4, "an older server");
  assert.equal(debtorsCount({}), null);
  assert.equal(debtBannerCopy({ debtors: debtorsCount({ debtors: 33 }), debtTotal: 1, overdue: 19 }).count, 33, "banner and badge say one number");
  const sidebar = read("src/components/layout/sidebar.tsx");
  assert.match(sidebar, /debtorsCount\(\{ debtors: state\.debtors, students_with_debt: state\.studentsWithDebt \}\)/);
  assert.doesNotMatch(sidebar, /waitingPeopleCount/);
  assert.equal((sidebar.match(/badge: paymentsDue, badgeLabel: "Должники"/g) || []).length, 2, "owner and administrator");
  // the «Должники» tab of the payments page and the card «Долг учеников» read the one count (owner 21.10)
  assert.match(read("src/components/payments/payments-page.tsx"), /usePaymentsSummary\(\(state\) => state\.debtors\)/);
});
