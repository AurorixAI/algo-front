/**
 * Pure helpers of the diagnostic report page (N03a, owner decision O4; N04a).
 *
 * N04a adds: placeholders so no visible tab is ever blank (`tabContentState`),
 * one normalisation of report_json so old / partial reports never crash the page
 * (`normalizeReportJson`), the bounded polling schedule (`nextReportPollStep`),
 * and the honest stale / degraded notes (`reportMetaInfo`). None of the texts
 * built on these helpers claims anything the report does not carry.
 *
 * Rules:
 *  - a plan step shows a duration only if the report carries one (the backend no
 *    longer invents `estimated_hours`; reports built earlier are stripped on read);
 *  - the plan has one recommended start: the report's `recommended_start`, which
 *    is by construction the first plan step;
 *  - an error-free attempt is a positive scenario (achievements + a development
 *    step), never a "gap" scenario.
 */

export interface PlanStepLike {
  skill_id?: string | null;
  skill_name_ru?: string | null;
  action_title?: string | null;
  estimated_hours?: number | null;
  kind?: string | null;
}

export interface ReportShapeLike {
  report_meta?: {
    error_free?: boolean | null;
    total_questions?: number | null;
    questions_correct?: number | null;
  } | null;
  error_patterns?: unknown[] | null;
  recommended_start?: { skill_id?: string | null; skill_name_ru?: string | null } | null;
  action_plan?: PlanStepLike[] | null;
}

/** A positive, finite number of hours of one step; null when the report gives none. */
export function stepHours(step: PlanStepLike | null | undefined): number | null {
  const value = step?.estimated_hours;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Sum of the durations the report really carries; null when no step has one. */
export function knownPlanHours(plan: PlanStepLike[] | null | undefined): number | null {
  let total = 0;
  for (const step of plan ?? []) total += stepHours(step) ?? 0;
  return total > 0 ? total : null;
}

/** "~2 часа": Russian plural of a whole number of hours. */
export function hoursLabel(hours: number): string {
  const n = Math.round(hours);
  const last = n % 10;
  const tail = n % 100;
  const word = tail >= 11 && tail <= 14 ? "часов" : last === 1 ? "час" : last >= 2 && last <= 4 ? "часа" : "часов";
  return `~${n} ${word}`;
}

/** True for a development ("next growth") step of an error-free attempt. */
export function isDevelopmentStep(step: PlanStepLike | null | undefined): boolean {
  return step?.kind === "development";
}

/**
 * Error-free attempt: nothing contradicts it. The backend flag `report_meta.error_free`
 * decides, but it cannot override facts of the same report: any error record, or any
 * wrong answer counted by `report_meta` / `level` / the score (wrongAnswersState),
 * makes the attempt not error-free. A report without the flag falls back to the
 * counts (every answer solved).
 */
export function isErrorFreeReport(report: ReportShapeLike | null | undefined): boolean {
  if ((report?.error_patterns?.length ?? 0) > 0) return false;
  if (wrongAnswersState(report as Obj | null | undefined) === "yes") return false;
  const meta = report?.report_meta;
  if (typeof meta?.error_free === "boolean") return meta.error_free;
  const total = meta?.total_questions ?? 0;
  return total > 0 && meta?.questions_correct === total;
}

/** Name of the one recommended start (== first plan step); null when there is no plan. */
export function recommendedStartName(report: ReportShapeLike | null | undefined): string | null {
  const first = report?.action_plan?.[0];
  return report?.recommended_start?.skill_name_ru
    || first?.skill_name_ru
    || first?.action_title
    || null;
}

// ─── N04a: report normalisation ───────────────────────────────────────────────

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const asObjArray = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const asStrArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

const REPORT_CONTENT_KEYS = [
  "report_meta", "overall", "level", "error_patterns", "action_plan", "root_cause_chains", "cognitive_error_types",
  "strong_skills", "weak_skills", "critical_gaps", "diagnostic_boundary", "achievements", "recommended_start",
];

/**
 * An object that carries a report: at least one report key. A placeholder is NOT a report:
 * `{}` or an object of underscore-prefixed service keys only - e.g. the backend queues a
 * rebuild of a row without JSON as {"_regeneration": {"narrative": "deterministic"}}
 * (report_jobs.py). The page treats it like null: "no report yet", pending UI and polling.
 */
export function hasReportContent(raw: unknown): boolean {
  return isObj(raw) && REPORT_CONTENT_KEYS.some((key) => raw[key] !== undefined);
}

/**
 * report_json as stored may be old or partial (reports built before schema 5 have no
 * `achievements`, `diagnostic_boundary`, `level` ...). The page reads the result of
 * this function only: every list is a list, `report_meta` / `overall` are objects,
 * nothing is invented (a missing number stays missing). null when there is no report
 * (null, a non-object, `{}`, a service placeholder - see hasReportContent).
 */
export function normalizeReportJson(raw: unknown): Obj | null {
  if (!hasReportContent(raw)) return null;
  return normalizeReportObject(raw as Obj);
}

function normalizeReportObject(raw: Obj): Obj {
  const out: Obj = { ...raw };
  for (const key of [
    "error_patterns", "action_plan", "strong_skills", "weak_skills", "critical_gaps",
  ]) out[key] = asObjArray(raw[key]);
  // `achievements` exists only in schema 5: an absent key stays absent (that is how
  // reportAchievements tells "none confirmed" from "an older report").
  if (Array.isArray(raw.achievements)) out.achievements = asObjArray(raw.achievements);
  else delete out.achievements;
  out.report_meta = isObj(raw.report_meta) ? raw.report_meta : {};
  out.overall = isObj(raw.overall) ? raw.overall : {};
  out.root_cause_chains = asObjArray(raw.root_cause_chains).map((chain) => {
    const steps = asObjArray(chain.steps);
    return {
      ...chain,
      steps,
      steps_count: typeof chain.steps_count === "number" ? chain.steps_count : steps.length,
    };
  });
  out.cognitive_error_types = asObjArray(raw.cognitive_error_types).map((cluster) => {
    const examples = asObjArray(cluster.examples);
    // a missing count stays missing (the page hides the badge): examples are a sample, not the total
    const out2: Obj = { ...cluster, examples };
    if (typeof cluster.count !== "number") delete out2.count;
    return out2;
  });
  if (isObj(raw.diagnostic_boundary)) {
    const b = raw.diagnostic_boundary;
    out.diagnostic_boundary = {
      ...b,
      anchor_level: typeof b.anchor_level === "string" ? b.anchor_level : "",
      breakpoint_level: typeof b.breakpoint_level === "string" ? b.breakpoint_level : "",
      blocked_level: typeof b.blocked_level === "string" ? b.blocked_level : "",
      anchor_skills: asStrArray(b.anchor_skills),
      breakpoint_skills: asStrArray(b.breakpoint_skills),
      blocked_skills: asStrArray(b.blocked_skills),
    };
  } else {
    delete out.diagnostic_boundary;
  }
  return out;
}

/** 0..100 score of the report, null when the report carries none (never a made-up 0). */
export function reportScorePercent(report: { overall?: Obj | null; report_meta?: Obj | null } | null | undefined): number | null {
  for (const value of [report?.overall?.score_percent, report?.report_meta?.score_percent]) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.min(100, Math.max(0, value));
  }
  return null;
}

