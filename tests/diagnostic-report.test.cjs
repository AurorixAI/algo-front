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

test("error-free scenario: the flag decides but cannot override the report's own facts; counts are the fallback", () => {
  // flag true is contradicted by a wrong answer / an error record / a level: not error-free (R3 finding 7)
  assert.equal(R.isErrorFreeReport({ report_meta: { error_free: true, total_questions: 10, questions_correct: 9 } }), false);
  assert.equal(R.isErrorFreeReport({ report_meta: { error_free: true, total_questions: 10, questions_correct: 10 }, error_patterns: [{}] }), false);
  assert.equal(R.isErrorFreeReport({ report_meta: { error_free: true }, level: { solved: 5, total: 8 } }), false);
  assert.equal(R.isErrorFreeReport({ report_meta: { error_free: true }, overall: { score_percent: 80 } }), false);
  // ... and consistent with it: error-free
  assert.equal(R.isErrorFreeReport({ report_meta: { error_free: true, total_questions: 10, questions_correct: 10 }, error_patterns: [] }), true);
  assert.equal(R.isErrorFreeReport({ report_meta: { error_free: true } }), true); // no numbers at all: the flag stands
  assert.equal(R.isErrorFreeReport({ report_meta: { error_free: true }, level: { solved: 8, total: 8 } }), true);
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
  for (const key of ["error_patterns", "action_plan", "strong_skills", "weak_skills", "critical_gaps", "root_cause_chains", "cognitive_error_types"]) {
    assert.deepEqual(n[key], [], key);
  }
  // `achievements` exists in schema 5 only: absent stays absent, present stays (even empty)
  assert.equal("achievements" in n, false);
  assert.deepEqual(R.normalizeReportJson({ achievements: [] }).achievements, []);
  assert.deepEqual(R.normalizeReportJson({ achievements: [{ skill_id: "A" }, null] }).achievements, [{ skill_id: "A" }]);
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
  // a missing count is NOT replaced by the number of examples (a sample, not the total)
  assert.deepEqual(n.cognitive_error_types.map((c) => [c.examples.length, c.count]), [[0, undefined], [3, 9]]);
  assert.equal("count" in n.cognitive_error_types[0], false);
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

test("journal state: errors / positive error-free / records unavailable", () => {
  assert.equal(R.tabContentState({ report_meta: errorMeta, error_patterns: [{}] }).journal, "errors");
  assert.equal(R.tabContentState({ report_meta: freeMeta }).journal, "error_free");
  assert.equal(R.tabContentState({ report_meta: errorMeta }).journal, "records_unavailable");
});

test("journal: wrong answers without error records are never framed as «no errors»", () => {
  // legacy report with errors (6 of 10): no error_patterns, no flag, no level
  const legacyWithErrors = { report_meta: { total_questions: 10, questions_correct: 6, score_percent: 60 }, overall: { score_percent: 60 }, strong_skills: [{ skill_id: "S" }] };
  assert.equal(R.wrongAnswersState(legacyWithErrors), "yes");
  assert.equal(R.tabContentState(legacyWithErrors).journal, "records_unavailable");
  // legacy error-free (no flag): every answer solved and no journal - genuinely error-free
  const legacyFree = { report_meta: { total_questions: 10, questions_correct: 10, score_percent: 100 }, overall: { score_percent: 100 } };
  assert.equal(R.wrongAnswersState(legacyFree), "no");
  assert.equal(R.tabContentState(legacyFree).journal, "error_free");
  // schema 5 with errors but an empty error_patterns list
  const schema5 = { report_meta: { error_free: false, total_questions: 12, questions_correct: 7 }, error_patterns: [], level: { solved: 7, total: 12 } };
  assert.equal(R.tabContentState(schema5).journal, "records_unavailable");
  // every source counts: level alone, score alone
  assert.equal(R.tabContentState({ level: { solved: 5, total: 8 } }).journal, "records_unavailable");
  assert.equal(R.tabContentState({ overall: { score_percent: 60 } }).journal, "records_unavailable");
  assert.equal(R.wrongAnswersState({ overall: { score_percent: 100 } }), "no");
  // nothing known: the absence of errors is not claimed either
  assert.equal(R.wrongAnswersState({}), "unknown");
  assert.equal(R.tabContentState({}).journal, "records_unavailable");
  assert.equal(R.tabContentState(null).journal, "records_unavailable");
  // the backend flag wins over counts (error_free: false, zero wrong): the old neutral card
  assert.equal(R.tabContentState({ report_meta: { error_free: false, total_questions: 10, questions_correct: 10 } }).journal, "no_records");
  // a true error-free flag keeps the positive framing even with a stale score
  assert.equal(R.tabContentState({ report_meta: freeMeta, overall: { score_percent: 90 } }).journal, "error_free");
  // texts
  assert.equal(R.JOURNAL_UNAVAILABLE_TEXT, "Подробные записи об ошибках для этого отчёта недоступны");
  assert.equal(R.JOURNAL_UNAVAILABLE_LEGACY_TEXT, "Отчёт сформирован в старом формате.");
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
  const wait = (status, jsonState = "missing", attempt = 0) => R.nextReportPollStep({ attempt, jsonState, status });
  assert.deepEqual(wait("pending"), { kind: "wait", delayMs: 2000 });
  assert.deepEqual(wait("generating", "missing", 3), { kind: "wait", delayMs: 3500 });
  assert.equal(wait(undefined).kind, "wait"); // {report: null}
  assert.equal(wait(null).kind, "wait");
  assert.equal(wait("ready").kind, "wait"); // ready but report_json not there yet
});

test("polling stops: usable report, failed, unusable json, or the cap is reached", () => {
  const step = (o) => R.nextReportPollStep({ attempt: 0, ...o });
  assert.deepEqual(step({ jsonState: "ok", status: "ready" }), { kind: "done" });
  assert.deepEqual(step({ attempt: 5, jsonState: "ok", status: "generating", isCurrentSchema: true }), { kind: "done" });
  assert.deepEqual(step({ jsonState: "ok", status: "failed", isCurrentSchema: false }), { kind: "done" }); // old report stays
  assert.deepEqual(step({ jsonState: "missing", status: "failed" }), { kind: "failed" });
  assert.deepEqual(step({ jsonState: "invalid", status: "ready" }), { kind: "invalid" }); // truthy non-object json (R3 finding 2)
  assert.deepEqual(step({ attempt: R.REPORT_POLL_MAX_ATTEMPTS, jsonState: "missing", status: "pending" }), { kind: "exhausted" });
  assert.equal(R.REPORT_POLL_MAX_ATTEMPTS, 40);
  let polls = 0;
  for (;;) {
    const next = R.nextReportPollStep({ attempt: polls, jsonState: "missing", status: "generating" });
    if (next.kind !== "wait") { assert.equal(next.kind, "exhausted"); break; }
    polls += 1;
  }
  assert.equal(polls, 40);
});

test("historical rebuild: the old report stays, polling continues until the new schema is ready", () => {
  const old = { jsonState: "ok", isCurrentSchema: false };
  assert.equal(R.nextReportPollStep({ attempt: 0, ...old, status: "pending" }).kind, "wait");
  assert.equal(R.nextReportPollStep({ attempt: 7, ...old, status: "generating" }).kind, "wait");
  assert.equal(R.nextReportPollStep({ attempt: R.REPORT_POLL_MAX_ATTEMPTS, ...old, status: "generating" }).kind, "exhausted");
  assert.equal(R.nextReportPollStep({ attempt: 0, ...old, status: "ready" }).kind, "done");
  assert.equal(R.nextReportPollStep({ attempt: 0, jsonState: "ok", isCurrentSchema: true, status: "generating" }).kind, "done");
  assert.equal(R.isRebuildingReport({ status: "generating", is_current_schema: false }), true);
  assert.equal(R.isRebuildingReport({ status: "pending", is_current_schema: false }), true);
  assert.equal(R.isRebuildingReport({ status: "ready", is_current_schema: false }), false);
  assert.equal(R.isRebuildingReport({ status: "pending" }), false);
  assert.equal(R.reportJsonState(undefined), "missing");
  assert.equal(R.reportJsonState(null), "missing");
  assert.equal(R.reportJsonState({}), "ok");
  for (const bad of ["oops", [], 7, true]) assert.equal(R.reportJsonState(bad), "invalid");
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

test("stale / degraded notes: legacy only when the backend says not current and the report is not degraded or rebuilding", () => {
  const rj = { report_meta: { date: "2026-10-04", generated_on: "2026-10-12" } };
  assert.deepEqual(R.reportMetaInfo({ is_current_schema: true }, rj), { attemptDate: "04.10.2026", generatedOn: "12.10.2026", legacy: false, degraded: false, degradedReasons: [], rebuilding: false, oldFormat: false });
  assert.equal(R.reportMetaInfo({ is_current_schema: false }, rj).legacy, true);
  assert.equal(R.reportMetaInfo({ is_current_schema: false, status: "ready" }, rj).legacy, true);
  assert.equal(R.reportMetaInfo({}, rj).legacy, false); // unknown is not "old"
  assert.equal(R.reportMetaInfo(undefined, rj).legacy, false);
  const degraded = { report_meta: { degraded: ["skill_names"] } };
  assert.deepEqual(R.reportMetaInfo({ is_current_schema: false }, degraded), { attemptDate: null, generatedOn: null, legacy: false, degraded: true, degradedReasons: ["skill_names"], rebuilding: false, oldFormat: false });
  assert.equal(R.reportMetaInfo({ is_current_schema: true }, { report_meta: { degraded: [] } }).degraded, false);
  assert.equal(R.reportMetaInfo(null, null).degraded, false);
  // a running rebuild: «обновляется», not «старый формат»
  const rebuilding = R.reportMetaInfo({ is_current_schema: false, status: "generating" }, rj);
  assert.equal(rebuilding.rebuilding, true);
  assert.equal(rebuilding.legacy, false);
});

test("degraded note names what the backend says was unavailable", () => {
  assert.match(R.degradedNote(["skill_names"]), /названия тем/);
  assert.match(R.degradedNote(["knowledge_hierarchy"]), /группировка по разделам/);
  const both = R.degradedNote(["skill_names", "knowledge_hierarchy"]);
  assert.ok(/названия тем/.test(both) && /разделам/.test(both));
  for (const generic of [[], ["something_new"], undefined]) assert.match(R.degradedNote(generic), /некоторые данные могут отображаться неполностью/);
  assert.equal(/первопричин|надёжност|%/i.test(both), false);
});

test("error screens: 403 / 404 have their own text and no «Повторить»; other errors retry", () => {
  for (const subject of ["diagnostic", "report"]) {
    const forbidden = R.loadErrorInfo(403, "Forbidden", subject);
    const missing = R.loadErrorInfo(404, "Not found", subject);
    assert.equal(forbidden.retryable, false);
    assert.equal(missing.retryable, false);
    assert.notEqual(forbidden.title, missing.title);
    assert.equal(forbidden.text.includes("Forbidden"), false); // backend text is not shown for 403 / 404
    assert.equal(missing.text.includes("Not found"), false);
    const server = R.loadErrorInfo(500, "Сервис недоступен", subject);
    assert.equal(server.retryable, true);
    assert.equal(server.text, "Сервис недоступен");
  }
  assert.equal(R.loadErrorInfo(0, "", "diagnostic").retryable, true);
  assert.equal(R.loadErrorInfo(null, null, "report").text, "Не удалось загрузить отчёт. Повторите попытку.");
  assert.equal(R.loadErrorInfo(undefined, "  ", "diagnostic").title, "Не удалось открыть диагностику");
});

test("report page contract (N04a): tabs a11y, no fixed-1800ms poll, no fake task statement, boundaries exist", () => {
  const root = path.join(__dirname, "..", "src");
  const page = fs.readFileSync(path.join(root, "app/admin/diagnostics/[id]/report/page.tsx"), "utf8");
  for (const needle of ['role="tablist"', 'role="tab"', "aria-selected", "aria-controls", 'role="tabpanel"']) {
    assert.ok(page.includes(needle), `missing ${needle}`);
  }
  // polling goes through the pure schedule, never a fixed unlimited interval
  assert.ok(page.includes("createReportPoller"));
  assert.equal(/setTimeout\([^)]*,\s*1800\)/.test(page), false);
  assert.ok(page.includes("document.hidden"));
  // placeholders come from the tested constants
  for (const name of ["PLAN_NOT_NEEDED_TEXT", "planNotBuiltText", "skillsEmptyText", "JOURNAL_UNAVAILABLE_TEXT", "JOURNAL_UNAVAILABLE_LEGACY_TEXT"]) assert.ok(page.includes(name), name);
  // a missing task statement is never replaced by the skill name
  assert.equal(page.includes("fallbackText={err.skill_name_ru}"), false);
  assert.ok(page.includes("Условие задания недоступно"));
  // Tailwind 3.4 has no gap-4.5; the 3-column grids start at xl, not at the viewport md
  assert.equal(/gap-4\.5\b/.test(page), false);
  assert.equal(/md:grid-cols-3/.test(page), false);
  // old / partial JSON is normalised before use
  assert.ok(page.includes("normalizeReportJson(report?.report_json)"));
  for (const dir of ["admin", "teacher"]) {
    const boundary = path.join(root, `app/${dir}/diagnostics/[id]/report/error.tsx`);
    assert.ok(fs.existsSync(boundary), `${dir} error.tsx`);
    assert.ok(fs.readFileSync(boundary, "utf8").startsWith('"use client"'));
  }
});

// ─── N04 round 2 (R3 findings) ────────────────────────────────────────────────

test("Russian plurals of the counters (шаг / ошибка / задание / этап)", () => {
  const steps = [0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map((n) => R.stepsLabel(n));
  assert.deepEqual(steps, ["0 шагов", "1 шаг", "2 шага", "4 шага", "5 шагов", "11 шагов", "12 шагов", "14 шагов", "21 шаг", "22 шага", "25 шагов", "101 шаг", "111 шагов"]);
  assert.deepEqual([1, 2, 5, 21].map(R.errorsLabel), ["1 ошибка", "2 ошибки", "5 ошибок", "21 ошибка"]);
  assert.deepEqual([1, 3, 10, 22].map(R.tasksLabel), ["1 задание", "3 задания", "10 заданий", "22 задания"]);
  assert.deepEqual([1, 2, 5].map(R.stagesLabel), ["1 этап", "2 этапа", "5 этапов"]);
  assert.equal(R.pluralRu(Number.NaN, "a", "b", "c"), "c");
});

test("a deep-scan step without a numeric outcome is «unknown», never an error", () => {
  assert.equal(R.stepOutcomeState(1), "correct");
  assert.equal(R.stepOutcomeState(1.0), "correct");
  assert.equal(R.stepOutcomeState(0), "wrong");
  assert.equal(R.stepOutcomeState(0.5), "wrong");
  for (const bad of [undefined, null, "1", Number.NaN]) assert.equal(R.stepOutcomeState(bad), "unknown");
});

test("achievements: the verified list (even empty) is never replaced by model-estimated strong skills", () => {
  const strong = [{ skill_id: "B", skill_name_ru: "Степени", mastery_percent: 90 }];
  assert.deepEqual(R.resolveAchievements({ achievements: [], strong_skills: strong }), { items: [], fallback: false });
  assert.deepEqual(R.resolveAchievements({ achievements: [{ skill_id: "A" }], strong_skills: strong }), { items: [{ skill_id: "A" }], fallback: false });
  assert.equal(R.resolveAchievements({ strong_skills: strong }).fallback, true);
  assert.deepEqual(R.resolveAchievements({}), { items: [], fallback: false });
  // after the page's normalisation the absent key is still absent: schema-5 empty stays empty
  const raw5 = { achievements: [], strong_skills: strong };
  assert.deepEqual(R.reportAchievements(R.normalizeReportJson(raw5)), []);
  assert.equal(R.reportAchievements(R.normalizeReportJson({ strong_skills: strong })).length, 1);
});

test("breakpoint wording follows the backend evidence (owner decision O4)", () => {
  const confirmed = R.breakpointCopy({ breakpoint_evidence: "confirmed" }, { deep_scan_incomplete: false });
  assert.equal(confirmed.title, "Подтверждённый пробел (углублённая проверка)");
  const observed = R.breakpointCopy({ breakpoint_evidence: "observed" }, {});
  assert.equal(observed.title, "Ключевой наблюдаемый дефицит");
  // an old report without the field is "observed", never "confirmed"
  assert.equal(R.breakpointCopy({}, {}).title, "Ключевой наблюдаемый дефицит");
  assert.equal(R.breakpointCopy(null, null).title, "Ключевой наблюдаемый дефицит");
  for (const copy of [confirmed, observed]) {
    assert.equal(/слом|разрушен|первопричин|пререквизит|надёжност/i.test(copy.title + copy.description), false, JSON.stringify(copy));
  }
  // «Глубоких сбоев не выявлено» is never said, least of all after an incomplete deep scan
  for (const evidence of ["confirmed", "observed", undefined]) {
    const incomplete = R.breakpointCopy({ breakpoint_evidence: evidence }, { deep_scan_incomplete: true });
    assert.equal(incomplete.emptyText, "Углублённая проверка выполнена не полностью");
    const complete = R.breakpointCopy({ breakpoint_evidence: evidence }, { deep_scan_incomplete: false });
    assert.notEqual(complete.emptyText, "Углублённая проверка выполнена не полностью");
    assert.equal(/Глубоких сбоев/.test(String(complete.emptyText)), false);
  }
  assert.equal(R.breakpointCopy({ breakpoint_evidence: "confirmed" }, {}).emptyText, null);
});

test("skills tab: the chains block counts for an error-free report as well", () => {
  assert.equal(R.tabContentState({ report_meta: freeMeta, root_cause_chains: [{}] }).skills, "content");
  assert.equal(R.tabContentState({ report_meta: freeMeta }).skills, "empty");
});

test("placeholders of an old-format report say the section does not exist, not «not enough data»", () => {
  assert.equal(R.skillsEmptyText(true), "Этот раздел не входит в отчёт старого формата");
  assert.equal(R.planNotBuiltText(true), "Этот раздел не входит в отчёт старого формата");
  assert.equal(R.skillsEmptyText(false), R.SKILLS_EMPTY_TEXT);
  assert.equal(R.planNotBuiltText(false), R.PLAN_NOT_BUILT_TEXT);
});

test("path ids are decoded once, then encoded: no double encoding", () => {
  const { encodePathId } = require(path.join(__dirname, "../src/lib/encode-id.ts"));
  assert.equal(encodePathId("abc-123"), "abc-123");
  assert.equal(encodePathId("a/b"), "a%2Fb");
  assert.equal(encodePathId("a%2Fb"), "a%2Fb"); // already encoded by the router
  assert.equal(encodePathId("a b"), "a%20b");
  assert.equal(encodePathId("a%20b"), "a%20b");
  assert.equal(encodePathId("100%"), "100%25"); // not valid percent-encoding: encoded as is
  assert.equal(encodePathId("%E0%A4%A"), "%25E0%25A4%25A");
});

// ─── report poller with fake timers ───────────────────────────────────────────

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    get pending() { return timers.size; },
    get now() { return now; },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next.t.at)) next = { id, t };
        if (!next) break;
        timers.delete(next.id);
        now = next.t.at;
        next.t.fn();
        await flush();
      }
      now = end;
    },
  };
}

