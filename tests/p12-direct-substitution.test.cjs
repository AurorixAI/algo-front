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
  id: "r1", origin: "system", trigger: "manager_assign", status: "substituted", reasonCode: "other", reasonLabel: "Другое", teacher: person("Иванов А."),
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

test("a request the system reopened is still «Запрос создан системой» - decided on the page AND decided from the sheet (R3: the mark is the server's trigger, not the way it was decided)", () => {
  for (const via of ["request", "lesson_teacher_put"]) {
    const reopened = direct({ trigger: null, decision: { ...direct().decision, via } });
    assert.equal(S.isDirectSubstitution(reopened), false, via);
    assert.equal(S.originLine(reopened), "Запрос создан системой", via);
    assert.equal(S.reasonChipText(reopened), "Другое", via);
    assert.deepEqual(S.teacherStatusLine(reopened), { text: "Замена: Петров Б.", tone: "green" }, via);
  }
  assert.equal(S.originLine({ origin: "system", status: "pending", decision: null }), "Запрос создан системой");
});

test("a move keeps its lines (P1.1) and is not a substitution", () => {
  const moved = { origin: "system", status: "rescheduled", reasonCode: "other", reasonLabel: "Другое", teacher: person("Иванов А."), decision: { kind: "reschedule", via: "request", by: person("Каримова Н."), at: AT } };
  assert.equal(S.isDirectSubstitution(moved), false);
  assert.equal(S.originLine(moved), "Перенёс администратор, без запроса");
  assert.equal(S.reasonChipText(moved), "Перенос");
});

test("[3] what became of a substitution is said under the decision, from the server's `cleared*` (not from the other rows of the page)", () => {
  const at = "2026-10-22T04:30:00";                                  // 09:30 in Tashkent
  const gone = (patch) => direct({ clearedAt: at, clearedBy: person("Каримова Н."), clearedTo: null, clearedTrigger: "put", ...patch });
  assert.equal(S.clearedLine(direct()), null, "it stands");
  assert.equal(S.clearedLine(direct({ clearedAt: null })), null);
  assert.equal(S.clearedLine(gone({})), "Замену снял(а) Каримова Н., 22.10 09:30");
  assert.equal(S.clearedLine(gone({ clearedTo: person("Сидоров В.") })), "Заменена на Сидоров В. — решил(а) Каримова Н., 22.10 09:30");
  assert.equal(S.clearedLine(gone({ clearedTo: person("Сидоров В."), clearedBy: null })), "Заменена на Сидоров В., 22.10 09:30");
  assert.equal(S.clearedLine(gone({ clearedTrigger: "move" })), "Урок позже перенесён, 22.10 09:30");
  assert.equal(S.clearedLine(gone({ clearedTrigger: "cancel" })), "Урок позже отменён, 22.10 09:30");
  assert.equal(S.clearedLine(gone({ clearedTrigger: "member_removed" })), "Замена снята: заменяющий больше не работает в центре, 22.10 09:30");
  assert.equal(S.clearedLine(gone({ clearedTrigger: "group_teacher_changed" })), "Замена снята: стал преподавателем группы, 22.10 09:30");
  assert.equal(S.clearedLine(gone({ clearedBy: null })), "Замена снята: система, 22.10 09:30");
  assert.equal(S.clearedLine({ ...cleared(), clearedAt: at }), null, "a record the removal closed says it in its result already");
  assert.equal(S.supersededBy, undefined, "the page-dependent hint is gone");
});

