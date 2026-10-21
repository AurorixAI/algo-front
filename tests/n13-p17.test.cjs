// N13 P1.7 - the drawer enrols NEW students, «Ученики» splits «В группах» / «Без группы»,
// dashboard leaders never overlap the risk zone, «⋯» buttons name their row.
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
const src = (p) => path.join(__dirname, "..", "src", p);
const read = (p) => fs.readFileSync(src(p), "utf8");
const lib = (name) => require(src(`lib/${name}.ts`));
const pool = lib("student-pool");
const status = lib("student-status");
const tabs = lib("students-tabs");
const overview = lib("owner-overview");

// ---- 1. add-student drawer: free students by default, everyone only for a search ----------------

test("without a search the drawer asks only for students with no group, in the group's class", () => {
  const base = { search: "", groupClassLevel: 9, allClasses: false };
  const q = pool.studentPoolQuery(base);
  assert.equal(q.has_group, false);
  assert.equal(q.class_level, 9);
  assert.equal(q.exclude_status, "archived");
  // «Все классы» still drops the class filter and nothing else
  const all = pool.studentPoolQuery({ ...base, allClasses: true });
  assert.equal(all.class_level, undefined);
  assert.equal(all.has_group, false);
});

test("a search of two or more characters looks through all non-archived students, one character does not", () => {
  const base = { groupClassLevel: 9, allClasses: false };
  for (const term of ["ал", "  ал  ", "AL15-001", "Алия Каримова"]) {
    const q = pool.studentPoolQuery({ ...base, search: term });
    assert.equal(q.has_group, undefined, term);                // no group filter: students of other groups too
    assert.equal(q.search, term.trim(), term);
    assert.equal(q.exclude_status, "archived", term);
    assert.equal(q.class_level, 9, term);                       // the class filter is still respected
  }
  assert.equal(pool.studentPoolQuery({ ...base, allClasses: true, search: "ал" }).class_level, undefined);
  for (const term of ["", " ", "а", "  а "]) {
    const q = pool.studentPoolQuery({ ...base, search: term });
    assert.equal(q.search, undefined, JSON.stringify(term));
    assert.equal(q.has_group, false, JSON.stringify(term));
  }
  assert.equal(pool.poolSearchTerm("  ё "), "");
  assert.equal(pool.poolSearchTerm("🙂🙂"), "🙂🙂"); // two characters, not four UTF-16 units
});

test("a student of another group is hidden by default and offered for a search (older servers too)", () => {
  const list = [
    { id: "free", status: "new" },
    { id: "free-active", status: "active", groups_count: 0 },
    { id: "stale", status: "active", group_id: "gone-group", groups_count: 0, current_group_id: null }, // no live membership
    { id: "primary", status: "active", group_id: "g1", groups_count: 1, current_group_id: "g1" },
    { id: "member-only", status: "active", groups_count: 2, current_group_id: "g2" },
    { id: "old-server", status: "active", group_id: "g1" },       // no groups_count: the stored group is all we know
    { id: "gone", status: "archived" },
    { id: "here", status: "new" },
  ];
  const ids = (opts) => pool.availableStudents(list, new Set(["here"]), opts).map((s) => s.id);
  assert.deepEqual(ids({ ungroupedOnly: true }), ["free", "free-active", "stale"]);
  assert.deepEqual(ids({}), ["free", "free-active", "stale", "primary", "member-only", "old-server"]);
  assert.deepEqual(ids(undefined), ["free", "free-active", "stale", "primary", "member-only", "old-server"]);
});

test("the drawer keeps the owner's wording and the transfer / add-more choice", () => {
  const drawer = read("components/groups/add-student-drawer.tsx");
  assert.match(drawer, /Нет учеников без группы\. Найдите ученика по имени или ID, чтобы перевести или добавить его в эту группу\./);
  assert.match(drawer, /placeholder="Поиск по имени или ID…"/);
  assert.match(drawer, /const searching = searchTerm !== "";/);
  assert.match(drawer, /сейчас в «\{groupNames\[currentGroupOf\(s\) as string\] \|\| "другой группе"\}»/);
  assert.match(drawer, /\["transfer", "Перевести сюда"\]/);
  assert.match(drawer, /\["add", "Добавить ещё и в эту группу"\]/);
  // status pill goes through the shared helper, not a local table
  assert.match(drawer, /studentStatusLabel\(s\)/);
  assert.doesNotMatch(drawer, /statusLabels/);
});

