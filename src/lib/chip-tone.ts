/**
 * One calm palette for every status / deadline chip of the admin screens (excuses, payments):
 * grey = nothing to do yet, amber = soon, red = overdue or used up.  No React here, so node:test
 * can load this file directly.
 */
export type ChipTone = "neutral" | "warn" | "danger" | "ok" | "info" | "violet" | "muted";

export const CHIP_TONE_CLASS: Record<ChipTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  // IA audit F14: the rest of the palette the screens had typed by hand (about seventy inline strings)
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  muted: "border-slate-200 bg-slate-50 text-slate-500",
};

/** The two sizes of a chip and its two shapes: a small label in a row (`md`), a smaller one inside a cell (`sm`), a rounded rectangle or a pill. */
export type ChipSize = "sm" | "md" | "lg";
export const CHIP_SIZE_CLASS: Record<ChipSize, string> = {
  sm: "px-1.5 py-px text-[11px] font-semibold leading-4",
  md: "px-2 py-0.5 text-xs font-semibold leading-4",
  lg: "px-3 py-1.5 text-sm font-semibold",
};

/** `border` + palette + size + shape: the ONE class string of a chip (the `<Chip>` component and any plain element that cannot be one). */
export function chipClass(input: { tone?: ChipTone; size?: ChipSize; pill?: boolean } = {}): string {
  const { tone = "neutral", size = "md", pill = false } = input;
  return `inline-block max-w-full ${pill ? "rounded-full" : "rounded-md"} border ${CHIP_TONE_CLASS[tone]} ${CHIP_SIZE_CLASS[size]}`;
}

/**
 * One size for every chip of the attendance tabs (deadline of an excuse, state of an open lesson):
 * same padding, radius and type; only the tone differs.  A long text wraps inside the column.
 */
export const CHIP_BASE_CLASS = "inline-block max-w-full rounded-md border px-2 py-0.5 text-left text-xs font-medium leading-4";
