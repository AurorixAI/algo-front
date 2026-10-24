// LOGIC-B O4 + F2 (chain 2): the archive of a group as an operation - the impact dialog, the read-only archived group, the return.
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
require.extensions[".tsx"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/logB", `${name}.json`), "utf8"));
const A = require(path.join(root, "src/lib/group-archive.ts"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { ArchiveDialogBody, GroupArchivedBanner } = require(path.join(root, "src/components/groups/group-archive-dialog.tsx"));
const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const refusal = (status, body) => Object.assign(new Error(body.detail.message), { status, code: body.detail.code, detail: body.detail });

const body = (impact, over = {}) => renderToStaticMarkup(React.createElement(ArchiveDialogBody, {
  impact, view: impact ? A.archiveDialogView(impact, over.cancelMissed ?? false) : null, loadError: over.loadError ?? null,
  cancelMissed: over.cancelMissed ?? false, reason: "", reasonProblem: null, busy: false, error: over.error ?? null,
  onRetry() {}, onCancelMissed() {}, onReason() {}, onTransfer() {}, onArchiveStudent() {},
}));

test("[O4.R1] the title and the blockers of chain 2: the student with the two actions, the missed lesson with its choice, the notes", () => {
  const impact = fixture("c2_archive_impact");
  assert.equal(A.archiveTitle("8-В"), "Архивировать группу «8-В»?");
  const html = body(impact);
  const text = textOf(html);
  assert.match(text, /В группе 1 ученик\. Переведите их в другую группу или отправьте в архив — затем архивируйте группу\./);
  assert.match(text, /Каримов А\./);
  assert.match(text, /AL09-004/);
  assert.match(text, /Перевести в другую группу/);
  assert.match(text, /Не закрыто пропущенных уроков: 1\./);
  assert.match(text, /Отменить их при архивации \(урока не было\)/);
  assert.match(text, /Экзамены без попыток будут возвращены в черновик \(1\)\./);
  assert.match(text, /Будущие уроки \(8\) создаваться не будут\./);
  assert.doesNotMatch(text, /Справок на решении/); // the fixture has no warnings
  assert.equal(A.archiveDialogView(impact, false).canSubmit, false);
});

test("[O4.R5] cancelling the missed lessons clears that stop only; the students stay the stop; with none left «В архив» is on", () => {
  const impact = fixture("c2_archive_impact");
  const cancel = A.archiveDialogView(impact, true);
  assert.deepEqual(cancel.stops.map((s) => s.code), ["ACTIVE_STUDENTS"]);
  assert.equal(cancel.canSubmit, false);
  const emptied = { ...impact, blockers: impact.blockers.filter((b) => b.code === "MISSED_LESSONS"), canArchive: false };
  assert.equal(A.archiveDialogView(emptied, false).canSubmit, false, "missed lessons without the choice still stop");
  assert.equal(A.archiveDialogView(emptied, true).canSubmit, true);
  assert.deepEqual(A.archiveBody(true, " Группа закрыта "), { reason: "Группа закрыта", missedLessonsAction: "cancel" });
  assert.deepEqual(A.archiveBody(false, ""), {});
  assert.match(A.archiveReasonError("ab"), /не менее 3/);
  assert.equal(A.archiveReasonError(""), null);
});

test("[O4.R1] a clean group: no stops, the button is on, the notes still say what the archive does", () => {
  const clean = { groupId: "g", groupName: "8-В", status: "active", canArchive: true, examService: "ok", blockers: [], autoActions: [{ code: "STOP_FUTURE_LESSONS", count: 3 }], warnings: [{ code: "PENDING_EXCUSES", count: 2, message: "x" }] };
  const view = A.archiveDialogView(clean, false);
  assert.equal(view.canSubmit, true);
  const text = textOf(body(clean));
  assert.match(text, /Будущие уроки \(3\) создаваться не будут\./);
  assert.match(text, /Справок на решении: 2 — они останутся у администратора\./);
  assert.doesNotMatch(text, /Не закрыто пропущенных/);
});

test("[O4.R4] a lesson in progress and a running exam are hard stops in the words of the spec", () => {
  const impact = {
    groupId: "g", groupName: "8-В", status: "active", canArchive: false, examService: "ok", autoActions: [], warnings: [],
    blockers: [
      { code: "OPEN_LESSON", count: 1, lessons: [{ lessonId: "l", lessonDate: "2026-10-21", teacherName: "Петров П." }] },
      { code: "LIVE_EXAMS", count: 1, exams: [{ examId: "EX_9", title: "Контрольная №4", status: "active", blockerReason: "Экзамен уже идёт" }] },
    ],
  };
  const text = textOf(body(impact));
  assert.match(text, /Идёт урок\. Завершите или отмените его\./);
  assert.match(text, /Экзамен «Контрольная №4» уже идёт\. Дождитесь его окончания\./);
  assert.equal(A.archiveDialogView(impact, true).canSubmit, false);
});

test("[O4.R7] the exam service does not answer: the stop and the text of the spec; the loading and the load error render", () => {
  const down = { ...fixture("c2_archive_impact"), blockers: [], canArchive: false, examService: "unavailable" };
  assert.equal(A.archiveDialogView(down, false).canSubmit, false);
  assert.match(textOf(body(down)), /Не удалось проверить экзамены группы\. Повторите попытку\./);
  assert.match(textOf(body(null)), /Проверяем группу/);
  assert.match(textOf(body(null, { loadError: A.EXAM_SERVICE_DOWN_TEXT })), /Повторите попытку\..*Повторить/);
  assert.equal(A.EXAM_SERVICE_DOWN_TEXT, fixture("x_exam_service_unavailable").body.detail.message);
});

test("[O4.R1] a refusal of `archive` with fresh blockers refreshes the dialog instead of failing it", () => {
  const impact = fixture("c2_archive_impact");
  const blocked = fixture("c2_archive_blocked");
  const next = A.archiveRefusalImpact(refusal(blocked.status, blocked.body), { ...impact, blockers: [] });
  assert.deepEqual(next.blockers.map((b) => b.code), ["ACTIVE_STUDENTS", "MISSED_LESSONS"]);
  assert.equal(next.canArchive, false);
  assert.equal(A.archiveRefusalImpact(refusal(409, { detail: { code: "ALREADY_ARCHIVED", message: "x" } }), impact), null);
});

test("[O4.R3] the archived group: the read-only banner with the date and the way back; the legacy banner counts the students left", () => {
  const archived = fixture("c2_archive_ok");
  assert.equal(A.archivedBannerText(archived.archivedAt), "Группа в архиве с 22.10.2026. Журнал доступен только для чтения.");
  assert.equal(A.archivedBannerText(null), "Группа в архиве. Журнал доступен только для чтения.");
  assert.equal(A.legacyStudentsBannerText(3), "В архивной группе остались ученики (3). Переведите их в другую группу или отправьте в архив.");
  const html = renderToStaticMarkup(React.createElement(GroupArchivedBanner, { archivedAt: archived.archivedAt, studentCount: 2, onRestore() {} }));
  const text = textOf(html);
  assert.match(text, /Группа в архиве с 22\.10\.2026\. Журнал доступен только для чтения\./);
  assert.match(text, /Вернуть из архива/);
  assert.match(text, /В архивной группе остались ученики \(2\)/);
  const plain = textOf(renderToStaticMarkup(React.createElement(GroupArchivedBanner, { archivedAt: archived.archivedAt, studentCount: 0 })));
  assert.doesNotMatch(plain, /остались ученики/);
  assert.doesNotMatch(plain, /Вернуть из архива/, "no button without the right to restore");
  assert.equal(A.isArchived({ status: "archived" }), true);
});

test("[O4.R3] the return refused for a teacher who left: the name rides in the answer, the words of the spec", () => {
  const refused = fixture("c2_restore_teacher_inactive");
  assert.equal(A.restoreTeacherInactive(refusal(refused.status, refused.body)).teacherName, "Петров П.");
  assert.equal(A.restoreTeacherInactive(new Error("x")), null);
  assert.equal(A.RESTORE_TEACHER_INACTIVE_TEXT, "Преподаватель группы больше не работает в центре. Выберите нового или оставьте группу без преподавателя.");
});

test("the group pages are wired: «В архив» opens the dialog, the archived group is read-only, nobody sends `status` any more", () => {
  for (const who of ["admin", "owner"]) {
    assert.match(read(`src/app/${who}/groups/[id]/page.tsx`), new RegExp(`<GroupDetailView workspace="${who}" />`), who);
    const page = read("src/components/groups/group-detail-view.tsx");
    for (const needle of [/GroupArchiveDialog/, /GroupRestoreDialog/, /GroupArchivedBanner/, /canEdit=\{group\.status !== "archived"\}/, /Вернуть из архива/]) assert.match(page, needle, `${who} ${needle}`);
    assert.doesNotMatch(page, /confirm\(`Архивировать/);
  }
  const api = read("src/lib/api.ts");
  assert.match(read("src/components/groups/group-detail-view.tsx"), /GroupScheduleOverview groupId=\{groupId\} groupName=\{group\.name\} viewerRole=\{paths\.viewerRole\}/, "the owner replaces a lesson's teacher from the schedule tab too");
  assert.match(api, /groups\/\$\{encodePathId\(id\)\}\/archive`, \{ method: "POST"/);
  assert.match(api, /groups\/\$\{encodePathId\(id\)\}\/restore`/);
  assert.match(api, /archive-impact/);
  assert.doesNotMatch(api, /body: \{ status: "archived" \}/);
  assert.doesNotMatch(read("src/app/owner/groups/page.tsx"), /confirm\("Архивировать группу/);
});
