// LOGIC-B2 «Замены»: the front against the frozen contract (tests/fixtures/logB2 = artifacts/partner_doc_check/logicB2_contract.json + logicB2_fixtures).
// The nine chains of the spec are read from their golden answers; the access rule of the lead (21.10) - a substitute reads the roster of HIS lesson
// from the journal and never calls the group page - is tested on the real helper the two lesson panels use.
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
const dir = path.join(__dirname, "fixtures/logB2");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fx = (name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
const contract = fx("_contract");
const index = fx("index");
const S = require(path.join(root, "src/lib/substitutions.ts"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { RequestBody } = require(path.join(root, "src/components/substitutions/request-dialog.tsx"));
const { DecisionBody, StaleBody, initialMoveForm } = require(path.join(root, "src/components/substitutions/decision-dialog.tsx"));
const { LessonChips } = require(path.join(root, "src/components/substitutions/lesson-chips.tsx"));
const { StudentLessonsList } = require(path.join(root, "src/components/students/student-lessons-list.tsx"));
const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const refusal = (fixtureName) => {
  const { status, body } = fx(fixtureName);
  return Object.assign(new Error(body.detail.message), { status, code: body.detail.code, detail: body.detail });
};
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(d, entry.name)) : [path.join(d, entry.name)]));
const sources = walk(path.join(root, "src")).filter((file) => /\.(ts|tsx)$/.test(file)).map((file) => fs.readFileSync(file, "utf8")).join("\n");

// ── the contract ────────────────────────────────────────────────────────────────────────────────

