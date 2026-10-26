// R3 fixes of the S0 / IA wave: a bare-link receipt leads on by the ids of the receipt, the accounting-start dry run says how many openings to
// review, the openings page keeps the typed rows while they are off the page and asks before hiding them, the teacher filter of the students
// list is the server's, the launch checklist says «начнётся» before the start, and the unused groupLessonHref is gone.
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
const P = require(path.join(root, "src/lib/payments.ts"));
const O = require(path.join(root, "src/lib/openings.ts"));
const S = require(path.join(root, "src/lib/students-tabs.ts"));
const L = require(path.join(root, "src/lib/ia-links.ts"));
const plain = (text) => String(text).replace(/ /g, " ");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/openings", `${name}.json`), "utf8"));

test("receipt: the ids of the receipt are the fallback of the links (a bare link shows «Выписка / Ученик / Группа»)", () => {
  const bare = P.receiptContextOf(new URLSearchParams(""));
  const receipt = { membership_id: "m-1", student_id: "s-1", group_id: "g-1" };
  assert.deepEqual(P.receiptContextWithFallback(bare, receipt), { membershipId: "m-1", studentId: "s-1", groupId: "g-1" });
  // what the address says wins; the rest comes from the receipt
  assert.deepEqual(P.receiptContextWithFallback(P.receiptContextOf(new URLSearchParams("m=m-9")), receipt), { membershipId: "m-9", studentId: "s-1", groupId: "g-1" });
  // an older server sends no ids; a strange id is not a link
  assert.deepEqual(P.receiptContextWithFallback(bare, {}), { membershipId: null, studentId: null, groupId: null });
  assert.deepEqual(P.receiptContextWithFallback(bare, null), { membershipId: null, studentId: null, groupId: null });
  assert.deepEqual(P.receiptContextWithFallback(bare, { membership_id: "../x", student_id: null, group_id: "g" }), { membershipId: null, studentId: null, groupId: "g" });
  const view = read("src/components/payments/receipt-view.tsx");
  assert.match(view, /receiptContextWithFallback\(queryContext, receipt\)/);
  assert.match(view, /receipt-link-statement/);
  assert.match(read("src/lib/payments.ts"), /student_id\?: string \| null;\n  membership_id\?: string \| null;\n  group_id\?: string \| null;/);
});

test("settings: the dry run of the accounting start says how many openings to review, with a link", () => {
  const base = { memberships_with_new_debt: 0, debt_delta: 0 };
  assert.deepEqual(P.accountingStartImpactLines(base), ["Долг и аванс ни у кого не изменятся"]);
  assert.deepEqual(P.accountingStartImpactLines({ ...base, openings_to_review: 0 }), ["Долг и аванс ни у кого не изменятся"]);
  const one = P.accountingStartImpactLines({ ...base, openings_to_review: 1 }).map(plain);
  assert.deepEqual(one, [
    "Долг и аванс ни у кого не изменятся",
    "У 1 остатка «оплачено до» раньше нового начала — пересмотрите их в «Остатки на начало»",
  ]);
  const many = P.accountingStartImpactLines({ memberships_with_new_debt: 2, debt_delta: 500000, openings_to_review: 7 }).map(plain);
  assert.equal(many.length, 2);
  assert.match(many[0], /^Долг изменится у 2 учеников/);
  assert.equal(many[1], "У 7 остатков «оплачено до» раньше нового начала — пересмотрите их в «Остатки на начало»");
  assert.equal(P.accountingStartOpeningsToReview({ ...base, openings_to_review: 7 }), 7);
  assert.equal(P.accountingStartOpeningsToReview(base), 0);
  assert.equal(P.accountingStartOpeningsToReview(null), 0);
  const page = read("src/app/owner/settings/page.tsx");
  assert.match(page, /toReview: accountingStartOpeningsToReview\(answer\.impact\)/);
  assert.match(page, /openingsHref=\{openingsHref\("\/owner\/payments"\)\}/);
  assert.match(read("src/components/payments/accounting-start-line.tsx"), /href=\{openingsHref\}[^>]*accounting-start-openings-link/);       // the hint of the date names «Остатки на начало» and links there
});

