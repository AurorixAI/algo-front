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
