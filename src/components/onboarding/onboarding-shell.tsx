"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PublicBackground } from "@/components/ui/public-background";

export function BrandMark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <Link href="/" className="inline-flex items-center gap-3" aria-label="ALGO — на главную">
      <div
        className={`${size === "lg" ? "w-12 h-12 rounded-2xl" : "w-10 h-10 rounded-xl"} bg-primary-500 flex items-center justify-center text-white shadow-lg shadow-primary-500/30`}
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
      <PublicBackground />
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
