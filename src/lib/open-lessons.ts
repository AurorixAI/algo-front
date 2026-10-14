/**
 * "Незакрытые уроки": pure helpers for the administrators' list (no React, no Date drift).
 * The server decides what is open; this file only orders, words and links it.
 */
import type { OpenAttendanceAction } from "@/lib/api";

const WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** YYYY-MM-DD -> «Пн, 13 окт». The calendar day is computed in UTC, so it never shifts with the viewer's zone. */
export function formatLessonDate(isoDate: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? "");
  if (!match) return "";
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS_SHORT[weekday]}, ${day} ${MONTHS_SHORT[month - 1]}`;
}

/** Newest lesson first; within a day the later lesson first, then by group name. */
export function sortOpenLessons(items: OpenAttendanceAction[]): OpenAttendanceAction[] {
  return [...items].sort((a, b) =>
    b.lessonDate.localeCompare(a.lessonDate)
    || b.startTime.localeCompare(a.startTime)
    || a.groupName.localeCompare(b.groupName, "ru"),
  );
}

export function openLessonStatus(action: Pick<OpenAttendanceAction, "actionType" | "markedCount" | "rosterCount">): string {
  return action.actionType === "missed"
    ? "Не начат"
    : `Не завершён · отмечено ${action.markedCount} из ${action.rosterCount}`;
}

export function openLessonTime(action: Pick<OpenAttendanceAction, "startTime" | "endTime">): string {
  return `${action.startTime}–${action.endTime}`;
}

/** Stable React key of one open lesson. */
export function openLessonKey(action: Pick<OpenAttendanceAction, "actionType" | "groupId" | "lessonDate" | "lessonId">): string {
  return `${action.actionType}:${action.groupId}:${action.lessonDate}:${action.lessonId}`;
}

/** Journal of the lesson's month: the group page opens its attendance tab on that month. */
export function journalHref(groupsBasePath: string, action: Pick<OpenAttendanceAction, "groupId" | "lessonDate">): string {
  const month = /^\d{4}-\d{2}/.exec(action.lessonDate)?.[0];
  const query = month ? `?tab=attendance&month=${month}` : "?tab=attendance";
  return `${groupsBasePath}/${action.groupId}${query}`;
}

/** `?month=YYYY-MM` of the group page -> first day of that month, or null when absent/invalid. */
export function parseJournalMonth(value: string | null | undefined): { year: number; month: number } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? "");
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}
