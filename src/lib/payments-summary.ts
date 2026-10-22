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
  /** Of `due`, those whose payment has already ended (the rest end today): the overdue chip of the banner. */
  expired: number;
  /** The same as `due` / `expired`, in distinct students (a student of two groups counts once); null from an older server. */
  studentsDue: number | null;
  studentsExpired: number | null;
  expiring: number;
  none: number;
  active: number;
  trackedTotal: number;
  periodMode: PeriodMode;
  /** The day the accounting starts (S0: the opening balances are checked against the day before it); null until the server sends it. */
  accountingStart: string | null;
  lessonsPerPayment: number | null;
  /** PAY-2: what the students owe the center today, and what they have paid ahead (whole сум; 0 from an older server). */
  debtTotal: number;
  advanceTotal: number;
  studentsWithDebt: number;
  /** Owner 21.10: the count of the «Должники» tab (= the card «Долг учеников»), students who paid ahead, memberships without a price; null until the server sends them. */
  debtors: number | null;
  /** The rows of each tab (memberships); null from an older server. */
  buckets: { debt: number; expiring: number; active: number; paused: number } | null;
  paused: number;
  studentsPaused: number | null;
  studentsWithAdvance: number | null;
  priceMissing: number;
  /**
   * Re-read the summary; a failure never throws.  Without `force`, a call within a second
   * of the previous one is skipped (mount and route change fire together); pass `force`
   * after an action that changed the numbers.  A `force` call during a request queues exactly
   * one more read after it.  After a 403/404 nothing is requested again until `recheck`
   * (the 5-minute timer, saving the payment settings); `reset` (logout) forgets the refusal.
   */
  refresh: (force?: boolean, options?: { recheck?: boolean }) => Promise<void>;
  /** Forget everything (logout / another account). */
  reset: () => void;
}

const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
/** A count the server may leave out: null when it is missing or not a number. */
const optionalCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

const EMPTY = {
  available: false,
  loaded: false,
  due: 0,
  expired: 0,
  studentsDue: null as number | null,
  studentsExpired: null as number | null,
  expiring: 0,
  none: 0,
  active: 0,
  trackedTotal: 0,
  periodMode: "calendar" as PeriodMode,
  accountingStart: null as string | null,
  lessonsPerPayment: null as number | null,
  debtTotal: 0,
  advanceTotal: 0,
  studentsWithDebt: 0,
  debtors: null as number | null,
  buckets: null as { debt: number; expiring: number; active: number; paused: number } | null,
  paused: 0,
  studentsPaused: null as number | null,
  studentsWithAdvance: null as number | null,
  priceMissing: 0,
};

let inFlight: Promise<void> | null = null;
let lastStartedAt = 0;
let warned = false;
/** The server answered 403/404: this user has no payments; stop asking until a recheck. */
let denied = false;
/** A forced refresh asked for while one was in flight. */
let queued = false;
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
    expired: Math.min(count(summary?.expired), count(summary?.due)),
    studentsDue: optionalCount(summary?.students_due),
    studentsExpired: optionalCount(summary?.students_expired),
    expiring: count(summary?.expiring),
    none: count(summary?.none),
    // `active` is already the whole «Оплачено» tab (paid + free); `free` is a sub-count of it.
    active: count(summary?.active),
    trackedTotal: count(summary?.tracked_total),
    periodMode: (summary?.period_mode === "lessons" ? "lessons" : "calendar") as PeriodMode,
    accountingStart: typeof summary?.accounting_start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(summary.accounting_start_date) ? summary.accounting_start_date : null,
    lessonsPerPayment: Number.isInteger(lessons) && lessons > 0 ? lessons : null,
    debtTotal: count(summary?.debt_total),
    advanceTotal: count(summary?.advance_total),
    studentsWithDebt: count(summary?.students_with_debt),
    debtors: optionalCount(summary?.debtors) ?? optionalCount(summary?.students_with_debt),
    buckets: summary?.buckets
      ? { debt: count(summary.buckets.debt), expiring: count(summary.buckets.expiring), active: count(summary.buckets.active), paused: count(summary.buckets.paused) }
      : null,
    paused: count(summary?.paused),
    studentsPaused: optionalCount(summary?.students_paused),
    studentsWithAdvance: optionalCount(summary?.students_with_advance),
    priceMissing: count(summary?.price_missing),
  };
}

export const usePaymentsSummary = create<PaymentsSummaryState>((set, get) => ({
  ...EMPTY,
  reset: () => {
    epoch += 1;
    inFlight = null;
    denied = false;
    queued = false;
    lastStartedAt = 0;
    set({ ...EMPTY });
  },
  refresh: (force = false, options) => {
    // The demo API has no such endpoint; nothing is requested there.
    if (DEMO_MODE) {
      set({ ...EMPTY, loaded: true });
      return Promise.resolve();
    }
    if (denied && !options?.recheck) return Promise.resolve();
    if (inFlight) {
      if (force) queued = true;
      return inFlight;
    }
    if (!force && Date.now() - lastStartedAt < MIN_GAP_MS) return Promise.resolve();
    lastStartedAt = Date.now();
    const myEpoch = epoch;
    const request = orgApi.getPaymentsSummary()
      .then((summary) => {
        if (myEpoch !== epoch) return;
        denied = false;
        set(summaryToState(summary));
      })
      .catch((error: unknown) => {
        if (myEpoch !== epoch) return;
        const status = (error as { status?: number } | null)?.status;
        if (status === 403 || status === 404) {
          // No right (or the flag is off, or an old server): no money anywhere, no alerts.
          denied = true;
          set({ ...EMPTY, loaded: true });
          return;
        }
        // Network error / 5xx: keep what is known, so open dialogs and the menu do not vanish.
        if (!warned) {
          warned = true;
          console.warn("Payments summary is unavailable");
        }
      })
      .then(() => {
        if (myEpoch !== epoch) return undefined;
        inFlight = null;
        if (!queued) return undefined;
        queued = false;
        return get().refresh(true, options);
      });
    inFlight = request;
    return request;
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
    // The timer is the only periodic way back after a refusal (the owner may have enabled the right).
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(false, { recheck: true });
    }, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.clearInterval(timer);
    };
  }, [enabled, refresh]);
}
