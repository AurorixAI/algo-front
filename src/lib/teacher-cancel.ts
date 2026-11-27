/**
 * W1 F1: «Урока не было» of the teacher, ONE call for the schedule and the dashboard (the lesson panel of both).  A teacher does not cancel a lesson to come (the server answers
 * 403 TEACHER_CANNOT_CANCEL): a past lesson nobody started is closed through `reconcile/cancel`, a started lesson with an empty roster through the attendance save (the one road the
 * server still leaves him).  Returns the notes of the server (`warnings`) as lines to show.
 */
import { orgApi } from "./api";
import { warningTexts } from "./ops-errors";
import type { TeacherCancelOffer } from "./schedule-card-actions";

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
): Promise<TeacherCancelNotes> {
  if (route === "missed") {
    const out = await orgApi.cancelMissedGroupAttendance(target.groupId, { lessonDate: target.lessonDate, lessonId: target.lessonId, cancellationReason: reason });
    return notesOf(out);
  }
  const out = await orgApi.saveGroupAttendance(target.groupId, {
    lessonDate: target.lessonDate, lessonId: target.lessonId, topic: target.topic, status: "cancelled", records: {}, cancellationReason: reason, ...version,
  });
  return notesOf(out);
}

/** The lines the screen shows after the cancellation; `waiting` (the server says so): the cancellation of a past lesson waits for the owner, the first line is the server's sentence about it. */
export type TeacherCancelNotes = string[] & { waiting?: boolean };

export function notesOf(out: { warnings?: Array<{ code?: string; message?: string }> | null; waiting?: boolean; consequence?: string }): TeacherCancelNotes {
  const notes: TeacherCancelNotes = warningTexts(out);
  if (out.waiting === true) {
    if (out.consequence) notes.unshift(out.consequence);
    notes.waiting = true;
  }
  return notes;
}

/**
 * The toast after «Урока не было» of a past lesson said by an administrator or the owner (the journal, the list of open lessons): by `waiting` of the server's answer - «Отмена урока 23 ноября ждёт
 * подтверждения» with the server's sentence under it (an administrator without the money right reports, the owner decides) - or the plain «Урок … отмечен как не состоявшийся».
 */
export function missedCancelToast(dateLabel: string, notes: TeacherCancelNotes): { title: string; tone: "success" | "warning" } {
  return notes.waiting
    ? { title: `Отмена урока ${dateLabel} ждёт подтверждения`, tone: "warning" }
    : { title: `Урок ${dateLabel} отмечен как не состоявшийся`, tone: notes.length ? "warning" : "success" };
}

/** The title of the toast after the cancellation of a lesson: «Отмена ждёт подтверждения» for a past lesson (the owner decides it), «Урок отмечен как не состоявшийся» otherwise. */
export function cancelToastTitle(notes: TeacherCancelNotes): string {
  return notes.waiting ? "Отмена ждёт подтверждения" : "Урок отмечен как не состоявшийся";
}
