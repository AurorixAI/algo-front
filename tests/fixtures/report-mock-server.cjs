#!/usr/bin/env node
/**
 * Synthetic API for rendering the diagnostic report page (N04a). No dependencies,
 * no real data: every name, answer and formula below is invented.
 *
 * HOW TO RUN (two terminals, from the front's root):
 *
 *   1. mock API (default 127.0.0.1:8099; MOCK_PORT overrides)
 *        node tests/fixtures/report-mock-server.cjs
 *
 *   2. the front, with BOTH service base URLs pointed at the mock (they are
 *      inlined at start, so set them for `next dev` itself):
 *        NEXT_PUBLIC_AUTH_API_URL=http://127.0.0.1:8099 \
 *        NEXT_PUBLIC_DIAG_API_URL=http://127.0.0.1:8099 \
 *        NEXT_PUBLIC_EXAM_API_URL=http://127.0.0.1:8099 \
 *        npx next dev -p 3104
 *      (src/lib/api.ts: AUTH_API_V1 / DIAG_API_V1 = `${NEXT_PUBLIC_*_API_URL}/api/v1`.)
 *
 * ROLE / LOGIN. Two things make the front accept the session; NO localStorage key
 * is needed (the persisted zustand state is ignored: AuthGuard always asks
 * `GET /api/v1/auth/me`, and the mock answers with a user of the chosen role):
 *   a) cookie `algo_auth_token` (any non-empty value) - src/middleware.ts redirects
 *      to /login without it (plain curl of a page gives 307 until it is set);
 *   b) cookie `mock_role` = admin | teacher - the role /auth/me returns
 *      (default admin, or the MOCK_ROLE env).
 * Set both in one step by opening, in the browser you will use,
 *   http://127.0.0.1:8099/__mock/role/teacher        (or /admin)
 *   http://127.0.0.1:8099/__mock/role/teacher?next=http://127.0.0.1:3104/teacher/diagnostics/s4-long/report
 * (cookies are host-scoped, not port-scoped, so the front on :3104 and the mock on
 * :8099 share them). Or set them yourself:
 *   document.cookie = "algo_auth_token=synthetic-render-only; path=/";
 *   document.cookie = "mock_role=teacher; path=/";
 *   Playwright: context.addCookies([{ name: "algo_auth_token", value: "synthetic-render-only",
 *     url: "http://127.0.0.1:3104" }, { name: "mock_role", value: "teacher", url: "http://127.0.0.1:3104" }])
 * curl: add  -H "Cookie: algo_auth_token=x"  to get the page HTML (200).
 * Use hostname 127.0.0.1 for BOTH the front and the mock (CORS echoes only
 * localhost / 127.0.0.1 origins).
 *
 * URLS (the diagnostic id selects the scenario):
 *   http://127.0.0.1:3104/admin/diagnostics/<scenario>/report     (role admin)
 *   http://127.0.0.1:3104/teacher/diagnostics/<scenario>/report   (role teacher)
 *
 *   s1-errorfree        error-free: achievements + development step
 *   s2-noplan           errors, action_plan = []
 *   s3-errorfree-empty  error-free, no achievements, no plan
 *   s4-long             3 long chains (long skill names, wide LaTeX answers),
 *                       4 cognitive patterns with 3 examples, full boundary
 *                       (breakpoint_evidence "confirmed"; s2-noplan has "observed";
 *                       the 3rd chain has evidence_source "inferred" -> neutral marker)
 *   s5-pending          report pending (stays pending: watch the poll back off,
 *                       then «Отчёт формируется дольше обычного» after 40 polls)
 *   s5-failed           generation failed
 *   s5-readynull        {report: null} x2, then ready-without-report_json x2, then the
 *                       full report (a poll must follow every step; flips after
 *                       MOCK_FLIP_AFTER report requests, default 4; 0 = never)
 *   s6-legacy           old schema: no error_patterns / action_plan / level,
 *                       report_generation.is_current_schema = false
 *   s7-403              GET /auth/org/diagnostics/<id> -> 403
 * extras:
 *   s5-pending-then-ready  pending until MOCK_FLIP_AFTER (default 4) report requests, then s4-long
 *   s9-deepscan-incomplete observed boundary, no breakpoint skills, report_meta.deep_scan_incomplete = true
 *   s9-rebuild          old report + generation pending/generating with is_current_schema=false, then the
 *                       new report after MOCK_FLIP_AFTER requests (page: old report + «Отчёт обновляется…»)
 *   s9-rebuild-current  schema-5 report being regenerated (is_current_schema=false): normal content, empty
 *                       sections say «Раздел обновляется вместе с отчётом», NO «старый формат»; new report later
 *   s10-many-errors     21 error records (7 journal pages) with LaTeX answers: pager / header overflow check
 *   s11-legacy-option   MCQ records: an option changed after the attempt (card «вариант из прежней версии
 *                       задания») and two answers that match their LaTeX option after normalisation
 *   s12-wide-option     MCQ option wider than any card (44-entry matrix): scroll affordance check
 *   s9-rebuild-long     like s9-rebuild, but the old report has 4 records (journal page 2) and the new one 2
 *   s9-invalid-json     report_json is the string "oops" (page: «Данные отчёта недоступны», no endless poll)
 *   s9-flaky            pending, then 503, 503, then the report (poll must survive 2 transient failures)
 *   s6-partial          report_json = {report_meta: {}} (nothing but an empty shell)
 *   s9-regeneration-placeholder  report_json = {"_regeneration": {...}} only (no report yet): pending UI + polling, then the report
 *   s7-404              GET /auth/org/diagnostics/<id> -> 404
 *   s8-degraded         current schema but report_meta.degraded = ["skill_names"]
 *
 * Student flows (any code), for the option cards of OptionGrid with a very wide LaTeX option:
 *   http://127.0.0.1:3204/d/ui-wide   diagnostic: 3 tasks (1st and 3rd carry the wide option), POSTs counted
 *   http://127.0.0.1:3204/e/ui-wide   exam: same tasks; progress POSTs counted
 *   GET /__mock/flow/<code>           POST counts and the submitted answers of both flows (the exam page upper-cases
 *                                     the code: /e/ui-g -> /__mock/flow/UI-G)
 *
 * Control endpoints (not part of the real API):
 *   GET /__mock/stats   request counters per scenario (poll count of the report)
 *   GET /__mock/reset   zero the counters
 *   GET /__mock/role/<admin|teacher>[?next=<local url>]  sets both cookies (+ redirect)
 *
 * Env: MOCK_PORT (8099), MOCK_ROLE (admin), MOCK_FLIP_AFTER (4), MOCK_LATENCY_MS (0),
 *      MOCK_LOG=1 (print every request).
 */
