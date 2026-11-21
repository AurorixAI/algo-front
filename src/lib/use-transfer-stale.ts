import { useCallback } from "react";

/**
 * ONE answer to the refusal of a transfer whose money changed after the probe (409 `BALANCE_CHANGED`, «Сумма изменилась, откройте окно заново»):
 * the window of the transfer has closed itself, the screen reads its data again and says the words of the server.  Every screen that opens a transfer passes the result as `onStale`.
 */
export function useTransferStale(reload: () => void, showToast: (message: string, type: "error") => void): (message: string) => void {
  return useCallback((message: string) => { reload(); showToast(message, "error"); }, [reload, showToast]);
}
