// #154 (29.10), front: «Разовые уроки: отработка / дополнительный» + three defects of prod 28.10 (type of the organisation, the lobby of an exam of a later day,
// requests of an administrator without the right to money).
// Spec: artifacts/analysis/P154_SPEC.md; contract artifacts/analysis/P154_API.md v2; LESSONS 16, 17, 45, 46, 48.
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
const P = require(path.join(root, "src/lib/payroll.ts"));
const S = require(path.join(root, "src/lib/substitutions.ts"));

const refusal = (code, detail = {}, status = 422) => Object.assign(new Error("server text"), { code, status, detail: { code, message: "server text", ...detail } });
const LATIN = /[A-Z]{3,}_[A-Z_]+/;      // a raw code like MAKEUP_EXISTS

// ── A: the words of every refusal (LESSONS 46) ──────────────────────────────────────────────────────────────

test("A: every code of the contract has plain Russian words, never the code", () => {
  for (const code of O.ONE_OFF_CODES) {
    const words = O.oneOffErrorText(refusal(code));
    assert.ok(words, code);
    assert.doesNotMatch(words, LATIN, code);
    assert.doesNotMatch(words, /[A-Za-z]/, `${code}: ${words}`);
    assert.doesNotMatch(words, /\(а\)/, code);
    assert.notEqual(words, "server text", code);
  }
  assert.equal(O.oneOffErrorText(refusal("SOMETHING_ELSE")), null, "a code of another feature is left to its own words");
  assert.equal(O.oneOffErrorText(new Error("plain")), null);
  assert.equal(O.oneOffErrorText(null), null);
});

test("A: MAKEUP_NOT_ALLOWED - one sentence per reasonCode, all different", () => {
  const reasons = ["NOT_FOUND", "NOT_CANCELLED", "ONE_OFF", "HOLIDAY", "NO_KIND", "MOVED", "TOO_OLD"];
  const words = reasons.map((reasonCode) => O.oneOffErrorText(refusal("MAKEUP_NOT_ALLOWED", { reasonCode })));
  assert.equal(new Set(words).size, reasons.length);
  assert.match(words[3], /дополнительный урок/i);
  assert.match(words[6], /60 дней/);
  const unknown = O.oneOffErrorText(refusal("MAKEUP_NOT_ALLOWED", { reasonCode: "NEW_REASON" }));
  assert.equal(unknown, "Этот урок отработать нельзя");
});

test("A: the slot codes, the clashes and the other refusals are worded for a lesson", () => {
  assert.equal(O.oneOffErrorText(refusal("MAKEUP_EXISTS", {}, 409)), "По уроку уже назначена отработка: сначала отмените её");
  assert.match(O.oneOffErrorText(refusal("MOVE_IN_PAST")), /уже прошло/);
  assert.match(O.oneOffErrorText(refusal("MOVE_TOO_FAR")), /60 дней/);
  assert.match(O.oneOffErrorText(refusal("MOVE_SAME_SLOT")), /другую дату или время/);
  assert.match(O.oneOffErrorText(refusal("SERIES_ENDED")), /прекращается раньше/);
  assert.equal(O.oneOffErrorText(refusal("GROUP_BUSY", {}, 409)), "У группы уже есть урок в это время");
  assert.equal(
    O.oneOffErrorText(refusal("GROUP_BUSY", { conflicts: [{ date: "2026-11-05", startTime: "16:00", endTime: "17:00" }, { date: "2026-11-06", startTime: "16:00", endTime: "17:00" }], total: 2 }, 409)),
    "У группы уже есть урок в это время: чт, 05.11 16:00–17:00 и ещё 1",
  );
  assert.match(O.oneOffErrorText(refusal("TEACHER_BUSY", { conflicts: [{ date: "2026-11-05", startTime: "16:00", endTime: "17:00", groupName: "7-А", withGroupName: "8-Б" }] }, 409)), /^У преподавателя в это время уже есть урок\. чт, 05\.11 16:00–17:00/);
  assert.match(O.oneOffErrorText(refusal("TEACHER_REQUIRED")), /нет преподавателя/);
  assert.equal(O.oneOffErrorText(refusal("LESSON_ALREADY_STARTED", {}, 409)), "Урок уже начался: удалить его нельзя");
  assert.match(O.oneOffErrorText(refusal("ALREADY_DECIDED", {}, 409)), /уже принято/);
  assert.match(O.oneOffErrorText(refusal("LESSON_NOT_COMPLETED", {}, 409)), /ещё не проведён/);
  assert.equal(O.oneOffRefusalText(refusal("OTHER"), "запас"), "server text", "the server's own text for a code that is not ours");
  assert.equal(O.oneOffRefusalText(null, "запас"), "запас");
  assert.ok(O.isAlreadyDecided(refusal("ALREADY_DECIDED")) && O.isAlreadyDecided(refusal("ONE_OFF_NOT_FOUND")) && !O.isAlreadyDecided(refusal("TEACHER_BUSY")));
});