const http = require("node:http");

const PORT = Number(process.env.MOCK_PORT || 8099);
const FLIP_AFTER = Number(process.env.MOCK_FLIP_AFTER || 4);
const LATENCY = Number(process.env.MOCK_LATENCY_MS || 0);
let defaultRole = process.env.MOCK_ROLE === "teacher" ? "teacher" : "admin";
const counters = {};

// ─── Synthetic content ────────────────────────────────────────────────────────

const LONG_SKILLS = [
  "Преобразование выражений, содержащих степени с рациональными показателями и корни n-й степени в задачах повышенной сложности",
  "Решение систем линейных уравнений с параметром методом подстановки и исключения неизвестных с проверкой подстановкой",
  "Вычисление производной сложной функции и составление уравнения касательной к графику в заданной точке",
  "Сравнение обыкновенных дробей с разными знаменателями и приведение к наименьшему общему знаменателю",
];
const WIDE_SUM = "$$" + Array.from({ length: 22 }, (_, i) => `\\frac{x^{${i + 1}}}{${i + 1}}`).join("+") + "$$";
const WIDE_MATRIX =
  "$$\\begin{pmatrix}" +
  Array.from({ length: 2 }, (_, r) => Array.from({ length: 6 }, (_, c) => `\\frac{x^{${r * 6 + c + 1}}}{${r * 6 + c + 1}}`).join(" & ")).join(" \\\\ ") +
  "\\end{pmatrix}$$";
const INLINE_WIDE = "$\\dfrac{v^2s-v(v^2-v_1v_2)t}{v_1v_2}+\\dfrac{v^2s-v(v^2-v_1v_2)t}{v_1v_2}+\\dfrac{v^2s-v(v^2-v_1v_2)t}{v_1v_2}$";
const LONG_STATEMENT =
  "Найдите значение выражения при заданных условиях и обоснуйте каждый шаг преобразования, указав область допустимых значений переменных. " +
  "Ответ запишите в виде несократимой дроби. " + INLINE_WIDE;

const baseMeta = (over = {}) => ({
  session_id: "sess-synthetic",
  student_name: "Синтетический Ученик",
  class_level: 9,
  test_code: "SYN-0001",
  date: "2026-10-04",
  generated_on: "2026-10-12",
  report_schema_version: 5,
  degraded: [],
  total_questions: 12,
  questions_correct: 7,
  score_percent: 58,
  error_free: false,
  ...over,
});

const level = (over = {}) => ({ category: "below_grade", status: "below", provisional: false, theta: -0.9, se: 0.4, solved: 7, total: 12, ...over });

