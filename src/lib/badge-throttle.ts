/**
 * WC-C (PERF-1, decision of the lead): the badges of the owner's/administrator's menu («Посещаемость», «Замены») are refreshed
 * when the page changes (a person who goes through the menu sees a fresh count), but not more often than once in 30 s: the
 * throttle is by the time of the last SUCCESSFUL read of the counter (any read: this one, the tab coming back, the 5-minute
 * timer, an action's `refresh(true)`, the page that publishes the number), not by the path.  A failed read leaves the old time,
 * so the next page change asks again.
 */
export const BADGE_PAGE_CHANGE_MIN_AGE_MS = 30_000;

/** True when the counter was never read or its last successful read is at least 30 s old. */
export function isBadgeStale(lastOkAt: number, now: number): boolean {
  return !lastOkAt || now - lastOkAt >= BADGE_PAGE_CHANGE_MIN_AGE_MS;
}

export interface ThrottledBadgeStore {
  getState: () => { lastOkAt: number; refresh: (force?: boolean) => Promise<void> };
}

/** The refresh a change of page asks for: every counter whose last successful read is stale. */
export function refreshBadgesOnPageChange(stores: ReadonlyArray<ThrottledBadgeStore>, now: number): void {
  for (const store of stores) {
    const { lastOkAt, refresh } = store.getState();
    if (isBadgeStale(lastOkAt, now)) void refresh();
  }
}
