/**
 * O5 / F6 (LOGIC-B): the teacher of a lesson (the group's teacher or a substitute set by an administrator).
 * Pure helpers: the labels on a lesson, the dialog «Преподаватель урока», who can be chosen.
 */
import { formatIsoDateLabel } from "./business-time";
import type { LessonTeacherCandidate, LessonTeacherCandidates, LessonTeacherInfo, LessonTeacherPut } from "./ops-b-types";

/** The key of one lesson occurrence in the maps of the journal (`versions`, `lessonTeachers`, `records`): «2026-10-26_lesson-ab12». */
export function lessonKeyOf(lessonDate: string, lessonId: string): string {
  return `${lessonDate}_${lessonId}`;
}

export const NO_LESSON_TEACHER_TEXT = "У урока нет преподавателя";
export const REPLACE_TEACHER_ACTION = "Заменить преподавателя";
export const ASSIGN_TEACHER_ACTION = "Назначить";
export const REASON_LABEL = "Причина замены";
export const RETURN_GROUP_TEACHER_ACTION = "Вернуть преподавателя группы";
export const SUBSTITUTE_BADGE = "Замена";

export function lessonTeacherDialogTitle(lessonDate: string, startTime: string, endTime: string): string {
  const day = formatIsoDateLabel(lessonDate, { day: "2-digit", month: "2-digit" });
  return `Преподаватель урока ${day}, ${startTime}–${endTime}`;
}

/** «Замена: Рахимов Т.» on the lesson of a substitute; null for the group's own teacher. */
export function substituteLabel(info: LessonTeacherInfo | null | undefined): string | null {
  if (!info?.isSubstitution) return null;
  const name = (info.teacherName ?? "").trim();
  return name ? `Замена: ${name}` : "Замена";
}

/** In the schedule of the teacher who was replaced: «Заменяет Рахимов Т.» (the one who teaches the lesson instead). */
export function replacedByLabel(info: LessonTeacherInfo | null | undefined, viewerId: string | null | undefined): string | null {
  if (!info?.isSubstitution || !viewerId || info.defaultTeacherId !== viewerId) return null;
  const name = (info.teacherName ?? "").trim();
  return name ? `Заменяет ${name}` : "Заменяет другой преподаватель";
}

/** A lesson without a teacher at all: the group has none and no substitute is set. */
export function lacksTeacher(info: LessonTeacherInfo | null | undefined): boolean {
  return Boolean(info) && !info?.teacherId;
}

export function candidateBusyText(candidate: LessonTeacherCandidate): string | null {
  if (!candidate.busy) return null;
  const busy = candidate.busyWith;
  return busy ? `Занят: ${busy.groupName}, ${busy.startTime}–${busy.endTime}` : "Занят";
}

export const REASON_MIN = 3;
export const REASON_MAX = 300;

export function reasonError(reason: string): string | null {
  const length = reason.trim().length;
  if (length < REASON_MIN) return `Укажите причину — не менее ${REASON_MIN} символов`;
  if (length > REASON_MAX) return `Причина — не более ${REASON_MAX} символов`;
  return null;
}

/** The candidate who teaches the lesson now (the dialog opens with them marked). */
export function currentCandidate(list: LessonTeacherCandidates | null | undefined): string | null {
  return list?.currentTeacherId ?? list?.defaultTeacherId ?? null;
}

/** Who can be chosen: not the current teacher (nothing to change) and not a busy one. */
export function isSelectable(candidate: LessonTeacherCandidate, current: string | null): boolean {
  return !candidate.busy && candidate.teacherId !== current;
}

/** True when the group's own teacher is replaced now: the button «Вернуть преподавателя группы» is on offer. */
export function canReturnToGroupTeacher(info: LessonTeacherInfo | null | undefined): boolean {
  return Boolean(info?.isSubstitution);
}

export function buildAssign(
  target: { lessonDate: string; lessonId: string },
  teacherId: string | null,
  reason: string,
  expectedTeacherId: string | null,
): LessonTeacherPut {
  return {
    lessonDate: target.lessonDate,
    lessonId: target.lessonId,
    teacherId,
    reason: reason.trim(),
    ...(expectedTeacherId ? { expectedTeacherId } : {}),
  };
}

/**
 * Whether the person may open «Заменить преподавателя»: owner and administrator only, on a lesson that is not
 * finished or cancelled (the server refuses a cancelled lesson with LESSON_CANCELLED).
 */
export function canReplaceTeacher(role: string | null | undefined, lessonStatus: string | null | undefined): boolean {
  if (role !== "owner" && role !== "admin") return false;
  return lessonStatus !== "cancelled";
}

/**
 * A teacher sees a lesson as «not mine» when its teacher is somebody else (the server answers 403 NOT_LESSON_TEACHER).
 * `viewerId` is the signed-in user; no info (an older server) means no verdict.
 */
export function lessonBelongsToOther(info: LessonTeacherInfo | null | undefined, viewerId: string | null | undefined): boolean {
  if (!info?.teacherId || !viewerId) return false;
  return info.teacherId !== viewerId;
}

export function notYourLessonText(info: LessonTeacherInfo | null | undefined): string {
  const name = (info?.teacherName ?? "").trim();
  return name ? `Этот урок ведёт ${name}.` : "Этот урок ведёт другой преподаватель.";
}
