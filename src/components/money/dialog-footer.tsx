import { MODAL_ACTIONS_FOOTER_CLASS } from "@/lib/modal-layout";

/** The footer layout of a window that carries the line «почему» over its buttons (the shared `Modal` puts the footer row under the divider). */
export const CONFIRM_FOOTER_CLASS = MODAL_ACTIONS_FOOTER_CLASS;

/** The width of a window of money: the QUESTION (one sentence and two buttons) is 448, a window with a form, a list or a table is 520 (re-audit Н9). */
export const MONEY_WINDOW_QUESTION = "max-w-md";
export const MONEY_WINDOW_FORM = "max-w-[520px]";
/** A window with a table «было → станет» (Money-1 B3): 640, so the name of the number and four columns of numbers sit in a row. */
export const MONEY_WINDOW_TABLE = "max-w-[640px]";

/** The footer of the money windows is the shared `ModalActions` (wave 1 of the design system moved it to `components/ui/modal-actions.tsx`); the old name stays for the windows and their tests. */
export { ModalActions as ConfirmFooter, cancelLabelFor } from "@/components/ui/modal-actions";
