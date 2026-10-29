// #159 (29.10), front: A the money of a teacher is decided by the owner and by an admin WITH the right (chains Ч1-Ч4), B a make-up never waits for a decision (Ч5), C «Запланирован» instead of
// «Лобби» on every screen of an exam (Ч8-Ч10, LESSONS 56).  Spec: artifacts/analysis/P159_SPEC.md; contract P154_API.md v4; LESSONS 17, 45, 46, 51, 53, 56.
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
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const text = (html) => html.replace(/<[^>]+>/g, "|").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\|+/g, "|");

const O = require(path.join(root, "src/lib/one-off.ts"));
const L = require(path.join(root, "src/lib/exam-lobby.ts"));
const DEC = require(path.join(root, "src/components/substitutions/one-off-decisions.tsx"));
const refusal = (code, detail = {}, status = 422) => Object.assign(new Error("server text"), { code, status, detail: { code, message: "server text", ...detail } });

const decision = (over = {}) => ({
  lessonId: "one-off-1", groupId: "g1", groupName: "7-А", lessonDate: "2026-11-05", startTime: "16:00", endTime: "17:00", purpose: "extra",
  title: "Дополнительный урок — оплатить преподавателю?", teacher: { id: "t1", name: "Рахимов Т." }, createdBy: { id: "t1", name: "Рахимов Т.", role: "teacher" },
  studentsPresent: 3, studentsTotal: 10, payrollSheet: null, ...over,
});
const block = (props) => renderToStaticMarkup(React.createElement(DEC.OneOffDecisionsBlock, { items: [decision()], loading: false, error: null, canDecide: true, onRetry() {}, onDecided() {}, showToast() {}, ...props }));

// ── A: who decides the money (Ч1-Ч4, invariant 1) ──────────────────────────────────────────────────────────

test("A: canDecideMoney - the owner; an admin only while the profile says payments_access true; an absent field is no right (LESSONS 17)", () => {
  assert.equal(O.canDecideMoney({ org_role: "owner" }), true);
  assert.equal(O.canDecideMoney({ org_role: "admin", payments_access: true }), true);
  for (const user of [{ org_role: "admin" }, { org_role: "admin", payments_access: false }, { org_role: "admin", payments_access: null }, { org_role: "teacher", payments_access: true },
    { org_role: null, role: "owner" }, { role: "admin", payments_access: true }, {}, null, undefined]) assert.equal(O.canDecideMoney(user), false, JSON.stringify(user));
});

test("Ч1: an admin without the right sees the rows, the status and the words about the owner - and no buttons, no window", () => {
  const html = block({ canDecide: false });
  const plain = text(html);
  assert.match(plain, /Дополнительные уроки: оплата преподавателю · 1/);
  assert.match(plain, /Дополнительный урок — оплатить преподавателю\?/);
  assert.match(plain, /7-А · чт 05\.11 · 16:00–17:00/);
  assert.match(plain, /Решение об оплате принимает владелец или администратор с правом на оплаты/);
  assert.doesNotMatch(html, /<button/, "not a single button");
  assert.doesNotMatch(plain, /Оплатить|Не оплачивать/);
  // with the right the same rows have both buttons and the old hint
  const withRight = block({ canDecide: true });
  assert.match(withRight, /Оплатить<\/button>/);
  assert.match(withRight, /Не оплачивать<\/button>/);
  assert.match(text(withRight), /Оплатить преподавателю или нет — решаете вы/);
  assert.doesNotMatch(text(withRight), /Решение об оплате принимает владелец/);
});