test("an empty search says what to try, a one-character query says how many characters are needed", () => {
  const drawer = read("components/groups/add-student-drawer.tsx");
  assert.match(drawer, /const classFilterOn = Boolean\(groupClassLevel\) && !allClasses;/);
  assert.match(drawer, /`Ничего не найдено\$\{classFilterOn \? "\. Попробуйте «Все классы»" : ""\}`/);
  assert.match(drawer, /const tooShort = !searching && debouncedSearch\.trim\(\) !== "";/);
  assert.match(drawer, /\{tooShort && <p [^>]*>Введите минимум 2 символа<\/p>\}/);
  // the one-character query asks the server for the free students only (no search is sent)
  const q = pool.studentPoolQuery({ search: "а", groupClassLevel: 9, allClasses: false });
  assert.deepEqual([q.search, q.has_group], [undefined, false]);
});

// ---- 2. «Без группы» is a status of its own, and a tab -------------------------------------------

test("an active student with no group shows «Без группы», everything else keeps its label", () => {
  const label = status.studentStatusLabel;
  assert.equal(label({ status: "active", group_id: null }), "Без группы");
  assert.equal(label({ status: "active" }), "Без группы");
  assert.equal(label({ status: "active", group_id: null, groups_count: 0 }), "Без группы");
  assert.equal(label({ status: "active", group_id: "g1" }), "Активный");                   // an older server: only group_id is known
  assert.equal(label({ status: "active", group_id: "g1", groups_count: 1, current_group_id: "g1" }), "Активный");
  assert.equal(label({ status: "active", group_id: null, groups_count: 2, current_group_id: "g2" }), "Активный"); // a live membership is enough
  assert.equal(label({ status: "active", groups_count: 1 }), "Активный");
  assert.equal(label({ status: "active", group_id: "stale", groups_count: 0, current_group_id: null }), "Без группы"); // stale primary group
  assert.equal(label({ status: "new" }), "Новый");
  assert.equal(label({ status: "diagnosed", group_id: null }), "Диагностирован");
  assert.equal(label({ status: "archived", group_id: null }), "Архив");
  assert.equal(label({ status: "mystery" }), "mystery");
  assert.equal(status.studentStatusKey({ status: "active" }), "no_group");
  assert.equal(status.studentStatusKey({ status: "new" }), "new");
  // «in a group» = an active membership in a live group (the server's has_group), the three edge states:
  assert.equal(status.studentHasGroup({ group_id: "stale", groups_count: 0 }), false);                       // stale students.group_id
  assert.equal(status.studentHasGroup({ group_id: "archived-group", groups_count: 0, current_group_id: null }), false); // archived group only
  assert.equal(status.studentHasGroup({ group_id: null, groups_count: 1, current_group_id: "g2" }), true);   // membership without a primary group
  assert.equal(status.studentHasGroup({ group_id: "g", groups_count: 1 }), true);
  assert.equal(status.studentHasGroup({ group_id: "g" }), true);                                              // older server
  assert.equal(status.studentHasGroup({}), false);
  // the group to show comes from the memberships, not from students.group_id
  assert.equal(status.studentGroupId({ group_id: null, groups_count: 1, current_group_id: "g2" }), "g2");
  assert.equal(status.studentGroupId({ group_id: "stale", groups_count: 0, current_group_id: null }), null);
  assert.equal(status.studentGroupId({ group_id: "g1", groups_count: 2, current_group_id: "g1" }), "g1");
  assert.equal(status.studentGroupId({ group_id: "g1" }), "g1");                                              // older server
  assert.equal(status.studentGroupId({}), null);
});

test("tab queries are the two halves of the non-archived students", () => {
  assert.deepEqual(tabs.studentTabQuery("grouped"), { search: undefined, has_group: true, exclude_status: "archived" });
  assert.deepEqual(tabs.studentTabQuery("ungrouped", "ал"), { search: "ал", has_group: false, exclude_status: "archived" });
  assert.equal(tabs.studentTabLabel("grouped", 41), "В группах (41)");
  assert.equal(tabs.studentTabLabel("ungrouped", 9), "Без группы (9)");
  assert.equal(tabs.studentTabLabel("ungrouped", 0), "Без группы (0)");
  assert.equal(tabs.studentTabLabel("ungrouped", null), "Без группы");
});

