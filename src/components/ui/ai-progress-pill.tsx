"use client";

import { cn } from "@/lib/utils";

interface AIProgressPillProps {
  mode: "exam" | "diagnostic";
  /** Progress 0-100 */
  progress: number;
  /** Main label e.g. "AI Diagnostic" or "Exam Progress" */
  label: string;
  /** Sub-label, e.g. "Analyzing Skill Depth..." or "Q 5/20" */
  sublabel: string;
  className?: string;
}

/**
 * AIProgressPill — floating pill снизу экрана с liquid-прогресс кругом.
 * Показывает прогресс тестирования / диагностики.
 */
export function AIProgressPill({ mode, progress, label, sublabel, className }: AIProgressPillProps) {
  return (
    <div className={cn("relative group", className)}>
      {/* Outer glow */}
      <div className="absolute inset-0 bg-primary-500 opacity-20 blur-xl rounded-full" />

      <div className="relative overflow-hidden flex items-center gap-3 md:gap-4 pl-2 pr-5 md:pr-6 py-2 bg-white/95 backdrop-blur-xl border border-white/60 shadow-xl rounded-full animate-glow-pulse">
        {/* Liquid circle */}
        <div className="relative w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center shadow-inner shrink-0">
          {/* Rising liquid */}
          <div
            className="absolute bottom-0 left-0 w-full transition-all duration-1000 ease-out z-0"
            style={{ height: `${Math.min(100, Math.max(10, progress))}%` }}
          >
            <div className="w-full h-full liquid-bg animate-liquid-pulse opacity-90" />
          </div>
          {/* Glass overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />
          {/* Percentage text */}
          <span className="relative z-10 text-[10px] md:text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
            {Math.round(progress)}%
          </span>
        </div>

        {/* Text labels */}
        <div className="flex flex-col justify-center min-w-0">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest leading-tight truncate">
            {label}
          </span>
          <span className="text-xs font-semibold text-slate-800 truncate">
            {sublabel}
          </span>
        </div>
      </div>
    </div>
  );
}
