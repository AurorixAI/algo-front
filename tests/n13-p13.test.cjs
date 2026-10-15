// N13 P1.3 - teacher acceptance fixes: the next-action card, lesson panel errors,
// the "my students" counter and the wrong-workspace redirect.
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
const src = (p) => path.join(__dirname, "..", "src", p);
const read = (p) => fs.readFileSync(src(p), "utf8");
const actions = require(src("lib/lesson-actions.ts"));
const roles = require(src("lib/role-home.ts"));

// ---- 1. the card and the list open an action the same way -------------------

const lesson = { id: "s6", groupId: "g1" };
const missed = { actionType: "missed", lessonId: "s6", lessonDate: "2026-09-05" };

test("a missed lesson opens the reconciliation dialog, never the lesson panel", () => {
  const target = actions.lessonActionTarget({ lesson, actionType: "missed", sourceAction: missed });
  assert.deepEqual(target, { kind: "reconcile", source: missed });
});

test("every other action opens the lesson panel", () => {
  const started = { actionType: "in_progress", lessonId: "s6" };
  assert.deepEqual(actions.lessonActionTarget({ lesson, actionType: "in_progress", sourceAction: started }), { kind: "lesson", lesson });
  assert.deepEqual(actions.lessonActionTarget({ lesson }), { kind: "lesson", lesson }); // today's scheduled lesson
  // no source record to reconcile: fall back to the panel rather than open an empty dialog
  assert.deepEqual(actions.lessonActionTarget({ lesson, actionType: "missed" }), { kind: "lesson", lesson });
});

