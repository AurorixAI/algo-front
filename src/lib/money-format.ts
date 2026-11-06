// How a sum of money is written: THE one place (WAVE E, DUP-6).  Thousands are separated by a NON-BREAKING space, so an amount never wraps in the middle
// and a form that is filled in programmatically holds the same characters as the one the person types into (`reformatMoneyTyping`).
// A leaf module (no imports): `payments.ts`, `payf.ts` and the logic files all read it without a cycle.

export const NBSP = " ";

export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 450000 -> «450 000 сум» (non-breaking spaces: the amount never wraps in the middle). */
export function formatMoney(value: number | null | undefined): string {
  const amount = Math.round(Number(value) || 0);
  const sign = amount < 0 ? "-" : "";
  return `${sign}${groupDigits(String(Math.abs(amount)))}${NBSP}сум`;
}

/** «−16 666 сум» / «+4 000 сум» (a real minus sign): the ONE way a change of a sum is written. */
export function formatSignedMoney(delta: number): string {
  return `${delta < 0 ? "−" : "+"}${formatMoney(Math.abs(delta))}`;
}

/** Amount for an input field: thousands separated, no unit. */
export function formatMoneyInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
  return groupDigits(String(Math.max(0, Math.round(Number(value)))));
}

/**
 * Re-audit В5 / §5.1-четв: a sentence that came from the SERVER (or was put together out of pieces) is written with ordinary spaces, so «360 000 сум» could break between «360» and «000».  ONE function for every screen:
 * a space inside a run of digit groups («1 200 000»), before «сум» and between a surname and its initial («Мирзаева Л.») becomes non-breaking.  Nothing else is touched, and a text without such places is returned as is.
 */
export function tidyMoneyText<T extends string | null | undefined>(text: T): T {
  if (typeof text !== "string" || text === "") return text;
  const tidy = text
    .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NBSP}`)
    .replace(/(\d)[ \u202f](?=сум)/g, `$1${NBSP}`)
    .replace(/(\d)\u202f(?=\d{3}(?!\d))/g, `$1${NBSP}`)
    .replace(/([А-ЯЁ][а-яё]+) (?=[А-ЯЁ]\.)/g, `$1${NBSP}`);
  return tidy as T;
}
