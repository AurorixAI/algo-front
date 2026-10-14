import { useEffect } from "react";
import { create } from "zustand";
import { DEMO_MODE, orgApi } from "./api";
import type { PaymentsSummary, PeriodMode } from "./payments";

interface PaymentsSummaryState {
  /**
   * The server answered 200: the user may see money.  For the owner always; for an
   * administrator only after the owner enabled it.  Everything about payments (menu item,
   * banner, money blocks of the student card) is rendered only while this is true.
   */
  available: boolean;
  /** At least one answer (or failure) has been processed. */
  loaded: boolean;
  /** Memberships whose payment has ended (expired + ends today): the banner and the menu badge. */
  due: number;
  expiring: number;
  none: number;
  active: number;
  trackedTotal: number;
  periodMode: PeriodMode;
  lessonsPerPayment: number | null;
  /**
   * Re-read the summary; a failure never throws.  Without `force`, a call within a second
   * of the previous one is skipped (mount and route change fire together); pass `force`
   * after an action that changed the numbers.
   */
  refresh: (force?: boolean) => Promise<void>;
  /** Forget everything (logout / another account). */
  reset: () => void;
}

const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

const EMPTY = {
  available: false,
  loaded: false,
  due: 0,
  expiring: 0,
  none: 0,
  active: 0,
  trackedTotal: 0,
  periodMode: "calendar" as PeriodMode,
  lessonsPerPayment: null as number | null,
};

let inFlight: Promise<void> | null = null;
let lastStartedAt = 0;
let warned = false;
/** Bumped by `reset` so an answer that arrives after logout is dropped. */
let epoch = 0;
const MIN_GAP_MS = 1000;

/** Fields of the state that come from one summary answer. */
export function summaryToState(summary: Partial<PaymentsSummary> | null | undefined) {
  const lessons = Number(summary?.lessons_per_payment);
  return {
    available: true,
    loaded: true,
    due: count(summary?.due),
    expiring: count(summary?.expiring),
    none: count(summary?.none),
    active: count(summary?.active) + count(summary?.free),
    trackedTotal: count(summary?.tracked_total),
    periodMode: (summary?.period_mode === "lessons" ? "lessons" : "calendar") as PeriodMode,
    lessonsPerPayment: Number.isInteger(lessons) && lessons > 0 ? lessons : null,
  };
}

export const usePaymentsSummary = create<PaymentsSummaryState>((set) => ({
  ...EMPTY,
  reset: () => {
    epoch += 1;
    inFlight = null;
    lastStartedAt = 0;
    set({ ...EMPTY });
  },
  refresh: (force = false) => {
    // The demo API has no such endpoint; nothing is requested there.
    if (DEMO_MODE) {
      set({ ...EMPTY, loaded: true });
      return Promise.resolve();
    }
    if (inFlight) return inFlight;
    if (!force && Date.now() - lastStartedAt < MIN_GAP_MS) return Promise.resolve();
    lastStartedAt = Date.now();
    const myEpoch = epoch;
    inFlight = orgApi.getPaymentsSummary()
      .then((summary) => {
        if (myEpoch === epoch) set(summaryToState(summary));
      })
      .catch((error: unknown) => {
        if (myEpoch !== epoch) return;
        // 403 (no right / flag off), 404 (old server), a network error: no money anywhere, no alerts.
        set({ ...EMPTY, loaded: true });
        const status = (error as { status?: number } | null)?.status;
        if (!warned && status !== 403 && status !== 404) {
          warned = true;
          console.warn("Payments summary is unavailable");
        }
      })
      .finally(() => { if (myEpoch === epoch) inFlight = null; });
    return inFlight;
  },
}));

/**
 * Keeps the summary fresh while a layout of owner / administrator is mounted: on mount,
 * on every route change, when the tab becomes visible, and every 5 minutes.
 */
export function usePaymentsSummarySync(enabled: boolean, pathname: string | null | undefined): void {
  const refresh = usePaymentsSummary((state) => state.refresh);
  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, pathname, refresh]);
  useEffect(() => {
    if (!enabled) return;
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", refreshIfVisible);
    const timer = window.setInterval(refreshIfVisible, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.clearInterval(timer);
    };
  }, [enabled, refresh]);
}
