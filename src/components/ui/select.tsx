"use client";

import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  className?: string;
}

export function Select({ className, label, error, options, placeholder, value, onChange }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (val: string) => {
    onChange?.({ target: { value: val } });
    setOpen(false);
  };

  const handleToggle = () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && ref.current) {
      setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  };

  return (
    <div className="w-full" ref={ref}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            "w-full px-4 py-2.5 rounded-xl text-left",
            "bg-white/80 backdrop-blur-sm",
            "border border-slate-200",
            "text-slate-900",
            "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500",
            "transition-all duration-200",
            "cursor-pointer",
            !selected && !value && "text-slate-400",
            error && "border-red-400 focus:ring-red-500/20 focus:border-red-500",
            className
          )}
        >
          {selected?.label || placeholder || "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435..."}
        </button>
        <ChevronDown className={cn(
          "absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none transition-transform",
          open && "rotate-180"
        )} />

        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto overscroll-contain
            [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={cn(
                  "w-full px-4 py-2.5 text-left text-sm transition-colors",
                  "hover:bg-primary-50 hover:text-primary-700",
                  option.value === value
                    ? "bg-primary-50 text-primary-700 font-medium"
                    : "text-slate-700",
                  "first:rounded-t-xl last:rounded-b-xl"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}

Select.displayName = "Select";
