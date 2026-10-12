"use client";

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { MathRenderer } from "@/components/ui/math-renderer";
import { ScrollHint } from "@/components/ui/scroll-hint";
import { pickOptionDisplayProjection } from "@/lib/task-display";

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

  const optionDisplays = useMemo(
    () => options.map((option) => pickOptionDisplayProjection(option.content, option.contentLatex)),
    [options],
  );

  // Long prose inside an answer is not an edge case: theory questions and
  // multi-step explanations legitimately have it.  Put such options in one
  // column so the card can grow vertically rather than forcing KaTeX outside
  // a half-width grid cell.
  const hasLongOption = optionDisplays.some(({ text: display }) => {
    return display.length > 80 || /\\text\{|\n/.test(display);
  });

  const resetKey = useMemo(
    () => `${questionKey}|${options.map((o) => o.id).join("|")}`,
    [questionKey, options],
  );

  useEffect(() => {
    setPending(null);
  }, [resetKey]);

  function handleClick(answerValue: string) {
    if (disabled) return;

    if (pending === answerValue) {
      onSelect(answerValue);
      return;
    }

    setPending(answerValue);
  }

  return (
    <div className={cn("grid w-full grid-cols-1 gap-3 md:gap-4", !hasLongOption && "md:grid-cols-2")}>
      {options.map((opt, idx) => {
        const display = optionDisplays[idx];
        const isConfirmed = selected === opt.key;
        const isPending = pending === opt.key;
        const isActive = isConfirmed || isPending;
        const isOddLast = options.length % 2 === 1 && idx === options.length - 1;

        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleClick(opt.key)}
            disabled={disabled}
            className={cn(
              "group glass-option relative flex min-w-0 items-start gap-4 overflow-hidden rounded-2xl p-4 text-left cursor-pointer md:gap-5 md:p-5",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
              isOddLast && !hasLongOption && "md:col-span-2 md:justify-center",
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

            {/* inside a button: the edge fade only (a focusable scroll region cannot nest in a button). The formula
                itself scrolls: select-none, and pointer events are NOT disabled, so wheel / touch / drag reach it. */}
            <ScrollHint focusable={false} className={cn("min-w-0 flex-1 overflow-x-auto overflow-y-hidden py-0.5 no-scrollbar", isOddLast && "flex-initial")}>
              <MathRenderer
                text={display.text}
                renderMode={display.renderMode}
                block
                focusable={false}
                className={cn(
                  "min-w-0 max-w-full font-sans text-base break-words select-none transition-colors md:text-lg",
                  isActive ? "text-slate-900" : "text-slate-700 group-hover:text-slate-900",
                )}
              />
            </ScrollHint>

            {isConfirmed && (
              <div className="absolute right-5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary-500 shadow-sm" />
            )}
          </button>
        );
      })}
    </div>
  );
}
