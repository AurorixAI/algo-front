/**
 * WAVE E (E-C R3, В1): a teacher who only SUBSTITUTES in a group has no page of that group (the server answers 403 to everybody but the group's
 * leader - by design), so his card in «Мои группы» leads to the lesson he covers: his schedule, opened on the week of that lesson.  Pure (no React).
 */
import { addIsoDays, daysBetween, formatIsoDateLabel, isoDateDayOfWeek } from "./business-time";
import { SUBSTITUTE_BADGE } from "./lesson-teacher";

export const TEACHER_SCHEDULE_PATH = "/teacher/schedule";

export function teacherScheduleHref(date?: string | null): string {
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${TEACHER_SCHEDULE_PATH}?date=${date}` : TEACHER_SCHEDULE_PATH;
}

/** `?date=YYYY-MM-DD` of the schedule page; anything else is no date. */
export function scheduleDateParam(search: string | null | undefined): string | null {
  const value = new URLSearchParams(search ?? "").get("date");
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && isoDateDayOfWeek(value) > 0 ? value : null;
}

/** How many weeks (Monday to Sunday) the date is from the week of `today`: 0 this week, 1 next, -1 the last. */
export function weekOffsetForDate(date: string, today: string): number {
  const monday = addIsoDays(today, -(isoDateDayOfWeek(today) - 1));
  return Math.floor(daysBetween(monday, date) / 7);
}

export interface SubstituteCardTarget {
  href: string;
  /** «Замена · 5 нояб.» (just «Замена» when no lesson of this group is known) */
  label: string;
}

/** The nearest lesson (today or later) the teacher is assigned to cover in this group; the card leads to it. */
export function substituteCardTarget(
  groupId: string,
  assigned: ReadonlyArray<{ groupId: string; lessonDate: string; startTime?: string }>,
  today: string,
): SubstituteCardTarget {
  const next = assigned
    .filter((lesson) => lesson.groupId === groupId && lesson.lessonDate >= today)
    .sort((a, b) => a.lessonDate.localeCompare(b.lessonDate) || (a.startTime ?? "").localeCompare(b.startTime ?? ""))[0];
  if (!next) return { href: TEACHER_SCHEDULE_PATH, label: SUBSTITUTE_BADGE };
  return { href: teacherScheduleHref(next.lessonDate), label: `${SUBSTITUTE_BADGE} · ${formatIsoDateLabel(next.lessonDate, { day: "numeric", month: "short" })}` };
}
