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
 * Error-free attempt. The backend flag `report_meta.error_free` wins; a report
 * without it falls back to the counts (every answer solved, no error journal).
 */
export function isErrorFreeReport(report: ReportShapeLike | null | undefined): boolean {
  const meta = report?.report_meta;
  if (typeof meta?.error_free === "boolean") return meta.error_free;
  const total = meta?.total_questions ?? 0;
  return total > 0 && meta?.questions_correct === total && (report?.error_patterns?.length ?? 0) === 0;
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

/**
 * report_json as stored may be old or partial (reports built before schema 5 have no
 * `achievements`, `diagnostic_boundary`, `level` ...). The page reads the result of
 * this function only: every list is a list, `report_meta` / `overall` are objects,
 * nothing is invented (a missing number stays missing). null when there is no report.
 */
export function normalizeReportJson(raw: unknown): Obj | null {
  if (!isObj(raw)) return null;
  const out: Obj = { ...raw };
  for (const key of [
    "error_patterns", "action_plan", "strong_skills", "weak_skills", "critical_gaps", "achievements",
  ]) out[key] = asObjArray(raw[key]);
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
    return {
      ...cluster,
      examples,
      count: typeof cluster.count === "number" ? cluster.count : examples.length,
    };
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

/** Skills solved without a wrong attempt: `achievements`, else the strong skills of an older report. */
export function reportAchievements(report: Obj | null | undefined): Obj[] {
  const own = asObjArray(report?.achievements);
  if (own.length > 0) return own;
  return asObjArray(report?.strong_skills).map((s) => ({
    skill_id: s.skill_id,
    skill_name_ru: s.skill_name_ru,
    mastery_percent: s.mastery_percent,
  }));
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
  const skillsHaveContent = errorFree
    ? reportAchievements(report).length > 0 || hasClusters
    : hasBoundaryData(report?.diagnostic_boundary) || hasChains || hasClusters;

  let planState: PlanTabState;
  if (plan.length > 0) planState = errorFree ? "error_free_with_step" : "plan";
  else planState = errorFree ? "error_free_no_plan" : "not_built";

  return { journal, skills: skillsHaveContent ? "content" : "empty", plan: planState };
}

export const PLAN_NOT_NEEDED_TEXT = "Коррекционный план не нужен: ошибок не обнаружено";
export const PLAN_NOT_BUILT_TEXT = "План не сформирован: недостаточно данных для рекомендаций";
export const SKILLS_EMPTY_TEXT = "Недостаточно данных для анализа навыков";

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

export type ReportPollStep =
  | { kind: "done" }
  | { kind: "failed" }
  | { kind: "exhausted" }
  | { kind: "wait"; delayMs: number };

/**
 * After a load / poll response decide what the page does next.
 *  - the report is there: stop (whatever the generation status says);
 *  - generation failed (and no report): stop, the page shows the failure;
 *  - the cap is reached: stop and offer a manual re-check;
 *  - anything else polls: pending / generating, but also a null report and
 *    "ready" without report_json (the row is about to appear / be written).
 * `attempt` = number of polls already made after the initial load.
 */
export function nextReportPollStep(input: {
  attempt: number;
  hasReportJson: boolean;
  status?: string | null;
}): ReportPollStep {
  if (input.hasReportJson) return { kind: "done" };
  if (input.status === "failed") return { kind: "failed" };
  if (input.attempt >= REPORT_POLL_MAX_ATTEMPTS) return { kind: "exhausted" };
  return { kind: "wait", delayMs: reportPollDelayMs(input.attempt) };
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

export interface ReportMetaInfo {
  /** Date the student took the test (report_meta.date), "dd.mm.yyyy". */
  attemptDate: string | null;
  /** Date the report was built (report_meta.generated_on), "dd.mm.yyyy". */
  generatedOn: string | null;
  /** The report was built before the current format (report_generation.is_current_schema === false). */
  legacy: boolean;
  /** Part of the reference data (names / hierarchy) was unavailable when it was built. */
  degraded: boolean;
}

/**
 * A degraded report is stamped "not current" by the backend, but it is not an old
 * format: the degraded note wins and `legacy` is then false.
 */
export function reportMetaInfo(
  generation: { is_current_schema?: boolean | null } | null | undefined,
  report: { report_meta?: Obj | null } | null | undefined,
): ReportMetaInfo {
  const meta = report?.report_meta;
  const degraded = Array.isArray(meta?.degraded) ? meta.degraded.length > 0 : meta?.degraded === true;
  return {
    attemptDate: formatReportDate(meta?.date),
    generatedOn: formatReportDate(meta?.generated_on),
    legacy: generation?.is_current_schema === false && !degraded,
    degraded,
  };
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
): LoadErrorInfo {
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
