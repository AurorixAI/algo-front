// N13 P1.4 - strict exam entry form, the owner «Ученики» menu and the add-student drawer pool.
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
const entry = require(src("lib/exam-entry.ts"));
const pool = require(src("lib/student-pool.ts"));

// ---- 1. exam entry: full name (two words) or an ID ---------------------------

test("the button needs a full name or an ID, never a single word", () => {
  assert.equal(entry.canSubmitIdentity("", ""), false);
  assert.equal(entry.canSubmitIdentity("   ", "  "), false);
  assert.equal(entry.canSubmitIdentity("Алия", ""), false);
  assert.equal(entry.canSubmitIdentity("  Алия  ", ""), false);
  assert.equal(entry.canSubmitIdentity("Алия Каримова", ""), true);
  assert.equal(entry.canSubmitIdentity("  Каримова   Алия ", ""), true);
  assert.equal(entry.canSubmitIdentity("", "TE-031"), true);
  assert.equal(entry.canSubmitIdentity("", " 31 "), true);
  assert.equal(entry.canSubmitIdentity("Алия", "31"), true); // the ID decides, the name is only checked against it
});

test("the ID placeholder is generic: no centre prefix is hard-coded or invented", () => {
  assert.equal(entry.ID_PLACEHOLDER, "ID из карточки ученика");
  assert.equal(entry.idPlaceholder, undefined);
  assert.doesNotMatch(read("lib/exam-entry.ts"), /TE-|AL-|NC/);
  assert.doesNotMatch(read("app/e/[code]/page.tsx"), /student_id_prefix|idPlaceholder/);
});

test("start request: an ID-only entry never goes out with an empty name", () => {
  const confirmed = { name: "Рахимов Тимур", display_id: "TE-031" };
  // the pre-check confirmed the student: canonical name and ID, whatever was typed
  assert.deepEqual(entry.startIdentity({ name: "", id: "31" }, confirmed), {
    student_name: "Рахимов Тимур", student_id: "TE-031", display_id: "TE-031",
  });
  assert.deepEqual(entry.startIdentity({ name: " Тимур Рахимов ", id: "" }, confirmed), {
    student_name: "Рахимов Тимур", student_id: "TE-031", display_id: "TE-031",
  });
  // confirmed without an ID (a student who has none): the name only
  assert.deepEqual(entry.startIdentity({ name: "тимур рахимов", id: "" }, { name: "Рахимов Тимур", display_id: null }), {
    student_name: "Рахимов Тимур", student_id: undefined, display_id: undefined,
  });
  // the pre-check could not run (network error): the typed ID stands in for the name, never ""
  const offline = entry.startIdentity({ name: "", id: " TE-031 " }, null);
  assert.deepEqual(offline, { student_name: "TE-031", student_id: "TE-031", display_id: "TE-031" });
  assert.deepEqual(entry.startIdentity({ name: "Тимур Рахимов", id: "" }, undefined), {
    student_name: "Тимур Рахимов", student_id: undefined, display_id: undefined,
  });
  for (const typed of [{ name: "", id: "31" }, { name: "Тимур Рахимов", id: "" }, { name: "", id: "TE-031" }]) {
    for (const c of [null, undefined, confirmed, { name: "", display_id: "TE-031" }]) {
      assert.ok(entry.startIdentity(typed, c).student_name.length > 0, JSON.stringify([typed, c]));
    }
  }
});

test("the lobby path starts with the confirmed student passed as an argument, not stale state", () => {
  const page = read("app/e/[code]/page.tsx");
  assert.match(page, /const executeStartExam = async \(confirmed\?: ConfirmedStudent \| null\) =>/);
  assert.match(page, /executeStartExam\(confirmed\);/);
  assert.match(page, /onClick=\{\(\) => executeStartExam\(\)\}/); // the click event is not an argument
  assert.match(page, /startIdentity\(\{ name: studentName, id: studentId \}, confirmed \?\? confirmedStudent\)/);
  assert.match(page, /examsApi\.startSession\(code, identity\)/);
});

test("the exam page labels, hint and submit rule", () => {
  const page = read("app/e/[code]/page.tsx");
  assert.match(page, /label="Имя и фамилия"/);
  assert.match(page, /label="ID ученика"/);
  assert.match(page, /placeholder=\{ID_PLACEHOLDER\}/);
  assert.match(page, /\{IDENTITY_HINT\}/);
  assert.equal(entry.IDENTITY_HINT, "Введите имя и фамилию полностью или ID из карточки ученика");
  assert.match(page, /disabled=\{!canSubmitIdentity\(studentName, studentId\) \|\| phase === "starting"\}/);
  assert.match(page, /if \(!canSubmitIdentity\(sName, sId\)\) return;/);
  // the server message is shown as is
  assert.match(page, /check\.message \|\|/);
  // the old loose labels and the hard-coded centre prefix are gone
  assert.doesNotMatch(page, /если есть|Ваше имя или ФИО|AL-00123/);
});

// ---- 2. owner menu «Ученики» -----------------------------------------------

