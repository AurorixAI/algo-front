// #159, the round of fixes (29.10), front: E1 the monitor takes the lobby counters from the server, E2/E3 the poll of the status of lessons, E4 the period of «Запланированы», E6 the words,
// E7 the right that came back, E9 the cards at 375, M1 the words of the form of an admin without the right, M2 the counter of the tab.  Spec: artifacts/analysis/P159_SPEC.md; LESSONS 17, 51, 56.
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
const O = require(path.join(root, "src/lib/one-off.ts"));
const L = require(path.join(root, "src/lib/exam-lobby.ts"));
const H = require(path.join(root, "src/lib/use-exam-lessons.ts"));

const TODAY = "2026-10-29";
const exam = (over = {}) => ({ exam_id: "e", status: "lobby", group_id: "g1", scheduled_lesson_id: "lesson-1", scheduled_lesson_date: TODAY, ...over });

// ── E1: the counters come from the server; the page walks no pages ──────────────────────────────────────────

test("E1: «Запланированы» = the server's lobby_future + today's lobbies whose lesson has not begun; «Лобби открыто» = today's whose lesson is on", () => {
  const todayLobby = [exam({ exam_id: "a" }), exam({ exam_id: "b", group_id: "g2" }), exam({ exam_id: "c", group_id: "g3" })];
  const lessonOf = { a: "in_progress", b: "scheduled", c: undefined };
  const kinds = L.lobbyCounts(todayLobby, (e) => L.examListState(e, TODAY, lessonOf[e.exam_id]));
  assert.deepEqual(kinds, { lobby: 1, scheduled: 2, passed: 0 });
  assert.deepEqual(L.monitorLobbyCounts({ lobby_future: 4 }, kinds), { lobby: 1, scheduled: 6 });
  assert.deepEqual(L.monitorLobbyCounts({ lobby_future: 0 }, { lobby: 0, scheduled: 0, passed: 0 }), { lobby: 0, scheduled: 0 });
  assert.deepEqual(L.monitorLobbyCounts({}, kinds), { lobby: 1, scheduled: 2 }, "an old server without the field: today's only, never NaN");
  assert.deepEqual(L.monitorLobbyCounts({ lobby_future: null }, kinds), { lobby: 1, scheduled: 2 });
});

test("E1: the monitor asks ONE page of the chosen filter + the lobbies of today; no ceiling, no walk over every lobby", () => {
  const source = read("src/app/admin/exams/page.tsx");
  assert.doesNotMatch(source, /LOBBY_PAGES_MAX|LOBBY_PAGE\b|lobbyExams/, "the 5x100 walk is gone");
  assert.doesNotMatch(source, /state: "lobby"[,\s]/, "no request for every lobby of the period");
  assert.match(source, /state: "lobby_today"/);
  assert.match(source, /"scheduled" \? "lobby_future"/, "«Запланированы» is the server's lobby_future");
  assert.match(source, /response\.counts\.lobby_today > 0/, "nothing about today is asked when the server counted none");
  assert.match(source, /monitorLobbyCounts\(serverCounts, todayKinds\)/);
  assert.match(read("src/lib/api.ts"), /AdminExamMonitorState = "all" \| "active" \| "lobby" \| "lobby_future" \| "lobby_today" \| "closed" \| "changes"/);
  // the status of a lesson is asked only for the exams of today: the hook filters by needsLessonStatus (lobby + the date of today)
  assert.match(read("src/lib/use-exam-lessons.ts"), /needsLessonStatus\(exam, today\)/);
  assert.equal(L.needsLessonStatus(exam({ scheduled_lesson_date: "2026-11-03" }), TODAY), false);
  assert.equal(L.needsLessonStatus(exam(), TODAY), true);
});

// ── E2, E3: the poll of the status of lessons ───────────────────────────────────────────────────────────────

