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

test("E-C/1: ONE rule of the journal: the manager edits any live group; a teacher only the group he leads; nobody an archived one", () => {
  const live = { name: "9-А", status: "active", teacher_id: "t1" };
  const access = (workspace, group, userId) => W.groupJournalAccess({ workspace, group, userId });
  // owner / admin: as before (`canEdit = not archived`, adminMode, the name for the review of excuses)
  for (const workspace of ["owner", "admin"]) {
    assert.deepEqual(access(workspace, live, "u9"), { canEdit: true, adminMode: true, viewerId: null, groupName: "9-А" });
    assert.equal(access(workspace, { ...live, status: "archived" }, "u9").canEdit, false);
  }
  // teacher: his group; not another teacher's group (a substitute has no page of the group at all: 403); not an archived one
  assert.deepEqual(access("teacher", live, "t1"), { canEdit: true, adminMode: false, viewerId: "t1", groupName: null });
  assert.equal(access("teacher", live, "t2").canEdit, false);
  assert.equal(access("teacher", { ...live, status: "archived" }, "t1").canEdit, false);
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
    "return { canEdit: live && mine, adminMode: false",
    "return { canEdit: live, adminMode: false");
  assert.equal(mutated.groupJournalAccess({ workspace: "teacher", group: { name: "x", status: "active", teacher_id: "t1" }, userId: "t2" }).canEdit, true, "the mutant lets a stranger edit");
  assert.equal(W.groupJournalAccess({ workspace: "teacher", group: { name: "x", status: "active", teacher_id: "t1" }, userId: "t2" }).canEdit, false);
});

// ---- step 2: one way to bind an exam to a lesson ---------------------------------------------------------------------------

const LESSON = { group: { id: "g1" }, occurrence: { id: "s9", occurrenceDate: "2026-11-05" } };
function fakeExamsApi() {
  const calls = [];
  return {
    calls,
    assign: async (...args) => { calls.push(["assign", ...args]); return { exam_id: args[0], status: "lobby", group_id: "g1", access_code: "ABC123" }; },
    preparePrintPackage: async (...args) => { calls.push(["print", ...args]); return { exam_id: args[0], status: "print_ready" }; },
  };
}

test("E-C/2: an online exam is bound to the chosen lesson and its lobby opens (publish + lesson), a paper one gets its print package", async () => {
  const A = lib("exam-assign.ts");
  const api = fakeExamsApi();
  const online = await A.assignExamToLesson(api, { exam_id: "e1", delivery_mode: "online" }, LESSON);
  assert.deepEqual(api.calls[0], ["assign", "e1", { group_id: "g1", publish: true, lesson_id: "s9", lesson_date: "2026-11-05" }]);
  assert.equal(online.kind, "lobby");
  assert.equal(online.result.access_code, "ABC123");
  const printed = await A.assignExamToLesson(api, { exam_id: "e2", delivery_mode: "print" }, LESSON);
  assert.deepEqual(api.calls[1], ["print", "e2", { group_id: "g1", lesson_id: "s9", lesson_date: "2026-11-05" }]);
  assert.equal(printed.kind, "print");
  assert.equal(api.calls.length, 2, "a paper exam never goes through the group-only assign");
  // no delivery mode = online (an old row)
  await A.assignExamToLesson(api, { exam_id: "e3" }, LESSON);
  assert.equal(api.calls[2][0], "assign");
});

test("E-C/2: a refusal of the server reaches the dialog (the function does not swallow it, no second call)", async () => {
  const A = lib("exam-assign.ts");
  const api = fakeExamsApi();
  api.assign = async () => { throw new Error("Слот занят"); };
  await assert.rejects(() => A.assignExamToLesson(api, { exam_id: "e1" }, LESSON), /Слот занят/);
});

