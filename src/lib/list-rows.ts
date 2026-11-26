import type { AuditEntryItem, ListRowSource, SubstitutionItem, SubstitutionListRow, WaitingCancellationItem } from "./substitution-types";

/** The three models of a row of the list of «Замены» (LESSON-RULES), told apart by the `source` of the server: `request`, `unconfirmed` (a cancellation that waits), `audit` (an entry of the journal).
 *  An answer without `source` (an older server) is a request. */
export function rowSource(row: SubstitutionListRow): ListRowSource {
  const source = (row as { source?: string }).source;
  return source === "unconfirmed" || source === "audit" ? source : "request";
}
export function isWaitingRow(row: SubstitutionListRow): row is WaitingCancellationItem {
  return rowSource(row) === "unconfirmed";
}
export function isAuditRow(row: SubstitutionListRow): row is AuditEntryItem {
  return rowSource(row) === "audit";
}
export function isRequestRow(row: SubstitutionListRow): row is SubstitutionItem {
  return rowSource(row) === "request";
}
