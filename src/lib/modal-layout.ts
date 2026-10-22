/**
 * The layout classes of the shared `Modal`, in one pure place so the defaults are pinned by a test (a dialog's width, the
 * padding of its body, the layout of its footer are what every dialog of the project looks like) and an override is
 * applied exactly where it should be.  No React here: node:test loads this file.
 */

export const MODAL_DEFAULT_MAX_WIDTH = "max-w-[480px]";
export const MODAL_BODY_DEFAULT = "px-5 sm:px-6 py-2 overflow-y-auto overscroll-contain min-h-0";
export const MODAL_FOOTER_DEFAULT = "flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 p-5 sm:p-6 pt-4 mt-3";
/** The divider above the footer: it belongs to the Modal, an override of the footer layout does not remove it. */
export const MODAL_FOOTER_DIVIDER = "shrink-0 border-t border-slate-100";

export interface ModalLayoutInput {
  placement?: "center" | "right" | "sheet";
  maxWidthClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
}

export interface ModalLayout {
  /** The card (centred) or the sheet (right): width included. */
  card: string;
  header: string;
  title: string;
  body: string;
  footer: string;
}

export function modalLayout(input: ModalLayoutInput = {}): ModalLayout {
  const sheet = input.placement === "sheet";
  const side = input.placement === "right" || sheet;
  const width = input.maxWidthClassName ?? MODAL_DEFAULT_MAX_WIDTH;
  return {
    card: sheet
      // A bottom sheet on a phone (rounded top, at most 88% of the screen), the right drawer from md up.
      ? `bg-white shadow-2xl w-full max-h-[88vh] supports-[height:100dvh]:max-h-[88dvh] rounded-t-3xl md:rounded-none md:h-full md:max-h-none ${width} pointer-events-auto flex flex-col outline-none pb-[env(safe-area-inset-bottom)] md:pt-[env(safe-area-inset-top)] md:pr-[env(safe-area-inset-right)]`
      : side
      ? `bg-white shadow-2xl w-full ${width} h-full pointer-events-auto flex flex-col outline-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)]`
      : `bg-white rounded-[24px] shadow-2xl border border-slate-100 w-full ${width} max-h-full pointer-events-auto overflow-hidden flex flex-col outline-none`,
    header: side
      ? "flex items-start justify-between gap-3 p-5 border-b border-slate-100 shrink-0"
      : "flex items-start justify-between gap-3 p-5 sm:p-6 pb-3 sm:pb-4 shrink-0",
    title: side ? "font-semibold text-slate-900" : "text-lg sm:text-xl font-bold text-slate-900",
    body: input.bodyClassName ?? MODAL_BODY_DEFAULT,
    footer: `${MODAL_FOOTER_DIVIDER} ${input.footerClassName ?? MODAL_FOOTER_DEFAULT}`,
  };
}

/**
 * Should a focus / pointer event update the control that «opened» a dialog?  Only while the dialog is closed and the
 * target is outside it.  While the dialog is open nothing may change the opener: a field with `autoFocus` takes focus in
 * the very commit that opens the dialog, before the dialog's own ref is attached, and would otherwise be remembered as the
 * thing to return to.
 */
export function shouldRememberOpener(input: { dialogOpen: boolean; targetInsideDialog: boolean }): boolean {
  return !input.dialogOpen && !input.targetInsideDialog;
}
