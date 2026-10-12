/**
 * Pure helpers of the diagnostic report page (N03a, owner decision O4).
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