const pending = (over = {}) => ({ report_json: null, report_generation: { status: "pending", ...over } });
const readyReport = (over = {}) => ({ report_json: { report_meta: {} }, report_generation: { status: "ready", is_current_schema: true, ...over } });

function setup(fetchImpl, clock = fakeClock()) {
  const states = [];
  const calls = [];
  let hidden = false;
  const poller = R.createReportPoller({
    fetchReport: async () => { calls.push(clock.now); return fetchImpl(calls.length); },
    setTimeout: (fn, ms) => clock.setTimeout(fn, ms),
    clearTimeout: (h) => clock.clearTimeout(h),
    isHidden: () => hidden,
    onState: (s) => states.push(s),
  });
  return { clock, states, calls, poller, setHidden: (v) => { hidden = v; } };
}

test("poller: backoff sequence 2 s, 2.5 s, 3 s ... between polls", async () => {
  const { clock, calls, poller } = setup(() => pending());
  poller.ingest(pending());
  await clock.advance(60000);
  let expected = 0;
  const times = [];
  for (let i = 0; i < calls.length; i++) { expected += R.reportPollDelayMs(i); times.push(expected); }
  assert.deepEqual(calls, times);
  assert.ok(calls.length >= 8);
  assert.deepEqual(calls.slice(0, 3), [2000, 4500, 7500]);
  poller.cancel();
});

