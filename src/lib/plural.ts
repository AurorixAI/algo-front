/**
 * The one Russian plural of the project.  «1 день / 2 дня / 5 дней / 11 дней / 21 день / 22 дня / 0 дней».
 * Both call shapes work, so every older call site keeps its form:
 *   pluralRu(n, "день", "дня", "дней")
 *   pluralRu(n, ["день", "дня", "дней"])
 * A fractional or non-finite count is read as a whole number (NaN, Infinity: the «many» form).
 * No React and no network here, so node:test can load this file directly.
 */

export type PluralForms = readonly [one: string, few: string, many: string];

export function pluralRu(count: number, forms: PluralForms): string;
export function pluralRu(count: number, one: string, few: string, many: string): string;
export function pluralRu(count: number, first: PluralForms | string, few?: string, many?: string): string {
  const [one, middle, rest]: PluralForms = typeof first === "string" ? [first, few ?? first, many ?? few ?? first] : first;
  const n = Number.isFinite(count) ? Math.abs(Math.trunc(count)) : 0;
  const tail = n % 100;
  const last = n % 10;
  if (tail >= 11 && tail <= 14) return rest;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return middle;
  return rest;
}

/** «день» / «дня» / «дней» for the count. */
export function daysWord(count: number): string {
  return pluralRu(count, "день", "дня", "дней");
}

/** «1 день», «3 дня», «31 день», «11 дней». */
export function daysLabel(count: number): string {
  return `${count} ${daysWord(count)}`;
}
