"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** The soft coloured background of the public pages (login, activate, request-demo, set-password). */
export function PublicBackdrop() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute -top-[20%] -left-[10%] w-[80vw] h-[80vw] bg-blue-100/60 rounded-full blur-[120px] mix-blend-multiply opacity-70" />
      <div className="absolute top-[20%] right-[10%] w-[60vw] h-[60vw] bg-indigo-100/50 rounded-full blur-[100px] mix-blend-multiply opacity-60" />
      <div className="absolute -bottom-[20%] left-[20%] w-[70vw] h-[70vw] bg-slate-200/60 rounded-full blur-[140px] mix-blend-multiply" />
    </div>
  );
}

export function BrandMark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <Link href="/" className="inline-flex items-center gap-3" aria-label="ALGO — на главную">
      <div
        className={`${size === "lg" ? "w-12 h-12 rounded-2xl" : "w-10 h-10 rounded-xl"} bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white shadow-lg shadow-primary-500/30`}
      >
        <span className={`${size === "lg" ? "text-2xl" : "text-xl"} font-bold`}>∫</span>
      </div>
      <span className={`${size === "lg" ? "text-3xl" : "text-2xl"} font-bold text-slate-900`}>ALGO</span>
    </Link>
  );
}

/** A centred narrow column for the one-card pages (set-password). */
export function NarrowPage({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] relative overflow-hidden">
      <PublicBackdrop />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <BrandMark size="lg" />
          {caption && <p className="text-slate-500 text-sm mt-3">{caption}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
