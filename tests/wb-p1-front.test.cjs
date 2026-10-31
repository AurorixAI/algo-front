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

test("what the create form sends is the typed threshold, or 60 when the field is unusable", () => {
  assert.equal(threshold.thresholdForPayload("70"), 70);
  assert.equal(threshold.thresholdForPayload(" 100 "), 100);
  for (const bad of ["", "0", "101", "x", "6.5"]) assert.equal(threshold.thresholdForPayload(bad), 60, JSON.stringify(bad));
});

test("the create form is wired to the field (wiring only: the rules above are tested as behaviour)", () => {
  const form = read("src/app/teacher/exams/new/page.tsx");
  assert.match(form, /pass_threshold_pct: thresholdForPayload\(config\.passThreshold\)/);
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

test("the line between «passed» and «not passed» is the exam's threshold; the finer marks (85, 70, 80) stay", () => {
  // default 60: as before for the bands above it
  assert.deepEqual([50, 59, 60, 69, 70, 84, 85, 100].map((p) => threshold.resultBand(p, 60)), ["needHelp", "needHelp", "satisfactory", "satisfactory", "good", "good", "excellent", "excellent"]);
  // threshold 70: 65 % is NOT passed any more (it used to be a «satisfactory» yellow), 70 % is
  assert.equal(threshold.resultBand(65, 70), "needHelp");
  assert.equal(threshold.resultBand(70, 70), "good");
  // threshold 90: every passer is «excellent», the bands in between are empty
  assert.equal(threshold.resultBand(89, 90), "needHelp");
  assert.equal(threshold.resultBand(90, 90), "excellent");
  const high = threshold.resultBounds(90);
  assert.equal(high.good, null);
  assert.equal(high.satisfactory, null);
  assert.equal(threshold.resultBandLabel("good", 90), "—");
  // threshold 50: «удовлетворительно» is 50-69
  assert.equal(threshold.resultBand(50, 50), "satisfactory");
  assert.equal(threshold.resultBandLabel("satisfactory", 50), "50–69%");
  assert.equal(threshold.resultBandLabel("needHelp", 50), "<50%");
  assert.equal(threshold.resultBandLabel("excellent", 60), "85–100%");
});

test("the colour of one result: red below the threshold, green from 80, amber for the rest of the passed", () => {
  assert.deepEqual([55, 60, 79, 80].map((p) => threshold.resultTone(p, 60)), ["failed", "passed", "passed", "excellent"]);
  assert.equal(threshold.resultTone(65, 70), "failed");          // 65 % at threshold 70 was amber before
  assert.equal(threshold.resultTone(85, 90), "failed");          // 85 % is «excellent» by the 80 mark, but not passed at 90
  assert.equal(threshold.resultTone(90, 90), "excellent");
  assert.equal(threshold.resultTone(55, 50), "passed");          // 55 % at threshold 50 is passed (it was red on the works page: < 60)
});

test("no screen keeps its own literal «passed» line any more", () => {
  assert.doesNotMatch(read("src/app/teacher/exams/[id]/sessions/page.tsx"), /pct >= 60/);
  assert.doesNotMatch(read("src/app/teacher/exams/[id]/page.tsx"), /scorePercent >= 50/);
  assert.doesNotMatch(read("src/app/teacher/exams/[id]/report/page.tsx"), /pct >= 50/);
});

test("a library page: a normal page, the last page, and the plain array of an older server", () => {
  assert.deepEqual(paging.readLibraryPage({ items: [{ exam_id: "a" }], total: 75, has_more: true }), { items: [{ exam_id: "a" }], total: 75, hasMore: true });
  assert.equal(paging.readLibraryPage({ items: [], total: 0, has_more: false }).hasMore, false);
  // GET /exams without `page` on a server that does not know it: everything, nothing more to ask for
  assert.deepEqual(paging.readLibraryPage([{ exam_id: "a" }, { exam_id: "b" }]), { items: [{ exam_id: "a" }, { exam_id: "b" }], total: 2, hasMore: false });
});

const pageOf = (from, count, hasMore, total = 120) => ({ items: Array.from({ length: count }, (_, i) => ({ exam_id: `e${from + i}` })), total, has_more: hasMore });

test("loading pages: stops at the last page, keeps the opened pages on a refresh, understands an old server's array", async () => {
  const asked = [];
  const pages = { 1: pageOf(0, 50, true), 2: pageOf(50, 50, true), 3: pageOf(100, 20, false) };
  const fetchPage = async (n) => { asked.push(n); return pages[n]; };
  const refreshed = await paging.loadLibraryPages(fetchPage, 2);
  assert.deepEqual(asked, [1, 2]);
  assert.equal(refreshed.items.length, 100);
  assert.equal(refreshed.hasMore, true);
  assert.equal(refreshed.pagesLoaded, 2);
  const all = await paging.loadLibraryPages(fetchPage, 9);          // asks for more pages than exist: stops after page 3
  assert.equal(all.items.length, 120);
  assert.equal(all.hasMore, false);
  assert.equal(all.pagesLoaded, 3);
  // an older server answers the array to every page request: the first answer is everything
  asked.length = 0;
  const old = await paging.loadLibraryPages(async (n) => { asked.push(n); return [{ exam_id: "x" }, { exam_id: "y" }]; }, 3);
  assert.deepEqual(asked, [1]);
  assert.deepEqual(old.items.map((e) => e.exam_id), ["x", "y"]);
  assert.equal(old.hasMore, false);
});

test("«Показать ещё»: appends the next page; a failure leaves the loaded exams as they were and can be repeated", async () => {
  const loaded = pageOf(0, 50, true).items;
  const next = await paging.loadNextLibraryPage(async (n) => { assert.equal(n, 2); return pageOf(50, 25, false, 75); }, loaded, 1);
  assert.equal(next.items.length, 75);
  assert.equal(next.hasMore, false);
  assert.equal(next.pagesLoaded, 2);
  assert.equal(loaded.length, 50, "the loaded list is not mutated");
  let attempt = 0;
  const flaky = async () => { attempt += 1; if (attempt === 1) throw new Error("503"); return pageOf(50, 25, false, 75); };
  await assert.rejects(paging.loadNextLibraryPage(flaky, loaded, 1), /503/);
  const retried = await paging.loadNextLibraryPage(flaky, loaded, 1);   // the same page again, not the one after
  assert.equal(retried.pagesLoaded, 2);
  assert.equal(retried.items.length, 75);
  // a page that repeats exams the teacher already has adds nothing twice
  const overlap = await paging.loadNextLibraryPage(async () => pageOf(40, 20, false, 60), loaded, 1);
  assert.equal(overlap.items.length, 60);
});
