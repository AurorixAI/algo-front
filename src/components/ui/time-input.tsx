"use client";

import { cn } from "@/lib/utils";
import { maskTimeInput, normalizeTimeValue, parseTimeText } from "@/lib/form-fields";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type InputHTMLAttributes } from "react";
import { Clock } from "lucide-react";

export interface TimeInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode" | "maxLength" | "defaultValue" | "min" | "max" | "step"> {
  /** «ЧЧ:ММ» (24 h) or "" (nothing chosen); «ЧЧ:ММ:СС» from the API is shown without the seconds. */
  value: string;
  /** Called with «ЧЧ:ММ», or "" while the text is not a complete time. */
  onChange: (value: string) => void;
  /** The classes of the wrapper (its width and margins). */
  wrapperClassName?: string;
  /** Shown red even when the time itself is fine (the form's own rule failed). */
  invalid?: boolean;
}

/**
 * The time field of the platform: 24 h «15:00» whatever the browser's locale (no AM/PM, no spinner), typed with a mask
 * («1500», «930», «9:30» all become «15:00», «09:30», «09:30»).  The value is «ЧЧ:ММ», like the native field's was.
 */
export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(function TimeInput(
  { value, onChange, className, wrapperClassName, invalid = false, disabled, required, onBlur, onKeyDown, placeholder = "15:00", ...rest },
  forwardedRef,
) {
  const shown = normalizeTimeValue(value) || value;
  const [text, setText] = useState(shown);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

  // The parent changed the value (a reset, a default): show it.  A half-typed text with the value "" is left alone.
  useEffect(() => {
    const parsed = parseTimeText(text) ?? "";
    if (parsed !== normalizeTimeValue(value)) setText(normalizeTimeValue(value) || value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const parsed = parseTimeText(text);
  const broken = text !== "" && parsed === null;
  const problem = broken ? "Введите время в формате чч:мм, например 15:00" : "";

  // A native form (required, Enter) refuses a half-typed time, like <input type="time"> did.
  useEffect(() => {
    inputRef.current?.setCustomValidity(problem);
  }, [problem]);

  const commit = (nextText: string, final: boolean) => {
    setText(nextText);
    const time = parseTimeText(nextText);
    // While typing only «ЧЧ:ММ» is complete; «930» / «0930» are taken on blur / Enter.
    const complete = time !== null && (final || /^\d{2}:\d{2}$/.test(nextText));
    if (complete) {
      if (time !== normalizeTimeValue(value)) onChange(time);
      if (final) setText(time);
    } else if (value !== "") {
      onChange("");
    }
  };

  return (
    <div className={cn("relative w-full", wrapperClassName)}>
      <input
        {...rest}
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={5}
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        required={required}
        aria-invalid={invalid || broken ? true : undefined}
        title={problem || rest.title}
        onChange={(event) => commit(maskTimeInput(event.target.value, text), false)}
        onBlur={(event) => {
          if (text !== "" && parsed !== null) commit(text, true);
          onBlur?.(event);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (!event.defaultPrevented && event.key === "Enter" && parsed !== null && text !== parsed) commit(text, true);
        }}
        className={cn(
          "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400",
          "focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-60",
          className,
          (invalid || broken) && "border-red-400 focus:border-red-500 focus:ring-red-500/20",
          "pr-9",
        )}
      />
      <Clock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
    </div>
  );
});
