// N13 «Ученик ушёл из центра»: archive a student from the card, bring him back, the «Архив» tab of the list.
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
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const A = require(path.join(root, "src/lib/student-archive.ts"));
const tabs = require(path.join(root, "src/lib/students-tabs.ts"));

const group = (id, extra = {}) => ({ group_id: id, group_name: `Группа ${id}`, group_status: "active", is_full: false, ...extra });

// ---- who may do what ---------------------------------------------------------------------------

test("owner and administrator archive an active student and restore an archived one; a teacher gets nothing", () => {
  assert.deepEqual(A.studentArchiveAccess({ isTeacher: false, status: "active" }),
    { canArchive: true, canRestore: false, showBanner: false, groupActions: true, diagnosticActions: true, paymentActions: true });
  assert.deepEqual(A.studentArchiveAccess({ isTeacher: false, status: "archived" }),
    { canArchive: false, canRestore: true, showBanner: true, groupActions: false, diagnosticActions: false, paymentActions: false });
  for (const status of ["new", "diagnosed", "active"]) {
    const staff = A.studentArchiveAccess({ isTeacher: false, status });
    assert.equal(staff.canArchive, true, status);
    assert.equal(staff.canRestore, false, status);
  }
  for (const status of ["active", "archived", "new", null, undefined]) {
    const teacher = A.studentArchiveAccess({ isTeacher: true, status });
    assert.equal(teacher.canArchive, false, String(status));
    assert.equal(teacher.canRestore, false, String(status));
    assert.equal(teacher.groupActions, false, String(status));
    assert.equal(teacher.diagnosticActions, false, String(status));
    assert.equal(teacher.paymentActions, false, String(status));
  }
});

// ---- the archive dialog ----------------------------------------------------------------------------

test("the reason is optional, trimmed, at most 300 characters", () => {
  assert.equal(A.ARCHIVE_REASON_MAX, 300);
  assert.equal(A.normalizeArchiveReason("  Переехал в другой город  "), "Переехал в другой город");
  for (const blank of ["", "   ", null, undefined]) assert.equal(A.normalizeArchiveReason(blank), undefined);
  assert.equal(A.validateArchiveReason(""), null);
  assert.equal(A.validateArchiveReason("а".repeat(300)), null);
  assert.match(A.validateArchiveReason("а".repeat(301)), /не длиннее 300/);
  assert.equal(A.archiveReasonCounter("abc"), "3 / 300");
});

test("the dialog lists the groups he leaves, once each, in the order of the card", () => {
  assert.deepEqual(A.archiveGroupNames([{ group_name: "Математика 7" }, { group_name: " Физика " }, { group_name: "Математика 7" }, { group_name: "" }, {}]),
    ["Математика 7", "Физика"]);
  assert.deepEqual(A.archiveGroupNames(undefined), []);
  assert.deepEqual(A.archiveGroupNames(null), []);
  assert.equal(A.archiveGroupsHeading(1), "Он будет убран из группы:");
  assert.equal(A.archiveGroupsHeading(2), "Он будет убран из групп:");
  assert.match(A.archiveGroupsHeading(0), /не состоит ни в одной группе/);
  assert.equal(A.ARCHIVE_KEEPS_NOTE, "История уроков, оплат и квитанций сохранится");
  assert.equal(A.ARCHIVED_TOAST, "Ученик в архиве");
});

// ---- the banner -----------------------------------------------------------------------------------------

test("the banner says «В архиве с ДД.ММ.ГГГГ» on the center's clock; no date, no invented one", () => {
  assert.equal(A.archiveBannerTitle("2026-10-14T08:00:00"), "В архиве с 14.10.2026");
  // 20:00 UTC is already the next day in Tashkent (UTC+5)
  assert.equal(A.archiveBannerTitle("2026-10-14T20:00:00"), "В архиве с 15.10.2026");
  assert.equal(A.archiveBannerTitle("2026-10-14"), "В архиве с 14.10.2026");
  for (const none of ["", null, undefined, "не дата"]) assert.equal(A.archiveBannerTitle(none), "В архиве", String(none));
});

