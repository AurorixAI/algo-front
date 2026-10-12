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
const R = require(path.join(__dirname, "../src/lib/diagnostic-report.ts"));

test("a step has a duration only if the report carries a real one", () => {
  assert.equal(R.stepHours({ estimated_hours: 2 }), 2);
  for (const bad of [undefined, null, 0, -1, Number.NaN, "3"]) assert.equal(R.stepHours({ estimated_hours: bad }), null);
  assert.equal(R.stepHours({}), null);
  assert.equal(R.stepHours(null), null);
});

test("plan total is null (nothing shown, nothing invented) when no step has hours", () => {
  assert.equal(R.knownPlanHours([{}, {}, {}]), null);
  assert.equal(R.knownPlanHours(undefined), null);
  assert.equal(R.knownPlanHours([]), null);
  assert.equal(R.knownPlanHours([{ estimated_hours: 2 }, {}, { estimated_hours: 3 }]), 5);
});

test("hoursLabel pluralises Russian hours", () => {
  assert.equal(R.hoursLabel(1), "~1 час");
  assert.equal(R.hoursLabel(2), "~2 часа");
  assert.equal(R.hoursLabel(5), "~5 часов");
  assert.equal(R.hoursLabel(11), "~11 часов");
  assert.equal(R.hoursLabel(21), "~21 час");
});

test("error-free scenario: backend flag wins, counts are the fallback", () => {
  assert.equal(R.isErrorFreeReport({ report_meta: { error_free: true, total_questions: 10, questions_correct: 9 } }), true);
  assert.equal(R.isErrorFreeReport({ report_meta: { error_free: false, total_questions: 10, questions_correct: 10 } }), false);
  assert.equal(R.isErrorFreeReport({ report_meta: { total_questions: 10, questions_correct: 10 }, error_patterns: [] }), true);
  assert.equal(R.isErrorFreeReport({ report_meta: { total_questions: 10, questions_correct: 9 }, error_patterns: [{}] }), false);
  assert.equal(R.isErrorFreeReport({ report_meta: { total_questions: 10, questions_correct: 10 }, error_patterns: [{}] }), false);
  assert.equal(R.isErrorFreeReport({ report_meta: { total_questions: 0, questions_correct: 0 }, error_patterns: [] }), false);
  assert.equal(R.isErrorFreeReport(null), false);
});

test("the plan has one recommended start: the report object, else the first step", () => {
  const plan = [{ skill_id: "A", skill_name_ru: "Дроби" }, { skill_id: "B", skill_name_ru: "Степени" }];
  assert.equal(R.recommendedStartName({ recommended_start: { skill_id: "A", skill_name_ru: "Дроби" }, action_plan: plan }), "Дроби");
  assert.equal(R.recommendedStartName({ action_plan: plan }), "Дроби");
  assert.equal(R.recommendedStartName({ action_plan: [{ action_title: "Отработать: Дроби" }] }), "Отработать: Дроби");
  assert.equal(R.recommendedStartName({ action_plan: [] }), null);
  assert.equal(R.isDevelopmentStep({ kind: "development" }), true);
  assert.equal(R.isDevelopmentStep({}), false);
});

test("report page no longer contains the retired claims (owner decision O4)", () => {
  const root = path.join(__dirname, "..", "src");
  const page = fs.readFileSync(path.join(root, "app/admin/diagnostics/[id]/report/page.tsx"), "utf8");
  const teacher = fs.readFileSync(path.join(root, "app/teacher/diagnostics/[id]/report/page.tsx"), "utf8");
  for (const phrase of [
    "Единая первопричина не подтверждена",
    "Надёжность диагноза",
    "confidence_of_diagnosis",
    "Полная готовность",
    "classEquivalent",
    "class_equivalent",
    "|| 3;",
    "length * 3",
    "методическое заключение",
  ]) assert.equal(page.includes(phrase), false, `report page still contains: ${phrase}`);
  // the teacher route re-exports the same page, so it cannot carry its own copy
  assert.match(teacher, /export \{ default \} from "@\/app\/admin\/diagnostics\/\[id\]\/report\/page"/);
  assert.equal(teacher.includes("первопричина"), false);
  // the automatic summary stays labelled as automatic
  assert.ok(page.includes("Краткое резюме (сформировано автоматически)"));
});
