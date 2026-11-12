/**
 * One calm palette for every status / deadline chip of the admin screens (excuses, payments):
 * grey = nothing to do yet, amber = soon, red = overdue or used up.  No React here, so node:test
 * can load this file directly.
 */
export type ChipTone = "neutral" | "warn" | "danger" | "ok" | "info" | "violet" | "muted";

export const CHIP_TONE_CLASS: Record<ChipTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
  // warning = a decision or an action is needed; danger = overdue / error; ok = done; info = an explanation, nothing to do (design system, wave 2: the roles, not the palettes)
  warn: "border-warning-200 bg-warning-50 text-warning-900",
  danger: "border-danger-200 bg-danger-50 text-danger-700",
  ok: "border-success-200 bg-success-50 text-success-800",
  info: "border-info-200 bg-info-50 text-info-900",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  muted: "border-slate-200 bg-slate-50 text-slate-600",
};

/**
 * THE one table of tones of a chip.  Every screen's own «state -> look» table is a `Record<State, ChipTone>` or reads this one (`toneClass`), so no screen invents a palette:
 * a STATUS (it changes) is a pill (`StatusChip`), an attribute (it stays) a 6 px rectangle (`Tag`).
 */
export const toneClass = (tone: ChipTone): string => CHIP_TONE_CLASS[tone];

/** The two sizes of a chip and its two shapes: a small label in a row (`md`), a smaller one inside a cell (`sm`), a rounded rectangle or a pill. */
export type ChipSize = "sm" | "md" | "lg";
export const CHIP_SIZE_CLASS: Record<ChipSize, string> = {
  sm: "px-1.5 py-px text-xs font-semibold leading-4",
  md: "px-2 py-0.5 text-xs font-semibold leading-4",
  lg: "px-3 py-1.5 text-sm font-semibold",
};

/** `border` + palette + size + shape: the ONE class string of a chip (the `<Chip>` component and any plain element that cannot be one). */
export function chipClass(input: { tone?: ChipTone; size?: ChipSize; pill?: boolean } = {}): string {
  const { tone = "neutral", size = "md", pill = false } = input;
  return `inline-block max-w-full whitespace-nowrap ${pill ? "rounded-full" : "rounded-tag"} border ${CHIP_TONE_CLASS[tone]} ${CHIP_SIZE_CLASS[size]}`;
}

/**
 * One size for every chip of the attendance tabs (deadline of an excuse, state of an open lesson):
 * same padding, radius and type; only the tone differs.  A long text wraps inside the column.
 */
export const CHIP_BASE_CLASS = "inline-block max-w-full whitespace-nowrap rounded-tag border px-2 py-0.5 text-left text-xs font-medium leading-4";
