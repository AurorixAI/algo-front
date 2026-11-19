/**
 * Summary toast of "add students to a group" (bulk drawer of the group pages).
 * Pure: no React, no imports, so node:test can load it.
 *
 * `warnings` are real hints (third group, class mismatch); `infos` are calm notes such as
 * "the payment moved to the new group" (N13 P2.1) - they never turn a success into a warning.
 */
export interface EnrolSummary {
  added: number;
  skipped: number;
  /** "Фамилия Имя — причина" for every student the server refused. */
  skippedLines: string[];
  warnings: string[];
  infos: string[];
}

export interface EnrolToast {
  text: string;
  type: "success" | "warning" | "error";
  details?: string[];
}

export function enrolToast(result: EnrolSummary): EnrolToast {
  const infos = result.infos ?? [];
  if (result.added > 0 && result.skipped === 0) {
    const text = `Зачислено учеников: ${result.added}`;
    if (result.warnings.length > 0) return { text, type: "warning", details: [...result.warnings, ...infos] };
    if (infos.length > 0) return { text, type: "success", details: infos };
    return { text, type: "success" };
  }
  const notes = [...result.skippedLines, ...result.warnings];
  if (result.added > 0) {
    return { text: `Зачислено: ${result.added}, не зачислено: ${result.skipped}`, type: "warning", details: [...notes, ...infos] };
  }
  return { text: "Ни одного ученика не зачислено", type: "error", details: notes };
}

/**
 * The message after ONE student is put into / moved to a group from his card (or from a group page): one headline and, only when there is
 * something to say, a second line - the words of the server about a leaving that was cancelled, and the groups he keeps attending.
 * «Зачислен как всегда» is the expected outcome and gets no extra line (LESSONS 148).
 */
export interface AssignDoneInput {
  studentName: string;
  groupName: string;
  /** a transfer: «переведён», otherwise «зачислен» */
  transfer: boolean;
  /** the sentence of the server when the leaving of the same day was cancelled (`leave_undo.text`, undone only) */
  undoText?: string | null;
  /** the groups the student keeps attending after the action (add mode) */
  stays?: readonly string[];
  /** calm notes and real hints of the server (`warnings` of the answer) */
  infos?: readonly string[];
  warnings?: readonly string[];
}

export function staysLine(stays: readonly string[]): string | null {
  if (stays.length === 0) return null;
  return stays.length === 1 ? `В «${stays[0]}» тоже остаётся` : "В прежних группах тоже остаётся";
}

export function assignDoneToast(input: AssignDoneInput): EnrolToast {
  const text = `${input.studentName} ${input.transfer ? "переведён" : "зачислен"} в «${input.groupName}»`;
  const stay = staysLine(input.stays ?? []);
  const lines = [
    ...(input.undoText ? [input.undoText] : []),
    ...(stay ? [stay] : []),
    ...(input.warnings ?? []),
    ...(input.infos ?? []),
  ];
  const type = (input.warnings ?? []).length > 0 ? "warning" : "success";
  return lines.length > 0 ? { text, type, details: lines } : { text, type };
}
