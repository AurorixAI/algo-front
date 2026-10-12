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
 *   s6-partial          report_json = {} (nothing but empty shell)
 *   s7-404              GET /auth/org/diagnostics/<id> -> 404
 *   s8-degraded         current schema but report_meta.degraded = ["skill_names"]
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

const boundary = (long) => ({
  anchor_level: long ? "5 класс (опорный фундамент диагностики)" : "5 класс",
  anchor_skills: long ? LONG_SKILLS : ["Сложение дробей"],
  breakpoint_level: long ? "4 класс (первичное нарушение логики вычислений)" : "4 класс",
  breakpoint_skills: long ? LONG_SKILLS.slice(0, 2) : ["Сокращение дробей"],
  blocked_level: long ? "9 класс (текущий класс обучения ученика)" : "9 класс",
  blocked_skills: long ? LONG_SKILLS.slice(1) : ["Квадратные уравнения"],
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

const errorsJson = ({ long, plan, noPatterns }) => ({
  report_meta: baseMeta(),
  overall: {
    score_percent: 58, status: "below", status_label_ru: "Ниже уровня класса",
    student_summary: "Автоматическое резюме: часть заданий решена верно, по ряду тем есть ошибки.",
  },
  level: level({ provisional: long }),
  diagnostic_boundary: boundary(long),
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
  "s6-legacy": () => envelope(legacyJson(), generation({ is_current_schema: false })),
  "s6-partial": () => envelope({}, generation({ is_current_schema: false })),
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

function handle(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  if (process.env.MOCK_LOG === "1") console.log(req.method, path + url.search);

  if (path === "/__mock/stats") return send(res, 200, counters);
  if (path === "/__mock/reset") { for (const k of Object.keys(counters)) delete counters[k]; return send(res, 200, { reset: true }); }
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
    return send(res, 200, build(n));
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
