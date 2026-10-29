// #159, the third small round (29.10), front: D1 the list of exams of a group follows the statuses of the lessons (the memo had no `examStateOf` in its dependencies), D2 the dashboard of the
// teacher polls the status of the lesson of a lobby exam of today with the SAME hook as the library, M2 tail: after «нет права» the tab and the badge count by the same `waitingCountFor` with «нет права».
// Spec: artifacts/analysis/P159_SPEC.md (invariant 3, M2, E2); LESSONS 17, 54-56.
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

const TODAY = "2026-10-29";

/** Every `useMemo(` / `useCallback(` of a source: its body and the list of its dependencies (brackets are matched, strings are not parsed - the pages have no brackets in strings there). */
function hooksOf(source) {
  const out = [];
  const re = /use(Memo|Callback)\(/g;
  let m;
  while ((m = re.exec(source))) {
    let depth = 1, i = m.index + m[0].length;
    while (i < source.length && depth > 0) { const c = source[i]; if (c === "(" || c === "[" || c === "{") depth++; else if (c === ")" || c === "]" || c === "}") depth--; i++; }
    const call = source.slice(m.index, i);
    const deps = /,\s*\[([^\[\]]*)\],?\s*\)$/.exec(call);
    out.push({ call, deps: deps ? deps[1].split(",").map((d) => d.trim()).filter(Boolean) : null, line: source.slice(0, m.index).split("\n").length });
  }
  return out;
}

// ── D1 ────────────────────────────────────────────────────────────────────────────────────────────────────
test("D1: the list of exams of a group depends on the state of the exam, like its counters (a status that arrives later is seen by both)", () => {
  const source = read("src/app/teacher/groups/[id]/page.tsx");
  assert.match(source, /\}, \[groupExams, examFilter, examSearch, examStateOf\]\);/);
  assert.match(source, /\}, \[groupExams, examStateOf\]\);/, "the counters had it already");
  const filtered = hooksOf(source).find((h) => /const filteredGroupExams|examFilter/.test(h.call) && /examStateOf\(/.test(h.call));
  assert.ok(filtered && filtered.deps.includes("examStateOf"));
});

test("D1: no memo / callback of the three lists uses the state function without having it in its dependencies (the neighbours of the same mistake)", () => {
  const pages = { "src/app/teacher/groups/[id]/page.tsx": ["examStateOf"], "src/app/teacher/exams/page.tsx": ["stateOf"], "src/app/admin/exams/page.tsx": ["stateOf", "bucketOfExam", "todayKinds"] };
  let checked = 0;
  for (const [file, names] of Object.entries(pages)) {
    for (const hook of hooksOf(read(file))) {
      for (const name of names) {
        // the definition of the name itself is not a use of it
        const body = hook.call.replace(new RegExp(`^use(Memo|Callback)\\(`), "");
        if (!new RegExp(`\\b${name}\\b`).test(body.replace(/,\s*\[[^\[\]]*\],?\s*\)$/, ""))) continue;
        checked++;
        assert.ok(hook.deps && hook.deps.includes(name), `${file}:${hook.line} uses ${name} without it in the dependencies [${hook.deps}]`);
      }
    }
  }
  assert.ok(checked >= 6, `the check saw the memos (${checked})`);
});

test("D1: the hook gives ONE object per answer, so `lessons` in a dependency list changes exactly when a status arrived", () => {
  const source = read("src/lib/use-exam-lessons.ts");
  assert.match(source, /return useMemo\(\(\) => \(\{ statusOf \}\), \[statusOf\]\);/);
  assert.match(source, /\[byGroup\],\n  \);/, "statusOf changes with the answers");
});

// ── D2 ────────────────────────────────────────────────────────────────────────────────────────────────────
test("D2: of two readings of one lesson the later one is true (what this screen did / what the poll saw elsewhere); an unknown one gives way", () => {
  const later = L.laterLessonStatus;
  assert.equal(later("scheduled", "in_progress"), "in_progress", "started in another tab");
  assert.equal(later("in_progress", "scheduled"), "in_progress", "started here a second ago, the poll is older");
  assert.equal(later("in_progress", "completed"), "completed");
  assert.equal(later("completed", "in_progress"), "completed");
  assert.equal(later("scheduled", undefined), "scheduled");
  assert.equal(later(null, "in_progress"), "in_progress", "the lesson is not in the window of the dashboard, the poll knows it");
  assert.equal(later(null, undefined), null);
  assert.equal(later("in_progress", undefined), "in_progress");
  assert.equal(later("weird", "in_progress"), "in_progress", "a status nobody knows does not win");
});

test("D2: the lesson started in another tab turns «Запланирован · сегодня» into «Лобби открыто» without a reload (the same state function as the lists)", () => {
  const exam = { status: "lobby", scheduledDate: TODAY, today: TODAY };
  const stateWith = (local, polled) => L.dashboardExamState({ ...exam, lessonStatus: L.laterLessonStatus(local, polled) });
  assert.equal(stateWith("scheduled", undefined), "today", "the first minute: only the summary of the day");
  assert.equal(L.scheduledExamLabel("today", ""), "Запланирован · сегодня");
  assert.equal(stateWith("scheduled", "in_progress"), "lobby", "the poll saw the start");
  assert.equal(stateWith("in_progress", "scheduled"), "lobby", "started here: not taken back by an older answer");
  assert.equal(stateWith("scheduled", "completed"), "today", "the lesson is over, the lobby is not open");
  // the lists say the same for the same lesson
  assert.equal(L.examListState({ status: "lobby", scheduled_lesson_date: TODAY }, TODAY, "in_progress"), "lobby");
});

