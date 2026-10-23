"use client";

import { cn } from "@/lib/utils";
import { nextRadioIndex } from "@/lib/form-fields";
import { forwardRef, useRef, type InputHTMLAttributes, type ReactNode } from "react";

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /**
   * No dot of its own: the input is only visually hidden and the card / row around it shows the choice
   * (give that label `has-[:focus-visible]:ring-2` or `focus-within:ring-2`).  For option cards with an icon and a hint.
   */
  bare?: boolean;
}

/**
 * The radio of the platform: a round box with a primary dot, a focus ring for the keyboard, a faded look when disabled.
 * It wraps the NATIVE `<input type="radio">` (the arrow keys, the group by `name`, the label click and the screen reader stay
 * the browser's own); props go to the input, `className` to the wrapper (margins, `shrink-0`).  Use it inside a `<label>`.
 * For a short choice of 2–6 options prefer {@link SegmentedControl}.
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio({ className, bare = false, ...props }, ref) {
  if (bare) {
    return <input {...props} ref={ref} type="radio" className={cn("sr-only", className)} />;
  }
  return (
    <span className={cn("relative inline-flex h-[18px] w-[18px] shrink-0", className)}>
      <input
        {...props}
        ref={ref}
        type="radio"
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none flex h-full w-full items-center justify-center rounded-full border border-slate-300 bg-white shadow-xs transition-colors",
          "peer-hover:border-primary-400 peer-focus-visible:border-primary-500 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/40",
          "peer-checked:border-primary-600 peer-checked:bg-primary-600 peer-checked:peer-hover:border-primary-700 peer-checked:peer-hover:bg-primary-700",
          "peer-disabled:border-slate-200 peer-disabled:bg-slate-100 peer-disabled:opacity-60 peer-disabled:peer-checked:border-primary-300 peer-disabled:peer-checked:bg-primary-300",
          "peer-checked:[&>span]:scale-100",
        )}
      >
        <span className="h-1.5 w-1.5 scale-0 rounded-full bg-white transition-transform" />
      </span>
    </span>
  );
});

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: ReactNode;
  disabled?: boolean;
  /** A native tooltip. */
  title?: string;
}

export interface SegmentedControlProps<V extends string = string> {
  value: V | "" | null | undefined;
  onChange: (value: V) => void;
  options: readonly SegmentedOption<V>[];
  /** The accessible name of the group (or point `ariaLabelledBy` at a visible label). */
  ariaLabel?: string;
  ariaLabelledBy?: string;
  disabled?: boolean;
  testId?: string;
  /** The classes of the group: the grid / flex that lays the buttons out (default: equal-width columns). */
  className?: string;
  /** The classes of every button (a padding or text size of the form). */
  buttonClassName?: string;
}

/**
 * A short choice (2–6 options) as a row of option buttons: `role="radiogroup"` with `role="radio"` buttons, the chosen one in the
 * primary colour.  Keyboard like a native radio group: Tab reaches the chosen option only, the arrows move AND choose (skipping
 * disabled ones, wrapping around), Home / End jump to the ends.  The payment methods use it.
 */
export function SegmentedControl<V extends string = string>({
  value, onChange, options, ariaLabel, ariaLabelledBy, disabled = false, testId, className, buttonClassName,
}: SegmentedControlProps<V>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const isOff = options.map((option) => disabled || Boolean(option.disabled));
  const selected = options.findIndex((option) => option.value === value);
  // Tab lands on the chosen option; with none chosen on the first enabled one.
  const tabStop = selected >= 0 && !isOff[selected] ? selected : isOff.findIndex((off) => !off);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = nextRadioIndex(isOff, index, event.key);
    if (next < 0) return;
    event.preventDefault();
    event.stopPropagation();
    refs.current[next]?.focus();
    if (next !== selected) onChange(options[next].value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-disabled={disabled || undefined}
      data-testid={testId}
      className={cn("grid gap-1.5", className ?? "grid-flow-col auto-cols-fr")}
    >
      {options.map((option, index) => {
        const checked = index === selected;
        return (
          <button
            key={option.value}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={isOff[index]}
            title={option.title}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => { if (!checked) onChange(option.value); }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "w-full rounded-lg border px-2 py-2 text-center text-xs font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40",
              checked ? "border-primary-300 bg-primary-50 text-primary-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white",
              buttonClassName,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