test("A: both forms and the lesson sheet use the same words (one function)", async () => {
  const W = require(path.join(root, "src/lib/weekly-lessons.ts"));
  assert.equal(W.refusalText(refusal("MAKEUP_EXISTS", {}, 409), "запас", "one_off"), O.MAKEUP_EXISTS_TEXT);
  assert.equal(W.refusalText(refusal("MAKEUP_NOT_ALLOWED", { reasonCode: "MOVED" }), "запас", "one_off"), "Урок перенесён — отрабатывать нечего");
  // the weekly change keeps its W1 sentence for SERIES_ENDED; the same code of a make-up is worded for a lesson
  assert.match(W.refusalText(refusal("SERIES_ENDED", { message: "Постоянный урок прекращается раньше этой даты: перенесите на более раннюю дату" }), "запас"), /перенесите/);
  assert.doesNotMatch(W.refusalText(refusal("SERIES_ENDED"), "запас", "one_off"), /перенесите/);
  // a busy teacher keeps the two-clash text of the weekly form
  assert.match(W.refusalText(refusal("TEACHER_BUSY", { conflicts: [{ date: "2026-11-05", startTime: "16:00", endTime: "17:00", groupName: "7-А", withGroupName: "8-Б" }] }, 409), "запас"), /^У преподавателя в это время уже есть урок\./);
  // «Вернуть урок» / смена вида отмены
  assert.equal(S.substitutionErrorText(refusal("MAKEUP_EXISTS", {}, 409)), O.MAKEUP_EXISTS_TEXT);
  assert.equal(S.substitutionErrorText(refusal("RESTORE_MAKEUP_TARGET", {}, 409)), O.RESTORE_MAKEUP_TARGET_TEXT);
  for (const file of ["src/app/teacher/schedule/page.tsx", "src/lib/weekly-lessons.ts"]) assert.doesNotMatch(read(file), /scheduleErrorText\(err, "Не удалось создать урок/);
});

// ── A: the rights of each role (LESSONS 16, 17, 45) ─────────────────────────────────────────────────────────

test("A: the money of an additional lesson by the role; no role is guessed", () => {
  assert.deepEqual(O.moneyChoicesFor("teacher").map((c) => [c.value, c.label]), [["wait", "Прошу оплатить"], ["none", "Без оплаты"]]);
  assert.deepEqual(O.moneyChoicesFor("manager").map((c) => [c.value, c.label]), [["none", "Без оплаты"], ["paid", "Оплачивается"]]);
  assert.deepEqual(O.moneyChoicesFor(null), []);
  assert.equal(O.oneOffRoleOf({ org_role: "owner" }), "manager");
  assert.equal(O.oneOffRoleOf({ org_role: "admin" }), "manager");
  assert.equal(O.oneOffRoleOf({ org_role: null, role: "owner" }), "manager");
  assert.equal(O.oneOffRoleOf({ org_role: "teacher" }), "teacher");
  for (const odd of [null, undefined, {}, { org_role: "student" }, { role: "parent" }, { org_role: "" }]) assert.equal(O.oneOffRoleOf(odd), null);
  assert.deepEqual(O.emptyChoice("teacher"), { purpose: null, money: "wait", target: "" });
  assert.deepEqual(O.emptyChoice("manager"), { purpose: null, money: null, target: "" });
});

test("A: the choice is checked before the request, and the payload always carries the purpose", () => {
  const candidates = { items: [{ lessonId: "lesson-mon", lessonDate: "2026-11-02", startTime: "10:00", endTime: "11:00", label: "пн 02.11, 10:00–11:00", reason: null }], emptyReason: null };
  const choice = (over) => ({ purpose: null, money: null, target: "", ...over });
  assert.equal(O.choiceProblem(choice({}), "teacher", candidates), O.PURPOSE_REQUIRED_TEXT);
  assert.equal(O.choiceProblem(choice({ purpose: "makeup" }), "teacher", candidates), O.MAKEUP_TARGET_REQUIRED_TEXT);
  assert.equal(O.choiceProblem(choice({ purpose: "makeup", target: "gone|2026-11-01" }), "teacher", candidates), O.MAKEUP_TARGET_REQUIRED_TEXT);
  assert.equal(O.choiceProblem(choice({ purpose: "makeup", target: "lesson-mon|2026-11-02" }), "teacher", candidates), null);
  assert.equal(O.choiceProblem(choice({ purpose: "extra" }), "manager", candidates), O.MONEY_REQUIRED_TEXT, "an owner chooses the money himself");
  assert.equal(O.choiceProblem(choice({ purpose: "extra", money: "paid" }), "teacher", candidates), O.MONEY_REQUIRED_TEXT, "a teacher cannot pay himself");
  assert.equal(O.choiceProblem(choice({ purpose: "extra", money: "wait" }), "manager", candidates), O.MONEY_REQUIRED_TEXT, "«прошу оплатить» is a teacher's");
  assert.equal(O.choiceProblem(choice({ purpose: "extra", money: "wait" }), "teacher", candidates), null);
  assert.equal(O.choiceProblem(choice({ purpose: "extra", money: "paid" }), "manager", candidates), null);
  assert.equal(O.choiceProblem(choice({ purpose: "extra", money: "none" }), null, candidates), O.NO_ONE_OFF_RIGHT_TEXT);
  assert.deepEqual(O.choicePayload(choice({ purpose: "makeup", target: "lesson-mon|2026-11-02", money: "wait" })), { purpose: "makeup", madeUpLessonId: "lesson-mon", madeUpDate: "2026-11-02" });
  assert.deepEqual(O.choicePayload(choice({ purpose: "extra", money: "paid" })), { purpose: "extra", money: "paid" });
  assert.throws(() => O.choicePayload(choice({})), /Выберите/);
});

test("A: createOneOff sends the purpose (and the money / the cancelled lesson) in the body", async () => {
  const W = require(path.join(root, "src/lib/weekly-lessons.ts"));
  const original = global.fetch;
  const bodies = [];
  global.fetch = async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 201, json: async () => ({ id: "one-off-1", warnings: [{ code: "STUDENT_BUSY", message: "У 2 учеников в это время другой урок" }] }) }; };
  try {
    const draft = { startTime: "16:00", endTime: "17:00", format: "offline", room: "", topic: "", color: "blue" };
    const notes = await W.createOneOff("g1", "2026-11-05", draft, { purpose: "extra", money: "wait", target: "" });
    await W.createOneOff("g1", "2026-11-06", draft, { purpose: "makeup", money: "wait", target: "lesson-mon|2026-11-02" });
    assert.deepEqual(notes, ["У 2 учеников в это время другой урок"]);
    assert.equal(bodies[0].purpose, "extra");
    assert.equal(bodies[0].money, "wait");
    assert.equal("madeUpLessonId" in bodies[0], false);
    assert.equal(bodies[1].purpose, "makeup");
    assert.equal(bodies[1].madeUpLessonId, "lesson-mon");
    assert.equal(bodies[1].madeUpDate, "2026-11-02");
    assert.equal("money" in bodies[1], false, "a make-up has no money of its own");
    assert.equal(bodies[0].groupId, "g1");
  } finally {
    global.fetch = original;
  }
});

