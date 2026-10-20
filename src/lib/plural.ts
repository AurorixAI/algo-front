/**
 * Russian plural: 1 день, 2 дня, 5 дней, 11 дней, 21 день.  One helper for the whole project
 * (`pluralRu(n, one, few, many)`); the sign and the fraction of `n` are ignored.
 */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const value = Number.isFinite(n) ? Math.abs(Math.trunc(n)) : 0;
  const tail = value % 100;
  const last = value % 10;
  if (tail >= 11 && tail <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
