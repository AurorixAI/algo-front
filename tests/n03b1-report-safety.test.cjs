// N03b-1 (front): the student's page shows only «test finished» (no report is read, nothing is polled); the staff page says
// «без ИИ из-за сбоя» only for narrative_source = ai_failed; the page keeps no copy of the report schema version.
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

const STUDENT = "src/app/d/[code]/page.tsx";
const STAFF = "src/app/admin/diagnostics/[id]/report/page.tsx";

// ── the student's page ───────────────────────────────────────────────────────────────────────────────

test("the student's page never reads the report and never polls: finishing goes straight to the final screen", () => {
  const page = read(STUDENT);
  for (const gone of [/getReport/, /fetchResult/, /REPORT_POLL/, /REPORT_STAGE/, /"analyzing"/, /reportPollTimerRef/, /DiagReport/, /report_json|overall_level|report_generation/]) {
    assert.doesNotMatch(page, gone, String(gone));
  }
  // two ways in: the answer that ended the test, and a reopened link of a finished attempt (resolve -> completed)
  assert.equal((page.match(/setPhase\("results"\)/g) || []).length, 2);
  const afterAnswer = page.slice(page.indexOf("if (resp.session_completed) {"), page.indexOf("} else if (resp.next_task) {"));
  assert.match(afterAnswer, /diagStore\.complete\(\);[\s\S]*setPhase\("results"\)/);
  const afterResolve = page.slice(page.indexOf('if (resolved.status === "completed") {'), page.indexOf("if (!resolved.current_task)"));
  assert.match(afterResolve, /setPhase\("results"\)/);
  // the final screen is shown whatever the answer of the report service is: no condition on it
  assert.match(page, /\{phase === "results" && \(/);
});

test("the final screen: one sentence, no level, no praise, the time of the test, the way out", () => {
  const page = read(STUDENT);
  const screen = page.slice(page.indexOf('{phase === "results" && ('), page.indexOf('{phase === "error" && ('));
  assert.match(screen, /Тест завершён/);
  assert.match(screen, /Ответы сохранены — результаты увидит преподаватель\./);
  assert.match(screen, /Затраченное время/);
  assert.match(screen, /formatTime\(elapsedMs\)/);
  assert.match(screen, /На главную/);
  // one fact once (LESSONS 87): «saved» and «the teacher will see» are said once, not again in a second card
  assert.equal((screen.match(/сохранены/g) || []).length, 1);
  assert.equal((screen.match(/преподавател/gi) || []).length, 1);
  assert.doesNotMatch(screen, /уровень|балл|%|Отличная работа|Что дальше/i);
});

test("the api has no student read of the report any more (the public route tells only the state of the attempt)", () => {
  assert.doesNotMatch(read("src/lib/api.ts"), /\/report`, "student"|getReport: \(sessionId/);
});

// ── the staff page: why the wording is plain ─────────────────────────────────────────────────────────

const report = (narrative_source) => ({ report_meta: narrative_source === undefined ? {} : { narrative_source } });

test("«без ИИ из-за сбоя» is shown for ai_failed only", () => {
  assert.equal(R.AI_FAILED_NOTE, "Текст отчёта составлен без ИИ из-за сбоя.");
  for (const [source, shown] of [["ai_failed", true], ["ai", false], ["ai_off", false], ["rebuild", false], [undefined, false], ["deterministic_fallback", false]]) {
    assert.equal(R.reportMetaInfo({ status: "ready" }, report(source)).aiFailed, shown, String(source));
  }
  assert.equal(R.reportMetaInfo(null, null).aiFailed, false);
});

test("one place draws the note, and both staff screens use it", () => {
  const page = read(STAFF);
  assert.equal((page.match(/AI_FAILED_NOTE/g) || []).length, 2, "the import and the one use");
  assert.match(page, /\{meta\.aiFailed && \(/);
  assert.match(page, /meta\.degraded \|\| meta\.aiFailed \|\|/, "the block that holds the notes opens for it");
  assert.doesNotMatch(page, /без ИИ/, "the text is the constant's, not typed on the page");
  assert.match(read("src/app/teacher/diagnostics/[id]/report/page.tsx"), /export \{ default \} from "@\/app\/admin\/diagnostics\/\[id\]\/report\/page"/);
});

test("the report on screen holds no name and no invite code of the student (staff see the name from the invite)", () => {
  const page = read(STAFF);
  const shape = page.slice(page.indexOf("interface ReportJson {"), page.indexOf("interface ReportJson {") + 600);
  assert.doesNotMatch(shape, /student_name|test_code/);
  assert.doesNotMatch(page, /report_meta\??\.(student_name|test_code)|rj\.report_meta\.(student_name|test_code)/);
});

// ── no second copy of the schema version ─────────────────────────────────────────────────────────────

test("the page keeps no number of the report schema: it compares with report_generation.current_schema_version", () => {
  const lib = read("src/lib/diagnostic-report.ts");
  assert.doesNotMatch(lib, /CURRENT_REPORT_SCHEMA|Mirrors the backend/);
  assert.doesNotMatch(lib, /REPORT_SCHEMA\s*=\s*\d/);
  assert.match(read(STAFF), /reportMetaInfo\(reportGeneration, rj\)/);
  const old = { report_meta: { report_schema_version: 6 } };
  assert.equal(R.reportMetaInfo({ status: "ready", current_schema_version: 7 }, old).oldFormat, true);
  assert.equal(R.reportMetaInfo({ status: "ready", current_schema_version: 6 }, old).oldFormat, false);
  assert.equal(R.reportMetaInfo({ status: "ready" }, old).oldFormat, false, "no number from the backend: no verdict");
});

// ── R3: the page reads only what the server may send; one source of the final time; the code in a header ──

test("the final time is the server's total_time_ms; the client clock is not used for the final screen", () => {
  const page = read(STUDENT);
  const afterAnswer = page.slice(page.indexOf("if (resp.session_completed) {"), page.indexOf("} else if (resp.next_task) {"));
  assert.match(afterAnswer, /setElapsedMs\(resp\.total_time_ms \?\? 0\)/);
  assert.doesNotMatch(afterAnswer, /Date\.now|initialElapsedMsRef|sessionStartRef/);
  // a refreshed page takes the same number from by-invite
  assert.match(page, /setElapsedMs\(resolved\.total_time_ms\)/);
  // no number, no card (never «0:00»)
  assert.match(page, /\{elapsedMs > 0 && \(/);
});

test("the answer type and the task type hold no result and no internal field of the test", () => {
  const api = read("src/lib/api.ts");
  const block = (name) => api.slice(api.indexOf(`export interface ${name} {`), api.indexOf("\n}\n", api.indexOf(`export interface ${name} {`)));
  for (const name of ["DiagAnswerResult", "DiagTaskOut"]) {
    assert.ok(block(name).length > 40, name);
    assert.doesNotMatch(block(name), /theta|\bse\b|is_correct|outcome|eval_category|stop_reason|skill_id|topic_id|\bphase\b|is_deep_scan/, name);
  }
  const store = read("src/lib/store.ts");
  const diag = store.slice(store.indexOf("interface DiagnosticState {"), store.indexOf("export const useDiagnosticStore"));
  assert.doesNotMatch(diag, /theta|thetaSe|accuracy|phase/);
  const page = read(STUDENT);
  assert.doesNotMatch(page, /resp\.(theta|se|is_correct|outcome|eval_category)\b|\.phase\b/);
});

test("the resume lookup sends the invite code in a header, never in the URL", async () => {
  const api = read("src/lib/api.ts");
  assert.doesNotMatch(api, /by-invite\?invite_code|invite_code=\$\{/);
  assert.match(api, /"\/diagnostic\/sessions\/by-invite", "student", \{ inviteCode, signal \}/);
});