test("[4] a substitution taken off: «Замену снял(а) Каримова Н., дата», «Заменял(а): Петров Б.»; the other closings keep their words", () => {
  const item = cleared();
  assert.equal(S.CLOSED_REASON_TEXT.ASSIGNMENT_CLEARED, "Замена снята");
  assert.equal(S.closedReasonText(item), "Замена снята");
  assert.equal(S.decisionResultText(item), "Замену снял(а) Каримова Н., 21.10 14:12");
  assert.equal(S.decidedByLine(item), "Заменял(а): Петров Б.");
  assert.equal(S.isDirectSubstitution(item), true);
  assert.equal(S.originLine(item), "Заменил администратор, без запроса");
  assert.equal(S.reasonChipText(item), "Замена");
  assert.deepEqual(S.teacherStatusLine(cleared({ origin: "teacher" })), { text: "Замену снял(а) Каримова Н., 21.10 14:12", tone: "gray" });
  const noName = cleared({ decision: { ...cleared().decision, substitute: null } });
  assert.equal(S.decisionResultText(noName), "Замену снял(а) Каримова Н., 21.10 14:12");
  assert.equal(S.decidedByLine(noName), "");
  const noWho = cleared({ decision: { ...cleared().decision, by: null } });
  assert.equal(S.decisionResultText(noWho), "Замена снята, 21.10 14:12");
  const system = { origin: "teacher", status: "closed", teacher: person("Иванов А."), decision: { kind: "closed", via: "system", by: null, at: AT, closedReason: "GROUP_ARCHIVED", closedReasonText: "Группа закрыта" } };
  assert.equal(S.decisionResultText(system), "Закрыт: Группа закрыта");
  assert.equal(S.decidedByLine(system), "Закрыто системой, 21.10 14:12");
  assert.equal(S.isDirectSubstitution(system), false);
});

test("without names the line does not invent one", () => {
  assert.equal(S.decisionResultText(direct({ decision: { ...direct().decision, substitute: null } })), "Замена назначена");
  assert.equal(S.decisionResultText(direct({ teacher: { id: "x", name: "" } })), "Замена: Петров Б.");
});

test("[R3 #5] «Мои запросы» of the teacher: a substitution or a move he did not ask for says the administrator did it", () => {
  assert.deepEqual(S.teacherStatusLine(direct()), { text: "Администратор заменил: Петров Б.", tone: "green" });
  assert.deepEqual(S.teacherStatusLine(direct({ decision: { ...direct().decision, substitute: null } })), { text: "Администратор назначил замену", tone: "green" });
  const moved = (trigger, via) => ({ origin: "system", trigger, status: "rescheduled", decision: { kind: "reschedule", via, movedTo: { date: "2026-10-28", startTime: "14:00", endTime: "15:30" } } });
  assert.match(S.teacherStatusLine(moved("manager_move", "request")).text, /^Администратор перенёс: урок перенесён на /);
  assert.equal(S.teacherStatusLine(moved("teacher_move", "teacher_move")).text.startsWith("Урок перенесён на "), true, "his own move keeps its words");
  assert.equal(S.teacherStatusLine({ origin: "teacher", status: "rescheduled", decision: moved("x", "request").decision }).text.startsWith("Урок перенесён на "), true);
  assert.deepEqual(S.teacherStatusLine(direct({ origin: "teacher", trigger: null })), { text: "Замена: Петров Б.", tone: "green" });
});

test("[R3 #3] «Ведёт: …» - the lesson of a group without a main teacher is not a «Замена», in the toast and on the chip", () => {
  assert.equal(S.directAssignToast({ isSubstitution: false, teacherName: "Петров Б.", defaultTeacherId: null }), "Ведёт: Петров Б.");
  assert.equal(S.directAssignToast({ isSubstitution: false, teacherName: "Иванов А.", defaultTeacherId: "u1" }), "Преподаватель урока возвращён");
  assert.equal(S.directAssignToast({ isSubstitution: true, teacherName: "Петров Б.", defaultTeacherId: "u1" }), "Замена назначена: Петров Б.");
  const lesson = { groupName: "9-А", isSubstitution: false, teacherId: "t2", teacherName: "Петров Б.", defaultTeacherId: null };
  assert.deepEqual(S.occurrenceChips(lesson, "boss", { manager: true }).map((c) => c.text), ["Ведёт: Петров Б."]);
  assert.deepEqual(S.occurrenceChips({ ...lesson, defaultTeacherId: "t1", teacherId: "t1", teacherName: "Иванов А." }, "boss").map((c) => c.text), []);
  assert.deepEqual(S.occurrenceChips({ groupName: "9-А", teacherId: "t2", teacherName: "Петров Б." }, "boss").map((c) => c.text), [], "an answer that does not say the main teacher shows no chip");
});