test("D2: the dashboard uses the hook of the library (one mechanism): the minute, the hidden tab and the return are its", () => {
  const dash = read("src/app/teacher/dashboard/page.tsx");
  assert.match(dash, /import \{ useTodayLessonStatuses \} from "@\/lib\/use-exam-lessons";/);
  assert.match(dash, /const examLessons = useTodayLessonStatuses\(liveExams, businessDate\);/);
  assert.match(dash, /laterLessonStatus\(lesson \? statusOfToday\(lesson\) : null, examLessons\.statusOf\(exam\)\)/);
  assert.match(dash, /\}, \[businessDate, liveExamView, weekLessons, statusOfToday, examLessons\]\);/, "the rows are recalculated when a status arrives");
  assert.doesNotMatch(dash, /setInterval\([^)]*getGroupAttendance/, "no second timer of the journal on the dashboard");
  const hook = read("src/lib/use-exam-lessons.ts");
  assert.match(hook, /const REFRESH_MS = 60_000;/);
  assert.match(hook, /if \(!document\.hidden\) void load\(\)/);
  assert.match(hook, /addEventListener\("visibilitychange", onVisible\)/);
  // the hook asks only for the lobbies of today
  const H = require(path.join(root, "src/lib/exam-lobby.ts"));
  assert.equal(H.needsLessonStatus({ status: "lobby", group_id: "g", scheduled_lesson_id: "l", scheduled_lesson_date: TODAY }, TODAY), true);
  assert.equal(H.needsLessonStatus({ status: "lobby", group_id: "g", scheduled_lesson_id: "l", scheduled_lesson_date: "2026-11-03" }, TODAY), false);
  assert.equal(H.needsLessonStatus({ status: "active", group_id: "g", scheduled_lesson_id: "l", scheduled_lesson_date: TODAY }, TODAY), false);
});

// ── M2 tail ──────────────────────────────────────────────────────────────────────────────────────────────
test("M2 tail: after «нет права» the counter of the tab and the badge count by the same rule - the money rows go out (13 -> 10), no new request", () => {
  const withRight = { org_role: "admin", payments_access: true }, owner = { org_role: "owner" };
  assert.equal(O.waitingCountFor(withRight, 10, 3), 13);
  assert.equal(O.waitingCountFor(withRight, 10, 3, true), 10, "the right is lost");
  assert.equal(O.waitingCountFor(owner, 10, 3, true), 10);
  assert.equal(O.waitingCountFor(withRight, 10, 3, false), 13);
  assert.equal(O.waitingCountFor({ org_role: "admin" }, 10, 3, true), 10, "who had no right stays at 10");
  assert.equal(O.waitingCountFor(withRight, 10, 3), O.waitingCountFor(withRight, 10, 3, false), "default: not lost");
});

test("M2 tail: «нет права» belongs to one reading of the profile; a re-read profile brings the buttons and the money rows back", () => {
  const first = { org_role: "admin", payments_access: true }, again = { org_role: "admin", payments_access: true };
  assert.equal(O.moneyRightLostFor(null, first), false);
  assert.equal(O.moneyRightLostFor({ profile: first }, first), true);
  assert.equal(O.moneyRightLostFor({ profile: first }, again), false, "«Обновить» read the profile again");
  assert.equal(O.waitingCountFor(again, 10, 3, O.moneyRightLostFor({ profile: first }, again)), 13);
});

test("M2 tail: the page holds the mark; the block, the tab and the badge read it (the mark survives the tab «Решённые»)", () => {
  const page = read("src/components/substitutions/substitutions-page.tsx");
  assert.match(page, /const \[moneyLostFor, setMoneyLostFor\] = useState<\{ profile: unknown \} \| null>\(null\);/);
  assert.match(page, /const moneyRightLost = moneyRightLostFor\(moneyLostFor, user\);/);
  assert.match(page, /const waitingCount = waitingCountFor\(user, pendingTotal, decisions\.total, moneyRightLost\);/);
  assert.match(page, /waitingCountFor\(userRef\.current, data\.pendingTotal \?\? 0, decisionsTotalRef\.current, moneyRightLostRef\.current\)/, "the badge set from the list: the same rule");
  assert.match(page, /rightLost=\{moneyRightLost\}/);
  assert.match(page, /onRightLost=\{\(\) => setMoneyLostFor\(\{ profile: user \}\)\}/);
  assert.match(page, /setWaiting\(waitingCount\)/, "the badge of the menu follows the counter of the tab");
  assert.doesNotMatch(page, /pendingTotal \+ decisions\.total/, "one rule of counting, not a second");
  const block = read("src/components/substitutions/one-off-decisions.tsx");
  assert.match(block, /const mayDecide = canDecide && !rightLost;/);
  assert.match(block, /isMoneyRightRefusal\(failure\)[\s\S]{0,400}onRightLost\(\)[\s\S]{0,400}setDialog\(null\)/);
  assert.doesNotMatch(block, /useState<\{ profile: unknown \}/, "the block keeps no copy of the mark");
});
