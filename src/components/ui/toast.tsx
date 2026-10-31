"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export interface ToastMessage {
  text: string;
  type: "success" | "error" | "warning";
  /** Extra lines (for example skipped students with the server reason). */
  details?: string[];
}

const TONE: Record<ToastMessage["type"], string> = {
  success: "bg-slate-900 text-white",
  warning: "bg-amber-600 text-white",
  error: "bg-red-600 text-white",
};

const HOST_ID = "toast-host";

/**
 * Where the toasts live: ONE fixed column over the bottom edge of the window, shared by every toast on the page, so
 * several toasts stack instead of covering each other.  It is as wide as the window and centres its children with flex,
 * not with a half-width offset plus a negative translate: the toast is animated by framer-motion, which owns the element's `transform`
 * and would drop that translate, leaving the toast starting at the middle of the screen and cut off on the right.
 * The bottom padding keeps clear of the phone's home indicator (safe area).
 */
// z-[100020]: above the lesson panels (99999) and the floating layers over them (100000-100010): a refusal of a write that finds the panel of another lesson open must be SEEN
const HOST_CLASS =
  "pointer-events-none fixed inset-x-0 bottom-0 z-[100020] flex flex-col items-center gap-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] print:hidden";

function ToastPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let element = document.getElementById(HOST_ID);
    if (!element) {
      element = document.createElement("div");
      element.id = HOST_ID;
      element.className = HOST_CLASS;
      document.body.appendChild(element);
    }
    setHost(element);
  }, []);
  return host ? createPortal(children, host) : null;
}

/**
 * Local toast state in the pattern the group pages already use, packaged so
 * new screens do not copy it.  Render `toastNode` once at the end of the page.
 * A toast with details stays longer and has a close button.
 */
export function useToast(): {
  showToast: (text: string, type?: ToastMessage["type"], details?: string[]) => void;
  toastNode: ReactNode;
} {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const showToast = useCallback((text: string, type: ToastMessage["type"] = "success", details?: string[]) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, type, details });
    timer.current = setTimeout(() => setToast(null), details?.length ? 10000 : 3500);
  }, []);

  const toastNode = (
    <ToastPortal>
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.text}
            role={toast.type === "error" ? "alert" : "status"}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className={`pointer-events-auto w-full max-w-[calc(100vw-2rem)] break-words px-4 py-3 sm:w-auto sm:max-w-md sm:px-5 rounded-2xl shadow-lg text-sm font-medium ${TONE[toast.type]}`}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p>{toast.text}</p>
                {toast.details && toast.details.length > 0 && (
                  <ul className="mt-1.5 max-h-40 overflow-y-auto space-y-0.5 text-xs font-normal opacity-90 list-disc pl-4">
                    {toast.details.map((line, index) => <li key={index}>{line}</li>)}
                  </ul>
                )}
              </div>
              {toast.details && toast.details.length > 0 && (
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  aria-label="Закрыть"
                  className="shrink-0 rounded p-0.5 hover:bg-white/20"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </ToastPortal>
  );

  return { showToast, toastNode };
}
