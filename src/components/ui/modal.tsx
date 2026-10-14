"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

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
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const content = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
            onClick={() => { if (!busy) onClose(); }}
          />
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 pointer-events-none">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className={`bg-white rounded-[24px] shadow-2xl border border-slate-100 w-full ${maxWidthClassName} max-h-[calc(100vh-1.5rem)] pointer-events-auto overflow-hidden flex flex-col`}
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
              <div className="px-5 sm:px-6 py-2 overflow-y-auto min-h-0">{children}</div>
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
