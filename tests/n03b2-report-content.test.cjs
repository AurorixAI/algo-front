// N03b-2 (front): the content of the diagnostic report (schema 8) - the map of checked topics, the four lines of a plan step,
// «Ещё затруднения», no «Анализ мышления», the Д17 wording, the numbers of the header on a phone, an old report without a crash.
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
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const R = require(path.join(root, "src/lib/diagnostic-report.ts"));

const PAGE = "src/app/admin/diagnostics/[id]/report/page.tsx";
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── the map of checked topics ───────────────────────────────────────────────────────────────────────────

test("a topic line is «Тема · проверено заданий N · с ошибкой k»: no percent, no verdict, a missing number is a dash", () => {
  assert.equal(R.checkedTopicLine({ topic_name_ru: "Дроби", checked: 4, errors: 1 }), "Дроби · проверено заданий 4 · с ошибкой 1");
  assert.equal(R.checkedTopicLine({ topic_name_ru: "Степени", checked: 3, errors: 0 }), "Степени · проверено заданий 3 · с ошибкой 0");
  assert.equal(R.checkedTopicLine({ topic_id: "G8_T1", checked: "x" }), "G8_T1 · проверено заданий — · с ошибкой —");
  assert.equal(R.checkedTopicLine(null), "— · проверено заданий — · с ошибкой —");
  for (const line of [R.checkedTopicLine({ topic_name_ru: "Т", checked: 5, errors: 5 }), R.CHECKED_TOPICS_NOTE]) {
    assert.doesNotMatch(line, /%|сильн|слаб|освоен/i);
  }
});

test("the page shows the map always (not only for 0 errors) as a plain list: rows, no verdict colours", () => {
  const page = code(read(PAGE));
  const start = page.indexOf('data-testid="diagnostic-report-checked-topics"');
  const end = page.indexOf('role="tablist"');
  assert.ok(start > 0 && end > start, "the map sits above the tabs");
  const map = page.slice(start, end);
  // the condition is the list itself, not the errors of the attempt (it is shown for an error-free attempt too)
  assert.match(page.slice(start - 200, start), /rj\.checked_topics && rj\.checked_topics\.length > 0/);
  assert.doesNotMatch(map, /errorFree|rose-|emerald-|amber-|red-|green-/);          // no colour of a verdict
  assert.match(map, /checkedTopicLine\(topic\)/);
});

test("normalizeReportJson keeps schema 8 lists as lists, drops the retired key, leaves an older report without them", () => {
  const n = R.normalizeReportJson({
    report_meta: { report_schema_version: 8 },
    checked_topics: [{ topic_id: "A", checked: 2, errors: 1 }, null, "x"],
    more_difficulties: [{ topic_id: "B", skills: [{ skill_id: "S" }, 5] }, { topic_id: "C" }],
    cognitive_error_types: [{ category: "signs_and_powers", count: 2 }],
  });
  assert.deepEqual(n.checked_topics, [{ topic_id: "A", checked: 2, errors: 1 }]);
  assert.deepEqual(n.more_difficulties, [{ topic_id: "B", skills: [{ skill_id: "S" }] }, { topic_id: "C", skills: [] }]);
  assert.equal("cognitive_error_types" in n, false);
  const old = R.normalizeReportJson({ report_meta: { report_schema_version: 7 }, cognitive_error_types: [{ category: "x" }] });
  assert.equal("checked_topics" in old || "more_difficulties" in old || "cognitive_error_types" in old, false);
  assert.equal(R.hasReportContent({ checked_topics: [] }), true);        // a report of schema 8 is a report even with nothing else
});

// ── the four lines of a step ───────────────────────────────────────────────────────────────────────────

const step = (over = {}) => ({
  priority: 1, skill_id: "S1", skill_name_ru: "Сложение дробей", kind: "correction", action_title: "Отработать", full_description: "Текст.",
  evidence: [
    { journal_no: 3, answer_id: "a3", task_id: "T3", student_answer: "2/5", explanation: "складывает знаменатели", is_deep_scan: false },
    { journal_no: 7, answer_id: "a7", task_id: "T7", student_answer: "1", explanation: null, is_deep_scan: true },
  ],
  material: { tasks: [{ task_id: "B1", question_text: "q1", question_latex: null }, { task_id: "B2", question_text: null, question_latex: "x^2" }], on_lesson: false },
  check: { statement: "Ученик решает без ошибки задание этого навыка из банка", task: { task_id: "B4", question_text: "q4" }, on_lesson: false, text: "Ученик решает без ошибки задание этого навыка из банка." },
  ...over,
});

