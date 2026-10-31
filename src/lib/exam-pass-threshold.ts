/**
 * The pass threshold of an exam (owner decision 31.10): % of the maximum score from which a student counts as having passed THIS exam.
 * One number for «Аналитика», «Отчёт» and the AI text; the server owns it, the screens only show and edit it.
 */
export const DEFAULT_PASS_THRESHOLD_PCT = 60;

export const PASS_THRESHOLD_HINT = "Ученик с результатом не ниже порога считается справившимся";

/** «60» -> 60; anything that is not a whole number from 1 to 100 -> null (the form says so, the server would answer 422). */
export function parsePassThreshold(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 && value <= 100 ? value : null;
}

/** The threshold of an exam as the screens show it; an answer of an older server (no field) is the old 60. */
export function examPassThreshold(exam: { pass_threshold_pct?: number | null } | null | undefined): number {
  const value = exam?.pass_threshold_pct;
  return typeof value === "number" && value >= 1 && value <= 100 ? value : DEFAULT_PASS_THRESHOLD_PCT;
}

/** Label of the report/analytics tile: «Сдали порог (≥70%)». */
export function passThresholdTileLabel(threshold: number): string {
  return `Сдали порог (≥${threshold}%)`;
}

/** May the «Изменить порог» action be offered? Only for online exams (a printed one has no analytics) and until a work is submitted. */
export function canEditPassThreshold(exam: { delivery_mode?: string | null; status?: string | null; pass_threshold_locked?: boolean | null }): boolean {
  return exam.delivery_mode !== "print" && exam.status !== "archived" && !exam.pass_threshold_locked;
}
