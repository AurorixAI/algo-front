"use client";

import { cn } from "@/lib/utils";
import { forwardRef, InputHTMLAttributes, useId } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, id, ...props }, ref) => {
    // The label is tied to the field by id, so the field's accessible name is the label and not the placeholder.
    const generatedId = useId();
    const inputId = id ?? generatedId;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            className={cn(
              "w-full px-4 py-2.5 rounded-xl",
              "bg-white/80 backdrop-blur-sm",
              "border border-slate-200",
              "text-slate-900 placeholder:text-slate-400",
              "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500",
              "transition-[border-color,background-color,box-shadow] duration-200",
              icon && "pl-10",
              error && "border-red-400 focus:ring-red-500/20 focus:border-red-500",
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
