/**
 * Money-2 Э4 (Т10): the outcome of a bulk enrolment / transfer PER STUDENT: «Записано 3 из 4» and, for every student the server refused, its own reason (`results[].reason`, the words of the server).
 * One refusal does not stop the rest (the server answers 200 with `results[]` in the order of the request).  An older answer without `results[]` is read from `skipped_details[]`.  Pure.
 */
export interface BulkResultRow { student_id: string; status: "added" | "skipped"; code?: string | null; reason?: string | null }
export interface BulkOutcomeRow { id: string; name: string; reason: string; code?: string | null }
export interface BulkOutcome { added: number; total: number; skipped: BulkOutcomeRow[]; addedNames: string[] }

const REASON_FALLBACK = "не записан";

export function bulkOutcomeOf(answer: { added?: number; skipped?: number; results?: unknown; skipped_details?: unknown } | null | undefined, order: ReadonlyArray<string>, nameOf: (id: string) => string): BulkOutcome {
  const rows = Array.isArray(answer?.results) ? (answer!.results as Array<Partial<BulkResultRow> | null>).filter((row): row is Partial<BulkResultRow> => Boolean(row) && typeof row!.student_id === "string") : null;
  const skippedFrom = (list: Array<{ student_id?: unknown; reason?: unknown; code?: unknown }>): BulkOutcomeRow[] => list.map((item) => ({ code: typeof item.code === "string" ? item.code : null, id: String(item.student_id ?? ""), name: nameOf(String(item.student_id ?? "")), reason: typeof item.reason === "string" && item.reason.trim() ? item.reason.trim() : REASON_FALLBACK }));
  if (rows) {
    const skipped = skippedFrom(rows.filter((row) => row.status === "skipped"));
    const addedNames = rows.filter((row) => row.status === "added").map((row) => nameOf(row.student_id as string));
    return { added: addedNames.length, total: rows.length, skipped, addedNames };
  }
  const skipped = skippedFrom(Array.isArray(answer?.skipped_details) ? (answer!.skipped_details as Array<{ student_id?: unknown; reason?: unknown; code?: unknown }>) : []);
  const skippedIds = new Set(skipped.map((row) => row.id));
  const added = typeof answer?.added === "number" ? answer.added : Math.max(0, order.length - skipped.length);
  return { added, total: added + (typeof answer?.skipped === "number" ? answer.skipped : skipped.length), skipped, addedNames: order.filter((id) => !skippedIds.has(id)).slice(0, added).map(nameOf) };
}

/** «Записано 3 из 4» (a transfer says «Переведено»). */
export const bulkHeadline = (outcome: Pick<BulkOutcome, "added" | "total">, verb: "enrol" | "transfer" = "enrol"): string => `${verb === "transfer" ? "Переведено" : "Записано"} ${outcome.added} из ${outcome.total}`;

export interface ProbeRefusal { id: string; reason: string; code: string | null }

/**
 * The students the server will NOT write, from the dry run (`skipped_details[]` of the probe - Money-2 fix 11, F3): the words are the server's, the order is the order of the answer.  The screen says it before the
 * button is pressed; the choice (take the label off, change the conditions) stays with the person.
 */
export function probeRefusalsOf(answer: unknown): ProbeRefusal[] {
  const list = (answer as { skipped_details?: unknown } | null | undefined)?.skipped_details;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const row = (item ?? {}) as { student_id?: unknown; reason?: unknown; code?: unknown };
    const id = typeof row.student_id === "string" ? row.student_id : "";
    return id ? [{ id, reason: typeof row.reason === "string" ? row.reason.trim() : "", code: typeof row.code === "string" ? row.code : null }] : [];
  });
}

/** Everybody chosen is refused for the SAME reason (a full group): ONE line says it; otherwise null. */
export function sameRefusalForAll(refusals: readonly ProbeRefusal[], chosen: number): string | null {
  return chosen >= 2 && refusals.length === chosen && refusals.every((row) => row.reason === refusals[0].reason) ? refusals[0].reason : null;
}

/**
 * A probe of ONE student that failed with a refusal in the server's words (a 4xx with a message: a full group, a day before his last stay): the words, else null (a broken connection, a timeout, no right -
 * those are «Повторить» / their own texts, not a refusal of the student).  The window of a student's card says it as «<Имя> — не будет записан» before the button (F3).
 */
export function probeRefusalOfError(error: unknown): string | null {
  const source = error as { status?: unknown; message?: unknown; code?: unknown } | null | undefined;
  const status = typeof source?.status === "number" ? source.status : 0;
  const message = typeof source?.message === "string" ? source.message.trim() : "";
  if (status < 400 || status >= 500 || [401, 403, 408, 429].includes(status) || !message || source?.code === "EFFECTS_TIMEOUT") return null;
  return message;
}