test("the subtitle is the sum of both tabs (the dashboard's «Всего учеников»), with proper Russian plurals", () => {
  assert.equal(tabs.studentsSubtitle({ grouped: 41, ungrouped: 9 }, "grouped", 41, false), "50 учеников");
  assert.equal(tabs.studentsSubtitle({ grouped: 3, ungrouped: 0 }, "ungrouped", 0, false), "3 ученика");
  assert.equal(tabs.studentsSubtitle({ grouped: 10, ungrouped: 11 }, "grouped", 10, false), "21 ученик");
  assert.equal(tabs.studentsSubtitle({ grouped: 41, ungrouped: null }, "grouped", 41, false), "41 ученик");
  assert.equal(tabs.studentsSubtitle({ grouped: 5, ungrouped: 9 }, "grouped", 5, true), "5 учеников"); // a chosen group: its own size
  assert.equal(tabs.studentsSubtitle({ grouped: 0, ungrouped: 0 }, "grouped", 0, false), "");
  assert.deepEqual([1, 2, 5, 11, 12, 14, 21, 22, 25, 111, 112].map((n) => tabs.studentsPlural(n)),
    ["1 ученик", "2 ученика", "5 учеников", "11 учеников", "12 учеников", "14 учеников", "21 ученик", "22 ученика", "25 учеников", "111 учеников", "112 учеников"]);
});

test("the list uses the tabs, no longer hides students without a group, and is guarded against slow answers", () => {
  const list = read("components/students/students-list-view.tsx");
  assert.doesNotMatch(list, /has_primary_group/);
  assert.match(list, /\.\.\.studentTabQuery\(activeTab, search\)/);
  assert.match(list, /role="tablist"/);
  assert.match(list, /studentTabLabel\(value, counts\[value\]\)/);
  assert.match(list, /const activeTab: StudentTab = filterGroup \? "grouped" : tab;/); // a chosen group means «in a group»
  assert.match(list, /const token = listSeq\.next\(\);/);
  assert.equal((list.match(/if \(!listSeq\.isCurrent\(token\)\) return;/g) || []).length, 2); // success and failure
  assert.match(list, /if \(listSeq\.isCurrent\(token\)\) \{ setLoading\(false\); setRefreshing\(false\); \}/);
  assert.match(list, /Без группы<\/span>/);
  assert.match(list, /studentGroupId\(s\)/);                       // the group column follows the memberships
});

