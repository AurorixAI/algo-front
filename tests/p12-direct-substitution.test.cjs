// P1.2: every substitution is in the journal «Замены» (one path with B2 and P1.1).  Spec: artifacts/p1/P1_2_DIRECT_SUBSTITUTION_JOURNAL_SPEC.md.
// The lines of the journal are run on the real helpers; the wiring is pinned on the sources.
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
const S = require(path.join(root, "src/lib/substitutions.ts"));

const AT = "2026-10-21T09:12:00";                                    // 14:12 in Tashkent
const person = (name) => ({ id: name, name });
const direct = (patch = {}) => ({
  id: "r1", origin: "system", status: "substituted", reasonCode: "other", reasonLabel: "Другое", teacher: person("Иванов А."),
  decision: { kind: "substitute", via: "lesson_teacher_put", by: person("Каримова Н."), at: AT, substitute: person("Петров Б."), note: null }, ...patch,
});
const cleared = (patch = {}) => direct({
  status: "closed", decision: { kind: "closed", via: "lesson_teacher_put", by: person("Каримова Н."), at: AT, substitute: person("Петров Б."), closedReason: "ASSIGNMENT_CLEARED",
                                closedReasonText: "Замена снята", note: null }, ...patch,
});

test("[1] a substitution without a request: «Заменил администратор, без запроса», the chip «Замена», «Иванов А. → Петров Б.», then who decided and when", () => {
  const item = direct();
  assert.equal(S.isDirectSubstitution(item), true);
  assert.equal(S.originLine(item), "Заменил администратор, без запроса");
  assert.equal(S.reasonChipText(item), "Замена");
  assert.equal(S.decisionResultText(item), "Иванов А. → Петров Б.");
  assert.equal(S.decidedByLine(item), "Решил(а) Каримова Н., 21.10 14:12");
});

test("[2] a request of a teacher decided from the sheet or on the page reads the same way: «Иванов А. → Петров Б.», its own reason, no «без запроса»", () => {
  for (const via of ["lesson_teacher_put", "request"]) {
    const item = direct({ origin: "teacher", reasonCode: "sick", reasonLabel: "Болезнь", decision: { ...direct().decision, via } });
    assert.equal(S.isDirectSubstitution(item), false, via);
    assert.equal(S.originLine(item), null, via);
    assert.equal(S.reasonChipText(item), "Болезнь", via);
    assert.equal(S.decisionResultText(item), "Иванов А. → Петров Б.", via);
    assert.equal(S.decidedByLine(item), "Решил(а) Каримова Н., 21.10 14:12", via);
    assert.deepEqual(S.teacherStatusLine(item), { text: "Замена: Петров Б.", tone: "green" }, "the teacher's own list keeps its wording");
  }
});

test("a request the system reopened and the administrator decided on the page is still «Запрос создан системой»; a system request that waits too", () => {
  const reopened = direct({ decision: { ...direct().decision, via: "request" } });
  assert.equal(S.isDirectSubstitution(reopened), false);
  assert.equal(S.originLine(reopened), "Запрос создан системой");
  assert.equal(S.reasonChipText(reopened), "Другое");
  assert.equal(S.originLine({ origin: "system", status: "pending", decision: null }), "Запрос создан системой");
});

test("a move keeps its lines (P1.1) and is not a substitution", () => {
  const moved = { origin: "system", status: "rescheduled", reasonCode: "other", reasonLabel: "Другое", teacher: person("Иванов А."), decision: { kind: "reschedule", via: "request", by: person("Каримова Н."), at: AT } };
  assert.equal(S.isDirectSubstitution(moved), false);
  assert.equal(S.originLine(moved), "Перенёс администратор, без запроса");
  assert.equal(S.reasonChipText(moved), "Перенос");
});

test("[3] a substitute replaced by another: the old record says who took over, the new one is the one in force; a page that shows only the new one hints nothing", () => {
  const first = direct({ id: "r1" });
  const second = direct({ id: "r2", decision: { ...direct().decision, substitute: person("Сидоров В.") },
                          previous: { id: "r1", status: "substituted", teacherName: "Иванов А.", substituteName: "Петров Б." } });
  const map = S.supersededBy([second, first]);
  assert.deepEqual([...map], [["r1", "Сидоров В."]]);
  assert.equal(S.supersededBy([second]).get("r2"), undefined);
  assert.deepEqual([...S.supersededBy([first])], []);
  const afterRemoval = direct({ id: "r3", previous: { id: "r1", status: "closed", teacherName: "Иванов А.", substituteName: "Петров Б." } });
  assert.deepEqual([...S.supersededBy([afterRemoval])], [], "a taken-off substitution is not «replaced»");
});

test("[4] a substitution taken off: «Замена снята: Петров Б.», «Снял(а) Каримова Н., дата»; the other closings keep their words", () => {
  const item = cleared();
  assert.equal(S.CLOSED_REASON_TEXT.ASSIGNMENT_CLEARED, "Замена снята");
  assert.equal(S.closedReasonText(item), "Замена снята");
  assert.equal(S.decisionResultText(item), "Замена снята: Петров Б.");
  assert.equal(S.decidedByLine(item), "Снял(а) Каримова Н., 21.10 14:12");
  assert.equal(S.isDirectSubstitution(item), true);
  assert.equal(S.originLine(item), "Заменил администратор, без запроса");
  assert.equal(S.reasonChipText(item), "Замена");
  assert.deepEqual(S.teacherStatusLine(cleared({ origin: "teacher" })), { text: "Замена снята: Петров Б.", tone: "gray" });
  const noName = cleared({ decision: { ...cleared().decision, substitute: null } });
  assert.equal(S.decisionResultText(noName), "Замена снята");
  const system = { origin: "teacher", status: "closed", teacher: person("Иванов А."), decision: { kind: "closed", via: "system", by: null, at: AT, closedReason: "GROUP_ARCHIVED", closedReasonText: "Группа закрыта" } };
  assert.equal(S.decisionResultText(system), "Закрыт: Группа закрыта");
  assert.equal(S.decidedByLine(system), "Закрыто системой, 21.10 14:12");
  assert.equal(S.isDirectSubstitution(system), false);
});

test("without names the line does not invent one", () => {
  assert.equal(S.decisionResultText(direct({ decision: { ...direct().decision, substitute: null } })), "Замена назначена");
  assert.equal(S.decisionResultText(direct({ teacher: { id: "x", name: "" } })), "Замена: Петров Б.");
});

test("the page wires the lines of the journal: the origin under the teacher, the chip, the result, the hint of a replaced substitution; the new code is a known closing", () => {
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /originLine\(item\)/);
  assert.match(page, /reasonChipText\(item\)/);
  assert.match(page, /decisionResultText\(item\)/);
  assert.match(page, /supersededBy\(items\)/);
  assert.match(page, /Позже заменена на/);
  assert.match(read("src/lib/substitution-types.ts"), /\| "ASSIGNMENT_CLEARED"/);
});
