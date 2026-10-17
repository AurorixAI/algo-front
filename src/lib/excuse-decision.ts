/**
 * Texts of the confirmation dialog of «Подтвердить» / «Отклонить» an excused absence (#103).
 * The consequence is the payroll rule of auth-service (`payroll_engine`): a CONFIRMED excuse means the lesson
 * is not counted for the teacher (the cell is 0); a pending or rejected one stays an unexcused absence and
 * the lesson is counted.  Pure: no React and no network, so node:test can load this file.
 */

import { reasonMeta, reasonMetaOf } from "./excuse-row";

export type ExcuseDecision = "confirmed" | "rejected";

/**
 * What the confirmation dialog shows about one excuse, whichever screen it comes from (the «Пропуски» list or
 * the cell of the group journal): who, which lesson, why.
 */
export interface ExcuseDecisionSubject {
  id: string;
  studentName: string;
  /** YYYY-MM-DD */
  lessonDate: string;
  /** Empty when the screen does not know it (the date alone is shown). */
  groupName: string;
  reason: string;
  /** «Дилноза Каримова · 09.10.2026 16:35» or "". */
  reasonMeta: string;
}

/** Subject of a row of the «Пропуски» list. */
export function subjectOfItem(item: {
  id: string;
  lesson_date: string;
  group: { name: string };
  student: { full_name: string };
  reason: string;
  reason_by?: { name: string } | null;
  reason_at?: string | null;
}): ExcuseDecisionSubject {
  return {
    id: item.id,
    studentName: item.student.full_name,
    lessonDate: item.lesson_date,
    groupName: item.group.name,
    reason: item.reason,
    reasonMeta: reasonMeta(item),
  };
}

/** Subject of a cell of the group journal (`AttendanceExcuseInfo` + the student, the lesson date and the group). */
export function subjectOfJournalCell(args: {
  excuse: { id: string; reason: string; reason_by_name: string | null; reason_at: string | null };
  studentName: string;
  lessonDate: string;
  groupName?: string | null;
}): ExcuseDecisionSubject {
  return {
    id: args.excuse.id,
    studentName: args.studentName,
    lessonDate: args.lessonDate,
    groupName: args.groupName ?? "",
    reason: args.excuse.reason,
    reasonMeta: reasonMetaOf(args.excuse.reason_by_name, args.excuse.reason_at),
  };
}

/** What a decision changes, in plain words (shown in the dialog before the request is sent). */
export const EXCUSE_CONSEQUENCE: Record<ExcuseDecision, string> = {
  confirmed: "Урок не будет засчитан преподавателю в зарплату (уважительная причина).",
  rejected: "Пропуск останется неуважительным: урок засчитывается преподавателю.",
};

/** 1 пропуск, 2 пропуска, 5 пропусков. */
export function excusesWord(count: number): string {
  const n = Math.abs(Math.trunc(count));
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "пропусков";
  if (last === 1) return "пропуск";
  if (last >= 2 && last <= 4) return "пропуска";
  return "пропусков";
}

export interface ExcuseDecisionCopy {
  title: string;
  /** Primary button: «Подтвердить» / «Отклонить» (the count is in the title, not on the button). */
  confirmLabel: string;
  cancelLabel: string;
  consequence: string;
  /** «Пропусков: 3» for a bulk action, null for one. */
  countLine: string | null;
}

/** Copy of the dialog for `count` excuses (1 for a row, more for a bulk action). */
export function excuseDecisionCopy(decision: ExcuseDecision, count = 1): ExcuseDecisionCopy {
  const many = count > 1;
  const verb = decision === "confirmed" ? "Подтвердить" : "Отклонить";
  return {
    title: many ? `${verb} ${count} ${excusesWord(count)}?` : `${verb} пропуск?`,
    confirmLabel: verb,
    cancelLabel: "Отмена",
    consequence: EXCUSE_CONSEQUENCE[decision],
    countLine: many ? `Пропусков: ${count}` : null,
  };
}

/** The first `max` entries of a bulk action and how many more there are («и ещё 4»). */
export function previewTargets<T>(items: readonly T[], max = 5): { shown: T[]; more: number } {
  const shown = items.slice(0, Math.max(0, max));
  return { shown, more: items.length - shown.length };
}

/** How the note field of the dialog behaves: absent (plain confirm), optional (reject), required («с примечанием»). */
export type ExcuseNoteMode = "none" | "optional" | "required";

/** Can the dialog send the decision now?  A required note must not be empty; nothing is sent while busy. */
export function canSubmitExcuseDecision(noteMode: ExcuseNoteMode, note: string, busy: boolean): boolean {
  if (busy) return false;
  return noteMode !== "required" || note.trim().length > 0;
}

/** The note that goes to the server: only when the dialog has a note field and something was typed. */
export function excuseNoteToSend(noteMode: ExcuseNoteMode, note: string): string {
  return noteMode === "none" ? "" : note.trim();
}
