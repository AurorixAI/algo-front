/**
 * All the pending excuses of the period, not one page of them.
 *
 * The urgency order of the «Ожидают» tab («Срок прошёл 31 день назад» first) only means something over the WHOLE queue:
 * the server pages by lesson date, so a page of 50 can hold the freshest lessons and hide the one whose deadline passed
 * a month ago.  So this tab reads the queue in the biggest pages the API allows and the screen sorts what it got.  A queue
 * longer than the cap (500) is read from its OLD end (the server lists the newest lesson first), where the deadlines
 * that have passed are, and the screen says how many are not shown.  Decided tabs keep ordinary paging.
 * No React and no network here: the page reader is passed in, so node:test can drive it.
 */

/** The largest `limit` the excuses API accepts. */
export const PENDING_PAGE_LIMIT = 200;
/** How many pending excuses the screen holds at most. */
export const PENDING_CAP = 500;

export interface ExcusePage<T> {
  items?: T[] | null;
  total?: number | null;
  pending_total?: number | null;
}

export interface AllPending<T> {
  items: T[];
  /** What the server says there are in the period. */
  total: number;
  pendingTotal: number;
  /** Some of the queue (the newest lessons) is not on screen because it is longer than the cap. */
  hidden: number;
}

export async function loadAllPending<T extends { id: string }>(
  readPage: (limit: number, offset: number) => Promise<ExcusePage<T>>,
  options: { cap?: number; pageLimit?: number } = {},
): Promise<AllPending<T>> {
  const cap = Math.max(1, options.cap ?? PENDING_CAP);
  const pageLimit = Math.max(1, Math.min(options.pageLimit ?? PENDING_PAGE_LIMIT, cap));
  const first = await readPage(pageLimit, 0);
  const total = Math.max(0, Number(first.total) || 0);
  const pendingTotal = Math.max(0, Number(first.pending_total) || 0);
  const firstItems = first.items ?? [];
  if (total <= firstItems.length) return { items: firstItems, total, pendingTotal, hidden: 0 };

  // From where to read: the beginning, or (a queue over the cap) the last `cap` rows, the oldest lessons.
  const start = Math.max(0, total - cap);
  const offsets: number[] = [];
  for (let offset = start; offset < total; offset += pageLimit) offsets.push(offset);
  const pages = await Promise.all(offsets.map((offset) => (offset === 0 ? Promise.resolve(first) : readPage(pageLimit, offset))));
  const seen = new Set<string>();
  const items: T[] = [];
  for (const page of pages) {
    for (const item of page.items ?? []) {
      if (seen.has(item.id)) continue; // the queue moved between two reads: the same row twice
      seen.add(item.id);
      items.push(item);
    }
  }
  return { items, total, pendingTotal, hidden: Math.max(0, total - items.length) };
}
