/**
 * WC-C (PERF-2): the administrator's list of diagnostic invites is read in pages of 100.  The page filters and counts over the
 * WHOLE list (the counters «Всего / Ожидают / Проходят», the period, the search), so the list is still loaded in full, but
 *  - the pages after the first are asked in parallel batches (the total is known after the first answer), in order;
 *  - the 15 s refresh of a visible tab asks only the FIRST page (the newest invites; the server sorts by creation, newest first)
 *    and lays it over the list in hand; the whole list is read again at the opening and then at most every 2 minutes.
 * A centre whose whole list fits one page (up to 100 invites) is unchanged: every refresh is the whole list.
 */

export interface PagedResponse<T> {
  items: T[];
  total: number;
  limit?: number;
  offset?: number;
}

/** How many pages are in flight at once. */
export const PAGE_CONCURRENCY = 4;
/** The whole list is re-read at least this often while the tab is visible; in between only the first page. */
export const FULL_REFRESH_MS = 120_000;

/**
 * Reads every page.  `fetchPage(offset)` answers a page or (during a rolling update of the auth-service) the former bare array,
 * which is returned as it is.  The result keeps the server's order; an item that moved to another page while the pages were read
 * (a new invite shifts the offsets) is kept once.  One failing page fails the whole read, as before.
 */
export async function loadAllPages<T>(
  fetchPage: (offset: number) => Promise<PagedResponse<T> | T[]>,
  idOf: (item: T) => string,
  concurrency: number = PAGE_CONCURRENCY,
): Promise<T[]> {
  const first = await fetchPage(0);
  if (Array.isArray(first)) return first;
  const items: T[] = Array.isArray(first.items) ? [...first.items] : [];
  const total = Number(first.total) || 0;
  const step = items.length;                       // the page size the server really answers with
  let offset = step;
  while (step > 0 && offset < total) {
    const offsets: number[] = [];
    for (let at = offset; at < total && offsets.length < concurrency; at += step) offsets.push(at);
    const pages = await Promise.all(offsets.map((at) => fetchPage(at)));
    for (let i = 0; i < pages.length; i += 1) {
      const page = pages[i];
      if (Array.isArray(page)) return page;
      const pageItems = Array.isArray(page.items) ? page.items : [];
      if (pageItems.length === 0) return dedupeById(items, idOf);
      items.push(...pageItems);
      offset = offsets[i] + pageItems.length;
      // a page shorter than it should be: the rest of this batch was asked for offsets that no longer fit, so read on from `offset`
      if (pageItems.length < Math.min(step, total - offsets[i])) break;
    }
  }
  return dedupeById(items, idOf);
}

function dedupeById<T>(items: T[], idOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const id = idOf(item);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
}

/**
 * The list in hand with the first page laid over it: the page first (the newest, as the server sorted them), then the older items
 * in hand that the page does not contain.  When the page holds the whole list (`total` is not more than its size) it IS the list.
 */
export function mergeFirstPage<T>(held: ReadonlyArray<T>, firstPage: ReadonlyArray<T>, total: number, idOf: (item: T) => string): T[] {
  if (total <= firstPage.length) return [...firstPage];
  const fresh = new Set(firstPage.map(idOf));
  return [...firstPage, ...held.filter((item) => !fresh.has(idOf(item)))];
}

/** What the next refresh reads: the whole list at the opening and when it is older than {@link FULL_REFRESH_MS}, else the first page. */
export function refreshKind(now: number, lastFullAt: number | null): "full" | "head" {
  return lastFullAt === null || now - lastFullAt >= FULL_REFRESH_MS ? "full" : "head";
}