test("poller: 40 polls at most, then «exhausted» and no timer left", async () => {
  const { clock, calls, states, poller } = setup(() => pending({ status: "generating" }));
  poller.ingest(pending());
  await clock.advance(600000);
  assert.equal(calls.length, 40);
  assert.equal(states[states.length - 1].phase, "exhausted");
  assert.equal(clock.pending, 0);
  await clock.advance(600000);
  assert.equal(calls.length, 40);
});

test("poller: nothing is fetched while the tab is hidden; repeated visibilitychange resumes exactly one poll", async () => {
  const { clock, calls, poller, setHidden } = setup(() => pending());
  poller.ingest(pending());
  setHidden(true);
  await clock.advance(30000);
  assert.equal(calls.length, 0);
  assert.equal(clock.pending, 0);
  poller.visibilityChanged(); // still hidden: nothing
  await flush();
  assert.equal(calls.length, 0);
  setHidden(false);
  poller.visibilityChanged();
  poller.visibilityChanged();
  poller.visibilityChanged();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(clock.pending, 1); // exactly one next timer, not three
  poller.cancel();
});

test("poller: ingesting twice never leaves two timers; cancel clears; a fresh poller does not duplicate", async () => {
  const clock = fakeClock();
  const a = setup(() => pending(), clock);
  a.poller.ingest(pending());
  a.poller.ingest(pending());
  assert.equal(clock.pending, 1);
  a.poller.cancel();
  assert.equal(clock.pending, 0);
  const b = setup(() => pending(), clock);
  b.poller.ingest(pending());
  assert.equal(clock.pending, 1);
  await clock.advance(2000);
  assert.equal(a.calls.length, 0);
  assert.equal(b.calls.length, 1);
  b.poller.cancel();
});

