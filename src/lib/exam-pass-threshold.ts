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

/** The threshold the create form sends: what is typed, or the default when the field is unusable (the form blocks «Далее» before that). */
export function thresholdForPayload(text: string): number {
  return parsePassThreshold(text) ?? DEFAULT_PASS_THRESHOLD_PCT;
}

export type ResultBand = "excellent" | "good" | "satisfactory" | "needHelp";

/**
 * The bands of the results chart. «Passed» starts at THE EXAM'S threshold; the finer bands above it keep their own marks (85 and 70):
 * a band that the threshold swallows (threshold 90: «хорошо» and «удовлетворительно» are empty) is `null`.
 */
export function resultBounds(threshold: number): Record<ResultBand, { from: number; to: number } | null> {
  const excellentFrom = Math.max(85, threshold);
  const goodFrom = Math.max(70, threshold);
  return {
    excellent: { from: excellentFrom, to: 100 },
    good: goodFrom < excellentFrom ? { from: goodFrom, to: excellentFrom - 1 } : null,
    satisfactory: threshold < goodFrom ? { from: threshold, to: goodFrom - 1 } : null,
    needHelp: { from: 0, to: threshold - 1 },
  };
}

export function resultBand(percent: number, threshold: number): ResultBand {
  if (percent < threshold) return "needHelp";
  if (percent >= Math.max(85, threshold)) return "excellent";
  if (percent >= Math.max(70, threshold)) return "good";
  return "satisfactory";
}

/** «85–100%», «<60%», or «—» for a band that the threshold removed. */
export function resultBandLabel(band: ResultBand, threshold: number): string {
  const bounds = resultBounds(threshold)[band];
  if (!bounds) return "—";
  if (band === "needHelp") return `<${threshold}%`;
  return bounds.from === bounds.to ? `${bounds.from}%` : `${bounds.from}–${bounds.to}%`;
}

/** The colour of one student's result: red below the exam's threshold, green from 80, amber for the rest of the passed. */
export function resultTone(percent: number, threshold: number): "failed" | "passed" | "excellent" {
  if (percent < threshold) return "failed";
  return percent >= 80 ? "excellent" : "passed";
}
