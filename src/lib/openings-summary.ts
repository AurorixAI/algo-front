import { useCallback, useEffect, useState } from "react";
import { orgApi } from "./api";
import { moneyDeniedFor, usePaymentsSummary } from "./payments-summary";
import { useAuthStore } from "./store";
import type { OpeningsSummary } from "./openings";

/**
 * `GET /org/opening-balances/summary` for the three small pieces that are not the page itself (the banner of «Должники», the checklist of
 * the settings, the button of «Оплаты»).  They may stand on one screen: a request in flight is shared and an answer younger than
 * `FRESH_MS` is reused, so one screen asks once.  A refusal (403: no right to money, 404: an older server) is remembered as «no
 * summary» - the pieces then show nothing.  `refresh(true)` always asks (after «Не нужно», after a save).
 */
const FRESH_MS = 4000;

let cached: { at: number; value: OpeningsSummary | null } | null = null;
let inFlight: Promise<OpeningsSummary | null> | null = null;
const listeners = new Set<(value: OpeningsSummary | null) => void>();

export async function loadOpeningsSummary(force: boolean): Promise<OpeningsSummary | null> {
  // no right to money (the profile says so, or the summary was refused): not asked at all - a request would end in a 403 in the console
  const money = usePaymentsSummary.getState();
  if (moneyDeniedFor(useAuthStore.getState().user, { loaded: money.loaded, available: money.available })) return null;
  if (!force && cached && Date.now() - cached.at < FRESH_MS) return cached.value;
  if (inFlight) return inFlight;
  const request = orgApi.getOpeningsSummary()
    .then((value): OpeningsSummary | null => value)
    .catch((error: unknown): OpeningsSummary | null => {
      const status = (error as { status?: number } | null)?.status;
      if (status === 403 || status === 404) return null;
      throw error;
    })
    .then((value) => {
      cached = { at: Date.now(), value };
      listeners.forEach((listener) => listener(value));
      return value;
    })
    .finally(() => { inFlight = null; });
  inFlight = request;
  return request;
}

/** The summary shown by a piece, and what it can do to it.  `summary` is null while unknown, after a refusal and after a failure. */
export function useOpeningsSummary(): { summary: OpeningsSummary | null; loaded: boolean; refresh: (force?: boolean) => Promise<void>; replace: (next: OpeningsSummary) => void } {
  const [summary, setSummary] = useState<OpeningsSummary | null>(cached?.value ?? null);
  const [loaded, setLoaded] = useState(cached !== null);

  useEffect(() => {
    let alive = true;
    const listener = (value: OpeningsSummary | null) => { if (alive) { setSummary(value); setLoaded(true); } };
    listeners.add(listener);
    loadOpeningsSummary(false).then(listener).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; listeners.delete(listener); };
  }, []);

  const refresh = useCallback(async (force = true) => {
    try { await loadOpeningsSummary(force); } catch { /* the old figures stay */ }
  }, []);
  const replace = useCallback((next: OpeningsSummary) => {
    cached = { at: Date.now(), value: next };
    listeners.forEach((listener) => listener(next));
  }, []);
  return { summary, loaded, refresh, replace };
}
