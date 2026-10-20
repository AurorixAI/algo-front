/** Text of a menu counter: nothing for 0, the number up to 99, «99+» above (the pill stays small). */
export const NAV_BADGE_CAP = 99;

export function navBadgeText(count: number | null | undefined): string {
  const n = Math.floor(Number(count) || 0);
  if (n <= 0) return "";
  return n > NAV_BADGE_CAP ? `${NAV_BADGE_CAP}+` : String(n);
}