// ── A: the form ─────────────────────────────────────────────────────────────────────────────────────────────

const PURPOSE = require(path.join(root, "src/components/schedule/one-off-purpose.tsx"));
const item = (over = {}) => ({ lessonId: "lesson-mon", lessonDate: "2026-11-02", startTime: "10:00", endTime: "11:00", label: "пн 02.11, 10:00–11:00", reason: "Преподаватель заболел", ...over });
const formHtml = (props) => text(renderToStaticMarkup(React.createElement(PURPOSE.OneOffPurposeFields, {
  idPrefix: "t", role: "manager", choice: { purpose: null, money: null, target: "" }, onChoice() {}, makeup: { kind: "ready", data: { items: [item()], emptyReason: null } }, onReload() {}, ...props,
})));

test("A: the form asks «Что это за урок?» first; with candidates both choices are open", () => {
  const html = renderToStaticMarkup(React.createElement(PURPOSE.OneOffPurposeFields, {
    idPrefix: "t", role: "manager", choice: { purpose: null, money: null, target: "" }, onChoice() {}, makeup: { kind: "ready", data: { items: [item()], emptyReason: null } }, onReload() {},
  }));
  const plain = text(html);
  assert.match(plain, /Что это за урок\?/);
  assert.match(plain, /Отработка отменённого урока/);
  assert.match(plain, /Дополнительный урок/);
  assert.doesNotMatch(html, /aria-disabled="true"/);
  assert.doesNotMatch(plain, /Оплата преподавателю/, "the money is shown after «Дополнительный»");
});