test("the dashboard card and the action centre both go through openLessonAction", () => {
  const page = read("app/teacher/dashboard/page.tsx");
  assert.match(page, /onClick=\{\(\) => openLessonAction\(primaryLessonAction\)\}/);
  assert.match(page, /setIsActionCenterOpen\(false\);\s*openLessonAction\(action\);/);
  assert.doesNotMatch(page, /setActiveLesson\(primaryLessonAction/);
  // the reconciliation dialog is opened from the helper only (plus the panel's own button, via the helper)
  const opens = page.match(/setMissedLessonAction\((?!null)/g) || [];
  assert.equal(opens.length, 1, "one place opens the reconciliation dialog");
  assert.match(page, /lessonActionTarget\(action\)/);
});

// ---- 1b. a lesson starts on its own day only ---------------------------------

test("the lesson date decides what the panel may offer", () => {
  assert.equal(actions.lessonDateRelation("2026-09-05", "2026-10-15"), "past");
  assert.equal(actions.lessonDateRelation("2026-10-15", "2026-10-15"), "today");
  assert.equal(actions.lessonDateRelation("2026-10-16", "2026-10-15"), "future");
  assert.equal(actions.startBlockedReason("today"), null);
  assert.match(actions.startBlockedReason("past"), /только в день его проведения/);
  assert.match(actions.startBlockedReason("future"), /ещё не наступил/);
});

test("the panel never says 'the lesson started' before it was started, and has a branch for past days", () => {
  for (const file of ["app/teacher/dashboard/page.tsx", "app/teacher/schedule/page.tsx"]) {
    assert.doesNotMatch(read(file), /Урок начался!/, file);
  }
  const page = read("app/teacher/dashboard/page.tsx");
  const past = page.indexOf('activeLessonRelation === "past" ? (');
  const startButton = page.indexOf("onClick={handleStartLesson}");
  assert.ok(past > 0 && startButton > past, "the past-day branch comes before any start button");
  assert.match(page, /startBlockedReason\(lessonDateRelation\(/); // the handler refuses locally too
});

// ---- 1c. no silent failures ---------------------------------------------------

test("a failed request shows the server's message", () => {
  assert.equal(actions.serverErrorMessage(new Error("Начать урок можно только в день его проведения"), "x"), "Начать урок можно только в день его проведения");
  assert.equal(actions.serverErrorMessage(new Error("   "), "Не удалось начать урок."), "Не удалось начать урок.");
  assert.equal(actions.serverErrorMessage("boom", "fallback"), "fallback");
  assert.equal(actions.serverErrorMessage(undefined, "fallback"), "fallback");
});

test("the error is rendered outside the marking list on both lesson panels", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { LessonPanelError } = require(src("components/attendance/lesson-panel-error.tsx"));
  const html = renderToStaticMarkup(React.createElement(LessonPanelError, { message: "Начать урок можно только в день его проведения" }));
  assert.match(html, /role="alert"/);
  assert.match(html, /Начать урок можно только в день его проведения/);
  assert.equal(renderToStaticMarkup(React.createElement(LessonPanelError, { message: null })), "");

  for (const file of ["app/teacher/dashboard/page.tsx", "app/teacher/schedule/page.tsx"]) {
    const page = read(file);
    assert.match(page, /\{!isMarkingAttendance && <LessonPanelError message=\{attendanceError\} \/>\}/, file);
    // start / finish / cancel keep the server text instead of a canned sentence
    assert.match(page, /serverErrorMessage\(err, "Не удалось отменить урок/, file);
    assert.match(page, /serverErrorMessage\(err, "Не удалось завершить урок/, file);
  }
  assert.match(read("app/teacher/dashboard/page.tsx"), /serverErrorMessage\(err, "Не удалось начать урок/);
});

// ---- 2. "my students" counts people ------------------------------------------

test("the dashboard takes the distinct student count from the server", () => {
  const page = read("app/teacher/dashboard/page.tsx");
  assert.match(page, /typeof summary\.studentCount === "number"/);
  assert.match(read("lib/api.ts"), /studentCount\?: number;/);
  // no remaining client-side sum of per-group rosters presented as a headline total
  for (const file of ["app/owner/groups/page.tsx", "app/admin/groups/page.tsx"]) {
    assert.doesNotMatch(read(file), /totalStudents/, file);
  }
});

// ---- 3. a wrong workspace sends the user to their own home -------------------

test("one role -> home table, shared by sign-in and the guards", () => {
  assert.deepEqual(roles.ROLE_HOME, { owner: "/owner/dashboard", admin: "/admin/diagnostics", teacher: "/teacher/dashboard" });
  assert.equal(roles.loginHome("teacher"), "/teacher/dashboard");
  assert.equal(roles.loginHome("nobody"), "/admin/diagnostics"); // sign-in default, unchanged
  assert.equal(roles.loginHome(undefined), "/admin/diagnostics");
  assert.equal(roles.roleHome("superadmin"), null);
  assert.equal(roles.roleHome("constructor"), null); // not a prototype lookup
  assert.doesNotMatch(read("app/login/page.tsx"), /ROLE_DASHBOARD/);
  assert.doesNotMatch(read("app/change-password/page.tsx"), /ROLE_DASHBOARD/);
  assert.match(read("components/auth/AuthGuard.tsx"), /forbiddenTarget\(/);
});

test("a teacher opening an owner/admin URL lands on the teacher dashboard, not the landing page", () => {
  const forbidden = (orgRole, accountRole, extra = {}) =>
    roles.forbiddenTarget({ orgRole, accountRole }, { forbiddenPath: "/", ...extra });
  assert.equal(forbidden("teacher", "teacher"), "/teacher/dashboard");
  assert.equal(forbidden("teacher", "teacher", { currentPath: "/owner/payments" }), "/teacher/dashboard");
  assert.equal(forbidden("admin", "admin"), "/admin/diagnostics");
  assert.equal(forbidden("owner", "owner"), "/owner/dashboard");
  assert.equal(forbidden(undefined, "teacher"), "/teacher/dashboard"); // account role when there is no org role
  assert.equal(forbidden("teacher", "superadmin"), "/teacher/dashboard"); // the org role wins
});

test("a role without a home, or a loop, falls back to the configured path", () => {
  const forbidden = (orgRole, accountRole, extra = {}) =>
    roles.forbiddenTarget({ orgRole, accountRole }, { forbiddenPath: "/", ...extra });
  assert.equal(forbidden(undefined, "superadmin"), "/");
  assert.equal(forbidden(null, null), "/");
  // never "redirect" onto the page that just refused the user
  assert.equal(forbidden("teacher", "teacher", { currentPath: "/teacher/dashboard" }), "/");
  assert.equal(forbidden("teacher", "teacher", { currentPath: "/teacher/dashboard/x" }), "/");
  // an explicit per-role override still wins
  assert.equal(forbidden("admin", "admin", { forbiddenRolePaths: { admin: "/admin/dashboard" } }), "/admin/dashboard");
});

test("the three layouts keep their allowed roles; the teacher layout has no per-role override of the login table", () => {
  assert.match(read("app/owner/layout.tsx"), /allowedRoles=\{\["owner", "admin"\]\}/);
  assert.match(read("app/admin/layout.tsx"), /allowedRoles=\{\["admin", "owner"\]\}/);
  assert.match(read("app/teacher/layout.tsx"), /allowedRoles=\{\["teacher"\]\}/);
  assert.doesNotMatch(read("app/teacher/layout.tsx"), /forbiddenRolePaths/);
});
