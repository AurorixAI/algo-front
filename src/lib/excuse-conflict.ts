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
