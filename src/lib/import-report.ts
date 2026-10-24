/**
 * O9 / F6 (LOGIC-B): the report of the Excel import - what was skipped and why, the counters, the blocking issues, the CSV of the report.
 * Pure: no React, no network.
 */
import { neutralizeFormula } from "./csv";
import { opsErrorCode } from "./ops-errors";
import type { ImportCountsB, ImportIssueB, ImportSkipped } from "./ops-b-types";

/** The reasons of a skipped row in the words of the spec; `{m}` places come from the server text («лимит 3, занято 3»). */
export const SKIP_REASONS: Record<string, string> = {
  GROUP_ARCHIVED: "Группа в архиве. Верните её из архива или выберите другую",
  STUDENT_ARCHIVED: "Ученик в архиве. Верните его из архива в карточке",
  HOMONYM_NO_PHONE: "В системе уже есть ученик с таким ФИО без телефона. Если это тёзка, добавьте вручную",
  DUPLICATE_IN_FILE: "Строка повторяется в файле",
  ALREADY_IN_GROUP: "Уже в этой группе",
};

/** «В группе нет мест: лимит 3, занято 3» from the server's «В группе «9-А» нет мест: лимит 3, занято 3». */
export function groupFullReason(message: string): string {
  const tail = /лимит\s+\d+,\s*занято\s+\d+/i.exec(message ?? "");
  return tail ? `В группе нет мест: ${tail[0]}` : "В группе нет мест";
}

/** «Ученик уже есть в системе и состоит в группе «X». Перевод выполните вручную — при переводе переносятся оплаты» */
export function inOtherGroupReason(skipped: Pick<ImportSkipped, "message">): string {
  const named = /группе\s+(«[^»]+»)/.exec(skipped.message ?? "");
  const where = named ? ` в группе ${named[1]}` : "";
  return `Ученик уже есть в системе и состоит${where || " в другой группе"}. Перевод выполните вручную — при переводе переносятся оплаты`;
}

/** The reason to show for a skipped row; the server's own text for a code this front does not know. */
export function skipReasonText(skipped: ImportSkipped): string {
  switch (skipped.code) {
    case "GROUP_FULL": return groupFullReason(skipped.message);
    case "IN_OTHER_GROUP": return inOtherGroupReason(skipped);
    default: return SKIP_REASONS[skipped.code] ?? skipped.message;
  }
}

/** «Уже в этой группе» is information, not a loss: such rows are counted apart from the real skips. */
export function isInformational(skipped: ImportSkipped): boolean {
  return skipped.code === "ALREADY_IN_GROUP";
}

export interface ImportReportView {
  /** «Будет добавлено: n» */
  willAdd: number;
  /** «Уже в группах: n» */
  alreadyIn: number;
  /** «Пропущено: n» - real skips, without the informational rows */
  skippedCount: number;
  skipped: ImportSkipped[];
  info: ImportSkipped[];
}

export function importReportView(counts: ImportCountsB | undefined, skipped: ImportSkipped[] | undefined): ImportReportView {
  const rows = skipped ?? [];
  const info = rows.filter(isInformational);
  const real = rows.filter((row) => !isInformational(row));
  return {
    willAdd: counts?.students_enrolled ?? 0,
    alreadyIn: counts?.students_unchanged ?? info.length,
    skippedCount: counts?.students_skipped ?? real.length,
    skipped: real,
    info,
  };
}

export function importDoneText(added: number, skipped: number): string {
  return `Готово: добавлено ${added}, пропущено ${skipped}`;
}

export const IMPORT_BUSY_TEXT = "Импорт уже выполняется. Подождите минуту";

export function importErrorText(error: unknown, fallback: string): string {
  if (opsErrorCode(error) === "IMPORT_IN_PROGRESS") return IMPORT_BUSY_TEXT;
  return (error instanceof Error && error.message.trim()) || fallback;
}

/** A blocking issue of the teacher check, worded for the screen (the server texts already follow the spec; the code picks the lead). */
export function issueText(issue: ImportIssueB): string {
  const where = `${issue.sheet}, строка ${issue.row}${issue.field ? ` · ${issue.field}` : ""}`;
  return `${where}: ${issue.message}`;
}

function csvCell(value: unknown): string {
  // the student / group names come from the teacher's uploaded sheet: a «=HYPERLINK(...)» there must not run in Excel
  const text = value === null || value === undefined ? "" : typeof value === "number" ? String(value) : neutralizeFormula(String(value));
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The report as CSV (semicolon-separated, with a BOM: Excel opens it in the right encoding).
 * Columns: лист, строка, ученик, группа, причина.  The informational rows are included with their text.
 */
export function importReportCsv(skipped: ImportSkipped[] | undefined): string {
  const head = ["Лист", "Строка", "Ученик", "Группа", "Причина"];
  const lines = [head, ...(skipped ?? []).map((row) => [row.sheet, row.row, row.student ?? "", row.group ?? "", skipReasonText(row)])];
  return `﻿${lines.map((line) => line.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

export const IMPORT_REPORT_FILENAME = "import-report.csv";
export const IMPORT_REPORT_BUTTON = "Скачать отчёт (CSV)";
