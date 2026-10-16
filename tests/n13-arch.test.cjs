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
    { canArchive: true, canRestore: false, showBanner: false, groupActions: true, paymentActions: true });
  assert.deepEqual(A.studentArchiveAccess({ isTeacher: false, status: "archived" }),
    { canArchive: false, canRestore: true, showBanner: true, groupActions: false, paymentActions: false });
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

test("the archive date and reason are read from the student block, the profile, or an «archive» block", () => {
  assert.deepEqual(A.studentArchiveInfo({ student: { archived_at: "2026-10-14T08:00:00", archive_reason: " Переехал " } }),
    { archivedAt: "2026-10-14T08:00:00", reason: "Переехал" });
  assert.deepEqual(A.studentArchiveInfo({ archived_at: "2026-10-14T08:00:00", archive_reason: "Дорого" }),
    { archivedAt: "2026-10-14T08:00:00", reason: "Дорого" });
  assert.deepEqual(A.studentArchiveInfo({ archive: { archived_at: "2026-10-14T08:00:00", reason: "Болезнь" } }),
    { archivedAt: "2026-10-14T08:00:00", reason: "Болезнь" });
  assert.deepEqual(A.studentArchiveInfo({ student: { archived_at: "  ", archive_reason: null } }), { archivedAt: "", reason: "" });
  assert.deepEqual(A.studentArchiveInfo(null), { archivedAt: "", reason: "" });
});