test("the archive date and reason are the server's student.archived_at (ISO, naive UTC) and student.archive_reason - nothing else is guessed", () => {
  assert.deepEqual(A.studentArchiveInfo({ student: { archived_at: "2026-10-14T08:00:00", archive_reason: " Переехал " } }),
    { archivedAt: "2026-10-14T08:00:00", reason: "Переехал" });
  // no date -> no date; the other places a guess could look at are ignored
  assert.deepEqual(A.studentArchiveInfo({ student: { archived_at: null, archive_reason: null } }), { archivedAt: "", reason: "" });
  assert.deepEqual(A.studentArchiveInfo({ student: { archived_at: "  ", archive_reason: "" } }), { archivedAt: "", reason: "" });
  assert.deepEqual(A.studentArchiveInfo({ student: {}, archived_at: "2026-10-14T08:00:00", archive_reason: "x", archive: { archived_at: "2026-10-14T08:00:00" },
    archived_groups: [{ group_id: "g1" }], group_history: [{ group_id: "g1", left_at: "2026-10-14T08:00:00" }] }), { archivedAt: "", reason: "" });
  assert.deepEqual(A.studentArchiveInfo(null), { archivedAt: "", reason: "" });
  assert.deepEqual(A.studentArchiveInfo(undefined), { archivedAt: "", reason: "" });
  // the date goes through the center's clock: 14.10 22:00 UTC is 15.10 in Tashkent
  assert.equal(A.archiveBannerTitle(A.studentArchiveInfo({ student: { archived_at: "2026-10-14T22:00:00" } }).archivedAt), "В архиве с 15.10.2026");
  assert.equal(A.archiveBannerTitle(A.studentArchiveInfo({ student: { archived_at: null } }).archivedAt), "В архиве");
});

// ---- the restore dialog -------------------------------------------------------------------------------------

test("a full or archived former group is disabled with the reason; an archived one wins over full", () => {
  const options = A.restoreOptions([
    group("a"),
    group("b", { is_full: true }),
    group("c", { group_status: "archived" }),
    group("d", { group_status: "archived", is_full: true }),
  ]);
  assert.deepEqual(options.map((o) => [o.groupId, o.disabled, o.note]), [
    ["a", false, ""], ["b", true, "группа заполнена"], ["c", true, "группа в архиве"], ["d", true, "группа в архиве"],
  ]);
  assert.equal(options[0].name, "Группа a");
  // a missing status is not a block: the server decides and reports it in `skipped`
  assert.equal(A.restoreOptions([{ group_id: "x", group_name: "Икс" }])[0].disabled, false);
  assert.equal(A.restoreOptions([group("e", { group_status: "closed" })])[0].note, "группа в архиве");
  assert.deepEqual(A.restoreOptions(undefined), []);
  assert.deepEqual(A.restoreOptions(null), []);
  // a repeated group is offered once, a blank name gets a stand-in
  assert.equal(A.restoreOptions([group("a"), group("a")]).length, 1);
  assert.equal(A.restoreOptions([group("a", { group_name: "  " })])[0].name, "Группа");
});

test("the groups that can take him back are ticked at the start; a disabled one can never be ticked or sent", () => {
  const options = A.restoreOptions([group("a"), group("b", { is_full: true }), group("c"), group("d", { group_status: "archived" })]);
  assert.deepEqual(A.defaultRestoreSelection(options), ["a", "c"]);
  assert.deepEqual(A.toggleRestoreGroup(["a", "c"], options, "a"), ["c"]);
  assert.deepEqual(A.toggleRestoreGroup(["c"], options, "a"), ["c", "a"]);
  assert.deepEqual(A.toggleRestoreGroup(["a"], options, "b"), ["a"]);           // full
  assert.deepEqual(A.toggleRestoreGroup(["a"], options, "d"), ["a"]);           // archived
  assert.deepEqual(A.toggleRestoreGroup(["a"], options, "nope"), ["a"]);        // unknown
  // what is sent: ticked, choosable, in the order of the dialog; a forged disabled id is dropped
  assert.deepEqual(A.restoreGroupIds(["c", "a", "b", "zzz"], options), ["a", "c"]);
  assert.deepEqual(A.restoreGroupIds([], options), []);
  assert.deepEqual(A.defaultRestoreSelection([]), []);
});

test("the line under the list tells what «Вернуть» will do", () => {
  assert.match(A.restoreSummary(0, 0), /Прежних групп нет/);
  assert.match(A.restoreSummary(0, 2), /Группы не выбраны/);
  assert.equal(A.restoreSummary(1, 2), "Ученик вернётся в 1 группу.");
  assert.equal(A.restoreSummary(3, 3), "Ученик вернётся в группы: 3.");
});

