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
    const text = `Добавлено учеников: ${result.added}`;
    if (result.warnings.length > 0) return { text, type: "warning", details: [...result.warnings, ...infos] };
    if (infos.length > 0) return { text, type: "success", details: infos };
    return { text, type: "success" };
  }
  const notes = [...result.skippedLines, ...result.warnings];
  if (result.added > 0) {
    return { text: `Добавлено: ${result.added}, не добавлено: ${result.skipped}`, type: "warning", details: [...notes, ...infos] };
  }
  return { text: "Ни одного ученика не добавлено", type: "error", details: notes };
}