const errorPattern = (i, long) => ({
  task_id: `T-${i}`,
  skill_id: `SK-${i}`,
  skill_name_ru: long ? LONG_SKILLS[i % LONG_SKILLS.length] : `Навык ${i + 1}`,
  question_text: long ? LONG_STATEMENT : `Вычислите значение выражения номер ${i + 1}.`,
  question_latex: long ? LONG_STATEMENT : `Вычислите: $\\frac{${i + 3}}{${i + 4}}+\\frac{1}{2}$`,
  answer_type: "multiple_choice",
  answer_options: ["1", "2", "3", "4"],
  answer_options_latex: long ? [WIDE_SUM, "$x^2$", "$\\sqrt{x}$", "$\\frac{1}{x}$"] : ["$1$", "$2$", "$3$", "$4$"],
  eval_category: i % 2 === 0 ? "distractor" : "wrong",
  student_answer: long && i === 0 ? "ответ не из списка" : "2",
  student_answer_latex: long && i === 0 ? WIDE_SUM : null,
  correct_answer: "3",
  correct_answer_latex: long ? WIDE_SUM : "$3$",
  distractor_explanation: long ? "Ученик сложил числители и знаменатели отдельно. " + INLINE_WIDE : "Ученик сложил числители и знаменатели отдельно.",
  distractor_explanation_latex: null,
});

const chainStep = (i, long) => ({
  step_num: i + 1,
  grade: 9 - i,
  skill_id: `CH-${i}`,
  skill_name_ru: long ? LONG_SKILLS[i % LONG_SKILLS.length] : `Навык шага ${i + 1}`,
  task_id: `CT-${i}`,
  phase: "deep_scan",
  is_deep_scan: true,
  outcome: i % 2,
  question_text: "Упростите выражение.",
  question_latex: long ? LONG_STATEMENT : "Упростите: $\\frac{a^2-b^2}{a-b}$",
  student_answer: long ? "$x^{10}$" : "a",
  student_answer_latex: long ? (i % 2 ? WIDE_SUM : WIDE_MATRIX) : "a",
  correct_answer: "a+b",
  correct_answer_latex: long ? WIDE_SUM : "a+b",
});

const chain = (i, long) => ({
  source_grade: 9,
  source_skill_id: `SRC-${i}`,
  source_skill_name: long ? LONG_SKILLS[i % LONG_SKILLS.length] : `Исходный навык ${i + 1}`,
  root_gap_grade: 5 - i,
  root_gap_skill_id: `GAP-${i}`,
  root_gap_skill_name: long ? LONG_SKILLS[(i + 1) % LONG_SKILLS.length] : `Корневой пробел ${i + 1}`,
  root_gap_explanation: null,
  anchor_grade: 4,
  anchor_skill_id: "ANC",
  anchor_skill_name: "Опорный навык",
  severity: "critical",
  // backend evidence_source: stored_link = recorded deep-scan link; inferred = reconstructed from the answers
  evidence_source: long && i === 2 ? "inferred" : "stored_link",
  steps_count: 3,
  steps: [0, 1, 2].map((k) => chainStep(k, long)),
});

const cluster = (i, long) => ({
  category: `cat_${i}`,
  title: long ? `Систематическая ошибка в преобразованиях выражений со степенями и корнями (${i + 1})` : `Паттерн ${i + 1}`,
  description: "Описание шаблона ошибки без утверждений о причинах.",
  count: 3,
  examples: [0, 1, 2].map((k) => ({
    task_id: `EX-${i}-${k}`,
    skill_id: `EXS-${i}-${k}`,
    skill_name_ru: long ? LONG_SKILLS[k % LONG_SKILLS.length] : `Навык примера ${k + 1}`,
    question_text: "Вычислите.",
    question_latex: long ? LONG_STATEMENT : "Вычислите: $2+2$",
    student_answer: "5",
    student_answer_latex: long ? (k === 1 ? WIDE_MATRIX : WIDE_SUM) : "5",
    correct_answer: "4",
    correct_answer_latex: long ? WIDE_SUM : "4",
    distractor_explanation: long ? "Ученик перепутал порядок действий. " + INLINE_WIDE : "Ученик перепутал порядок действий.",
    distractor_explanation_latex: null,
  })),
});

// breakpoint_evidence (backend _build_diagnostic_boundary): "confirmed" = reached by a deep-scan
// chain (s4-long), "observed" = earliest grade with wrong answers only (s2-noplan).
const boundary = (long, over = {}) => ({
  anchor_level: long ? "5 класс (опорный фундамент диагностики)" : "5 класс",
  anchor_skills: long ? LONG_SKILLS : ["Сложение дробей"],
  breakpoint_level: long ? "4 класс (первичное нарушение логики вычислений)" : "4 класс",
  breakpoint_skills: long ? LONG_SKILLS.slice(0, 2) : ["Сокращение дробей"],
  breakpoint_evidence: long ? "confirmed" : "observed",
  blocked_level: long ? "9 класс (текущий класс обучения ученика)" : "9 класс",
  blocked_skills: long ? LONG_SKILLS.slice(1) : ["Квадратные уравнения"],
  ...over,
});

const planItem = (i, long, extra = {}) => ({
  priority: i + 1,
  skill_id: `PL-${i}`,
  skill_name_ru: long ? LONG_SKILLS[i % LONG_SKILLS.length] : `Навык плана ${i + 1}`,
  action_title: long ? `Отработать: ${LONG_SKILLS[i % LONG_SKILLS.length]}` : `Отработать навык ${i + 1}`,
  full_description: "Решите серию задач по теме и сверьте результат с образцом.",
  ...extra,
});

