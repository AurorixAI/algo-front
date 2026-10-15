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
