/**
 * "Уроки без отметки": pure helpers for the administrators' list (no React, no Date drift).
 * The server decides what is open; this file only orders, words and links it.
 */
import { MONTHS_SHORT_DATE } from "./ru-calendar";
import type { OpenActionsByMonth, OpenActionsMonth, OpenAttendanceAction } from "@/lib/api";
import { formatDateRu, formatIsoDateLabel } from "./business-time";
import { pluralRu } from "./plural";

const WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** YYYY-MM-DD -> «Пн, 13 окт». The calendar day is computed in UTC, so it never shifts with the viewer's zone. */
export function formatLessonDate(isoDate: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? "");
  if (!match) return "";
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS_SHORT[weekday]}, ${day} ${MONTHS_SHORT_DATE[month - 1]}`;
}

/** Newest lesson first; within a day the later lesson first, then by group name. */
export function sortOpenLessons(items: OpenAttendanceAction[]): OpenAttendanceAction[] {
  return [...items].sort((a, b) =>
    b.lessonDate.localeCompare(a.lessonDate)
    || b.startTime.localeCompare(a.startTime)
    || a.groupName.localeCompare(b.groupName, "ru"),
  );
}

/** The two words for an open lesson - the same in the administrators' list and the teacher's action centre. */
export const OPEN_LESSON_MISSED_LABEL = "Посещаемость не отмечена";
export const OPEN_LESSON_IN_PROGRESS_LABEL = "Урок не завершён";

/** Short chip: «Посещаемость не отмечена» (never started) or «Урок не завершён» (started, not closed). */
export function openLessonBadge(actionType: OpenAttendanceAction["actionType"]): string {
  return actionType === "missed" ? OPEN_LESSON_MISSED_LABEL : OPEN_LESSON_IN_PROGRESS_LABEL;
}

/** Chip text: what is actually wrong with the lesson, in the words of an administrator. */
export function openLessonStatus(action: Pick<OpenAttendanceAction, "actionType" | "markedCount" | "rosterCount">): string {
  return action.actionType === "missed"
    ? OPEN_LESSON_MISSED_LABEL
    : `${OPEN_LESSON_IN_PROGRESS_LABEL} · отмечено ${action.markedCount} из ${action.rosterCount}`;
}

/** IA audit F5: the main button of a row - «Отметить» a lesson nobody marked, «Открыть» one that is in progress. */
export function openLessonActionLabel(action: Pick<OpenAttendanceAction, "actionType">): string {
  return action.actionType === "in_progress" ? "Открыть" : "Отметить";
}

/** Tooltip of the chip. */
export function openLessonStatusHint(action: Pick<OpenAttendanceAction, "actionType">): string {
  return action.actionType === "missed"
    ? "Урок был по расписанию, но журнал не открывали"
    : "Журнал открыт, урок не завершён";
}


/** Has the person the main button of the row: a lesson that is going on is everybody's; a lesson nobody started is for the owner, the teacher of it and an administrator with the money right. */
export function canMarkOpenLesson(item: Pick<OpenAttendanceAction, "actionType">, role: string | null | undefined, moneyRight: boolean): boolean {
  return item.actionType === "in_progress" || role !== "admin" || moneyRight;
}

// ── by month (Money-1 R3 #2) ────────────────────────────────────────────────────────────────────────────────

/** «Сентябрь 2026 · 12 уроков»: the head of a month of the list. */
export function monthHeading(month: Pick<OpenActionsMonth, "title" | "count">): string {
  return `${month.title} · ${month.count} ${pluralRu(month.count, "урок", "урока", "уроков")}`;
}

/**
 * «не отмечено 8 · не завершено 4»: what the unresolved lessons of the month are (a part that is 0 is left out).  UX pack №17: when ALL of them are the same kind the line only repeats the
 * head («2 урока» / «не отмечено 2»), so it is said only when the month has both kinds.
 */
export function monthCountsText(month: Pick<OpenActionsMonth, "missed" | "inProgress">): string {
  if (month.missed === 0 || month.inProgress === 0) return "";
  return [`не отмечено ${month.missed}`, `не завершено ${month.inProgress}`].join(" · ");
}

/** The status column says something only when the lessons differ (a lesson that is going on among the ones nobody marked); five equal «Посещаемость не отмечена» are noise (UX pack №17). */
export function showsStatusColumn(items: ReadonlyArray<Pick<OpenAttendanceAction, "actionType">>): boolean {
  return new Set(items.map((item) => item.actionType)).size > 1;
}

/** The plaque over the list for an administrator without the money right (UX pack №7): ONE for the page, not a line in every row. */
export const OPEN_LESSONS_NO_RIGHT_NOTICE = "Оформить прошедший урок — «Отметить» — может владелец или администратор с доступом к деньгам. Вам доступно «Урока не было» в меню строки.";

/** «Показаны уроки без отметки с 1 сентября 2026»: from which day the list is counted (the accounting start of the centre). */
export function sinceLine(since: string | null | undefined): string | null {
  const day = since ? formatIsoDateLabel(since, { day: "numeric", month: "long", year: "numeric" }).replace(/\s*г\.$/, "") : "";
  return day ? `Показаны уроки без отметки с ${day}` : null;
}

/** The answer without the lessons `drop` names: the counters of the month and the total follow, a month without lessons goes (the row leaves at once; the re-read confirms it). */
export function withoutOpenLessons(data: OpenActionsByMonth, drop: (item: OpenAttendanceAction) => boolean): OpenActionsByMonth {
  const months = data.months
    .map((month) => {
      const items = month.items.filter((item) => !drop(item));
      return { ...month, items, count: items.length, missed: items.filter((item) => item.actionType === "missed").length, inProgress: items.filter((item) => item.actionType === "in_progress").length };
    })
    .filter((month) => month.items.length > 0);
  return { ...data, months, total: months.reduce((sum, month) => sum + month.count, 0) };
}

/** Every lesson of the months in one list (the badge and the re-read rules count this list). */
export function openLessonsOf(data: OpenActionsByMonth | null | undefined): OpenAttendanceAction[] {
  return data ? data.months.flatMap((month) => month.items) : [];
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
  action: Pick<OpenAttendanceAction, "groupId" | "lessonDate"> & { lessonId?: string; teacherId?: string | null },
): string {
  const month = /^\d{4}-\d{2}/.exec(action.lessonDate)?.[0];
  const params = ["tab=attendance"];
  if (month) params.push(`month=${month}`);
  const date = parseIsoDate(action.lessonDate);
  if (month && date && action.lessonId && LESSON_ID_PATTERN.test(action.lessonId)) {
    params.push(`lesson=${encodeURIComponent(action.lessonId)}`, `date=${date}`);
    // R3 #25: «Кто провёл» of the window «Отметить посещаемость» starts with the teacher of this row (already the substitute, when the day has one)
    if (action.teacherId && LESSON_ID_PATTERN.test(action.teacherId)) params.push(`teacher=${encodeURIComponent(action.teacherId)}`);
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