test("E-C/2: the library page and the success dialog are shared files; the page has no private copy of the binding", () => {
  const page = read("src/app/teacher/exams/page.tsx");
  assert.match(page, /assignExamToLesson\(examsApi, assignTarget, selection\)/);
  assert.doesNotMatch(page, /examsApi\.assign\(|examsApi\.preparePrintPackage\(/);
  assert.doesNotMatch(page, /function SuccessAssignModal/);
  assert.match(page, /import \{ SuccessAssignModal \} from "@\/components\/exam\/success-assign-modal"/);
  assert.match(read("src/components/exam/success-assign-modal.tsx"), /export function SuccessAssignModal/);
});

test("E-C/2: mutation - the lobby without the lesson (the old group-page draft) is seen", async () => {
  const mutated = loadMutated("src/lib/exam-assign.ts", "publish: true, lesson_id", "publish: false, lesson_id");
  const api = fakeExamsApi();
  await mutated.assignExamToLesson(api, { exam_id: "e1" }, LESSON);
  assert.equal(api.calls[0][2].publish, false, "the mutant opens no lobby");
  const real = fakeExamsApi();
  await lib("exam-assign.ts").assignExamToLesson(real, { exam_id: "e1" }, LESSON);
  assert.equal(real.calls[0][2].publish, true);
});

// ---- step 3: the page of the teacher IS GroupDetailView; the tab «Экзамены» is GroupExamsTab -------------------------------

const VIEW = "src/components/groups/group-detail-view.tsx";
const EXAMS_TAB = "src/components/groups/group-exams-tab.tsx";
const TEACHER_PAGE = "src/app/teacher/groups/[id]/page.tsx";

test("E-C/3: the three workspaces render ONE page (thin wrappers of the same component), the teacher's 900 lines are gone", () => {
  for (const role of ROLES) {
    const page = read(`src/app/${role}/groups/[id]/page.tsx`);
    assert.match(page, new RegExp(`<GroupDetailView workspace="${role}" />`), role);
    assert.ok(page.split("\n").length <= 12, `${role}: a thin wrapper`);
  }
  assert.doesNotMatch(read(TEACHER_PAGE), /GroupAttendanceJournal|GroupStudentTable|examsApi|orgApi|useState/);
});

test("E-C/3: the dead branch `org_role admin/owner` of the teacher's page is gone, and nothing of the group page decides the journal by the role of the account", () => {
  for (const file of [VIEW, EXAMS_TAB, TEACHER_PAGE, "src/lib/group-workspace.ts"]) {
    assert.doesNotMatch(read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), /org_role|role === "owner"|role === "admin"/, file);
  }
});

test("E-C/3: the journal gets ONE set of props from groupJournalAccess for every role", () => {
  const view = read(VIEW);
  assert.match(view, /const journal = groupJournalAccess\(\{ workspace, group, userId: user\?\.id \}\);/);
  assert.match(view, /canEdit=\{journal\.canEdit\}\s+adminMode=\{journal\.adminMode\}\s+viewerId=\{journal\.viewerId\}\s+groupName=\{journal\.groupName\}/);
  assert.doesNotMatch(view, /canEdit=\{group\.status/);
  // mutation: the old inline condition is seen
  assert.doesNotMatch(view.replace("canEdit={journal.canEdit}", 'canEdit={group.status !== "archived"}'), /canEdit=\{journal\.canEdit\}/);
});

test("E-C/3: what only the manager has (menu, restore, add student, removal, dialogs, money) is not rendered for a teacher", () => {
  const view = read(VIEW);
  assert.match(view, /const canManage = !isTeacher;/);
  assert.match(view, /groupHeaderActions\(\{[^}]*canManage \}\)/);
  assert.match(view, /canManage && <button/); // «Вернуть из архива»
  assert.match(view, /\{canManage && group\.status === "active" && \(/); // «Добавить учеников»
  assert.match(view, /canRemove=\{canManage && group\.status === "active"\}/);
  assert.match(view, /\{canManage && \(\s*<>\s*<AddStudentDrawer/); // the dialogs
  assert.match(view, /onRestore=\{\(\) => setRestoreOpen\(true\)\} \/>\s*:\s*<GroupArchivedBanner archivedAt=\{group\.archivedAt\} \/>/); // a notice for a teacher
  assert.match(view, /if \(canManage\) void refreshMoney\(\)/); // a teacher never reads the money summary
  assert.match(view, /groupPaymentsAccess\(\{ moneyAvailable, moneyLoaded, isTeacher,/);
  assert.match(view, /canManage \? orgApi\.listMembers\(\)/); // the list of staff is for the edit form
  // mutation: if the gate on «Добавить учеников» is lost, the guard sees it
  assert.doesNotMatch(view.replace("{canManage && group.status === \"active\" && (", "{group.status === \"active\" && ("), /\{canManage && group\.status === "active" && \(/);
});

test("E-C/3: the teacher does not call the endpoints his page never showed (stats, schedule); a failure of the exam service does not take the group page down", () => {
  assert.doesNotMatch(read(VIEW) + read(EXAMS_TAB), /getGroupStats|getSchedule|GroupStatsPanel/);
  const view = read(VIEW);
  assert.doesNotMatch(view, /examsApi/, "the exams are loaded by the tab, not by the page");
  assert.match(read(EXAMS_TAB), /examsApi\.list\(\{ groupId, includeArchived: true \}\)/);
  assert.match(read(EXAMS_TAB), /Не удалось загрузить экзамены группы/);
});

test("E-C/3: a failed load shows the error with «Повторить» (no silent redirect to the list) for every role; «Нет доступа» offers only the way back", () => {
  const view = read(VIEW);
  assert.doesNotMatch(view, /router\.push\(paths\.groups\)/);
  assert.match(view, /onRetry=\{\/Нет доступа\/i\.test\(loadError \|\| ""\) \? undefined : \(\) => void load\(\)\}/);
  assert.match(view, /isTeacher \? "К моим группам" : "К группам"/);
  assert.match(view, /Данные группы могут быть неактуальны/);
});

test("E-C/3: the tabs strip is made from the role's list", () => {
  const view = read(VIEW);
  assert.match(view, /groupPageTabs\(\{ workspace, paymentsAccess \}\)\.map\(\(key\) => \{/);
  assert.doesNotMatch(view, /substitution|SUBSTITUTE_BADGE/, "a substitute never reaches the page of the group (403): no dead branch of him here");
  assert.match(view, /\{tab === "exams" && \(\s*<motion\.div[^>]*>\s*<GroupExamsTab group=\{group\} workspace=\{workspace\} \/>/);
  assert.match(view, /\{tab === "schedule" && paths\.viewerRole !== "teacher" && \(/);
  // five short labels fit a 390 px phone: the padding of a tab is 12 px each side
  assert.match(view, /rounded-lg px-1\.5 py-2/);
});

test("E-C/3: the exam links lead where the teacher's page led (the hub of the exam comes back to the same tab and filter)", () => {
  const links = lib("group-exams.ts").groupExamLinks({ workspace: "teacher", groupId: "g1", groupName: "9-А Профиль" });
  assert.equal(links.newExam, "/teacher/exams/new?group_id=g1&group_name=9-%D0%90%20%D0%9F%D1%80%D0%BE%D1%84%D0%B8%D0%BB%D1%8C");
  assert.equal(links.exam("e1", "/teacher/groups/g1?tab=exams&exam_status=draft"),
    "/teacher/exams/e1?from_group=g1&from_name=9-%D0%90%20%D0%9F%D1%80%D0%BE%D1%84%D0%B8%D0%BB%D1%8C&return_to=%2Fteacher%2Fgroups%2Fg1%3Ftab%3Dexams%26exam_status%3Ddraft");
  assert.match(read(EXAMS_TAB), /return `\$\{paths\.groups\}\/\$\{groupId\}\?\$\{params\.toString\(\)\}`;/);
  assert.doesNotMatch(read(EXAMS_TAB), /["'`]\/teacher\//, "the tab has no path of one workspace typed in");
});

// ---- step 4: «Выбрать» from the group = «Назначить» in «Экзамены» ------------------------------------------------------------

const LIBRARY_PAGE = "src/app/teacher/exams/page.tsx";

test("E-C/4: both entrances pick an exact lesson in the same dialog and bind it with the same function; the same dialog confirms", () => {
  for (const file of [EXAMS_TAB, LIBRARY_PAGE]) {
    const source = read(file);
    assert.match(source, /assignExamToLesson\(examsApi, assignTarget, selection\)/, file);
    assert.match(source, /<ScheduleExamModal[^>]*\n?[^>]*examTitle=\{assignTarget\.title\}/s, file);
    assert.match(source, /deliveryMode=\{assignTarget\.delivery_mode\}/, file);
    assert.match(source, /<SuccessAssignModal/, file);
  }
  const tab = read(EXAMS_TAB);
  assert.match(tab, /groups=\{\[group\]\}\s+initialGroupId=\{groupId\}/, "the group is chosen already");
  assert.match(tab, /onClick=\{\(\) => \{\s*setModalState\("none"\);\s*setAssignTarget\(exam\);\s*\}\}/, "«Выбрать» asks for the lesson");
});

test("E-C/4: no draft without a lesson any more - the tab never calls assign / clone itself and never sends publish:false", () => {
  const tab = read(EXAMS_TAB);
  assert.doesNotMatch(tab, /examsApi\.(assign|clone|preparePrintPackage)\(/);
  assert.doesNotMatch(tab, /publish:\s*false|group_name: group\.name/);
  assert.doesNotMatch(tab, /Экзамен успешно назначен|modal-success|setAssignedInfo/);
});

test("E-C/4: a paper exam goes to its hub after the print package is prepared, like in the library", () => {
  const tab = read(EXAMS_TAB);
  assert.match(tab, /if \(outcome\.kind === "print"\) \{\s*router\.push\(links\.exam\(assignTarget\.exam_id, groupExamReturnHref\) \?\? groupExamReturnHref\);/);
  assert.match(read(LIBRARY_PAGE), /if \(outcome\.kind === "print"\) \{\s*setAssignTarget\(null\);\s*router\.push\(`\/teacher\/exams\/\$\{assignTarget\.exam_id\}\?return_to=/);
});

test("E-C/4: the result is the same - an online exam gets its lobby on the chosen lesson whichever entrance was used", async () => {
  const A = lib("exam-assign.ts");
  const fromLibrary = fakeExamsApi();
  const fromGroup = fakeExamsApi();
  const selection = { group: { id: "g1" }, occurrence: { id: "s9", occurrenceDate: "2026-11-05" } };
  await A.assignExamToLesson(fromLibrary, { exam_id: "e1", delivery_mode: "online" }, selection);
  await A.assignExamToLesson(fromGroup, { exam_id: "e1", delivery_mode: "online" }, selection);
  assert.deepEqual(fromGroup.calls, fromLibrary.calls);
  assert.equal(fromGroup.calls[0][2].publish, true);
  assert.equal(fromGroup.calls[0][2].lesson_id, "s9");
});

test("E-C/4: mutation - the old group entrance (a draft without a lesson) is seen by the guards", () => {
  const tab = read(EXAMS_TAB);
  const old = tab.replace("assignExamToLesson(examsApi, assignTarget, selection)", "examsApi.assign(assignTarget.exam_id, { group_id: group.id, group_name: group.name, publish: false })");
  assert.doesNotMatch(old, /assignExamToLesson\(examsApi, assignTarget, selection\)/);
  assert.match(old, /publish:\s*false/);
});

// ---- step 5: «Экзамены» for the owner and the administrator (watch), the teacher runs ----------------------------------------

const GE = lib("group-exams.ts");

test("E-C/5: rights on the exams of a group as the exam service has them - the leading teacher binds, the others only watch", () => {
  const access = (workspace) => GE.groupExamsAccess({ workspace });
  assert.deepEqual(access("teacher"), { canAssign: true, showCode: true });
  assert.deepEqual(access("admin"), { canAssign: false, showCode: false }, "_require_teacher_exam_operator: the lifecycle of a run is the teacher's");
  assert.deepEqual(access("owner"), { canAssign: false, showCode: false });
});

test("E-C/5: the row of an exam leads where the role has a page: teacher - the hub, admin - the monitor, owner - nowhere", () => {
  const link = (workspace) => GE.groupExamLinks({ workspace, groupId: "g1", groupName: "9-А" }).exam("e1", "/x?tab=exams");
  assert.match(link("teacher"), /^\/teacher\/exams\/e1\?from_group=g1&from_name=/);
  assert.equal(link("admin"), "/admin/exams/e1");
  assert.equal(link("owner"), null, "the owner workspace never links into /admin/*");
});

test("E-C/5: the tab is in the list of every role and every role reads the same list of the group (one call, not two for a watcher)", () => {
  for (const role of ROLES) assert.ok(W.groupPageTabs({ workspace: role, paymentsAccess: "hidden" }).includes("exams"), role);
  const tab = read(EXAMS_TAB);
  assert.match(tab, /examsApi\.list\(\{ groupId, includeArchived: true \}\)/);
  assert.match(tab, /access\.canAssign \? examsApi\.list\(\{ unassigned: true \}\) : Promise\.resolve\(\[\]\)/, "the library is read only by who binds");
});

test("E-C/5: a button the role cannot use is not rendered (add, create the first, copy the code, the chevron of a row without a page)", () => {
  const tab = read(EXAMS_TAB);
  assert.match(tab, /\{access\.canAssign && <button\s+onClick=\{\(\) => setModalState\("chooser"\)\}/);
  assert.match(tab, /\{access\.canAssign && \(\s*<Link\s+href=\{links\.newExam\}/);
  assert.match(tab, /\{access\.showCode && ex\.access_code && \(ex\.status === "active" \|\| ex\.status === "lobby"\) && \(/);
  assert.match(tab, /<ExamRow\s+key=\{ex\.exam_id\}\s+href=\{links\.exam\(ex\.exam_id, groupExamReturnHref\)\}/);
  assert.match(tab, /if \(href\) return <Link href=\{href\}/);
  // mutation: the old tab (everyone gets the add button) is seen
  assert.doesNotMatch(tab.replace("{access.canAssign && <button", "{<button"), /\{access\.canAssign && <button\s+onClick/);
});

test("E-C/5: mutation - an administrator who may bind an exam is seen by the table", () => {
  const mutated = loadMutated("src/lib/group-exams.ts", "canAssign: teacher,", "canAssign: true,");
  assert.equal(mutated.groupExamsAccess({ workspace: "admin", group: {} }).canAssign, true);
  assert.equal(GE.groupExamsAccess({ workspace: "admin", group: {} }).canAssign, false);
});

// ---- the matrix «role: before -> after» ----------------------------------------------------------------------------------------
// Each row is what the role saw / could do on the page of a group BEFORE this package (origin/main 5fbc974) and what it sees now.
// «Same» rows are asserted against the functions above; the deliberately aligned rows are marked.

test("E-C/matrix: owner and administrator keep everything they had; the only additions are the tab «Экзамены» and the error screen instead of the silent redirect", () => {
  for (const workspace of ["owner", "admin"]) {
    const before = ["students", "schedule", "attendance"];
    const now = W.groupPageTabs({ workspace, paymentsAccess: "hidden" });
    assert.deepEqual(now.filter((tab) => tab !== "exams"), before, `${workspace}: the tabs they had, in their order`);
    assert.deepEqual(W.groupPageTabs({ workspace, paymentsAccess: "show" }).filter((tab) => tab !== "exams"), [...before, "payments"], `${workspace}: the money tab as before`);
    assert.deepEqual(W.groupHeaderActions({ archived: false, priceAvailable: true }), ["edit", "price", "archive"]);
    const journal = W.groupJournalAccess({ workspace, group: { name: "G", status: "active", teacher_id: "t9" }, userId: "u1" });
    assert.deepEqual([journal.canEdit, journal.adminMode, journal.groupName], [true, true, "G"], `${workspace}: the journal as before`);
  }
});

test("E-C/matrix: the teacher keeps his three tabs in his order, his journal rule (the group he leads), his exam list and its filters", () => {
  assert.deepEqual(W.groupPageTabs({ workspace: "teacher", paymentsAccess: "hidden" }), ["students", "exams", "attendance"]);
  for (const [group, userId, expected] of [
    [{ name: "G", status: "active", teacher_id: "me" }, "me", true],
    [{ name: "G", status: "active", teacher_id: "x" }, "me", false],
    [{ name: "G", status: "archived", teacher_id: "me" }, "me", false],
  ]) assert.equal(W.groupJournalAccess({ workspace: "teacher", group, userId }).canEdit, expected);
  const tab = read(EXAMS_TAB);
  for (const key of ["active", "lobby", "scheduled", "draft", "closed", "archived"]) assert.match(tab, new RegExp(`key: "${key}"`));
  assert.match(tab, /exam_status/);
  assert.match(tab, /exam_q/);
});

// ---- R3 В1: a substitute has no page of the group (403 by design) - his card leads to the lesson in his schedule -----------------

const TS = lib("teacher-schedule-link.ts");

test("E-C/R3-1: the card of a group he only substitutes in leads to the schedule on the week of his next lesson, never to /teacher/groups/{id}", () => {
  const assigned = [
    { groupId: "g1", lessonDate: "2026-11-03", startTime: "10:00" },
    { groupId: "g1", lessonDate: "2026-11-12", startTime: "09:00" },
    { groupId: "g2", lessonDate: "2026-11-05", startTime: "09:00" },
  ];
  const target = TS.substituteCardTarget("g1", assigned, "2026-11-05");
  assert.equal(target.href, "/teacher/schedule?date=2026-11-12", "the nearest lesson today or later; a past one is not offered");
  assert.match(target.label, /^Замена · 12 нояб/);
  assert.doesNotMatch(target.href, /\/teacher\/groups\//);
  // nothing known (a past lesson only, a failed request): the schedule of the week, the bare badge
  assert.deepEqual(TS.substituteCardTarget("g9", assigned, "2026-11-05"), { href: "/teacher/schedule", label: "Замена" });
  assert.equal(TS.substituteCardTarget("g1", [], "2026-11-05").href, "/teacher/schedule");
});

test("E-C/R3-1: the schedule opens the week of ?date=; a bad date opens nothing", () => {
  assert.equal(TS.scheduleDateParam("?date=2026-11-12"), "2026-11-12");
  assert.equal(TS.scheduleDateParam("?date=x"), null);
  assert.equal(TS.scheduleDateParam(""), null);
  assert.equal(TS.weekOffsetForDate("2026-11-12", "2026-11-05"), 1); // 05.11.2026 is a Thursday, the 12th is next week
  assert.equal(TS.weekOffsetForDate("2026-11-08", "2026-11-05"), 0); // Sunday of this week
  assert.equal(TS.weekOffsetForDate("2026-11-02", "2026-11-05"), 0); // Monday of this week
  assert.equal(TS.weekOffsetForDate("2026-11-01", "2026-11-05"), -1);
  const schedule = read("src/app/teacher/schedule/page.tsx");
  assert.match(schedule, /const date = scheduleDateParam\(window\.location\.search\);/);
  assert.match(schedule, /setWeekOffset\(weekOffsetForDate\(date, businessDateWithOffset\(0\)\)\)/);
});

test("E-C/R3-1: the teacher's list wires the substitute card to the schedule; no dead substitute branch is left on the page of the group", () => {
  const list = read("src/app/teacher/groups/page.tsx");
  assert.match(list, /href=\{substitute\?\.href \?\? `\/teacher\/groups\/\$\{group\.id\}`\}/);
  assert.match(list, /group\.substitution \? substituteCardTarget\(group\.id, covered, businessDateWithOffset\(0\)\) : null/);
  assert.match(read("src/components/groups/group-card.tsx"), /\{substituteLabel \?\? SUBSTITUTE_BADGE\}/);
  for (const file of [VIEW, EXAMS_TAB, "src/lib/group-workspace.ts", "src/lib/group-exams.ts"]) assert.doesNotMatch(read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), /substitution/, file);
  // mutation: the old link to the page of the group is seen
  assert.doesNotMatch(list.replace("substitute?.href ?? ", ""), /substitute\?\.href/);
});
