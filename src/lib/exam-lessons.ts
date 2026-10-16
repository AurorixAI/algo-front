/**
 * Which scheduled lessons an exam may be bound to (the «Назначить занятие» dialog).
 *
 * Students enter a bound exam only while the teacher's attendance for that exact lesson is «in_progress» (the
 * exam service checks it on every public lobby call).  A lesson that is already completed or cancelled, or whose
 * planned end has passed without it ever being started (a missed lesson cannot be started any more), can therefore
 * never open the exam - offering it is a trap.  A lesson that is in progress stays: the teacher may assign during it,
 * even when it runs past the planned end.
 * Pure (no React, no network): the caller feeds the business date / minutes, so the list re-filters on a clock tick.
 */
import { clockMinutes } from "./lesson-actions";

export interface BindableLesson {
  id: string;
  occurrenceDate: string;
  endTime?: string | null;
}

export interface BindableContext {
  /** Today in business time (Asia/Tashkent), YYYY-MM-DD. */
  businessDate: string;
  /** Business-time minutes since midnight. */
  nowMinutes: number;
  /** `${occurrenceDate}_${lessonId}` -> attendance status of that occurrence (absent = never started). */
  statuses: Record<string, string | null | undefined>;
}

/** The key the attendance journal and the dialog use for one concrete occurrence. */
export function occurrenceKey(lesson: Pick<BindableLesson, "id" | "occurrenceDate">): string {
  return `${lesson.occurrenceDate}_${lesson.id}`;
}

export function isLessonBindable(lesson: BindableLesson, context: BindableContext): boolean {
  const status = context.statuses[occurrenceKey(lesson)];
  if (status === "completed" || status === "cancelled") return false;
  if (lesson.occurrenceDate < context.businessDate) return false;
  if (lesson.occurrenceDate > context.businessDate) return true;
  if (status === "in_progress") return true;
  if (!lesson.endTime) return true;
  return context.nowMinutes < clockMinutes(lesson.endTime);
}

export function bindableLessons<T extends BindableLesson>(lessons: T[], context: BindableContext): T[] {
  return lessons.filter((lesson) => isLessonBindable(lesson, context));
}

/** The picked lesson (`selectedKey`, "" = none) is no longer among the offered ones: it was completed, cancelled or is over. */
export function selectionLost(selectedKey: string, offered: Array<Pick<BindableLesson, "id" | "occurrenceDate">>): boolean {
  return Boolean(selectedKey) && !offered.some((lesson) => occurrenceKey(lesson) === selectedKey);
}