test("a tab, search or page change hides the old rows at once and an error never leaves them on screen", () => {
  const list = read("components/students/students-list-view.tsx");
  const load = list.slice(list.indexOf("const loadStudents"), list.indexOf("const loadAll"));
  // loading starts: spinner instead of rows, old error cleared
  assert.match(load, /setRefreshing\(true\);\s*setListError\(null\);/);
  assert.match(list, /\{showStudents && refreshing \? \(/);
  // the failure branch empties the rows, the totals and the counts, and says so
  const failure = load.slice(load.indexOf("} catch (e)"), load.indexOf("} finally"));
  assert.match(failure, /if \(!listSeq\.isCurrent\(token\)\) return;/);
  assert.match(failure, /setStudents\(\[\]\);\s*setTotal\(0\);\s*setCounts\(\{ grouped: null, ungrouped: null, archived: null \}\);/);
  assert.match(failure, /setListError\("Не удалось загрузить список учеников"\)/);
  assert.match(list, /showStudents && listError \? \(/);
  assert.match(list, /role="alert"/);
  // a stale answer neither clears the spinner nor shows rows
  assert.match(load, /if \(listSeq\.isCurrent\(token\)\) \{ setLoading\(false\); setRefreshing\(false\); \}/);
});

// ---- 3. owner dashboard: leaders and risk never share a group ------------------------------------

const g = (id, theta, extra = {}) => ({ group_id: id, name: `Группа ${id}`, avg_theta: theta, diagnosed_count: 5, ...extra });
const idsOf = (list) => list.map((x) => x.group_id);

test("leaders are above the centre average, risk is below −0.5, the lists never share a group", () => {
  const groups = [g("a", 1.2), g("b", 0.6), g("c", 0.1), g("d", -0.2), g("e", -0.8), g("f", -1.4), g("n", null)];
  const r = overview.splitDashboardGroups(groups, 0);
  assert.deepEqual(idsOf(r.leaders), ["a", "b", "c"]);       // above 0, best first, three at most
  assert.deepEqual(idsOf(r.risk), ["f", "e"]);                // below −0.5, weakest first
  assert.equal(r.withData, 6);
  assert.equal(r.comparable, true);
  assert.equal(idsOf(r.leaders).filter((id) => idsOf(r.risk).includes(id)).length, 0);
});

test("the same group is never a leader and at risk, whatever the centre average is", () => {
  // all groups below grade: the best of them is above the average but is not called a leader
  const low = [g("a", -0.6), g("b", -1.0), g("c", -1.8)];
  const r = overview.splitDashboardGroups(low, -1.1);
  assert.deepEqual(idsOf(r.leaders), []);
  assert.deepEqual(idsOf(r.risk), ["c", "b", "a"]);
  // the old bug: two groups, both weak, both listed twice
  const two = overview.splitDashboardGroups([g("x", -0.7), g("y", -0.9)], -0.8);
  assert.deepEqual(idsOf(two.leaders), []);
  assert.deepEqual(idsOf(two.risk), ["y", "x"]);
  // strictly above: a group exactly on the average is not a leader
  assert.deepEqual(idsOf(overview.splitDashboardGroups([g("p", 0.3), g("q", 0.3)], 0.3).leaders), []);
  // many strong groups: three leaders, no risk
  const strong = overview.splitDashboardGroups([g("a", 2), g("b", 1.9), g("c", 1.8), g("d", 1.7), g("e", 0.1)], 1.0);
  assert.deepEqual(idsOf(strong.leaders), ["a", "b", "c"]);
  assert.deepEqual(idsOf(strong.risk), []);
});

test("no random set of groups puts one group in both lists", () => {
  let seed = 20261015;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (let round = 0; round < 500; round++) {
    const n = Math.floor(rnd() * 9);
    const groups = Array.from({ length: n }, (_, i) => g(`g${i}`, rnd() < 0.15 ? null : Math.round((rnd() * 5 - 2.5) * 100) / 100));
    const centre = rnd() < 0.2 ? null : rnd() * 4 - 2;
    const r = overview.splitDashboardGroups(groups, centre);
    const leaderIds = new Set(idsOf(r.leaders));
    for (const id of idsOf(r.risk)) assert.equal(leaderIds.has(id), false, `round ${round}: ${id} in both`);
    assert.ok(r.leaders.length <= 3 && r.risk.length <= 3);
    assert.equal(new Set(idsOf(r.leaders)).size, r.leaders.length);
    assert.equal(new Set(idsOf(r.risk)).size, r.risk.length);
    for (const l of r.leaders) assert.ok(l.avg_theta >= -0.5, "a below-grade group is not a leader");
    for (const k of r.risk) assert.ok(k.avg_theta < -0.5);
  }
});

test("θ that reads the same is never split: groups are compared at the printed two decimals", () => {
  assert.equal(overview.roundTheta(0.304), 0.3);
  assert.equal(overview.roundTheta(-0.0004), 0);
  assert.equal(Object.is(overview.roundTheta(-0.0004), -0), false);
  // identical θ: nobody is above the average, so nobody leads; all are on the same side of the risk line
  const same = overview.splitDashboardGroups([g("a", 0.3), g("b", 0.3), g("c", 0.3)], 0.3);
  assert.deepEqual([idsOf(same.leaders), idsOf(same.risk)], [[], []]);
  // 0.3004 and 0.2996 both read «0.30»: neither is above a centre that reads «0.30»
  const hidden = overview.splitDashboardGroups([g("a", 0.3004), g("b", 0.2996), g("c", -1)], 0.3);
  assert.deepEqual([idsOf(hidden.leaders), idsOf(hidden.risk)], [[], ["c"]]);
  // a hidden third decimal does not make one of two equal-looking weak groups «more at risk» to the sort
  const weak = overview.splitDashboardGroups([g("b", -0.6004), g("a", -0.5996)], -0.6);
  assert.deepEqual(idsOf(weak.risk), ["a", "b"]);                         // both read -0.60: by name, not by 4th digit
  // the line itself: -0.5004 reads «-0.50», which is not below -0.5
  assert.deepEqual(idsOf(overview.splitDashboardGroups([g("x", -0.5004), g("y", 1)], 0).risk), []);
  assert.deepEqual(idsOf(overview.splitDashboardGroups([g("x", -0.506), g("y", 1)], 0).risk), ["x"]);
  // a centre that reads +0.30 and a group that reads +0.30 stay together
  assert.deepEqual(idsOf(overview.splitDashboardGroups([g("a", 0.2996), g("b", -2)], 0.3004).leaders), []);
});

test("fewer than two groups with data: no leaders, a lone weak group is still named", () => {
  assert.deepEqual(overview.splitDashboardGroups([], null), { leaders: [], risk: [], withData: 0, comparable: false });
  assert.deepEqual(overview.splitDashboardGroups([g("n", null), g("m", null)], null), { leaders: [], risk: [], withData: 0, comparable: false });
  const one = overview.splitDashboardGroups([g("a", 0.9), g("n", null)], 0.9);
  assert.deepEqual([idsOf(one.leaders), idsOf(one.risk), one.withData, one.comparable], [[], [], 1, false]);
  const weak = overview.splitDashboardGroups([g("a", -1.2)], -1.2);
  assert.deepEqual([idsOf(weak.leaders), idsOf(weak.risk), weak.comparable], [[], ["a"], false]);
});

test("without a server θ the average of the groups is used; NaN and missing θ are ignored", () => {
  const r = overview.splitDashboardGroups([g("a", 1), g("b", 0), g("c", -1), g("d", Number.NaN), g("e", undefined)], null);
  assert.deepEqual(idsOf(r.leaders), ["a"]);   // average 0
  assert.deepEqual(idsOf(r.risk), ["c"]);
  assert.equal(r.withData, 3);
});

test("the dashboard uses the split and says why a list is empty", () => {
  const page = read("app/owner/dashboard/page.tsx");
  assert.match(page, /splitDashboardGroups\(groups, globalTheta\)/);
  assert.doesNotMatch(page, /sortedGroups/);
  assert.match(page, /Мало данных для сравнения/);
  assert.match(page, /Нет отстающих групп\. Отлично!/);
});

// ---- 4. «⋯» buttons name their row ----------------------------------------------------------------

test("every row menu of the N13 screens carries a row-specific label", () => {
  assert.match(read("components/attendance/excuses-page.tsx"), /<RowMenu items=\{menuFor\(item\)\} label=\{`Действия: \$\{item\.student\.full_name\}`\}/);
  assert.match(read("components/payments/payments-page.tsx"), /<RowMenu items=\{menu\} label=\{`Действия: \$\{row\.student_name\}`\} \/>/);
  assert.match(read("components/payments/membership-payments.tsx"), /label=\{`Действия с оплатой от \$\{formatDateRu\(payment\.paid_on\)\}`\}/);
  assert.match(read("components/groups/group-student-table.tsx"), /label=\{`Действия: \$\{s\.full_name/);
  assert.match(read("components/attendance/open-lessons-view.tsx"), /label=\{`Действия: \$\{item\.groupName\}, /);
  assert.match(read("components/payroll/payroll-month-page.tsx"), /label=\{`Действия: \$\{teacher\.teacher_name\}`\}/);
  assert.match(read("components/students/student-profile-view.tsx"), /label=\{`Действия: \$\{student\.full_name\}`\}/);
  assert.match(read("components/payments/group-prices-page.tsx"), /<RowMenu items=\{menu\} label=\{`Действия: \$\{item\.name\}`\} \/>/);
  // all eight files that use <RowMenu> are listed above
  const users = fs.readdirSync(src("components"), { recursive: true }).filter((f) => /\.tsx$/.test(f) && !/row-menu\.tsx$/.test(f))
    .filter((f) => read(`components/${f}`).includes("<RowMenu")).map((f) => f.replace(/\\/g, "/")).sort();
  assert.deepEqual(users, [
    "attendance/excuses-page.tsx", "attendance/open-lessons-view.tsx", "groups/group-student-table.tsx",
    "payments/group-prices-page.tsx", "payments/membership-payments.tsx", "payments/payments-page.tsx", "payroll/payroll-month-page.tsx",
    "students/student-profile-view.tsx",
  ]);
});