test("a skipped group is shown with the server's Russian message and its own name; the code in words is only a fallback", () => {
  const options = [{ groupId: "a", name: "Математика 7" }, { groupId: "b", name: "Физика" }];
  const skip = (group_id, reason, message, group_name = null) => ({ group_id, group_name, reason, message });
  assert.deepEqual(A.restoreSkippedLines([
    skip("b", "group_full", "Группа заполнена: мест нет", "Физика 8"),
    skip("a", "lesson_in_progress", "Нельзя изменить состав группы, пока идёт урок"),   // name from the dialog's own rows
    skip("zzz", "not_found", "Группа не найдена"),
  ], options), [
    "«Физика 8» — Группа заполнена: мест нет",
    "«Математика 7» — Нельзя изменить состав группы, пока идёт урок",
    "«Группа» — Группа не найдена",
  ]);
  // no message: the code in words
  const words = { group_full: "группа заполнена", group_archived: "группа в архиве", not_found: "группа не найдена", lesson_in_progress: "в группе идёт урок", busy: "ученика одновременно меняли в другом окне", refused: "не удалось вернуть" };
  for (const [code, text] of Object.entries(words)) {
    assert.equal(A.skipReasonLabel(code), text, code);
    assert.equal(A.restoreSkippedLines([skip("a", code, "")], options)[0], `«Математика 7» — ${text}`, code);
  }
  assert.equal(A.skipReasonLabel("something_new"), "something_new");
  assert.equal(A.skipReasonLabel(null), "не удалось вернуть");
  assert.deepEqual(A.restoreSkippedLines(undefined, options), []);
});

test("hints (warnings) of the enrolment are listed by group; one without a text is dropped", () => {
  const options = [{ groupId: "a", name: "Математика 7" }];
  assert.deepEqual(A.restoreWarningLines([
    { group_id: "a", code: "third_group", message: "Это третья группа ученика" },
    { group_id: "a", code: "x" },
    { group_id: "q", message: "Класс не совпадает" },
  ], options), ["«Математика 7» — Это третья группа ученика", "«Группа» — Класс не совпадает"]);
  assert.deepEqual(A.restoreWarningLines(undefined, options), []);
});

test("a clean return is a success; a skipped group is a warning that lists it; the owner reads skipped groups and hints", () => {
  const options = [{ groupId: "a", name: "Математика 7" }, { groupId: "b", name: "Физика" }];
  const clean = A.restoreOutcome({ skipped: [] }, 2, options);
  assert.deepEqual(clean, { text: "Ученик возвращён из архива", type: "success", lines: [], warnings: [] });
  assert.equal(A.restoreNeedsReading(clean), false);
  assert.deepEqual(A.restoreOutcome({}, 0, options), { text: "Ученик возвращён из архива", type: "success", lines: [], warnings: [] });
  const some = A.restoreOutcome({ skipped: [{ group_id: "b", group_name: "Физика", reason: "group_full", message: "Группа заполнена" }] }, 2, options);
  assert.equal(some.type, "warning");
  assert.equal(some.text, "Ученик возвращён из архива, но не во все группы");
  assert.deepEqual(some.lines, ["«Физика» — Группа заполнена"]);
  assert.equal(A.restoreNeedsReading(some), true);
  const all = A.restoreOutcome({ skipped: [{ group_id: "a", reason: "x", message: "m1" }, { group_id: "b", reason: "y", message: "m2" }] }, 2, options);
  assert.equal(all.text, "Ученик возвращён из архива, но ни в одну группу");
  assert.equal(all.lines.length, 2);
  // hints alone are not a failure, but they are shown
  const hints = A.restoreOutcome({ skipped: [], warnings: [{ group_id: "a", message: "Это третья группа" }] }, 1, options);
  assert.equal(hints.type, "success");
  assert.deepEqual(hints.warnings, ["«Математика 7» — Это третья группа"]);
  assert.equal(A.restoreNeedsReading(hints), true);
});