test("poller: after cancel a late in-flight response is ignored", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { clock, states, calls, poller } = setup(() => gate);
  poller.ingest(pending());
  await clock.advance(2000);
  assert.equal(calls.length, 1); // in flight
  const before = states.length;
  poller.cancel();
  release(readyReport());
  await flush();
  assert.equal(states.length, before);
  assert.equal(clock.pending, 0);
});

test("poller: {report: null} and ready-without-report_json keep polling until the report appears", async () => {
  const seq = [{ report: null }, { report_json: null, report_generation: { status: "ready" } }, readyReport()];
  const { clock, states, calls, poller } = setup((n) => seq[n - 1]);
  poller.ingest({ report: null });
  assert.equal(states[0].phase, "polling");
  assert.equal(states[0].response, null);
  await clock.advance(60000);
  assert.equal(calls.length, 3);
  assert.equal(states[states.length - 1].phase, "done");
  assert.equal(clock.pending, 0);
});

test("poller: a non-object report_json ends the poll as «invalid» (no endless «updating»)", async () => {
  for (const bad of ["oops", []]) {
    const { clock, states, poller } = setup(() => pending());
    poller.ingest({ report_json: bad, report_generation: { status: "ready" } });
    assert.equal(states[0].phase, "invalid");
    assert.equal(clock.pending, 0);
  }
});

