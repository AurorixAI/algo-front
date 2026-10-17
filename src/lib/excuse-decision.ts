/**
 * Texts of the confirmation dialog of «Подтвердить» / «Отклонить» an excused absence (#103).
 * The consequence is the rule of auth-service (`payroll_engine`, `payment_status.lesson_counts`), true for every case:
 *  - a CONFIRMED excuse: the lesson is not counted for the teacher (the payroll cell is 0); in the lessons-PACKAGE
 *    mode it also consumes nothing of the student's package, which shifts the later coverage;
 *  - a pending or rejected one is an ordinary lesson: counted for the teacher (when a payment covers it) and, in the
 *    package mode, spent from the package;
 *  - the calendar mode has no payment effect, so it adds no line; an unknown mode adds none either (never guess).
 * The text depends on the CURRENT status: changing a decision says so.  Pure: no React and no network.
 */

import { reasonMeta, reasonMetaOf } from "./excuse-row";

export type ExcuseDecision = "confirmed" | "rejected";
/** Where the excuse stands now (what the server has). */
export type ExcuseStatus = "pending" | "confirmed" | "rejected";
/** How the centre bills: `lessons` = packages, `calendar` = periods, null = this user cannot see it (not guessed). */
export type ExcuseBillingMode = "calendar" | "lessons" | null;

/**
 * What the confirmation dialog shows about one excuse, whichever screen it comes from (the «Пропуски» list or
 * the cell of the group journal): who, which lesson, why.
 */
export interface ExcuseDecisionSubject {
  id: string;
  studentName: string;
  /** The decision the excuse has now: the consequence of a new one depends on it. */
  status: ExcuseStatus;
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
  status: ExcuseStatus;
  lesson_date: string;
  group: { name: string };
  student: { full_name: string };
  reason: string;
  reason_by?: { name: string } | null;
  reason_at?: string | null;
}): ExcuseDecisionSubject {
  return {
    id: item.id,
    status: item.status,
    studentName: item.student.full_name,
    lessonDate: item.lesson_date,
    groupName: item.group.name,
    reason: item.reason,
    reasonMeta: reasonMeta(item),
  };
}

/** Subject of a cell of the group journal (`AttendanceExcuseInfo` + the student, the lesson date and the group). */
export function subjectOfJournalCell(args: {
  excuse: { id: string; status: ExcuseStatus; reason: string; reason_by_name: string | null; reason_at: string | null };
  studentName: string;
  lessonDate: string;
  groupName?: string | null;
}): ExcuseDecisionSubject {
  return {
    id: args.excuse.id,
    status: args.excuse.status,
    studentName: args.studentName,
    lessonDate: args.lessonDate,
    groupName: args.groupName ?? "",
    reason: args.excuse.reason,
    reasonMeta: reasonMetaOf(args.excuse.reason_by_name, args.excuse.reason_at),
  };
}

/**
 * What the decision changes, in plain words, for an excuse that stands at `current` (sentences, in the order they are shown).
 * `mode` null / `calendar`: the payroll sentence only.  `lessons`: plus what happens to the student's package.
 */
export function excuseConsequenceLines(
  decision: ExcuseDecision,
  current: ExcuseStatus = "pending",
  mode: ExcuseBillingMode = null,
): string[] {
  const packages = mode === "lessons";
  if (decision === "confirmed") {
    if (current === "rejected") {
      return [
        "Решение изменится: урок не будет засчитан преподавателю в зарплату.",
        ...(packages ? ["Урок вернётся в пакет ученика."] : []),
      ];
    }
    return [
      "Урок не будет засчитан преподавателю в зарплату.",
      ...(packages ? ["Урок не спишется из пакета ученика."] : []),
    ];
  }
  if (current === "confirmed") {
    return [
      packages
        ? "Решение изменится: урок снова будет засчитан преподавателю как обычный урок и снова спишется из пакета ученика."
        : "Решение изменится: урок снова будет засчитан преподавателю как обычный урок.",
    ];
  }
  return [
    "Пропуск останется неуважительным: урок засчитывается преподавателю как обычный урок.",
    ...(packages ? ["Урок спишется из пакета ученика."] : []),
  ];
}

/** The lines for several excuses (a bulk action): those of each distinct current status, without repeats. */
export function excuseConsequenceLinesFor(
  decision: ExcuseDecision,
  statuses: readonly ExcuseStatus[],
  mode: ExcuseBillingMode = null,
): string[] {
  const distinct = Array.from(new Set(statuses.length ? statuses : (["pending"] as ExcuseStatus[])));
  const lines: string[] = [];
  for (const status of distinct) {
    for (const line of excuseConsequenceLines(decision, status, mode)) if (!lines.includes(line)) lines.push(line);
  }
  return lines;
}

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
  /** The sentences of «Что изменится», one per line of the dialog. */
  consequenceLines: string[];
  /** The same, as one text. */
  consequence: string;
  /** «Пропусков: 3» for a bulk action, null for one. */
  countLine: string | null;
}

/**
 * Copy of the dialog for `count` excuses (1 for a row, more for a bulk action).  `statuses` are the current decisions
 * of those excuses (default: waiting), `mode` the billing mode when it is known.
 */
export function excuseDecisionCopy(
  decision: ExcuseDecision,
  count = 1,
  context: { statuses?: readonly ExcuseStatus[]; mode?: ExcuseBillingMode } = {},
): ExcuseDecisionCopy {
  const many = count > 1;
  const verb = decision === "confirmed" ? "Подтвердить" : "Отклонить";
  const lines = excuseConsequenceLinesFor(decision, context.statuses ?? [], context.mode ?? null);
  return {
    title: many ? `${verb} ${count} ${excusesWord(count)}?` : `${verb} пропуск?`,
    confirmLabel: verb,
    cancelLabel: "Отмена",
    consequenceLines: lines,
    consequence: lines.join(" "),
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
