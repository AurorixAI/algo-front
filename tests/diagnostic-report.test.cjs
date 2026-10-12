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

// ─── N04a ─────────────────────────────────────────────────────────────────────

const errorMeta = { total_questions: 10, questions_correct: 7 };
const freeMeta = { error_free: true, total_questions: 10, questions_correct: 10 };

test("normalizeReportJson: old / partial report_json never leaves a missing list or object", () => {
  assert.equal(R.normalizeReportJson(null), null);
  assert.equal(R.normalizeReportJson(undefined), null);
  assert.equal(R.normalizeReportJson([]), null);
  assert.equal(R.normalizeReportJson("x"), null);
  const n = R.normalizeReportJson({});
  for (const key of ["error_patterns", "action_plan", "strong_skills", "weak_skills", "critical_gaps", "achievements", "root_cause_chains", "cognitive_error_types"]) {
    assert.deepEqual(n[key], [], key);
  }
  assert.deepEqual(n.report_meta, {});
  assert.deepEqual(n.overall, {});
  assert.equal("diagnostic_boundary" in n, false);
  // junk inside lists is dropped, good items are kept as they are
  const m = R.normalizeReportJson({ error_patterns: [null, { task_id: "T" }, "x"], action_plan: "oops", overall: null });
  assert.deepEqual(m.error_patterns, [{ task_id: "T" }]);
  assert.deepEqual(m.action_plan, []);
  assert.deepEqual(m.overall, {});
});

test("normalizeReportJson: partial chain / cluster / boundary objects get safe lists and counts", () => {
  const n = R.normalizeReportJson({
    root_cause_chains: [{ source_skill_name: "A" }, { steps: [{}, {}], steps_count: 5 }],
    cognitive_error_types: [{ category: "c1" }, { category: "c2", examples: [{}, {}, {}], count: 9 }],
    diagnostic_boundary: { anchor_level: "5 класс", anchor_skills: ["Дроби", 7, ""] },
  });
  assert.deepEqual(n.root_cause_chains.map((c) => [c.steps.length, c.steps_count]), [[0, 0], [2, 5]]);
  assert.deepEqual(n.cognitive_error_types.map((c) => [c.examples.length, c.count]), [[0, 0], [3, 9]]);
  assert.deepEqual(n.diagnostic_boundary.anchor_skills, ["Дроби"]);
  assert.deepEqual(n.diagnostic_boundary.breakpoint_skills, []);
  assert.equal(n.diagnostic_boundary.blocked_level, "");
  // the input is not mutated
  const raw = { error_patterns: undefined };
  R.normalizeReportJson(raw);
  assert.deepEqual(raw, { error_patterns: undefined });
});

test("score and wrong-answer counts are null (not 0 / NaN) when the report lacks them", () => {
  assert.equal(R.reportScorePercent({ overall: { score_percent: 64 } }), 64);
  assert.equal(R.reportScorePercent({ overall: {}, report_meta: { score_percent: 50 } }), 50);
  assert.equal(R.reportScorePercent({ overall: { score_percent: 140 } }), 100);
  assert.equal(R.reportScorePercent({ overall: { score_percent: "64" } }), null);
  assert.equal(R.reportScorePercent({}), null);
  assert.equal(R.reportScorePercent(null), null);
  assert.equal(R.reportWrongCount({ total_questions: 10, questions_correct: 7 }), 3);
  assert.equal(R.reportWrongCount({ total_questions: 10 }), null);
  assert.equal(R.reportWrongCount({ total_questions: 5, questions_correct: 6 }), 0);
  assert.equal(R.reportWrongCount(undefined), null);
});

test("achievements: own list wins, else strong skills of an older report", () => {
  assert.deepEqual(R.reportAchievements({ achievements: [{ skill_id: "A", skill_name_ru: "Дроби" }], strong_skills: [{ skill_id: "B" }] }).map((a) => a.skill_id), ["A"]);
  assert.deepEqual(R.reportAchievements({ strong_skills: [{ skill_id: "B", skill_name_ru: "Степени", mastery_percent: 90 }] }), [{ skill_id: "B", skill_name_ru: "Степени", mastery_percent: 90 }]);
  assert.deepEqual(R.reportAchievements({}), []);
  assert.deepEqual(R.reportAchievements(null), []);
});

