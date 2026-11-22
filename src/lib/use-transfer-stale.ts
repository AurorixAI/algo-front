import { useCallback, useState } from "react";

/** What a window of money says, in ONE place, when the server refused its write because the account changed after the numbers were shown (409 `BALANCE_CHANGED`). */
export const STALE_WINDOW_TEXT = "Счёт изменился, пока окно было открыто. Проверьте числа и подтвердите ещё раз.";

/**
 * ONE answer to the refusal of a leaving / a transfer / the archive of a student whose money changed after the probe (409 `BALANCE_CHANGED`).  The window does NOT close: it keeps the sentence
 * `STALE_WINDOW_TEXT` above the numbers (`window`) and reads them again; the screen behind it reads its data again too (`page`), so the number behind the window is the new one as well.
 * Every screen that opens such a window passes `page` as `onStale`; the window itself calls `window.markStale()`.
 */
export function useTransferStale(reload: () => void): (message?: string) => void {
  return useCallback(() => { reload(); }, [reload]);
}

/** The window side of the same mechanism: whether the calm sentence is shown; it goes when the window is opened again. */
export function useStaleWindow(): { stale: boolean; markStale: () => void; clearStale: () => void } {
  const [stale, setStale] = useState(false);
  const markStale = useCallback(() => setStale(true), []);
  const clearStale = useCallback(() => setStale(false), []);
  return { stale, markStale, clearStale };
}
