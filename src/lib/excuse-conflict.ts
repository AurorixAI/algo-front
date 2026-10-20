/**
 * Two people decide on the same excuse: the second one must not overwrite the first without knowing.  A decision (or a
 * reset) is sent with `expected_status` - the status the person saw in the dialog.  When the excuse has changed since, the
 * server writes nothing and answers 409 `{code: "EXCUSE_CHANGED", message, item}` with the excuse as it is now.  The screen
 * then shows the message inside the dialog (which stays open), patches the row with `item`, and the admin decides again
 * knowing what changed.  No React and no network here: node:test loads this file.
 */

export const EXCUSE_CHANGED = "EXCUSE_CHANGED";

const FALLBACK_MESSAGE = "Пропуск уже изменили: список обновлён. Проверьте, что решено, и примите решение ещё раз.";

export interface ExcuseChange {
  /** What to tell the person (the server's words, a fallback when it sent none). */
  message: string;
  /** The excuse as it is now, when the server sent it; null: read the list again. */
  item: unknown | null;
}

/** The change an error carries, or null when the error is something else (any other 409, a network failure, a plain Error). */
export function excuseChange(error: unknown): ExcuseChange | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { status?: unknown; code?: unknown; message?: unknown; detail?: unknown };
  const detail = e.detail && typeof e.detail === "object" ? (e.detail as { code?: unknown; message?: unknown; item?: unknown }) : null;
  const code = typeof e.code === "string" ? e.code : typeof detail?.code === "string" ? detail.code : undefined;
  if (e.status !== 409 || code !== EXCUSE_CHANGED) return null;
  const message = typeof e.message === "string" && e.message.trim() ? e.message : typeof detail?.message === "string" && detail.message.trim() ? detail.message : FALLBACK_MESSAGE;
  const item = detail && detail.item && typeof detail.item === "object" ? detail.item : null;
  return { message, item };
}

/** What of a server's excuse a cell of the journal shows (the shape of `AttendanceExcuseItem`, the part that changes with a decision). */
export interface ExcuseItemFields {
  status: "pending" | "confirmed" | "rejected";
  reviewed_by?: { name: string } | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  billing_mode?: string | null;
  decided_after_deadline?: boolean | null;
  deadline_at_decision?: string | null;
}

/**
 * The cell of the journal after the server answered with the excuse (a decision, a reset, or the item of an EXCUSE_CHANGED):
 * who decided, when, the note, the billing mode, and the «после срока» mark with its deadline - all of them, so the chip is
 * right at once and not only after a reload.  A key the answer does not carry keeps what the cell had.
 */
export function applyExcuseItem<T extends { status: string }>(cell: T, item: ExcuseItemFields): T {
  return {
    ...cell,
    status: item.status,
    reviewed_by_name: item.reviewed_by?.name ?? null,
    reviewed_at: item.reviewed_at ?? null,
    review_note: item.review_note ?? null,
    ...(item.billing_mode !== undefined ? { billing_mode: item.billing_mode } : {}),
    ...(item.decided_after_deadline !== undefined ? { decided_after_deadline: item.decided_after_deadline } : {}),
    ...(item.deadline_at_decision !== undefined ? { deadline_at_decision: item.deadline_at_decision } : {}),
  };
}
