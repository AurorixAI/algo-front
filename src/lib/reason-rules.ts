/**
 * The reason a person types before a lesson, a day or an absence is changed: ONE rule per KIND, the limits of the server (WAVE E, decision 4).
 * Four screens had their own copy of «3..500» / «3..300» - a reason of 400 characters passed one form and was refused by the next.
 * Pure: no React, no network.
 */

export type ReasonKind = "cancel" | "excuse" | "reject" | "teacherChange" | "dayOff";

export interface ReasonLimits {
  min: number;
  max: number;
}

/** Where each limit comes from (auth-service): the same numbers the server answers 422 with. */
export const REASON_LIMITS: Record<ReasonKind, ReasonLimits> = {
  /** A cancelled / moved / ended lesson, a cancellation of a substitution request: `cancellation_kind.py:27`, `schemas.py` (`min_length=3, max_length=500`), `substitution_schemas.py` (cancel / reschedule 3..500). */
  cancel: { min: 3, max: 500 },
  /** The reason of an excused absence: `attendance_excuses.py` (`REASON_MIN`..`REASON_MAX`). */
  excuse: { min: 3, max: 300 },
  /** The refusal of a substitution request: `substitution_schemas.py` (reject 3..300). */
  reject: { min: 3, max: 300 },
  /** The teacher of one lesson is changed: `ops_schemas.py` `LessonTeacherPut` (`min_length=3, max_length=300`). */
  teacherChange: { min: 3, max: 300 },
  /** A day off of the centre: `days_off.py:70` (up to 200; at least 3 after the blanks are collapsed). */
  dayOff: { min: 3, max: 200 },
};

/** The text as the server reads it: a day off is sent with its blanks collapsed, the others are trimmed. */
function reasonText(kind: ReasonKind, reason: string | null | undefined): string {
  const text = (reason ?? "").trim();
  return kind === "dayOff" ? text.replace(/\s+/g, " ") : text;
}

/** What is wrong with a reason of this kind (one sentence), or null when it is fine. */
export function reasonProblemFor(kind: ReasonKind, reason: string | null | undefined): string | null {
  const { min, max } = REASON_LIMITS[kind];
  const length = reasonText(kind, reason).length;
  if (length < min) return `Укажите причину — не менее ${min} символов`;
  if (length > max) return `Причина — не более ${max} символов`;
  return null;
}
