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

/** Chip text: what is actually wrong with the lesson, in the words of an administrator. */
export function openLessonStatus(action: Pick<OpenAttendanceAction, "actionType" | "markedCount" | "rosterCount">): string {
  return action.actionType === "missed"
    ? "Посещаемость не отмечена"
    : `Урок не завершён · отмечено ${action.markedCount} из ${action.rosterCount}`;
}

/** Tooltip of the chip. */
export function openLessonStatusHint(action: Pick<OpenAttendanceAction, "actionType">): string {
  return action.actionType === "missed"
    ? "Урок был по расписанию, но журнал не открывали"
    : "Журнал открыт, урок не завершён";
}

export const NO_TEACHER_LABEL = "Без преподавателя";

export interface OpenLessonGroup {
  /** Stable React key; `none` for lessons without a teacher. */
  key: string;
  teacherName: string;
  items: OpenAttendanceAction[];
}

/**
 * Lessons grouped by teacher: the most loaded teacher first, then by name; «Без преподавателя»
 * is always last. Rows inside a group keep the "newest first" order.
 */
export function groupOpenLessonsByTeacher(items: OpenAttendanceAction[]): OpenLessonGroup[] {
  const groups = new Map<string, OpenLessonGroup>();
  for (const item of sortOpenLessons(items)) {
    const name = (item.teacherName ?? "").trim();
    const key = item.teacherId ? `id:${item.teacherId}` : name ? `name:${name}` : "none";
    let group = groups.get(key);
    if (!group) {
      group = { key, teacherName: name || (item.teacherId ? "Преподаватель" : NO_TEACHER_LABEL), items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()].sort((a, b) => {
    if ((a.key === "none") !== (b.key === "none")) return a.key === "none" ? 1 : -1;
    return b.items.length - a.items.length || a.teacherName.localeCompare(b.teacherName, "ru");
  });
}

/**
 * Whether the list must be re-read because the badge (the summary) and the list disagree.
 * `lastHandledCount` is the badge value we already refetched for: one refetch per change,
 * so a persistent mismatch can never turn into a request loop.
 */
export function shouldRefetchForBadge(
  loaded: boolean,
  badgeCount: number,
  listLength: number,
  lastHandledCount: number | null,
): boolean {
  return loaded && badgeCount !== listLength && badgeCount !== lastHandledCount;
}

export function openLessonTime(action: Pick<OpenAttendanceAction, "startTime" | "endTime">): string {
  return `${action.startTime}–${action.endTime}`;
}

/** Stable React key of one open lesson. */
export function openLessonKey(action: Pick<OpenAttendanceAction, "actionType" | "groupId" | "lessonDate" | "lessonId">): string {
  return `${action.actionType}:${action.groupId}:${action.lessonDate}:${action.lessonId}`;
}

/**
 * Journal of the lesson's month: the group page opens its attendance tab on that month and
 * highlights the lesson's column (`lesson` + `date`).
 */
export function journalHref(
  groupsBasePath: string,
  action: Pick<OpenAttendanceAction, "groupId" | "lessonDate"> & { lessonId?: string },
): string {
  const month = /^\d{4}-\d{2}/.exec(action.lessonDate)?.[0];
  const params = ["tab=attendance"];
  if (month) params.push(`month=${month}`);
  const date = parseIsoDate(action.lessonDate);
  if (month && date && action.lessonId && LESSON_ID_PATTERN.test(action.lessonId)) {
    params.push(`lesson=${encodeURIComponent(action.lessonId)}`, `date=${date}`);
  }
  return `${groupsBasePath}/${action.groupId}?${params.join("&")}`;
}

const LESSON_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,80}$/;

/** `YYYY-MM-DD` that is a real calendar day (years 2000-2100), else null. */
function parseIsoDate(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 2000 || year > 2100) return null;
  const real = new Date(Date.UTC(year, month - 1, day));
  return real.getUTCFullYear() === year && real.getUTCMonth() === month - 1 && real.getUTCDate() === day
    ? `${match[1]}-${match[2]}-${match[3]}`
    : null;
}

/** `?lesson=<id>&date=YYYY-MM-DD` of the group page -> the lesson to highlight, or null when invalid. */
export function parseJournalHighlight(
  lessonId: string | null | undefined,
  date: string | null | undefined,
): { lessonId: string; date: string } | null {
  if (!lessonId || !LESSON_ID_PATTERN.test(lessonId)) return null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const valid = parseIsoDate(date);
  return valid ? { lessonId, date: valid } : null;
}

/** `?month=YYYY-MM` of the group page (years 2000-2100) -> year and month, or null when absent/invalid. */
export function parseJournalMonth(value: string | null | undefined): { year: number; month: number } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 2000 && year <= 2100 ? { year, month: Number(match[2]) } : null;
}