test("[R3 #6] the rows of the journal, rendered: the line under the teacher, the chip, the result, who decided and what became of the substitution", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const cells = require(path.join(root, "src/components/substitutions/journal-cells.tsx"));
  const text = (html) => html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
  const render = (Component, item) => text(renderToStaticMarkup(React.createElement(Component, { item })));
  const stood = { ...direct(), comment: "Болезнь у основного преподавателя" };
  assert.equal(render(cells.OriginLine, stood), "|Заменил администратор, без запроса|");
  assert.equal(render(cells.ReasonCell, stood), "|Замена|Болезнь у основного преподавателя|");
  assert.equal(render(cells.DecisionCell, stood), "|Иванов А. → Петров Б.|Решил(а) Каримова Н., 21.10 14:12|");
  const replaced = { ...stood, clearedAt: "2026-10-22T04:30:00", clearedBy: person("Каримова Н."), clearedTo: person("Сидоров В."), clearedTrigger: "put" };
  assert.equal(render(cells.DecisionCell, replaced), "|Иванов А. → Петров Б.|Решил(а) Каримова Н., 21.10 14:12|Заменена на Сидоров В. — решил(а) Каримова Н., 22.10 09:30|");
  const removed = render(cells.DecisionCell, cleared());
  assert.equal(removed, "|Замену снял(а) Каримова Н., 21.10 14:12|Заменял(а): Петров Б.|");
  const asked = { ...direct({ origin: "teacher", trigger: null, reasonLabel: "Болезнь", reasonCode: "sick" }) };
  assert.equal(render(cells.OriginLine, asked), "");
  assert.equal(render(cells.ReasonCell, asked), "|Болезнь|");
  const page = read("src/components/substitutions/substitutions-page.tsx");
  for (const name of ["OriginLine", "ReasonCell", "DecisionCell"]) assert.match(page, new RegExp(`<${name} item=\\{item\\} />`), `the page renders ${name}`);
  assert.match(read("src/lib/substitution-types.ts"), /\| "ASSIGNMENT_CLEARED"/);
});

test("[batch 25.10] the teacher's list after A → B → C and the removal: no stale «Администратор заменил», each row says what became of its substitution", () => {
  const at = "2026-10-22T04:30:00";                                  // 09:30 in Tashkent
  // the record of B: replaced by C
  const replaced = direct({ origin: "system", trigger: "manager_assign", clearedAt: at, clearedBy: person("Каримова Н."), clearedTo: person("Сидоров В."), clearedTrigger: "put" });
  assert.deepEqual(S.teacherStatusLine(replaced), { text: "Заменена на Сидоров В. — решил(а) Каримова Н., 22.10 09:30", tone: "gray" });
  // the record of C: taken off
  assert.deepEqual(S.teacherStatusLine(cleared({ decision: { ...cleared().decision, substitute: person("Сидоров В.") } })), { text: "Замену снял(а) Каримова Н., 21.10 14:12", tone: "gray" });
  // a request of the teacher that was substituted and then taken off says it too
  const asked = direct({ origin: "teacher", trigger: null, clearedAt: at, clearedBy: person("Каримова Н."), clearedTo: null, clearedTrigger: "put" });
  assert.equal(S.teacherStatusLine(asked).text, "Замену снял(а) Каримова Н., 22.10 09:30");
  // a standing substitution keeps its words
  assert.deepEqual(S.teacherStatusLine(direct()), { text: "Администратор заменил: Петров Б.", tone: "green" });
});
