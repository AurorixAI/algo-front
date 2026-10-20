"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { lockScroll } from "@/lib/scroll-lock";
import { FOCUSABLE, dialogLayers, handleDialogKey } from "@/lib/modal-stack";

/** A click on the backdrop right after the dialog opened is the tail of the double click that opened it: not a dismissal. */
export const BACKDROP_GRACE_MS = 300;

// useLayoutEffect warns during server rendering; the lock only matters in the browser.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Lock the page scroll while `open` (dialogs, drawers, lightboxes).  The lock is on <html>, compensates the scrollbar
 * width so nothing jumps, is counted for stacked layers and gives back the exact previous inline styles on close or unmount.
 * Use it in every full-screen layer, so the page behind neither scrolls nor stays outside the dim.
 */
export function useScrollLock(open: boolean): void {
  useIsomorphicLayoutEffect(() => {
    if (!open) return undefined;
    return lockScroll();
  }, [open]);
}

/**
 * Keyboard of an open dialog: Escape closes it, Tab stays inside it.  Only the TOPMOST open dialog reacts (see
 * `lib/modal-stack.ts`): with a confirmation over a form one Escape closes the confirmation, the next one the form.
 * The dialog joins the stack when it opens, so the order is the order of opening; `busy` and `onClose` are read at the
 * moment of the key press, so a new `onClose` on every render does not reshuffle the stack.
 */
export function useDialogKeys(
  open: boolean,
  dialogRef: { current: HTMLElement | null },
  options: { busy?: boolean; onClose: () => void },
): void {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    if (!open) return undefined;
    const layer = dialogLayers.push((event) =>
      handleDialogKey(event, dialogRef.current, { busy: Boolean(latest.current.busy), onClose: latest.current.onClose }));
    return layer.remove;
  }, [open, dialogRef]);
}

interface ModalProps {
  open: boolean;
  /** The name of the dialog: the heading and `aria-label`. */
  title: string;
  /** A line under the title; a node when it carries emphasis («Ученик: Иванов 9 класс»). */
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Buttons row; rendered under the body with a divider. */
  footer?: ReactNode;
  /** Tailwind max-width class of the dialog. */
  maxWidthClassName?: string;
  /** While true the backdrop, Escape and the cross do not close the dialog. */
  busy?: boolean;
  /** A tile with an icon before the title (dialogs that open an object keep their icon). */
  icon?: ReactNode;
  /** Replaces the padding of the scrolling body (a dialog whose sections bring their own paddings). */
  bodyClassName?: string;
  /** Replaces the layout and padding of the footer row (the divider stays). */
  footerClassName?: string;
  /** `center` (default): a card in the middle; `right`: a side sheet from the right edge, full height. */
  placement?: "center" | "right";
}

/**
 * Portal dialog in the style of the group-create modal.  On a phone the card is limited to the viewport height and its
 * body scrolls.  One implementation of everything a dialog owes the user: `role="dialog"`, the dim over the whole
 * window, scroll lock, Escape and the Tab trap of the topmost dialog, focus in and back to the opener.  The side sheet
 * (`placement="right"`) is the same dialog on the same stack, so a drawer never reinvents any of it.
 */
export function Modal({
  open, title, description, onClose, children, footer, maxWidthClassName = "max-w-[480px]", busy = false,
  icon, bodyClassName, footerClassName, placement = "center",
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const openedAtRef = useRef(0);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open) openedAtRef.current = Date.now(); }, [open]);
  useScrollLock(open);

  // Remember the control the user used last outside the dialog.  An autoFocus
  // field inside the dialog takes focus before any effect runs, and Safari does
  // not focus buttons on click, so reading activeElement on open is not reliable.
  useEffect(() => {
    const remember = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || dialogRef.current?.contains(target)) return;
      const control = target.closest<HTMLElement>("button, a[href], input, textarea, select, [tabindex]");
      if (control) openerRef.current = control;
    };
    document.addEventListener("focusin", remember);
    document.addEventListener("pointerdown", remember, true);
    return () => {
      document.removeEventListener("focusin", remember);
      document.removeEventListener("pointerdown", remember, true);
    };
  }, []);

  // Keyboard: Escape closes; Tab and Shift+Tab stay inside the dialog (the topmost dialog only).
  useDialogKeys(open, dialogRef, { busy, onClose });

  // On open focus the first field (or the first control); on close return focus to the opener.
  useEffect(() => {
    if (!open || !mounted) return;
    const opener = openerRef.current;
    const dialog = dialogRef.current;
    if (dialog) {
      // A field that is not on screen (the hidden file input of an upload) cannot take focus: skip it.
      const shown = (el: HTMLElement) => el.getClientRects().length > 0;
      const field = Array.from(dialog.querySelectorAll<HTMLElement>(
        "input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled])",
      )).find(shown);
      const target = field
        || Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).find((el) => el.getAttribute("aria-label") !== "Закрыть" && shown(el))
        || dialog;
      target.focus();
    }
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, mounted]);

  const side = placement === "right";

  const header = (
    <div className={side
      ? "flex items-start justify-between gap-3 p-5 border-b border-slate-100 shrink-0"
      : "flex items-start justify-between gap-3 p-5 sm:p-6 pb-3 sm:pb-4 shrink-0"}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 to-primary-100/50 text-primary-600">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className={side ? "font-semibold text-slate-900" : "text-lg sm:text-xl font-bold text-slate-900"}>{title}</h2>
          {description && <div className="mt-1 text-xs text-slate-500">{description}</div>}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        aria-label="Закрыть"
        className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  const body = (
    <div className={bodyClassName ?? "px-5 sm:px-6 py-2 overflow-y-auto overscroll-contain min-h-0"}>{children}</div>
  );

  const footerRow = footer && (
    <div className={`shrink-0 border-t border-slate-100 ${footerClassName ?? "flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 p-5 sm:p-6 pt-4 mt-3"}`}>
      {footer}
    </div>
  );

  const content = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] touch-none"
            onClick={() => { if (!busy && Date.now() - openedAtRef.current >= BACKDROP_GRACE_MS) onClose(); }}
          />
          {side ? (
            <div className="fixed inset-0 z-[110] flex justify-end pointer-events-none">
              <motion.div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                className={`bg-white shadow-2xl w-full ${maxWidthClassName} h-full pointer-events-auto flex flex-col outline-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)]`}
              >
                {header}
                {body}
                {footerRow}
              </motion.div>
            </div>
          ) : (
            <div className="pad-safe fixed inset-0 z-[110] flex items-center justify-center pointer-events-none">
              <motion.div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className={`bg-white rounded-[24px] shadow-2xl border border-slate-100 w-full ${maxWidthClassName} max-h-full pointer-events-auto overflow-hidden flex flex-col outline-none`}
              >
                {header}
                {body}
                {footerRow}
              </motion.div>
            </div>
          )}
        </>
      )}
    </AnimatePresence>
  );

  return mounted ? createPortal(content, document.body) : null;
}
