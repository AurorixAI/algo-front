import { useCallback, useEffect, useRef, useState } from "react";
import { createRequestSequence } from "./request-sequence";
import { IDLE_PREVIEW, startEffectsRun, type EffectsPreview } from "./money-preview";

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
      onReady: (effects) => setPreview({ status: "ready", effects }),
      onFailed: (error) => setPreview({ status: "failed", error }),
    });
  }, [key, nonce]);

  const retry = useCallback(() => setNonce((value) => value + 1), []);
  return { preview, retry };
}