/** Wrong answers = asked - correct; null unless both numbers are in the report. */
export function reportWrongCount(meta: { total_questions?: unknown; questions_correct?: unknown } | null | undefined): number | null {
  const total = meta?.total_questions;
  const correct = meta?.questions_correct;
  if (typeof total !== "number" || typeof correct !== "number" || !Number.isFinite(total) || !Number.isFinite(correct)) return null;
  return Math.max(0, total - correct);
}

/**
 * Skills solved without a wrong attempt. Schema 5 carries `achievements` (verified:
 * possibly an empty list, which stays empty). Only a report WITHOUT that key falls back
 * to `strong_skills` - a model estimate (mastery), not a verified fact: `fallback` says so
 * and the page labels it «Сильные стороны (по оценке модели)».
 */
export function resolveAchievements(report: Obj | null | undefined): { items: Obj[]; fallback: boolean } {
  if (Array.isArray(report?.achievements)) return { items: asObjArray(report?.achievements), fallback: false };
  const items = asObjArray(report?.strong_skills).map((s) => ({
    skill_id: s.skill_id,
    skill_name_ru: s.skill_name_ru,
    mastery_percent: s.mastery_percent,
  }));
  return { items, fallback: items.length > 0 };
}

export function reportAchievements(report: Obj | null | undefined): Obj[] {
  return resolveAchievements(report).items;
}

// ─── N04a: Russian plurals and step outcome ───────────────────────────────────

