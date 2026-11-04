/**
 * Money-1 A6 (П9, Д4): the journal tells the WHOLE fate of a held lesson (LESSONS 11): every correction and return with «было → стало» per student, who and why, and that
 * the lesson was formalised afterwards («Оформить проведённый урок»), also by whom it was taught when that is not the planned teacher.  The data is the server's
 * (`corrections[key]` with `changes` and `history`, `backdated[key]`); this file only words it.  Pure: no React, no network.
 */
import { formatUtcNaiveAsBusinessDateTime } from "./business-time";
import { MARK_CELL_LABEL, type MarkValue } from "./attendance-marks";
import type { AttendanceBackdatedInfo, AttendanceCorrectionInfo, AttendanceHistoryEvent, AttendanceMarkChange } from "./api";

export const NO_MARK_TEXT = "нет отметки";
export const BACKDATED_LABEL = "Оформлен задним числом";
export const CORRECTED_LABEL = "Исправлено";
export const RETURNED_LABEL = "Возвращён";

/** «Не был» / «Был» / «нет отметки» - the words of the cells. */
export function markWord(mark: string | null | undefined): string {
  return mark && mark in MARK_CELL_LABEL ? MARK_CELL_LABEL[mark as MarkValue] : NO_MARK_TEXT;
}

/** «Иванов Иван: Не был → Был». */
export function changeLine(change: AttendanceMarkChange, nameOf: (studentId: string) => string): string {
  return `${nameOf(change.studentId)}: ${markWord(change.from)} → ${markWord(change.to)}`;
}

/** «Исправлено: Петров П., 05.11.2026 10:30» / «Возвращён в «не проведён»: …». */
function eventHead(kind: AttendanceHistoryEvent["kind"], by: string | null, at: string | null): string {
  const label = kind === "returned" ? `${RETURNED_LABEL} в «не проведён»` : CORRECTED_LABEL;
  return `${label}: ${[by, formatUtcNaiveAsBusinessDateTime(at)].filter(Boolean).join(", ")}`;
}

function eventLines(event: { kind: AttendanceHistoryEvent["kind"]; by_name: string | null; at: string | null; reason: string | null; changes?: AttendanceMarkChange[] }, nameOf: (studentId: string) => string): string[] {
  return [
    eventHead(event.kind, event.by_name, event.at),
    ...(event.reason ? [`Причина: ${event.reason}`] : []),
    ...(event.changes ?? []).map((change) => changeLine(change, nameOf)),
  ];
}

/**
 * The hint of «Исправлено» in the head of a column: the last correction first (who, when, why, «было → стало» per student), then the earlier corrections and returns,
 * newest first.  An older server sends no `changes`: the head and the reason only.
 */
export function correctionHintLines(correction: AttendanceCorrectionInfo, nameOf: (studentId: string) => string): string[] {
  const lines = eventLines({ kind: correction.kind === "returned" ? "returned" : "corrected", by_name: correction.by_name, at: correction.at, reason: correction.reason, changes: correction.changes }, nameOf);
  for (const event of correction.history ?? []) lines.push("", ...eventLines(event, nameOf));
  return lines;
}

/** R3 #25: the chip in the head of the column - «Урок возвращали» when the lesson was returned to «не проведён» (and held again) without a correction of the marks, else «Исправлено». */
export const RETURNED_CHIP_LABEL = "Урок возвращали";
export function correctionChipLabel(correction: Pick<AttendanceCorrectionInfo, "kind">): string {
  return correction.kind === "returned" ? RETURNED_CHIP_LABEL : CORRECTED_LABEL;
}

/** «Оформлен задним числом: Иванов И., 05.11.2026 10:00» + «Провёл: Петров П.» when somebody other than the planned teacher taught it. */
export function backdatedHintLines(info: AttendanceBackdatedInfo): string[] {
  return [
    `${BACKDATED_LABEL}: ${[info.by_name, formatUtcNaiveAsBusinessDateTime(info.at)].filter(Boolean).join(", ")}`,
    ...(info.taught_by_name ? [`Провёл: ${info.taught_by_name}`] : []),
  ];
}