test("Ч3: the right is taken away between the window and the press - the server's 403 has words, closes the window and takes the buttons away; nothing hangs", () => {
  assert.equal(O.oneOffErrorText(refusal("MONEY_RIGHT_REQUIRED", {}, 403)), "Решение об оплате принимает владелец или администратор с правом на оплаты");
  assert.ok(O.ONE_OFF_CODES.includes("MONEY_RIGHT_REQUIRED"));
  assert.equal(O.isMoneyRightRefusal(refusal("MONEY_RIGHT_REQUIRED", {}, 403)), true);
  assert.equal(O.isMoneyRightRefusal(refusal("ALREADY_DECIDED", {}, 409)), false);
  assert.equal(O.isAlreadyDecided(refusal("MONEY_RIGHT_REQUIRED", {}, 403)), false, "it is not «решение уже принято»: the row stays");
  const source = read("src/components/substitutions/one-off-decisions.tsx");
  assert.match(source, /isMoneyRightRefusal\(failure\)[\s\S]{0,400}onRightLost\(\)[\s\S]{0,400}setDialog\(null\)/, "the window is closed, the right is lost");
  assert.match(source, /const mayDecide = canDecide && !rightLost;/);
  assert.match(source, /finally \{[\s\S]{0,120}sending\.current = false;[\s\S]{0,60}setBusy\(false\)/, "the button is free again");
  assert.match(read("src/components/substitutions/substitutions-page.tsx"), /canDecide=\{canDecideMoney\(user\)\}/, "the page gives the right from the profile");
});

test("Ч4: an admin without the right gets the radio of a teacher («Попросить оплатить» by default); with the right - «Без оплаты / Оплачивается»", () => {
  const noRight = O.oneOffRoleOf({ org_role: "admin" });
  assert.equal(noRight, "admin_ask");
  assert.deepEqual(O.moneyChoicesFor(noRight).map((c) => [c.value, c.label]), [["wait", "Попросить оплатить"], ["none", "Без оплаты"]]);
  assert.deepEqual(O.emptyChoice(noRight), { purpose: null, money: "wait", target: "" });
  assert.deepEqual(O.choicePayload({ purpose: "extra", money: "wait", target: "" }), { purpose: "extra", money: "wait" });
  assert.equal(O.choiceProblem({ purpose: "extra", money: "paid", target: "" }, noRight, null), "Выберите оплату преподавателю: без оплаты или оплачивается", "paid is not offered: the form refuses it before the server does");
  const withRight = O.oneOffRoleOf({ org_role: "admin", payments_access: true });
  assert.equal(withRight, "manager");
  assert.deepEqual(O.moneyChoicesFor(withRight).map((c) => c.value), ["none", "paid"]);
  assert.equal(O.oneOffRoleOf({ org_role: "owner" }), "manager");
  // every place that opens the form gives the profile's right, not only the role
  assert.match(read("src/components/groups/group-schedule-overview.tsx"), /oneOffRoleOf\(\{ org_role: viewerRole, payments_access: user\?\.payments_access \}\)/);
  assert.match(read("src/app/teacher/schedule/page.tsx"), /const oneOffRole = oneOffRoleOf\(user\);/);
  assert.equal(O.oneOffErrorText(refusal("MONEY_RIGHT_REQUIRED", {}, 403)).includes("MONEY"), false);
});

test("Ч4: «Просит оплатить» names a teacher and an admin without the right; the owner's own lesson names nobody", () => {
  assert.equal(O.decisionAskedLine({ purpose: "extra", createdBy: { id: "a", name: "Админов А.", role: "admin" } }), "Просит оплатить: Админов А.");
  assert.equal(O.decisionAskedLine({ purpose: "extra", createdBy: { id: "t", name: "Рахимов Т.", role: "teacher" } }), "Просит оплатить: Рахимов Т.");
  assert.equal(O.decisionAskedLine({ purpose: "extra", createdBy: { id: "o", name: "Тестов О.", role: "owner" } }), null);
});

// ── B: a make-up is an ordinary lesson (Ч5, invariant 2) ───────────────────────────────────────────────────

test("B: nothing on the screens speaks of an «empty make-up» that waits for a decision; the queue is for additional lessons", () => {
  for (const file of ["src/lib/one-off.ts", "src/lib/payroll.ts", "src/lib/payroll-help.ts", "src/components/substitutions/one-off-decisions.tsx", "src/components/substitutions/substitutions-page.tsx"]) {
    const visible = read(file).split("\n").filter((line) => /["'`]/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
    assert.doesNotMatch(visible, /пуст\w+ отработк|отработк\w* без учеников|Отработка без учеников/i, file);
  }
  assert.equal(O.DECISIONS_GROUP_TITLE, "Дополнительные уроки: оплата преподавателю");
  assert.equal(O.decisionQuestion({ title: "" }), "Дополнительный урок — оплатить преподавателю?");
  const payroll = require(path.join(root, "src/lib/payroll.ts"));
  assert.doesNotMatch(payroll.UNDECIDED_MARK_HINT + payroll.NO_PAY_MARK_HINT, /отработк/i, "the hints of the sheet name no make-up");
  assert.match(O.MAKEUP_MONEY_NOTE, /Отработка — обычный урок/);
});

// ── C: «Запланирован» instead of «Лобби» (Ч8-Ч10, invariant 3) ────────────────────────────────────────────

const TODAY = "2026-10-29";
const exam = (over = {}) => ({ exam_id: "e", status: "lobby", group_id: "g1", scheduled_lesson_id: "lesson-1", scheduled_lesson_date: "2026-11-03", ...over });
const stateOf = (e, lesson) => L.examListState(e, TODAY, lesson);

test("Ч8: an exam on a lesson in 5 days is «Запланирован · день» everywhere: not in the lobby counter, not «Лобби открыто»", () => {
  const e = exam({ scheduled_lesson_date: "2026-11-03" });
  assert.equal(stateOf(e, undefined), "upcoming");
  assert.equal(L.lobbyBucketOf("upcoming"), "scheduled");
  assert.equal(L.lobbyExamLabel("upcoming", "вт, 3 нояб."), "Запланирован · вт, 3 нояб.");
  assert.equal(L.examTabOf(e, "upcoming"), "scheduled");
  assert.equal(L.needsLessonStatus(e, TODAY), false, "a later day is decided by the date alone: no request");
  assert.deepEqual(L.lobbyCounts([e, exam({ exam_id: "f", scheduled_lesson_date: "2026-11-10" })], (x) => stateOf(x, undefined)), { lobby: 0, scheduled: 2, passed: 0 });
  // the lesson status of a later day, even if one is sent, never opens the lobby
  assert.equal(stateOf(e, "in_progress"), "upcoming");
});

test("Ч9: an exam of today whose lesson is on is «Лобби открыто» (and only that one)", () => {
  const e = exam({ scheduled_lesson_date: TODAY });
  assert.equal(stateOf(e, "in_progress"), "lobby");
  assert.equal(L.lobbyExamLabel("lobby", "чт, 29 окт."), "Лобби открыто");
  assert.equal(L.examTabOf(e, "lobby"), "lobby");
  assert.equal(L.needsLessonStatus(e, TODAY), true);
  assert.deepEqual(L.lobbyCounts([e], (x) => stateOf(x, "in_progress")), { lobby: 1, scheduled: 0, passed: 0 });
});

test("Ч10: an exam of today whose lesson has not begun - or whose status is not known - is «Запланирован · сегодня», never «Лобби»", () => {
  const e = exam({ scheduled_lesson_date: TODAY });
  for (const lesson of ["scheduled", undefined, null, "completed", "cancelled"]) {
    const state = stateOf(e, lesson);
    assert.notEqual(state, "lobby", String(lesson));
    assert.equal(state, "today");
    assert.equal(L.lobbyExamLabel(state, "чт, 29 окт."), "Запланирован · сегодня");
    assert.equal(L.lobbyBucketOf(state), "scheduled");
  }
});

test("C: a lobby exam whose lesson has passed is «Занятие прошло» among the current ones - in no lobby counter; other statuses are not touched", () => {
  const past = exam({ scheduled_lesson_date: "2026-10-27" });
  assert.equal(stateOf(past, undefined), "needs_resolution");
  assert.equal(L.lobbyExamLabel("needs_resolution", ""), "Занятие прошло");
  assert.equal(L.examTabOf(past, "needs_resolution"), "active");
  assert.deepEqual(L.lobbyCounts([past], (x) => stateOf(x, undefined)), { lobby: 0, scheduled: 0, passed: 1 });
  assert.equal(L.examTabOf(exam({ status: "active" }), "active"), "active");
  assert.equal(L.examTabOf(exam({ status: "print_ready" }), "upcoming"), "active");
  assert.equal(L.examTabOf(exam({ status: "closed" }), "closed"), "closed");
  assert.equal(L.examTabOf(exam({ status: "archived" }), "archived"), "archived");
  assert.equal(L.examTabOf(exam({ status: "draft" }), "upcoming"), "draft");
  assert.equal(L.examTabOf(exam({ status: "lobby", group_id: null }), "upcoming"), "draft", "an exam without a group is a template of the library");
  assert.equal(L.examTabOf(exam({ status: "lobby", scheduled_lesson_date: null }), stateOf(exam({ scheduled_lesson_date: null }), undefined)), "scheduled", "no lesson date: it cannot be entered, so it is «Запланирован»");
});

test("C: a counter is what the tab shows - for every mix of lobby exams the tab filter and the counter agree", () => {
  const days = ["2026-10-20", "2026-10-29", "2026-10-30", "2026-11-03", "2026-12-01", null];
  const mix = [];
  days.forEach((day, i) => ["lobby", "active", "draft", "closed", "print_ready"].forEach((status) => mix.push(exam({ exam_id: `${status}-${i}`, status, scheduled_lesson_date: day }))));
  for (const lesson of [undefined, "scheduled", "in_progress", "completed"]) {
    const of = (e) => stateOf(e, e.scheduled_lesson_date === TODAY ? lesson : undefined);
    const tally = { active: 0, lobby: 0, scheduled: 0, draft: 0, closed: 0, archived: 0 };
    for (const e of mix) tally[L.examTabOf(e, of(e))] += 1;
    for (const tab of Object.keys(tally)) assert.equal(mix.filter((e) => L.examTabOf(e, of(e)) === tab).length, tally[tab], tab);
    assert.equal(Object.values(tally).reduce((a, b) => a + b, 0), mix.length, "every exam is in exactly one tab");
    const kinds = L.lobbyCounts(mix, of);
    assert.equal(kinds.lobby, tally.lobby);
    assert.equal(kinds.lobby + kinds.scheduled + kinds.passed, mix.filter((e) => e.status === "lobby").length);
  }
});

test("C (LESSONS 56): no screen of an exam says «Ожидает запуска» / «В лобби» / the bare «Лобби» as a status; every screen that shows the lobby status asks the one function", () => {
  const screens = ["src/app/admin/exams/page.tsx", "src/app/admin/exams/[id]/page.tsx", "src/app/teacher/exams/page.tsx", "src/app/teacher/exams/[id]/page.tsx", "src/app/teacher/groups/[id]/page.tsx"];
  for (const file of screens) {
    const source = read(file);
    assert.match(source, /examListState|dashboardExamState/, `${file} asks the state of the exam by its lesson`);
    assert.match(source, /use-exam-lessons/, `${file} asks the status of the lesson of today`);
    assert.doesNotMatch(source, /Ожидает запуска|Ожидают запуска|"В лобби"|В комнате ожидания \(Лобби\)|\? "Лобби"\s*:/, file);
  }
  assert.doesNotMatch(read("src/lib/status-registry.ts"), /Ожидает запуска/);
  // the monitor of the administrator: two cards instead of one, both made of the list the filter shows
  const admin = read("src/app/admin/exams/page.tsx");
  assert.match(admin, /label: "Лобби открыто"/);
  assert.match(admin, /label: "Запланированы"/);
  assert.match(admin, /lobbyCounts\(todayLobby, stateOf\)/);
  assert.match(admin, /filter === "lobby" \? todayLobby\.filter\(\(exam\) => bucketOfExam\(exam\) === "lobby"\)/);
  // the teacher: the library and the group have the tab «Запланированы» and count by the same function
  for (const file of ["src/app/teacher/exams/page.tsx", "src/app/teacher/groups/[id]/page.tsx"]) {
    assert.match(read(file), /examTabOf\(/, file);
    assert.match(read(file), /Запланированы/, file);
  }
  assert.match(read("src/app/teacher/dashboard/page.tsx"), /dashboardExamState\(/, "the dashboard keeps its own function, which the lists call");
});