/** 1 шаг / 2 шага / 5 шагов / 11 шагов / 21 шаг / 22 шага / 0 шагов. */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const v = Number.isFinite(n) ? Math.abs(Math.trunc(n)) : 0;
  const tail = v % 100;
  const last = v % 10;
  if (tail >= 11 && tail <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
export const stepsLabel = (n: number) => `${n} ${pluralRu(n, "шаг", "шага", "шагов")}`;
export const errorsLabel = (n: number) => `${n} ${pluralRu(n, "ошибка", "ошибки", "ошибок")}`;
export const tasksLabel = (n: number) => `${n} ${pluralRu(n, "задание", "задания", "заданий")}`;
export const stagesLabel = (n: number) => `${n} ${pluralRu(n, "этап", "этапа", "этапов")}`;

/** Outcome of a deep-scan step: only a number is a fact; a missing outcome is "unknown", never an error. */
export function stepOutcomeState(outcome: unknown): "correct" | "wrong" | "unknown" {
  if (typeof outcome !== "number" || !Number.isFinite(outcome)) return "unknown";
  return outcome >= 1 ? "correct" : "wrong";
}

// ─── N04a: no blank tab ───────────────────────────────────────────────────────

/**
 *  errors               - error records to show;
 *  error_free           - genuinely error-free (isErrorFreeReport): the positive framing;
 *  records_unavailable  - not error-free, no error records (old report, or records lost):
 *                         never framed as "no errors" - the wrong answers are real;
 *  no_records           - not flagged error-free, no records, and the report itself
 *                         counts zero wrong answers (rare, contradictory flags).
 */
export type JournalTabState = "errors" | "error_free" | "records_unavailable" | "no_records";
export type SkillsTabState = "content" | "empty";
/**
 *  plan                  - errors and a plan: the roadmap;
 *  error_free_with_step  - error-free + a development step: the notice, then the step;
 *  error_free_no_plan    - error-free, nothing to correct and no step: the notice only;
 *  not_built             - not error-free but no plan items: honest "not formed".
 */
export type PlanTabState = "plan" | "error_free_with_step" | "error_free_no_plan" | "not_built";

export interface TabContentState {
  journal: JournalTabState;
  skills: SkillsTabState;
  plan: PlanTabState;
}

/**
 * Does the report itself count wrong answers? "yes" when any source (asked - correct
 * of report_meta, solved < total of `level`, or, with no counts at all, a score under
 * 100) says so; "no" when a count says zero; "unknown" when it carries no numbers.
 */
export function wrongAnswersState(report: Obj | null | undefined): "yes" | "no" | "unknown" {
  const counts: number[] = [];
  const metaWrong = reportWrongCount(report?.report_meta);
  if (metaWrong !== null) counts.push(metaWrong);
  const lv = report?.level;
  if (isObj(lv) && typeof lv.solved === "number" && typeof lv.total === "number" && Number.isFinite(lv.solved) && Number.isFinite(lv.total) && lv.total > 0) {
    counts.push(Math.max(0, lv.total - lv.solved));
  }
  if (counts.some((n) => n > 0)) return "yes";
  if (counts.length > 0) return "no";
  const score = reportScorePercent(report);
  if (score === null) return "unknown";
  return score < 100 ? "yes" : "no";
}

export const JOURNAL_UNAVAILABLE_TEXT = "Подробные записи об ошибках для этого отчёта недоступны";
export const JOURNAL_UNAVAILABLE_LEGACY_TEXT = "Отчёт сформирован в старом формате.";

/** The boundary card has something to say only if a level or a skill is named. */
export function hasBoundaryData(boundary: unknown): boolean {
  if (!isObj(boundary)) return false;
  return (
    ["anchor_level", "breakpoint_level", "blocked_level"].some((k) => typeof boundary[k] === "string" && boundary[k].trim() !== "") ||
    ["anchor_skills", "breakpoint_skills", "blocked_skills"].some((k) => asStrArray(boundary[k]).length > 0)
  );
}

/**
 * What each tab renders. Every tab is visible, so each must show either its content
 * or an honest placeholder; the page picks the placeholder from this state.
 */
export function tabContentState(report: Obj | null | undefined): TabContentState {
  const patterns = asObjArray(report?.error_patterns);
  const plan = asObjArray(report?.action_plan);
  const errorFree = isErrorFreeReport(report as ReportShapeLike | null | undefined);

  const journal: JournalTabState =
    patterns.length > 0 ? "errors"
      : errorFree ? "error_free"
        : wrongAnswersState(report) === "no" ? "no_records"
          : "records_unavailable";

  const hasChains = asObjArray(report?.root_cause_chains).length > 0;
  const hasClusters = asObjArray(report?.cognitive_error_types).length > 0;
  // the chains block renders for error-free and for other attempts alike
  const skillsHaveContent =
    hasChains || hasClusters ||
    (errorFree ? reportAchievements(report).length > 0 : hasBoundaryData(report?.diagnostic_boundary));

  let planState: PlanTabState;
  if (plan.length > 0) planState = errorFree ? "error_free_with_step" : "plan";
  else planState = errorFree ? "error_free_no_plan" : "not_built";

  return { journal, skills: skillsHaveContent ? "content" : "empty", plan: planState };
}

export const PLAN_NOT_NEEDED_TEXT = "Коррекционный план не нужен: ошибок не обнаружено";
export const PLAN_NOT_BUILT_TEXT = "План не сформирован: недостаточно данных для рекомендаций";
export const SKILLS_EMPTY_TEXT = "Недостаточно данных для анализа навыков";
/** An old-format report simply has no such section: say that instead of "not enough data". */
export const SECTION_LEGACY_TEXT = "Этот раздел не входит в отчёт старого формата";
/** A current-format report that is being rebuilt: its empty section may fill in when the new one is ready. */
export const SECTION_UPDATING_TEXT = "Раздел обновляется вместе с отчётом";

/** What decides an empty section's wording: the report's CONTENT format and whether a rebuild runs. */
export interface SectionState {
  oldFormat?: boolean;
  rebuilding?: boolean;
}
export const planNotBuiltText = (state?: SectionState | null) =>
  state?.oldFormat ? SECTION_LEGACY_TEXT : state?.rebuilding ? SECTION_UPDATING_TEXT : PLAN_NOT_BUILT_TEXT;
export const skillsEmptyText = (state?: SectionState | null) =>
  state?.oldFormat ? SECTION_LEGACY_TEXT : state?.rebuilding ? SECTION_UPDATING_TEXT : SKILLS_EMPTY_TEXT;

// ─── N04 round 3: journal paging survives a report swap ───────────────────────

/** Page index clamped into [0, last page]: a shorter replacement report never shows an empty page. */
export function clampPage(page: number, total: number, perPage: number): number {
  const pages = perPage > 0 ? Math.ceil(Math.max(0, total) / perPage) : 0;
  const last = Math.max(0, pages - 1);
  const n = Number.isFinite(page) ? Math.trunc(page) : 0;
  return Math.min(Math.max(0, n), last);
}

const listLength = (v: unknown): string => (Array.isArray(v) ? String(v.length) : "");

/**
 * Numbered pager items for `total` pages (0-based `page`): every page up to 7, else
 * 1 … p-1 p p+1 … N (at most 7 items, "gap" = an ellipsis). Narrow screens show «3 / 7» instead.
 */
export function pagerItems(page: number, total: number): Array<number | "gap"> {
  const last = Math.max(0, Math.trunc(total) - 1);
  if (last < 0 || total <= 0) return [];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const cur = Math.min(Math.max(0, Math.trunc(Number.isFinite(page) ? page : 0)), last);
  const keep = new Set<number>([0, last, cur, cur - 1, cur + 1]);
  // near the ends keep a run, so the list stays 7 items long and the reader can step on
  if (cur <= 2) [1, 2, 3].forEach((n) => keep.add(n));
  if (cur >= last - 2) [last - 1, last - 2, last - 3].forEach((n) => keep.add(n));
  const sorted = [...keep].filter((n) => n >= 0 && n <= last).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((n, i) => {
    // an ellipsis must hide at least two pages: a single hidden page is shown instead
    if (i > 0 && n - sorted[i - 1] === 2) out.push(sorted[i - 1] + 1);
    else if (i > 0 && n - sorted[i - 1] > 2) out.push("gap");
    out.push(n);
  });
  return out;
}

/**
 * Identity of the report on screen. It changes when the report is REPLACED, not when the
 * same report is polled again - the page resets its UI state (journal page, expanded
 * chains and clusters) on a change only. A same-day, same-schema rebuild changes neither
 * `generated_on` (a date) nor `generated_at` (the backend sets it on INSERT only), so the
 * content shape is part of the identity: question count and the lengths of the lists.
 */
export function reportIdentity(response: { report_json?: unknown; generated_at?: unknown } | null | undefined): string {
  const rj: Obj = isObj(response?.report_json) ? (response!.report_json as Obj) : {};
  const meta: Obj = isObj(rj.report_meta) ? rj.report_meta : {};
  return [
    meta.session_id, meta.generated_on, meta.report_schema_version, response?.generated_at,
    meta.total_questions, meta.questions_correct,
    listLength(rj.error_patterns), listLength(rj.root_cause_chains), listLength(rj.cognitive_error_types),
    listLength(rj.achievements), listLength(rj.action_plan),
  ]
    .map((v) => (v === undefined || v === null ? "" : String(v)))
    .join("|");
}

// ─── N04a: diagnostic boundary wording (owner decision O4) ────────────────────

export interface BreakpointCopy {
  title: string;
  description: string;
  /** Shown when no skill is named; null = say nothing. */
  emptyText: string | null;
}

/**
 * The "breakpoint" card says only what its evidence supports. `breakpoint_evidence`:
 *   confirmed - a deep-scan trajectory reached it: a factual «Подтверждённый пробел»;
 *   observed (or missing, old reports) - only the earliest grade with wrong answers:
 *             «Ключевой наблюдаемый дефицит», no causal wording.
 * A "confirmed" boundary whose chains are ALL `evidence_source: "inferred"` (reconstructed
 * from the answers, no stored deep-scan link) is not confirmed by a deep scan: observed wording.
 * «Глубоких сбоев не выявлено» is never printed after an incomplete deep scan.
 * The skill lists of the boundary are capped by the backend (3 / 3 / 4): the texts say «основные».
 */
export function breakpointCopy(
  boundary: { breakpoint_evidence?: unknown; breakpoint_skills?: unknown } | null | undefined,
  reportMeta: { deep_scan_incomplete?: unknown } | null | undefined,
  chains?: Array<{ evidence_source?: unknown; root_gap_grade?: unknown; root_gap_skill_name?: unknown }> | null,
): BreakpointCopy {
  const incomplete = reportMeta?.deep_scan_incomplete === true;
  const confirmed = boundary?.breakpoint_evidence === "confirmed" && !breakpointChainsAllInferred(boundary, chains);
  if (confirmed) {
    return {
      title: "Подтверждённый пробел (углублённая проверка)",
      description: "Самый ранний класс среди пробелов, найденных углублённой проверкой; показаны основные навыки.",
      emptyText: incomplete ? "Углублённая проверка выполнена не полностью" : null,
    };
  }
  return {
    title: "Ключевой наблюдаемый дефицит",
    description: "Основные навыки с ошибками в самом раннем классе, где были ошибки.",
    emptyText: incomplete ? "Углублённая проверка выполнена не полностью" : "Наблюдаемых дефицитов нет",
  };
}

/**
 * The backend marks the boundary "confirmed" when ANY chain exists and takes the breakpoint
 * grade as the minimum over ALL chains, inferred ones included. So only the chains AT the
 * breakpoint (root_gap_grade == the minimum, or a root skill named in breakpoint_skills)
 * decide: if every one of them is reconstructed (`inferred`), nothing was confirmed by a
 * deep scan - a later stored-link chain does not confirm an earlier inferred breakpoint.
 */
function breakpointChainsAllInferred(
  boundary: { breakpoint_skills?: unknown } | null | undefined,
  chains: Array<{ evidence_source?: unknown; root_gap_grade?: unknown; root_gap_skill_name?: unknown }> | null | undefined,
): boolean {
  if (!Array.isArray(chains) || chains.length === 0) return false;
  const grades = chains.map((c) => c?.root_gap_grade).filter((g): g is number => typeof g === "number" && Number.isFinite(g));
  const minGrade = grades.length > 0 ? Math.min(...grades) : null;
  const names = new Set(asStrArray(boundary?.breakpoint_skills));
  const atBreakpoint = chains.filter(
    (c) =>
      (minGrade !== null && c?.root_gap_grade === minGrade) ||
      (typeof c?.root_gap_skill_name === "string" && names.has(c.root_gap_skill_name)),
  );
  const decisive = atBreakpoint.length > 0 ? atBreakpoint : chains;
  return decisive.every((c) => c?.evidence_source === "inferred");
}

/** The deep-scan chain was reconstructed from the answers (no stored link): shown with a neutral marker. */
export const CHAIN_INFERRED_TEXT = "выведено по ответам, без углублённой проверки";
export const isInferredChain = (chain: { evidence_source?: unknown } | null | undefined): boolean => chain?.evidence_source === "inferred";

// ─── N04a: report polling ─────────────────────────────────────────────────────

/** Same cap as the student result page (src/app/d/[code]/page.tsx REPORT_POLL_MAX_ATTEMPTS). */
export const REPORT_POLL_MAX_ATTEMPTS = 40;
export const REPORT_POLL_FIRST_DELAY_MS = 2000;
export const REPORT_POLL_MAX_DELAY_MS = 10000;

/** Backoff: 2.0 s, 2.5 s, 3.0 s ... capped at 10 s. `attempt` counts polls already made. */
export function reportPollDelayMs(attempt: number): number {
  const n = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  return Math.min(REPORT_POLL_FIRST_DELAY_MS + n * 500, REPORT_POLL_MAX_DELAY_MS);
}

export type ReportJsonState = "ok" | "missing" | "invalid";

/** "ok" = a report object the page can render; "missing" = none yet (null, `{}`, a service placeholder); "invalid" = something else (string, list, number). */
export function reportJsonState(raw: unknown): ReportJsonState {
  if (raw === null || raw === undefined) return "missing";
  if (isObj(raw)) return hasReportContent(raw) ? "ok" : "missing"; // {} / {"_regeneration": ...}: no report yet
  return "invalid";
}

/**
 * A historical rebuild keeps the OLD report_json while the new one is generated: the
 * old report stays on screen, flagged «Отчёт обновляется…», and the poll continues.
 */
export function isRebuildingReport(generation: { status?: string | null; is_current_schema?: boolean | null } | null | undefined): boolean {
  return generation?.is_current_schema === false && (generation?.status === "pending" || generation?.status === "generating");
}

export type ReportPollStep =
  | { kind: "done" }
  | { kind: "failed" }
  | { kind: "invalid" }
  | { kind: "exhausted" }
  | { kind: "wait"; delayMs: number };

/**
 * After a load / poll response decide what the page does next.
 *  - report_json is not a report object: stop, "unavailable" with a manual retry;
 *  - a usable report is there: stop - unless it is the old report of a running
 *    rebuild (is_current_schema === false and pending / generating): poll on;
 *  - generation failed (and no report): stop, the page shows the failure;
 *  - the cap is reached: stop and offer a manual re-check;
 *  - anything else polls: pending / generating, but also a null report and
 *    "ready" without report_json (the row is about to appear / be written).
 * `attempt` = number of polls already made after the initial load.
 */
export function nextReportPollStep(input: {
  attempt: number;
  jsonState: ReportJsonState;
  status?: string | null;
  isCurrentSchema?: boolean | null;
}): ReportPollStep {
  if (input.jsonState === "invalid") return { kind: "invalid" };
  const rebuilding = input.jsonState === "ok" && isRebuildingReport({ status: input.status, is_current_schema: input.isCurrentSchema });
  if (input.jsonState === "ok" && !rebuilding) return { kind: "done" };
  if (input.jsonState === "missing" && input.status === "failed") return { kind: "failed" };
  if (input.attempt >= REPORT_POLL_MAX_ATTEMPTS) return { kind: "exhausted" };
  return { kind: "wait", delayMs: reportPollDelayMs(input.attempt) };
}

/**
 * Consecutive transient fetch failures that are tolerated (the poll backs off and goes on):
 * the 3 first are, the 4th consecutive one ends the poll with an honest error.
 * Transient = status 0 (network), 408, 429, 5xx or no status at all; any other 4xx fails at once.
 */
export const REPORT_POLL_TOLERATED_FAILURES = 3;

export function isTransientStatus(status: number | null | undefined): boolean {
  return status === null || status === undefined || status === 0 || status === 408 || status === 429 || status >= 500;
}

export interface ReportPollerState {
  phase: "polling" | "done" | "failed" | "invalid" | "exhausted" | "error";
  /** Latest report response (null for `{report: null}`); absent on phase "exhausted" / "error" that keep the last one. */
  response?: any | null;
  /** The old report of a running rebuild is on screen and a new one is being built. */
  rebuilding: boolean;
  error?: { status: number | null; message: string };
}

export interface ReportPollerDeps {
  fetchReport: () => Promise<any>;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  isHidden: () => boolean;
  onState: (state: ReportPollerState) => void;
}

/**
 * The page's report poll as one object with injectable timers (so it is testable with
 * fake ones). Feed it every response with `ingest()` (the initial load included); it
 * decides with nextReportPollStep, polls with the backoff, never in a hidden tab,
 * tolerates REPORT_POLL_TOLERATED_FAILURES consecutive transient failures (status 0, 408,
 * 429, 5xx; the next one fails), fails at once on other 4xx, and after `cancel()` ignores every late response.
 * One timer at most exists at any time.
 */
export function createReportPoller(deps: ReportPollerDeps) {
  let cancelled = false;
  let timer: unknown = null;
  let attempt = 0;          // polls made after the initial load
  let failures = 0;         // consecutive transient failures
  let token = 0;            // identifies the in-flight request
  let waitingForVisible = false;

  const clear = () => {
    if (timer !== null) { deps.clearTimeout(timer); timer = null; }
  };
  const schedule = (ms: number) => {
    clear();
    timer = deps.setTimeout(tick, ms);
  };

  function tick() {
    timer = null;
    if (cancelled) return;
    if (deps.isHidden()) { waitingForVisible = true; return; }
    void poll();
  }

  async function poll() {
    attempt += 1;
    const mine = ++token;
    let response: any;
    try {
      response = await deps.fetchReport();
    } catch (e: any) {
      if (cancelled || mine !== token) return;
      const status = typeof e?.status === "number" ? e.status : null;
      failures += 1;
      if (isTransientStatus(status) && failures <= REPORT_POLL_TOLERATED_FAILURES) {
        if (attempt >= REPORT_POLL_MAX_ATTEMPTS) deps.onState({ phase: "exhausted", rebuilding: false });
        else schedule(reportPollDelayMs(attempt));
        return;
      }
      deps.onState({ phase: "error", rebuilding: false, error: { status, message: String(e?.message || "") } });
      return;
    }
    if (cancelled || mine !== token) return;
    ingest(response);
  }

  function ingest(raw: any) {
    if (cancelled) return;
    failures = 0;
    waitingForVisible = false;
    clear();
    const response = raw && typeof raw === "object" && "report" in raw && raw.report === null ? null : raw;
    const generation = response?.report_generation;
    const jsonState = reportJsonState(response?.report_json);
    const step = nextReportPollStep({
      attempt,
      jsonState,
      status: generation?.status,
      isCurrentSchema: generation?.is_current_schema,
    });
    const rebuilding = jsonState === "ok" && isRebuildingReport(generation);
    if (step.kind === "wait") {
      deps.onState({ phase: "polling", response, rebuilding });
      schedule(step.delayMs);
    } else if (step.kind === "exhausted") {
      deps.onState({ phase: "exhausted", response, rebuilding });
    } else {
      deps.onState({ phase: step.kind, response, rebuilding: false });
    }
  }

  return {
    /** Process a report response (initial load or poll). */
    ingest,
    /** The tab may be visible again: resume ONE pending poll (repeated events do nothing). */
    visibilityChanged() {
      if (cancelled || !waitingForVisible || deps.isHidden()) return;
      waitingForVisible = false;
      tick();
    },
    /** Stop: clears the timer, late responses are ignored. */
    cancel() {
      cancelled = true;
      token += 1;
      clear();
    },
  };
}

// ─── N04a: stale / degraded / dates ───────────────────────────────────────────

/** "2026-10-04" or "2026-10-04T10:00:00Z" -> "04.10.2026"; null for anything else. */
export function formatReportDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** Mirrors the backend REPORT_SCHEMA_VERSION (report_generator.py): the format of a report built now. */
export const CURRENT_REPORT_SCHEMA = 5;

/**
 * Format of the report by its CONTENT, not by generation status (an explicit regeneration
 * stamps a CURRENT report "not current" in the DB, a degraded one is re-queued): the
 * report's own `report_meta.report_schema_version` (schema 4 writes it too); a report without
 * the marker is current only if it carries a schema-5-only key (see below), otherwise old.
 */
export function reportContentSchema(report: Obj | null | undefined): number {
  const meta = report?.report_meta;
  const v = isObj(meta) ? meta.report_schema_version : undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  // `level` is NOT a marker: the schema-4 generator writes it too. Schema-5-only keys (absent from the
  // schema-4 generator): report_meta.error_free / generated_on, `achievements`, `recommended_start`.
  const schema5 =
    (isObj(meta) && (typeof meta.error_free === "boolean" || typeof meta.generated_on === "string")) ||
    Array.isArray(report?.achievements) ||
    report?.recommended_start !== undefined;
  return schema5 ? CURRENT_REPORT_SCHEMA : 0;
}

export const isOldFormatReport = (report: Obj | null | undefined): boolean =>
  hasReportContent(report) && reportContentSchema(report) < CURRENT_REPORT_SCHEMA;

export interface ReportMetaInfo {
  /** Date the student took the test (report_meta.date), "dd.mm.yyyy". */
  attemptDate: string | null;
  /** Date the report was built (report_meta.generated_on), "dd.mm.yyyy". */
  generatedOn: string | null;
  /** The report is in an old format by its content and not degraded: the «старом формате» banner. */
  legacy: boolean;
  /** Part of the reference data (names / hierarchy) was unavailable when it was built. */
  degraded: boolean;
  /** Backend reasons of the degradation (report_meta.degraded), e.g. skill_names, knowledge_hierarchy. */
  degradedReasons: string[];
  /** The old report is shown while a new one is being built (historical rebuild). */
  rebuilding: boolean;
  /**
   * The report on screen is in an old format BY ITS CONTENT (report_meta schema marker /
   * schema-5 fields), regardless of generation status. Placeholders and the journal line say
   * «старый формат» only then; a current report being rebuilt gets the neutral updating text.
   */
  oldFormat: boolean;
}

/**
 * Meta of the report on screen. The old-format verdict comes from the report's content
 * (reportContentSchema), never from `is_current_schema`: a current-format report that is
 * regenerated or degraded is stamped "not current" in the DB but is not an old format.
 * A degraded report shows its degraded note, not the old-format banner.
 */
export function reportMetaInfo(
  generation: { status?: string | null; is_current_schema?: boolean | null } | null | undefined,
  report: { report_meta?: Obj | null } | null | undefined,
): ReportMetaInfo {
  const meta = report?.report_meta;
  const reasons = Array.isArray(meta?.degraded) ? meta.degraded.filter((r: unknown): r is string => typeof r === "string") : [];
  const degraded = Array.isArray(meta?.degraded) ? meta.degraded.length > 0 : meta?.degraded === true;
  const oldFormat = isOldFormatReport(report as Obj | null | undefined) && !degraded;
  return {
    attemptDate: formatReportDate(meta?.date),
    generatedOn: formatReportDate(meta?.generated_on),
    legacy: oldFormat,
    degraded,
    degradedReasons: reasons,
    rebuilding: isRebuildingReport(generation),
    oldFormat,
  };
}

const DEGRADED_REASON_TEXT: Record<string, string> = {
  skill_names: "названия тем могут отображаться неполностью",
  knowledge_hierarchy: "группировка по разделам может быть неполной",
};

/** Neutral note of a degraded report, worded by the backend's reasons. */
export function degradedNote(reasons: string[] | null | undefined): string {
  const parts = (reasons ?? []).map((r) => DEGRADED_REASON_TEXT[r]).filter(Boolean);
  const detail = parts.length > 0 ? parts.join("; ") : "некоторые данные могут отображаться неполностью";
  return `При подготовке отчёта часть справочных данных была недоступна: ${detail}.`;
}

// ─── N04a: load error screens ─────────────────────────────────────────────────

export interface LoadErrorInfo {
  title: string;
  text: string;
  /** «Повторить» is offered only when repeating can help (not for 403 / 404). */
  retryable: boolean;
}

/**
 * Text of the error screen. `subject` is what failed to load: the diagnostic invite
 * (the page cannot open) or the report of an opened diagnostic.
 */
export function loadErrorInfo(
  status: number | null | undefined,
  message: string | null | undefined,
  subject: "diagnostic" | "report",
  retryable = true,
): LoadErrorInfo {
  // a final error ("no attempt id") is not "temporary": no «временно», no retry
  if (!retryable && status !== 403 && status !== 404) {
    return { title: subject === "diagnostic" ? "Диагностика недоступна" : "Отчёт недоступен", text: message?.trim() || "Отчёт для этой диагностики недоступен.", retryable: false };
  }
  if (status === 403) {
    return subject === "diagnostic"
      ? { title: "Нет доступа к этой диагностике", text: "У вашей учётной записи нет прав на просмотр этой диагностики. Если это ошибка, обратитесь к администратору.", retryable: false }
      : { title: "Нет доступа к отчёту", text: "У вашей учётной записи нет прав на просмотр отчёта этого ученика.", retryable: false };
  }
  if (status === 404) {
    return subject === "diagnostic"
      ? { title: "Диагностика не найдена", text: "Такой диагностики нет или она была удалена. Вернитесь к списку и выберите другую.", retryable: false }
      : { title: "Отчёт не найден", text: "Для этой попытки отчёт не найден.", retryable: false };
  }
  return {
    title: subject === "diagnostic" ? "Не удалось открыть диагностику" : "Отчёт временно недоступен",
    text: message?.trim() || "Не удалось загрузить отчёт. Повторите попытку.",
    retryable: true,
  };
}
export * from "./answer-match";
