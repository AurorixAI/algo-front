/**
 * Saving weekly lessons of one group for one or several weekdays (the teacher's form and the group page of the owner / administrator).
 * One request per weekday, in the order of the week; the answer says which days were added and which were refused and why.
 */
import { orgApi } from "./api";
import { opsErrorCode, opsErrorDetail, scheduleErrorText, teacherConflictLines, warningTexts } from "./ops-errors";
import type { TeacherBusyDetail } from "./ops-b-types";
import { roomForSave } from "./schedule-slots";
import { LESSON_SUBJECT, type LessonColor, type LessonFormat } from "./lesson-slot-form";

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

export async function createWeeklyLessons(groupId: string, days: readonly number[], draft: WeeklyDraft): Promise<WeeklyAddResult> {
  const result: WeeklyAddResult = { added: [], failed: [], notices: [] };
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
      for (const note of warningTexts(created)) if (!result.notices.includes(note)) result.notices.push(note);
    } catch (failure) {
      result.failed.push({ day, reason: shortRefusal(failure), detail: refusalText(failure, "Не удалось добавить урок. Расписание не изменено — повторите попытку.") });
    }
  }
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
