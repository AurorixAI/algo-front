/**
 * Saving weekly lessons of one group for one or several weekdays (the teacher's form and the group page of the owner / administrator).
 * One request per weekday, in the order of the week; the answer says which days were added and which were refused and why.
 */
import { orgApi } from "./api";
import { opsErrorCode, opsErrorDetail, scheduleErrorText, teacherConflictLines, warningTexts } from "./ops-errors";
import type { TeacherBusyDetail } from "./ops-b-types";
import { roomForSave } from "./schedule-slots";
import { addIsoDays } from "./business-time";
import { LESSON_SUBJECT, firstOccurrenceOf, patchFor, snapshotFromOccurrence, type LessonColor, type LessonFormat, type WeeklyLesson } from "./lesson-slot-form";

export interface WeeklyDraft {
  startTime: string;
  endTime: string;
  format: LessonFormat;
  room: string;
  topic: string;
  color: LessonColor;
  /** «Действует с» (YYYY-MM-DD). */
  validFrom: string;
}

export interface WeeklyFailure {
  day: number;
  /** A few words after the day: «преподаватель занят». */
  reason: string;
  /** The full sentence of the refusal. */
  detail: string;
}

export interface WeeklyAddResult {
  added: number[];
  failed: WeeklyFailure[];
  /** Notes of the saved lessons (a busy room): shown, never blocking. */
  notices: string[];
}

/** A refusal of the schedule in calm words; a busy teacher is told by the clashes alone (the server's own sentence repeats the first one with an ISO date). */
export function refusalText(failure: unknown, fallback: string): string {
  if (opsErrorCode(failure) === "TEACHER_BUSY") {
    const lines = teacherConflictLines(opsErrorDetail<TeacherBusyDetail>(failure), 2);
    if (lines.length) return `У преподавателя в это время уже есть урок. ${lines.join("; ")}`;
  }
  return scheduleErrorText(failure, fallback);
}

/** The refusal in a few words, to follow a weekday: «Пт — преподаватель занят». */
export function shortRefusal(failure: unknown): string {
  switch (opsErrorCode(failure)) {
    case "TEACHER_BUSY": return "преподаватель занят";
    case "DUPLICATE_SLOT": return "такой урок уже есть";
    case "VALID_FROM_PAST": return "дата начала в прошлом";
    case "GROUP_ARCHIVED": return "группа в архиве";
    default: return scheduleErrorText(failure, "не удалось добавить").replace(/\.$/, "");
  }
}

const DAY_SHORT = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/**
 * The warnings of a save of several weekdays, one request each: the same warning of different days is ONE line with the days («Кабинет «12» в это время занят группой «X»: пн, ср, пт»);
 * a save of one day keeps the server's sentence as it is.
 */
export function mergeNotices(items: ReadonlyArray<{ note: string; day: number }>, daysInSave: number): string[] {
  const byNote = new Map<string, number[]>();
  for (const { note, day } of items) {
    const days = byNote.get(note) ?? [];
    if (!days.includes(day)) days.push(day);
    byNote.set(note, days);
  }
  return [...byNote.entries()].map(([note, days]) => (daysInSave <= 1 ? note : `${note}: ${days.sort((a, b) => a - b).map((d) => DAY_SHORT[d] ?? String(d)).join(", ")}`));
}

export async function createWeeklyLessons(groupId: string, days: readonly number[], draft: WeeklyDraft): Promise<WeeklyAddResult> {
  const result: WeeklyAddResult = { added: [], failed: [], notices: [] };
  const found: Array<{ note: string; day: number }> = [];
  for (const day of [...days].sort((a, b) => a - b)) {
    try {
      const created = await orgApi.createLesson({
        groupId,
        dayOfWeek: day,
        startTime: draft.startTime,
        endTime: draft.endTime,
        subject: LESSON_SUBJECT,
        room: roomForSave(draft.room),
        format: draft.format,
        color: draft.color,
        topic: draft.topic.trim() || undefined,
        validFrom: draft.validFrom,
      });
      if (!created?.id) throw new Error("Сервер не вернул идентификатор урока");
      result.added.push(day);
      for (const note of warningTexts(created)) found.push({ note, day });
    } catch (failure) {
      result.failed.push({ day, reason: shortRefusal(failure), detail: refusalText(failure, "Не удалось добавить урок. Расписание не изменено — повторите попытку.") });
    }
  }
  result.notices = mergeNotices(found, days.length);
  return result;
}