const generation = (over = {}) => ({ status: "ready", stage: "ready", attempts: 1, is_current_schema: true, ...over });
const envelope = (reportJson, gen = generation()) => ({
  session_id: "sess-synthetic",
  report_json: reportJson,
  report_generation: gen,
  narrative_ru: null,
});

const achievements = [
  { skill_id: "AC-1", skill_name_ru: "Сложение и вычитание дробей", correct_answers: 3 },
  { skill_id: "AC-2", skill_name_ru: "Свойства степеней", correct_answers: 2 },
  { skill_id: "AC-3", skill_name_ru: "Линейные уравнения", correct_answers: 4 },
  { skill_id: "AC-4", skill_name_ru: "Проценты", correct_answers: 3 },
];

const errorFreeJson = (withAchievements, withPlan) => ({
  report_meta: baseMeta({ error_free: true, total_questions: 12, questions_correct: 12, score_percent: 100 }),
  overall: { score_percent: 100, status: "above", status_label_ru: "Выше уровня класса", student_summary: "Все выполненные задания решены верно." },
  level: level({ category: "above_grade", status: "above", theta: 1.2, solved: 12, total: 12 }),
  achievements: withAchievements ? achievements : [],
  strong_skills: [],
  weak_skills: [],
  critical_gaps: [],
  error_patterns: [],
  root_cause_chains: [],
  cognitive_error_types: [],
  recommended_start: withPlan ? { skill_id: "PL-0", skill_name_ru: "Логарифмические уравнения", evidence: null } : null,
  action_plan: withPlan
    ? [{ priority: 1, skill_id: "PL-0", skill_name_ru: "Логарифмические уравнения", action_title: "Следующий шаг: логарифмические уравнения", full_description: "Расширьте подтверждённые навыки: решите несколько задач на логарифмы.", kind: "development" }]
    : [],
});

const errorsJson = ({ long, plan, noPatterns, boundaryOver, metaOver }) => ({
  report_meta: baseMeta({ deep_scan_incomplete: false, ...(metaOver || {}) }),
  overall: {
    score_percent: 58, status: "below", status_label_ru: "Ниже уровня класса",
    student_summary: "Автоматическое резюме: часть заданий решена верно, по ряду тем есть ошибки.",
  },
  level: level({ provisional: long }),
  diagnostic_boundary: boundary(long, boundaryOver),
  root_cause_chains: long ? [0, 1, 2].map((i) => chain(i, true)) : [chain(0, false)],
  cognitive_error_types: long ? [0, 1, 2, 3].map((i) => cluster(i, true)) : [],
  achievements: [],
  strong_skills: [{ skill_id: "S-1", skill_name_ru: "Проценты", mastery_percent: 90 }],
  weak_skills: [{ skill_id: "W-1", skill_name_ru: "Дроби", mastery_percent: 30, status: "gap" }],
  critical_gaps: [],
  error_patterns: noPatterns ? [] : (long ? [0, 1, 2, 3] : [0, 1]).map((i) => errorPattern(i, long)),
  recommended_start: plan ? { skill_id: "PL-0", skill_name_ru: long ? LONG_SKILLS[0] : "Навык плана 1", evidence: null } : null,
  action_plan: plan ? (long ? [0, 1, 2] : [0, 1]).map((i) => planItem(i, long)) : [],
});

// Old schema: no level / error_patterns / action_plan / achievements / boundary.
const legacyJson = () => ({
  report_meta: { session_id: "sess-synthetic", student_name: "Синтетический Ученик", class_level: 9, test_code: "SYN-0001", date: "2026-09-01", total_questions: 10, questions_correct: 6, score_percent: 60 },
  overall: { score_percent: 60, status: "below_level", status_label_ru: "Ниже уровня класса" },
  strong_skills: [{ skill_id: "S-1", skill_name_ru: "Проценты", mastery_percent: 90 }],
  weak_skills: [{ skill_id: "W-1", skill_name_ru: "Дроби", mastery_percent: 30, status: "gap" }],
  critical_gaps: [],
});

// ─── Scenarios: report envelope by the Nth request of that report ─────────────

