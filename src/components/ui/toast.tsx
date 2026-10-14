"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.text}
          role={toast.type === "error" ? "alert" : "status"}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          className={`fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-[120] w-[calc(100vw-2rem)] sm:w-auto sm:max-w-md px-5 py-3 rounded-2xl shadow-lg text-sm font-medium ${TONE[toast.type]}`}
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
  );

  return { showToast, toastNode };
}
