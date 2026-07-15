"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureLockProps {
  children: React.ReactNode;
  enabled?: boolean;
  title?: string;
  description?: string;
  variant?: "block" | "inline";
  className?: string;
}

export function FeatureLock({
  children,
  enabled = true,
  title = "Функция в разработке",
  description = "Этот раздел находится в активной разработке и будет доступен в ближайшем обновлении.",
  variant = "block",
  className,
}: FeatureLockProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  if (!enabled) return <>{children}</>;

  const showOverlay = isHovered || isFocused;

  if (variant === "inline") {
    return (
      <div
        className={cn("relative inline-block group", className)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        tabIndex={0}
        role="region"
        aria-label={`${title}: ${description}`}
      >
        {/* Child wrapper - disabled interactions */}
        <div className="pointer-events-none select-none opacity-60 filter saturate-50 cursor-not-allowed">
          {children}
        </div>

        {/* Lock Icon Badge */}
        <div className="absolute -top-1 -right-1 bg-amber-500 text-white rounded-full p-0.5 shadow-sm z-10">
          <Lock className="w-2.5 h-2.5" />
        </div>

        {/* Tooltip */}
        <AnimatePresence>
          {showOverlay && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-900/95 backdrop-blur-md text-white text-xs rounded-xl p-3 shadow-xl z-50 pointer-events-none border border-white/10"
            >
              <div className="flex gap-2 items-start">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-100 text-left">{title}</p>
                  <p className="text-slate-300 mt-0.5 leading-relaxed text-left">{description}</p>
                </div>
              </div>
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900/95" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Block variant (for cards, widgets, or sections)
  return (
    <div
      className={cn("relative overflow-hidden group rounded-[1.5rem] w-full", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      tabIndex={0}
      role="region"
      aria-label={`${title}: ${description}`}
    >
      {/* Child Container with blur effect */}
      <div
        className={cn(
          "transition-all duration-500 w-full h-full",
          showOverlay ? "filter blur-[3px] opacity-40 scale-[0.98] pointer-events-none select-none" : "pointer-events-none"
        )}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Static/Normal state Badge in corner */}
      <div className="absolute top-4 right-4 bg-slate-100/80 backdrop-blur-md text-slate-500 text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-200/50 flex items-center gap-1.5 shadow-sm group-hover:opacity-0 transition-opacity duration-300 pointer-events-none">
        <Lock className="w-3.5 h-3.5 text-amber-500" />
        <span>Скоро</span>
      </div>

      {/* Frosted/Blur Overlay */}
      <AnimatePresence>
        {showOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-slate-900/5 backdrop-blur-[2px] flex items-center justify-center p-6 z-40 pointer-events-none"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: "spring", damping: 20, stiffness: 300, delay: 0.05 }}
              className="bg-white/95 border border-slate-200/50 rounded-2xl p-5 max-w-sm text-center shadow-lg shadow-slate-900/5 flex flex-col items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100 shadow-sm shrink-0">
                <Lock className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">{title}</h4>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{description}</p>
              </div>
              <div className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Будет доступно в будущем обновлении</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