test("the contract has 14 routes, every fixture of the index is there and names a schema of the contract", () => {
  const operations = Object.entries(contract.paths).flatMap(([route, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${route}`));
  assert.equal(operations.length, 14);
  for (const [file, model] of Object.entries(index)) {
    assert.ok(fs.existsSync(path.join(dir, file)), file);
    if (model !== "-") assert.ok(contract.components.schemas[model], `${file}: ${model}`);
  }
});

test("every route the screens call is in the contract and in api.ts", () => {
  const api = read("src/lib/api.ts");
  const calls = {
    "GET /org/substitutions/my-lessons": /substitutions\/my-lessons\?/,
    "POST /org/substitutions": /"\/auth\/org\/substitutions", \{ method: "POST", body \}/,
    "GET /org/substitutions/mine": /substitutions\/mine\?status=/,
    "POST /org/substitutions/{request_id}/withdraw": /\/withdraw`, \{ method: "POST" \}/,
    "POST /org/substitutions/withdraw": /substitutions\/withdraw", \{ method: "POST", body: \{ ids \} \}/,
    "GET /org/substitutions/summary": /substitutions\/summary/,
    "GET /org/substitutions": /substitutions\?\$\{listQuery\(params\)\}/,
    "GET /org/substitutions/{request_id}": /substitutions\/\$\{encodePathId\(requestId\)\}`\)/,
    "GET /org/substitutions/{request_id}/candidates": /\/candidates`/,
    "GET /org/substitutions/{request_id}/move-check": /\/move-check\?/,
    "POST /org/substitutions/{request_id}/decide": /\/decide`, \{ method: "POST", body \}/,
    "POST /org/substitutions/decide-bulk": /substitutions\/decide-bulk", \{ method: "POST", body \}/,
  };
  for (const [operation, pattern] of Object.entries(calls)) {
    const [method, route] = operation.split(" ");
    assert.ok(contract.paths[route]?.[method.toLowerCase()], `${operation} is in the contract`);
    assert.match(api, pattern, operation);
  }
  // the internal route for exam-service is not the front's: a substitute never reads it
  assert.ok(contract.paths["/org/groups/{group_id}/lesson-access"]);
  assert.doesNotMatch(sources, /lesson-access/);
});

test("every B2 error code is named in the front (one function words them), nothing is left to a guess", () => {
  const b2 = ["SUBSTITUTION_NOT_FOUND", "SUBSTITUTION_ALREADY_DECIDED", "NOT_REQUEST_OWNER", "MANAGER_ASSIGNS_DIRECTLY", "LESSON_ALREADY_STARTED", "NO_LESSONS_REQUESTABLE",
    "TOO_MANY_LESSONS", "LESSON_TOO_FAR", "COMMENT_REQUIRED", "SUBSTITUTE_IS_REQUESTER", "MOVE_SAME_SLOT", "MOVE_IN_PAST", "MOVE_TOO_FAR", "GROUP_BUSY",
    "MOVE_FIELDS_REQUIRED", "PERIOD_TOO_LONG", "REASON_REQUIRED", "TEACHER_REQUIRED"];
  for (const code of b2) {
    assert.ok(contract["x-errors"][code], `${code} is in the contract`);
    assert.ok(read("src/lib/substitutions.ts").includes(`"${code}"`), `${code} is worded`);
  }
  // the reused ones the dialogs word
  for (const code of ["TEACHER_BUSY", "TARGET_NOT_TEACHER", "NOT_LESSON_TEACHER", "GROUP_ARCHIVED", "LESSON_CANCELLED", "LESSON_NOT_FOUND", "LESSON_OUTSIDE_WINDOW", "PAYROLL_LOCKED", "LESSON_HAS_LIVE_EXAM", "EXAM_SERVICE_UNAVAILABLE"]) {
    assert.ok(read("src/lib/substitutions.ts").includes(`"${code}"`), `${code} is worded`);
  }
});

test("the texts of the server for the codes the front words are the same sentences (no drift between contract and screens)", () => {
  const same = ["SUBSTITUTION_NOT_FOUND", "NOT_REQUEST_OWNER", "MANAGER_ASSIGNS_DIRECTLY", "LESSON_ALREADY_STARTED", "NO_LESSONS_REQUESTABLE", "TOO_MANY_LESSONS", "LESSON_TOO_FAR",
    "COMMENT_REQUIRED", "SUBSTITUTE_IS_REQUESTER", "MOVE_SAME_SLOT", "MOVE_IN_PAST", "MOVE_TOO_FAR", "GROUP_BUSY", "MOVE_FIELDS_REQUIRED", "PERIOD_TOO_LONG"];
  for (const code of same) {
    const error = Object.assign(new Error("server"), { code, detail: { code, message: "server" } });
    assert.equal(S.substitutionErrorText(error), contract["x-errors"][code].message, code);
  }
});

test("every refusal of the fixtures is in the unified format and its code is in the contract or in the pack B catalogue", () => {
  const b = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/logB/_contract.json"), "utf8"));
  const codes = new Set([...Object.keys(contract["x-errors"]), ...Object.keys(b["x-errors"])]);
  let seen = 0;
  for (const file of Object.keys(index)) {
    const data = fx(file.replace(/\.json$/, ""));
    if (!data || typeof data !== "object" || !("status" in data) || !data.body?.detail?.code) continue;
    seen += 1;
    assert.ok(codes.has(data.body.detail.code), `${file}: ${data.body.detail.code}`);
    assert.equal(typeof data.body.detail.message, "string", file);
  }
  assert.ok(seen >= 8, `${seen} refusals read`);
});

test("the labels of the contract are the words of the front (reasons, closing reasons)", () => {
  for (const [code, label] of Object.entries(contract["x-labels"].reasons)) assert.equal(S.reasonLabelOf(code), label);
  for (const [code, label] of Object.entries(contract["x-labels"].closedReasons)) {
    assert.ok(S.CLOSED_REASON_TEXT[code], code);
    assert.ok(S.CLOSED_REASON_TEXT[code].startsWith(label), `${code}: ${S.CLOSED_REASON_TEXT[code]} / ${label}`);
  }
});

test("the fields the screens read are in the schemas they read", () => {
  const schemas = contract.components.schemas;
  const need = {
    SubstitutionItem: ["id", "batchId", "status", "origin", "group", "lesson", "teacher", "reasonCode", "reasonLabel", "comment", "suggestedTeacher", "minutesToStart", "urgent", "overdue", "decision", "previous"],
    SubDecision: ["kind", "by", "at", "via", "note", "substitute", "movedTo", "closedReason", "closedReasonText"],
    MyLesson: ["groupId", "lessonId", "lessonDate", "status", "requestId", "canRequest", "blockReason"],
    CreateSubstitutionRequest: ["lessons", "reasonCode", "comment", "suggestedTeacherId"],
    CreateSubstitutionOut: ["batchId", "created", "alreadyRequested", "skipped"],
    MineOut: ["items", "pendingTotal", "assignedToMe"],
    AssignedToMe: ["groupName", "lessonDate", "startTime", "endTime", "replacing"],
    SubstitutionSummary: ["pendingTotal", "urgentTotal", "overdueTotal"],
    SubstitutionListOut: ["items", "total", "pendingTotal", "urgentTotal"],
    SubstitutionCandidate: ["teacherId", "name", "orgRole", "suggested", "isDefaultTeacher", "busy", "busyWith", "rateMissing"],
    CandidateBusy: ["kind", "groupName", "startTime", "endTime", "pendingRequest"],
    MoveCheckOut: ["ok", "teacherName", "teacherConflicts", "groupConflicts", "warnings"],
    DecideRequest: ["decision", "teacherId", "note", "newDate", "startTime", "endTime", "room", "format", "reason", "expectedStatus"],
    DecideOut: ["item", "result"],
    DecideResult: ["kind", "teacherName", "newLesson", "warnings"],
    DecideBulkRequest: ["ids", "decision", "teacherId", "reason", "note"],
    DecideBulkOut: ["updated", "items", "skipped"],
    SubstitutionRequestMark: ["id", "status", "reasonCode", "teacherName"],
    SubstitutionOutcome: ["kind", "movedTo"],
    StudentNotice: ["lessonId", "date", "groupName", "kind", "movedTo"],
    LessonRosterStudent: ["id", "first_name", "last_name", "full_name", "display_id", "class_level"],
    ExamBinding: ["state", "title", "canCancel"],
  };
  for (const [name, fields] of Object.entries(need)) {
    assert.ok(schemas[name], name);
    for (const field of fields) assert.ok(field in (schemas[name].properties ?? {}), `${name}.${field}`);
  }
  const types = read("src/lib/substitution-types.ts");
  for (const field of ["minutesToStart", "urgent", "overdue", "suggestedTeacher", "closedReasonText", "assignedToMe", "busyWith", "pendingRequest", "rateMissing", "lessonRoster", "movedTo", "expectedStatus", "examBinding"]) {
    assert.ok(types.includes(field), `the types know ${field}`);
  }
});

// ── the nine chains, read from their golden answers ───────────────────────────────────────────────

test("[chain 1] a request by suggestion: the teacher's line, the admin's row, the decision toast and the menu counter", () => {
  const created = fx("b2c1_create");
  const item = created.created[0];
  assert.equal(S.createToast(created).text, "Запрос отправлен администратору");
  assert.equal(S.itemLessonLine(item), "9-А · пн, 26.10 · 10:00–11:30");
  assert.deepEqual(S.teacherStatusLine(item), { text: "Ждёт решения", tone: "amber" });
  assert.equal(S.deadlineText(item.minutesToStart), "до начала 5 дн.", "6960 min = 4 d 20 h");
  assert.deepEqual(S.deadlineChips(item), [{ text: "до начала 5 дн.", tone: "neutral" }]);
  assert.equal(S.suggestedLine(item), "Предложил: Рахимов Т.");
  assert.equal(S.reasonLabelOf(item.reasonCode), "Болезнь");
  // the substitute is first in the dialog, with the chip, and can be picked; the busy one is last and cannot
  const list = fx("b2c1_candidates_admin");
  const ordered = S.orderedCandidates(list.candidates);
  assert.equal(ordered[0].name, "Рахимов Т.");
  assert.equal(ordered[0].suggested, true);
  assert.equal(ordered[ordered.length - 1].busy, true);
  assert.equal(S.candidateBusyLine(ordered[ordered.length - 1].busyWith), "Занят: 8-В, 10:00–11:30");
  assert.equal(S.canPickCandidate(ordered[0], list.requesterId), true);
  assert.equal(S.canPickCandidate(ordered[ordered.length - 1], list.requesterId), false);
  assert.equal(S.roleChip(ordered[1].orgRole), "Администратор");
  assert.equal(S.roleChip("owner"), "Владелец");
  assert.equal(S.roleChip("teacher"), null);
  const decided = fx("b2c1_decide_substitute");
  assert.equal(S.decisionToast(decided), "Замена назначена: Рахимов Т.");
  assert.deepEqual(S.teacherStatusLine(decided.item), { text: "Замена: Рахимов Т.", tone: "green" });
  assert.equal(S.decidedByLine(decided.item), "Решил(а) Каримова Н., 21.10 14:12");
  assert.equal(S.decisionResultText(decided.item), "Замена: Рахимов Т.");
  // the body that goes out: the suggested colleague, the status the dialog saw
  assert.deepEqual(S.buildDecide("substitute", { teacherId: ordered[0].teacherId, note: "  Договорился по телефону " }), {
    decision: "substitute", teacherId: ordered[0].teacherId, note: "Договорился по телефону", expectedStatus: "pending",
  });
  assert.equal(S.substitutionErrorText(refusal("b2c1_not_lesson_teacher"), undefined, { lessonTeacherName: "Рахимов Т." }), "Этот урок ведёт Рахимов Т.");
  assert.equal(fx("b2c1_summary_pending").pendingTotal, 1);
});

test("[chain 2] a move with a conflict: the live check says who is busy, the result says where the lesson went", () => {
  const busy = S.moveCheckLines(fx("b2c2_move_check_busy"), "9-А");
  assert.equal(busy.ok, false);
  assert.deepEqual(busy.lines, ["У Иванов И. в это время урок «7-Б» (вт, 27.10, 10:00–11:30)"]);
  const free = S.moveCheckLines(fx("b2c2_move_check_ok"), "9-А");
  assert.equal(free.ok, true);
  assert.deepEqual(free.lines, ["Время свободно: у Иванов И. и группы «9-А» пересечений нет"]);
  const groupBusy = S.moveCheckLines({ ok: false, teacherName: "Иванов И.", teacherConflicts: [], groupConflicts: fx("b2x_group_busy").body.detail.conflicts, warnings: [{ code: "ROOM_BUSY", message: "Кабинет «12» в это время занят группой «7-Б»" }] }, "9-А");
  assert.deepEqual(groupBusy.lines, ["У группы «9-А» уже есть урок вт, 27.10 10:00–11:30"]);
  assert.deepEqual(groupBusy.warnings, ["Кабинет «12» в это время занят группой «7-Б»"]);
  assert.equal(S.substitutionErrorText(refusal("b2c2_decide_busy"), undefined, { teacherName: "Иванов И." }), "У Иванов И. уже есть урок «7-Б» вт, 27.10 10:00–11:30. Выберите другого преподавателя.");
  assert.equal(S.substitutionErrorText(refusal("b2x_group_busy")), "У группы уже есть урок в это время");
  assert.equal(S.substitutionErrorText(refusal("b2x_move_in_past")), "Новое время урока уже прошло");
  const decided = fx("b2c2_decide_reschedule");
  assert.equal(S.decisionToast(decided), "Урок перенесён на чт, 29.10, 16:00");
  assert.deepEqual(S.teacherStatusLine(decided.item), { text: "Урок перенесён на чт, 29.10, 16:00", tone: "blue" });
  // the form: the same slot is refused before the request, a reason is required
  const item = fx("b2c2_create").created[0];
  const form = S.moveFormError ? initialMoveForm(item, "2026-10-21") : null;
  assert.equal(S.moveFormError({ ...form, reason: "Личные обстоятельства" }, item, "2026-10-21"), "Выберите другую дату или время");
  assert.equal(S.moveFormError({ ...form, newDate: "2026-10-29", startTime: "16:00", endTime: "17:30", reason: "" }, item, "2026-10-21"), "Укажите причину — не менее 3 символов");
  assert.equal(S.moveFormError({ ...form, newDate: "2026-10-29", startTime: "16:00", endTime: "17:30", reason: "Личные обстоятельства" }, item, "2026-10-21"), null);
  assert.equal(S.moveFormError({ ...form, newDate: "2026-10-20", reason: "Личные обстоятельства" }, item, "2026-10-21"), "Новое время урока уже прошло");
  assert.deepEqual(S.buildDecide("reschedule", { move: { newDate: "2026-10-29", startTime: "16:00", endTime: "17:30", room: " ", format: "offline", reason: " Личные обстоятельства " } }), {
    decision: "reschedule", newDate: "2026-10-29", startTime: "16:00", endTime: "17:30", room: null, format: "offline", reason: "Личные обстоятельства", expectedStatus: "pending",
  });
  // the student's card: «Урок перенесён на …» without a reason
  const notice = fx("b2c2_student_notices")[0];
  assert.equal(S.studentNoticeLabel(notice), "Урок перенесён на чт, 29.10, 16:00");
});

test("[chain 1] a direct assignment («Заменить преподавателя») that answers a waiting request closes it, and the toast says so", () => {
  assert.equal(S.directAssignToast({ isSubstitution: true, teacherName: "Рахимов Т.", requestClosed: null }), "Замена назначена: Рахимов Т.");
  assert.equal(S.directAssignToast({ isSubstitution: true, teacherName: "Рахимов Т.", requestClosed: { id: "r", status: "substituted" } }), "Замена назначена: Рахимов Т. Запрос преподавателя закрыт.");
  assert.equal(S.directAssignToast({ isSubstitution: false }), "Преподаватель урока возвращён");
});

test("[chain 3] a cancellation: the consequences of decision 3 in the words of the spec, the toast and the student's grey line", () => {
  const decided = fx("b2c3_decide_cancel");
  assert.equal(S.decisionToast(decided), "Урок отменён");
  assert.deepEqual(S.teacherStatusLine(decided.item), { text: "Урок отменён", tone: "gray" });
  assert.equal(S.CANCEL_CONSEQUENCES, "Урок будет отменён и не вернётся. Ученики на нём не отмечаются. При помесячной оплате стоимость месяца не меняется. В пакете занятий урок не списывается. Заработок преподавателя за этот урок не засчитывается.");
  assert.deepEqual(S.buildDecide("cancel", { reason: " Преподаватель болен, замены нет " }), { decision: "cancel", reason: "Преподаватель болен, замены нет", expectedStatus: "pending" });
  assert.equal(S.decisionReasonError("cancel", "ок"), "Укажите причину — не менее 3 символов");
  assert.equal(S.decisionReasonError("cancel", "Болен"), null);
  assert.equal(S.studentNoticeLabel({ kind: "cancelled" }), "Урок отменён");
  assert.equal(S.examDraftCancelText("Контрольная №3"), "Экзамен «Контрольная №3» вернётся в черновик, код доступа будет закрыт.");
  assert.equal(S.examRunningText("Контрольная №3"), "Экзамен «Контрольная №3» уже идёт — отменить урок нельзя");
});

test("[chain 4] two administrators at once: «Запрос уже решён» with the fresh item; the variants for a withdrawn and a closed request", () => {
  const rejected = S.alreadyDecided(refusal("b2c4_already_decided_rejected"));
  assert.equal(rejected.message, "Запрос уже решён");
  assert.equal(rejected.item.status, "rejected");
  assert.equal(S.decisionResultText(rejected.item), "Запрос отклонён");
  assert.deepEqual(S.teacherStatusLine(rejected.item), { text: "Отклонено: Замену не нашли", tone: "red" });
  const withdrawn = S.alreadyDecided(refusal("b2c4_already_decided_withdrawn"));
  assert.equal(withdrawn.message, "Учитель отозвал запрос");
  assert.equal(S.decidedByLine(withdrawn.item), "Отозван учителем, 21.10 14:01");
  assert.equal(S.alreadyDecidedText(fx("b2c9_closed")), "Запрос закрыт: группа закрыта");
  assert.equal(S.alreadyDecided(new Error("boom")), null);
  assert.equal(S.alreadyDecided(refusal("b2x_group_busy")), null, "another refusal is not «already decided»");
  // the dialog shows what happened and nothing to decide
  const html = textOf(renderToStaticMarkup(React.createElement(StaleBody, { message: rejected.message, item: rejected.item })));
  assert.match(html, /Запрос уже решён/);
  assert.match(html, /Запрос отклонён/);
  assert.doesNotMatch(html, /Назначить замену/);
  assert.equal(S.applyFreshItem({ items: [fx("b2x_list").items[0]], total: 1, pendingTotal: 1 }, { ...fx("b2x_list").items[0], status: "rejected" }, "pending").items.length, 0, "the decided row leaves the waiting tab");
});

test("[chain 5] a decision after the lesson began: «поздно» mode - the lesson is named started, «Перенести» is off, the late sentence", () => {
  const item = fx("b2c5_item_overdue");
  assert.equal(S.isLateRequest(item), true);
  assert.equal(S.startedLabel(item), "Урок уже начался", "30 minutes in, the lesson lasts 90");
  assert.equal(S.startedLabel({ ...item, minutesToStart: -95 }), "Урок прошёл");
  assert.deepEqual(S.deadlineChips(item), [{ text: "Урок уже начался", tone: "dark" }]);
  assert.deepEqual(S.availableDecisions(item), ["substitute", "cancel", "reject"]);
  assert.equal(S.decisionCardTitle("substitute", true), "Назначить того, кто провёл урок");
  assert.equal(S.decisionCardTitle("substitute", false), "Назначить замену");
  assert.equal(S.LATE_BANNER_TEXT, "Урок уже начался или прошёл. Можно назначить того, кто его провёл, отменить урок или отклонить запрос. Перенести нельзя.");
  assert.equal(fx("b2c5_summary_overdue").overdueTotal, 1);
  assert.equal(S.substitutionErrorText(refusal("b2c5_lesson_already_started")), "Урок уже начался или прошёл. Обратитесь к администратору");
  // an urgent request: under 24 hours, red «Срочно» then the quiet count; a repeat of a request says it already waits
  const urgent = fx("b2c5_create_urgent").created[0];
  assert.deepEqual(S.deadlineChips(urgent).map((c) => c.text), ["Срочно", "до начала 20 мин"]);
  assert.equal(S.createToast(fx("b2c5_create_already_requested")).text, "Запрос уже ждёт решения");
  const html = textOf(renderToStaticMarkup(React.createElement(DecisionBody, decisionProps(item))));
  assert.match(html, /Урок уже начался или прошёл\. Можно назначить того, кто его провёл/);
  assert.doesNotMatch(html, /Перенести урок/);
  assert.match(html, /Назначить того, кто провёл урок/);
});

test("[chain 6] a substitute was removed: the system reopens the request - «Запрос создан системой» with the comment, and the old one stays in the chain", () => {
  const item = fx("b2c6_reopened");
  assert.equal(item.origin, "system");
  assert.equal(item.previous.status, "substituted");
  assert.equal(S.deadlineText(item.minutesToStart), "до начала 8 дн.");
  assert.equal(S.removalRequestsText(fx("b2c6_removal_impact_pending").pendingSubstitutionRequests.count), "Запросов на замену этого сотрудника (1) будут закрыты.");
});

test("[chain 7] a range of lessons and a bulk decision: the dialog's rows, the count on the button, the bulk toast with the reasons", () => {
  const mine = fx("b2c7_my_lessons");
  const labels = mine.lessons.map((lesson) => S.myLessonLabel(lesson));
  assert.equal(labels[3], "пн, 26.10 · 10:00–11:30 · 9-А");
  const blocked = mine.lessons.filter((lesson) => !lesson.canRequest);
  assert.ok(blocked.length >= 2);
  assert.equal(S.MY_LESSON_BLOCK_TEXT[blocked[0].blockReason], "Урок уже начался");
  assert.deepEqual(Object.values(S.MY_LESSON_BLOCK_TEXT).sort(), ["Запрос уже подан", "Урок отменён", "Урок уже начался"].sort());
  assert.equal(S.sendLabel(1), "Отправить запрос");
  assert.equal(S.sendLabel(3), "Отправить запрос (3 урока)");
  assert.equal(S.sendLabel(5), "Отправить запрос (5 уроков)");
  const batch = fx("b2c7_create_batch");
  assert.deepEqual(S.createToast(batch), { text: "Отправлено: 5. Не отправлено: 2 — урок уже начался", type: "warning" }, "the two lessons of the range that had begun");
  assert.deepEqual(S.createToast({ ...batch, skipped: [] }), { text: "Запросов отправлено: 5", type: "success" });
  assert.deepEqual(S.createToast({ created: batch.created.slice(0, 2).concat([]), alreadyRequested: [], skipped: [{ code: "LESSON_ALREADY_STARTED", message: "x" }, { code: "LESSON_ALREADY_STARTED", message: "x" }] }),
    { text: "Отправлено: 2. Не отправлено: 2 — урок уже начался", type: "warning" });
  // the batch: «В запросе ещё N уроков»
  const [first, ...others] = batch.created;
  assert.equal(S.batchSiblings(first, batch.created).length, others.length);
  assert.equal(S.moreLessonsText(1), "В запросе ещё 1 урок");
  assert.equal(S.moreLessonsText(2), "В запросе ещё 2 урока");
  assert.equal(S.moreLessonsText(5), "В запросе ещё 5 уроков");
  // bulk
  assert.deepEqual(S.bulkToast(fx("b2c7_bulk_ok"), []), { text: "Решено: 5. Не удалось: 0", type: "success", details: [] });
  const busy = S.bulkToast(fx("b2x_decide_bulk_busy"), [first]);
  assert.equal(busy.text, "Решено: 4. Не удалось: 1");
  assert.equal(busy.type, "warning");
  assert.match(busy.details[0], /преподаватель занят: вт, 27\.10 10:00–11:30/);
  assert.deepEqual(S.buildBulk(["a", "b"], "substitute", { teacherId: "t1", note: " " }), { ids: ["a", "b"], decision: "substitute", teacherId: "t1" });
  assert.deepEqual(S.buildBulk(["a"], "reject", { reason: " Замену не нашли " }), { ids: ["a"], decision: "reject", reason: "Замену не нашли" });
  // the withdraw of several: the one already decided is named
  assert.equal(fx("b2x_withdraw_batch").skipped[0].code, "SUBSTITUTION_ALREADY_DECIDED");
});

test("[chain 8] the substitute cannot either: a candidate list without the requester, the default teacher marked, nobody free is said", () => {
  const list = fx("b2c8_candidates");
  assert.equal(list.candidates.some((c) => c.teacherId === list.requesterId), false);
  assert.equal(S.noFreeCandidates(list.candidates, list.requesterId), false);
  assert.equal(S.noFreeCandidates(list.candidates.map((c) => ({ ...c, busy: true })), list.requesterId), true);
  assert.equal(S.NO_FREE_TEACHERS_TEXT, "Свободных преподавателей на это время нет. Перенесите или отмените урок.");
  assert.equal(S.candidateBusyLine({ kind: "substitution", groupName: "8-В", startTime: "10:00", endTime: "11:30", pendingRequest: false }), "Занят: замена в 8-В, 10:00–11:30");
  assert.equal(S.candidateBusyLine({ kind: "lesson", groupName: "8-В", startTime: "10:00", endTime: "11:30", pendingRequest: true }), "Занят: 8-В, 10:00–11:30 (сам запросил замену)");
  assert.equal(S.substitutionErrorText(Object.assign(new Error("x"), { code: "SUBSTITUTE_IS_REQUESTER", detail: { code: "SUBSTITUTE_IS_REQUESTER", message: "x" } })), "Нельзя назначить заменой того, кто запросил замену");
  assert.equal(fx("b2c8_create").created.length, 1);
});

test("[chain 9] a group archived with a request waiting: the dialog line, the closing text and the grey status", () => {
  assert.equal(S.archiveRequestsText(fx("b2c9_archive_warning").count), "Запросов на замену: 1 — они будут закрыты.");
  const closed = fx("b2c9_closed");
  assert.deepEqual(S.teacherStatusLine(closed), { text: "Закрыт: Группа закрыта", tone: "gray" });
  assert.equal(S.decidedByLine(closed), "Закрыто системой, 22.10 10:00");
  assert.equal(S.closedReasonText({ decision: { closedReason: "GROUP_TEACHER_CHANGED" } }, "Рахимов Т."), "Преподаватель группы изменён: урок ведёт Рахимов Т.");
  assert.equal(S.closedReasonText({ decision: { closedReason: "LESSON_STARTED" } }), "Урок начат — запрос закрыт");
  assert.equal(S.closedReasonText({ decision: {} }), "Запрос закрыт");
  const archive = require(path.join(root, "src/lib/group-archive.ts"));
  const view = archive.archiveView
    ? archive.archiveView({ groupId: "g", groupName: "8-В", status: "active", canArchive: true, warnings: [fx("b2c9_archive_warning")] }, null, false)
    : null;
  if (view) assert.ok(view.notes.includes("Запросов на замену: 1 — они будут закрыты."));
});

// ── the screens ───────────────────────────────────────────────────────────────────────────────────

function requestProps(over = {}) {
  return {
    reasonCode: "sick", comment: "", commentProblem: null, colleagues: [{ id: "c1", name: "Рахимов Т." }], suggestedId: "", rangeOpen: false,
    from: "2026-10-21", to: "2026-11-03", others: null, othersLoading: false, othersError: null, picked: new Set(), pickedCount: 0, busy: false, error: null,
    onReason() {}, onComment() {}, onSuggested() {}, onToggleRange() {}, onFrom() {}, onTo() {}, onShow() {}, onPick() {}, ...over,
  };
}

test("[T1] the request dialog: three reasons, the comment, «Другие мои уроки», the colleague and the explanation - in the words of the spec", () => {
  const text = textOf(renderToStaticMarkup(React.createElement(RequestBody, requestProps())));
  for (const phrase of ["Причина", "Болезнь", "Личное", "Другое", "Комментарий", "Другие мои уроки", "Предложить коллегу (необязательно)", "Не выбирать",
    "Решение принимает администратор. Коллега ничего не подтверждает — администратор договорится с ним сам.",
    "Администратор назначит замену, перенесёт или отменит урок. Статус запроса — на дашборде, в разделе «Запросы на замену»."]) {
    assert.ok(text.includes(phrase), phrase);
  }
  assert.ok(renderToStaticMarkup(React.createElement(RequestBody, requestProps())).includes('placeholder="Например: больничный до 30.10"'));
  // «Другое» makes the comment obligatory
  const other = textOf(renderToStaticMarkup(React.createElement(RequestBody, requestProps({ reasonCode: "other", commentProblem: S.COMMENT_REQUIRED_TEXT }))));
  assert.match(other, /Комментарий \(обязательно\)/);
  assert.match(other, /Опишите причину — не менее 3 символов/);
  assert.equal(S.commentError("other", "  а "), "Опишите причину — не менее 3 символов");
  assert.equal(S.commentError("sick", ""), null);
  // no colleagues known (a teacher cannot list the staff): the choice is simply not offered
  assert.doesNotMatch(textOf(renderToStaticMarkup(React.createElement(RequestBody, requestProps({ colleagues: [] })))), /Предложить коллегу/);
  // the range: the list with check boxes, the blocked rows grey with the reason
  const lessons = fx("b2c7_my_lessons").lessons;
  const open = renderToStaticMarkup(React.createElement(RequestBody, requestProps({ rangeOpen: true, others: lessons, pickedCount: 1, picked: new Set([S.lessonKeyOfRef(lessons[3])]) })));
  const openText = textOf(open);
  assert.match(openText, /Другие мои уроки · выбрано 1/);
  assert.match(openText, /пн, 26\.10 · 10:00–11:30 · 9-А/);
  assert.match(openText, /Урок уже начался/);
  assert.match(openText, /Показать уроки/);
  assert.equal((open.match(/type="checkbox"/g) || []).length, lessons.length);
  assert.ok((open.match(/disabled=""/g) || []).length >= 2, "the lessons that began cannot be ticked");
  assert.ok(openText.includes(" С ") && openText.includes(" По "), "the two dates");
  assert.equal(S.rangeError("2026-10-21", "2026-10-20"), "Дата «С» не может быть позже даты «По»");
  assert.equal(S.rangeError("2026-10-01", "2026-12-31"), "Период не может превышать 63 дня");
  assert.equal(S.rangeError("2026-10-01", "2026-12-02"), null, "62 days are allowed");
  assert.equal(S.rangeError("2026-10-01", "2026-12-03"), "Период не может превышать 63 дня");
  assert.deepEqual(S.buildCreate({ lessons: [{ groupId: "g", lessonId: "l", lessonDate: "2026-10-26", extra: 1 }], reasonCode: "sick", comment: " Температура ", suggestedTeacherId: "t" }),
    { lessons: [{ groupId: "g", lessonId: "l", lessonDate: "2026-10-26" }], reasonCode: "sick", comment: "Температура", suggestedTeacherId: "t" });
  assert.deepEqual(S.buildCreate({ lessons: [], reasonCode: "other", comment: " " }), { lessons: [], reasonCode: "other" });
});

function decisionProps(item, over = {}) {
  const candidates = fx("b2c1_candidates_admin");
  return {
    item, role: "admin", late: S.isLateRequest(item), kinds: S.availableDecisions(item), kind: "substitute", candidates, candidatesError: null, pick: candidates.candidates[0].teacherId,
    note: "", move: initialMoveForm(item, "2026-10-21"), check: null, checking: false, checkError: null, reason: "", binding: null, problem: null, busy: false, error: null,
    onKind() {}, onPick() {}, onNote() {}, onMove() {}, onReason() {}, onRetryCandidates() {}, ...over,
  };
}

test("[M3] the decision dialog: the head, the four cards, and the substitute list with the suggested colleague first", () => {
  const item = fx("b2x_list").items[0];
  const html = renderToStaticMarkup(React.createElement(DecisionBody, decisionProps(item)));
  const text = textOf(html);
  for (const phrase of ["Болезнь", "Температура", "Предложил: Рахимов Т.", "Назначить замену", "Перенести урок", "Отменить урок", "Отклонить запрос", "Предложил учитель", "Администратор", "Владелец",
    "Занят: 8-В, 10:00–11:30", "Комментарий (необязательно)", "Заменяющий ничего не подтверждает: договоритесь с ним сами. Урок появится у него в расписании."]) {
    assert.ok(text.includes(phrase), phrase);
  }
  assert.equal(S.decisionHeader(item), "Иванов И. не сможет провести урок");
  assert.ok(text.indexOf("Рахимов Т.") < text.indexOf("Сидоров С."), "the suggested colleague is first");
  assert.ok(text.indexOf("Сидоров С.") < text.indexOf("Петров П."), "the busy one is last");
  assert.ok(/value="[^"]+" disabled=""/.test(html) || html.includes('disabled=""'), "the busy one cannot be picked");
  assert.doesNotMatch(text, /Ставка не задана/, "the administrator sees no money hints");
  // the owner sees the hint for a colleague without a rate
  const owner = fx("b2c1_candidates_admin");
  owner.candidates = owner.candidates.map((c) => (c.name === "Сидоров С." ? { ...c, rateMissing: true } : c));
  const ownerText = textOf(renderToStaticMarkup(React.createElement(DecisionBody, decisionProps(item, { role: "owner", candidates: owner }))));
  assert.match(ownerText, /Ставка не задана — заработок за урок не будет посчитан, пока вы её не зададите/);
  // nobody free
  const none = { ...fx("b2c1_candidates_admin"), candidates: fx("b2c1_candidates_admin").candidates.map((c) => ({ ...c, busy: true, busyWith: c.busyWith ?? { kind: "lesson", groupName: "8-В", startTime: "10:00", endTime: "11:30", pendingRequest: false } })) };
  assert.match(textOf(renderToStaticMarkup(React.createElement(DecisionBody, decisionProps(item, { candidates: none, pick: null })))), /Свободных преподавателей на это время нет\. Перенесите или отмените урок\./);
});

test("[M3] the move, the cancellation and the refusal forms - the words of the spec, the exam notes, the live check", () => {
  const item = fx("b2c2_create").created[0];
  const move = textOf(renderToStaticMarkup(React.createElement(DecisionBody, decisionProps(item, {
    kind: "reschedule",
    check: fx("b2c2_move_check_busy"),
    binding: { state: "ok", title: "Контрольная №3", canCancel: true },
  }))));
  for (const phrase of ["Новая дата", "Начало", "Окончание", "Кабинет (необязательно)", "Формат", "Причина переноса",
    "У Иванов И. в это время урок «7-Б» (вт, 27.10, 10:00–11:30)",
    "Исходный урок будет отменён как перенесённый — ученики на нём не отмечаются. Новый урок проведёт преподаватель группы (Иванов И.). Замена, назначенная на исходный урок, на новый не переходит. Отменённый урок вернуть нельзя.",
    "Экзамен «Контрольная №3» вернётся в черновик — привяжите его к новому уроку."]) {
    assert.ok(move.includes(phrase), phrase);
  }
  const cancel = textOf(renderToStaticMarkup(React.createElement(DecisionBody, decisionProps(item, { kind: "cancel", binding: { state: "ok", title: "Контрольная №3", canCancel: false } }))));
  assert.match(cancel, /Причина отмены/);
  assert.match(cancel, /Урок будет отменён и не вернётся\. Ученики на нём не отмечаются\./);
  assert.match(cancel, /Экзамен «Контрольная №3» уже идёт — отменить урок нельзя/);
  const reject = textOf(renderToStaticMarkup(React.createElement(DecisionBody, decisionProps(item, { kind: "reject" }))));
  assert.match(reject, /Причина отказа \(её увидит преподаватель\)/);
  assert.match(reject, /Урок остаётся за Ивановым И\. Если он не придёт, урок попадёт в «Незакрытые»\./);
  assert.equal(S.rejectConsequence("Каримова Н."), "Урок остаётся за Каримовой Н. Если она не придёт, урок попадёт в «Незакрытые».");
  assert.equal(S.rejectConsequence("Ким А."), "Урок остаётся за преподавателем: Ким А. Если урок не будет проведён, он попадёт в «Незакрытые».");
  assert.deepEqual(S.moveCheckParams({ newDate: "2026-10-29", startTime: "16:00", endTime: "17:30", room: "", format: "offline", reason: "" }), { newDate: "2026-10-29", startTime: "16:00", endTime: "17:30" });
  assert.equal(S.moveCheckParams({ newDate: "", startTime: "16:00", endTime: "17:30", room: "", format: "offline", reason: "" }), null);
  assert.equal(S.moveCheckParams({ newDate: "2026-10-29", startTime: "17:30", endTime: "16:00", room: "", format: "offline", reason: "" }), null);
});

test("[M2] the list: the deadline in minutes, hours, days; urgent under 24 hours; the tabs and the row of a decided request", () => {
  assert.equal(S.deadlineText(40), "до начала 40 мин");
  assert.equal(S.deadlineText(59), "до начала 59 мин");
  assert.equal(S.deadlineText(60), "до начала 1 ч");
  assert.equal(S.deadlineText(300), "до начала 5 ч");
  assert.equal(S.deadlineText(72 * 60 - 1), "до начала 72 ч");
  assert.equal(S.deadlineText(72 * 60), "до начала 3 дн.");
  assert.equal(S.deadlineText(0), null);
  assert.equal(S.deadlineText(-30), null);
  assert.equal(S.tabLabel("pending", 3), "Ждут решения (3)");
  assert.equal(S.tabLabel("decided", 3), "Решённые");
  assert.equal(S.EMPTY_TEXT, "Запросов на замену нет");
  assert.equal(S.LOAD_ERROR_TEXT, "Не удалось загрузить запросы. Повторите попытку.");
  assert.equal(S.suggestedLine({ suggestedTeacher: { id: "x", name: "Рахимов Т.", active: false } }), "Предложенный коллега больше не работает в центре");
  assert.equal(S.suggestedLine({ suggestedTeacher: null }), null);
  assert.equal(S.listQuery({ status: "pending", urgent: true, search: " 9-А ", groupId: "g1", limit: 50, offset: 100 }), "status=pending&groupId=g1&urgent=true&search=9-%D0%90&limit=50&offset=100");
  assert.equal(S.listQuery({ status: "decided" }), "status=decided&limit=50&offset=0");
  const list = fx("b2x_list");
  assert.equal(list.items.length, list.total);
  const sorted = S.recentRequests([{ ...list.items[0], status: "rejected", decision: { kind: "reject", at: "2026-10-21T09:01:00" } }, list.items[0]], Date.parse("2026-10-22T00:00:00Z"));
  assert.deepEqual(sorted.map((item) => item.status), ["pending", "rejected"], "the waiting request first");
  const old = S.recentRequests([{ ...list.items[0], status: "cancelled", decision: { kind: "cancel", at: "2026-09-01T09:01:00" } }], Date.parse("2026-10-22T00:00:00Z"));
  assert.equal(old.length, 0, "a request decided more than 14 days ago is not in the block");
});

test("[T2] the dashboard block: the lines of the spec for every status, the substitute's line in the genitive, no reason for the substitute", () => {
  const mine = fx("b2x_mine");
  assert.equal(S.assignedLine(mine.assignedToMe[0]), "Замена: 9-А — пн, 26.10, 10:00–11:30 (вместо Иванова И.)");
  assert.equal(S.assignedLine({ ...mine.assignedToMe[0], replacing: { name: "Каримова Н." } }), "Замена: 9-А — пн, 26.10, 10:00–11:30 (вместо Каримовой Н.)");
  assert.equal(S.assignedLine({ ...mine.assignedToMe[0], replacing: { name: "Ким А." } }), "Замена: 9-А — пн, 26.10, 10:00–11:30 (вместо: Ким А.)", "an indeclinable surname is not declined by guess");
  assert.ok(!JSON.stringify(mine.assignedToMe).includes("sick"), "the contract gives the substitute no reason");
  assert.equal(S.genitiveShortName("Рахимов Т."), "Рахимова Т.");
  assert.equal(S.genitiveShortName("Ким А."), null);
  assert.equal(S.declineShortName("Рахимов Т.", "instrumental"), "Рахимовым Т.");
  const status = (patch) => S.teacherStatusLine({ ...mine.items[0], ...patch }).text;
  assert.equal(status({ status: "withdrawn" }), "Отозван");
  assert.equal(status({ status: "rejected", decision: { kind: "reject", note: "Замену не нашли" } }), "Отклонено: Замену не нашли");
  assert.equal(status({ status: "closed", decision: { kind: "closed", closedReason: "LESSON_REMOVED" } }), "Закрыт: Урока больше нет в расписании");
  assert.equal(status({ status: "cancelled" }), "Урок отменён");
  for (const code of Object.keys(contract["x-labels"].closedReasons)) assert.ok(S.CLOSED_REASON_TEXT[code]);
});

test("[T1] who sees «Не смогу провести»: the teacher on his own future lesson; a plate while it waits; never the owner or the administrator", () => {
  const base = { role: "teacher", userId: "t1", lessonTeacherId: "t1", lessonStatus: "scheduled", startsAtMs: 2_000, nowMs: 1_000, mark: null };
  assert.deepEqual(S.requestControl(base), { kind: "button" });
  assert.deepEqual(S.requestControl({ ...base, role: "admin" }), { kind: "none" });
  assert.deepEqual(S.requestControl({ ...base, role: "owner" }), { kind: "none" });
  assert.deepEqual(S.requestControl({ ...base, lessonTeacherId: "other" }), { kind: "none" }, "a lesson of another teacher");
  assert.deepEqual(S.requestControl({ ...base, lessonTeacherId: null }), { kind: "button" }, "an older server: the lesson is his own as far as we know");
  assert.deepEqual(S.requestControl({ ...base, startsAtMs: 500 }), { kind: "none" }, "the lesson began");
  assert.deepEqual(S.requestControl({ ...base, lessonStatus: "in_progress" }), { kind: "none" });
  assert.deepEqual(S.requestControl({ ...base, lessonStatus: "cancelled" }), { kind: "none" });
  assert.deepEqual(S.requestControl({ ...base, mark: { id: "r1", status: "pending" } }), { kind: "pending", requestId: "r1" });
  assert.deepEqual(S.requestControl({ ...base, mark: { id: "r1", status: "rejected" } }), { kind: "rejected", requestId: "r1" });
  assert.deepEqual(S.requestControl({ ...base, mark: { id: "r1", status: "withdrawn" } }), { kind: "button" }, "after a withdrawal he may ask again");
  assert.equal(S.REQUESTED_LABEL, "Вы запросили замену");
  assert.equal(S.REQUEST_ACTION, "Не смогу провести");
  assert.equal(S.WITHDRAW_ACTION, "Отозвать запрос");
});

// ── the marks on lessons and on the student's card ───────────────────────────────────────────────

test("[S1/S2] the chips on a lesson: «Замена: 9-А» for the substitute, «Вы запросили замену» for the asker, «Ждёт замены» (a link) for the manager", () => {
  const occ = { groupName: "9-А", isSubstitution: true, teacherId: "sub", teacherName: "Рахимов Т.", defaultTeacherId: "main" };
  assert.deepEqual(S.occurrenceChips(occ, "sub").map((c) => c.text), ["Замена: 9-А"]);
  assert.deepEqual(S.occurrenceChips(occ, "main").map((c) => c.text), ["Заменяет Рахимов Т."]);
  assert.deepEqual(S.occurrenceChips(occ, "boss", { manager: true }).map((c) => c.text), ["Замена: Рахимов Т."]);
  const asked = { groupName: "9-А", substitutionRequest: { id: "r1", status: "pending", reasonCode: "sick" } };
  assert.deepEqual(S.occurrenceChips(asked, "t1").map((c) => c.text), ["Вы запросили замену"]);
  assert.deepEqual(S.occurrenceChips(asked, "boss", { manager: true }), [{ text: "Ждёт замены", tone: "amber", requestId: "r1" }]);
  assert.deepEqual(S.occurrenceChips({ substitutionRequest: { id: "r1", status: "rejected", reasonCode: "sick" } }, "t1").map((c) => c.text), ["Запрос отклонён"]);
  assert.deepEqual(S.occurrenceChips({ substitutionRequest: { id: "r1", status: "rejected", reasonCode: "sick" } }, "boss", { manager: true }), []);
  assert.deepEqual(S.occurrenceChips({ substitutionOutcome: { kind: "rescheduled", movedTo: { date: "2026-10-29", startTime: "16:00", endTime: "17:30" } } }, "t1").map((c) => c.text), ["Урок перенесён на чт, 29.10, 16:00"]);
  assert.deepEqual(S.occurrenceChips({ substitutionOutcome: { kind: "cancelled" } }, "t1").map((c) => c.text), ["Урок отменён"]);
  assert.deepEqual(S.lessonMarks({ id: "r1", status: "pending", reasonCode: "sick" }, null).map((c) => c.text), ["Ждёт замены"]);
  assert.deepEqual(S.lessonMarks({ id: "r1", status: "pending", reasonCode: "sick" }, null, { manager: false }).map((c) => c.text), ["Вы запросили замену"]);
  assert.deepEqual(S.lessonMarks({ id: "r1", status: "substituted", reasonCode: "sick" }, null), []);
  assert.equal(S.substitutionsHref("/owner/substitutions", "r 1"), "/owner/substitutions?request=r%201");
  assert.equal(S.substitutionsPathFor({ org_role: "owner" }), "/owner/substitutions");
  assert.equal(S.substitutionsPathFor({ org_role: "admin" }), "/admin/substitutions");
  const html = renderToStaticMarkup(React.createElement(LessonChips, { marks: S.lessonMarks({ id: "r1", status: "pending", reasonCode: "sick" }, null), requestHref: (id) => S.substitutionsHref("/admin/substitutions", id) }));
  assert.match(html, /href="\/admin\/substitutions\?request=r1"/);
  assert.match(textOf(html), /Ждёт замены/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(LessonChips, { marks: S.lessonMarks({ id: "r1", status: "pending", reasonCode: "sick" }, null, { manager: false }) })), /href=/, "a teacher's chip is not a link");
  assert.equal(renderToStaticMarkup(React.createElement(LessonChips, { marks: [] })), "");
  assert.equal(S.WAITING_MARK, "Ждёт замены");
  assert.equal(S.removalRequestsText(2), "Запросов на замену этого сотрудника (2) будут закрыты.");
});

test("[S1] the student's card: «Замена: <учитель>», «Урок отменён», «Урок перенесён на …» and the note under the summary - never a reason", () => {
  const notices = [...fx("b2c2_student_notices"), { lessonId: "l9", date: "2026-11-02", groupId: "g", groupName: "9-А", kind: "cancelled" }];
  const lessons = [
    { lesson_id: "lesson-l1", date: "2026-10-26", group_name: "9-А", status: "present", teacherName: "Рахимов Т.", isSubstitution: true },
    { lesson_id: "lesson-l3", date: "2026-10-27", group_name: "7-Б", status: "absent", teacherName: "Иванов И.", isSubstitution: false },
  ];
  const html = renderToStaticMarkup(React.createElement(StudentLessonsList, { lessons, notices }));
  const text = textOf(html);
  assert.match(text, /Замена: Рахимов Т\./);
  assert.equal((text.match(/Замена:/g) || []).length, 1, "only the lesson held by a substitute");
  assert.match(text, /Урок перенесён на чт, 29\.10, 16:00/);
  assert.match(text, /Урок отменён/);
  assert.match(text, /Отменённые и перенесённые уроки в посещаемость не входят\./);
  assert.match(text, /Был/);
  assert.match(text, /Не был/);
  assert.ok(text.indexOf("пн, 26.10") < text.indexOf("вт, 27.10") && text.indexOf("вт, 27.10") < text.indexOf("ср, 28.10"), "by date");
  assert.doesNotMatch(text, /Температура|Личные обстоятельства|Болезнь/, "the reason of a substitution never reaches the student's card");
  assert.equal(renderToStaticMarkup(React.createElement(StudentLessonsList, { lessons: [], notices: [] })), "");
  assert.equal(S.studentLessonLabel({ isSubstitution: false, teacherName: "Иванов И." }), null);
  assert.deepEqual(fx("b2c2_student_notices").map((n) => Object.keys(n).sort()), [["date", "groupId", "groupName", "kind", "lessonId", "movedTo"]], "the notice has no reason field");
});

// ── the access rule of the lead (21.10): a substitute has no group page ─────────────────────────────

test("[access] a substitute's roster comes from the journal: the group page is never called, no phone, no level, no diagnostics", async () => {
  const journal = { statuses: {}, records: {}, lessonRoster: [
    { id: "s1", first_name: "Али", last_name: "Валиев", full_name: "Валиев Али", display_id: "AL15-001", class_level: 9 },
    { id: "s2", first_name: "Дина", last_name: "Юсупова", full_name: "Юсупова Дина", display_id: null, class_level: null },
  ] };
  let groupCalls = 0;
  const source = S.rosterSource({ isManager: false, groupId: "g-9a", ownGroupIds: ["g-7b"] });
  assert.equal(source, "journal", "his lesson's group is not among «his» groups");
  const [group, att] = await S.readLessonRoster({
    source, groupId: "g-9a",
    getGroup: async () => { groupCalls += 1; throw Object.assign(new Error("403"), { status: 403 }); },
    getJournal: async () => journal,
  });
  assert.equal(groupCalls, 0, "GET /org/groups/{id} is not called for a substitute");
  assert.equal(group, null);
  const students = S.rosterFromJournal(att.lessonRoster);
  assert.deepEqual(students.map((s) => s.full_name), ["Валиев Али", "Юсупова Дина"]);
  for (const student of students) {
    assert.equal(student.student_phone, null, "no phone");
    assert.equal(student.last_theta, null, "no diagnostics");
    assert.equal(student.last_level, null);
    assert.equal(student.last_diagnosed_at, null);
  }
  assert.equal(students[0].display_id, "AL15-001");
  assert.equal(students[1].class_level, 0);
  assert.equal(S.showsGroupLinks(source), false, "no «Перейти в группу»");
  assert.deepEqual(S.rosterFromJournal(null), []);
});

test("[access] the group's own teacher and the managers read the group page as before, and still the journal in parallel", async () => {
  const calls = [];
  for (const [isManager, own] of [[false, ["g-9a"]], [true, []]]) {
    const source = S.rosterSource({ isManager, groupId: "g-9a", ownGroupIds: own });
    assert.equal(source, "group");
    const [group, att] = await S.readLessonRoster({
      source, groupId: "g-9a",
      getGroup: async (id) => { calls.push(`group:${id}`); return { students: [{ id: "s1" }] }; },
      getJournal: async () => { calls.push("journal"); return { ok: true }; },
    });
    assert.deepEqual(group.students, [{ id: "s1" }]);
    assert.equal(att.ok, true);
    assert.equal(S.showsGroupLinks(source), true);
  }
  assert.deepEqual(calls, ["group:g-9a", "journal", "group:g-9a", "journal"]);
});

test("[access] both lesson panels go through the helper: the group page is read only by readLessonRoster, and its link is shown only with the group source", () => {
  for (const file of ["src/app/teacher/dashboard/page.tsx", "src/app/teacher/schedule/page.tsx"]) {
    const page = read(file);
    assert.match(page, /rosterSource\(/, file);
    assert.match(page, /readLessonRoster\(/, file);
    assert.match(page, /source === "journal"/, file);
    assert.match(page, /rosterFromJournal\(att\?\.lessonRoster\)/, file);
    assert.match(page, /showsGroupLinks\(activeRosterSource\)/, file);
    assert.equal((page.match(/orgApi\.getGroup\(/g) || []).length, 1, `${file}: the one call of the group page is inside readLessonRoster`);
    assert.match(page, /getGroup: \(id\) => orgApi\.getGroup\(id\)/, file);
  }
  // no screen of the substitution pack asks for the group page or the students' cards
  for (const file of walk(path.join(root, "src/components/substitutions")).map((f) => path.relative(root, f))) {
    const code = read(file);
    assert.doesNotMatch(code, /getGroup\(|\/teacher\/students|student_phone/, file);
  }
});

test("[access] the lesson of a substitute: the journal is the only source of his lessons, so no «Мои группы» link is built from a substitution", () => {
  const dashboard = read("src/app/teacher/dashboard/page.tsx");
  // the group cards of the dashboard come from `summary.groups` (own groups only); a substituted lesson never adds one
  assert.match(dashboard, /summary\.groups\.filter\(\(group\) => group\.status === "active"\)/);
  assert.doesNotMatch(read("src/lib/substitutions.ts"), /\/teacher\/groups/);
});

// ── the menu and the routes ─────────────────────────────────────────────────────────────────────

test("[M1] «Замены» is in the owner's and the administrator's menu with the counter of waiting requests; not in the demo, not for a teacher", () => {
  const sidebar = read("src/components/layout/sidebar.tsx");
  assert.match(sidebar, /href: "\/admin\/substitutions", label: "Замены", icon: Repeat2, badge: pendingSubstitutions, badgeLabel: BADGE_LABEL/);
  assert.match(sidebar, /href: "\/owner\/substitutions", label: "Замены", icon: Repeat2, badge: pendingSubstitutions, badgeLabel: BADGE_LABEL/);
  assert.equal(S.BADGE_LABEL, "Ждут решения");
  // the same gate as «Посещаемость»: owner and administrator, never the demo
  assert.match(sidebar, /const showExcuses = !DEMO_MODE && \(rawRole === "owner" \|\| role === "admin"\)/);
  assert.equal((sidebar.match(/\.\.\.\(showExcuses\s*\? \[\{ href: "\/(admin|owner)\/substitutions"/g) || []).length, 2);
  assert.doesNotMatch(sidebar.slice(sidebar.indexOf("const teacherNav"), sidebar.indexOf("const navItems")), /substitutions/);
  // the counter is read on a route change, on return to the tab, every 5 minutes, and by force after an action
  assert.match(sidebar, /void refreshSubstitutions\(\);/);
  const badge = read("src/lib/substitution-badge.ts");
  assert.match(badge, /substitutionsApi\.summary\(\)/);
  assert.match(badge, /if \(DEMO_MODE\) return Promise\.resolve\(\);/);
  assert.match(read("src/components/auth/SessionSync.tsx"), /useSubstitutionBadge\.getState\(\)\.reset\(\)/);
  assert.match(read("src/components/substitutions/substitutions-page.tsx"), /useSubstitutionBadge\.getState\(\)\.refresh\(true\)/);
  assert.equal(require(path.join(root, "src/lib/nav-badge.ts")).navBadgeText(120), "99+");
  assert.ok(fs.existsSync(path.join(root, "src/app/owner/substitutions/page.tsx")));
  assert.ok(fs.existsSync(path.join(root, "src/app/admin/substitutions/page.tsx")));
  assert.match(read("src/app/owner/substitutions/page.tsx"), /role="owner"/);
  assert.match(read("src/app/admin/substitutions/page.tsx"), /role="admin"/);
});

test("[M2] the page: table header rules (first column left, short data centred, action right), tabs, filters and the bulk panel are wired", () => {
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /PENDING_ALIGNS: CellAlign\[\] = \["left", "center", "left", "center", "right"\]/);
  assert.match(page, /DECIDED_ALIGNS: CellAlign\[\] = \["left", "center", "left", "center"\]/);
  assert.match(page, /labels=\{pendingTab \? \["Урок", "Преподаватель", "Причина", "Срок", ""\] : \["Урок", "Преподаватель", "Причина", "Решение"\]\}/);
  for (const phrase of ["Только срочные", "Группа или преподаватель", "Выбрано: ", "Назначить замену", "Отменить уроки", "Отклонить", "Показать", "Решить", "Выбрать все", "Загрузка…"]) {
    assert.ok(page.includes(phrase) || read("src/components/substitutions/bulk-dialog.tsx").includes(phrase), phrase);
  }
  assert.match(page, /Замены<\/h1>/);
  assert.match(page, /Запросы преподавателей, которые не смогут провести урок/);
  // the decision patches the row in place and the list heals by a silent read; a 409 patches with the fresh item
  assert.match(page, /onStale=\{stale\}/);
  assert.match(page, /guard\.patched\(\)/);
  assert.match(page, /searchParams\?\.get\("request"\)/);
});

test("[T1] the lesson panels carry the control and the teacher's dashboard carries the block and the dialog for several lessons", () => {
  const dashboard = read("src/app/teacher/dashboard/page.tsx");
  const schedule = read("src/app/teacher/schedule/page.tsx");
  for (const [name, page] of [["dashboard", dashboard], ["schedule", schedule]]) {
    assert.match(page, /<TeacherLessonControls/, name);          // «Не смогу провести» (RequestControl) + P1.1 «Перенести урок»
    assert.match(page, /mark=\{activeRequestMark\}/, name);
    assert.match(page, /att\?\.substitutionRequests\?\.\[lessonKey\]/, name);
    assert.match(page, /substituteGroupLabel\(activeLesson\.groupName\)/, name);
  }
  assert.match(dashboard, /<TeacherRequestsBlock/);
  assert.match(dashboard, /canAskForSubstitute/);
  assert.match(dashboard, /<RequestDialog\s+open=\{newRequestOpen\}\s+lesson=\{null\}/);
  assert.match(schedule, /occurrenceChips\(l, user\?\.id, \{ manager: isManager \}\)/);
  // the journal and the schedule overview of the owner / administrator carry the marks
  assert.match(read("src/components/groups/group-attendance-journal.tsx"), /lessonMarks\(attendanceData\?\.substitutionRequests\?\.\[key\]/);
  assert.match(read("src/components/groups/group-schedule-overview.tsx"), /lessonMarks\(attendance\?\.substitutionRequests\?\.\[key\]/);
  assert.match(read("src/components/students/student-profile-view.tsx"), /<StudentLessonsList lessons=\{attendanceSummary\.lessons\} notices=\{attendanceSummary\.notices\}/);
});

// ── integration into n13-int: «Предложить коллегу» reads GET /org/substitutions/colleagues ─────────────────────

test("[int] the request dialog names colleagues from /org/substitutions/colleagues (a teacher may read it), not from /org/members", () => {
  const dialog = fs.readFileSync(path.join(root, "src/components/substitutions/request-dialog.tsx"), "utf8");
  assert.match(dialog, /substitutionsApi\.colleagues\(\)/);
  assert.doesNotMatch(dialog, /listMembers/);
  const api = fs.readFileSync(path.join(root, "src/lib/api.ts"), "utf8");
  assert.match(api, /\/auth\/org\/substitutions\/colleagues/);
  assert.ok(contract.paths["/org/substitutions/colleagues"].get, "the route is in the contract");
  assert.ok(contract.components.schemas.ColleagueOut.properties.role);
});

test("[int] the journal and the schedule mark a moved / cancelled original by substitutionOutcome; the import counts carry openings", () => {
  const journal = fs.readFileSync(path.join(root, "src/components/groups/group-attendance-journal.tsx"), "utf8");
  assert.match(journal, /lesson\.substitutionOutcome/);
  assert.equal(contract.paths["/org/substitutions/colleagues"].get.responses["200"].content["application/json"].schema.items.$ref, "#/components/schemas/ColleagueOut");
  const importFixture = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/logB/c3_commit_ok.json"), "utf8"));
  assert.equal(importFixture.counts.openings, 0);
});

test("narrowToFrozenRoster: the list read before the start loses the student who is on a pause (the frozen roster decides)", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(S.narrowToFrozenRoster(list, ["a", "c"]).map((s) => s.id), ["a", "c"]);
  assert.equal(S.narrowToFrozenRoster(list, undefined), list, "no frozen roster yet: the list stays");
  assert.deepEqual(S.narrowToFrozenRoster(list, []), [], "an empty frozen roster is a roster");
});