const rowsOf = () => O.flatRows(O.normalizeList(fixture("O01_list_pending")).groups);
const rowOf = (n) => rowsOf().find((row) => row.membership_id.endsWith(String(n)));

test("openings: a draft of a row that is off the page is kept, and comes back with the row", () => {
  const rows = rowsOf();
  const a = rowOf(103);
  const b = rowOf(105);
  const drafts = {
    [a.membership_id]: { ...O.draftOfRow(a), paidUntil: "2026-11-30" },
    [b.membership_id]: { ...O.draftOfRow(b), debt: "500 000" },
  };
  // the answer has only the row `a` (the other one was hidden: another group, the left ones off)
  const only = rows.filter((row) => row.membership_id === a.membership_id);
  const kept = O.prunedDrafts(only, drafts);
  assert.deepEqual(Object.keys(kept).sort(), [a.membership_id, b.membership_id].sort());
  assert.equal(O.hiddenDraftCount(only, kept), 1);
  assert.equal(O.changedCount(only, kept), 1); // only the present row counts as an item
  assert.deepEqual(O.itemsOf(only, kept).map((item) => item.membership_id), [a.membership_id]); // the hidden one is never sent
  // the rows come back: the typed value is there again
  assert.equal(O.hiddenDraftCount(rows, kept), 0);
  assert.deepEqual(O.itemsOf(rows, kept).map((item) => item.membership_id).sort(), [a.membership_id, b.membership_id].sort());
  // a draft that equals the saved value is still dropped when its row is present
  const same = { ...kept, [rowOf(101).membership_id]: O.draftOfRow(rowOf(101)) };
  assert.equal(Object.keys(O.prunedDrafts(rows, same)).length, 2);
  // a bulk action over some rows keeps the drafts of the others (it used to drop them)
  const bulk = O.applyBulk([rowOf(101)], kept, { kind: "clear" }, { accountingStart: "2026-11-01", paidUntilMax: "2027-10-23" });
  assert.ok(a.membership_id in bulk.drafts && b.membership_id in bulk.drafts);
});

