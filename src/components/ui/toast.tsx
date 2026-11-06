"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { tidyMoneyText } from "@/lib/money-format";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { toastClosable, toastLifetimeMs } from "@/lib/toast-timing";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  text: string;
  type: ToastType;
  /** Extra lines (for example skipped students with the server reason). */
  details?: string[];
  /** At most ONE link after the sentence («Открыть выписку»). */
  link?: { label: string; href: string };
}

/**
 * The toast of the product (design system, wave 1): ONE phrase and at most one link, an icon (the meaning is not only the colour), one shape, four tones:
 *  - success: GREEN fill (white on success-700: 5.5:1);  error: danger fill (white on danger-700: 6.3:1);
 *  - warning: a light amber surface with dark amber text - an amber FILL with white text is not allowed (white on amber-600 is 3.2:1);  info: a light sky surface.
 * Every other floating message of the product uses `toastSurfaceClass` - there are no toast looks of its own.
 */
const TONE: Record<ToastType, string> = {
  success: "bg-success-700 text-white",
  warning: "border border-warning-300 bg-warning-50 text-warning-950",
  error: "bg-danger-700 text-white",
  info: "border border-info-200 bg-info-50 text-info-900",
};
const CLOSE_HOVER: Record<ToastType, string> = {
  success: "hover:bg-white/20",
  warning: "hover:bg-warning-200",
  error: "hover:bg-white/20",
  info: "hover:bg-info-100",
};
const LINK_TONE: Record<ToastType, string> = {
  success: "text-white",
  warning: "text-warning-950",
  error: "text-white",
  info: "text-info-900",
};
const ICON: Record<ToastType, typeof CheckCircle2> = { success: CheckCircle2, warning: AlertTriangle, error: XCircle, info: Info };

/** The look of a toast without its content (a message that is not shown by `useToast`, e.g. «Выходим…», borrows it). */
export function toastSurfaceClass(type: ToastType): string {
  return `break-words rounded-card px-4 py-3 shadow-pop text-sm font-medium sm:px-5 ${TONE[type]}`;
}

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
  showToast: (text: string, type?: ToastType, details?: string[], link?: ToastMessage["link"]) => void;
  toastNode: ReactNode;
} {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const showToast = useCallback((text: string, type: ToastType = "success", details?: string[], link?: ToastMessage["link"]) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text: tidyMoneyText(text), type, details: details?.map((line) => tidyMoneyText(line)), link });
    timer.current = setTimeout(() => setToast(null), toastLifetimeMs(type, Boolean(details?.length)));
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
            data-tone={toast.type}
            className={`pointer-events-auto w-full max-w-[calc(100vw-2rem)] sm:w-auto sm:max-w-md ${toastSurfaceClass(toast.type)}`}
          >
            <div className="flex items-start gap-3">
              {(() => { const Icon = ICON[toast.type]; return <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />; })()}
              <div className="min-w-0 flex-1">
                <p>{toast.text}</p>
                {toast.link && (
                  <Link href={toast.link.href} data-testid="toast-link" className={`mt-1 inline-block font-semibold underline underline-offset-2 ${LINK_TONE[toast.type]}`}>{toast.link.label}</Link>
                )}
                {toast.details && toast.details.length > 0 && (
                  <ul className="mt-1.5 max-h-40 overflow-y-auto space-y-0.5 text-xs font-normal list-disc pl-4">
                    {toast.details.map((line, index) => <li key={index}>{line}</li>)}
                  </ul>
                )}
              </div>
              {toastClosable(toast.type, Boolean(toast.details?.length)) && (
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  aria-label="Закрыть"
                  className={`-my-1 -mr-1.5 shrink-0 rounded-tag p-1.5 ${CLOSE_HOVER[toast.type]}`}
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
