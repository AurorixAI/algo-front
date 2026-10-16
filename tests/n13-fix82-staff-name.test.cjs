// N13 carry-over #82: staff are shown as «Имя Фамилия» everywhere (students stay «Фамилия Имя»).
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
const src = (p) => path.join(root, "src", p);
const read = (p) => fs.readFileSync(src(p), "utf8");

const { staffDisplayName } = require(src("lib/staff-name.ts"));

// ---- #82 staff name order -----------------------------------------------------------------------

test("a staff member is «Имя Фамилия»: first + last win over the server's «Фамилия Имя» full_name", () => {
  assert.equal(staffDisplayName({ first_name: "Дилноза", last_name: "Каримова", full_name: "Каримова Дилноза" }), "Дилноза Каримова");
  assert.equal(staffDisplayName({ first_name: "Arslan", last_name: "Djemilov", full_name: "Djemilov Arslan" }), "Arslan Djemilov");
  // the server adds a patronymic to full_name: it never reaches the screen while first/last are known
  assert.equal(staffDisplayName({ first_name: "Дилноза", last_name: "Каримова", full_name: "Каримова Дилноза Бахтиёровна" }), "Дилноза Каримова");
});

test("a partial or blank record still gives a clean line; full_name is the last fallback and is never split", () => {
  assert.equal(staffDisplayName({ first_name: "  Дилноза ", last_name: " Каримова  " }), "Дилноза Каримова");
  assert.equal(staffDisplayName({ first_name: "Дилноза", last_name: "" }), "Дилноза");
  assert.equal(staffDisplayName({ first_name: null, last_name: "Каримова" }), "Каримова");
  assert.equal(staffDisplayName({ first_name: "", last_name: "", full_name: "Каримова   Дилноза" }), "Каримова Дилноза"); // as the server wrote it
  assert.equal(staffDisplayName({ full_name: "Каримова Дилноза" }), "Каримова Дилноза");
  assert.equal(staffDisplayName({}), "");
  assert.equal(staffDisplayName(null), "");
  assert.equal(staffDisplayName(undefined, "Преподаватель"), "Преподаватель");
  assert.equal(staffDisplayName({ first_name: " ", last_name: " ", full_name: " " }, "Без имени"), "Без имени");
});

test("the team page and every staff-name render go through staffDisplayName, never the server's full_name", () => {
  const team = read("app/owner/teachers/page.tsx");
  assert.match(team, /import \{ staffDisplayName \} from "@\/lib\/staff-name"/);
  assert.match(team, /staffDisplayName\(m, "Без имени"\)/);
  assert.doesNotMatch(team, /m\.full_name \|\|/, "the team list must not prefer the server's «Фамилия Имя»");

  const renders = [
    "app/owner/teachers/page.tsx", "app/owner/groups/[id]/page.tsx", "app/admin/groups/[id]/page.tsx", "app/admin/groups/page.tsx",
    "components/layout/sidebar.tsx", "components/ui/cascading-filter.tsx", "components/groups/assign-group-modal.tsx",
    "components/groups/group-create-modal.tsx", "app/teacher/dashboard/page.tsx", "app/teacher/exams/new/page.tsx",
  ];
  for (const file of renders) {
    const text = read(file);
    assert.match(text, /staffDisplayName\(/, `${file} uses the helper`);
    assert.match(text, /from "@\/lib\/staff-name"/, `${file} imports it`);
    // no staff render may prefer the server full_name or print first+last by hand any more
    assert.doesNotMatch(text, /(?:teacher|m|user)\??\.full_name \|\|/, `${file}: no «full_name ||» staff render`);
  }
  // the dashboard greeting and the profile header (sidebar)
  assert.match(read("app/teacher/dashboard/page.tsx"), /const displayName = staffDisplayName\(user, "Преподаватель"\)/);
  assert.match(read("components/layout/sidebar.tsx"), /const displayName = staffDisplayName\(user, displayRole\)/);
  // the member lists of the filters / groups no longer cut full_name into first and last by spaces
  for (const file of ["components/attendance/excuses-page.tsx", "components/payments/payments-page.tsx", "app/owner/groups/page.tsx"]) {
    assert.doesNotMatch(read(file), /full_name[^\n]*\.split\(/, `${file}: full_name is never split`);
  }
  assert.match(read("components/ui/cascading-filter.tsx"), /\{staffDisplayName\(teacher\)\}/);
});

test("students keep «Фамилия Имя»: the student renders were not touched", () => {
  for (const file of ["components/students/students-list-view.tsx", "components/groups/group-student-table.tsx", "components/students/student-profile-view.tsx"]) {
    assert.doesNotMatch(read(file), /staffDisplayName/, file);
  }
  assert.match(read("components/students/students-list-view.tsx"), /s\.full_name \|\| `\$\{s\.last_name\} \$\{s\.first_name\}`/);
});