test("a step of schema 8 has four labelled lines: basis, goal, material, check", () => {
  const lines = R.planStepLines(step());
  assert.equal(R.hasFourLines(lines), true);
  assert.deepEqual(lines.basis.map((b) => [b.journalNo, b.taskId, b.answer, b.explanation, b.deepScan, b.correct]),
    [[3, "T3", "2/5", "складывает знаменатели", false, false], [7, "T7", "1", null, true, false]]);
  assert.equal(lines.goal, "Сложение дробей");
  assert.deepEqual(lines.material.tasks.map((t) => [t.taskId, t.text, t.latex]), [["B1", "q1", null], ["B2", null, "x^2"]]);
  assert.equal(lines.check.text, "Ученик решает без ошибки задание этого навыка из банка.");
  assert.equal(lines.check.task.taskId, "B4");
});

test("a bank without tasks: «задание этого навыка на занятии», no empty links", () => {
  const lines = R.planStepLines(step({
    material: { tasks: [{}, null, { task_id: "" }], on_lesson: true, text: "задание этого навыка на занятии" },
    check: { statement: "Ученик решает без ошибки задание этого навыка из банка", task: null, on_lesson: true, text: "Ученик решает без ошибки задание этого навыка на занятии." },
  }));
  assert.deepEqual(lines.material.tasks, []);
  assert.equal(lines.material.text, "задание этого навыка на занятии");
  assert.equal(lines.check.task, null);
  assert.equal(lines.check.text, "Ученик решает без ошибки задание этого навыка на занятии.");
  assert.equal(R.hasFourLines(lines), true);
});

test("a development step quotes correct answers; a step of an older report has no lines and is shown as before", () => {
  const dev = R.planStepLines(step({ kind: "development", evidence: [{ answer_id: "ok", task_id: "T1", student_answer: "4", correct: true }] }));
  assert.equal(dev.basis[0].correct, true);
  assert.equal(dev.basis[0].journalNo, null);
  for (const old of [{ skill_id: "S", evidence: "observed_error" }, {}, null, undefined, { evidence: [] }, { evidence: [{}], material: "x", check: 5 }]) {
    assert.equal(R.hasFourLines(R.planStepLines(old)), false);
  }
});

test("the label «Развитие» is for development steps only; correction steps are «Шаг N»", () => {
  assert.equal(R.stepBadgeLabel({ kind: "development" }, 0), "Шаг развития");
  assert.equal(R.stepBadgeLabel({ kind: "correction", priority: 1 }, 0), "Стартовый приоритет · Шаг 1");
  for (const [priority, index] of [[2, 1], [3, 2], [5, 4]]) {
    const label = R.stepBadgeLabel({ kind: "correction", priority }, index);
    assert.equal(label, `Шаг ${priority}`);
    assert.doesNotMatch(label, /Развитие/i);
  }
  assert.equal(R.stepBadgeLabel({}, 3), "Шаг 4");                      // an older step: its place in the list
  const page = code(read(PAGE));
  assert.doesNotMatch(page, /· Развитие/);
  assert.match(page, /stepBadgeLabel\(item, idx\)/);
});

test("a journal row is found by its number: the page of the journal that holds it", () => {
  assert.deepEqual([1, 3, 4, 6, 7, 21].map((n) => R.journalPageOf(n, 3)), [0, 0, 1, 1, 2, 6]);
  assert.equal(R.journalPageOf(0, 3), 0);
  assert.equal(R.journalPageOf(5, 0), 0);
});

