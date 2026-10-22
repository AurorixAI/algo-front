import type { ReactNode } from "react";

/**
 * One size for every status badge and every action button of the diagnostics list (admin) and of the
 * diagnostics block of the student card, so rows line up and do not jump when a status changes (#102).
 *
 * Badge and action: the same compact slot (9.5 rem = 152 px) and the same height (h-8 = 32 px), 14 px / medium.
 * The slot was measured, not guessed: Inter 500 at 14 px, the widest label («Готов к началу») is 104 px, plus the
 * dot (6) + gap (6) + padding (2 x 12) + border (2) = 142 px, so 152 px leaves 10 px to spare.  A label longer than
 * ~110 px does not widen every pill - it is shortened («Ожидает», «Не начата»).  The slot is the same on a phone;
 * there the badge and the action stand left-aligned under the name block instead of stretching.
 * No client hooks here: node:test renders the badge directly.
 */

/** The one width slot of every badge and every action (and of the empty placeholder). */
export const DIAGNOSTIC_PILL_WIDTH = "w-[9.5rem]";
/** The slot of a status badge. */
export const DIAGNOSTIC_BADGE_WIDTH = DIAGNOSTIC_PILL_WIDTH;
/** The slot of an action button («Отчёт», «Профиль», «Ссылка», «Скопировано»). */
export const DIAGNOSTIC_ACTION_WIDTH = DIAGNOSTIC_PILL_WIDTH;
/** Actions column of a list row: badge + gap-2 + action, as wide as its content (no stretching); under the name block below `lg`. */
export const DIAGNOSTIC_ACTIONS_COLUMN = "flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:flex-nowrap";

const BADGE_BASE =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium leading-none";
const ACTION_BASE =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors";

export type DiagnosticActionTone = "primary" | "neutral" | "solid";

const ACTION_TONE: Record<DiagnosticActionTone, string> = {
  primary: "bg-primary-50 text-primary-700 hover:bg-primary-100",
  neutral: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  solid: "bg-gradient-to-r from-primary-600 to-indigo-600 font-semibold text-white shadow-sm shadow-primary-600/20 hover:from-primary-700 hover:to-indigo-700",
};

/** className of an action link / button: same height and width everywhere, only the tone differs. */
export function diagnosticActionClass(tone: DiagnosticActionTone = "primary"): string {
  return `${ACTION_BASE} ${DIAGNOSTIC_ACTION_WIDTH} ${ACTION_TONE[tone]}`;
}

/** Empty action slot: keeps the badge column of a row without an action in line with the other rows. */
export function DiagnosticActionSpacer() {
  return <span aria-hidden="true" className={`hidden h-8 shrink-0 lg:block ${DIAGNOSTIC_PILL_WIDTH}`} />;
}

/** Status of an invite: a dot and a label in a fixed-size pill. `tone` is the colour classes (border, background, text). */
export function DiagnosticStatusBadge({
  tone,
  dot,
  children,
  testId,
}: {
  tone: string;
  dot: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span data-testid={testId} className={`${BADGE_BASE} ${DIAGNOSTIC_BADGE_WIDTH} ${tone}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 truncate" title={typeof children === "string" ? children : undefined}>{children}</span>
    </span>
  );
}
