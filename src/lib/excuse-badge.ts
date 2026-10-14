import { create } from "zustand";
import { DEMO_MODE, orgApi } from "./api";

interface ExcuseBadgeState {
  /** Excused absences waiting for an administrator decision. */
  pending: number;
  /**
   * Re-read the counter; a failure keeps the last known value and never throws.
   * Without `force`, a call within a second of the previous one is skipped (mount
   * and route change fire together); pass `force` after an action that changed it.
   */
  refresh: (force?: boolean) => Promise<void>;
  setPending: (value: number) => void;
}

let inFlight: Promise<void> | null = null;
let lastStartedAt = 0;
const MIN_GAP_MS = 1000;

export const useExcuseBadge = create<ExcuseBadgeState>((set) => ({
  pending: 0,
  setPending: (value) => set({ pending: Math.max(0, value) }),
  refresh: (force = false) => {
    // The demo API has no such endpoint; nothing is requested there.
    if (DEMO_MODE) return Promise.resolve();
    if (inFlight) return inFlight;
    if (!force && Date.now() - lastStartedAt < MIN_GAP_MS) return Promise.resolve();
    lastStartedAt = Date.now();
    inFlight = orgApi.getAttendanceExcuseSummary()
      .then((summary) => set({ pending: Math.max(0, Number(summary?.pending_total) || 0) }))
      .catch(() => undefined)
      .finally(() => { inFlight = null; });
    return inFlight;
  },
}));
