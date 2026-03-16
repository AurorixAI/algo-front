"use client";

import { Timer, X } from "lucide-react";

interface TestHeaderProps {
  mode: "exam" | "diagnostic";
  timer: string;
  onClose?: () => void;
  timerDanger?: boolean;
}

/**
 * TestHeader — header для страниц тестирования.
 * Логотип ALGO + режим + таймер + кнопка закрытия.
 */
export function TestHeader({ mode, timer, onClose, timerDanger = false }: TestHeaderProps) {
  return (
    <header className="w-full h-16 md:h-20 flex items-center justify-between px-4 md:px-10 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-primary-500/20">
          <span className="text-lg font-bold">∑</span>
        </div>
        <h1 className="font-bold text-xl tracking-tight text-slate-900">ALGO</h1>
        <div className="h-4 w-px bg-slate-300 mx-1 hidden md:block" />
        <span className="text-xs font-medium text-slate-500 uppercase tracking-widest hidden md:inline">
          {mode === "exam" ? "Exam Mode" : "Diagnostic Mode"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div
          className={`bg-white/60 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/40 flex items-center gap-2 shadow-sm ${
            timerDanger ? "text-red-600 animate-pulse" : "text-slate-600"
          }`}
        >
          <Timer className="w-4 h-4" />
          <span className="font-mono text-sm font-medium">{timer}</span>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/60 backdrop-blur-md border border-white/40 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all duration-300"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </header>
  );
}
