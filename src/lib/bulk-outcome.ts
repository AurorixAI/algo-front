/**
 * Money-2 Э4 (Т10): the outcome of a bulk enrolment / transfer PER STUDENT: «Записано 3 из 4» and, for every student the server refused, its own reason (`results[].reason`, the words of the server).
 * One refusal does not stop the rest (the server answers 200 with `results[]` in the order of the request).  An older answer without `results[]` is read from `skipped_details[]`.  Pure.
 */
export interface BulkResultRow { student_id: string; status: "added" | "skipped"; code?: string | null; reason?: string | null }
export interface BulkOutcomeRow { id: string; name: string; reason: string }
export interface BulkOutcome { added: number; total: number; skipped: BulkOutcomeRow[]; addedNames: string[] }

const REASON_FALLBACK = "не записан";

export function bulkOutcomeOf(answer: { added?: number; skipped?: number; results?: unknown; skipped_details?: unknown } | null | undefined, order: ReadonlyArray<string>, nameOf: (id: string) => string): BulkOutcome {
  const rows = Array.isArray(answer?.results) ? (answer!.results as Array<Partial<BulkResultRow> | null>).filter((row): row is Partial<BulkResultRow> => Boolean(row) && typeof row!.student_id === "string") : null;
  const skippedFrom = (list: Array<{ student_id?: unknown; reason?: unknown }>): BulkOutcomeRow[] => list.map((item) => ({ id: String(item.student_id ?? ""), name: nameOf(String(item.student_id ?? "")), reason: typeof item.reason === "string" && item.reason.trim() ? item.reason.trim() : REASON_FALLBACK }));
  if (rows) {
    const skipped = skippedFrom(rows.filter((row) => row.status === "skipped"));
    const addedNames = rows.filter((row) => row.status === "added").map((row) => nameOf(row.student_id as string));
    return { added: addedNames.length, total: rows.length, skipped, addedNames };
  }
  const skipped = skippedFrom(Array.isArray(answer?.skipped_details) ? (answer!.skipped_details as Array<{ student_id?: unknown; reason?: unknown }>) : []);
  const skippedIds = new Set(skipped.map((row) => row.id));
  const added = typeof answer?.added === "number" ? answer.added : Math.max(0, order.length - skipped.length);
  return { added, total: added + (typeof answer?.skipped === "number" ? answer.skipped : skipped.length), skipped, addedNames: order.filter((id) => !skippedIds.has(id)).slice(0, added).map(nameOf) };
}

/** «Записано 3 из 4» (a transfer says «Переведено»). */
export const bulkHeadline = (outcome: Pick<BulkOutcome, "added" | "total">, verb: "enrol" | "transfer" = "enrol"): string => `${verb === "transfer" ? "Переведено" : "Записано"} ${outcome.added} из ${outcome.total}`;