test("E2: a hidden tab asks nothing; the return to the tab and the opening of the screen ask at once", () => {
  const source = read("src/lib/use-exam-lessons.ts");
  assert.match(source, /setInterval\(\(\) => \{ if \(!document\.hidden\) void load\(\); \}, REFRESH_MS\)/);
  assert.match(source, /addEventListener\("visibilitychange", onVisible\)/);
  assert.match(source, /const onVisible = \(\) => \{ if \(!document\.hidden\) void load\(\); \};/);
  assert.match(source, /removeEventListener\("visibilitychange", onVisible\)/, "the listener goes with the screen");
  assert.match(source, /if \(!key\) return undefined;\s*void load\(\);/, "the opening of the screen asks at once");
});

test("E3: a group that answered 403 / 404 is remembered and not asked again until the page is reloaded", () => {
  H.forgetUnavailableGroups();
  assert.equal(H.isGroupUnavailable(Object.assign(new Error("x"), { status: 403 })), true);
  assert.equal(H.isGroupUnavailable(Object.assign(new Error("x"), { status: 404 })), true);
  for (const transient of [Object.assign(new Error("x"), { status: 503 }), Object.assign(new Error("x"), { status: 429 }), new Error("network"), null, undefined]) assert.equal(H.isGroupUnavailable(transient), false);
  assert.equal(H.isGroupRemembered("g1"), false);
  H.rememberUnavailableGroup("g1");
  assert.equal(H.isGroupRemembered("g1"), true);
  assert.equal(H.isGroupRemembered("g2"), false);
  H.forgetUnavailableGroups();
  assert.equal(H.isGroupRemembered("g1"), false);
  const source = read("src/lib/use-exam-lessons.ts");
  assert.match(source, /\.filter\(\(groupId\) => !unavailableGroups\.has\(groupId\)\)/, "a remembered group is left out of the request");
  assert.match(source, /catch \(err\) \{[\s\S]{0,200}isGroupUnavailable\(err\)\) unavailableGroups\.add\(groupId\)/);
});

// ── E4, E6, E9 ─────────────────────────────────────────────────────────────────────────────────────────────

test("E4: a click on «Запланированы» sets the period to «Все»; «Лобби открыто» and «Идут сейчас» still go to today", () => {
  const source = read("src/app/admin/exams/page.tsx");
  assert.match(source, /if \(next === "scheduled"\) setPeriod\("all"\);/);
  assert.match(source, /if \(next === "active" \|\| next === "lobby"\) setPeriod\("today"\);/);
});

test("E6: the note of the make-up form and the chip of today before the lesson", () => {
  assert.equal(O.MAKEUP_MONEY_NOTE, "Отработка — обычный урок. Вычет за отменённый урок снимается; кто не пришёл — урок засчитан, как пропуск обычного урока. С подтверждённой уважительной причиной вычет остаётся.");
  assert.equal(L.scheduledExamLabel("today", "чт, 29 окт."), "Запланирован · сегодня");
  assert.equal(L.lobbyExamLabel("today", ""), "Запланирован · сегодня");
  assert.equal(L.lobbyExamLabel("upcoming", "вт, 3 нояб."), "Запланирован · вт, 3 нояб.");
  assert.equal(L.lobbyExamLabel("lobby", ""), "Лобби открыто");
});

test("E9: five cards of the library and six of the monitor do not leave one card alone on a phone", () => {
  const library = read("src/app/teacher/exams/page.tsx");
  assert.match(library, /grid grid-cols-2 md:grid-cols-5 gap-3/);
  assert.match(library, /index === all\.length - 1 && all\.length % 2 === 1 \? "col-span-2 md:col-span-1"/, "the odd last card takes the row");
  assert.match(read("src/app/admin/exams/page.tsx"), /<section className="grid grid-cols-2 gap-3 xl:grid-cols-6">/, "2 x 3 on a phone, not one column");
});

// ── E7: the right that came back ────────────────────────────────────────────────────────────────────────────

