"use client";

/**
 * TestBackground — полноэкранный фон для экрана тестирования.
 * Многослойные blur-шары + gradient overlay.
 */
export function TestBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/50 to-slate-200/50 opacity-100" />
      {/* Blur orbs */}
      <div className="absolute -top-[20%] -left-[10%] w-[80vw] h-[80vw] bg-blue-100/60 rounded-full blur-[120px] mix-blend-multiply opacity-70" />
      <div className="absolute top-[20%] right-[10%] w-[60vw] h-[60vw] bg-indigo-100/50 rounded-full blur-[100px] mix-blend-multiply opacity-60" />
      <div className="absolute -bottom-[20%] left-[20%] w-[70vw] h-[70vw] bg-slate-200/60 rounded-full blur-[140px] mix-blend-multiply" />
    </div>
  );
}
