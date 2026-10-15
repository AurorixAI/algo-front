/**
 * One calm palette for every status / deadline chip of the admin screens (excuses, payments):
 * grey = nothing to do yet, amber = soon, red = overdue or used up.  No React here, so node:test
 * can load this file directly.
 */
export type ChipTone = "neutral" | "warn" | "danger";

export const CHIP_TONE_CLASS: Record<ChipTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};
