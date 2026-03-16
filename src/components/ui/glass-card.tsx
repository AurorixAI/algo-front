"use client";

import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";
import { forwardRef, ReactNode } from "react";

interface GlassCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  variant?: "default" | "elevated" | "subtle" | "panel";
  glow?: boolean;
  children?: ReactNode;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = "default", glow = false, children, ...props }, ref) => {
    const variants = {
      default:
        "bg-white/90 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)]",
      elevated:
        "bg-white/95 backdrop-blur-2xl border border-white/80 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)]",
      subtle:
        "bg-white/70 backdrop-blur-lg border border-white/40 shadow-[0_4px_16px_rgba(0,0,0,0.04)]",
      panel:
        "bg-gradient-to-b from-white to-white/90 backdrop-blur-2xl border border-white/80 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)]",
    };

    return (
      <motion.div
        ref={ref}
        className={cn(
          variant === "panel" ? "rounded-[2rem] md:rounded-[2.5rem]" : "rounded-2xl",
          variants[variant],
          glow && "animate-glow-pulse",
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

GlassCard.displayName = "GlassCard";
