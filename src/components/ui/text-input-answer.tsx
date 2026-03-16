"use client";

import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { KeyboardEvent } from "react";

interface TextInputAnswerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  answerType?: string;
  placeholder?: string;
  disabled?: boolean;
  submitting?: boolean;
}

/**
 * TextInputAnswer — стеклянное поле ввода ответа с gradient-glow.
 * Дизайн по макету: glass-контейнер, math-шрифт, кнопка-стрелка.
 */
export function TextInputAnswer({
  value,
  onChange,
  onSubmit,
  answerType,
  placeholder,
  disabled = false,
  submitting = false,
}: TextInputAnswerProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !disabled && value.trim()) {
      onSubmit();
    }
  };

  const hint =
    answerType === "numeric" || answerType === "exact_number"
      ? "Число (например: 42, -3.5)"
      : answerType === "fraction"
      ? "Дробь (например: 3/4)"
      : answerType === "expression"
      ? "Выражение (например: 2x + 3)"
      : answerType === "equation_solution"
      ? "Решение уравнения"
      : "Введите ответ";

  const filled = value.trim().length > 0;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="relative group w-full">
        {/* Gradient glow behind */}
        <div
          className={cn(
            "absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl blur transition duration-500",
            filled ? "opacity-40" : "opacity-20 group-hover:opacity-40"
          )}
        />

        {/* Glass container */}
        <div
          className={cn(
            "relative flex items-center bg-white/70 backdrop-blur-xl border border-white/60 rounded-xl shadow-sm",
            "transition-all focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:bg-white/95"
          )}
        >
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            autoFocus
            placeholder={placeholder || hint}
            className="w-full bg-transparent border-none px-6 py-4 text-xl font-sans text-slate-800 placeholder:text-slate-400 placeholder:font-sans focus:ring-0 focus:outline-none disabled:opacity-50"
          />

          <button
            onClick={onSubmit}
            disabled={disabled || !filled || submitting}
            className={cn(
              "mr-3 p-2.5 rounded-lg transition-all shadow-sm flex-shrink-0",
              filled && !disabled
                ? "bg-blue-500 text-white hover:bg-blue-600"
                : "bg-blue-500/10 text-blue-500 cursor-not-allowed opacity-60"
            )}
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <ArrowRight className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