test("plan tab is never blank: plan / error-free notice / not-built placeholder", () => {
  const plan = [{ skill_id: "A", skill_name_ru: "Дроби" }];
  assert.equal(R.tabContentState({ report_meta: errorMeta, error_patterns: [{}], action_plan: plan }).plan, "plan");
  assert.equal(R.tabContentState({ report_meta: errorMeta, error_patterns: [{}], action_plan: [] }).plan, "not_built");
  assert.equal(R.tabContentState({ report_meta: errorMeta, error_patterns: [{}] }).plan, "not_built");
  assert.equal(R.tabContentState({ report_meta: freeMeta, error_patterns: [], action_plan: [{ kind: "development" }] }).plan, "error_free_with_step");
  assert.equal(R.tabContentState({ report_meta: freeMeta, error_patterns: [], action_plan: [] }).plan, "error_free_no_plan");
  assert.equal(R.tabContentState({ report_meta: freeMeta }).plan, "error_free_no_plan");
  // a legacy report with no meta at all is "not built", never a claim of "no errors"
  assert.equal(R.tabContentState({}).plan, "not_built");
  assert.equal(R.tabContentState(null).plan, "not_built");
});

test("skills tab is never blank: content or the placeholder", () => {
  const boundary = { anchor_level: "5 класс", anchor_skills: ["Дроби"], breakpoint_level: "", breakpoint_skills: [], blocked_level: "", blocked_skills: [] };
  assert.equal(R.tabContentState({ report_meta: errorMeta, diagnostic_boundary: boundary }).skills, "content");
  assert.equal(R.tabContentState({ report_meta: errorMeta, root_cause_chains: [{}] }).skills, "content");
  assert.equal(R.tabContentState({ report_meta: errorMeta, cognitive_error_types: [{}] }).skills, "content");
  // old report: nothing of boundary / chains / patterns
  assert.equal(R.tabContentState({ report_meta: errorMeta, error_patterns: [{}] }).skills, "empty");
  assert.equal(R.tabContentState({ report_meta: errorMeta, diagnostic_boundary: { anchor_skills: [] } }).skills, "empty");
  assert.equal(R.tabContentState({}).skills, "empty");
  // error-free: the confirmed skills are the content
  assert.equal(R.tabContentState({ report_meta: freeMeta, achievements: [{ skill_id: "A" }] }).skills, "content");
  assert.equal(R.tabContentState({ report_meta: freeMeta, strong_skills: [{ skill_id: "A" }] }).skills, "content");
  assert.equal(R.tabContentState({ report_meta: freeMeta }).skills, "empty");
  // the boundary is not a content of an error-free attempt
  assert.equal(R.tabContentState({ report_meta: freeMeta, diagnostic_boundary: boundary }).skills, "empty");
});

test("journal state: errors / positive error-free / no records", () => {
  assert.equal(R.tabContentState({ report_meta: errorMeta, error_patterns: [{}] }).journal, "errors");
  assert.equal(R.tabContentState({ report_meta: freeMeta }).journal, "error_free");
  assert.equal(R.tabContentState({ report_meta: errorMeta }).journal, "no_records");
});

test("placeholder texts make no unverified claim (owner decision O4)", () => {
  assert.equal(R.PLAN_NOT_NEEDED_TEXT, "Коррекционный план не нужен: ошибок не обнаружено");
  assert.equal(R.PLAN_NOT_BUILT_TEXT, "План не сформирован: недостаточно данных для рекомендаций");
  assert.equal(R.SKILLS_EMPTY_TEXT, "Недостаточно данных для анализа навыков");
  for (const text of [R.PLAN_NOT_NEEDED_TEXT, R.PLAN_NOT_BUILT_TEXT, R.SKILLS_EMPTY_TEXT]) {
    assert.equal(/первопричин|надёжност|%/i.test(text), false, text);
  }
});

