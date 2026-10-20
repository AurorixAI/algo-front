/**
 * Russian plurals, one helper for the project: `pluralRu(n, "ученик", "ученика", "учеников")`.
 * 1 ученик / 2 ученика / 5 учеников / 11 учеников / 21 ученик / 22 ученика / 0 учеников.
 * The three forms may also come as one tuple: `pluralRu(n, ["ученик", "ученика", "учеников"])`.
 * A negative number counts by its absolute value; NaN / Infinity count as 0.
 */
export function pluralRu(n: number, forms: readonly [string, string, string]): string;
export function pluralRu(n: number, one: string, few: string, many: string): string;
export function pluralRu(n: number, oneOrForms: string | readonly [string, string, string], few?: string, many?: string): string {
  const [one, fewForm, manyForm] = typeof oneOrForms === "string"
    ? [oneOrForms, few ?? oneOrForms, many ?? few ?? oneOrForms]
    : oneOrForms;
  const value = Number.isFinite(n) ? Math.abs(Math.trunc(n)) : 0;
  const tail = value % 100;
  const last = value % 10;
  if (tail >= 11 && tail <= 14) return manyForm;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return fewForm;
  return manyForm;
}
