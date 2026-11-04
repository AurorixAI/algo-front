import { useCallback, useEffect, useRef, useState } from "react";
import { createRequestSequence } from "./request-sequence";
import { IDLE_PREVIEW, startEffectsRun, type EffectsPreview } from "./money-preview";
import { useDebouncedValue } from "./use-debounced-value";

/**
 * The dry run of an action that moves money, asked when `key` appears (a dialog opened for this lesson / excuse / marks) and again for a new key or `retry()`.
 * `key` null: nothing to ask (idle).  `load` is read at the moment of the ask.
 */
export function useMoneyPreview(key: string | null, load: (signal: AbortSignal) => Promise<unknown>): { preview: EffectsPreview; retry: () => void } {
  const [preview, setPreview] = useState<EffectsPreview>(IDLE_PREVIEW);
  const [nonce, setNonce] = useState(0);
  const sequence = useRef(createRequestSequence());
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (key === null) {
      sequence.current.next();
      setPreview(IDLE_PREVIEW);
      return undefined;
    }
    setPreview({ status: "loading" });
    return startEffectsRun({
      load: (signal) => loadRef.current(signal),
      sequence: sequence.current,
      onReady: (effects, answer) => setPreview({ status: "ready", effects, answer }),
      onFailed: (error) => setPreview({ status: "failed", error }),
    });
  }, [key, nonce]);

  const retry = useCallback(() => setNonce((value) => value + 1), []);
  return { preview, retry };
}

/** The wait before a dry run of a FORM is asked: the form stands still. */
export const FORM_PREVIEW_DEBOUNCE_MS = 400;

/**
 * The dry run of a form (an amount and a reason being typed): `key` is the text of everything the real request will carry (null: the form cannot be sent yet - nothing to ask).  It is asked
 * when the key stood still; until then the answer of the previous key is NOT shown as the answer to this one - the block says «считаем».
 */
export function useFormMoneyPreview(key: string | null, load: (signal: AbortSignal) => Promise<unknown>, delayMs: number = FORM_PREVIEW_DEBOUNCE_MS): { preview: EffectsPreview; retry: () => void } {
  const settled = useDebouncedValue(key, delayMs);
  const { preview, retry } = useMoneyPreview(key !== null && settled === key ? key : null, load);
  const shown: EffectsPreview = key === null ? IDLE_PREVIEW : settled === key ? preview : { status: "loading" };
  return { preview: shown, retry };
}
