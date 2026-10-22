import { create } from "zustand";
import { DEMO_MODE, substitutionsApi } from "./api";

interface SubstitutionBadgeState {
  /** Requests waiting for a decision (the menu counter). */
  pending: number;
  /** Of them: the lesson is within 24 hours. */
  urgent: number;
  /** Of them: the lesson has already started. */
  overdue: number;
  /**
   * Re-read the counter; a failure keeps the last known value and never throws.  Without `force` a call within a second of the
   * previous one is skipped (mount and route change fire together); pass `force` after an action that changed it.
   */
  refresh: (force?: boolean) => Promise<void>;
  setSummary: (summary: { pendingTotal?: number; urgentTotal?: number; overdueTotal?: number }) => void;
  /** Another user signed in: counters back to 0, answers still in flight are dropped. */
  reset: () => void;
}

const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

let inFlight: Promise<void> | null = null;
let queued: Promise<void> | null = null;
let lastStartedAt = 0;
/** Bumped by `reset` so an answer that arrives after it is dropped. */
let epoch = 0;
const MIN_GAP_MS = 1000;

export const useSubstitutionBadge = create<SubstitutionBadgeState>((set) => ({
  pending: 0,
  urgent: 0,
  overdue: 0,
  setSummary: (summary) => set({ pending: count(summary.pendingTotal), urgent: count(summary.urgentTotal), overdue: count(summary.overdueTotal) }),
  reset: () => {
    epoch += 1;
    inFlight = null;
    queued = null;
    lastStartedAt = 0;
    set({ pending: 0, urgent: 0, overdue: 0 });
  },
  refresh: (force = false) => {
    // The demo API has no such endpoint; nothing is requested there.
    if (DEMO_MODE) return Promise.resolve();
    const start = (): Promise<void> => {
      lastStartedAt = Date.now();
      const myEpoch = epoch;
      const request: Promise<void> = substitutionsApi.summary()
        .then((summary) => {
          if (myEpoch !== epoch) return;
          set({ pending: count(summary?.pendingTotal), urgent: count(summary?.urgentTotal), overdue: count(summary?.overdueTotal) });
        })
        .catch(() => undefined)
        .finally(() => { if (inFlight === request) inFlight = null; });
      inFlight = request;
      return request;
    };
    if (inFlight) {
      if (!force) return inFlight;
      // A forced refresh follows an action: the request already in flight may have been answered before it, so one more is queued behind it.
      if (!queued) queued = inFlight.then(() => { queued = null; return start(); });
      return queued;
    }
    if (!force && Date.now() - lastStartedAt < MIN_GAP_MS) return Promise.resolve();
    return start();
  },
}));
