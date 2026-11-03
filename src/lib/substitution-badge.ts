import { create } from "zustand";
import { substitutionsApi } from "./api";
import { createPollingGate } from "./polling-gate";
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
  /** When the counter was last read successfully (ms since epoch, 0 = never): a change of page re-reads it only when this is 30 s old (lib/badge-throttle.ts). */
  lastOkAt: number;
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

const gate = createPollingGate();

export const useSubstitutionBadge = create<SubstitutionBadgeState>((set) => ({
  pending: 0,
  urgent: 0,
  overdue: 0,
  expiring: 0,
  lastOkAt: 0,
  setWaiting: (total) => set({ pending: count(total), lastOkAt: Date.now() }),
  setSummary: (summary) => set({ pending: waitingTotal(summary), urgent: count(summary.urgentTotal), overdue: count(summary.overdueTotal), expiring: count(summary.expiringTotal), lastOkAt: Date.now() }),
  reset: () => {
    gate.reset();
    set({ pending: 0, urgent: 0, overdue: 0, expiring: 0, lastOkAt: 0 });
  },
  refresh: (force = false) => gate.run(force, (isCurrent) => substitutionsApi.summary().then((summary) => {
    if (!isCurrent()) return;
    set({ pending: waitingTotal(summary), urgent: count(summary?.urgentTotal), overdue: count(summary?.overdueTotal), expiring: count(summary?.expiringTotal), lastOkAt: Date.now() });
  })),
}));
