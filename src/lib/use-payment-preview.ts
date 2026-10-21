import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { orgApi } from "./api";
import type { PaymentPreview, PreviewQuery } from "./payments";
import { payError } from "./payments-ledger";
import { createRequestSequence, type RequestSequence } from "./request-sequence";

/** Wait this long after the last keystroke of the amount before asking the server again. */
export const PREVIEW_DEBOUNCE_MS = 250;
/** A preview that has not come back by now counts as failed: the form must not wait for it forever. */
export const PREVIEW_TIMEOUT_MS = 8000;

export interface PaymentPreviewState {
  /** The latest answer that was not dropped as stale. */
  preview: PaymentPreview | null;
  /** The query `preview` answers (`previewKey`): show the calculation only while it equals the key of the form on screen. */
  previewKey: string;
  /** A request for the current query is waiting or in flight. */
  loading: boolean;
  /** The last request for the current query failed: the server's own sentence (a wrong amount) or a network message. */
  error: string | null;
}

const IDLE: PaymentPreviewState = { preview: null, previewKey: "", loading: false, error: null };

/** Stable text of a query: two requests with the same text ask the same thing. */
export function previewKey(query: PreviewQuery | null): string {
  if (!query) return "";
  return [query.amount ?? "", query.paid_on ?? "", query.replace_payment_id ?? ""].join("|");
}

export interface PreviewRun {
  query: PreviewQuery;
  /** `previewKey(query)`. */
  key: string;
  /** Wait before asking (0 for the first ask after the dialog opened). */
  delayMs: number;
  sequence: RequestSequence;
  fetchPreview: (query: PreviewQuery, signal: AbortSignal) => Promise<PaymentPreview>;
  /** The key of the form on screen right now: an answer for another one is dropped. */
  currentKey: () => string;
  onPreview: (preview: PaymentPreview, key: string) => void;
  onFailed: (message: string) => void;
}

/**
 * One debounced ask.  The answer is applied only if no newer ask has started since (the token of the sequence) and the
 * form still shows the same query; a request that does not answer in time counts as failed and its late answer is
 * dropped.  The returned function cancels the ask: it stops the timers, ABORTS the request in flight (a stale preview
 * must not keep the connection) and invalidates its answer - the effect cleanup calls it when the query changes.
 */
export function startPreviewRun(run: PreviewRun, timeoutMs: number = PREVIEW_TIMEOUT_MS): () => void {
  const token = run.sequence.next();
  const live = () => run.sequence.isCurrent(token);
  const controller = new AbortController();
  const giveUp = setTimeout(() => {
    if (!live()) return;
    run.sequence.next(); // a late answer is dropped
    controller.abort();
    run.onFailed("Расчёт не отвечает. Проверьте связь и повторите.");
  }, run.delayMs + timeoutMs);
  const timer = setTimeout(() => {
    run.fetchPreview(run.query, controller.signal)
      .then((preview) => {
        // Also checked against the form on screen: the effect that would cancel this request may not have run yet.
        if (!live() || run.currentKey() !== run.key) return;
        clearTimeout(giveUp);
        run.onPreview(preview, run.key);
      })
      .catch((error) => {
        if (!live() || controller.signal.aborted) return;
        clearTimeout(giveUp);
        run.onFailed(payError(error, "Не удалось посчитать").message);
      });
  }, run.delayMs);
  return () => {
    clearTimeout(timer);
    clearTimeout(giveUp);
    // The pending or in-flight request belongs to a query that is gone.
    run.sequence.next();
    controller.abort();
  };
}

/**
 * Debounced, race-safe «что закроет».  Every change of the query cancels the pending request and drops the answer of
 * the one in flight, so a slow answer for an old amount can never overwrite a newer one.  `onPreview` runs once per
 * accepted answer, with the closure of the latest render.  The first request after `enabled` turns on goes out at once;
 * later ones wait for the debounce, unless `immediate.current` is set (the dialog just wrote the suggested amount).
 */
export function usePaymentPreview(input: {
  enabled: boolean;
  membershipId: string | null;
  query: PreviewQuery | null;
  immediate?: MutableRefObject<boolean>;
  onPreview?: (preview: PaymentPreview, key: string) => void;
}): PaymentPreviewState {
  const { enabled, membershipId, query } = input;
  const key = previewKey(query);
  const [state, setState] = useState<PaymentPreviewState>(IDLE);
  const sequence = useRef(createRequestSequence());
  const first = useRef(true);
  const onPreview = useRef(input.onPreview);
  onPreview.current = input.onPreview;
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
      setState((previous) => (previous.loading || previous.error ? { ...previous, loading: false, error: null } : previous));
      return;
    }
    setState((previous) => ({ ...previous, loading: true, error: null }));
    const immediate = Boolean(input.immediate?.current);
    if (input.immediate) input.immediate.current = false;
    const delayMs = first.current || immediate ? 0 : PREVIEW_DEBOUNCE_MS;
    first.current = false;
    return startPreviewRun({
      query: current,
      key,
      delayMs,
      sequence: sequence.current,
      fetchPreview: (q, signal) => orgApi.getPaymentPreview(membershipId, q, signal),
      currentKey: () => keyRef.current,
      onPreview: (preview, answeredKey) => {
        setState({ preview, previewKey: answeredKey, loading: false, error: null });
        onPreview.current?.(preview, answeredKey);
      },
      onFailed: (message) => setState((previous) => ({ ...previous, loading: false, error: message })),
    });
  }, [enabled, membershipId, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