test("409 means «the card is out of date» only for «уже в архиве» / «не в архиве»; «пока идёт урок» keeps the dialog open", () => {
  assert.equal(A.isStaleArchiveConflict("archive", "Ученик уже в архиве"), true);
  assert.equal(A.isStaleArchiveConflict("restore", "Ученик не в архиве"), true);
  assert.equal(A.isStaleArchiveConflict("archive", "Нельзя изменить состав группы, пока идёт урок. Дождитесь его окончания."), false);
  assert.equal(A.isStaleArchiveConflict("restore", "Нельзя изменить состав группы, пока идёт урок"), false);
  assert.equal(A.isStaleArchiveConflict("archive", "Ученик не в архиве"), false);
  assert.equal(A.isStaleArchiveConflict("restore", "Ученик уже в архиве"), false);
  assert.equal(A.isStaleArchiveConflict("archive", null), false);
});

// ---- the «Архив» tab of the list ----------------------------------------------------------------------------

test("the list has a third tab «Архив (N)» with the query status=archived; the live tabs still leave archived out", () => {
  assert.deepEqual(tabs.STUDENT_TABS, ["grouped", "ungrouped", "archived"]);
  assert.deepEqual(tabs.studentTabQuery("archived"), { search: undefined, status: "archived" });
  assert.deepEqual(tabs.studentTabQuery("archived", "ал"), { search: "ал", status: "archived" });   // search works in the archive
  assert.deepEqual(tabs.studentTabQuery("grouped"), { search: undefined, has_group: true, exclude_status: "archived" });
  assert.deepEqual(tabs.studentTabQuery("ungrouped"), { search: undefined, has_group: false, exclude_status: "archived" });
  assert.equal(tabs.studentTabLabel("archived", 3), "Архив (3)");
  assert.equal(tabs.studentTabLabel("archived", 0), "Архив (0)");
  assert.equal(tabs.studentTabLabel("archived", null), "Архив");
  assert.equal(tabs.studentTabLabel("archived", undefined), "Архив");
});

test("the tab is in the address: ?tab=archived|ungrouped, anything else is «В группах»", () => {
  assert.equal(tabs.parseStudentTab("archived"), "archived");
  assert.equal(tabs.parseStudentTab("ungrouped"), "ungrouped");
  assert.equal(tabs.parseStudentTab("grouped"), "grouped");
  for (const bad of [null, undefined, "", "archive", "Archived", "all", "__proto__", "archived,grouped"]) assert.equal(tabs.parseStudentTab(bad), "grouped", String(bad));
  assert.equal(tabs.studentTabHref("/admin/students", "grouped"), "/admin/students");
  assert.equal(tabs.studentTabHref("/admin/students", "archived"), "/admin/students?tab=archived");
  assert.equal(tabs.studentTabHref("/owner/students", "ungrouped"), "/owner/students?tab=ungrouped");
  for (const tab of tabs.STUDENT_TABS) assert.equal(tabs.parseStudentTab(new URLSearchParams(tabs.studentTabHref("/x", tab).split("?")[1] || "").get("tab")), tab);
});

test("the counts of the tab bar: the open tab is exact, the others come from their own requests, a failed one is unknown", () => {
  assert.deepEqual(tabs.studentTabCounts("grouped", 41, { ungrouped: 9, archived: 1 }), { grouped: 41, ungrouped: 9, archived: 1 });
  assert.deepEqual(tabs.studentTabCounts("archived", 1, { grouped: 41, ungrouped: 9 }), { grouped: 41, ungrouped: 9, archived: 1 });
  assert.deepEqual(tabs.studentTabCounts("ungrouped", 9, { grouped: null, archived: 2 }), { grouped: null, ungrouped: 9, archived: 2 });
  assert.deepEqual(tabs.studentTabCounts("grouped", 0, {}), { grouped: 0, ungrouped: null, archived: null });
});

test("the demo has no archive: no «Архив» tab (nor its request), no «В архив» / «Вернуть из архива»", () => {
  assert.deepEqual(tabs.availableStudentTabs(false), ["grouped", "ungrouped", "archived"]);
  assert.deepEqual(tabs.availableStudentTabs(true), ["grouped", "ungrouped"]);
  assert.equal(tabs.parseStudentTab("archived", tabs.availableStudentTabs(true)), "grouped");     // a link to the archive opens «В группах»
  assert.equal(tabs.parseStudentTab("ungrouped", tabs.availableStudentTabs(true)), "ungrouped");
  assert.equal(tabs.parseStudentTab("archived"), "archived");
  for (const status of ["active", "archived"]) {
    const demo = A.studentArchiveAccess({ isTeacher: false, status, demo: true });
    assert.equal(demo.canArchive, false, status);
    assert.equal(demo.canRestore, false, status);
  }
  assert.equal(A.studentArchiveAccess({ isTeacher: false, status: "active", demo: false }).canArchive, true);
  assert.match(read("src/components/students/student-profile-view.tsx"), /studentArchiveAccess\(\{ isTeacher: Boolean\(isTeacher\), status: student\.status, demo: DEMO_MODE \}\)/);
});

