/**
 * Saving weekly lessons of one group for one or several weekdays (the teacher's form and the group page of the owner / administrator).
 * One request per weekday, in the order of the week; the answer says which days were added and which were refused and why.
 */
import { orgApi, type RecurringRevisionNotes } from "./api";
import { opsErrorCode, opsErrorDetail, scheduleErrorText, teacherConflictLines, warningTexts } from "./ops-errors";
import type { TeacherBusyDetail } from "./ops-b-types";
import { roomForSave } from "./schedule-slots";
import { addIsoDays } from "./business-time";
import { LESSON_SUBJECT, firstOccurrenceOf, sharedRevisionPatch, snapshotFromOccurrence, type LessonColor, type LessonFormat, type WeeklyLesson, type WeeklySlot } from "./lesson-slot-form";

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

/**
 * One request per weekly lesson (`slots`: its weekday, its own time and its own «Действует с»), in the order of the week.  What the days
 * share (format, room, topic, colour) comes once; the plan of the days (`pastDayPlan`, «Разное время по дням») decides the rest.
 */
export async function createWeeklyLessons(groupId: string, slots: readonly WeeklySlot[], draft: Omit<WeeklyDraft, "startTime" | "endTime" | "validFrom">): Promise<WeeklyAddResult> {
  const result: WeeklyAddResult = { added: [], failed: [], notices: [] };
  const found: Array<{ note: string; day: number }> = [];
  for (const { day, startTime, endTime, validFrom } of [...slots].sort((a, b) => a.day - b.day)) {
    try {
      const created = await orgApi.createLesson({
        groupId,
        dayOfWeek: day,
        startTime,
        endTime,
        subject: LESSON_SUBJECT,
        room: roomForSave(draft.room),
        format: draft.format,
        color: draft.color,
        topic: draft.topic.trim() || undefined,
        validFrom,
      });
      if (!created?.id) throw new Error("Сервер не вернул идентификатор урока");
      result.added.push(day);
      for (const note of warningTexts(created)) found.push({ note, day });
    } catch (failure) {
      result.failed.push({ day, reason: shortRefusal(failure), detail: refusalText(failure, "Не удалось добавить урок. Расписание не изменено — повторите попытку.") });
    }
  }
  result.notices = mergeNotices(found, slots.length);
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

/** The server's refusal of a revision that changes nothing (`revise_recurring_lesson`): 400 `NO_CHANGES` (an older server: the same sentence without a code). */
const NO_DIFFERENCE = /хотя бы одно изменение/;
export function isNoChanges(failure: unknown): boolean {
  return opsErrorCode(failure) === "NO_CHANGES" || (failure instanceof Error && NO_DIFFERENCE.test(failure.message));
}

// ── W1 F6 (S8): a revision already scheduled LATER takes the same change ────────────────────────────────────────────────────────

/** One later revision of the weekly lesson that the save also updated (`laterRevisions[]` of the answer). */
type LaterRevision = NonNullable<RecurringRevisionNotes["laterRevisions"]>[number];

const LATER_FIELD_NAME: Record<string, string> = { dayOfWeek: "день", startTime: "время", endTime: "время", room: "кабинет", format: "формат", topic: "тема", color: "цвет" };

function dayMonth(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : iso;
}

/** «Есть изменение с 12.11 — оно тоже обновлено (кабинет)»: said after the save, one line per later revision; nothing without any. */
export function laterRevisionNotes(result: { laterRevisions?: readonly LaterRevision[] | null } | null | undefined): string[] {
  return (result?.laterRevisions ?? []).map((later) => {
    const fields = Array.from(new Set((later.fields ?? []).map((field) => LATER_FIELD_NAME[field]).filter(Boolean)));
    return `Есть изменение с ${dayMonth(later.effectiveFrom)} — оно тоже обновлено${fields.length ? ` (${fields.join(", ")})` : ""}`;
  });
}

/** Said BEFORE the save, from the schedule: a change that is already planned from this date on will get the same new values. */
export function laterChangeNote(date: string): string {
  return `С ${dayMonth(date)} у этого урока уже есть своё изменение — оно тоже обновится`;
}

/**
 * The first date after the one in the schedule where an ordinary occurrence of the weekly lesson differs from `base` (its state on the date of the change):
 * that is where a revision planned later begins.  A moved copy or a one-off lesson is not the series.  Null when the schedule shows none.
 */
export function laterChangeDate(
  occurrences: ReadonlyArray<{ id: string; groupId: string; occurrenceDate: string; dayOfWeek: number; startTime: string; endTime: string; room?: string | null; format?: string | null; isRescheduled?: boolean; isOneOff?: boolean }>,
  groupId: string,
  lessonId: string,
  base: { dayOfWeek: number; startTime: string; endTime: string; room?: string | null; format?: string | null },
  after: string,
): string | null {
  const room = (value: string | null | undefined) => (value ?? "").trim();
  const own = occurrences
    .filter((item) => item.id === lessonId && item.groupId === groupId && !item.isRescheduled && !item.isOneOff && item.occurrenceDate > after)
    .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));
  const differs = own.find((item) => Number(item.dayOfWeek) !== Number(base.dayOfWeek) || item.startTime !== base.startTime || item.endTime !== base.endTime
    || room(item.room) !== room(base.room) || (item.format || "offline") !== (base.format || "offline"));
  return differs ? differs.occurrenceDate : null;
}

