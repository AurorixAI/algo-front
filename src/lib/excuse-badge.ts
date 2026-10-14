import { create } from "zustand";
import { DEMO_MODE, orgApi } from "./api";

interface ExcuseBadgeState {
  /** Excused absences waiting for an administrator decision. */
  pending: number;
  /** Re-read the counter; a failure keeps the last known value and never throws. */
  refresh: () => Promise<void>;
  setPending: (value: number) => void;
}

let inFlight: Promise<void> | null = null;

export const useExcuseBadge = create<ExcuseBadgeState>((set) => ({
  pending: 0,
  setPending: (value) => set({ pending: Math.max(0, value) }),
  refresh: () => {
    // The demo API has no such endpoint; nothing is requested there.
    if (DEMO_MODE) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = orgApi.getAttendanceExcuseSummary()
      .then((summary) => set({ pending: Math.max(0, Number(summary?.pending_total) || 0) }))
      .catch(() => undefined)
      .finally(() => { inFlight = null; });
    return inFlight;
  },
}));