test("polling backoff: 2 s growing to a 10 s cap", () => {
  assert.equal(R.reportPollDelayMs(0), 2000);
  assert.equal(R.reportPollDelayMs(1), 2500);
  assert.equal(R.reportPollDelayMs(16), 10000);
  assert.equal(R.reportPollDelayMs(39), 10000);
  assert.equal(R.reportPollDelayMs(-3), 2000);
  assert.equal(R.reportPollDelayMs(Number.NaN), 2000);
  let prev = 0;
  for (let i = 0; i < 60; i++) {
    const d = R.reportPollDelayMs(i);
    assert.ok(d >= prev && d <= 10000);
    prev = d;
  }
});

test("polling decisions: pending / generating / null report / ready-without-json all poll", () => {
  const wait = (status, hasReportJson = false, attempt = 0) => R.nextReportPollStep({ attempt, hasReportJson, status });
  assert.deepEqual(wait("pending"), { kind: "wait", delayMs: 2000 });
  assert.deepEqual(wait("generating", false, 3), { kind: "wait", delayMs: 3500 });
  assert.equal(wait(undefined).kind, "wait"); // {report: null}
  assert.equal(wait(null).kind, "wait");
  assert.equal(wait("ready").kind, "wait"); // ready but report_json not there yet
});

test("polling stops: report present, failed, or the cap is reached", () => {
  assert.deepEqual(R.nextReportPollStep({ attempt: 0, hasReportJson: true, status: "ready" }), { kind: "done" });
  assert.deepEqual(R.nextReportPollStep({ attempt: 5, hasReportJson: true, status: "generating" }), { kind: "done" });
  assert.deepEqual(R.nextReportPollStep({ attempt: 0, hasReportJson: false, status: "failed" }), { kind: "failed" });
  assert.deepEqual(R.nextReportPollStep({ attempt: R.REPORT_POLL_MAX_ATTEMPTS, hasReportJson: false, status: "pending" }), { kind: "exhausted" });
  assert.equal(R.REPORT_POLL_MAX_ATTEMPTS, 40);
  // exactly 40 polls happen, then it is exhausted
  let polls = 0;
  for (;;) {
    const step = R.nextReportPollStep({ attempt: polls, hasReportJson: false, status: "generating" });
    if (step.kind !== "wait") { assert.equal(step.kind, "exhausted"); break; }
    polls += 1;
  }
  assert.equal(polls, 40);
});

test("the cap mirrors the student result page", () => {
  const student = fs.readFileSync(path.join(__dirname, "../src/app/d/[code]/page.tsx"), "utf8");
  const m = /REPORT_POLL_MAX_ATTEMPTS\s*=\s*(\d+)/.exec(student);
  assert.ok(m && Number(m[1]) === R.REPORT_POLL_MAX_ATTEMPTS);
});

test("report dates: attempt date and build date are formatted, junk is dropped", () => {
  assert.equal(R.formatReportDate("2026-10-04"), "04.10.2026");
  assert.equal(R.formatReportDate("2026-10-04T23:30:00+00:00"), "04.10.2026");
  for (const bad of [null, undefined, 20261004, "", "04.10.2026", "2026-13-01", "2026-00-10", "2026-10-32"]) assert.equal(R.formatReportDate(bad), null);
});

test("stale / degraded notes: legacy only when the backend says not current and the report is not degraded", () => {
  const rj = { report_meta: { date: "2026-10-04", generated_on: "2026-10-12" } };
  assert.deepEqual(R.reportMetaInfo({ is_current_schema: true }, rj), { attemptDate: "04.10.2026", generatedOn: "12.10.2026", legacy: false, degraded: false });
  assert.equal(R.reportMetaInfo({ is_current_schema: false }, rj).legacy, true);
  assert.equal(R.reportMetaInfo({}, rj).legacy, false); // unknown is not "old"
  assert.equal(R.reportMetaInfo(undefined, rj).legacy, false);
  const degraded = { report_meta: { degraded: ["skill_names"] } };
  assert.deepEqual(R.reportMetaInfo({ is_current_schema: false }, degraded), { attemptDate: null, generatedOn: null, legacy: false, degraded: true });
  assert.equal(R.reportMetaInfo({ is_current_schema: true }, { report_meta: { degraded: [] } }).degraded, false);
  assert.equal(R.reportMetaInfo(null, null).degraded, false);
});
