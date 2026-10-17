import type { ReactNode } from "react";

/**
 * One size for every status badge and every action button of the diagnostics list (admin) and of the
 * diagnostics block of the student card, so rows line up and do not jump when a status changes (#102).
 *
 * Badge: 28 px high, a pill, 12 px / medium, one width slot.  Action: 32 px high, one width slot, so
 * «Отчёт», «Профиль» and «Ссылка» are the same size.  Both slots are fixed from `sm` up; on a phone
 * they take the whole line instead, so nothing overflows and the label never has to be cut.
 * No client hooks here: node:test renders the badge directly.
 */

/** The slot of a status badge: the longest label («Ожидает подтверждения», «Ожидает прохождения») fits in it. */
export const DIAGNOSTIC_BADGE_WIDTH = "w-full sm:w-52";
/** The slot of an action button («Отчёт», «Профиль», «Ссылка», «Скопировано»). */
export const DIAGNOSTIC_ACTION_WIDTH = "w-full sm:w-36";
/** Actions column of a list row: badge slot + gap + action slot, fixed from `lg` up so rows do not jump. */
export const DIAGNOSTIC_ACTIONS_COLUMN = "flex w-full flex-wrap items-center gap-2 lg:w-[22.5rem] lg:shrink-0 lg:flex-nowrap";

const BADGE_BASE =
  "inline-flex h-7 max-w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium leading-none";
const ACTION_BASE =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors";

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
  return <span aria-hidden="true" className="hidden h-8 w-36 shrink-0 lg:block" />;
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
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
