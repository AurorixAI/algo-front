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

export interface PendingRead {
  offset: number;
  limit: number;
}

export interface PendingPlan {
  /** Rows of the FIRST page that belong to the window (everything from this index on); the rest of that page is not needed. */
  keepFirstFrom: number;
  /** The other requests, and only those: the rest of the window, in balanced pages of at most `pageLimit`. */
  reads: PendingRead[];
  /** Rows of the newest lessons the cap leaves out. */
  hidden: number;
}

/**
 * What to read once the first page has said how long the queue is.  The window is the last `cap` rows (the whole queue
 * when it is shorter).  Rows of the first page that fall inside it are KEPT, and only the rest of the window is requested,
 * split evenly into as few pages as the API allows - so no row is read twice, and a request is spent only when it brings
 * rows that are needed: 450 rows = the first page + 2 requests; 600 = the first page + 2; 1200 = 3 for the old end (the
 * first page was the question «how long is it», its rows are not in the window).
 */
export function planPendingReads(input: { total: number; firstLength: number; cap?: number; pageLimit?: number }): PendingPlan {
  const cap = Math.max(1, input.cap ?? PENDING_CAP);
  const pageLimit = Math.max(1, Math.min(input.pageLimit ?? PENDING_PAGE_LIMIT, cap));
  const total = Math.max(0, Math.trunc(input.total) || 0);
  const firstLength = Math.max(0, Math.min(Math.trunc(input.firstLength) || 0, total));
  const start = Math.max(0, total - cap);
  const needFrom = Math.max(start, firstLength);
  const reads: PendingRead[] = [];
  const missing = total - needFrom;
  if (missing > 0) {
    const pages = Math.ceil(missing / pageLimit);
    const size = Math.ceil(missing / pages);
    for (let offset = needFrom; offset < total; offset += size) reads.push({ offset, limit: Math.min(size, total - offset) });
  }
  const keepFirstFrom = start < firstLength ? start : firstLength;
  return { keepFirstFrom, reads, hidden: start };
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

  const plan = planPendingReads({ total, firstLength: firstItems.length, cap, pageLimit });
  const pages = await Promise.all(plan.reads.map(({ offset, limit }) => readPage(limit, offset)));
  const seen = new Set<string>();
  const items: T[] = [];
  // The screen sorts by urgency anyway: the order here is only the order of reading.
  for (const rows of [firstItems.slice(plan.keepFirstFrom), ...pages.map((page) => page.items ?? [])]) {
    for (const item of rows) {
      if (seen.has(item.id)) continue; // the queue moved between two reads: the same row twice
      seen.add(item.id);
      items.push(item);
    }
  }
  return { items, total, pendingTotal, hidden: Math.max(0, total - items.length) };
}

// ── after one decision: patch the queue in place instead of reading it all again ──────────────────────

export interface QueueState<T> {
  items: T[];
  /** Rows of the open tab (all pages). */
  total: number;
  /** The number on the «Ожидают» tab. */
  pendingTotal: number;
}

/**
 * The queue after the server answered a decision (or a reset) with the changed item.  An item that is still in the open
 * tab is replaced in place; one that moved to another tab (a pending excuse that was decided; a decided one that was reset)
 * leaves the list and the counters follow.  Returns null when the answer cannot be trusted (no id / status) or the row is not
 * on screen - then the caller reads the list again.
 */
export function applyItemChange<T extends { id: string; status: string }>(
  state: QueueState<T>,
  updated: unknown,
  openTab: string,
): QueueState<T> | null {
  const next = updated as Partial<T> | null | undefined;
  if (!next || typeof next.id !== "string" || typeof next.status !== "string") return null;
  const before = state.items.find((item) => item.id === next.id);
  if (!before) return null;
  if (next.status === openTab) {
    return { ...state, items: state.items.map((item) => (item.id === next.id ? { ...item, ...(next as T) } : item)) };
  }
  const pendingShift = (before.status === "pending" ? -1 : 0) + (next.status === "pending" ? 1 : 0);
  return {
    items: state.items.filter((item) => item.id !== next.id),
    total: Math.max(0, state.total - 1),
    pendingTotal: Math.max(0, state.pendingTotal + pendingShift),
  };
}
