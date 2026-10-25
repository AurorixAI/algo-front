"use client";

import { cn } from "@/lib/utils";
import { forwardRef, TextareaHTMLAttributes, useId } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  /** A line under the field («Необязательно», a character counter). */
  hint?: string;
}

/**
 * The multi-line text field of the platform: the look of `Input` (rounded, white, a primary focus ring), the label tied by id,
 * the error under the field and `aria-invalid` for a screen reader.  Vertical resize only.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, rows = 3, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const noteId = `${fieldId}-note`;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={fieldId} className="block text-sm font-medium text-slate-700 mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          className={cn(
            "w-full resize-y px-4 py-2.5 rounded-xl",
            "bg-white/80 backdrop-blur-sm",
            "border border-slate-200",
            "text-slate-900 placeholder:text-slate-400",
            "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500",
            "transition-[border-color,background-color,box-shadow] duration-200 disabled:opacity-60",
            error && "border-red-400 focus:ring-red-500/20 focus:border-red-500",
            className,
          )}
          {...props}
        />
        {error ? (
          <p id={noteId} className="mt-1.5 text-xs text-red-500">{error}</p>
        ) : hint ? (
          <p id={noteId} className="mt-1.5 text-xs text-slate-400">{hint}</p>
        ) : null}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";
