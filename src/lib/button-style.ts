/**
 * The look of a button, in one pure place (no React: node:test loads it, and a link that must look like a button uses the same classes).  Rules of the design system, wave 1:
 *  - four variants: `primary` (the one main action of a screen or a window, a FLAT blue fill), `secondary` (white with a frame), `ghost` (no frame: «Отмена», an action in a row), `danger` (rose: only for what cannot be taken back);
 *    there is no green button - green is a STATE («оплачено»), never an action;
 *  - sizes: `sm` 32 px (40 on a phone), `md` 40 px (44 on a phone in the cabinets of a teacher and a student), `lg` 48 px, `icon` a 40 px square for an icon alone;
 *  - no gradient, no shadow, no glow, no scale: only the colour changes on hover;
 *  - one focus ring for the keyboard (`focus-visible`, 2 px, offset 2), a disabled button is grey on grey (never a pale version of its colour).
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const BASE = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed";

export const BUTTON_VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-primary-600 text-white hover:bg-primary-700 disabled:bg-slate-200 disabled:text-slate-500",
  secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-400 disabled:hover:bg-transparent",
  danger: "bg-danger-600 text-white hover:bg-danger-700 disabled:bg-slate-200 disabled:text-slate-500",
};

export const BUTTON_SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "min-h-control-sm max-md:min-h-control-sm-touch px-3 py-1.5 text-sm",
  md: "min-h-control max-md:min-h-control-touch px-4 py-2 text-sm",
  lg: "min-h-control-lg px-6 py-3 text-base",
  // an icon alone (a pager arrow, a close cross): a 40 px square, 44 on a phone in the cabinets of a teacher and a student; its name is the `aria-label`
  icon: "h-control w-control max-md:h-control-touch max-md:w-control-touch p-0",
};

export function buttonClass(input: { variant?: ButtonVariant; size?: ButtonSize } = {}): string {
  const { variant = "primary", size = "md" } = input;
  return `${BASE} ${BUTTON_VARIANT_CLASS[variant]} ${BUTTON_SIZE_CLASS[size]}`;
}
