// WE-E (from E-D, EX-43 / РАСХ-11): «which lessons an exam may be bound to» is ONE rule on two sides - `isLessonBindable` here and `_lesson_is_bindable` in exam-service.
// tests/fixtures/lesson_bindable_golden.json is a COPY of exam-service/tests/fixtures/lesson_bindable_golden.json (branch we-d); both sides run the same table: 0 differences.
// An end time of only spaces is NO end time (the server judges such a lesson not over; the dialog read it as 00:00 and hid the lesson).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const Module = require("node:module");

const root = path.join(__dirname, "..");
const load = (mutate) => {
  const filename = path.join(root, "src/lib/exam-lessons.ts");
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const realLoad = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (request === "./lesson-actions") request = path.join(root, "src/lib/lesson-actions.ts");
    return realLoad.call(this, request, parent, ...rest);
  };
  require.extensions[".ts"] ||= (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
  try {
    const source = mutate(fs.readFileSync(filename, "utf8"));
    mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  } finally { Module._load = realLoad; }
  return mod.exports;
};

const GOLDEN = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/lesson_bindable_golden.json"), "utf8"));
const TODAY = "2026-11-04";
const DAYS = { today: TODAY, yesterday: "2026-11-03", tomorrow: "2026-11-05" };

/** the table's verdict of one case through `isLessonBindable` */
const verdict = (lib, c) => {
  const [hours, minutes] = c.now.split(":").map(Number);
  const lesson = { id: "L", occurrenceDate: DAYS[c.day], endTime: c.end_time };
  return lib.isLessonBindable(lesson, { businessDate: TODAY, nowMinutes: hours * 60 + minutes, statuses: c.status ? { [`${DAYS[c.day]}_L`]: c.status } : {} });
};

test("[BG1] the front gives the verdict of the table in every case (0 differences with the server)", () => {
  const lib = load((source) => source);
  const wrong = GOLDEN.cases.filter((c) => verdict(lib, c) !== c.bindable).map((c) => c.id);
  assert.deepEqual(wrong, []);
  assert.ok(GOLDEN.cases.length >= 12, "the table is the whole table");
});

test("[BG2] an end time of only spaces / tab / newline is no end time; a real one is judged as before", () => {
  const lib = load((source) => source);
  const lesson = (endTime) => ({ id: "L", occurrenceDate: TODAY, endTime });
  const ctx = { businessDate: TODAY, nowMinutes: 15 * 60, statuses: {} };
  for (const blank of ["", " ", "   ", "\t", "\n ", null, undefined]) assert.equal(lib.isLessonBindable(lesson(blank), ctx), true, JSON.stringify(blank));
  assert.equal(lib.isLessonBindable(lesson("11:30"), ctx), false);
  assert.equal(lib.isLessonBindable(lesson(" 16:30 "), ctx), true);
});

test("[BG3] MUTATION: without the trim the table is NOT satisfied (the cases with spaces fail)", () => {
  const lib = load((source) => {
    assert.match(source, /lesson\.endTime\?\.trim\(\)/);
    return source.replace("lesson.endTime?.trim()", "lesson.endTime");
  });
  const wrong = GOLDEN.cases.filter((c) => verdict(lib, c) !== c.bindable).map((c) => c.id);
  assert.deepEqual(wrong.sort(), ["no-end-one-space", "no-end-spaces"]);
});
