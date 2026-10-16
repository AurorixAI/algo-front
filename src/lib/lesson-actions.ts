/**
 * The teacher's "next action" entries (dashboard card and the action centre)
 * and the lesson panel they open. Pure helpers, so the card and the list
 * cannot branch differently and the panel wording follows the lesson's date.
 */

/** What opening an action must show: the reconciliation dialog or the lesson panel. */
export type LessonActionTarget<Lesson, Source> =
  | { kind: "reconcile"; source: Source }
  | { kind: "lesson"; lesson: Lesson };

/**
 * A missed lesson (never started, in the past) cannot be started: the server
 * allows a start on the lesson's day only. The teacher has to decide first
 * whether it took place, so it opens the reconciliation dialog; everything
 * else opens the ordinary lesson panel.
 */
export function lessonActionTarget<Lesson, Source>(action: {
  lesson: Lesson;
  actionType?: string;
  sourceAction?: Source;
}): LessonActionTarget<Lesson, Source> {
  if (action.actionType === "missed" && action.sourceAction) {
    return { kind: "reconcile", source: action.sourceAction };
  }
  return { kind: "lesson", lesson: action.lesson };
}

export type LessonDateRelation = "past" | "today" | "future";

/** ISO dates (YYYY-MM-DD) compare as strings. */
export function lessonDateRelation(lessonDate: string, businessDate: string): LessonDateRelation {
  if (lessonDate < businessDate) return "past";
  if (lessonDate > businessDate) return "future";
  return "today";
}

/**
 * A lesson can be started on its own day only. Returns the reason it cannot
 * be started now, or ``null`` when the date allows it.
 */
export function startBlockedReason(relation: LessonDateRelation): string | null {
  if (relation === "past") {
    return "Начать урок можно только в день его проведения. Если занятие состоялось, разберите его как пропущенный урок; если нет — отмените с причиной.";
  }
  if (relation === "future") {
    return "Урок ещё не наступил: начать его можно только в день проведения.";
  }
  return null;
}

/** Server text of a failed request, so a refusal is never swallowed. */
export function serverErrorMessage(error: unknown, fallback: string): string {
  const text = error instanceof Error ? error.message.trim() : "";
  return text || fallback;
}

/** «Завершить урок» opens this many minutes before the planned end (and stays open after it). */
export const FINISH_LEAD_MINUTES = 15;

/** «HH:MM» -> minutes since midnight; a missing or broken part counts as 0. */
export function clockMinutes(time: string | null | undefined): number {
  const [hours, minutes] = (time || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export interface FinishLessonInput {
  /** Attendance lifecycle of this very occurrence. */
  status: string | null | undefined;
  startTime?: string | null;
  endTime?: string | null;
  /** The occurrence's calendar day; a persisted lesson of an earlier day is already past its planned end. */
  occurrenceDate?: string | null;
  /** Today in business time (Asia/Tashkent). */
  businessDate: string;
  /** Business-time minutes since midnight - the clock tick the caller re-reads, never a value frozen at open. */
  nowMinutes: number;
  /** False when the lesson's weekday is not today's (the dashboard only knows the weekday of a recurring slot). */
  isTodayWeekday?: boolean;
}

/**
 * The rule behind the «Завершить урок» button: only a lesson in progress; an earlier day - always; today - from
 * the start and no earlier than FINISH_LEAD_MINUTES before the planned end; a later day - never.
 * Pure: the caller feeds the current time, so a panel that stays open re-evaluates it on every clock tick.
 */
export function canFinishLessonNow(input: FinishLessonInput): boolean {
  if (!input.endTime || input.status !== "in_progress") return false;
  if (input.occurrenceDate) {
    if (input.occurrenceDate > input.businessDate) return false;
    if (input.occurrenceDate < input.businessDate) return true;
  }
  if (input.isTodayWeekday === false) return false;
  return input.nowMinutes >= clockMinutes(input.startTime)
    && input.nowMinutes >= clockMinutes(input.endTime) - FINISH_LEAD_MINUTES;
}