const SCENARIOS = {
  "s1-errorfree": () => envelope(errorFreeJson(true, true)),
  "s2-noplan": () => envelope(errorsJson({ long: false, plan: false })),
  "s3-errorfree-empty": () => envelope(errorFreeJson(false, false)),
  "s4-long": () => envelope(errorsJson({ long: true, plan: true })),
  "s5-pending": () => envelope(null, generation({ status: "pending", stage: "queued", attempts: 0, is_current_schema: false })),
  "s5-failed": () => envelope(null, generation({ status: "failed", stage: "failed", attempts: 3, is_current_schema: false })),
  "s5-readynull": (n) => {
    if (FLIP_AFTER > 0 && n > FLIP_AFTER) return envelope(errorsJson({ long: false, plan: true }));
    if (n <= 2) return { report: null };
    return envelope(null, generation({ status: "ready", stage: "ready" }));
  },
  "s5-pending-then-ready": (n) =>
    FLIP_AFTER > 0 && n > FLIP_AFTER
      ? envelope(errorsJson({ long: true, plan: true }))
      : envelope(null, generation({ status: n > 2 ? "generating" : "pending", stage: n > 2 ? "collecting_evidence" : "queued", attempts: 1, is_current_schema: false })),
  // deep scan could not be completed: no «глубоких сбоев не выявлено», says so instead
  "s9-deepscan-incomplete": () => envelope(errorsJson({ long: false, plan: true, boundaryOver: { breakpoint_skills: [], breakpoint_evidence: "observed" }, metaOver: { deep_scan_incomplete: true } })),
  // historical rebuild: the OLD report is returned while generating (is_current_schema false), then the new one
  "s9-rebuild": (n) =>
    FLIP_AFTER > 0 && n > FLIP_AFTER
      ? envelope(errorsJson({ long: false, plan: true }))
      : envelope(legacyJson(), generation({ status: n > 2 ? "generating" : "pending", stage: "collecting_evidence", is_current_schema: false })),
  // explicit regeneration of a CURRENT-format report: schema-5 content, generation pending/generating with
  // is_current_schema=false; sections without data show «Раздел обновляется вместе с отчётом», no «старый формат»
  "s9-rebuild-current": (n) => {
    if (FLIP_AFTER > 0 && n > FLIP_AFTER) return envelope(errorsJson({ long: false, plan: true }));
    const json = errorsJson({ long: false, plan: false });
    delete json.diagnostic_boundary;
    json.root_cause_chains = [];
    json.cognitive_error_types = [];
    return envelope(json, generation({ status: "generating", stage: "collecting_evidence", is_current_schema: false }));
  },
  // real reports have 15-21 error records -> 5-7 journal pages; LaTeX answers, a wide formula every 4th record
  "s10-many-errors": () => {
    const json = errorsJson({ long: false, plan: true });
    json.error_patterns = Array.from({ length: 21 }, (_, i) => errorPattern(i, i % 4 === 0));
    json.report_meta.questions_correct = 12;
    json.report_meta.total_questions = 33;
    return envelope(json);
  },
  // MCQ records whose stored answer is an OLD option text (a content repair changed the option) or the plain /
  // Unicode form of a LaTeX option. Card 1: no option matches -> «Выбранный ответ ученика (вариант из прежней
  // версии задания)»; cards 2-3: matched after normalisation -> the option itself is marked as chosen.
  "s11-legacy-option": () => {
    const json = errorsJson({ long: false, plan: true });
    const mcq = (i, over) => ({ ...errorPattern(i, false), eval_category: "wrong", distractor_explanation: null, ...over });
    json.error_patterns = [
      mcq(0, {
        skill_name_ru: "Системы неравенств",
        question_text: "Решите систему неравенств.",
        question_latex: "Решите систему неравенств: $|x| < 5$, $x \\le 4$",
        answer_options: ["а) x < 5 и x > -5; б) x ≤ 4", "а) x < 4", "а) x > 5", "нет решений"],
        answer_options_latex: ["а) $x < 5$ и $x > -5$; б) $x \\le 4$", "а) $x < 4$", "а) $x > 5$", "нет решений"],
        student_answer: "а) x < 5; б) x ≤ 4", student_answer_latex: null,
        correct_answer: "а) x < 5 и x > -5; б) x ≤ 4", correct_answer_latex: "а) $x < 5$ и $x > -5$; б) $x \\le 4$",
      }),
      mcq(1, {
        skill_name_ru: "Корни и дроби",
        question_text: "Вычислите значение выражения.",
        question_latex: "Вычислите: $1 + \\frac{1}{\\sqrt{3}}$ при $x = 1$",
        answer_options: ["1 + 1/√3", "1 - 1/√3", "2", "√3"],
        answer_options_latex: ["$1 + \\frac{1}{\\sqrt{3}}$", "$1 - \\frac{1}{\\sqrt{3}}$", "$2$", "$\\sqrt{3}$"],
        student_answer: "1 - 1/√3", student_answer_latex: null,
        correct_answer: "1 + 1/√3", correct_answer_latex: "$1 + \\frac{1}{\\sqrt{3}}$",
      }),
      mcq(2, {
        skill_name_ru: "Логарифмы",
        question_text: "Найдите область значений.",
        question_latex: "Найдите область: $\\log_2 x$",
        answer_options: ["(0; ln 3)", "(0; 3)", "(-∞; ln 3)", "неверно, так как log_2 (1/4) = -4"],
        answer_options_latex: ["$(0; \\ln 3)$", "$(0; 3)$", "$(-\\infty; \\ln 3)$", "неверно, так как $\\log_{2} \\frac{1}{4} = -4$"],
        student_answer: "неверно, так как log_2 (1/4) = -4", student_answer_latex: null,
        correct_answer: "(0; ln 3)", correct_answer_latex: "$(0; \\ln 3)$",
      }),
      { ...errorPattern(3, false), answer_type: "text", answer_options: [], answer_options_latex: [], student_answer: "17", student_answer_latex: null },
    ];
    return envelope(json);
  },
  // an indivisible formula wider than ANY card (1 x 44 matrix): the scroll affordance (edge fade, scroll region)
  // shows at 360 / 768 / 1280 alike - in an MCQ option, in the student's answer and in the correct answer
  "s12-wide-option": () => {
    const json = errorsJson({ long: false, plan: true });
    const wide = "$$\\begin{pmatrix}" + Array.from({ length: 44 }, (_, i) => `\\frac{x^{${i + 1}}}{${i + 1}}`).join(" & ") + "\\end{pmatrix}$$";
    json.error_patterns = [{
      ...errorPattern(0, false),
      question_latex: "Выберите верную запись матрицы.",
      answer_options: ["a", "b", "c", "d"],
      answer_options_latex: [wide, "$x^2$", "$\\sqrt{x}$", "$\\frac{1}{x}$"],
      student_answer: "b",
      correct_answer: "a",
      correct_answer_latex: wide,
    }];
    json.report_meta.questions_correct = 11;
    return envelope(json);
  },
  // rebuild where the old report is LONGER (4 records, 2 journal pages) than the new one (2 records)
  "s9-rebuild-long": (n) =>
    FLIP_AFTER > 0 && n > FLIP_AFTER
      ? envelope(errorsJson({ long: false, plan: true }))
      : envelope(errorsJson({ long: true, plan: true, metaOver: { report_schema_version: 4, generated_on: "2026-09-01" } }), generation({ status: "generating", stage: "collecting_evidence", is_current_schema: false })),
  // truthy non-object report_json: must not poll forever
  "s9-invalid-json": () => envelope("oops", generation()),
  // transient server failures while polling: pending, 503, 503, then the report
  "s9-flaky": (n) => (n === 2 || n === 3 ? { __http: 503, detail: "Service unavailable (synthetic)" } : n === 1 ? envelope(null, generation({ status: "pending", stage: "queued", is_current_schema: false })) : envelope(errorsJson({ long: false, plan: true }))),
  "s6-legacy": () => envelope(legacyJson(), generation({ is_current_schema: false })),
  "s6-partial": () => envelope({ report_meta: {} }, generation({ is_current_schema: false })),
  // a rebuild was queued for a row WITHOUT json: report_json is only the service placeholder (report_jobs.py);
  // the page must say «report is being prepared» and poll - never «старый формат» - then show the real report
  "s9-regeneration-placeholder": (n) =>
    FLIP_AFTER > 0 && n > FLIP_AFTER
      ? envelope(errorsJson({ long: false, plan: true }))
      : envelope({ _regeneration: { narrative: "deterministic" } }, generation({ status: n > 2 ? "generating" : "pending", stage: n > 2 ? "collecting_evidence" : "queued", attempts: 0, is_current_schema: false })),
  "s8-degraded": () => {
    const json = errorsJson({ long: false, plan: true });
    json.report_meta.degraded = ["skill_names"];
    return envelope(json, generation({ status: "failed", stage: "failed", is_current_schema: false }));
  },
};