test("the owner menu has «Ученики» right after «Группы»; admin and teacher menus are unchanged", () => {
  const sidebar = read("components/layout/sidebar.tsx");
  const owner = sidebar.slice(sidebar.indexOf("const ownerNav"), sidebar.indexOf("const teacherNav"));
  const groups = owner.indexOf('href: "/owner/groups"');
  const students = owner.indexOf('{ href: "/owner/students", label: "Ученики", icon: GraduationCap }');
  assert.ok(groups > 0 && students > groups, "owner: «Ученики» follows «Группы»");
  assert.ok(students < owner.indexOf('href: "/owner/attendance"'), "owner: «Ученики» sits before attendance");
  const admin = sidebar.slice(sidebar.indexOf("const adminNav"), sidebar.indexOf("const ownerNav"));
  assert.match(admin, /\{ href: "\/admin\/students", label: "Ученики", icon: GraduationCap \}/);
  assert.equal((admin.match(/label: "Ученики"/g) || []).length, 1);
  // the highlight covers the list and every student card under it
  assert.match(sidebar, /pathname === item\.href \|\| pathname\.startsWith\(item\.href \+ "\/"\)/);
});

test("owner student routes render the shared components and keep links in the owner workspace", () => {
  assert.match(read("app/owner/students/page.tsx"), /<StudentsListView workspace="owner" \/>/);
  assert.match(read("app/admin/students/page.tsx"), /<StudentsListView workspace="admin" \/>/);
  assert.match(read("app/owner/students/[id]/page.tsx"), /<StudentProfileView \/>/);
  const list = read("components/students/students-list-view.tsx");
  assert.match(list, /href=\{`\$\{base\}\/students\/\$\{s\.id\}`\}/);
  assert.match(list, /href=\{`\$\{base\}\/groups\/\$\{group\.id\}`\}/);
  assert.doesNotMatch(list, /`\/admin\/(students|groups)/);
  const profile = read("components/students/student-profile-view.tsx");
  assert.match(profile, /isOwnerPath \? "\/owner\/groups"/);
  assert.match(profile, /isOwnerPath \? "\/owner\/students"/);
  // owner pages open the student card under /owner/students
  for (const file of ["app/owner/groups/[id]/page.tsx", "app/owner/payments/page.tsx", "app/owner/attendance/page.tsx"]) {
    const text = read(file);
    assert.match(text, /\/owner\/students/, file);
    assert.doesNotMatch(text, /\/admin\/students/, file);
  }
  assert.match(read("app/owner/groups/[id]/page.tsx"), /studentBasePath="\/owner\/students"/);
});

// ---- 3. add-student drawer ---------------------------------------------------

test("the drawer asks for the group's class by default, «Все классы» drops it, archived never", () => {
  const base = { search: "", groupClassLevel: 9, allClasses: false };
  assert.deepEqual(pool.studentPoolQuery(base), { search: undefined, class_level: 9, exclude_status: "archived", limit: 500 });
  assert.equal(pool.studentPoolQuery({ ...base, allClasses: true }).class_level, undefined);
  assert.equal(pool.studentPoolQuery({ ...base, allClasses: true }).exclude_status, "archived");
  assert.equal(pool.studentPoolQuery({ ...base, search: "али" }).search, "али");
  assert.equal(pool.studentPoolQuery({ ...base, groupClassLevel: null }).class_level, undefined); // a group without a class
});

test("archived and already enrolled students are not offered, even from an older server", () => {
  const list = [
    { id: "a", status: "active" }, { id: "b", status: "archived" }, { id: "c", status: "new" }, { id: "d", status: "diagnosed" },
  ];
  assert.deepEqual(pool.availableStudents(list, new Set(["d"])).map((s) => s.id), ["a", "c"]);
});

test("a slow answer for an old filter cannot replace the current list", () => {
  const drawer = read("components/groups/add-student-drawer.tsx");
  assert.match(drawer, /import \{ createRequestSequence \} from "@\/lib\/request-sequence"/);
  const load = drawer.slice(drawer.indexOf("const loadStudents"), drawer.indexOf("useEffect(() => {\n    if (open) loadStudents();"));
  assert.match(load, /const token = listSeq\.next\(\);/);
  assert.equal((load.match(/if \(!listSeq\.isCurrent\(token\)\) return;/g) || []).length, 2); // success and failure
  assert.match(load, /if \(listSeq\.isCurrent\(token\)\) setLoading\(false\)/);
  // the guard itself: the older of two overlapping loads is dropped
  const { createRequestSequence } = require(src("lib/request-sequence.ts"));
  const seq = createRequestSequence();
  const first = seq.next(), second = seq.next();
  assert.equal(seq.isCurrent(first), false);
  assert.equal(seq.isCurrent(second), true);
});

test("the drawer shows the quiet «Все классы» switch only for a group with a class and keeps the rest", () => {
  const drawer = read("components/groups/add-student-drawer.tsx");
  assert.match(drawer, /studentPoolQuery\(\{ search: debouncedSearch, groupClassLevel, allClasses \}\)/);
  assert.match(drawer, /availableStudents\(students, existingStudentIds\)/);
  assert.match(drawer, /\{groupClassLevel \? \(/);
  assert.match(drawer, /role="switch"/);
  assert.match(drawer, /Все классы\n/);
  assert.match(drawer, /setAllClasses\(false\);/); // the default is restored on every opening
  // transfer / add-more behaviour and the picked students survive a class switch
  assert.match(drawer, /\["transfer", "Перевести сюда"\]/);
  assert.match(drawer, /\["add", "Добавить ещё и в эту группу"\]/);
  assert.match(drawer, /Array\.from\(selected\.values\(\)\)\s*\.filter\(\(s\) => s\.group_id && s\.group_id !== groupId\)/);
  assert.match(drawer, /bulkAddStudents\(groupId, Array\.from\(selected\.keys\(\)\)/);
});