test("poller: failed generation without a report stops; with the old report it is just shown", async () => {
  const a = setup(() => pending());
  a.poller.ingest(pending({ status: "failed" }));
  assert.equal(a.states[0].phase, "failed");
  assert.equal(a.clock.pending, 0);
  const b = setup(() => pending());
  b.poller.ingest(readyReport({ status: "failed", is_current_schema: false }));
  assert.equal(b.states[0].phase, "done");
  assert.equal(b.clock.pending, 0);
});

test("poller: 3 consecutive transient failures (status 0 / 408 / 429 / 5xx / unknown) are tolerated, the 4th ends the poll; other 4xx fails at once", async () => {
  assert.equal(R.REPORT_POLL_TOLERATED_FAILURES, 3);
  const net = Object.assign(new Error("offline"), { status: 0 });
  const down = Object.assign(new Error("bad gateway"), { status: 502 });
  // two failures, then the report: the poll survives
  const seq1 = [() => { throw net; }, () => { throw down; }, () => readyReport()];
  const a = setup((n) => seq1[n - 1]());
  a.poller.ingest(pending());
  await a.clock.advance(60000);
  assert.equal(a.calls.length, 3);
  assert.equal(a.states[a.states.length - 1].phase, "done");
  // a success in between resets the counter: fail, fail, pending, fail, fail, ready
  const seq2 = [() => { throw net; }, () => { throw net; }, () => pending(), () => { throw down; }, () => { throw net; }, () => readyReport()];
  const b = setup((n) => seq2[n - 1]());
  b.poller.ingest(pending());
  await b.clock.advance(120000);
  assert.equal(b.states[b.states.length - 1].phase, "done");
  assert.equal(b.calls.length, 6);
  // three failures in a row are tolerated (the poll goes on and recovers) ...
  const seq3 = [() => { throw net; }, () => { throw net; }, () => { throw down; }, () => readyReport()];
  const three = setup((n) => seq3[n - 1]());
  three.poller.ingest(pending());
  await three.clock.advance(120000);
  assert.equal(three.calls.length, 4);
  assert.equal(three.states[three.states.length - 1].phase, "done");
  // ... the 4th consecutive one is an honest error
  const c = setup(() => { throw net; });
  c.poller.ingest(pending());
  await c.clock.advance(120000);
  assert.equal(c.calls.length, 4);
  const last = c.states[c.states.length - 1];
  assert.equal(last.phase, "error");
  assert.equal(last.error.status, 0);
  assert.equal(c.clock.pending, 0);
  // an error without a status (e.g. a JSON parse failure) counts as transient too
  const d = setup(() => { throw new TypeError("x"); });
  d.poller.ingest(pending());
  await d.clock.advance(120000);
  assert.equal(d.calls.length, 4);
  // 408 and 429 are transient like 5xx
  for (const code of [408, 429]) {
    const f = setup((n) => { if (n === 1) throw Object.assign(new Error("slow"), { status: code }); return readyReport(); });
    f.poller.ingest(pending());
    await f.clock.advance(60000);
    assert.equal(f.calls.length, 2, `status ${code}`);
    assert.equal(f.states[f.states.length - 1].phase, "done");
  }
  assert.deepEqual([0, 408, 429, 500, 503, null, undefined].map(R.isTransientStatus), [true, true, true, true, true, true, true]);
  assert.deepEqual([400, 401, 403, 404, 410, 422].map(R.isTransientStatus), [false, false, false, false, false, false]);
  // 4xx: immediately
  for (const code of [400, 401, 403, 404, 422]) {
    const e = setup(() => { throw Object.assign(new Error("no"), { status: code }); });
    e.poller.ingest(pending());
    await e.clock.advance(60000);
    assert.equal(e.calls.length, 1, `status ${code}`);
    assert.equal(e.states[e.states.length - 1].phase, "error");
    assert.equal(e.states[e.states.length - 1].error.status, code);
  }
});

