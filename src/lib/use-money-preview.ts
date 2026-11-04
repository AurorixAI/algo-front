import { useCallback, useEffect, useRef, useState } from "react";
import { createRequestSequence } from "./request-sequence";
import { IDLE_PREVIEW, startEffectsRun, type EffectsPreview } from "./money-preview";
import { useDebouncedValue } from "./use-debounced-value";

const LOADING_PREVIEW: EffectsPreview = { status: "loading" };

/**
 * The dry run of an action that moves money, asked when `key` appears (a dialog opened for this lesson / excuse / marks) and again for a new key or `retry()`.
 * `key` null: nothing to ask (idle).  `load` is read at the moment of the ask.
 * An answer belongs to the ask it was made for (key + the number of retries): for any other ask the hook says «loading» AT ONCE - from the very first render, so there is no frame of
 * «idle» (a block that blinks, a button disabled for no reason) and no frame in which the answer of the previous key stands for the new one.
 */
export function useMoneyPreview(key: string | null, load: (signal: AbortSignal) => Promise<unknown>): { preview: EffectsPreview; retry: () => void } {
  const [held, setHeld] = useState<{ token: string; preview: EffectsPreview } | null>(null);
  const [nonce, setNonce] = useState(0);
  const sequence = useRef(createRequestSequence());
  const loadRef = useRef(load);
  loadRef.current = load;
  const token = key === null ? null : `${key}#${nonce}`;

  useEffect(() => {
    if (token === null) {
      sequence.current.next();
      setHeld(null);
      return undefined;
    }
    return startEffectsRun({
      load: (signal) => loadRef.current(signal),
      sequence: sequence.current,
      onReady: (effects, answer) => setHeld({ token, preview: { status: "ready", effects, answer } }),
      onFailed: (error) => setHeld({ token, preview: { status: "failed", error } }),
    });
  }, [token]);

  const retry = useCallback(() => setNonce((value) => value + 1), []);
  const preview = token === null ? IDLE_PREVIEW : held !== null && held.token === token ? held.preview : LOADING_PREVIEW;
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
  const shown: EffectsPreview = key === null ? IDLE_PREVIEW : settled === key ? preview : LOADING_PREVIEW;
  return { preview: shown, retry };
}
