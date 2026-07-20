"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCK_COPY } from "@/lib/lock-copy";

interface FeatureLockProps {
  children: React.ReactNode;
  enabled?: boolean;
  title?: string;
  description?: string;
  variant?: "block" | "inline";
  className?: string;
}

interface TooltipPos {
  top: number;
  left: number;
  /** Смещение «носика» тултипа относительно его левого края. */
  arrowLeft: number;
  placement: "top" | "bottom";
}

const TOOLTIP_WIDTH = 256; // w-64
const VIEWPORT_PADDING = 8;
const ANCHOR_GAP = 8;

// Избегаем предупреждения useLayoutEffect при SSR.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Тултип, который рендерится в портале (position: fixed) и сам вычисляет
 * своё положение относительно триггера и краёв экрана. За счёт портала он
 * не обрезается родительскими контейнерами с overflow-hidden, а clamp по
 * ширине/высоте не даёт ему выйти за границы вьюпорта.
 */
function ViewportTooltip({
  show,
  anchorRef,
  title,
  description,
}: {
  show: boolean;
  anchorRef: React.RefObject<HTMLElement>;
  title: string;
  description: string;
}) {
  const tipRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<TooltipPos | null>(null);

  useEffect(() => setMounted(true), []);

  useIsomorphicLayoutEffect(() => {
    // Пока скрыт — не пересчитываем и сохраняем последнюю позицию,
    // чтобы анимация закрытия проигрывалась на месте, а не улетала за экран.
    if (!show) return;

    const compute = () => {
      const anchor = anchorRef.current;
      const tip = tipRef.current;
      if (!anchor || !tip) return;

      const a = anchor.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const centerX = a.left + a.width / 2;
      // Горизонтальный clamp — тултип всегда остаётся внутри экрана.
      let left = centerX - t.width / 2;
      left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - t.width - VIEWPORT_PADDING));

      // По умолчанию над триггером; если сверху не хватает места — снизу.
      let placement: "top" | "bottom" = "top";
      let top = a.top - ANCHOR_GAP - t.height;
      if (top < VIEWPORT_PADDING) {
        placement = "bottom";
        top = a.bottom + ANCHOR_GAP;
        if (top + t.height > vh - VIEWPORT_PADDING) {
          top = Math.max(VIEWPORT_PADDING, vh - t.height - VIEWPORT_PADDING);
        }
      }

      const arrowLeft = Math.max(12, Math.min(centerX - left, t.width - 12));
      setPos({ top, left, arrowLeft, placement });
    };

    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [show, anchorRef, title, description]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          ref={tipRef}
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: pos ? 1 : 0, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: 0.15 }}
          role="tooltip"
          style={{
            position: "fixed",
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            width: TOOLTIP_WIDTH,
          }}
          className="z-[9999] bg-slate-900/95 backdrop-blur-md text-white text-xs rounded-xl p-3 shadow-xl pointer-events-none border border-white/10"
        >
          <div className="flex gap-2 items-start">
            <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-100 text-left">{title}</p>
              <p className="text-slate-300 mt-0.5 leading-relaxed text-left">{description}</p>
            </div>
          </div>
          {/* Носик — направлен к триггеру в зависимости от placement */}
          {pos && (
            <div
              className={cn(
                "absolute border-4 border-transparent",
                pos.placement === "top"
                  ? "top-full border-t-slate-900/95"
                  : "bottom-full border-b-slate-900/95"
              )}
              style={{ left: pos.arrowLeft, transform: "translateX(-50%)" }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function FeatureLock({
  children,
  enabled = true,
  title = "Скоро доступно",
  description,
  variant = "block",
  className,
}: FeatureLockProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  if (!enabled) return <>{children}</>;

  const showOverlay = isHovered || isFocused;
  // Разные дефолты для маленьких тултипов и больших оверлеев.
  const resolvedDescription =
    description ?? (variant === "inline" ? LOCK_COPY.tooltip : LOCK_COPY.screen);

  if (variant === "inline") {
    return (
      <div
        ref={wrapperRef}
        className={cn("relative inline-block group", className)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        tabIndex={0}
        role="region"
        aria-label={`${title}: ${resolvedDescription}`}
      >
        {/* Child wrapper - disabled interactions */}
        <div className="pointer-events-none select-none opacity-60 filter saturate-50 cursor-not-allowed">
          {children}
        </div>

        {/* Lock Icon Badge */}
        <div className="absolute -top-1 -right-1 bg-amber-500 text-white rounded-full p-0.5 shadow-sm z-10">
          <Lock className="w-2.5 h-2.5" />
        </div>

        {/* Viewport-aware tooltip (в портале, не обрезается родителем) */}
        <ViewportTooltip
          show={showOverlay}
          anchorRef={wrapperRef}
          title={title}
          description={resolvedDescription}
        />
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
      aria-label={`${title}: ${resolvedDescription}`}
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
      <div className="absolute top-4 right-4 bg-slate-100/80 backdrop-blur-md text-slate-500 text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-200/50 flex items-center gap-1.5 shadow-sm group-hover:opacity-0 transition-opacity duration-300 pointer-events-none z-30">
        <Lock className="w-3.5 h-3.5 text-amber-500" />
        <span>{LOCK_COPY.badge}</span>
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
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{resolvedDescription}</p>
              </div>
              <div className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>{LOCK_COPY.hint}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
