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

/**
 * One size for every chip of the attendance tabs (deadline of an excuse, state of an open lesson):
 * same padding, radius and type; only the tone differs.  A long text wraps inside the column.
 */
export const CHIP_BASE_CLASS = "inline-block max-w-full rounded-md border px-2 py-0.5 text-left text-xs font-medium leading-4";
