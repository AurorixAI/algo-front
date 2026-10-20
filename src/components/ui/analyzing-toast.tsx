"use client";

import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AnalyzingToastProps {
  visible: boolean;
  text?: string;
  variant?: "neutral" | "correct" | "incorrect";
}

/**
 * AnalyzingToast — pill-уведомление сверху экрана.
 * Показывается при анализе ответа или как feedback (верно/неверно).
 */
export function AnalyzingToast({ visible, text = "ANALYZING RESPONSE...", variant = "neutral" }: AnalyzingToastProps) {
  const colors = {
    neutral: {
      dot: "bg-primary-500",
      ping: "bg-primary-500",
      text: "text-slate-600",
    },
    correct: {
      dot: "bg-green-500",
      ping: "bg-green-500",
      text: "text-green-700",
    },
    incorrect: {
      dot: "bg-red-500",
      ping: "bg-red-500",
      text: "text-red-700",
    },
  };

  const c = colors[variant];

  // Centred by a full-width flex row, not by a half-width offset plus a negative translate: framer-motion owns the
  // element's `transform` and would drop that translate, leaving the pill starting at the middle of the screen.
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center">
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 24, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex max-w-[calc(100vw-2rem)] items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/95 backdrop-blur-md border border-slate-200 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
        >
          <span className="flex relative h-2.5 w-2.5">
            <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", c.ping)} />
            <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", c.dot)} />
          </span>
          <span className={cn("text-xs font-semibold tracking-wide uppercase", c.text)}>{text}</span>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
}