// ─── HTTP ─────────────────────────────────────────────────────────────────────

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "content-type");
  res.setHeader("Cache-Control", "no-store");
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const bump = (key) => (counters[key] = (counters[key] || 0) + 1);

// ─── Student flows: /d/<code> (diagnostic) and /e/<code> (exam) with a very wide LaTeX option ──────────
// Any code works: http://127.0.0.1:3204/d/ui-wide   http://127.0.0.1:3204/e/ui-wide
// The mock records every POST: GET /__mock/flow/<code> -> { d: {...}, e: {...} } (counts + submitted answers).
const flows = new Map();
const flowOf = (code) => {
  if (!flows.has(code)) flows.set(code, { d: { createPosts: 0, answerPosts: 0, answers: [], created: false, answered: 0 }, e: { startPosts: 0, progressPosts: 0, progress: [] } });
  return flows.get(code);
};
const WIDE_OPTION = "$$\\begin{pmatrix}" + Array.from({ length: 44 }, (_, i) => `\\frac{x^{${i + 1}}}{${i + 1}}`).join(" & ") + "\\end{pmatrix}$$";
// option texts are the submitted answers; the wide one is first (A), then normal short options
const OPT_TEXT = ["Широкая матрица", "x в квадрате", "корень из x", "единица на x"];
const OPT_LATEX = [WIDE_OPTION, "$x^2$", "$\\sqrt{x}$", "$\\frac{1}{x}$"];
const STUDENT_TASKS = 3;
const questionOf = (i) => ({
  question_text: `Вопрос ${i + 1}: выберите верную запись.`,
  question_latex: `Вопрос ${i + 1}: выберите верную запись $f(x)$.`,
  // task 2 (index 1): normal options only; tasks 1 and 3 carry the wide formula
  options: i === 1 ? ["x в квадрате", "корень из x", "единица на x", "ноль"] : OPT_TEXT,
  options_latex: i === 1 ? ["$x^2$", "$\\sqrt{x}$", "$\\frac{1}{x}$", "$0$"] : OPT_LATEX,
});
const diagTask = (i) => {
  const q = questionOf(i);
  return {
    task_id: `D-${i + 1}`, skill_id: `SK-D-${i + 1}`, topic_id: "T-D", question_text: q.question_text, question_latex: q.question_latex,
    question_image_url: null, answer_type: "multiple_choice", answer_options: q.options, answer_options_latex: q.options_latex, hints: [],
    phase: "navigation", items_answered: i, items_max: STUDENT_TASKS, is_deep_scan: false,
  };
};
const examTask = (i) => {
  const q = questionOf(i);
  return { task_id: `E-${i + 1}`, text: q.question_text, question_latex: q.question_latex, options: q.options, options_latex: q.options_latex, difficulty: "medium", skill_name: "Функции", answer_type: "multiple_choice" };
};
function readJson(req, cb) {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => { let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (_) { /* keep {} */ } cb(body); });
}

