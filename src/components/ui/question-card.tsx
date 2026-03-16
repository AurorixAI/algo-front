"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface QuestionCardProps {
  /** Topic / skill tag displayed above the question */
  topic?: string;
  /** Main content — question text, math, images */
  children: ReactNode;
  /** Optional metadata area (bounds, hints) below the question */
  meta?: ReactNode;
  /** Unique key for AnimatePresence transitions */
  questionKey?: string;
  className?: string;
}

/**
 * QuestionCard — карточка вопроса в стиле glassmorphism.
 * Большие скругления, gradient-полоска сверху, math-display шрифт.
 */
export function QuestionCard({ topic, children, meta, questionKey, className }: QuestionCardProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={questionKey}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, x: -120, scale: 0.9, filter: "blur(12px)" }}
        transition={{
          enter: { duration: 0.8, ease: [0.34, 1.56, 0.64, 1], delay: 0.15 },
          exit: { duration: 0.6, ease: [0.4, 0, 0.2, 1] },
        }}
        className={cn(
          "glass-panel rounded-2xl md:rounded-3xl p-6 md:p-8 lg:p-10 text-center",
          "shadow-[0_12px_32px_-8px_rgba(0,0,0,0.08)] relative overflow-hidden",
          "bg-gradient-to-b from-white to-white/90",
          className
        )}
      >
        {/* Top gradient accent line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary-500 to-transparent opacity-40" />

        {/* Topic tag */}
        {topic && (
          <span className="block mb-4 md:mb-5 uppercase tracking-[0.25em] text-[10px] font-bold text-slate-400">
            {topic}
          </span>
        )}

        {/* Main content */}
        <div className="font-sans text-lg md:text-xl lg:text-2xl text-slate-900 leading-relaxed font-medium">
          {children}
        </div>

        {/* Optional metadata */}
        {meta && (
          <div className="mt-4 md:mt-5 flex justify-center items-center gap-4 text-slate-500">
            {meta}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