test("openings: before a read that hides drafted rows the existing confirm is asked", () => {
  const rows = rowsOf();
  const a = rowOf(103);
  const b = rowOf(105);
  const drafts = { [a.membership_id]: { ...O.draftOfRow(a), paidUntil: "2026-11-30" }, [b.membership_id]: { ...O.draftOfRow(b), debt: "500 000" } };
  const groupOf = (row) => row.group.id;
  // another group chosen: the drafted rows of the other groups would go
  const target = groupOf(a);
  const stays = (row) => groupOf(row) === target;
  const expected = [a, b].filter((row) => groupOf(row) !== target).length;
  assert.equal(O.draftsAtRisk(rows, drafts, stays), expected);
  // «Показать ушедших» off: only the drafted rows of the left ones are at risk
  const goneRow = { ...rowOf(104), status: "left", only_debt: true };
  const withLeft = [...rows.filter((row) => row.membership_id !== goneRow.membership_id), goneRow];
  const goneDrafts = { ...drafts, [goneRow.membership_id]: { ...O.draftOfRow(goneRow), debt: "100 000", debtOn: goneRow.floor } };
  assert.equal(O.draftsAtRisk(withLeft, goneDrafts, (row) => row.status !== "left" && !row.only_debt), 1);
  assert.equal(O.draftsAtRisk(withLeft, drafts, (row) => row.status !== "left" && !row.only_debt), 0);
  assert.equal(O.draftsAtRisk(rows, drafts, () => true), 0);
  assert.equal(O.draftsAtRisk(rows, {}, () => false), 0);
  assert.equal(O.draftsAtRisk(rows, { [a.membership_id]: O.draftOfRow(a) }, () => false), 0); // an untouched row is not a risk
  assert.match(O.openingsHiddenDraftsText(1), /у 1 ученика/);
  assert.match(O.openingsHiddenDraftsText(5), /у 5 учеников/);
  const page = read("src/components/payments/openings-page.tsx");
  assert.match(page, /confirmLeave\(risk > 0, openingsHiddenDraftsText\(risk\)\)/);
  assert.match(page, /onChange=\{\(event\) => changeServerGroup\(event\.target\.value\)\}/);
  assert.match(page, /if \(serverGroup !== "" \|\| groupOptions === catalog\) changeServerGroup\(event\.target\.value\);/);
  assert.match(page, /onChange=\{\(event\) => toggleLeft\(event\.target\.checked\)\}/);
  assert.match(page, /if \(!checked && !confirmHiding\(/);
  assert.match(page, /changedCount\(rows, drafts\) \+ hiddenDrafts/);
});

test("students list: the teacher filter is the server's (teacher_id + server paging), and no teacher can leave the list loading", () => {
  const q = S.studentsPageQuery({ tab: "ungrouped", search: "али", teacherId: "t1", page: 2, pageSize: 20 });
  assert.deepEqual(q, { search: "али", has_group: true, exclude_status: "archived", group_id: undefined, teacher_id: "t1", limit: 20, offset: 40 });
  // a chosen group wins over the teacher; no filters: the tab's own query
  assert.equal(S.studentsPageQuery({ tab: "grouped", groupId: "g1", teacherId: "t1", page: 0, pageSize: 20 }).teacher_id, undefined);
  assert.equal(S.studentsPageQuery({ tab: "grouped", groupId: "g1", page: 0, pageSize: 20 }).group_id, "g1");
  assert.deepEqual(S.studentsPageQuery({ tab: "archived", page: 1, pageSize: 20 }), { search: undefined, status: "archived", group_id: undefined, teacher_id: undefined, limit: 20, offset: 20 });
  const api = read("src/lib/api.ts");
  assert.match(api, /teacher_id\?: string; has_group/);
  assert.match(api, /query\.set\("teacher_id", params\.teacher_id\)/);
  const view = read("src/components/students/students-list-view.tsx");
  assert.match(view, /studentsPageQuery\(\{ tab: activeTab, search, groupId: filterGroup, teacherId: filterTeacher, page, pageSize: PAGE_SIZE \}\)/);
  assert.doesNotMatch(view, /mergeTeacherStudents|teacherGroupIds|teacherMode|groups\.length === 0\) return/);
  assert.equal(S.mergeTeacherStudents, undefined);
});

test("launch checklist: «запущен» only once the start has come, «начнётся» before it", () => {
  const summary = (start, state = "done") => ({ accounting_start: start, state, totals: { memberships: 90, with_opening: 90, missing: 0, left_available: 0, shown: 0, needs_review: 0 } });
  assert.equal(O.checklistOf(summary("2026-11-01"), "2026-11-01").line, "Учёт оплат запущен с 01.11.2026 ✓"); // the day itself
  assert.equal(O.checklistOf(summary("2026-11-01"), "2026-12-01").line, "Учёт оплат запущен с 01.11.2026 ✓");
  assert.equal(O.checklistOf(summary("2026-11-01"), "2026-10-22").line, "Учёт начнётся с 01.11.2026");
  assert.equal(O.checklistOf(summary("2026-11-01", "skipped"), "2026-10-22").line, "Учёт начнётся с 01.11.2026");
  // not launched yet: no line at all
  assert.equal(O.checklistOf({ ...summary("2026-11-01", "pending"), totals: { ...summary("x").totals, missing: 5, with_opening: 85 } }, "2026-12-01").line, null);
  assert.match(read("src/components/payments/openings-widgets.tsx"), /checklistOf\(summary, today\)/);
});

test("ia-links: the unused groupLessonHref is gone", () => {
  assert.equal(L.groupLessonHref, undefined);
  assert.doesNotMatch(read("src/lib/ia-links.ts"), /groupLessonHref/);
  assert.equal(typeof L.groupHref, "function");
});
