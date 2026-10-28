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
const O = require(path.join(root, "src/lib/substitution-outcome.ts"));
const T = require(path.join(root, "src/lib/substitution-timeline.ts"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const cells = require(path.join(root, "src/components/substitutions/journal-cells.tsx"));
const text = (html) => html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
const render = (Component, props) => text(renderToStaticMarkup(React.createElement(Component, props)));

const AT = "2026-10-21T09:12:00";                                    // 14:12 in Tashkent
const person = (name) => ({ id: name, name });
const direct = (patch = {}) => ({
  id: "r1", origin: "system", trigger: "manager_assign", status: "substituted", outcome: "substituted", reasonCode: "other", reasonLabel: "Другое", teacher: person("Иванов А."),
  decision: { kind: "substitute", via: "lesson_teacher_put", by: person("Каримова Н."), at: AT, substitute: person("Петров Б."), note: null }, ...patch,
});
const cleared = (patch = {}) => direct({
  status: "closed", outcome: "substitution_cleared", decision: { kind: "closed", via: "lesson_teacher_put", by: person("Каримова Н."), at: AT, substitute: person("Петров Б."), closedReason: "ASSIGNMENT_CLEARED",
                                closedReasonText: "Замена снята", note: null }, ...patch,
});

test("[1] a substitution without a request (#157): the badge «без запроса», no reason, «Иванов А. → Петров Б.», the chip «Замена назначена»", () => {
  const item = direct();
  assert.equal(O.originBadge(item), "без запроса");
  assert.equal(O.reasonShort(item), null, "a record without a request has no reason: the machine «Другое» and the comment of the administrator are not shown as one");
  assert.deepEqual(O.peopleOf(item), { teacher: "Иванов А.", to: "Петров Б." });
  assert.deepEqual(O.outcomeOf(item, "manager"), { code: "substituted", text: "Замена назначена", tone: "ok" });
  assert.equal(O.authorLine(item.decision.by, "manager", "manager"), "Каримова Н.", "no role from the server - no role in the line (LESSONS 17)");
  assert.equal(O.authorLine({ ...item.decision.by, role: "owner" }, "manager", "manager"), "Каримова Н., владелец");
  assert.equal(O.authorLine({ ...item.decision.by, role: "admin" }, "manager", "manager"), "Каримова Н., администратор");
  assert.equal(O.authorLine({ ...item.decision.by, role: "teacher" }, "manager", "manager"), "Каримова Н.", "a person who is a teacher now is not called an administrator");
});

test("[2] a request of a teacher decided from the sheet or on the page reads the same way: its own reason, no badge", () => {
  for (const via of ["lesson_teacher_put", "request"]) {
    const item = direct({ origin: "teacher", trigger: null, reasonCode: "sick", reasonLabel: "Болезнь", decision: { ...direct().decision, via } });
    assert.equal(O.originBadge(item), null, via);
    assert.equal(O.reasonShort(item), "Болезнь", via);
    assert.deepEqual(O.peopleOf(item), { teacher: "Иванов А.", to: "Петров Б." }, via);
    assert.deepEqual(O.outcomeOf(item, "teacher"), { code: "substituted", text: "Замена: Петров Б.", tone: "ok" }, "the teacher's own list keeps his wording");
  }
});

test("a request the system reopened is «открыт заново» - decided on the page AND decided from the sheet (the mark is the server's trigger, not the way it was decided)", () => {
  for (const via of ["request", "lesson_teacher_put"]) {
    const reopened = direct({ trigger: null, decision: { ...direct().decision, via } });
    assert.equal(O.originBadge(reopened), "открыт заново", via);
    assert.equal(O.reasonShort(reopened), null, via);
  }
  assert.equal(O.originBadge({ origin: "system", status: "pending", trigger: null }), "открыт заново");
  assert.equal(O.originBadge({ origin: "teacher", trigger: null }), null);
  for (const trigger of ["manager_assign", "manager_move", "teacher_move", "manager_cancel", "teacher_cancel", "manager_restore", "manager_reason_change", "teacher_one_off", "day_off"]) {
    assert.equal(O.originBadge({ origin: "system", trigger }), "без запроса", trigger);
  }
});

test("a move keeps its lines (P1.1): the new time is under the teacher, it is not a substitution", () => {
  const moved = { origin: "system", trigger: "manager_move", outcome: "rescheduled", status: "rescheduled", reasonCode: "other", reasonLabel: "Другое", teacher: person("Иванов А."), decision: { kind: "reschedule", via: "request", by: person("Каримова Н."), at: AT, movedTo: { date: "2026-10-29", startTime: "16:00", endTime: "17:00" } } };
  assert.equal(O.originBadge(moved), "без запроса");
  assert.equal(O.reasonShort(moved), null);
  assert.deepEqual(O.peopleOf(moved), { teacher: "Иванов А.", to: "чт, 29.10, 16:00" });
  assert.equal(O.outcomeOf(moved, "manager").text, "Урок перенесён");
});

test("[3] what became of a substitution is the code of the server (`outcome`), the detail is a line of the history", () => {
  const at = "2026-10-22T04:30:00";                                  // 09:30 in Tashkent
  const gone = (patch) => direct({ clearedAt: at, clearedBy: person("Каримова Н."), clearedTo: null, clearedTrigger: "put", ...patch });
  const out = (outcome, item = gone({})) => O.outcomeOf({ ...item, outcome }, "manager");
  assert.deepEqual(out("substituted", direct()), { code: "substituted", text: "Замена назначена", tone: "ok" }, "it stands");
  assert.deepEqual(out("substitution_cleared"), { code: "substitution_cleared", text: "Замена снята", tone: "muted" });
  assert.deepEqual(out("substitution_replaced", gone({ clearedTo: person("Сидоров В.") })), { code: "substitution_replaced", text: "Заменён другим", tone: "muted" });
  assert.equal(out("lesson_later_moved").text, "Урок позже перенесён");
  assert.equal(out("lesson_later_cancelled").text, "Урок позже отменён");
  // the line of the history says who and why
  const row = (clearedTrigger, extra = {}) => T.timelineOf({
    item: gone({ clearedTrigger, ...extra }),
    events: [{ requestId: "r1", action: "assignment_cleared", actor: { id: "u", name: "Каримова Н.", role: "admin" }, at, snapshot: { teacherId: ["t1", extra.clearedTo ? "t3" : null], trigger: clearedTrigger } }],
  }, "manager").rows[0];
  assert.equal(row("put").title, "Замена снята: урок снова ведёт основной преподаватель");
  assert.equal(row("put", { clearedTo: { id: "t3", name: "Сидоров В." } }).title, "Новая замена: Сидоров В.");
  assert.equal(row("move").title, "Замена снята: урок перенесён");
  assert.equal(row("cancel").title, "Замена снята: урок отменён");
  assert.equal(row("member_removed").title, "Замена снята: заменяющий больше не работает в центре");
  assert.equal(row("role_changed").title, "Замена снята: роль заменяющего изменена, он больше не ведёт уроки");
  assert.equal(row("group_teacher_changed").title, "Замена снята: заменяющий стал преподавателем группы");
  assert.equal(row("put").author, "Каримова Н., администратор");
  assert.equal(row("put").when, "22.10, 09:30");
});

test("[4] a substitution taken off by the sheet is a closed record: «Замена снята», the substitute under the teacher; the other closings keep their words", () => {
  const item = cleared();
  assert.equal(S.CLOSED_REASON_TEXT.ASSIGNMENT_CLEARED, "Замена снята");
  assert.equal(S.closedReasonText(item), "Замена снята");
  assert.deepEqual(O.outcomeOf(item, "manager"), { code: "substitution_cleared", text: "Замена снята", tone: "muted" });
  assert.deepEqual(O.peopleOf(item), { teacher: "Иванов А.", to: "Петров Б." });
  assert.equal(O.originBadge(item), "без запроса");
  const noName = cleared({ decision: { ...cleared().decision, substitute: null } });
  assert.deepEqual(O.peopleOf(noName), { teacher: "Иванов А.", to: null });
  const system = { origin: "teacher", status: "closed", outcome: "group_archived", teacher: person("Иванов А."), decision: { kind: "closed", via: "system", by: null, at: AT, closedReason: "GROUP_ARCHIVED", closedReasonText: "Группа закрыта" } };
  assert.equal(O.outcomeOf(system, "manager").text, "Группа в архиве");
  assert.equal(O.originBadge(system), null);
});

test("without names the row does not invent one", () => {
  assert.equal(O.peopleOf(direct({ decision: { ...direct().decision, substitute: null } })).to, null);
  assert.equal(O.peopleOf(direct({ teacher: { id: "x", name: "" } })).teacher, "");
});

test("[R3 #5] «Мои запросы» of the teacher: a substitution or a move he did not ask for has its chip, the administrator is a role in the panel", () => {
  assert.deepEqual(O.outcomeOf(direct(), "teacher"), { code: "substituted", text: "Замена: Петров Б.", tone: "ok" });
  assert.deepEqual(O.outcomeOf(direct({ decision: { ...direct().decision, substitute: null } }), "teacher"), { code: "substituted", text: "Замена назначена", tone: "ok" });
  assert.equal(O.outcomeOf({ outcome: "rescheduled" }, "teacher").text, "Урок перенесён");
  // a teacher never reads another person's name: the server sends the role alone and the front says the role
  assert.equal(O.authorLine({ role: "admin" }, "manager", "teacher"), "Администратор");
  assert.equal(O.authorLine({ role: "owner" }, "manager", "teacher"), "Владелец");
  assert.equal(O.authorLine({ role: null }, "manager", "teacher"), null, "no role - no line, never «Администратор» by default");
  assert.equal(O.authorLine({ role: "teacher" }, "teacher", "teacher"), "Вы");
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

test("[R3 #6] the rows of the journal, rendered: the badge under the teacher, the reason, the one chip of the result, «когда»", () => {
  const stood = { ...direct(), comment: "Болезнь у основного преподавателя", lastActivityAt: AT };
  assert.equal(render(cells.PeopleCell, { item: stood }), "|Иванов А.|→ |Петров Б.|без запроса|");
  assert.equal(render(cells.ReasonCell, { item: stood }), "", "no reason for a record without a request; the comment is for the panel");
  assert.equal(render(cells.OutcomeChip, { item: stood }), "|Замена назначена|");
  assert.equal(render(cells.WhenCell, { item: stood }), "|21.10 14:12|");
  const replaced = { ...stood, outcome: "substitution_replaced", clearedAt: "2026-10-22T04:30:00", clearedBy: person("Каримова Н."), clearedTo: person("Сидоров В."), clearedTrigger: "put", lastActivityAt: "2026-10-22T04:30:00" };
  assert.equal(render(cells.OutcomeChip, { item: replaced }), "|Заменён другим|");
  assert.equal(render(cells.WhenCell, { item: replaced }), "|22.10 09:30|", "«Когда» is the last event, not the decision");
  assert.equal(render(cells.OutcomeChip, { item: cleared() }), "|Замена снята|");
  const asked = { ...direct({ origin: "teacher", trigger: null, reasonLabel: "Болезнь", reasonCode: "sick" }) };
  assert.equal(render(cells.PeopleCell, { item: asked }), "|Иванов А.|→ |Петров Б.|");
  assert.equal(render(cells.ReasonCell, { item: asked }), "|Болезнь|");
  const page = read("src/components/substitutions/substitutions-page.tsx");
  for (const name of ["LessonCell", "PeopleCell", "OutcomeChip", "WhenCell", "DetailsButton"]) assert.match(page, new RegExp(`<${name} `), `the page renders ${name}`);
  assert.match(read("src/lib/substitution-types.ts"), /\| "ASSIGNMENT_CLEARED"/);
});

test("[batch 25.10] the teacher's list after A → B → C and the removal: each row has the chip of what became of its substitution", () => {
  const at = "2026-10-22T04:30:00";
  const replaced = direct({ origin: "system", trigger: "manager_assign", outcome: "substitution_replaced", clearedAt: at, clearedBy: person("Каримова Н."), clearedTo: person("Сидоров В."), clearedTrigger: "put" });
  assert.deepEqual(O.outcomeOf(replaced, "teacher"), { code: "substitution_replaced", text: "Заменён другим", tone: "muted" });
  assert.deepEqual(O.outcomeOf(cleared({ decision: { ...cleared().decision, substitute: person("Сидоров В.") } }), "teacher"), { code: "substitution_cleared", text: "Замена снята", tone: "muted" });
  // a standing substitution keeps its words
  assert.deepEqual(O.outcomeOf(direct(), "teacher"), { code: "substituted", text: "Замена: Петров Б.", tone: "ok" });
});
