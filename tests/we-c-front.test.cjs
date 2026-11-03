// Wave E / package E-C (front): «одна страница группы на GroupDetailView» для владельца, администратора и преподавателя (WAVE_E_SPEC.md, решение 11).
// Шаги (каждый - отдельный коммит; тест шага падает на старом поведении):
//   1. чистая часть: рабочее пространство «teacher», вкладки по роли, ОДНО правило «кто правит журнал», запрос вкладки;
//   2. общая функция назначения экзамена на занятие + общее окно «Экзамен назначен»;
//   3. страница преподавателя = `<GroupDetailView workspace="teacher" />`, вкладка «Экзамены» - `GroupExamsTab`;
//   4. «Выбрать» из библиотеки группы = «Назначить» в «Экзаменах»;
//   5. вкладка «Экзамены» у владельца и администратора (только просмотр).
// Матрица «роль до/после» - внизу файла: каждая роль видит/может то же, что раньше, кроме намеренно выровненного.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const Module = require("node:module");

const root = path.join(__dirname, "..");
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
require.extensions[".ts"] = (mod, filename) => mod._compile(transpile(fs.readFileSync(filename, "utf8")), filename);
require.extensions[".tsx"] = (mod, filename) => mod._compile(transpile(fs.readFileSync(filename, "utf8")), filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
  return resolveFilename.call(this, request, ...rest);
};
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const lib = (name) => require(path.join(root, "src/lib", name));

/** A module loaded from a MUTATED copy of its source (sibling imports still resolve from the real folder). */
function loadMutated(file, from, to) {
  const source = read(file);
  assert.ok(source.includes(from), `mutation target not found in ${file}: ${from}`);
  const filename = path.join(root, file);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(transpile(source.replace(from, to)), filename);
  return mod.exports;
}

const W = lib("group-workspace.ts");
const ROLES = ["owner", "admin", "teacher"];

// ---- step 1: the pure part -------------------------------------------------------------------------------------------------

test("E-C/1: the teacher is a workspace of the group page with his own paths and no money", () => {
  const teacher = W.groupWorkspacePaths("teacher");
  assert.deepEqual([teacher.groups, teacher.students, teacher.payments, teacher.viewerRole], ["/teacher/groups", "/teacher/students", null, "teacher"]);
  assert.deepEqual([W.groupWorkspacePaths("owner").groups, W.groupWorkspacePaths("admin").payments], ["/owner/groups", "/admin/payments"]);
});

test("E-C/1: tabs by role - ONE order; the teacher has no schedule and no money; owner and admin keep theirs and gain «Экзамены»", () => {
  const tabs = (workspace, paymentsAccess = "hidden") => W.groupPageTabs({ workspace, paymentsAccess });
  assert.deepEqual(tabs("teacher"), ["students", "exams", "attendance"], "the teacher's three tabs, as before");
  assert.deepEqual(tabs("teacher", "show"), ["students", "exams", "attendance"], "money never reaches a teacher");
  assert.deepEqual(tabs("admin"), ["students", "schedule", "exams", "attendance"]);
  assert.deepEqual(tabs("owner", "show"), ["students", "schedule", "exams", "attendance", "payments"]);
  assert.deepEqual(tabs("owner", "pending"), ["students", "schedule", "exams", "attendance"], "the tab appears when the right is known");
});

test("E-C/1: ?tab= resolves per role; a tab the role has not opens «Ученики»; the payments deep link waits while the right is unknown", () => {
  const to = (requested, workspace, paymentsAccess = "hidden") => W.resolveGroupPageTab(requested, { workspace, paymentsAccess });
  assert.equal(to("exams", "teacher"), "exams");
  assert.equal(to("exams", "owner"), "exams");
  assert.equal(to("schedule", "teacher"), "students");
  assert.equal(to("schedule", "admin"), "schedule");
  assert.equal(to("payments", "teacher", "show"), "students");
  assert.equal(to("payments", "owner", "show"), "payments");
  assert.equal(to("payments", "owner", "pending"), "payments");
  assert.equal(to("payments", "admin", "hidden"), "students");
  assert.equal(to("bogus", "owner"), "students");
  assert.equal(to(null, "teacher"), "students");
});

test("E-C/1: the click on a tab drops the one-shot journal link and the payments filter, keeps the exam filter", () => {
  assert.equal(W.groupTabQuery("tab=attendance&month=2026-09&lesson=s2&date=2026-09-30", "exams"), "?tab=exams");
  assert.equal(W.groupTabQuery("tab=exams&exam_status=draft&exam_q=abc", "attendance"), "?tab=attendance&exam_status=draft&exam_q=abc");
  assert.equal(W.groupTabQuery("tab=payments&filter=debt", "students"), "?tab=students");
  assert.equal(W.groupTabQuery("tab=students", "payments"), "?tab=payments");
  assert.equal(W.groupTabQuery(null, "exams"), "?tab=exams");
});

test("E-C/1: ONE rule of the journal: the manager edits any live group; a teacher only his own or a substituted one; nobody an archived one", () => {
  const live = { name: "9-А", status: "active", teacher_id: "t1" };
  const access = (workspace, group, userId) => W.groupJournalAccess({ workspace, group, userId });
  // owner / admin: as before (`canEdit = not archived`, adminMode, the name for the review of excuses)
  for (const workspace of ["owner", "admin"]) {
    assert.deepEqual(access(workspace, live, "u9"), { canEdit: true, adminMode: true, viewerId: null, groupName: "9-А" });
    assert.equal(access(workspace, { ...live, status: "archived" }, "u9").canEdit, false);
  }
  // teacher: his group, a substitution; not another teacher's group; not an archived one
  assert.deepEqual(access("teacher", live, "t1"), { canEdit: true, adminMode: false, viewerId: "t1", groupName: null });
  assert.equal(access("teacher", live, "t2").canEdit, false);
  assert.equal(access("teacher", { ...live, substitution: true }, "t2").canEdit, true);
  assert.equal(access("teacher", { ...live, status: "archived" }, "t1").canEdit, false);
  assert.equal(access("teacher", { ...live, status: "archived", substitution: true }, "t2").canEdit, false);
  assert.equal(access("teacher", { ...live, teacher_id: null }, undefined).canEdit, false, "no user, no teacher: not mine");
  assert.equal(access("teacher", live, null).canEdit, false);
});

test("E-C/1: the header «⋯» is for who manages the group; archived or a teacher - none", () => {
  assert.deepEqual(W.groupHeaderActions({ archived: false, priceAvailable: true }), ["edit", "price", "archive"], "as before");
  assert.deepEqual(W.groupHeaderActions({ archived: false, priceAvailable: false }), ["edit", "archive"], "as before");
  assert.deepEqual(W.groupHeaderActions({ archived: false, priceAvailable: false, canManage: false }), []);
  assert.deepEqual(W.groupHeaderActions({ archived: true, priceAvailable: true }), []);
});

test("E-C/1: mutation - the old teacher condition (admin / owner branch) is seen by the same scenarios", () => {
  const mutated = loadMutated("src/lib/group-workspace.ts",
    "return { canEdit: live && (mine || Boolean(input.group.substitution)), adminMode: false",
    "return { canEdit: live, adminMode: false");
  assert.equal(mutated.groupJournalAccess({ workspace: "teacher", group: { name: "x", status: "active", teacher_id: "t1" }, userId: "t2" }).canEdit, true, "the mutant lets a stranger edit");
  assert.equal(W.groupJournalAccess({ workspace: "teacher", group: { name: "x", status: "active", teacher_id: "t1" }, userId: "t2" }).canEdit, false);
});
