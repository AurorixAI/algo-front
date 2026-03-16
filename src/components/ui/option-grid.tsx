"use client";

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface OptionGridProps {
  options: { key: string; label: string; content: string }[];
  selected: string;
  onSelect: (key: string) => void;
  disabled?: boolean;
}

/**
 * OptionGrid — glass-морфная сетка вариантов ответа (A/B/C/D).
 * Двойное подтверждение: первый клик выделяет вариант,
 * второй клик подтверждает выбор и вызывает onSelect.
 */
export function OptionGrid({ options, selected, onSelect, disabled = false }: OptionGridProps) {
  const [pending, setPending] = useState<string | null>(null);

  /* Стабильный ключ: меняется только когда реально меняются варианты */
  const optionsKey = useMemo(() => options.map(o => o.key + o.content).join("|"), [options]);

  /* Сброс pending при смене вопроса */
  useEffect(() => {
    setPending(null);
  }, [optionsKey]);

  function handleClick(key: string) {
    if (disabled) return;
    if (pending === key) {
      /* Второй клик — подтверждаем */
      setPending(null);
      onSelect(key);
    } else {
      /* Первый клик — подсвечиваем */
      setPending(key);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 w-full">
      {options.map((opt) => {
        const isSelected = selected === opt.key;
        const isPending = pending === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => handleClick(opt.key)}
            disabled={disabled}
            className={cn(
              "group glass-option rounded-2xl p-4 md:p-5 flex items-center gap-4 md:gap-5 text-left relative overflow-hidden cursor-pointer",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
              isSelected && "selected !border-primary-500 !bg-white !shadow-[0_8px_24px_rgba(37,99,235,0.2)]",
              isPending && !isSelected && "selected !border-primary-500 !bg-white !shadow-[0_8px_24px_rgba(37,99,235,0.2)]"
            )}
          >
            {/* Letter circle */}
            <div
              className={cn(
                "w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center font-sans font-bold text-sm border transition-colors flex-shrink-0",
                isSelected || isPending
                  ? "bg-primary-500 text-white border-primary-500 shadow-md"
                  : "bg-white shadow-sm text-slate-400 border-slate-100 group-hover:text-primary-500 group-hover:border-primary-200"
              )}
            >
              {isSelected || isPending ? <Check className="w-4 h-4" /> : opt.label}
            </div>

            {/* Answer text */}
            <span
              className={cn(
                "font-sans text-base md:text-lg transition-colors",
                isSelected || isPending ? "text-slate-900" : "text-slate-700 group-hover:text-slate-900"
              )}
            >
              {opt.content}
            </span>

            {/* Selection dot */}
            {isSelected && (
              <div className="absolute right-5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}