test("A: no cancelled lessons - the make-up is off and says WHY (the server's sentence)", () => {
  const reason = "Нет отменённых уроков, которые можно отработать: нужен урок по расписанию, отменённый по вине центра за последние 60 дней, без отработки";
  const html = renderToStaticMarkup(React.createElement(PURPOSE.OneOffPurposeFields, {
    idPrefix: "t", role: "teacher", choice: { purpose: null, money: "wait", target: "" }, onChoice() {}, makeup: { kind: "ready", data: { items: [], emptyReason: reason } }, onReload() {},
  }));
  assert.match(html, /data-testid="t-purpose-makeup"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*data-testid="t-purpose-makeup"/);
  assert.ok(text(html).includes(reason));
  // an empty answer without a sentence: the short one
  assert.match(formHtml({ makeup: { kind: "ready", data: { items: [], emptyReason: null } } }), /Нет отменённых уроков, которые можно отработать/);
  // loading / failure
  assert.match(formHtml({ makeup: { kind: "loading" } }), /Ищем отменённые уроки/);
  const failed = formHtml({ makeup: { kind: "error" } });
  assert.match(failed, /Не удалось загрузить отменённые уроки/);
  assert.match(failed, /Повторить/);
});

test("A: the list of cancelled lessons shows date, time and the reason when the server sent it; a teacher without one sees date and time", () => {
  const withReason = formHtml({ choice: { purpose: "makeup", money: null, target: "" }, role: "manager" });
  assert.equal(O.candidateOptionLabel(item()), "пн 02.11, 10:00–11:00 · Преподаватель заболел");
  assert.equal(O.candidateOptionLabel(item({ reason: null })), "пн 02.11, 10:00–11:00");
  assert.equal(O.candidateOptionLabel(item({ reason: "  " })), "пн 02.11, 10:00–11:00");
  assert.match(withReason, /Какой урок отрабатываем/);
  assert.match(withReason, /Выберите отменённый урок/);
  assert.match(withReason, /оплачивается, как обычный урок/);
  const chosen = formHtml({ choice: { purpose: "makeup", money: null, target: "lesson-mon|2026-11-02" } });
  assert.match(chosen, /пн 02\.11, 10:00–11:00 · Преподаватель заболел/);
  const teacherSide = formHtml({ role: "teacher", choice: { purpose: "makeup", money: "wait", target: "lesson-mon|2026-11-02" }, makeup: { kind: "ready", data: { items: [item({ reason: null })], emptyReason: null } } });
  assert.match(teacherSide, /пн 02\.11, 10:00–11:00/);
  assert.doesNotMatch(teacherSide, /заболел/);
});

