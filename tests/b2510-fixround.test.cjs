// PAY-F (payments): the forecast of a package, «Выходной день центра», the recalculation for the lessons the centre cancelled, the names of the ways to count.
// Spec: artifacts/payf/PAY_F_SPEC.md (parts 1-4, scenarios 1-17); the server side is tested in auth-service (tests/test_payf_*.py).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const compile = (jsx) => (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText, filename);
};
require.extensions[".ts"] = compile(false);
require.extensions[".tsx"] = compile(true);
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const W = require(path.join(root, "src/lib/weekly-lessons.ts"));
const LT = require(path.join(root, "src/lib/lesson-teacher.ts"));
const F = require(path.join(root, "src/lib/payf.ts"));
const S = require(path.join(root, "src/lib/substitutions.ts"));
const API = read("src/lib/api.ts");

test("[2] the dialog «Преподаватель урока»: the role of everybody, the list scrolls inside its box, the reason is always in the window, a missing reason takes the cursor", () => {
  assert.equal(LT.roleLabel("owner"), "Владелец");
  assert.equal(LT.roleLabel("admin"), "Администратор");
  assert.equal(LT.roleLabel("teacher"), "Преподаватель");
  assert.equal(LT.roleLabel(undefined), "Преподаватель");
  const dialog = read("src/components/groups/lesson-teacher-dialog.tsx");
  assert.match(dialog, /max-h-\[min\(40vh,20rem\)\][^"]*overflow-y-auto/);                                      // the list has its own scroll, the reason stands under it
  assert.match(dialog, /roleLabel\(candidate\.orgRole\)/);
  assert.match(dialog, /if \(problem\) \{ reasonRef\.current\?\.focus\(\)/);                                    // «Вернуть преподавателя группы» without a reason says it, not silence
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { LessonTeacherBody } = require(path.join(root, "src/components/groups/lesson-teacher-dialog.tsx"));
  const list = { lessonId: "l", lessonDate: "2026-11-04", startTime: "10:00", endTime: "11:00", currentTeacherId: "t1", defaultTeacherId: "t1",
    candidates: [{ teacherId: "t1", name: "Иванов И.", orgRole: "teacher" }, { teacherId: "t2", name: "Иванов И.", orgRole: "owner" }, { teacherId: "t3", name: "Каримова Н.", orgRole: "admin" }] };
  const html = renderToStaticMarkup(React.createElement(LessonTeacherBody, { list, loadError: null, current: "t1", pick: null, reason: "", reasonProblem: "Укажите причину — не менее 3 символов", busy: false, error: null, onPick() {}, onReason() {}, onRetry() {} }));
  for (const word of ["Владелец", "Администратор", "Преподаватель", "Укажите причину — не менее 3 символов"]) assert.ok(html.includes(word), word);
  assert.match(html, /role="alert"[^>]*>Укажите причину/);
});

test("[5] the dry run of a day off: the sentence, then the lessons «группа · дата · время»; the blocked ones apart with the reason", () => {
  assert.equal(F.dayOffSummary({ text: "Будут отменены 4 урока в 4 группах: А, Б, В, Г" }), "Будут отменены 4 урока в 4 группах");
  const dialog = read("src/components/schedule/day-off-dialog.tsx");
  assert.match(dialog, /dayOffSummary\(plan\)/);
  assert.match(dialog, /title="Будут отменены" lessons=\{plan\.cancellable\}/);
  assert.match(dialog, /title="Не будут отменены" lessons=\{plan\.blocked\}/);
  assert.equal(F.dayOffLessonLine({ groupId: "g", groupName: "Группа 3", lessonId: "l", date: "2026-11-04", startTime: "10:00", endTime: "11:00", reason: null }), "Группа 3 · 04.11 · 10:00–11:00");
});

test("[6] the days off: the live ones first, the cancelled and gone by ones apart", () => {
  const day = (id, dateFrom, dateTo, active) => ({ id, dateFrom, dateTo, active, reason: id, createdAt: null, createdByName: null, voidedAt: null });
  const { current, past } = F.splitDaysOff([day("old", "2026-10-01", "2026-10-01", true), day("later", "2026-12-01", "2026-12-01", true), day("soon", "2026-11-03", "2026-11-04", true), day("void", "2026-11-10", "2026-11-10", false), day("today", "2026-10-26", "2026-10-26", true)], "2026-10-26");
  assert.deepEqual(current.map((d) => d.id), ["today", "soon", "later"]);
  assert.deepEqual(past.map((d) => d.id), ["void", "old"]);
  const panel = read("src/components/schedule/days-off-panel.tsx");
  assert.match(panel, /Действующие/);
  assert.match(panel, /Отменённые и прошедшие/);
  assert.match(panel, /<details/);
});

test("[7] the same warning of several weekdays is one line with the days", () => {
  const note = "Кабинет «12» в это время занят группой «Х»";
  assert.deepEqual(W.mergeNotices([{ note, day: 1 }, { note, day: 3 }, { note, day: 5 }], 3), [`${note}: пн, ср, пт`]);
  assert.deepEqual(W.mergeNotices([{ note, day: 5 }, { note, day: 1 }], 3), [`${note}: пн, пт`]);
  assert.deepEqual(W.mergeNotices([{ note, day: 1 }], 1), [note]);                                                  // one weekday: the server's sentence as it is
  assert.deepEqual(W.mergeNotices([{ note, day: 1 }, { note: "Другая", day: 3 }], 3), [`${note}: пн`, "Другая: ср"]);
  assert.deepEqual(W.mergeNotices([], 3), []);
});

test("[8] a receipt of «undefined» asks nothing; a submit of the add dialog is sent once", async () => {
  await assert.rejects(() => require(path.join(root, "src/lib/api.ts")).orgApi.getPaymentReceipt("undefined"), (error) => error.status === 404);
  assert.match(API, /paymentId === "undefined"/);
  assert.match(read("src/components/payments/receipt-view.tsx"), /orgApi\.getPaymentReceipt\(paymentId\)/);       // the view asks through the guarded call
  const dialogs = read("src/components/schedule/weekly-lesson-dialogs.tsx");
  assert.ok((dialogs.match(/if \(busy \|\| sending\.current\) return;/g) || []).length >= 2, "add and edit dialogs hold a ref against a second submit in the same tick");
});

test("[3][4] the words of a taken off / replaced substitution are the same in the owner's journal and in the teacher's list", () => {
  const AT = "2026-10-22T04:30:00";
  const person = (name) => ({ id: name, name });
  const base = { id: "r", origin: "system", trigger: "manager_assign", status: "substituted", teacher: person("Иванов А."), decision: { kind: "substitute", by: person("Каримова Н."), at: AT, substitute: person("Тарасов Т.") } };
  const replaced = { ...base, clearedAt: AT, clearedBy: person("Каримова Н."), clearedTo: person("Сидоров В."), clearedTrigger: "put" };
  assert.equal(S.clearedLine(replaced), "Заменена на Сидоров В. — решил(а) Каримова Н., 22.10 09:30");
  assert.equal(S.teacherStatusLine(replaced).text, S.clearedLine(replaced));
  const removed = { ...base, status: "closed", decision: { ...base.decision, kind: "closed", closedReason: "ASSIGNMENT_CLEARED" } };
  assert.equal(S.decisionResultText(removed), "Замену снял(а) Каримова Н., 22.10 09:30");
  assert.equal(S.teacherStatusLine(removed).text, S.decisionResultText(removed));
  assert.doesNotMatch(S.decisionResultText(removed), /Замена снята: Тарасов/);
});
