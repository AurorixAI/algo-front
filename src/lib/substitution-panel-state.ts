/**
 * #157: what the panel «Подробнее» shows from what it has read.  Pure, so a test runs the cases (a late answer of another row, a failed re-read after a decision) as they are.
 * An answer is kept with the id it was asked for (LESSONS 13): an answer of another row is never shown.  A re-read that failed must not leave the old state on the screen:
 * the panel says it could not read and offers no «Решить» (the row may have been decided meanwhile).
 */
import type { SubstitutionDetailOut, SubstitutionItem } from "./substitution-types";

export interface PanelData {
  loaded: { id: string; out: SubstitutionDetailOut } | null;
  failed: { id: string; message: string } | null;
}

export interface PanelView {
  /** The detail of the open row, null while it is not read or after a failed re-read. */
  out: SubstitutionDetailOut | null;
  /** The head of the panel: the answer, else the row the panel was opened from. */
  item: SubstitutionItem | null;
  error: string | null;
  /** A re-read failed: the old answer is not trusted (no «Сейчас», no history, no «Решить»). */
  stale: boolean;
}

export function panelView(data: PanelData, requestId: string | null, seed: SubstitutionItem | null): PanelView {
  const answer = data.loaded && data.loaded.id === requestId ? data.loaded.out : null;
  const error = data.failed && data.failed.id === requestId ? data.failed.message : null;
  const stale = Boolean(answer && error);
  const out = stale ? null : answer;
  const item = (stale ? null : answer?.item) ?? (seed && seed.id === requestId ? seed : null);
  return { out, item, error, stale };
}

/** The panel may offer «Решить» only on a fresh answer that says the row waits. */
export function canDecideInPanel(view: PanelView, audience: "manager" | "teacher"): boolean {
  return audience === "manager" && !view.stale && !view.error && view.item?.status === "pending";
}