test("poller: the old report of a historical rebuild stays visible and the poll continues until the new one is ready", async () => {
  const rebuilding = (status) => ({ report_json: { report_meta: { date: "2026-09-01" } }, report_generation: { status, is_current_schema: false } });
  const seq = [rebuilding("generating"), rebuilding("generating"), readyReport({ is_current_schema: true })];
  const { clock, states, calls, poller } = setup((n) => seq[n - 1]);
  poller.ingest(rebuilding("pending"));
  assert.equal(states[0].phase, "polling");
  assert.equal(states[0].rebuilding, true);
  assert.ok(states[0].response.report_json); // the old report is handed to the page
  await clock.advance(60000);
  assert.equal(calls.length, 3);
  const last = states[states.length - 1];
  assert.equal(last.phase, "done");
  assert.equal(last.rebuilding, false);
  assert.equal(last.response.report_generation.is_current_schema, true);
  assert.equal(clock.pending, 0);
  // the cap applies to a rebuild as well
  const stuck = setup(() => rebuilding("generating"));
  stuck.poller.ingest(rebuilding("generating"));
  await stuck.clock.advance(600000);
  assert.equal(stuck.calls.length, 40);
  const end = stuck.states[stuck.states.length - 1];
  assert.equal(end.phase, "exhausted");
  assert.equal(end.rebuilding, true);
});

