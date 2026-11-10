"use client";

import { cn } from "@/lib/utils";
import { maskTimeInput, normalizeTimeValue, parseTimeText } from "@/lib/form-fields";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
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
 * The clock at the right is a BUTTON (and Alt+↓ in the field): it opens a choice with two columns - the hours 00-23 and the minutes in steps of 5, 24 h, no AM/PM.  The typed mask stays.
 * Keyboard (the focus stays in the field): ↑ ↓ move in a column, ← → change the column, Enter takes the option, Esc closes.  On a phone every row is ≥ 40 px and the panel never leaves the screen.
 */
export const TIME_HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
export const TIME_MINUTES = Array.from({ length: 12 }, (_, step) => String(step * 5).padStart(2, "0"));
/** Where the columns are scrolled to when nothing is chosen. */
export const TIME_PICKER_EMPTY_HOUR = "09";
export const TIME_PICKER_EMPTY_MINUTE = "00";

export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(function TimeInput(
  { value, onChange, className, wrapperClassName, invalid = false, disabled, required, onBlur, onKeyDown, placeholder = "Укажите время", ...rest },
  forwardedRef,
) {
  const shown = normalizeTimeValue(value) || value;
  const [text, setText] = useState(shown);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  /** The highlighted option of the keyboard: a column (0 hours, 1 minutes) and a row. */
  const [cursor, setCursor] = useState<{ col: 0 | 1; row: number }>({ col: 0, row: 0 });

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

  // ── the choice of the clock ──────────────────────────────────────────────────────────────────────────────────────────────────
  const current = parsed ?? "";
  const [currentHour, currentMinute] = current ? current.split(":") : ["", ""];
  const pick = (hour: string, minute: string) => commit(`${hour}:${minute}`, true);

  const openPicker = useCallback(() => {
    if (disabled) return;
    const hour = currentHour || TIME_PICKER_EMPTY_HOUR;
    const minute = currentMinute || TIME_PICKER_EMPTY_MINUTE;
    setCursor({ col: 0, row: Math.max(0, TIME_HOURS.indexOf(hour)) });
    // the minutes of a time that is not a multiple of 5 stay unmarked, the column scrolls to the nearest step
    void minute;
    setOpen(true);
  }, [disabled, currentHour, currentMinute]);
  const closePicker = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) inputRef.current?.focus();
  }, []);

  // place the panel under the field (above it when there is no room), inside the screen; follow the scroll and the resize while it is open
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const box = wrapperRef.current?.getBoundingClientRect();
      if (!box) return;
      const width = 184;
      const room = { below: window.innerHeight - box.bottom - 8, above: box.top - 8 };
      const height = Math.min(240, Math.max(room.below, room.above));
      const top = room.below >= Math.min(240, room.above) ? box.bottom + 4 : Math.max(8, box.top - height - 4);
      const left = Math.min(Math.max(8, box.right - width), window.innerWidth - width - 8);
      setPlace({ top, left, maxHeight: height });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  // every column is scrolled so that its value (09 : 00 when empty) stands in the band in the middle: the hour and the minutes are ONE line
  const centerRow = (column: "hours" | "minutes", key: string) => {
    const list = panelRef.current?.querySelector<HTMLElement>(`[data-column="${column}"]`);
    if (!list) return;
    let option = list.querySelector<HTMLElement>(`[data-key="${key}"]`);
    // a minute that is not a multiple of 5: the nearest step
    if (!option && column === "minutes") option = list.querySelector<HTMLElement>(`[data-key="${String((Math.round(Number(key) / 5) * 5) % 60).padStart(2, "0")}"]`);
    if (option) list.scrollTop = option.offsetTop - (list.clientHeight - option.offsetHeight) / 2;
  };
  useEffect(() => {
    if (!open || !place) return;
    centerRow("hours", currentHour || TIME_PICKER_EMPTY_HOUR);
    centerRow("minutes", currentMinute || TIME_PICKER_EMPTY_MINUTE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place, currentHour, currentMinute]);

  // a click outside closes it (a click on the field or on the clock is the field's own business)
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || wrapperRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  // the option of the keyboard stands in the band
  useEffect(() => {
    if (!open) return;
    centerRow(cursor.col === 0 ? "hours" : "minutes", (cursor.col === 0 ? TIME_HOURS : TIME_MINUTES)[cursor.row]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cursor]);

  const onPickerKey = (event: React.KeyboardEvent<HTMLInputElement>): boolean => {
    const size = cursor.col === 0 ? TIME_HOURS.length : TIME_MINUTES.length;
    if (event.key === "Escape") { closePicker(); return true; }
    if (event.key === "ArrowDown") { setCursor({ ...cursor, row: (cursor.row + 1) % size }); return true; }
    if (event.key === "ArrowUp") { setCursor({ ...cursor, row: (cursor.row + size - 1) % size }); return true; }
    if (event.key === "ArrowRight" && cursor.col === 0) { setCursor({ col: 1, row: Math.max(0, TIME_MINUTES.indexOf(currentMinute) >= 0 ? TIME_MINUTES.indexOf(currentMinute) : 0) }); return true; }
    if (event.key === "ArrowLeft" && cursor.col === 1) { setCursor({ col: 0, row: Math.max(0, TIME_HOURS.indexOf(currentHour || TIME_PICKER_EMPTY_HOUR)) }); return true; }
    if (event.key === "Enter") {
      if (cursor.col === 0) { pick(TIME_HOURS[cursor.row], currentMinute || TIME_PICKER_EMPTY_MINUTE); setCursor({ col: 1, row: Math.max(0, TIME_MINUTES.indexOf(currentMinute || TIME_PICKER_EMPTY_MINUTE)) }); }
      else { pick(currentHour || TIME_PICKER_EMPTY_HOUR, TIME_MINUTES[cursor.row]); closePicker(); }
      return true;
    }
    return false;
  };

  const option = (column: 0 | 1, key: string, row: number, selected: boolean) => {
    const highlighted = open && cursor.col === column && cursor.row === row;
    const suggested = !selected && (column === 0 ? !currentHour && key === TIME_PICKER_EMPTY_HOUR : !currentMinute && key === TIME_PICKER_EMPTY_MINUTE);
    return (
      <button
        key={key}
        type="button"
        role="option"
        tabIndex={-1}
        aria-selected={selected}
        data-key={key}
        data-selected={selected || undefined}
        // the focus stays in the field: a mouse press must not take it
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (column === 0) { pick(key, currentMinute || TIME_PICKER_EMPTY_MINUTE); setCursor({ col: 1, row: Math.max(0, TIME_MINUTES.indexOf(currentMinute || TIME_PICKER_EMPTY_MINUTE)) }); }
          else { pick(currentHour || TIME_PICKER_EMPTY_HOUR, key); closePicker(); }
        }}
        className={cn(
          "relative z-10 flex h-[var(--row)] w-full snap-center items-center justify-center rounded-lg text-sm tabular-nums transition-colors",
          selected ? "font-semibold text-primary-800" : highlighted || suggested ? "text-primary-700" : "text-slate-700 hover:bg-slate-100",
        )}
      >
        {key}
      </button>
    );
  };

  return (
    <div ref={wrapperRef} className={cn("relative w-full", wrapperClassName)}>
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
        aria-haspopup="dialog"
        aria-expanded={open}
        title={problem || rest.title}
        onChange={(event) => commit(maskTimeInput(event.target.value, text), false)}
        onBlur={(event) => {
          if (text !== "" && parsed !== null) commit(text, true);
          onBlur?.(event);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); event.stopPropagation(); if (open) closePicker(false); else openPicker(); return; }
          // the keys of an open choice are the choice's: Esc closes IT, not the window around it
          if (open && onPickerKey(event)) { event.preventDefault(); event.stopPropagation(); return; }
          if (event.key === "Enter" && parsed !== null && text !== parsed) commit(text, true);
        }}
        className={cn(
          "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-500",
          "focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-60",
          className,
          (invalid || broken) && "border-red-400 focus:border-red-500 focus:ring-red-500/20",
          "pr-10",
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Выбрать время"
        data-testid="time-picker-open"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { inputRef.current?.focus(); if (open) closePicker(false); else openPicker(); }}
        className="absolute right-0 top-0 flex h-full w-10 items-center justify-center rounded-r-xl text-slate-500 transition-colors hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Clock className="h-4 w-4" aria-hidden />
      </button>
      {open && place && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Выбор времени"
          data-testid="time-picker"
          style={{ position: "fixed", top: place.top, left: place.left, width: 184 }}
          className="z-[100030] overflow-hidden rounded-card border border-slate-200 bg-white p-1.5 shadow-pop [--row:2rem] max-sm:[--row:2.5rem]"
        >
          <div aria-hidden className="grid grid-cols-[1fr_0.75rem_1fr] pb-1 text-xs font-medium text-slate-500">
            <span className="text-center">Часы</span>
            <span />
            <span className="text-center">Минуты</span>
          </div>
          <div className="relative flex">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[calc(var(--row)*2)] h-[var(--row)] rounded-lg border border-primary-200 bg-primary-50" />
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-[calc(var(--row)*2)] z-10 flex h-[var(--row)] -translate-x-1/2 items-center text-sm font-semibold text-primary-800">:</div>
            <div role="listbox" aria-label="Часы" data-column="hours" className="relative h-[calc(var(--row)*5)] min-w-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain py-[calc(var(--row)*2)] scroll-soft">
              {TIME_HOURS.map((hour, row) => option(0, hour, row, hour === currentHour))}
            </div>
            <div className="w-3 shrink-0" />
            <div role="listbox" aria-label="Минуты" data-column="minutes" className="relative h-[calc(var(--row)*5)] min-w-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain py-[calc(var(--row)*2)] scroll-soft">
              {TIME_MINUTES.map((minute, row) => option(1, minute, row, minute === currentMinute))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
});
