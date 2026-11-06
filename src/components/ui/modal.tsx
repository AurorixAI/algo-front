"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { lockScroll } from "@/lib/scroll-lock";
import { FOCUSABLE, dialogLayers, handleDialogKey } from "@/lib/modal-stack";
import { modalLayout, shouldRememberOpener, type ModalSize } from "@/lib/modal-layout";
import { Button } from "@/components/ui/button";

/**
 * R3 M1: the `submit` of a React portal climbs the REACT tree, not the DOM one: a dialog opened from inside a form (the notice «Переоткрыть месяц» in the form of a pause) would send
 * the form around it.  A dialog is a boundary - what is submitted inside it is its own.
 */
export function stopFormSubmit(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

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

/**
 * Focus of an open dialog: on open it goes into the dialog (the first field, else the first control but the cross; `initial: "dialog"` = the dialog itself,
 * for a window whose content arrives later), on close it returns to the control the user used last outside the dialog.
 * `ready` holds the focus back until the dialog is on screen (the portal is mounted).
 */
export function useDialogFocus(
  open: boolean,
  dialogRef: { current: HTMLElement | null },
  options: { ready?: boolean; initial?: "first" | "dialog" } = {},
): void {
  const { ready = true, initial = "first" } = options;
  const openerRef = useRef<HTMLElement | null>(null);
  // Read by the opener tracking below.  Set during render, so it is already true in the commit that opens the dialog.
  const openRef = useRef(open);
  openRef.current = open;

  // Remember the control the user used last outside the dialog.  An autoFocus
  // field inside the dialog takes focus before any effect runs, and Safari does
  // not focus buttons on click, so reading activeElement on open is not reliable.
  useEffect(() => {
    const remember = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // While THIS dialog is open nothing changes the opener: an `autoFocus` field takes focus before the dialog's ref
      // is attached and would be remembered as the control to return to.
      if (!shouldRememberOpener({ dialogOpen: openRef.current, targetInsideDialog: Boolean(dialogRef.current?.contains(target)) })) return;
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

  useEffect(() => {
    if (!open || !ready) return;
    const opener = openerRef.current;
    const dialog = dialogRef.current;
    if (dialog) {
      // A field that is not on screen (the hidden file input of an upload) cannot take focus: skip it.
      const shown = (el: HTMLElement) => el.getClientRects().length > 0;
      const field = initial === "first" ? Array.from(dialog.querySelectorAll<HTMLElement>(
        "input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled])",
      )).find(shown) : undefined;
      const target = field
        || (initial === "first" ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).find((el) => el.getAttribute("aria-label") !== "Закрыть" && shown(el)) : undefined)
        || dialog;
      target.focus();
    }
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, ready, initial, dialogRef]);
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
  /** The width of the dialog: `sm` 448 (a question), `md` 520 (a form, the default), `lg` 640 (a table or a list).  A side sheet is 480 whatever the size. */
  size?: ModalSize;
  /** Tailwind max-width class: only for what the three sizes do not cover (a side sheet that is wider). */
  maxWidthClassName?: string;
  /** While true the backdrop, Escape and the cross do not close the dialog. */
  busy?: boolean;
  /** Replaces the padding of the scrolling body (a dialog whose sections bring their own paddings). */
  bodyClassName?: string;
  /** Replaces the layout and padding of the footer row (the divider stays). */
  footerClassName?: string;
  /**
   * `center` (default): a card in the middle; `right`: a side sheet from the right edge, full height;
   * `sheet`: the same side sheet from md up and a bottom sheet on a phone (a row of a list that opens its details).
   */
  placement?: "center" | "right" | "sheet";
  /** Over a panel that has its own full-screen layer above the usual dialogs (the lesson panels of the teacher's cabinet, z 99999). */
  aboveLessonPanel?: boolean;
}

/**
 * Portal dialog in the style of the group-create modal.  On a phone the card is limited to the viewport height and its
 * body scrolls.  One implementation of everything a dialog owes the user: `role="dialog"`, the dim over the whole
 * window, scroll lock, Escape and the Tab trap of the topmost dialog, focus in and back to the opener.  The side sheet
 * (`placement="right"`) is the same dialog on the same stack, so a drawer never reinvents any of it.
 */
const SCROLL_EDGE = {
  background: "linear-gradient(#fff 30%, rgba(255,255,255,0)) center top / 100% 28px no-repeat local, linear-gradient(rgba(255,255,255,0), #fff 70%) center bottom / 100% 28px no-repeat local, linear-gradient(rgba(15,23,42,0.12), rgba(15,23,42,0)) center top / 100% 10px no-repeat scroll, linear-gradient(rgba(15,23,42,0), rgba(15,23,42,0.12)) center bottom / 100% 10px no-repeat scroll",
} as const;

export function Modal({
  open, title, description, onClose, children, footer, size, maxWidthClassName, busy = false,
  bodyClassName, footerClassName, placement = "center", aboveLessonPanel = false,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openedAtRef = useRef(0);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open) openedAtRef.current = Date.now(); }, [open]);
  useScrollLock(open);

  // Keyboard: Escape closes; Tab and Shift+Tab stay inside the dialog (the topmost dialog only).
  useDialogKeys(open, dialogRef, { busy, onClose });

  // On open focus the first field (or the first control); on close return focus to the opener.
  useDialogFocus(open, dialogRef, { ready: mounted });

  // LESSONS 94: the dialog is named by its own heading.
  const titleId = useId();
  const side = placement === "right" || placement === "sheet";
  // A bottom sheet slides up, a side sheet slides in; the choice is made when the dialog opens (the viewport is known by then).
  const slideUp = placement === "sheet" && mounted && typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches;
  const layout = modalLayout({ placement, size, maxWidthClassName, bodyClassName, footerClassName });

  const header = (
    <div className={layout.header} data-modal-part="header">
      <div className="min-w-0">
        <h2 id={titleId} className={layout.title}>{title}</h2>
        {description && <div className="mt-1 text-xs text-slate-500">{description}</div>}
      </div>
      <Button
        type="button"
        onClick={onClose}
        disabled={busy}
        aria-label="Закрыть"
        variant="ghost" size="icon"
      >
        <X className="w-5 h-5" />
      </Button>
    </div>
  );

  // re-audit Н12: a body that scrolls says so - a soft grey edge appears at the bottom (and the top) only while there is more to scroll (not coloured; the white covers it at the end of the scroll)
  const body = <div className={layout.body} style={SCROLL_EDGE} data-modal-part="body">{children}</div>;

  const footerRow = footer && <div className={layout.footer} data-modal-part="footer">{footer}</div>;

  const content = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`fixed inset-0 bg-slate-900/40 touch-none ${aboveLessonPanel ? "z-[100000]" : "z-[100]"}`}
            onClick={() => { if (!busy && Date.now() - openedAtRef.current >= BACKDROP_GRACE_MS) onClose(); }}
          />
          {side ? (
            <div className={`${aboveLessonPanel ? "fixed inset-0 z-[100010] flex justify-end pointer-events-none" : "fixed inset-0 z-[110] flex justify-end pointer-events-none"}${placement === "sheet" ? " items-end md:items-stretch" : ""}`}>
              <motion.div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onSubmit={stopFormSubmit}
                initial={slideUp ? { y: "100%" } : { x: "100%" }}
                animate={slideUp ? { y: 0 } : { x: 0 }}
                exit={slideUp ? { y: "100%" } : { x: "100%" }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                className={layout.card}
              >
                {header}
                {body}
                {footerRow}
              </motion.div>
            </div>
          ) : (
            <div className={aboveLessonPanel ? "pad-safe fixed inset-0 z-[100010] flex items-center justify-center pointer-events-none" : "pad-safe fixed inset-0 z-[110] flex items-center justify-center pointer-events-none"}>
              <motion.div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onSubmit={stopFormSubmit}
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className={layout.card}
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