test("report page contract (N04 round 2): no unverified claims, no non-Tailwind sizes, honest states", () => {
  const root = path.join(__dirname, "..", "src");
  const page = fs.readFileSync(path.join(root, "app/admin/diagnostics/[id]/report/page.tsx"), "utf8");
  // process / causal claims that are not in the report
  for (const phrase of [
    "серия из 5 задач подряд",
    "итог проверяется повторной диагностикой",
    "первичное разрушение",
    "Точка слома понимания",
    "Глубоких сбоев не выявлено",
    "невозможно освоить без",
    "решённые стабильно",
  ]) assert.equal(page.includes(phrase), false, phrase);
  // every Tailwind size on the half-step scale must exist: 0.5 1.5 2.5 3.5 only (-4.5, -5.5 ... are not classes)
  assert.equal(/-(?:[4-9]|1\d)\.5\b/.test(page.replace(/\[[^\]]*\]/g, "")), false, "a -N.5 utility that Tailwind 3.4 does not generate");
  // tabpanel is focusable, the poll is the tested poller, achievements fallback is labelled
  assert.ok(/role="tabpanel"[^>]*tabIndex=\{0\}|tabIndex=\{0\}[^>]*role="tabpanel"|id="report-tabpanel" tabIndex=\{0\}/.test(page));
  assert.ok(page.includes("createReportPoller"));
  assert.ok(page.includes("breakpointCopy"));
  assert.ok(page.includes("Сильные стороны (по оценке модели)"));
  assert.ok(page.includes("diagnostic-report-rebuilding"));
  assert.ok(page.includes("stepOutcomeState"));
  assert.ok(page.includes("normalizeReportJson(report?.report_json) !== null"));
  // the failed state has its own manual re-check
  const failedBlock = page.slice(page.indexOf("Generating / unavailable"), page.indexOf("REPORT BLOCKS"));
  assert.ok(failedBlock.includes("failed") && failedBlock.includes("Проверить снова"));
  // the missing-attempt error is final: no retry
  assert.ok(page.includes("setReportErrorRetryable(false)"));
  // error boundary: link back to the list
  const boundary = fs.readFileSync(path.join(root, "app/admin/diagnostics/[id]/report/error.tsx"), "utf8");
  assert.ok(boundary.includes("Назад к списку"));
  // api uses the decode-once helper
  const api = fs.readFileSync(path.join(root, "lib/api.ts"), "utf8");
  assert.ok(api.includes("/auth/org/diagnostics/${encodePathId(id)}`"));
  assert.ok(api.includes("/analytics/students/${encodePathId(studentId)}/report?"));
  assert.equal(api.includes("${encodeURIComponent(id)}`)"), false);
});

// ─── N04 round 3 ──────────────────────────────────────────────────────────────

test("journal page is clamped: a shorter replacement report never leaves an empty page", () => {
  // old report: 9 records on page index 2 (records 7-9); the new one has 3 -> page 0
  assert.equal(R.clampPage(2, 3, 3), 0);
  assert.equal(R.clampPage(2, 9, 3), 2);
  assert.equal(R.clampPage(5, 9, 3), 2);
  assert.equal(R.clampPage(1, 4, 3), 1);
  assert.equal(R.clampPage(1, 3, 3), 0);
  assert.equal(R.clampPage(0, 0, 3), 0);
  assert.equal(R.clampPage(-4, 9, 3), 0);
  assert.equal(R.clampPage(Number.NaN, 9, 3), 0);
  assert.equal(R.clampPage(3, 10, 0), 0);
  // the slice shown is never empty for a non-empty list
  for (let total = 1; total <= 12; total++) for (let page = 0; page < 6; page++) {
    const p = R.clampPage(page, total, 3);
    assert.ok(total - p * 3 > 0, `total ${total} page ${page}`);
  }
});

test("report identity changes when the report is replaced, not when it is polled again", () => {
  const rep = (over = {}, generatedAt = "2026-10-12T10:00:00") => ({ generated_at: generatedAt, report_json: { report_meta: { session_id: "S1", generated_on: "2026-10-12", report_schema_version: 5, ...over } } });
  const base = R.reportIdentity(rep());
  assert.equal(R.reportIdentity(rep()), base); // same report polled again
  assert.notEqual(R.reportIdentity(rep({ generated_on: "2026-10-13" })), base);
  assert.notEqual(R.reportIdentity(rep({ report_schema_version: 4 })), base);
  assert.notEqual(R.reportIdentity(rep({ session_id: "S2" })), base);
  assert.notEqual(R.reportIdentity(rep({}, "2026-10-12T11:00:00")), base); // rebuilt the same day
  // old report (no meta fields) -> new report: different
  assert.notEqual(R.reportIdentity({ report_json: { report_meta: {} } }), base);
  for (const none of [null, undefined, {}, { report_json: "oops" }, { report_json: null }]) assert.equal(R.reportIdentity(none), "|||");
});