test("E7: «права нет» belongs to the profile it was read from; a re-read profile forgets it, and the words have «Обновить»", () => {
  const block = read("src/components/substitutions/one-off-decisions.tsx");
  assert.match(block, /rightLost: boolean;/, "the mark lives on the page (round 3: the counter reads it too)");
  assert.match(block, /data-testid="one-off-decisions-refresh"/);
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /const \[moneyLostFor, setMoneyLostFor\] = useState<\{ profile: unknown \} \| null>\(null\);/);
  assert.match(page, /const moneyRightLost = moneyRightLostFor\(moneyLostFor, user\);/);
  assert.match(page, /setMoneyLostFor\(\{ profile: user \}\)/);
  assert.match(page, /onRefreshProfile=\{\(\) => \{ void useAuthStore\.getState\(\)\.refreshProfile\(\)/);
  // the same logic, run: the mark is for one reading of the profile
  const lost = O.moneyRightLostFor;
  const first = { org_role: "admin", payments_access: true }, again = { org_role: "admin", payments_access: true };
  assert.equal(lost({ profile: first }, first), true);
  assert.equal(lost({ profile: first }, again), false, "a new reading: the buttons are back");
});

// ── M1, M2 ──────────────────────────────────────────────────────────────────────────────────────────────────

test("M1: the form of an admin without the right speaks for HIM; the teacher's words are as before", () => {
  const admin = O.oneOffRoleOf({ org_role: "admin", payments_access: false });
  assert.equal(admin, "admin_ask");
  assert.deepEqual(O.moneyChoicesFor(admin), [
    { value: "wait", label: "Попросить оплатить", hint: "Решит владелец или администратор с правом на оплаты после урока" },
    { value: "none", label: "Без оплаты", hint: "Преподаватель ничего не получит за этот урок" },
  ]);
  const teacher = O.moneyChoicesFor(O.oneOffRoleOf({ org_role: "teacher" }));
  assert.deepEqual(teacher.map((c) => [c.value, c.label, c.hint]), [
    ["wait", "Прошу оплатить", "После урока решит владелец или администратор с правом на оплаты"],
    ["none", "Без оплаты", "За этот урок вы ничего не получите"],
  ]);
  assert.deepEqual(O.emptyChoice(admin), { purpose: null, money: "wait", target: "" }, "«Попросить оплатить» by default");
  assert.equal(O.choiceProblem({ purpose: "extra", money: "wait", target: "" }, admin, null), null);
  assert.notEqual(O.choiceProblem({ purpose: "extra", money: "paid", target: "" }, admin, null), null);
  assert.deepEqual(O.moneyChoicesFor(O.oneOffRoleOf({ org_role: "admin", payments_access: true })).map((c) => c.value), ["none", "paid"]);
});

test("M2: the counter of the tab counts the money rows only for who may decide them (as the server counts the badge)", () => {
  const owner = { org_role: "owner" }, withRight = { org_role: "admin", payments_access: true }, noRight = { org_role: "admin" };
  assert.equal(O.waitingCountFor(owner, 2, 3), 5);
  assert.equal(O.waitingCountFor(withRight, 2, 3), 5);
  assert.equal(O.waitingCountFor(noRight, 2, 3), 2, "the rows are information for him, not his tasks");
  assert.equal(O.waitingCountFor({ org_role: "admin", payments_access: false }, 0, 4), 0);
  assert.equal(O.waitingCountFor(null, 1, 1), 1);
  assert.equal(O.waitingCountFor(owner, -1, -1), 0);
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /const waitingCount = waitingCountFor\(user, pendingTotal, decisions\.total, moneyRightLost\);/);
  assert.match(page, /tabLabel\("pending", waitingCount\)/);
  assert.match(page, /setWaiting\(waitingCount\)/);
  assert.match(page, /waitingTotal: waitingCountFor\(userRef\.current, data\.pendingTotal \?\? 0, decisionsTotalRef\.current, moneyRightLostRef\.current\)/, "the badge set from the list carries the same number");
  assert.doesNotMatch(page, /pendingTotal \+ decisions\.total/);
  // the server's number wins for the menu badge
  assert.equal(O.waitingTotal({ pendingTotal: 2, oneOffDecisionsTotal: 3, waitingTotal: 2 }), 2);
});