test("A: «Дополнительный» - the money radios by the role and the line that the students pay nothing", () => {
  const manager = formHtml({ role: "manager", choice: { purpose: "extra", money: null, target: "" } });
  assert.match(manager, /Оплата преподавателю/);
  assert.match(manager, /Без оплаты/);
  assert.match(manager, /Оплачивается/);
  assert.doesNotMatch(manager, /Прошу оплатить/);
  assert.match(manager, /Ученикам дополнительный урок бесплатен/);
  const teacherRaw = renderToStaticMarkup(React.createElement(PURPOSE.OneOffPurposeFields, {
    idPrefix: "t", role: "teacher", choice: { purpose: "extra", money: "wait", target: "" }, onChoice() {}, makeup: { kind: "ready", data: { items: [], emptyReason: null } }, onReload() {},
  }));
  assert.match(teacherRaw, /data-testid="t-money-wait"[^>]*checked=""|checked=""[^>]*data-testid="t-money-wait"/, "«Прошу оплатить» is the teacher's default");
  const teacher = text(teacherRaw);
  assert.match(teacher, /Прошу оплатить/);
  assert.match(teacher, /Без оплаты/);
  assert.doesNotMatch(teacher, /Оплачивается/);
  assert.match(teacher, /Ученикам дополнительный урок бесплатен/);
  // nothing is asked of the money of a make-up
  assert.doesNotMatch(formHtml({ choice: { purpose: "makeup", money: null, target: "" } }), /Оплата преподавателю/);
});

