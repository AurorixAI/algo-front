import { useEffect, useRef, useState } from "react";
import { orgApi } from "./api";
import { quoteQueryKey, type PaymentQuote, type PaymentQuoteQuery } from "./payments";
import { createRequestSequence, type RequestSequence } from "./request-sequence";

/** Wait this long after the last change of a date before asking the server again. */
export const QUOTE_DEBOUNCE_MS = 300;
/** A quote that has not come back by now counts as failed: the form must not wait for it forever. */
export const QUOTE_TIMEOUT_MS = 8000;

export interface PaymentQuoteState {
  /** The latest answer that was not dropped as stale. */
  quote: PaymentQuote | null;
  /** The query `quote` answers (`quoteQueryKey`): show it only while it equals the key of the form on screen. */
  quoteKey: string;
  /** A request for the current query is waiting or in flight. */
  loading: boolean;
  /** The last request for the current query failed (the caller keeps its local calculation). */
  failed: boolean;
}

const IDLE: PaymentQuoteState = { quote: null, quoteKey: "", loading: false, failed: false };

export interface QuoteRun {
  query: PaymentQuoteQuery;
  /** `quoteQueryKey(query)`. */
  key: string;
  /** Wait before asking (0 for the first ask after the form opened). */
  delayMs: number;
  sequence: RequestSequence;
  fetchQuote: (query: PaymentQuoteQuery) => Promise<PaymentQuote>;
  /** The key of the form on screen right now: an answer for another one is dropped. */
  currentKey: () => string;
  onQuote: (quote: PaymentQuote, key: string) => void;
  onFailed: () => void;
}

/**
 * One debounced ask.  The answer is applied only if no newer ask has started since (the token of the
 * sequence) and the form still shows the same query; a request that does not answer in time counts as
 * failed and its late answer is dropped.  The returned function cancels the ask: it stops the timers and
 * invalidates a request in flight - the effect cleanup calls it when the query changes.
 */
export function startQuoteRun(run: QuoteRun, timeoutMs: number = QUOTE_TIMEOUT_MS): () => void {
  const token = run.sequence.next();
  const live = () => run.sequence.isCurrent(token);
  const giveUp = setTimeout(() => {
    if (!live()) return;
    run.sequence.next(); // a late answer is dropped
    run.onFailed();
  }, run.delayMs + timeoutMs);
  const timer = setTimeout(() => {
    run.fetchQuote(run.query)
      .then((quote) => {
        // Also checked against the form on screen: the effect that would cancel this request may not have run yet.
        if (!live() || run.currentKey() !== run.key) return;
        clearTimeout(giveUp);
        run.onQuote(quote, run.key);
      })
      .catch(() => {
        if (!live()) return;
        clearTimeout(giveUp);
        run.onFailed();
      });
  }, run.delayMs);
  return () => {
    clearTimeout(timer);
    clearTimeout(giveUp);
    // The pending or in-flight request belongs to a query that is gone.
    run.sequence.next();
  };
}

/**
 * Debounced, race-safe quote of the next payment.  Every change of the query cancels the pending
 * request and drops the answer of the one in flight, so a slow answer for old dates can never
 * overwrite a newer one.  `onQuote` runs once per accepted answer, with the closure of the latest render
 * (so it sees which fields the user has touched by then).  The first request after `enabled` turns
 * on goes out at once; later ones wait for the debounce.
 */
export function usePaymentQuote(input: {
  enabled: boolean;
  membershipId: string | null;
  query: PaymentQuoteQuery | null;
  onQuote?: (quote: PaymentQuote, key: string) => void;
}): PaymentQuoteState {
  const { enabled, membershipId, query } = input;
  const key = quoteQueryKey(query);
  const [state, setState] = useState<PaymentQuoteState>(IDLE);
  const sequence = useRef(createRequestSequence());
  const first = useRef(true);
  const onQuote = useRef(input.onQuote);
  onQuote.current = input.onQuote;
  const queryRef = useRef(query);
  queryRef.current = query;
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if (!enabled || !membershipId) {
      first.current = true;
      sequence.current.next();
      setState(IDLE);
      return;
    }
    const current = queryRef.current;
    if (!current) {
      setState((previous) => (previous.loading || previous.failed ? { ...previous, loading: false, failed: false } : previous));
      return;
    }
    setState((previous) => ({ ...previous, loading: true, failed: false }));
    const delayMs = first.current ? 0 : QUOTE_DEBOUNCE_MS;
    first.current = false;
    return startQuoteRun({
      query: current,
      key,
      delayMs,
      sequence: sequence.current,
      fetchQuote: (q) => orgApi.getPaymentQuote(membershipId, q),
      currentKey: () => keyRef.current,
      onQuote: (quote, answeredKey) => {
        setState({ quote, quoteKey: answeredKey, loading: false, failed: false });
        onQuote.current?.(quote, answeredKey);
      },
      onFailed: () => setState((previous) => ({ ...previous, loading: false, failed: true })),
    });
  }, [enabled, membershipId, key]);

  return state;
}
