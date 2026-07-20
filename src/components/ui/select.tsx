"use client";

import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

interface SelectProps {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  buttonClassName?: string;
}

export function Select({
  className,
  buttonClassName,
  label,
  error,
  options,
  placeholder = "Выберите...",
  value,
  onChange,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (val: string) => {
    onChange?.(val);
    setOpen(false);
  };

  return (
    <div className={cn("w-full relative", className)} ref={ref}>
      {label && (
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            "w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-all duration-200 cursor-pointer flex items-center justify-between gap-2",
            "bg-slate-50 border border-slate-200 text-slate-900 shadow-xs",
            "hover:border-slate-300 hover:bg-slate-100/70",
            "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:bg-white",
            open && "border-primary-500 ring-2 ring-primary-500/10 bg-white shadow-sm",
            !selectedOption && "text-slate-400",
            error && "border-red-400 focus:ring-red-500/20 focus:border-red-500",
            buttonClassName
          )}
        >
          <span className="truncate flex items-center gap-2">
            {selectedOption?.icon}
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
              open && "rotate-180 text-primary-500"
            )}
          />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute z-50 top-full mt-1.5 left-0 w-full bg-white border border-slate-100 rounded-xl shadow-xl p-1.5 max-h-60 overflow-y-auto overscroll-contain
                [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full"
            >
              {options.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-400 text-center">
                  Нет вариантов
                </div>
              ) : (
                options.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleSelect(option.value)}
                      className={cn(
                        "w-full px-3.5 py-2.5 rounded-lg text-left text-sm transition-all duration-150 flex items-center justify-between gap-2 cursor-pointer my-0.5",
                        isSelected
                          ? "bg-primary-50/80 text-primary-700 font-semibold"
                          : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {option.icon}
                        <div className="truncate">
                          <div>{option.label}</div>
                          {option.sublabel && (
                            <div className="text-[11px] text-slate-400 font-normal">
                              {option.sublabel}
                            </div>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-primary-600 shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}
