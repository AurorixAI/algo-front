"use client";

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { MathRenderer } from "@/components/ui/math-renderer";
import { pickAnswerDisplayText, pickOptionDisplayText } from "@/lib/task-display";

export interface OptionItem {
  id: string;
  key: string;
  label: string;
  content: string;
  contentLatex?: string | null;
}

interface OptionGridProps {
  options: OptionItem[];
  selected: string;
  onSelect: (key: string) => void;
  disabled?: boolean;
  /** Сбрасывает pending при смене вопроса */
  questionKey?: string;
}

/**
 * Двухшаговый выбор: 1-й клик — галочка (pending), 2-й на тот же вариант — подтверждение + onSelect.
 */
export function OptionGrid({
  options,
  selected,
  onSelect,
  disabled = false,
  questionKey = "",
}: OptionGridProps) {
  const [pending, setPending] = useState<string | null>(null);

  const resetKey = useMemo(
    () => `${questionKey}|${options.map((o) => o.id).join("|")}`,
    [questionKey, options],
  );

  useEffect(() => {
    setPending(null);
  }, [resetKey]);

  /**
   * Use a single-column layout when any option text is long (> 80 chars).
   * Long LaTeX formulas and multi-line math break the 2-column grid:
   * options get clipped and require scroll in the mobile viewport.
   */
  const useSingleCol = useMemo(
    () =>
      options.some(
        (o) => (o.contentLatex || o.content || "").length > 80,
      ),
    [options],
  );

  function handleClick(answerValue: string) {
    if (disabled) return;

    if (pending === answerValue) {
      onSelect(answerValue);
      return;
    }

    setPending(answerValue);
  }

  return (
    <div
      className={cn(
        "grid gap-3 md:gap-4 w-full",
        useSingleCol ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2",
      )}
    >
      {options.map((opt) => {
        const isConfirmed = selected === opt.key;
        const isPending = pending === opt.key;
        const isActive = isConfirmed || isPending;

        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleClick(opt.key)}
            disabled={disabled}
            className={cn(
              "group glass-option rounded-2xl p-4 md:p-5 flex items-center gap-4 md:gap-5 text-left relative cursor-pointer",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
              isActive && "selected !border-primary-500 !bg-white !shadow-[0_8px_24px_rgba(37,99,235,0.2)]",
            )}
          >
            <div
              className={cn(
                "w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center font-sans font-bold text-sm border transition-colors flex-shrink-0",
                isActive
                  ? "bg-primary-500 text-white border-primary-500 shadow-md"
                  : "bg-white shadow-sm text-slate-400 border-slate-100 group-hover:text-primary-500 group-hover:border-primary-200",
              )}
            >
              {isActive ? <Check className="w-4 h-4" /> : opt.label}
            </div>

            <MathRenderer
              text={pickOptionDisplayText(opt.content, opt.contentLatex)}
              className={cn(
                "flex-1 min-w-0 font-sans text-base md:text-lg transition-colors pointer-events-none break-words",
                isActive ? "text-slate-900" : "text-slate-700 group-hover:text-slate-900",
              )}
            />

            {isConfirmed && (
              <div className="absolute right-5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary-500 shadow-sm" />
            )}
          </button>
        );
      })}
    </div>
  );
}