/** Reads the schedule ahead (12 weeks) for `laterChangeDate`; a failed read says nothing (the answer after the save names it anyway). */
export async function weeklyLaterChange(groupId: string, lessonId: string, from: string, base: WeeklyLesson): Promise<string | null> {
  try {
    const occurrences = await orgApi.getScheduleOccurrences({ dateFrom: addIsoDays(from, 7), dateTo: addIsoDays(from, 12 * 7) });
    return laterChangeDate(occurrences, groupId, lessonId, base, from);
  } catch {
    return null;
  }
}

export interface WeeklyRevisionResult {
  /** Weekdays (of the lessons) that were changed. */
  done: number[];
  failed: Array<WeeklyFailure & { id: string; exams?: ExamsToConfirm[] }>;
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
  shared: ReturnType<typeof sharedRevisionPatch>,
  /** W1 S8: the person confirmed that the exams of the lessons that move go back to drafts. */
  options: { releaseAffectedExams?: boolean } = {},
): Promise<WeeklyRevisionResult> {
  const found: Array<{ note: string; day: number }> = [];
  const result: WeeklyRevisionResult = { done: [], failed: [], notices: [], found };
  for (const target of [...targets].sort((a, b) => a.dayOfWeek - b.dayOfWeek)) {
    // W1 S14: the server alone decides «nothing to change» (it sees the state on that date AND the later revisions); no local filter here
    try {
      const revised = await orgApi.reviseRecurringLesson(target.id, { ...shared, effectiveFrom, reason, ...(options.releaseAffectedExams ? { releaseAffectedExams: true } : {}) });
      result.done.push(target.dayOfWeek);
      for (const note of [...warningTexts(revised), ...laterRevisionNotes(revised)]) found.push({ note, day: target.dayOfWeek });
    } catch (failure) {
      if (isNoChanges(failure)) { result.done.push(target.dayOfWeek); continue; }
      const needed = examsToConfirm(failure);
      result.failed.push({
        id: target.id,
        day: target.dayOfWeek,
        ...(needed ? { exams: needed } : {}),
        reason: shortRefusal(failure),
        detail: refusalText(failure, "Не удалось изменить постоянное расписание. Данные не изменены — повторите попытку."),
      });
    }
  }
  result.notices = mergeNotices(found, targets.length);
  return result;
}

/** What the stop of a weekly lesson closed (W1 S9), as short lines: nothing for a stop that touched nothing. */
export function endSeriesNotes(result: { closedRequests?: number; releasedSubstitutes?: number; removedCancellations?: number } | null | undefined): string[] {
  const lines: string[] = [];
  if ((result?.closedRequests ?? 0) > 0) lines.push(`Закрыто запросов на замену: ${result?.closedRequests}`);
  if ((result?.releasedSubstitutes ?? 0) > 0) lines.push(`Снято замен: ${result?.releasedSubstitutes}`);
  if ((result?.removedCancellations ?? 0) > 0) lines.push(`Снято отмен, поставленных заранее: ${result?.removedCancellations}`);
  return lines;
}

/** The exams of the lessons that a change of day / time would move: the server asks for a tick (`EXAMS_NEED_CONFIRMATION`, W1 S8). */
export interface ExamsToConfirm { examId: string; title: string; lessonDate: string; status?: string | null }

export function examsToConfirm(failure: unknown): ExamsToConfirm[] | null {
  if (opsErrorCode(failure) !== "EXAMS_NEED_CONFIRMATION") return null;
  const exams = (opsErrorDetail(failure) as { exams?: ExamsToConfirm[] } | null)?.exams;
  return Array.isArray(exams) ? exams : [];
}

/** W1 F12 (S25): «Кабинет и тема будут убраны с 12 ноября»; null when nothing is emptied.  The lesson keeps them before that date. */
export function removalNote(changed: { room?: string | null; topic?: string | null }, effectiveFrom: string): string | null {
  const what = [changed.room === null ? "Кабинет" : "", changed.topic === null ? "тема" : ""].filter(Boolean);
  if (what.length === 0) return null;
  const text = what.length === 2 ? "Кабинет и тема будут убраны" : what[0] === "Кабинет" ? "Кабинет будет убран" : "Тема будет убрана";
  return `${text} с ${dayMonth(effectiveFrom)}`;
}
