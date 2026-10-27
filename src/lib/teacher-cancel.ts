/**
 * W1 F1: «Урока не было» of the teacher, ONE call for the schedule and the dashboard (the lesson panel of both).  A teacher does not cancel a lesson to come (the server answers
 * 403 TEACHER_CANNOT_CANCEL): a past lesson nobody started is closed through `reconcile/cancel`, a started lesson with an empty roster through the attendance save (the one road the
 * server still leaves him).  Returns the notes of the server (`warnings`) as lines to show.
 */
import { orgApi } from "./api";
import { warningTexts } from "./ops-errors";
import type { TeacherCancelOffer } from "./schedule-card-actions";

export const CANCEL_REASON_MIN = 3;
export const CANCEL_REASON_MAX = 500;

/**
 * ONE check of the reason of a cancellation («Урока не было» of the teacher, of the administrator, the panel and the modal): the sentence of what is missing, null when it is fine.
 * The buttons stay off while it says something (rule: a required field switches the button off, with a short line why).
 */
export function cancelReasonProblem(reason: string): string | null {
  const length = reason.trim().length;
  if (length < CANCEL_REASON_MIN) return `Укажите причину — не менее ${CANCEL_REASON_MIN} символов`;
  if (length > CANCEL_REASON_MAX) return `Причина — не более ${CANCEL_REASON_MAX} символов`;
  return null;
}

export interface TeacherCancelTarget {
  groupId: string;
  lessonId: string;
  lessonDate: string;
  topic?: string;
}

export async function sendTeacherCancel(
  route: TeacherCancelOffer["route"],
  target: TeacherCancelTarget,
  reason: string,
  version: { expectedVersion?: number } = {},
): Promise<string[]> {
  if (route === "missed") {
    const out = await orgApi.cancelMissedGroupAttendance(target.groupId, { lessonDate: target.lessonDate, lessonId: target.lessonId, cancellationReason: reason });
    return warningTexts(out);
  }
  const out = await orgApi.saveGroupAttendance(target.groupId, {
    lessonDate: target.lessonDate, lessonId: target.lessonId, topic: target.topic, status: "cancelled", records: {}, cancellationReason: reason, ...version,
  });
  return warningTexts(out);
}
