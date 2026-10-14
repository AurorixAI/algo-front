import { create } from "zustand";
import { DEMO_MODE, orgApi } from "./api";

interface ExcuseBadgeState {
  /** Excused absences waiting for an administrator decision. */
  pending: number;
  /** Lessons that still have to be closed (started-unfinished + never started). */
  openLessons: number;
  /**
   * Re-read the counter; a failure keeps the last known value and never throws.
   * Without `force`, a call within a second of the previous one is skipped (mount
   * and route change fire together); pass `force` after an action that changed it.
   */
  refresh: (force?: boolean) => Promise<void>;
  setPending: (value: number) => void;
  setOpenLessons: (value: number) => void;
}

const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

/** Everything that needs an administrator's action: the sidebar badge. */
export const selectBadgeTotal = (state: Pick<ExcuseBadgeState, "pending" | "openLessons">) =>
  state.pending + state.openLessons;

let inFlight: Promise<void> | null = null;
let lastStartedAt = 0;
const MIN_GAP_MS = 1000;

export const useExcuseBadge = create<ExcuseBadgeState>((set) => ({
  pending: 0,
  openLessons: 0,
  setPending: (value) => set({ pending: count(value) }),
  setOpenLessons: (value) => set({ openLessons: count(value) }),
  refresh: (force = false) => {
    // The demo API has no such endpoint; nothing is requested there.
    if (DEMO_MODE) return Promise.resolve();
    if (inFlight) return inFlight;
    if (!force && Date.now() - lastStartedAt < MIN_GAP_MS) return Promise.resolve();
    lastStartedAt = Date.now();
    inFlight = orgApi.getAttendanceExcuseSummary()
      .then((summary) => set({
        pending: count(summary?.pending_total),
        openLessons: count(summary?.open_lessons_total),
      }))
      .catch(() => undefined)
      .finally(() => { inFlight = null; });
    return inFlight;
  },
}));