/** One lesson on one calendar date (`POST /org/schedule/occurrences`); throws the server's refusal, returns the notes of the save. */
export async function createOneOff(groupId: string, date: string, draft: Omit<WeeklyDraft, "validFrom">): Promise<string[]> {
  const created = await orgApi.createOneOffLesson({
    groupId,
    lessonDate: date,
    startTime: draft.startTime,
    endTime: draft.endTime,
    room: roomForSave(draft.room),
    format: draft.format,
    color: draft.color,
    topic: draft.topic.trim() || undefined,
  });
  if (!created?.id) throw new Error("Сервер не вернул идентификатор урока");
  return warningTexts(created);
}

/** «The weekly lesson as it stands on this date» for the change / stop dialogs (a revision already scheduled counts); null when no lesson of it falls in the next 7 days. */
export function weeklyResolver(groupId: string, lessonId: string): (date: string) => Promise<WeeklyLesson | null> {
  return async (date) => {
    const occurrences = await orgApi.getScheduleOccurrences({ dateFrom: date, dateTo: addIsoDays(date, 6) });
    const first = firstOccurrenceOf(occurrences, groupId, lessonId);
    return first ? snapshotFromOccurrence(first) : null;
  };
}

/** The server's refusal of a revision that changes nothing (`revise_recurring_lesson`). */
const NO_DIFFERENCE = /хотя бы одно изменение/;

export interface WeeklyRevisionResult {
  /** Weekdays (of the lessons) that were changed. */
  done: number[];
  failed: Array<WeeklyFailure & { id: string }>;
  /** The merged warning lines (see `mergeNotices`) and the raw ones (a caller that saved one more lesson of its own merges them all). */
  notices: string[];
  found: Array<{ note: string; day: number }>;
}

/**
 * The same change applied to several weekly lessons from one date, one request each, in the order of the week; a refusal of one does not
 * stop the others and is named with its weekday.  `shared` never carries a day (the callers pass `sharedRevisionPatch`); a lesson that
 * already is so counts as done without a request, and so does the server's «no difference» refusal (a revision of it already scheduled).
 */
export async function reviseWeeklyLessons(
  targets: ReadonlyArray<Pick<WeeklyLesson, "id" | "dayOfWeek" | "startTime" | "endTime" | "room" | "format" | "topic">>,
  effectiveFrom: string,
  reason: string,
  shared: Parameters<typeof patchFor>[1],
): Promise<WeeklyRevisionResult> {
  const found: Array<{ note: string; day: number }> = [];
  const result: WeeklyRevisionResult = { done: [], failed: [], notices: [], found };
  for (const target of [...targets].sort((a, b) => a.dayOfWeek - b.dayOfWeek)) {
    const patch = patchFor(target, shared);
    if (Object.keys(patch).length === 0) { result.done.push(target.dayOfWeek); continue; }
    try {
      const revised = await orgApi.reviseRecurringLesson(target.id, { ...patch, effectiveFrom, reason });
      result.done.push(target.dayOfWeek);
      for (const note of warningTexts(revised)) found.push({ note, day: target.dayOfWeek });
    } catch (failure) {
      if (failure instanceof Error && NO_DIFFERENCE.test(failure.message)) { result.done.push(target.dayOfWeek); continue; }
      result.failed.push({
        id: target.id,
        day: target.dayOfWeek,
        reason: shortRefusal(failure),
        detail: refusalText(failure, "Не удалось изменить постоянное расписание. Данные не изменены — повторите попытку."),
      });
    }
  }
  result.notices = mergeNotices(found, targets.length);
  return result;
}
