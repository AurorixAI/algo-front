import { create } from "zustand";
import { orgApi } from "./api";
import { createPollingGate } from "./polling-gate";

interface ExcuseBadgeState {
  /** Excused absences waiting for an administrator decision. */
  pending: number;
  /** Lessons that still have to be closed (started-unfinished + never started). */
  openLessons: number;
  /** When the counter was last read successfully (ms since epoch, 0 = never): a change of page re-reads it only when this is 30 s old (lib/badge-throttle.ts). */
  lastOkAt: number;
  /**
   * Re-read the counter; a failure keeps the last known value and never throws.
   * Without `force`, a call within a second of the previous one is skipped (mount
   * and route change fire together); pass `force` after an action that changed it.
   */
  refresh: (force?: boolean) => Promise<void>;
  setPending: (value: number) => void;
  /** Forget everything (another user signed in): counters back to 0, answers still in flight are dropped. */
  reset: () => void;
}

const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

/** Everything that needs an administrator's action: the sidebar badge. */
export const selectBadgeTotal = (state: Pick<ExcuseBadgeState, "pending" | "openLessons">) =>
  state.pending + state.openLessons;

const gate = createPollingGate();

export const useExcuseBadge = create<ExcuseBadgeState>((set) => ({
  pending: 0,
  openLessons: 0,
  lastOkAt: 0,
  setPending: (value) => set({ pending: count(value), lastOkAt: Date.now() }),
  reset: () => {
    gate.reset();
    set({ pending: 0, openLessons: 0, lastOkAt: 0 });
  },
  refresh: (force = false) => gate.run(force, (isCurrent) => orgApi.getAttendanceExcuseSummary().then((summary) => {
    if (!isCurrent()) return;
    const open = summary?.open_lessons_total;
    // null/absent = not counted (server hiccup, or an older backend): keep the last value.
    set(open == null
      ? { pending: count(summary?.pending_total), lastOkAt: Date.now() }
      : { pending: count(summary?.pending_total), openLessons: count(open), lastOkAt: Date.now() });
  })),
}));