test("during a rebuild the old report is still «old format»: placeholders and journal line say so", () => {
  const rj = { report_meta: { date: "2026-09-01" } };
  const rebuilding = R.reportMetaInfo({ status: "generating", is_current_schema: false }, rj);
  assert.equal(rebuilding.legacy, false);
  assert.equal(rebuilding.rebuilding, true);
  assert.equal(rebuilding.oldFormat, true);
  assert.equal(R.skillsEmptyText(rebuilding.oldFormat), R.SECTION_LEGACY_TEXT);
  assert.equal(R.planNotBuiltText(rebuilding.oldFormat), R.SECTION_LEGACY_TEXT);
  const settled = R.reportMetaInfo({ status: "ready", is_current_schema: false }, rj);
  assert.deepEqual([settled.legacy, settled.oldFormat], [true, true]);
  const current = R.reportMetaInfo({ status: "ready", is_current_schema: true }, rj);
  assert.equal(current.oldFormat, false);
  assert.equal(R.skillsEmptyText(current.oldFormat), R.SKILLS_EMPTY_TEXT);
  assert.equal(R.reportMetaInfo({ status: "ready", is_current_schema: false }, { report_meta: { degraded: ["skill_names"] } }).oldFormat, false);
});

test("a chain reconstructed from the answers is marked neutrally and never makes a «confirmed» breakpoint", () => {
  assert.equal(R.CHAIN_INFERRED_TEXT, "выведено по ответам, без углублённой проверки");
  assert.equal(R.isInferredChain({ evidence_source: "inferred" }), true);
  for (const other of [{ evidence_source: "stored_link" }, {}, null, undefined]) assert.equal(R.isInferredChain(other), false);
  const confirmed = { breakpoint_evidence: "confirmed" };
  assert.equal(R.breakpointCopy(confirmed, {}, [{ evidence_source: "stored_link" }]).title, "Подтверждённый пробел (углублённая проверка)");
  assert.equal(R.breakpointCopy(confirmed, {}, [{ evidence_source: "inferred" }, { evidence_source: "stored_link" }]).title, "Подтверждённый пробел (углублённая проверка)");
  assert.equal(R.breakpointCopy(confirmed, {}, [{}]).title, "Подтверждённый пробел (углублённая проверка)"); // older chains carry no source
  assert.equal(R.breakpointCopy(confirmed, {}).title, "Подтверждённый пробел (углублённая проверка)");
  assert.equal(R.breakpointCopy(confirmed, {}, []).title, "Подтверждённый пробел (углублённая проверка)");
  assert.equal(R.breakpointCopy(confirmed, {}, [{ evidence_source: "inferred" }, { evidence_source: "inferred" }]).title, "Ключевой наблюдаемый дефицит");
});

test("boundary texts: capped lists say «основные»; the observed text names the earliest grade with errors", () => {
  const observed = R.breakpointCopy({ breakpoint_evidence: "observed" }, {});
  assert.equal(observed.description, "Основные навыки с ошибками в самом раннем классе, где были ошибки.");
  assert.match(R.breakpointCopy({ breakpoint_evidence: "confirmed" }, {}).description, /основные навыки/);
});

test("a final error (no attempt id) is not «temporary» and has no retry", () => {
  const fin = R.loadErrorInfo(null, "У завершённой диагностики отсутствует идентификатор попытки.", "report", false);
  assert.equal(fin.title, "Отчёт недоступен");
  assert.equal(fin.retryable, false);
  assert.equal(/временно/i.test(fin.title + fin.text), false);
  assert.equal(R.loadErrorInfo(500, "x", "report").title, "Отчёт временно недоступен"); // a retryable error keeps «временно»
  assert.equal(R.loadErrorInfo(403, "x", "report", false).title, "Нет доступа к отчёту");
  assert.equal(R.loadErrorInfo(null, "", "report", false).text, "Отчёт для этой диагностики недоступен.");
});

test("report page contract (N04 round 3): owner-decision wording, no duration promise, state reset", () => {
  const root = path.join(__dirname, "..", "src");
  const page = fs.readFileSync(path.join(root, "app/admin/diagnostics/[id]/report/page.tsx"), "utf8");
  assert.equal(/первопричин/i.test(page), false, "O4: no «первопричин» wording on the page");
  assert.ok(page.includes('label: "Анализ навыков"'));
  assert.ok(page.includes('title="Цепочки диагностического спуска (Deep Scan)"'));
  assert.equal(page.includes("Обычно подготовка занимает"), false);
  assert.equal(/до минуты/.test(page), false);
  assert.ok(page.includes("clampPage(errorPage"));
  assert.ok(page.includes("reportIdentity(report)"));
  assert.ok(page.includes("setExpandedChains([])") && page.includes("setExpandedClusters([])"));
  assert.ok(page.includes("meta.oldFormat"));
  assert.equal(page.includes("skillsEmptyText(meta.legacy)"), false);
  assert.ok(page.includes("isInferredChain(ch)"));
  assert.ok(page.includes("loadErrorInfo(reportErrorStatus, reportError, \"report\", reportErrorRetryable)"));
});