function handle(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  if (process.env.MOCK_LOG === "1") console.log(req.method, path + url.search);

  if (path === "/__mock/stats") return send(res, 200, counters);
  if (path === "/__mock/reset") { for (const k of Object.keys(counters)) delete counters[k]; flows.clear(); return send(res, 200, { reset: true }); }
  let fm = /^\/__mock\/flow\/([^/]+)$/.exec(path);
  if (fm) return send(res, 200, flowOf(decodeURIComponent(fm[1])));
  let m = /^\/__mock\/role\/(admin|teacher)$/.exec(path);
  if (m) {
    defaultRole = m[1];
    res.setHeader("Set-Cookie", [`mock_role=${m[1]}; Path=/; SameSite=Lax`, "algo_auth_token=synthetic-render-only; Path=/; SameSite=Lax"]);
    const next = url.searchParams.get("next");
    if (next && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(next)) {
      res.writeHead(302, { Location: next });
      return res.end();
    }
    return send(res, 200, { role: m[1], hint: "cookies mock_role + algo_auth_token set for host 127.0.0.1" });
  }

  if (path === "/api/v1/auth/me") {
    const role = cookies(req).mock_role === "teacher" || (!cookies(req).mock_role && defaultRole === "teacher") ? "teacher" : "admin";
    return send(res, 200, {
      id: "SYN-STAFF", email: "synthetic@example.test", first_name: "Проверка", last_name: "Отображения", full_name: "Проверка Отображения",
      role, org_role: role, default_org_id: "SYN-ORG", org_name: "Синтетический центр", language: "ru",
      is_active: true, is_verified: true, must_change_password: false, created_at: null,
    });
  }

  m = /^\/api\/v1\/auth\/org\/diagnostics\/([^/]+)$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[1]);
    bump(`${id} invite`);
    if (id === "s7-403") return send(res, 403, { detail: "Forbidden (synthetic)" });
    if (id === "s7-404" || !(id in SCENARIOS)) return send(res, 404, { detail: "Not found (synthetic)" });
    return send(res, 200, {
      id, code: "SYN-0001", student_name: "Синтетический Ученик", student_id: `stu-${id}`, session_id: `sess-${id}`,
      class_level: 9, diagnostic_type: "entry", status: "completed", student_status: "prospective",
      completed_at: "2026-10-04T10:00:00Z",
    });
  }

  m = /^\/api\/v1\/auth\/org\/diagnostics\/([^/]+)\/acknowledge-report$/.exec(path);
  if (m) { bump(`${decodeURIComponent(m[1])} acknowledge`); return send(res, 200, { acknowledged: true }); }

  m = /^\/api\/v1\/auth\/org\/students\/([^/]+)\/profile$/.exec(path);
  if (m) {
    bump(`${decodeURIComponent(m[1]).replace(/^stu-/, "")} profile`);
    return send(res, 200, {
      student: { id: decodeURIComponent(m[1]), org_id: "SYN-ORG", first_name: "Синтетический", last_name: "Ученик", full_name: "Синтетический Ученик", class_level: 9, group_id: null, status: "prospective", display_id: null, student_phone: null, comment: null },
      group: null, teacher: null,
    });
  }

  m = /^\/api\/v1\/analytics\/students\/([^/]+)\/report$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[1]).replace(/^stu-/, "");
    const n = bump(`${id} report`);
    const build = SCENARIOS[id];
    if (!build) return send(res, 404, { detail: "Not found (synthetic)" });
    const body = build(n);
    if (body && body.__http) return send(res, body.__http, { detail: body.detail || "error (synthetic)" });
    return send(res, 200, body);
  }

  // ── student diagnostic flow (/d/<code>) ──
  m = /^\/api\/v1\/auth\/diagnostic\/([^/]+)$/.exec(path);
  if (m) {
    const code = decodeURIComponent(m[1]);
    return send(res, 200, { status: "confirmed", student_id: `stu-${code}`, class_level: 9, student_first_name: "Синтетический", student_last_name: "Ученик", org_name: "Синтетический центр" });
  }
  m = /^\/api\/v1\/auth\/diagnostic\/([^/]+)\/confirm$/.exec(path);
  if (m && req.method === "POST") { bump(`${decodeURIComponent(m[1])} d-confirm`); return send(res, 200, {}); }
  if (path === "/api/v1/diagnostic/sessions/by-invite") {
    const code = url.searchParams.get("invite_code") || "";
    const f = flowOf(code).d;
    if (!f.created) return send(res, 404, { detail: { code: "SESSION_NOT_FOUND", message: "Попытка не найдена (synthetic)" } });
    return send(res, 200, { session_id: `ds-${code}`, status: "active", items_answered: f.answered, current_task: diagTask(f.answered), total_time_ms: 1000 });
  }
  if (path === "/api/v1/diagnostic/sessions" && req.method === "POST") {
    return readJson(req, (body) => {
      const code = body.invite_code || "";
      const f = flowOf(code).d;
      f.createPosts += 1;
      f.created = true;
      send(res, 200, { session_id: `ds-${code}`, first_task: diagTask(f.answered) });
    });
  }
  m = /^\/api\/v1\/diagnostic\/sessions\/ds-([^/]+)\/answer$/.exec(path);
  if (m && req.method === "POST") {
    const code = decodeURIComponent(m[1]);
    return readJson(req, (body) => {
      const f = flowOf(code).d;
      f.answerPosts += 1;
      f.answers.push({ task_id: body.task_id, student_answer: body.student_answer, invite_header: req.headers["x-diagnostic-invite-code"] || null });
      f.answered += 1;
      const done = f.answered >= STUDENT_TASKS;
      send(res, 200, { is_correct: false, outcome: 0, eval_category: "wrong", theta: -0.2, se: 0.6, next_task: done ? null : diagTask(f.answered), session_completed: done });
    });
  }
  m = /^\/api\/v1\/diagnostic\/sessions\/ds-([^/]+)\/report$/.exec(path);
  if (m) {
    return send(res, 200, { session_id: `ds-${decodeURIComponent(m[1])}`, student_id: "stu-ui", grade_level: 9, overall_theta: -0.2, overall_level: "at_grade", confidence_interval: [-1, 1], topic_breakdown: {}, weak_skills: [], recommended_start: null, items_total: STUDENT_TASKS, total_time_ms: 5000, report_generation: { status: "ready" } });
  }
  // ── student exam flow (/e/<code>) ──
  m = /^\/api\/v1\/exams\/by-code\/([^/]+)$/.exec(path);
  if (m) return send(res, 200, { title: "Синтетический экзамен", teacher_name: "Синтетический преподаватель", subject: "Математика", status: "active", total_time_minutes: 45, tasks_per_variant: STUDENT_TASKS, variants_count: 1 });
  m = /^\/api\/v1\/exams\/by-code\/([^/]+)\/check-student$/.exec(path);
  if (m && req.method === "POST") return send(res, 200, { enrolled: true, group_required: false, student: null, already_submitted: false });
  m = /^\/api\/v1\/exams\/by-code\/([^/]+)\/start$/.exec(path);
  if (m && req.method === "POST") {
    const code = decodeURIComponent(m[1]);
    flowOf(code).e.startPosts += 1;
    return send(res, 200, { session_id: `es-${code}`, session_token: "synthetic", variant_number: 1, time_minutes: 45, status: "in_progress", tasks: Array.from({ length: STUDENT_TASKS }, (_, i) => examTask(i)) });
  }
  m = /^\/api\/v1\/exam-sessions\/es-([^/]+)\/progress$/.exec(path);
  if (m && req.method === "POST") {
    const code = decodeURIComponent(m[1]);
    return readJson(req, (body) => {
      const f = flowOf(code).e;
      f.progressPosts += 1;
      f.progress.push(body.answers || {});
      send(res, 200, { ok: true, answered_count: Object.keys(body.answers || {}).length });
    });
  }

  if (path === "/api/v1/auth/org/groups" || path === "/api/v1/auth/org/members") return send(res, 200, []);
  if (process.env.MOCK_LOG === "1") console.log("  -> unhandled, 404");
  return send(res, 404, { detail: `Unhandled synthetic path: ${path}` });
}

http.createServer((req, res) => {
  if (LATENCY > 0) setTimeout(() => handle(req, res), LATENCY);
  else handle(req, res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`report mock API on http://127.0.0.1:${PORT} (role default: ${defaultRole}, flip after ${FLIP_AFTER})`);
});
