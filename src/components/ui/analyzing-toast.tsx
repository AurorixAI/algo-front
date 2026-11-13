"use client";

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

  // Centred by a full-width flex row; appears by a CSS animation (no JS frames: a phone that gives none must still show it).
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-[env(safe-area-inset-top)]">
      {visible && (
        <div className="mt-6 flex max-w-[calc(100vw-2rem)] animate-slide-down items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/95 backdrop-blur-md border border-slate-200 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <span className="flex relative h-2.5 w-2.5">
            <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", c.ping)} />
            <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", c.dot)} />
          </span>
          <span className={cn("text-xs font-semibold", c.text)}>{text}</span>
        </div>
      )}
    </div>
  );
}
