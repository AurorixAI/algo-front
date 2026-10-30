/**
 * The phone's bottom bar (under 768 px): four sections of the role plus «Ещё».
 *
 * The four are picked from the role's menu by one priority list per role (daily work first); they keep the order of
 * the menu, so the phone and the desktop read the same way.  Everything else goes to the «Ещё» sheet, and the counters
 * of those items are summed on the «Ещё» icon.  An item the role does not have (the administrator without the payments
 * right) is simply skipped and the next one by priority takes its place.
 *
 *  - owner: Панель, Группы, Ученики, Оплаты.  The home screen, the two lists everything starts from, and the money
 *    with its «требуют оплаты» counter.  «Посещаемость» (excuses have a deadline measured in days, not minutes) and «Замены»
 *    (LOGIC-B2) are in «Ещё» and their counters ride on that icon; «Зарплата» is monthly and «Сотрудники» rare.
 *  - admin: Диагностика (the administrator's home), Ученики, Группы, Оплаты.  Same idea as the owner's.  An administrator
 *    without the payments right gets «Посещаемость» in that slot instead (its counter then stays on the bar).
 *    «Экзамены» are made and run by teachers and wait in «Ещё».
 *  - teacher: all four sections of the menu fit (Дашборд, Расписание, Экзамены, Группы); «Ещё» holds the quick
 *    «Создать экзамен», settings and sign-out.
 */

export const BOTTOM_NAV_SLOTS = 4;

/** Most important first. */
export const BOTTOM_NAV_PRIORITY: Record<"owner" | "admin" | "teacher", readonly string[]> = {
  owner: ["/owner/dashboard", "/owner/groups", "/owner/students", "/owner/payments", "/owner/attendance", "/owner/substitutions", "/owner/payroll", "/owner/teachers"],
  admin: ["/admin/students", "/admin/groups", "/admin/payments", "/admin/diagnostics", "/admin/attendance", "/admin/substitutions", "/admin/exams", "/admin/teachers"],
  teacher: ["/teacher/dashboard", "/teacher/schedule", "/teacher/groups", "/teacher/exams"],
};

/** Split a role's menu: the items for the bar (in menu order) and the rest for «Ещё» (in menu order). */
export function splitBottomNav<T extends { href: string }>(
  items: readonly T[],
  priority: readonly string[],
  slots: number = BOTTOM_NAV_SLOTS,
): { bar: T[]; more: T[] } {
  const rank = (item: T) => {
    const index = priority.indexOf(item.href);
    return index < 0 ? priority.length : index;
  };
  // Stable by menu position: sort a copy of the indexes by (rank, position), take `slots`, then restore the menu order.
  const chosen = new Set(
    items
      .map((item, position) => ({ item, position, rank: rank(item) }))
      .sort((a, b) => a.rank - b.rank || a.position - b.position)
      .slice(0, Math.max(0, slots))
      .map((entry) => entry.item),
  );
  return { bar: items.filter((item) => chosen.has(item)), more: items.filter((item) => !chosen.has(item)) };
}

/** How long the bar waits for the payments summary before it shows what it knows (a slow or failing request must not hide the menu). */
export const BOTTOM_BAR_WAIT_MS = 2500;

/**
 * Is the bar still a skeleton?  The administrator's four slots depend on one fact the page learns from the payments
 * summary (does this administrator see the payments?), so the bar is drawn only once that is known: the sections never
 * swap places under the thumb.  The owner (always sees payments) and the teacher (never) know it from the first paint;
 * after `BOTTOM_BAR_WAIT_MS` the bar is drawn with what is known, so a failing request cannot hide the menu.
 */
export function bottomBarPending(input: { role: "owner" | "admin" | "teacher"; demo: boolean; summaryLoaded: boolean; gaveUp: boolean }): boolean {
  return input.role === "admin" && !input.demo && !input.summaryLoaded && !input.gaveUp;
}

/** The menu item (or one of its sub-pages) is the open page. */
export function isNavActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sum of the counters of the items hidden in «Ещё» (shown on its icon). */
export function moreBadgeTotal(more: ReadonlyArray<{ badge?: number }>): number {
  return more.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.badge) || 0)), 0);
}