test("without a date field the date is the time the groups of the last archiving were closed", () => {
  const info = A.studentArchiveInfo({
    student: {},
    archived_groups: [{ group_id: "g1" }, { group_id: "g2" }],
    group_history: [
      { group_id: "g1", left_at: "2026-10-14T08:00:00" },
      { group_id: "g2", left_at: "2026-10-14T08:00:01" },
      { group_id: "g3", left_at: "2026-10-16T08:00:00" },   // left a group earlier / later, not part of the archiving
      { group_id: "g1", left_at: null },
    ],
  });
  assert.equal(info.archivedAt, "2026-10-14T08:00:01");
  // archived without groups and without a field: no date at all
  assert.equal(A.studentArchiveInfo({ student: {}, archived_groups: [], group_history: [{ group_id: "g3", left_at: "2026-10-16T08:00:00" }] }).archivedAt, "");
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

test("skipped groups are listed with the reason; the server's own text is kept", () => {
  const options = [{ groupId: "a", name: "Математика 7" }, { groupId: "b", name: "Физика" }];
  assert.equal(A.skipReasonLabel("group_full"), "группа заполнена");
  assert.equal(A.skipReasonLabel("full"), "группа заполнена");
  assert.equal(A.skipReasonLabel("group_archived"), "группа в архиве");
  assert.equal(A.skipReasonLabel("Группа заполнена"), "Группа заполнена");
  assert.equal(A.skipReasonLabel(""), "не удалось вернуть");
  assert.equal(A.skipReasonLabel(null), "не удалось вернуть");
  assert.deepEqual(A.restoreSkippedLines([{ group_id: "b", reason: "group_full" }, { group_id: "zzz", reason: "Группа в архиве" }], options),
    ["«Физика» — группа заполнена", "«Группа» — Группа в архиве"]);
  assert.deepEqual(A.restoreSkippedLines(undefined, options), []);
});

test("a clean return is a success; a skipped group is a warning that lists it", () => {
  const options = [{ groupId: "a", name: "Математика 7" }, { groupId: "b", name: "Физика" }];
  assert.deepEqual(A.restoreOutcome({ skipped: [] }, 2, options), { text: "Ученик возвращён из архива", type: "success", lines: [] });
  assert.deepEqual(A.restoreOutcome({}, 0, options), { text: "Ученик возвращён из архива", type: "success", lines: [] });
  const some = A.restoreOutcome({ skipped: [{ group_id: "b", reason: "group_full" }] }, 2, options);
  assert.equal(some.type, "warning");
  assert.equal(some.text, "Ученик возвращён из архива, но не во все группы");
  assert.deepEqual(some.lines, ["«Физика» — группа заполнена"]);
  const all = A.restoreOutcome({ skipped: [{ group_id: "a", reason: "x" }, { group_id: "b", reason: "y" }] }, 2, options);
  assert.equal(all.text, "Ученик возвращён из архива, но ни в одну группу");
  assert.equal(all.lines.length, 2);
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
  assert.match(view, /const access = studentArchiveAccess\(\{ isTeacher: Boolean\(isTeacher\), status: student\.status \}\)/);
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
  assert.match(view, /\{access\.canRestore && \(\s*<StudentRestoreModal/);
  assert.match(view, /archivedGroups=\{profile\.archived_groups\}/);
  // no group action on an archived card: the assign dialog follows the same switch
  assert.match(view, /\{access\.groupActions && \(\s*<AssignGroupModal/);
  assert.doesNotMatch(view, /\{!isTeacher && \(\s*<AssignGroupModal/);
  // success: toast + reload; 409: the card is out of date, error toast + reload
  assert.match(view, /showToast\(ARCHIVED_TOAST, "success"\);\s*void loadProfile\(\);/);
  assert.match(view, /showToast\(outcome\.text, outcome\.type, outcome\.lines\);\s*void loadProfile\(\);/);
  assert.match(view, /showToast\(message, "error"\);\s*void loadProfile\(\);/);
  // the toast survives the reload (the loading and the error screens render it too)
  assert.equal((view.match(/\{toastNode\}/g) || []).length, 3);
  // the only places that open the archive dialog: the menu item above (behind access.canArchive)
  assert.equal((view.match(/setArchiveOpen\(true\)/g) || []).length, 1);
  assert.equal((view.match(/setRestoreOpen\(true\)/g) || []).length, 1);
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
  assert.match(pay, /readOnly=\{readOnly\}/);
  assert.match(pay, /filter\(\(row\) => row\.is_active && !readOnly\)/);
  assert.match(pay, /filter\(\(row\) => !row\.is_active \|\| readOnly\)/);
  assert.match(pay, /Ученик в архиве: история оплат и квитанций сохранена, вносить оплату нельзя\./);

  const row = read("src/components/payments/membership-payments.tsx");
  assert.match(row, /readOnly = false/);
  assert.match(row, /const editable = row\.is_active && !readOnly;/);
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
  assert.match(modal, /\.status === 409\) onStale\(message\)/);
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
  // the student is back once the result is shown: any way of closing it refreshes the card
  assert.match(modal, /const close = \(\) => \{ if \(done\) onRestored\(done\); else onClose\(\); \};/);
  assert.match(modal, /\.status === 409\) onStale\(message\)/);
});

test("the API: POST archive {reason?} and restore {group_ids}; the profile carries archived_groups", () => {
  const api = read("src/lib/api.ts");
  assert.match(api, /api<StudentArchiveResult>\(`\/auth\/org\/students\/\$\{id\}\/archive`, \{ method: "POST", body: reason \? \{ reason \} : \{\} \}\)/);
  assert.match(api, /api<StudentRestoreResult>\(`\/auth\/org\/students\/\$\{id\}\/restore`, \{ method: "POST", body: \{ group_ids: groupIds \} \}\)/);
  assert.match(api, /closed_groups: Array<\{ group_id: string; group_name: string \}>/);
  assert.match(api, /skipped: Array<\{ group_id: string; reason: string \}>/);
  assert.match(api, /archived_groups\?: StudentArchivedGroup\[\]/);
  assert.match(api, /group_id: string;\s*group_name: string;\s*group_status: string;\s*is_full: boolean;/);
});

test("the list: three tabs from the address, a Suspense boundary, the archive without teacher / group filters and without group cells", () => {
  const list = read("src/components/students/students-list-view.tsx");
  assert.match(list, /<Suspense/);
  assert.match(list, /const tab: StudentTab = parseStudentTab\(searchParams\?\.get\("tab"\)\);/);
  assert.match(list, /router\.replace\(studentTabHref\(pathname \|\| `\$\{base\}\/students`, next\), \{ scroll: false \}\)/);
  assert.match(list, /STUDENT_TABS\.map\(\(value\) =>/);
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
