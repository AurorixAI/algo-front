import type { ReactNode, Ref } from "react";
import { Button } from "@/components/ui/button";

/** The layout of the footer row of a window that ends with `ModalActions` (the shared `Modal` puts the footer under the divider; the line «почему» sits over the buttons, so the footer is a column). */
export { MODAL_ACTIONS_FOOTER_CLASS } from "@/lib/modal-layout";

/** What the secondary button of a window says: «Отмена» - and «Не отменять» when the main one starts with «Отменить…» (UX pack, rule 3). */
export function cancelLabelFor(primaryLabel: string): string {
  return /^Отменить/.test(primaryLabel) ? "Не отменять" : "Отмена";
}

/**
 * The footer of EVERY window of the product (design system, wave 1; it grew out of `ConfirmFooter` of the money windows, UX pack rule 3):
 *  - the MAIN button names the action (and the sum, where there is one): «Внести 400 000 сум», «Включить в зарплату»; it is `primary` (flat blue) or, for what cannot be taken back, `danger`;
 *  - the secondary one is `ghost` and says «Отмена» («Не отменять» when the main one starts with «Отменить…», «Закрыть» when there is nothing to confirm, «Назад» in a step of a wizard);
 *  - a main button that is off ALWAYS has the line «почему» over the footer (`why`) - never a mute disabled button;
 *  - from `sm` the buttons stand on the right, on a phone one under another, the main one on top, 44 px high.
 * `submitFor`: the id of the `<form>` the main button sends (a window with a form); without it the button calls `onPrimary`.
 */
export function ModalActions({
  primary, onPrimary, submitFor, tone = "primary", disabled = false, busy = false, why = null, whyId = "confirm-why", onCancel, cancelLabel, cancelDisabled, cancelRef, testId, icon, extra, leading,
}: {
  /** The main button; `null` - a window with nothing to confirm (a refusal, an information): only the secondary button, «Закрыть». */
  primary: string | null;
  onPrimary?: () => void;
  submitFor?: string;
  tone?: "primary" | "danger";
  disabled?: boolean;
  busy?: boolean;
  /** Why the main button is off (shown over the buttons while it is off). */
  why?: string | null;
  /** The `id` and `data-testid` of that line (the button points at it with `aria-describedby`). */
  whyId?: string;
  /** Absent: a window with ONE button («Готово» after a result); there is no way out to offer. */
  onCancel?: () => void;
  cancelLabel?: string;
  cancelDisabled?: boolean;
  /** For a window that puts the focus on its way out (a refusal that only says «Закрыть»). */
  cancelRef?: Ref<HTMLButtonElement>;
  testId?: string;
  icon?: ReactNode;
  /** A line over the buttons that is not a reason (a note of the window that has to stay by the button). */
  extra?: ReactNode;
  /** A control that stands at the left edge from `sm` («Вернуть группе», «Удалить файл»): a secondary way out that is not the cancel. */
  leading?: ReactNode;
}) {
  const cancelText = cancelLabel ?? (primary === null ? "Закрыть" : cancelLabelFor(primary));
  return (
    <>
      {disabled && !busy && why && <p id={whyId} data-testid={whyId} className="text-xs text-slate-600 sm:text-right">{why}</p>}
      {extra}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {leading && <div className="flex flex-col sm:mr-auto sm:flex-row">{leading}</div>}
        {onCancel && (
          <Button ref={cancelRef} type="button" variant="ghost" onClick={onCancel} disabled={cancelDisabled ?? busy} data-testid="confirm-cancel" className="max-md:min-h-11">
            {cancelText}
          </Button>
        )}
        {primary !== null && (
          <Button
            type={submitFor ? "submit" : "button"}
            form={submitFor}
            variant={tone}
            onClick={submitFor ? undefined : onPrimary}
            disabled={disabled}
            loading={busy}
            icon={icon}
            data-testid={testId}
            aria-describedby={disabled && why ? whyId : undefined}
            className="max-md:min-h-11"
          >
            {primary}
          </Button>
        )}
      </div>
    </>
  );
}
