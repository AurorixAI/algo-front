// LOGIC-A F14 (deferred screen): «Тип занятий → Изменить…» on the group card of the owner / administrator.
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
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/logicA", `${name}.json`), "utf8"));
const T = require(path.join(root, "src/lib/group-lesson-type.ts"));

test("A17 / A18: the answers of the server are read as they are", () => {
  const types = T.normalizeLessonTypes(fixture("A17_lesson_types"));
  assert.equal(types.current, "pair");
  assert.deepEqual(types.history.map((row) => [row.valid_from, row.lesson_type]), [["2020-01-01", "group"], ["2026-10-15", "pair"]]);
  const changed = T.normalizeLessonTypeChanged(fixture("A18_lesson_type_put_impact"));
  assert.equal(changed.current, "pair");
  assert.equal(changed.impact.stale_payroll_sheets, 1);
  assert.deepEqual(T.lessonTypeStaleText(changed.impact), { text: "Ведомости, которые изменятся:", items: ["октябрь 2026 — Каримова"] });
  // an administrator gets no list: only the count
  assert.deepEqual(T.lessonTypeStaleText({ stale_payroll_sheets: 2, stale_sheets: [] }), { text: "Ведомостей, которые изменятся: 2.", items: [] });
  assert.equal(T.lessonTypeStaleText({ stale_payroll_sheets: 0, stale_sheets: [] }), null);
  assert.equal(T.lessonTypeStaleText(null), null);
});

test("the date window is the start of the last month .. today (also over the new year)", () => {
  assert.deepEqual(T.lessonTypeDateRange("2026-10-21"), { min: "2026-09-01", max: "2026-10-21" });
  assert.deepEqual(T.lessonTypeDateRange("2026-01-05"), { min: "2025-12-01", max: "2026-01-05" });
  assert.equal(T.validateLessonTypeDate("2026-10-21", "2026-10-21"), null);
  assert.equal(T.validateLessonTypeDate("2026-09-01", "2026-10-21"), null);
  assert.match(T.validateLessonTypeDate("2026-08-31", "2026-10-21"), /с 01\.09\.2026 по 21\.10\.2026/);
  assert.match(T.validateLessonTypeDate("2026-10-22", "2026-10-21"), /по 21\.10\.2026/);
  assert.match(T.validateLessonTypeDate("", "2026-10-21"), /Укажите дату/);
});

test("the request: type + «с» day; the type in force that day makes no request", () => {
  const history = T.normalizeLessonTypes(fixture("A17_lesson_types")).history;
  const ok = T.checkLessonTypeForm({ lessonType: "individual", validFrom: "2026-10-21" }, "2026-10-21");
  assert.deepEqual(ok.request, { lesson_type: "individual", valid_from: "2026-10-21" });
  assert.equal(T.checkLessonTypeForm({ lessonType: "x", validFrom: "2026-10-21" }, "2026-10-21").request, null);
  assert.equal(T.lessonTypeOn(history, "2026-10-14", "pair"), "group");
  assert.equal(T.lessonTypeOn(history, "2026-10-15", "pair"), "pair");
  assert.equal(T.isNoopLessonType(history, "pair", { lesson_type: "pair", valid_from: "2026-10-21" }), true);
  // going back to «group» from 15.10 is a change; «pair» from 14.10 is a change too (a later row exists)
  assert.equal(T.isNoopLessonType(history, "pair", { lesson_type: "group", valid_from: "2026-10-21" }), false);
  assert.equal(T.isNoopLessonType(history, "pair", { lesson_type: "pair", valid_from: "2026-10-14" }), false);
  assert.equal(T.isNoopLessonType(history, "pair", null), false);
});

test("words: the line, the history and the impact", () => {
  assert.equal(T.lessonTypeLine("group"), "Тип занятий: Группа");
  const history = T.normalizeLessonTypes(fixture("A17_lesson_types")).history;
  assert.deepEqual(history.map(T.lessonTypeHistoryLine), ["С самого начала — Группа", "С 15.10.2026 — Парный · Арслан"]);
  assert.match(T.LESSON_TYPE_IMPACT_TEXT, /«Есть изменения»/);
  assert.equal(T.LESSON_TYPE_CHANGE_LABEL, "Изменить…");
  assert.match(T.lessonTypeFutureNote("2026-10-01", "2026-10-21"), /с 01\.10\.2026/);
  assert.equal(T.lessonTypeFutureNote("2026-10-21", "2026-10-21"), null);
});

test("the API: GET lesson-types and PUT lesson-type (dry_run in the query)", () => {
  const api = read("src/lib/api.ts");
  assert.match(api, /\/lesson-types`\)\.then\(normalizeLessonTypes\)/);
  assert.match(api, /\/lesson-type\$\{options\?\.dryRun \? "\?dry_run=true" : ""\}`, \{ method: "PUT", body \}/);
});

test("the dialog is on the group card of the owner and of the administrator", () => {
  for (const role of ["owner", "admin"]) {
    const page = read(`src/app/${role}/groups/[id]/page.tsx`);
    assert.match(page, /<GroupLessonTypeDialog/);
    assert.match(page, /data-testid="group-lesson-type-change"/);
    assert.match(page, /lessonTypeLine\(group\.lesson_type\)/);
    assert.match(page, /group\.status !== "archived"/);
  }
  assert.doesNotMatch(read("src/app/teacher/groups/[id]/page.tsx"), /GroupLessonTypeDialog/);
  const dialog = read("src/components/groups/group-lesson-type-dialog.tsx");
  assert.match(dialog, /dryRun: true/);
  assert.match(dialog, /LESSON_TYPE_FROM_LABEL/);
  assert.match(dialog, /data-testid="lesson-type-history"/);
});
