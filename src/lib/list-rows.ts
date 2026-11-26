import type { AuditEntryItem, SubstitutionItem, SubstitutionListRow, WaitingCancellationItem } from "./substitution-types";

/** The three kinds of a row of the list of «Замены» (LESSON-RULES): a request, a cancellation that waits, an entry of the journal. */
export function isWaitingRow(row: SubstitutionListRow): row is WaitingCancellationItem {
  return (row as { source?: string }).source === "unconfirmed";
}
export function isAuditRow(row: SubstitutionListRow): row is AuditEntryItem {
  return (row as { source?: string }).source === "audit";
}
export function isRequestRow(row: SubstitutionListRow): row is SubstitutionItem {
  return !isWaitingRow(row) && !isAuditRow(row);
}
