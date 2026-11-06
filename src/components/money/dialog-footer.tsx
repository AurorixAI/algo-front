"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

/** The footer layout of a window that carries the line «почему» over its buttons (the shared `Modal` puts the footer row under the divider). */
export const CONFIRM_FOOTER_CLASS = "flex flex-col gap-2 p-5 sm:p-6 pt-4 mt-3";

/**
 * Re-audit В1 (06.11): the buttons of EVERY window of money look the same - the main one is a FLAT blue (or red) fill: no gradient, no glow, one line of text, 40 px (44 on a phone); «Отмена» is a plain
 * text button without a frame.  The focus ring is the keyboard's (`focus-visible`) and the same everywhere (2 px, offset 2): a window opened with the mouse has none.
 */
const CONFIRM_FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2";
export const CONFIRM_PRIMARY_CLASS = `inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10 ${CONFIRM_FOCUS}`;
export const CONFIRM_PRIMARY_BLUE = "bg-primary-600 hover:bg-primary-700";
export const CONFIRM_PRIMARY_DANGER = "bg-red-600 hover:bg-red-700";
export const CONFIRM_CANCEL_CLASS = `inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 sm:min-h-10 ${CONFIRM_FOCUS}`;

/** The width of a window of money: the QUESTION (one sentence and two buttons) is 448, a window with a form, a list or a table is 520 (re-audit Н9). */
export const MONEY_WINDOW_QUESTION = "max-w-md";
export const MONEY_WINDOW_FORM = "max-w-[520px]";

/** What the secondary button of a window says: «Отмена» - and «Не отменять» when the main one starts with «Отменить…» (UX pack, rule 3). */
export function cancelLabelFor(primaryLabel: string): string {
  return /^Отменить/.test(primaryLabel) ? "Не отменять" : "Отмена";
}

/**
 * UX pack, rule 3 - the footer of a window of confirmation, one for every window that moves money:
 *  - the MAIN button names the action (and the sum, where there is one): «Внести 400 000 сум», «Записать выплату 757 500 сум», «Включить в зарплату»;
 *  - the secondary one is always «Отмена» («Не отменять» when the main one starts with «Отменить…»);
 *  - red is for what cannot be taken back for money (cancelling a payment, deleting); a reversible action is blue;
 *  - a main button that is off ALWAYS has the line «почему» over the footer (`why`) - never a mute disabled button.
 * `submitFor`: the id of the `<form>` the main button sends (a window with a form); without it the button calls `onPrimary`.
 */
export function ConfirmFooter({
  primary, onPrimary, submitFor, tone = "primary", disabled = false, busy = false, why = null, whyId = "confirm-why", onCancel, cancelLabel, cancelDisabled, testId, icon, extra,
}: {
  primary: string;
  onPrimary?: () => void;
  submitFor?: string;
  tone?: "primary" | "danger";
  disabled?: boolean;
  busy?: boolean;
  /** Why the main button is off (shown over the buttons while it is off). */
  why?: string | null;
  /** The `id` and `data-testid` of that line (the button points at it with `aria-describedby`). */
  whyId?: string;
  onCancel: () => void;
  cancelLabel?: string;
  cancelDisabled?: boolean;
  testId?: string;
  icon?: ReactNode;
  /** A line over the buttons that is not a reason (a note of the window that has to stay by the button). */
  extra?: ReactNode;
}) {
  const off = disabled || busy;
  const color = tone === "danger" ? CONFIRM_PRIMARY_DANGER : CONFIRM_PRIMARY_BLUE;
  return (
    <>
      {disabled && !busy && why && <p id={whyId} data-testid={whyId} className="text-xs text-slate-600 sm:text-right">{why}</p>}
      {extra}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <button type="button" onClick={onCancel} disabled={cancelDisabled ?? busy} data-testid="confirm-cancel" className={CONFIRM_CANCEL_CLASS}>
          {cancelLabel ?? cancelLabelFor(primary)}
        </button>
        <button
          type={submitFor ? "submit" : "button"}
          form={submitFor}
          onClick={submitFor ? undefined : onPrimary}
          disabled={off}
          data-testid={testId}
          aria-describedby={disabled && why ? whyId : undefined}
          className={`${CONFIRM_PRIMARY_CLASS} ${color}`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
          {primary}
        </button>
      </div>
    </>
  );
}
