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
const threshold = require(path.join(root, "src/lib/exam-pass-threshold.ts"));
const paging = require(path.join(root, "src/lib/exam-library-paging.ts"));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("the threshold field accepts only whole numbers 1..100", () => {
  for (const [text, expected] of [["60", 60], [" 70 ", 70], ["1", 1], ["100", 100], ["0", null], ["101", null], ["", null], ["6.5", null], ["-5", null], ["abc", null], ["1e2", null], ["060", 60], ["1000", null]]) {
    assert.equal(threshold.parsePassThreshold(text), expected, JSON.stringify(text));
  }
});

test("an exam without the field (older server) reads as the old 60; a stored one is shown as it is", () => {
  assert.equal(threshold.examPassThreshold({}), 60);
  assert.equal(threshold.examPassThreshold(null), 60);
  assert.equal(threshold.examPassThreshold({ pass_threshold_pct: 70 }), 70);
  assert.equal(threshold.examPassThreshold({ pass_threshold_pct: 0 }), 60);
  assert.equal(threshold.passThresholdTileLabel(70), "Сдали порог (≥70%)");
});

test("«Изменить порог» is offered only for an online exam that has no submitted work and is not archived", () => {
  assert.equal(threshold.canEditPassThreshold({ delivery_mode: "online", status: "draft", pass_threshold_locked: false }), true);
  assert.equal(threshold.canEditPassThreshold({ delivery_mode: "online", status: "active" }), true);
  assert.equal(threshold.canEditPassThreshold({ delivery_mode: "online", status: "closed", pass_threshold_locked: true }), false);
  assert.equal(threshold.canEditPassThreshold({ delivery_mode: "print", status: "draft" }), false);
  assert.equal(threshold.canEditPassThreshold({ delivery_mode: "online", status: "archived" }), false);
});

test("a library page is appended without duplicates and keeps the order", () => {
  const loaded = [{ exam_id: "a" }, { exam_id: "b" }];
  const merged = paging.appendExamPage(loaded, [{ exam_id: "b" }, { exam_id: "c" }]);
  assert.deepEqual(merged.map((e) => e.exam_id), ["a", "b", "c"]);
  assert.equal(loaded.length, 2, "the loaded list is not mutated");
});

test("tab counters are exact only when everything is loaded", () => {
  assert.equal(paging.tabCountLabel(12, false), "12");
  assert.equal(paging.tabCountLabel(12, true), "12+");
  assert.equal(paging.tabCountLabel(0, true), "—");     // nothing loaded yet is not «0»
  assert.equal(paging.tabCountLabel(0, false), "0");
});

test("the create form sends the threshold and blocks an invalid one", () => {
  const form = read("src/app/teacher/exams/new/page.tsx");
  assert.match(form, /pass_threshold_pct: parsePassThreshold\(config\.passThreshold\)/);
  assert.match(form, /parsePassThreshold\(config\.passThreshold\) !== null/);
  assert.match(form, /Проходной порог, %/);
  assert.match(form, /PASS_THRESHOLD_HINT/);
  assert.equal(threshold.PASS_THRESHOLD_HINT, "Ученик с результатом не ниже порога считается справившимся");
});

test("«Отчёт» and «Аналитика» take the threshold from the exam, never a literal 60", () => {
  const report = read("src/app/teacher/exams/[id]/report/page.tsx");
  assert.doesNotMatch(report, /Сдали порог \(≥60%\)/);
  assert.match(report, /passThresholdTileLabel\(examPassThreshold\(report\)\)/);
  const exam = read("src/app/teacher/exams/[id]/page.tsx");
  assert.match(exam, /analytics\?\.pass_threshold_pct/);
  assert.match(exam, /analytics\.pass_rate_pct/);
  assert.match(exam, /Порог: \{examPassThreshold\(exam\)\}%/);
  const admin = read("src/app/admin/exams/[id]/page.tsx");
  assert.match(admin, /passThresholdTileLabel\(examPassThreshold\(analytics\)\)/);
});

test("the threshold is edited from the ⋯ menus of the draft and of the exam, and the server's 409 text reaches the dialog", () => {
  for (const file of ["src/app/teacher/exams/[id]/draft/page.tsx", "src/app/teacher/exams/[id]/page.tsx"]) {
    const source = read(file);
    assert.match(source, /canEditPassThreshold\(/, file);
    assert.match(source, /Изменить порог/, file);
    assert.match(source, /examsApi\.setPassThreshold\(examId, threshold\)/, file);
  }
  const modal = read("src/components/exam/pass-threshold-modal.tsx");
  assert.match(modal, /setError\(err\?\.message/);
  const api = read("src/lib/api.ts");
  assert.match(api, /\/pass-threshold/);
});

test("the library asks for pages, offers «Показать ещё» and does not lose exams of unopened pages in a search", () => {
  const library = read("src/app/teacher/exams/page.tsx");
  assert.match(library, /examsApi\.listPage\(/);
  assert.doesNotMatch(library, /examsApi\.list\(/);
  assert.match(library, /Показать ещё/);
  assert.match(library, /Показано \{exams\.length\} из \{totalExams\}/);
  assert.match(library, /searchQuery\.trim\(\) && hasMore/);      // a search fetches the rest
  assert.match(library, /tabCountLabel\(counts\.active, hasMore\)/);
  assert.match(library, /Порог: \{examPassThreshold\(exam\)\}%/);
});
