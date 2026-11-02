/**
 * WC-C (F-A13): the teacher's schedule reads the attendance journal of TODAY once per GROUP, not once per lesson
 * (a teacher with six lessons in three groups asked six identical requests).  The journal of a group for one day holds
 * the records and statuses of every lesson of that group, so the maps of the lessons are laid out from one answer.
 * Pure: node:test compares it with the former per-lesson reading.
 */
import type { LessonAttendanceStatus } from "@/lib/api";

export interface TodayLesson {
  id: string;
  groupId?: string | null;
}

/** The part of `GroupAttendance` the schedule uses. */
export interface TodayJournal {
  records?: Record<string, Record<string, unknown> | undefined> | null;
  statuses?: Record<string, LessonAttendanceStatus | undefined> | null;
}

/** The groups to ask, each once, in the order of their first lesson; a lesson without a group is not asked. */
export function groupIdsOfLessons(lessons: ReadonlyArray<TodayLesson | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const lesson of lessons) {
    if (lesson && lesson.groupId) seen.add(lesson.groupId);
  }
  return [...seen];
}

/** `attMap` (the lesson has marks), `compMap` (completed: true / in progress: false) and `statusMap` of today's lessons, from the journal of each group. */
export function attendanceMapsOfToday(
  lessons: ReadonlyArray<TodayLesson | null | undefined>,
  today: string,
  journalOfGroup: (groupId: string) => TodayJournal | null | undefined,
): { attMap: Record<string, boolean>; compMap: Record<string, boolean>; statusMap: Record<string, LessonAttendanceStatus> } {
  const attMap: Record<string, boolean> = {};
  const compMap: Record<string, boolean> = {};
  const statusMap: Record<string, LessonAttendanceStatus> = {};
  for (const lesson of lessons) {
    if (!lesson || !lesson.groupId) continue;
    const att = journalOfGroup(lesson.groupId);
    const lessonKey = `${today}_${lesson.id}`;
    if (att?.records) {
      const rec = att.records[lessonKey];
      if (rec && Object.keys(rec).length > 0) attMap[lesson.id] = true;
    }
    if (att?.statuses) {
      const st = att.statuses[lessonKey];
      if (st) statusMap[lesson.id] = st;
      if (st === "completed") compMap[lesson.id] = true;
      else if (st === "in_progress") compMap[lesson.id] = false;
    }
  }
  return { attMap, compMap, statusMap };
}