test("the «Всего» line never counts the archive", () => {
  assert.equal(tabs.studentsSubtitle({ grouped: 41, ungrouped: 9, archived: 5 }, "grouped", 41, false), "50 учеников");
  assert.equal(tabs.studentsSubtitle({ grouped: 41, ungrouped: 9, archived: 5 }, "archived", 5, false), "50 учеников");
  // the archive tab never shows its own size as «Всего»
  assert.equal(tabs.studentsSubtitle({ grouped: null, ungrouped: 9, archived: 5 }, "archived", 5, false), "");
  assert.equal(tabs.studentsSubtitle({ grouped: 41, ungrouped: 9, archived: 5 }, "grouped", 41, true), "41 ученик");
});

// ---- source checks: permissions and wiring --------------------------------------------------------------------------

test("the card: «⋯ → В архив», the banner and the modals follow studentArchiveAccess, which gives a teacher nothing", () => {
  const view = read("src/components/students/student-profile-view.tsx");
  assert.match(view, /const access = studentArchiveAccess\(\{ isTeacher: Boolean\(isTeacher\), status: student\.status, demo: DEMO_MODE \}\)/);
  // the menu only for a student who can be archived
  assert.match(view, /\{access\.canArchive && \(\s*<div className="shrink-0">\s*<RowMenu/);
  assert.match(view, /label: "В архив", icon: Archive, danger: true, onSelect: \(\) => setArchiveOpen\(true\)/);
  // the banner for an archived card; its button only for who may restore
  assert.match(view, /\{access\.showBanner && \(\s*<div role="status"/);
  assert.match(view, /\{access\.canRestore && \(\s*<button[^>]*onClick=\{\(\) => setRestoreOpen\(true\)\}/);
  assert.match(view, /Вернуть из архива/);
  assert.match(view, /archiveBannerTitle\(archiveInfo\.archivedAt\)/);
  assert.match(view, /Причина: \{archiveInfo\.reason\}/);
  // modals are not even mounted for a role / state that cannot use them
  assert.match(view, /\{access\.canArchive && \(\s*<StudentArchiveModal/);
  // the restore dialog outlives `canRestore`: the reload that follows a return turns it off while the notice is open
  assert.match(view, /\{\(access\.canRestore \|\| restoreOpen\) && \(\s*<StudentRestoreModal/);
  assert.match(view, /archivedGroups=\{profile\.archived_groups\}/);
  // no group action on an archived card: the assign dialog follows the same switch
  assert.match(view, /\{access\.groupActions && \(\s*<AssignGroupModal/);
  assert.doesNotMatch(view, /\{!isTeacher && \(\s*<AssignGroupModal/);
  // success: toast + reload; 409: the card is out of date, error toast + reload
  assert.match(view, /showToast\(ARCHIVED_TOAST, "success", archiveResultDetails\(result\)\);\s*reloadCard\(\);/);
  assert.match(view, /showToast\(message, "error"\);\s*reloadCard\(\);/);
  // one reload helper for both directions: the card, the attendance summary and the payment counters of the menu
  assert.match(view, /const reloadCard = \(options\?: \{ silent\?: boolean \}\) => \{\s*void loadProfile\(options\);\s*void loadAttendanceSummary\(\);\s*void usePaymentsSummary\.getState\(\)\.refresh\(true\);\s*\};/);
  // the toast survives the reload (the loading and the error screens render it too)
  assert.equal((view.match(/\{toastNode\}/g) || []).length, 3);
  // the only places that open the archive dialog: the menu item above (behind access.canArchive)
  assert.equal((view.match(/setArchiveOpen\(true\)/g) || []).length, 1);
  assert.equal((view.match(/setRestoreOpen\(true\)/g) || []).length, 1);
});

test("the return refreshes the card at once, whether or not the dialog stays open for warnings; «Готово» does not refresh again", () => {
  const view = read("src/components/students/student-profile-view.tsx");
  // one handler, called by the dialog right after the server answered: reload in every case ...
  const handler = view.match(/const handleRestored = \(outcome: RestoreOutcome\) => \{[\s\S]*?\n  \};/)[0];
  assert.match(handler, /const dialogStays = restoreNeedsReading\(outcome\);/);
  assert.match(handler, /reloadCard\(\{ silent: dialogStays \}\);/);
  // ... but the dialog is closed and the toast shown only when there is nothing to read
  assert.match(handler, /if \(!dialogStays\) \{\s*setRestoreOpen\(false\);\s*showToast\(outcome\.text, outcome\.type, outcome\.lines\);\s*\}/);
  assert.equal((handler.match(/reloadCard\(/g) || []).length, 1, "no double refresh");
  // a silent reload keeps the card (and the notice on it): no spinner, and a failure is a toast, not the error screen
  assert.match(view, /const loadProfile = useCallback\(async \(options\?: \{ silent\?: boolean \}\) => \{/);
  assert.match(view, /if \(!silent\) setLoading\(true\);/);
  assert.match(view, /if \(silent\) showToast\("Не удалось обновить карточку ученика — обновите страницу", "error"\);\s*else setError\(/);
  // the only callers of reloadCard with `silent` are the restore handler
  assert.equal((view.match(/silent:/g) || []).length, 1);
  // the archive direction has no dialog that stays open: it closes, toasts and reloads behind the spinner
  const archived = view.match(/const handleArchived = \(result: StudentArchiveResult\) => \{[\s\S]*?\n  \};/)[0];
  assert.match(archived, /setArchiveOpen\(false\);\s*showToast\(ARCHIVED_TOAST, "success", archiveResultDetails\(result\)\);\s*reloadCard\(\);/);
  const archiveModal = read("src/components/students/student-archive-modal.tsx");
  assert.match(archiveModal, /onArchived\(result\);/);
  assert.doesNotMatch(archiveModal, /setDone|restoreNeedsReading/);
});

test("an archived card hides «Добавить в группу / Перевести / Зачислить» and the payment actions", () => {
  const groups = read("src/components/students/student-groups-block.tsx");
  assert.match(groups, /const \{ groupActions, showBanner: archived \} = studentArchiveAccess\(\{ isTeacher, status: profile\.student\.status \}\)/);
  assert.match(groups, /\{groupActions && memberships\.length > 0 && \(/);
  assert.match(groups, /\{groupActions && \(\s*<button/);
  assert.doesNotMatch(groups, /\{!isTeacher && /);
  assert.match(groups, /Ученик в архиве и не состоит в группах/);

  const pay = read("src/components/students/student-payments-block.tsx");
  assert.match(pay, /const readOnly = !access\.paymentActions;/);
  assert.match(pay, /archived=\{archived\}/);
  assert.match(pay, /filter\(\(row\) => row\.is_active && !readOnly\)/);
  assert.match(pay, /filter\(\(row\) => !row\.is_active \|\| readOnly\)/);
  assert.match(pay, /Вносить, продлевать и исправлять оплату нельзя — только отменить ошибочную\./);

  // the server refuses create / replace / an individual price for an archived student (409); «Отменить» is still allowed
  const row = read("src/components/payments/membership-payments.tsx");
  assert.match(row, /archived = false/);
  assert.match(row, /const editable = row\.is_active && !archived;/);
  assert.match(row, /const voidable = row\.is_active \|\| archived;/);
  assert.match(row, /editable=\{editable\}\s*voidable=\{voidable\}/);
  assert.match(row, /if \(!voided && editable\) \{\s*\/\/[^\n]*\s*if \(!carried\) items\.push\(\{ key: "correct"/);
  assert.match(row, /if \(!voided && voidable\) items\.push\(\{ key: "void"/);
  // «Внести оплату / Продлить» and the status stay behind `editable` (UX-1 A: one block, the price items get the flag as a prop)
  assert.equal((row.match(/\{editable && \(/g) || []).length, 2); // the status chip, the main button
  assert.match(row, /useMembershipPriceControls\(\{[\s\S]*?editable,/);
  assert.match(read("src/lib/group-price.ts"), /if \(!editable\) return \[\];/); // nothing to change for an archived student / a closed membership
});

test("the archive dialog: title, reason (≤300, optional), the note, buttons, the API call", () => {
  const modal = read("src/components/students/student-archive-modal.tsx");
  assert.match(modal, /title="Ученик ушёл из центра\?"/);
  assert.match(modal, />Причина \(необязательно\)</);
  assert.match(modal, /maxLength=\{ARCHIVE_REASON_MAX\}/);
  assert.match(modal, /\{ARCHIVE_KEEPS_NOTE\}/);
  assert.match(modal, /Отмена<\/button>/);
  assert.match(modal, /В архив\s*<\/button>/);
  assert.match(modal, /orgApi\.archiveStudent\(studentId, normalizeArchiveReason\(reason\)\)/);
  assert.match(modal, /htmlFor="student-archive-reason"/);
  assert.match(modal, /id="student-archive-reason"/);
  assert.match(modal, /role="alert"/);
  assert.match(modal, /\.status === 409 && isStaleArchiveConflict\("archive", message\)\) onStale\(message\);\s*else setError\(message\);/);
  assert.match(modal, /groupNames\.map\(\(name\) =>/);
});

test("the restore dialog: a checkbox per former group, disabled with the reason, only choosable ids are sent, skipped groups are listed", () => {
  const modal = read("src/components/students/student-restore-modal.tsx");
  assert.match(modal, /type="checkbox"/);
  assert.match(modal, /disabled=\{option\.disabled \|\| busy\}/);
  assert.match(modal, /aria-describedby=\{option\.note \? noteId : undefined\}/);
  assert.match(modal, /orgApi\.restoreStudent\(studentId, ids\)/);
  assert.match(modal, /const ids = restoreGroupIds\(selected, options\);/);
  assert.match(modal, /<fieldset/);
  assert.match(modal, /<legend/);
  assert.match(modal, />Вернуть\s*<\/button>|Вернуть\s*\n\s*<\/button>/);
  assert.match(modal, /Не удалось вернуть ученика в эти группы:/);
  assert.match(modal, /Готово/);
  // the student is back the moment the server answers: the card is told at once (once), the notice only keeps the dialog open
  assert.match(modal, /if \(restoreNeedsReading\(outcome\)\) setDone\(outcome\);\s*onRestored\(outcome\);/);
  assert.equal((modal.match(/onRestored\(/g) || []).length, 1, "onRestored is called from exactly one place");
  // «Готово», the cross, Escape, the backdrop and «Отмена» only close: nothing to refresh any more ...
  assert.equal((modal.match(/onClose=\{close\}/g) || []).length, 2, "both dialogs");
  assert.match(modal, /onClick=\{close\} className="rounded-xl bg-primary-600[^"]*">Готово</);
  assert.match(modal, /onClick=\{close\} disabled=\{busy\}[^>]*>Отмена</);
  // ... and every way out forgets the notice, so a dialog that opens again never shows the old result for a frame
  assert.match(modal, /const close = \(\) => \{ setDone\(null\); onClose\(\); \};/);
  // the card reloading under the notice (archived_groups empties) must not wipe the notice: it is cleared only on open
  assert.match(modal, /if \(open\) \{\s*setBusy\(false\);\s*setError\(null\);\s*setDone\(null\);\s*\}\s*\}, \[open, studentId\]\);/);
  assert.match(modal, /if \(open\) setSelected\(defaultRestoreSelection\(options\)\);/);
  assert.match(modal, /\.status === 409 && isStaleArchiveConflict\("restore", message\)\) onStale\(message\);\s*else setError\(message\);/);
  assert.match(modal, /Обратите внимание:/);
});

test("the API: POST archive {reason?} and restore {group_ids}; the profile carries archived_groups and student.archived_at", () => {
  const api = read("src/lib/api.ts");
  assert.match(api, /api<StudentArchiveResult>\(`\/auth\/org\/students\/\$\{id\}\/archive`, \{ method: "POST", body: reason \? \{ reason \} : \{\} \}\)/);
  assert.match(api, /api<StudentRestoreResult>\(`\/auth\/org\/students\/\$\{id\}\/restore`, \{ method: "POST", body: \{ group_ids: groupIds \} \}\)/);
  assert.match(api, /closed_groups: Array<\{ group_id: string; group_name: string \}>/);
  assert.match(api, /restored_groups\?: Array<\{ group_id: string; group_name: string \}>/);
  assert.match(api, /skipped: Array<\{ group_id: string; group_name: string \| null; reason: StudentRestoreSkipReason \| string; message: string \}>/);
  assert.match(api, /"group_full" \| "group_archived" \| "not_found" \| "lesson_in_progress" \| "refused" \| "busy"/);
  assert.match(api, /warnings\?: Array<\{ group_id: string; code\?: string; message\?: string \}>/);
  assert.match(api, /archived_groups\?: StudentArchivedGroup\[\] \| null/);
  assert.match(api, /archived_at\?: string \| null;\s*archive_reason\?: string \| null;\s*\};/);   // inside `student`
  assert.match(api, /group_id: string;\s*group_name: string;\s*group_status: string;\s*is_full: boolean;/);
  // the profile has no second place for the date
  assert.doesNotMatch(api, /archive\?: \{ archived_at/);
});

test("no screen moves a student into or out of the archive through the generic PUT (the server answers 422)", () => {
  // the only caller of updateStudent is the contacts editor: phone and comment
  const callers = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name) && /updateStudent\(/.test(read(rel))) callers.push(rel);
    }
  };
  walk("src");
  assert.deepEqual(callers, ["src/components/students/student-profile-view.tsx"]);
  const view = read("src/components/students/student-profile-view.tsx");
  const call = view.slice(view.indexOf("orgApi.updateStudent("), view.indexOf("orgApi.updateStudent(") + 160);
  assert.match(call, /student_phone: phoneVal\.trim\(\) \|\| null,\s*comment: commentVal\.trim\(\) \|\| null,/);
  assert.doesNotMatch(call, /status/);
});

test("the list: three tabs from the address, a Suspense boundary, the archive without teacher / group filters and without group cells", () => {
  const list = read("src/components/students/students-list-view.tsx");
  assert.match(list, /<Suspense/);
  assert.match(list, /const tab: StudentTab = parseStudentTab\(searchParams\?\.get\("tab"\), OFFERED_TABS\);/);
  assert.match(list, /const OFFERED_TABS = availableStudentTabs\(DEMO_MODE\);/);
  assert.match(list, /router\.replace\(studentTabHref\(pathname \|\| `\$\{base\}\/students`, next\), \{ scroll: false \}\)/);
  assert.match(list, /OFFERED_TABS\.map\(\(value\) =>/);
  assert.match(list, /OFFERED_TABS\.filter\(\(value\) => value !== activeTab\)/);   // no archive count request in the demo
  assert.match(list, /studentTabLabel\(value, counts\[value\]\)/);
  assert.match(list, /\.\.\.studentTabQuery\(activeTab, search\)/);
  assert.match(list, /studentTabCounts\(activeTab, data\.total, otherTotals\)/);
  assert.match(list, /\{activeTab !== "archived" && \(\s*<CascadingFilter/);
  assert.match(list, /aria-label="Поиск по имени или ID ученика"/);               // search stays on every tab
  assert.match(list, /В архиве пока никого нет/);
  // an archived row shows «В архиве» (by the student's own status, never «Без группы»): phone card and table cell; the header says «Статус»
  assert.equal((list.match(/isArchivedStatus\(s\.status\) \? \(/g) || []).length, 2);
  assert.match(list, /\{activeTab === "archived" \? "Статус" : "Группа"\}/);
  // phone: the tab bar scrolls inside itself, never widens the page
  assert.match(list, /role="tablist"[^>]*className="flex w-full overflow-x-auto/);
});

test("375 px: the banner stacks, long names and reasons wrap, the header menu does not push the name out", () => {
  const view = read("src/components/students/student-profile-view.tsx");
  assert.match(view, /flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row/);
  assert.match(view, /break-words text-sm text-amber-800">Причина:/);
  assert.match(view, /<div className="relative z-10 flex items-start justify-between gap-3">/);
  assert.match(view, /<h1 className="min-w-0 break-words text-2xl font-bold text-slate-900">/);
  const restore = read("src/components/students/student-restore-modal.tsx");
  assert.match(restore, /break-words text-sm font-medium/);
  assert.match(read("src/components/students/student-archive-modal.tsx"), /break-words rounded-lg bg-slate-50/);
});
