import { useCallback, useEffect, useRef, useState } from "react";
import { periodClosedOf, type PeriodClosedInfo } from "./closed-period";

/**
 * R3 m7: the skeleton the money dialogs of lessons and months share («Вернуть урок», «Вернуть в разбор», «Переоткрыть месяц», «Отметить посещаемость», «Отменить решение», the cancels of a
 * payment / write-off / refund): `busy`, a ref that holds a double press (LESSONS 27), the failure as it came, the reset when the dialog opens for another thing (`resetKey`),
 * and the closed month told apart from any other failure (`closed`: the sentence of the server and the way out).
 * `run(action)` sends once: a second call while one is in flight is refused; a thrown failure is kept in `error` (and given to `onError` first).
 */
export function useDialogAction(resetKey: string | null): {
  busy: boolean;
  error: unknown;
  setError: (error: unknown) => void;
  closed: PeriodClosedInfo | null;
  run: (action: () => Promise<void>, onError?: (cause: unknown) => void) => Promise<boolean>;
} {
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setBusy(false);
    setError(null);
    sending.current = false;
  }, [resetKey]);

  const run = useCallback(async (action: () => Promise<void>, onError?: (cause: unknown) => void): Promise<boolean> => {
    if (sending.current) return false;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (cause) {
      onError?.(cause);
      setError(cause);
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, closed: periodClosedOf(error), run };
}
