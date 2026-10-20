"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { lockScroll } from "@/lib/scroll-lock";

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

const FOCUSABLE = 'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons row; rendered under the body with a divider. */
  footer?: ReactNode;
  /** Tailwind max-width class of the dialog. */
  maxWidthClassName?: string;
  /** While true the backdrop, Escape and the cross do not close the dialog. */
  busy?: boolean;
}

/**
 * Portal dialog in the style of the group-create modal.  On a phone the card
 * is limited to the viewport height and its body scrolls.
 */
export function Modal({
  open, title, description, onClose, children, footer, maxWidthClassName = "max-w-[480px]", busy = false,
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

  // Keyboard: Escape closes; Tab and Shift+Tab stay inside the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true" && el.offsetParent !== null,
      );
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  // On open focus the first field (or the first control); on close return focus to the opener.
  useEffect(() => {
    if (!open || !mounted) return;
    const opener = openerRef.current;
    const dialog = dialogRef.current;
    if (dialog) {
      const field = dialog.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), select:not([disabled])");
      const target = field
        || Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).find((el) => el.getAttribute("aria-label") !== "Закрыть")
        || dialog;
      target.focus();
    }
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, mounted]);

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
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 pointer-events-none">
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
              className={`bg-white rounded-[24px] shadow-2xl border border-slate-100 w-full ${maxWidthClassName} max-h-[calc(100vh-1.5rem)] pointer-events-auto overflow-hidden flex flex-col outline-none`}
            >
              <div className="h-1 w-full shrink-0 bg-gradient-to-r from-primary-500 via-violet-400 to-emerald-400" />
              <div className="flex items-start justify-between gap-3 p-5 sm:p-6 pb-3 sm:pb-4 shrink-0">
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">{title}</h2>
                  {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
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
              <div className="px-5 sm:px-6 py-2 overflow-y-auto overscroll-contain min-h-0">{children}</div>
              {footer && (
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 p-5 sm:p-6 pt-4 shrink-0 border-t border-slate-100 mt-3">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  return mounted ? createPortal(content, document.body) : null;
}