test("the page prints the four labels, the lines of a step only for a step that has them, and «Ещё затруднения» under the plan", () => {
  const page = code(read(PAGE));
  for (const label of ["Основание", "Цель", "Материал", "Проверка"]) assert.match(page, new RegExp(`<StepLine label="${label}"`));
  assert.match(page, /if \(!hasFourLines\(lines\)\) return null;/);
  assert.match(page, /Ещё затруднения/);
  assert.match(page, /rj\.more_difficulties && rj\.more_difficulties\.length > 0/);
  // a step line is a row of a list with a label above the text on a phone, beside it from sm; the text wraps
  assert.match(page, /grid-cols-1[^"]*sm:grid-cols-\[6\.5rem_minmax\(0,1fr\)\]/);
  assert.match(page, /break-words/);
  // the teacher sees the same page
  assert.match(read("src/app/teacher/diagnostics/[id]/report/page.tsx"), /export \{ default \} from "@\/app\/admin\/diagnostics\/\[id\]\/report\/page";/);
});

// ── no «Анализ мышления» ──────────────────────────────────────────────────────────────────────────────────

test("no «Анализ мышления» on the page or in the helpers", () => {
  const page = read(PAGE);
  for (const gone of [/cognitive/i, /Анализ мышления/, /Когнитивные паттерны/, /expandedClusters/, /toggleCluster/, /\bBrain\b/]) {
    assert.doesNotMatch(page, gone, String(gone));
  }
  assert.doesNotMatch(code(read("src/lib/diagnostic-report.ts")).replace(/delete out\.cognitive_error_types;/, ""), /cognitive/i);
});

// ── texts of Д17 ──────────────────────────────────────────────────────────────────────────────────────────

test("«Deep Scan» is «Углублённая проверка», the lock is gone from «Ошибки в текущем классе»", () => {
  const page = read(PAGE);
  assert.doesNotMatch(page, /Deep Scan/);
  assert.equal(R.DEEP_SCAN_RU, "Углублённая проверка");
  assert.doesNotMatch(page, /\bLock\b/);
  const block = page.slice(page.indexOf("Ошибки в текущем классе") - 400, page.indexOf("Ошибки в текущем классе") + 30);
  assert.doesNotMatch(block, /Lock/);
  assert.doesNotMatch(page, /Структура трека/);
});

test("«Верных» and «Ошибок» are visible on a phone: the same two numbers as a line below xl", () => {
  const header = read("src/components/diagnostics/report-score-header.tsx");
  assert.match(header, /data-testid="diagnostic-report-counts-inline"/);
  const inline = header.slice(header.indexOf('data-testid="diagnostic-report-counts-inline"') - 40, header.indexOf('data-testid="diagnostic-report-counts-inline"') + 400);
  assert.match(inline, /xl:hidden/);
  assert.match(inline, /Верных:[\s\S]*Ошибок:/);
  assert.match(header, /hidden xl:flex/);                                // the cards stay for wide screens
  assert.doesNotMatch(inline, /(?<!xl:)\bhidden\b(?! xl)/);              // the line itself is not hidden below xl
});

// ── one count: header, journal, map ────────────────────────────────────────────────────────────────────────

test("the journal is counted by the rule of the header: rows of measured tasks and rows of the углублённая проверка apart", () => {
  const rows = [{ is_deep_scan: false }, { is_deep_scan: true }, { is_deep_scan: false, task_withdrawn: true }];
  assert.deepEqual(R.journalBreakdown(rows), { measured: 2, deepScan: 1, withdrawn: 1 });
  assert.equal(R.journalBreakdown([{ is_deep_scan: false }, {}]), null);        // a row without the flag: an older journal, the plain length
  assert.equal(R.journalBreakdown([]), null);
  assert.equal(R.journalBreakdown(null), null);
  const page = code(read(PAGE));
  assert.match(page, /badge: journalCounts\?\.measured \?\? rj\?\.error_patterns\.length \?\? 0/);
  assert.match(page, /wrongCount === journalCounts\.measured/);                // «столько же» only when it is true
  assert.match(page, /TASK_WITHDRAWN_NOTE/);
});

test("the withdrawn task is marked in the journal: «Задание снято после проверки»", () => {
  assert.equal(R.TASK_WITHDRAWN_NOTE, "Задание снято после проверки");
});

// ── an older report ───────────────────────────────────────────────────────────────────────────────────────

test("an older report (schema < 8) gets the «старый формат» note against the number from the backend and keeps working", () => {
  const generation = { status: "ready", current_schema_version: 8, is_current_schema: false };
  const old = { report_meta: { report_schema_version: 7 }, action_plan: [{ skill_id: "S", evidence: "observed_error" }] };
  assert.equal(R.reportMetaInfo(generation, old).legacy, true);
  assert.equal(R.reportMetaInfo(generation, { report_meta: { report_schema_version: 8 } }).legacy, false);
  const n = R.normalizeReportJson(old);
  assert.equal(R.tabContentState(n).plan, "plan");
  assert.equal(R.hasFourLines(R.planStepLines(n.action_plan[0])), false);
  assert.match(R.degradedNote(["task_status"]), /банке/);
  assert.match(R.degradedNote(["bank_tasks"]), /задания банка/);
});