test("A: both forms mount the same fields, always with the role and the group", () => {
  const group = read("src/components/schedule/weekly-lesson-dialogs.tsx");
  const teacher = read("src/app/teacher/schedule/page.tsx");
  for (const [name, source] of [["group page", group], ["teacher page", teacher]]) {
    assert.match(source, /<OneOffPurposeFields/, name);
    assert.match(source, /useMakeupCandidates\(/, name);
    assert.match(source, /choiceProblem\(/, name);
    assert.match(source, /createOneOff\(/, name);
  }
  assert.match(group, /role: OneOffRole \| null;/, "the role of the dialog is required, never a default");
  assert.match(read("src/components/groups/group-schedule-overview.tsx"), /role=\{oneOffRoleOf\(\{ org_role: viewerRole \}\)\}/);
  assert.match(teacher, /const oneOffRole = oneOffRoleOf\(user\);/);
});

// ── A: «Ждут решения» ───────────────────────────────────────────────────────────────────────────────────────

const DEC = require(path.join(root, "src/components/substitutions/one-off-decisions.tsx"));
const decision = (over = {}) => ({
  lessonId: "one-off-1", groupId: "g1", groupName: "7-А", lessonDate: "2026-11-05", startTime: "16:00", endTime: "17:00", purpose: "extra",
  title: "Дополнительный урок — оплатить преподавателю?", teacher: { id: "t1", name: "Рахимов Т." }, createdBy: { id: "t1", name: "Рахимов Т.", role: "teacher" },
  studentsPresent: 3, studentsTotal: 10, payrollSheet: { month: "2026-11", status: "settled" }, ...over,
});

test("A: the row of money - the title of the server, the lesson, who held it, how many came; no amount; two buttons", () => {
  const html = renderToStaticMarkup(React.createElement(DEC.OneOffDecisionsBlock, { items: [decision()], loading: false, error: null, onRetry() {}, onDecided() {}, showToast() {} }));
  const plain = text(html);
  assert.match(plain, /Дополнительные уроки и отработки без учеников · 1/);
  assert.match(plain, /Дополнительный урок — оплатить преподавателю\?/);
  assert.match(plain, /7-А · чт 05\.11 · 16:00–17:00/);
  assert.match(plain, /Провёл Рахимов Т\. · были 3 из 10/);
  assert.match(plain, /Просит оплатить: Рахимов Т\./);
  assert.match(html, /Оплатить<\/button>/);
  assert.match(html, /Не оплачивать<\/button>/);
  assert.doesNotMatch(plain, /сум|so'm|\d\s?\d{3}\s?(UZS|сум)/i, "no amount anywhere");
  const empty = renderToStaticMarkup(React.createElement(DEC.OneOffDecisionsBlock, { items: [decision({ purpose: "makeup", title: "Отработка без учеников — оплатить преподавателю?", studentsPresent: 0, createdBy: { id: "o", name: "Тестов О.", role: "owner" } })], loading: false, error: null, onRetry() {}, onDecided() {}, showToast() {} }));
  assert.match(text(empty), /Отработка без учеников — оплатить преподавателю\?/);
  assert.doesNotMatch(text(empty), /Просит оплатить/, "only a teacher asks");
});

test("A: no rows - nothing is drawn; a failed read says so with «Повторить»; loading is quiet", () => {
  const block = (props) => renderToStaticMarkup(React.createElement(DEC.OneOffDecisionsBlock, { items: [], loading: false, error: null, onRetry() {}, onDecided() {}, showToast() {}, ...props }));
  assert.equal(block({}), "");
  assert.match(text(block({ error: "x" })), /Повторить/);
  assert.match(text(block({ loading: true })), /Проверяем уроки/);
});

test("A: the warning of a decision after the payment of the sheet", () => {
  assert.equal(O.payrollWarning({ month: "2026-11", status: "settled" }), "Ведомость за ноябрь 2026 г. выплачена — изменится сумма: доплатить или переплата");
  assert.match(O.payrollWarning({ month: "2026-11", status: "due" }), /выплачена — изменится сумма/);
  assert.match(O.payrollWarning({ month: "2026-11", status: "overpaid" }), /выплачена — изменится сумма/);
  assert.equal(O.payrollWarning({ month: "2026-11", status: "unpaid" }), null, "the sheet is not paid yet - nothing to say");
  assert.equal(O.payrollWarning(null), null, "no saved sheet");
  assert.equal(O.payrollWarning({ month: "bad", status: "settled" }), null);
  // an administrator: the sheet exists, the status is the owner's (null) - said without «выплачена»
  const admin = O.payrollWarning({ month: "2026-11", status: null });
  assert.match(admin, /^Ведомость за ноябрь 2026 г\. уже сохранена/);
  assert.doesNotMatch(admin, /выплачена/);
});

test("A: the counter of the tab and of the menu is the requests plus the lessons of money", () => {
  assert.equal(O.waitingTotal({ pendingTotal: 2, oneOffDecisionsTotal: 3, waitingTotal: 5 }), 5);
  assert.equal(O.waitingTotal({ pendingTotal: 2, oneOffDecisionsTotal: 3 }), 5);
  assert.equal(O.waitingTotal({ pendingTotal: 2 }), 2);
  assert.equal(O.waitingTotal({ pendingTotal: 0, waitingTotal: 0 }), 0);
  assert.equal(O.waitingTotal(null), 0);
  const { useSubstitutionBadge } = require(path.join(root, "src/lib/substitution-badge.ts"));
  useSubstitutionBadge.getState().setSummary({ pendingTotal: 2, oneOffDecisionsTotal: 1, waitingTotal: 3, urgentTotal: 1 });
  assert.equal(useSubstitutionBadge.getState().pending, 3);
  useSubstitutionBadge.getState().setSummary({ pendingTotal: 2, oneOffDecisionsTotal: 1 });
  assert.equal(useSubstitutionBadge.getState().pending, 3);
  useSubstitutionBadge.getState().reset();
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /tabLabel\("pending", pendingTotal \+ decisions\.total\)/);
  assert.match(page, /<OneOffDecisionsBlock/);
  assert.match(page, /oneOffDecisionsTotal: decisionsTotalRef\.current/);
  assert.match(page, /decisionsOnly \? null : <EmptyState/, "the empty text is not said while rows of money wait");
});

test("A: the filter and the search of the page narrow the rows of money", () => {
  const row = decision();
  assert.equal(O.decisionMatches(row, {}), true);
  assert.equal(O.decisionMatches(row, { groupId: "g1" }), true);
  assert.equal(O.decisionMatches(row, { groupId: "g2" }), false);
  assert.equal(O.decisionMatches(row, { teacherId: "t1" }), true);
  assert.equal(O.decisionMatches(row, { teacherId: "t2" }), false);
  assert.equal(O.decisionMatches(row, { search: "рахимов" }), true);
  assert.equal(O.decisionMatches(row, { search: "7-а" }), true);
  assert.equal(O.decisionMatches(row, { search: "zzz" }), false);
  assert.equal(O.decisionMatches({ ...row, teacher: null }, { teacherId: "t1" }), false);
});

// ── A: the sheet (the owner) ────────────────────────────────────────────────────────────────────────────────

test("A: the cells «не решено» and «без оплаты» have their own tone, label and words; the server keeps the sum", () => {
  const undecided = P.markCell(0, "undecided");
  assert.equal(undecided.tone, "undecided");
  assert.equal(undecided.label, "?");
  assert.match(undecided.title, /оплата не решена/);
  assert.match(undecided.className, /amber/);
  const noPay = P.markCell(0, "no_pay");
  assert.equal(noPay.tone, "no_pay");
  assert.equal(noPay.label, "без");
  assert.match(noPay.title, /без оплаты/);
  assert.notEqual(undecided.className, noPay.className);
  // an old sheet still reads as before
  assert.equal(P.markCell(1, "counted").label, "1");
  assert.equal(P.markCell(null, "not_in_group").label, "");
  // not in the sum on the client either (the server decides; this is the preview of «начислить»)
  assert.equal(P.marksAmount({ fee: 600000, percentHundredths: 5000, marks: [{ state: "undecided", divisor: 12 }, { state: "no_pay", divisor: 12 }], includeUnpaid: true, defaultDivisor: 12 }), 0);
  const { SHEET_LEGEND } = require(path.join(root, "src/lib/payroll-help.ts"));
  assert.deepEqual(SHEET_LEGEND.filter((x) => x.key === "undecided" || x.key === "no_pay").map((x) => x.mark), ["?", "без"]);
});

test("A: the facts of the sheet and of the month say «не решено»", () => {
  const sheet = { lines: [], percents: {}, counted_total: 10, unpaid_total: 0, undecided_total: 2, warnings: {} };
  assert.ok(P.sheetFactsParts(sheet, 0).includes("не решено 2 посещения (в сумму не входят)"));
  assert.equal(P.sheetFactsParts({ ...sheet, undecided_total: 0 }, 0).some((part) => /не решено/.test(part)), false);
  assert.equal(P.sheetFactsParts({ ...sheet, undecided_total: undefined }, 0).some((part) => /не решено/.test(part)), false);
  assert.equal(P.undecidedLessonsText(2), "Не решено: 2 урока");
  assert.equal(P.undecidedLessonsText(1), "Не решено: 1 урок");
  assert.equal(P.undecidedLessonsText(0), null);
  assert.equal(P.undecidedLessonsText(undefined), null);
  assert.match(read("src/components/payroll/sheet-table.tsx"), /не решено: \{line\.undecided\}/);
  assert.match(read("src/components/payroll/sheet-summary.tsx"), /sheet\.undecided_total/);
  assert.match(read("src/components/payroll/payroll-month-page.tsx"), /undecidedLessonsText\(teacher\.undecided_lessons\)/);
});

// ── A: the marks of a lesson ────────────────────────────────────────────────────────────────────────────────

test("A: the chips of a lesson - the purpose, the money (by the role's own words), where the original was made up", () => {
  assert.deepEqual(O.purposeMarks({ purpose: "makeup", purposeLabel: "Отработка за пн 03.11", money: null, moneyLabel: null }).map((m) => m.text), ["Отработка за пн 03.11"]);
  assert.deepEqual(O.purposeMarks({ purpose: "extra", purposeLabel: "Дополнительный", money: "wait", moneyLabel: "оплата: не решено" }).map((m) => m.text), ["Дополнительный", "оплата: не решено"]);
  assert.equal(O.purposeMarks({ purpose: "extra", purposeLabel: "Дополнительный", money: "wait", moneyLabel: "оплата: не решено" })[1].tone, "amber");
  assert.deepEqual(O.purposeMarks({ purpose: "extra", purposeLabel: "Дополнительный", money: "paid", moneyLabel: "оплачивается" }).map((m) => m.text), ["Дополнительный", "оплачивается"]);
  assert.deepEqual(O.purposeMarks({ purpose: null, madeUpBy: { lessonId: "l", date: "2026-11-06", startTime: "10:00", endTime: "11:00", label: "Отработан → чт 06.11" } }).map((m) => m.text), ["Отработан → чт 06.11"]);
  // a move's copy and an ordinary lesson say nothing; a student gets no money
  assert.deepEqual(O.purposeMarks({ purpose: "moved", purposeLabel: null }), []);
  assert.deepEqual(O.purposeMarks(null), []);
  assert.deepEqual(O.purposeMarks({}), []);
  assert.equal(O.studentPurposeText({ purpose: "extra", purposeLabel: "Дополнительный", money: "paid", moneyLabel: "оплачивается" }), "Дополнительный");
  assert.equal(O.studentPurposeText({}), null);
  // the teacher's schedule, the dashboard, the group page, the journal and the card of a student all use it
  const chips = S.occurrenceChips({ groupName: "7-А", purpose: "extra", purposeLabel: "Дополнительный", money: "none", moneyLabel: "без оплаты" }, "u1");
  assert.deepEqual(chips.map((c) => c.text), ["Дополнительный", "без оплаты"]);
  for (const file of ["src/components/groups/group-schedule-overview.tsx", "src/components/groups/group-attendance-journal.tsx"]) assert.match(read(file), /purposeMarks\(lesson\)/, file);
  const rows = S.studentLessonRows([{ lesson_id: "l1", date: "2026-11-05", group_name: "7-А", status: "present", purpose: "makeup", purposeLabel: "Отработка за пн 02.11", money: "paid" }], [], () => "Был");
  assert.equal(rows[0].purposeText, "Отработка за пн 02.11");
  assert.match(read("src/components/students/student-lessons-list.tsx"), /row\.purposeText/);
});

test("A: the text of the line of a lesson is one function (LESSONS 48)", () => {
  assert.equal(O.decisionLessonLine({ groupName: "7-А", lessonDate: "2026-11-05", startTime: "16:00", endTime: "17:00" }), "7-А · чт 05.11 · 16:00–17:00");
  assert.equal(O.decisionWhoLine({ teacher: { id: "t", name: "Рахимов Т." }, studentsPresent: 0, studentsTotal: 8 }), "Провёл Рахимов Т. · были 0 из 8");
  assert.equal(O.decisionWhoLine({ teacher: null, studentsPresent: 1, studentsTotal: 2 }), "Преподаватель не указан · были 1 из 2");
  assert.equal(O.decisionAskedLine({ purpose: "extra", createdBy: { id: "o", name: "Тестов О.", role: "owner" } }), null);
  assert.equal(O.decisionAskedLine({ purpose: "makeup", createdBy: { id: "t", name: "Рахимов Т.", role: "teacher" } }), null);
  assert.equal(O.decisionToast("pay"), "Преподавателю будет оплачено");
  assert.equal(O.decisionToast("skip"), "Решено: без оплаты");
});
