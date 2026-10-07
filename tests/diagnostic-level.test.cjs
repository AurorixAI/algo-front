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
const L = require(path.join(__dirname, "../src/lib/diagnostic-level.ts"));

test("category and status dictionaries use the agreed Russian labels", () => {
  assert.deepEqual(
    Object.entries(L.LEVEL_CATEGORY_META).map(([k, v]) => [k, v.label]),
    [["below_grade", "Ниже уровня класса"], ["at_grade", "На уровне класса"], ["above_grade", "Выше уровня класса"]],
  );
  assert.deepEqual(
    Object.entries(L.LEVEL_STATUS_META).map(([k, v]) => [k, v.label]),
    [["critical", "Критическое отставание"], ["below", "Ниже уровня класса"], ["partial_gap", "Частичные пробелы"],
     ["on_level", "Соответствует уровню"], ["above", "Выше уровня класса"]],
  );
  for (const m of [...Object.values(L.LEVEL_CATEGORY_META), ...Object.values(L.LEVEL_STATUS_META)]) {
    assert.ok(L.LEVEL_TONES[m.tone], "every entry has a tone");
  }
  assert.equal(L.PROVISIONAL_LABEL, "предварительно");
});

test("legacy status codes map to current ones; unknown codes stay unknown", () => {
  assert.equal(L.normalizeStatus("below_level"), "below");
  assert.equal(L.normalizeStatus("above_level"), "above");
  assert.equal(L.normalizeStatus("on_level"), "on_level");
  assert.equal(L.normalizeStatus("garbage"), null);
  assert.equal(L.levelCategoryLabel("nope"), null);
});

test("status implies the category with the same cut-offs", () => {
  const expected = { critical: "below_grade", below: "below_grade", partial_gap: "at_grade", on_level: "at_grade", above: "above_grade" };
  for (const [s, c] of Object.entries(expected)) assert.equal(L.categoryOfStatus(s), c);
});

test("formatSolved", () => {
  assert.equal(L.formatSolved(10, 30), "решено 10 из 30");
  assert.equal(L.formatSolved(0, 12), "решено 0 из 12");
  assert.equal(L.formatSolved(null, 30), null);
  assert.equal(L.formatSolved(3, 0), null);
});

test("resolveReportLevel prefers report.level, falls back to legacy fields", () => {
  const withLevel = L.resolveReportLevel({
    level: { category: "at_grade", status: "on_level", class_equivalent: "конец 8 класса", provisional: true, solved: 6, total: 30 },
    overall: { status: "critical", class_equivalent: "начало 7 класса" },
    report_meta: { total_questions: 99, questions_correct: 1 },
  });
  assert.deepEqual(withLevel, { category: "at_grade", status: "on_level", classEquivalent: "конец 8 класса", provisional: true, solved: 6, total: 30 });
  const legacy = L.resolveReportLevel({
    overall: { status: "below_level", class_equivalent: "начало 7 класса" },
    report_meta: { total_questions: 25, questions_correct: 5 },
  });
  assert.deepEqual(legacy, { category: "below_grade", status: "below", classEquivalent: "начало 7 класса", provisional: false, solved: 5, total: 25 });
});

test("storedLevelDisplay: status wins, category fallback, no invented default", () => {
  assert.equal(L.storedLevelDisplay({ recommended_level: "at_grade", level_status: "partial_gap" }).label, "Частичные пробелы");
  assert.equal(L.storedLevelDisplay({ recommended_level: "above_grade" }).label, "Выше уровня класса");
  assert.equal(L.storedLevelDisplay({ recommended_level: "above_grade", level_provisional: true }).provisional, true);
  assert.equal(L.storedLevelDisplay({ recommended_level: null }), null);
  assert.equal(L.storedLevelDisplay(null), null);
});

test("isAtRisk follows the level policy (theta < -0.5), not the old 0.5 filter", () => {
  assert.equal(L.isAtRisk({ theta: -0.5001 }), true);
  assert.equal(L.isAtRisk({ theta: -0.5 }), false);
  assert.equal(L.isAtRisk({ theta: 0.3 }), false); // old filter flagged this
  assert.equal(L.isAtRisk({ status: "critical" }), true);
  assert.equal(L.isAtRisk({ status: "below", theta: 0.9 }), true);
  assert.equal(L.isAtRisk({ status: "partial_gap", theta: -3 }), false);
  assert.equal(L.isAtRisk({ category: "below_grade" }), true);
  assert.equal(L.isAtRisk({ category: "at_grade", theta: -3 }), false);
  assert.equal(L.isAtRisk({}), false);
  assert.equal(L.categoryFromTheta(1.0), "above_grade");
  assert.equal(L.categoryFromTheta(-0.5), "at_grade");
});
