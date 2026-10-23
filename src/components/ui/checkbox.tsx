"use client";

import { cn } from "@/lib/utils";
import { forwardRef, useCallback, useEffect, useRef, type InputHTMLAttributes } from "react";
import { Check, Minus } from "lucide-react";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** «Some of the group»: the box shows a dash (the native `indeterminate` state; a click makes it checked or unchecked as usual). */
  indeterminate?: boolean;
  /** `md` 18 px (default), `sm` 16 px for dense lists. */
  size?: "sm" | "md";
}

/**
 * The checkbox of the platform: a rounded box, the primary colour when checked, a dash for a partly chosen group, a focus ring
 * for the keyboard and a faded look when disabled.  It wraps the NATIVE `<input type="checkbox">` (laid invisibly over the box),
 * so the keyboard, the label click, `required`, the form value and the screen reader all stay the browser's own; props go to the
 * input, `className` to the box's wrapper (margins, `shrink-0`, `print:hidden`).
 *
 * Use it inside a `<label>` (or with `aria-label`): the label text is not part of the component.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, indeterminate = false, size = "md", disabled, ...props },
  forwardedRef,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );
  // `indeterminate` exists only as a DOM property: the screen reader reads it as «partly checked».
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate, props.checked]);

  return (
    <span className={cn("relative inline-flex shrink-0", size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]", className)}>
      <input
        {...props}
        ref={setRef}
        type="checkbox"
        disabled={disabled}
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none flex h-full w-full items-center justify-center rounded-md border border-slate-300 bg-white text-white shadow-xs transition-colors",
          "peer-hover:border-primary-400 peer-focus-visible:border-primary-500 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/40",
          "peer-checked:border-primary-600 peer-checked:bg-primary-600 peer-checked:peer-hover:border-primary-700 peer-checked:peer-hover:bg-primary-700",
          "peer-disabled:border-slate-200 peer-disabled:bg-slate-100 peer-disabled:opacity-60 peer-disabled:peer-checked:border-primary-300 peer-disabled:peer-checked:bg-primary-300",
          "peer-checked:[&>svg]:opacity-100",
          indeterminate && "border-primary-600 bg-primary-600",
        )}
      >
        {indeterminate ? (
          <Minus className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={3} />
        ) : (
          <Check className={cn("opacity-0 transition-opacity", size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} strokeWidth={3} />
        )}
      </span>
    </span>
  );
});
