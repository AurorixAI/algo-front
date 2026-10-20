/**
 * Keeps a list that is patched in place honest.
 *
 * A decision is shown at once (the row leaves, the counters move), but other people work on the same queue and an older
 * read may still be on its way.  So:
 *  - `patched()` invalidates every read that started before it: its answer must never overwrite the newer patch;
 *  - after the LAST patch (a debounce: several decisions in a row cost one read) the list is read again silently, which
 *    heals what the patch could not know - another administrator's decisions, new excuses;
 *  - `woke()` (the window got focus / the tab became visible) reads silently too, at most once per `wakeGapMs`.
 * Timers and the clock are passed in, so the order of events is testable without a browser.
 */
import { createRequestSequence, type RequestSequence } from "./request-sequence";

export const HEAL_DELAY_MS = 1500;
export const WAKE_GAP_MS = 1000;

export interface QueueGuardOptions {
  /** A silent read of the current list (no spinner). */
  reload: () => void;
  healDelayMs?: number;
  wakeGapMs?: number;
  sequence?: RequestSequence;
  now?: () => number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface QueueGuard {
  /** A read starts: its token. */
  begin(): number;
  /** Is the answer of that read still allowed to touch the list? */
  accepts(token: number): boolean;
  /** An in-place patch was applied. */
  patched(): void;
  /** The window got focus / the tab became visible. */
  woke(): void;
  /** Drop the pending silent read (the page is gone).  The guard stays usable: a page mounted twice (React strict mode) keeps its guard. */
  cancel(): void;
}

export function createQueueGuard(options: QueueGuardOptions): QueueGuard {
  const sequence = options.sequence ?? createRequestSequence();
  const healDelay = options.healDelayMs ?? HEAL_DELAY_MS;
  const wakeGap = options.wakeGapMs ?? WAKE_GAP_MS;
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let heal: unknown = null;
  let lastRead = Number.NEGATIVE_INFINITY;

  const read = () => {
    lastRead = now();
    options.reload();
  };

  return {
    begin() {
      lastRead = now();
      return sequence.next();
    },
    accepts: (token) => sequence.isCurrent(token),
    patched() {
      sequence.next();
      if (heal !== null) clearTimer(heal);
      heal = setTimer(() => { heal = null; read(); }, healDelay);
    },
    woke() {
      if (now() - lastRead < wakeGap) return;
      read();
    },
    cancel() {
      if (heal !== null) clearTimer(heal);
      heal = null;
    },
  };
}

/**
 * What follows a decision: the list is patched (or read again), and the numbers of the menu badge are re-read whatever the
 * patch did - a failing read must not leave a stale counter on the sidebar.
 */
export async function afterDecision(patch: () => Promise<void> | void, refreshBadge: () => void): Promise<void> {
  try {
    await patch();
  } finally {
    refreshBadge();
  }
}
