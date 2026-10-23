"use client";

import { cn } from "@/lib/utils";
import { sanitizeWholeNumber, stepNumber } from "@/lib/form-fields";
import { forwardRef, type InputHTMLAttributes } from "react";
import { Minus, Plus } from "lucide-react";

export interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode" | "min" | "max" | "step" | "defaultValue"> {
  /** The digits as typed ("" = empty). */
  value: string;
  /** Called with the digits only ("" when emptied). */
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  /** The size of one step (stepper buttons and the ArrowUp / ArrowDown keys), default 1. */
  step?: number;
  /** Our «−» / «+» buttons inside the field, where a step makes sense (lessons left, a group's seats).  Never the browser's spinner. */
  stepper?: boolean;
  /** The classes of the wrapper (its width and margins). */
  wrapperClassName?: string;
  /** Shown red even when the number itself is inside [min, max]. */
  invalid?: boolean;
}

/**
 * The whole-number field of the platform.  No browser spinner and no scroll-wheel surprises (it is a text field with the
 * numeric keypad): typing keeps only digits, `stepper` adds our own «−» / «+» buttons, ArrowUp / ArrowDown step too, and a number
 * outside [min, max] turns the border red.  Money fields keep their own formatted input with the «сум» suffix (`price-fields.tsx`).
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onChange, min, max, step = 1, stepper = false, className, wrapperClassName, invalid = false, disabled, onKeyDown, ...rest },
  ref,
) {
  const parsed = value.trim() === "" ? null : Number(value);
  const outOfRange = parsed !== null && ((min !== undefined && parsed < min) || (max !== undefined && parsed > max));
  const canDown = !disabled && (parsed === null || min === undefined || parsed > min);
  const canUp = !disabled && (parsed === null || max === undefined || parsed < max);
  const bump = (delta: number) => onChange(stepNumber(value, delta, min, max));

  return (
    <div className={cn("relative w-full", wrapperClassName)}>
      <input
        {...rest}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete={rest.autoComplete ?? "off"}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || outOfRange ? true : undefined}
        onChange={(event) => onChange(sanitizeWholeNumber(event.target.value, min !== undefined && min < 0))}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || disabled || !stepper) return;
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            bump(event.key === "ArrowUp" ? step : -step);
          }
        }}
        className={cn(
          "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400",
          "focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-60",
          className,
          (invalid || outOfRange) && "border-red-400 focus:border-red-500 focus:ring-red-500/20",
          stepper && "pr-14",
        )}
      />
      {stepper && (
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
          <StepButton label="Меньше" disabled={!canDown} onClick={() => bump(-step)}><Minus className="h-3.5 w-3.5" /></StepButton>
          <StepButton label="Больше" disabled={!canUp} onClick={() => bump(step)}><Plus className="h-3.5 w-3.5" /></StepButton>
        </div>
      )}
    </div>
  );
});

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      disabled={disabled}
      // keep the focus (and the phone's keypad) in the field
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary-600 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}
