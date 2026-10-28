import { create } from "zustand";
import { DEMO_MODE, substitutionsApi } from "./api";
import { waitingTotal } from "./one-off";

interface SubstitutionBadgeState {
  /** Waiting for a decision (the menu counter): the requests for a substitute and (#154) the additional lessons that wait for a decision of money. */
  pending: number;
  /** Of them: the lesson is within 24 hours. */
  urgent: number;
  /** Of them: the lesson has already started. */
  overdue: number;
  /** W1 S20: waiting requests that drop out of the window on the 1st (non-zero only in the last 3 days before it). */
  expiring: number;
  /**
   * Re-read the counter; a failure keeps the last known value and never throws.  Without `force` a call within a second of the
   * previous one is skipped (mount and route change fire together); pass `force` after an action that changed it.
   */
  refresh: (force?: boolean) => Promise<void>;
  /** #154: the number again after the lessons of money were read (the list of requests and the lessons of money arrive separately). */
  setWaiting: (total: number) => void;
  setSummary: (summary: { pendingTotal?: number; oneOffDecisionsTotal?: number; waitingTotal?: number; urgentTotal?: number; overdueTotal?: number; expiringTotal?: number }) => void;
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
  expiring: 0,
  setWaiting: (total) => set({ pending: count(total) }),
  setSummary: (summary) => set({ pending: waitingTotal(summary), urgent: count(summary.urgentTotal), overdue: count(summary.overdueTotal), expiring: count(summary.expiringTotal) }),
  reset: () => {
    epoch += 1;
    inFlight = null;
    queued = null;
    lastStartedAt = 0;
    set({ pending: 0, urgent: 0, overdue: 0, expiring: 0 });
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
          set({ pending: waitingTotal(summary), urgent: count(summary?.urgentTotal), overdue: count(summary?.overdueTotal), expiring: count(summary?.expiringTotal) });
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
