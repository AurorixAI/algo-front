/**
 * «Назад» of the receipt page.  Pure rules plus a tiny sessionStorage mark; no React, so node:test can load this file.
 *
 * `history.back()` is right only when the user came from inside the app.  A receipt opened from a link in a new tab,
 * or pasted into a tab, has no history of ours (length <= 1) or a previous page that is not ours (back would leave
 * the app): there «Назад» goes to the payments page of the role.  `document.referrer` does not change on client-side
 * navigation, so the history row that opens a receipt leaves a mark, and a mark counts as "came from the app".
 */

const MARK_KEY = "algo-receipt-from-app";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStore(): Store | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null; // private mode / blocked storage: the mark is only a hint
  }
}

/** Called right before the app opens a receipt of `paymentId`. */
export function markReceiptNavigation(paymentId: string, store: Store | null = defaultStore()): void {
  try { store?.setItem(MARK_KEY, paymentId); } catch { /* a hint only */ }
}

export function receiptNavigationMarked(paymentId: string, store: Store | null = defaultStore()): boolean {
  try { return store?.getItem(MARK_KEY) === paymentId; } catch { return false; }
}

export function clearReceiptNavigationMark(store: Store | null = defaultStore()): void {
  try { store?.removeItem(MARK_KEY); } catch { /* a hint only */ }
}

export function isSameOriginReferrer(referrer: string | null | undefined, origin: string): boolean {
  if (!referrer || !origin) return false;
  return referrer === origin || referrer.startsWith(`${origin}/`);
}

/** True when `history.back()` stays inside the app. */
export function canGoBack(input: { historyLength: number; referrer: string | null | undefined; origin: string; cameFromApp: boolean }): boolean {
  if (!(input.historyLength > 1)) return false;
  return input.cameFromApp || isSameOriginReferrer(input.referrer, input.origin);
}
