"use client";

import { cn } from "@/lib/utils";
import { maskTimeInput, normalizeTimeValue, parseTimeText } from "@/lib/form-fields";
import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
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
 * The choice is a clock face of two COLUMNS, each its own scroll container (`scroll-snap-type: y mandatory`, `overscroll-behavior: contain`: the window under it never scrolls):
 * the item in the MIDDLE (under the band) is the value.  It is read when the scroll has STOPPED (`scrollend`, else a pause of 120 ms) - never on every pixel - and while a person scrolls there is
 * NO programmatic scroll at all (that was the bug: the column was pulled back to the centre on every pixel).  The program scrolls only on opening and after a click / a key, smoothly, to the centre.
 * Keyboard (the focus stays in the field): ↑ ↓ step the column, ← → change the column, Enter closes, Esc closes WITHOUT a change.  On a phone every row is ≥ 40 px and the panel never leaves the screen.
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
  /** The column the arrow keys step: 0 hours, 1 minutes. */
  const [column, setColumn] = useState<0 | 1>(0);
  /** The last input was the keyboard: the value of the active column gets a thin frame (a mouse hover never paints a block). */
  const [usingKeys, setUsingKeys] = useState(false);
  /** The time when the choice was opened: Esc brings it back. */
  const openedWith = useRef("");
  /** The program's own glide of a column: while the column has not reached `target` (and `until` has not passed) its scroll events are the program's, not the person's. */
  const programmatic = useRef<{ hours: { target: number; until: number } | null; minutes: { target: number; until: number } | null }>({ hours: null, minutes: null });
  /** The columns a person is scrolling right now (waiting for the scroll to stop). */
  const scrolling = useRef({ hours: false, minutes: false });
  const settleTimers = useRef<{ hours?: number; minutes?: number }>({});
  const centred = useRef(false);

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
    // an empty REQUIRED field says it in Russian too (never the browser's own «Please fill out this field.»)
    inputRef.current?.setCustomValidity(problem || (required && text === "" ? "Укажите время" : ""));
  }, [problem, required, text]);

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

  // ── the choice of the clock ──────────────────────────────────────────────────────
  const current = parsed ?? "";
  const [currentHour, currentMinute] = current ? current.split(":") : ["", ""];
  const pick = (hour: string, minute: string) => {
    const next = `${hour}:${minute}`;
    if (next !== current) commit(next, true);
  };

  const openPicker = useCallback(() => {
    if (disabled) return;
    openedWith.current = current;
    centred.current = false;
    setColumn(0);
    setUsingKeys(false);
    setOpen(true);
  }, [disabled, current]);
  const closePicker = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) inputRef.current?.focus();
  }, []);

  // place the panel under the field, above it when there is no room below; inside the screen; follow the scroll of the PAGE and the resize while it is open
  // (the scroll of the choice's own columns is not the page's: it must not move the panel)
  useLayoutEffect(() => {
    if (!open) return undefined;
    const placePanel = () => {
      const box = wrapperRef.current?.getBoundingClientRect();
      if (!box) return;
      const width = 184;
      const row = window.innerWidth < 640 ? 40 : 32;
      const need = 12 + 24 + 5 * row;
      const room = { below: window.innerHeight - box.bottom - 8, above: box.top - 8 };
      const below = room.below >= need || room.below >= room.above;
      const top = below ? Math.min(box.bottom + 4, Math.max(8, window.innerHeight - need - 8)) : Math.max(8, box.top - need - 4);
      const left = Math.min(Math.max(8, box.right - width), window.innerWidth - width - 8);
      const maxHeight = need;
      setPlace((old) => (old && old.top === top && old.left === left && old.maxHeight === maxHeight ? old : { top, left, maxHeight }));
    };
    const onPageScroll = (event: Event) => { if (panelRef.current?.contains(event.target as Node)) return; placePanel(); };
    placePanel();
    window.addEventListener("resize", placePanel);
    window.addEventListener("scroll", onPageScroll, true);
    return () => { window.removeEventListener("resize", placePanel); window.removeEventListener("scroll", onPageScroll, true); };
  }, [open]);

  const listOf = (name: "hours" | "minutes") => panelRef.current?.querySelector<HTMLElement>(`[data-column="${name}"]`) ?? null;
  const rowHeight = (list: HTMLElement) => (list.querySelector<HTMLElement>("[role=option]")?.offsetHeight ?? 32);
  /** Scroll the column so that row `index` stands in the middle (the paddings make every row reachable).  The program's own scroll - never while a person scrolls. */
  const centerRow = (name: "hours" | "minutes", index: number, smooth: boolean) => {
    const list = listOf(name);
    if (!list) return;
    const target = index * rowHeight(list);
    // a long smooth glide (23 -> 00) may take a second on a slow machine: it is the program's until it ARRIVES, not for a fixed time
    programmatic.current[name] = { target, until: Date.now() + (smooth ? 3000 : 400) };
    list.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
  };
  const indexOfHour = (hour: string) => Math.max(0, TIME_HOURS.indexOf(hour || TIME_PICKER_EMPTY_HOUR));
  const indexOfMinute = (minute: string) => {
    const at = TIME_MINUTES.indexOf(minute || TIME_PICKER_EMPTY_MINUTE);
    return at >= 0 ? at : Math.min(TIME_MINUTES.length - 1, Math.round(Number(minute) / 5));
  };

  // opening: both columns stand at the value (09 : 00 when empty) at once, without an animation
  useEffect(() => {
    if (!open || !place || centred.current || !panelRef.current) return;
    centred.current = true;
    centerRow("hours", indexOfHour(currentHour), false);
    centerRow("minutes", indexOfMinute(currentMinute), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place]);
  // after a click, a key or typing: the columns glide to the value - but a column the person is scrolling is never touched
  useEffect(() => {
    if (!open || !centred.current) return;
    if (!scrolling.current.hours) centerRow("hours", indexOfHour(currentHour), true);
    if (!scrolling.current.minutes) centerRow("minutes", indexOfMinute(currentMinute), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentHour, currentMinute]);

  // the scroll of a person has STOPPED: the item in the middle is the value
  const settle = (name: "hours" | "minutes") => {
    window.clearTimeout(settleTimers.current[name]);
    scrolling.current[name] = false;
    const list = listOf(name);
    if (!list) return;
    const options = name === "hours" ? TIME_HOURS : TIME_MINUTES;
    const index = Math.min(options.length - 1, Math.max(0, Math.round(list.scrollTop / rowHeight(list))));
    if (name === "hours") pick(options[index], currentMinute || TIME_PICKER_EMPTY_MINUTE);
    else pick(currentHour || TIME_PICKER_EMPTY_HOUR, options[index]);
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;
  const onColumnScroll = (name: "hours" | "minutes") => {
    const own = programmatic.current[name];
    if (own) {
      const list = listOf(name);
      const arrived = !list || Math.abs(list.scrollTop - own.target) <= 1;
      if (arrived || Date.now() > own.until) programmatic.current[name] = null;
      if (arrived) return;          // the program's own glide has arrived
      if (Date.now() <= own.until) return; // ... or is still on its way
    }
    scrolling.current[name] = true;
    window.clearTimeout(settleTimers.current[name]);
    settleTimers.current[name] = window.setTimeout(() => settleRef.current(name), 120);
  };
  // `scrollend` (where the browser has it) settles at once; the pause above is the fallback
  useEffect(() => {
    if (!open || !place) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;
    const onEnd = (event: Event) => {
      const name = (event.target as HTMLElement | null)?.getAttribute?.("data-column") as "hours" | "minutes" | null;
      if (name && scrolling.current[name]) settleRef.current(name);
    };
    panel.addEventListener("scrollend", onEnd, true);
    return () => panel.removeEventListener("scrollend", onEnd, true);
  }, [open, place]);
  // a person takes over: the program's glide is off at once
  const takeOver = () => { programmatic.current = { hours: null, minutes: null }; setUsingKeys(false); };

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
  useEffect(() => () => { window.clearTimeout(settleTimers.current.hours); window.clearTimeout(settleTimers.current.minutes); }, []);

  const step = (delta: number) => {
    if (column === 0) {
      const next = Math.min(TIME_HOURS.length - 1, Math.max(0, indexOfHour(currentHour) + delta));
      pick(TIME_HOURS[next], currentMinute || TIME_PICKER_EMPTY_MINUTE);
    } else {
      const next = Math.min(TIME_MINUTES.length - 1, Math.max(0, indexOfMinute(currentMinute) + delta));
      pick(currentHour || TIME_PICKER_EMPTY_HOUR, TIME_MINUTES[next]);
    }
  };
  const onPickerKey = (event: React.KeyboardEvent<HTMLInputElement>): boolean => {
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) setUsingKeys(true);
    if (event.key === "Escape") { commit(openedWith.current, true); closePicker(); return true; }
    if (event.key === "Enter") { closePicker(); return true; }
    if (event.key === "ArrowDown") { step(1); return true; }
    if (event.key === "ArrowUp") { step(-1); return true; }
    if (event.key === "ArrowRight") { setColumn(1); return true; }
    if (event.key === "ArrowLeft") { setColumn(0); return true; }
    return false;
  };

  const option = (col: 0 | 1, key: string, selected: boolean) => {
    const suggested = !selected && (col === 0 ? !currentHour && key === TIME_PICKER_EMPTY_HOUR : !currentMinute && key === TIME_PICKER_EMPTY_MINUTE);
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
          setUsingKeys(false);
          setColumn(col);
          if (col === 0) pick(key, currentMinute || TIME_PICKER_EMPTY_MINUTE);
          else { pick(currentHour || TIME_PICKER_EMPTY_HOUR, key); closePicker(); }
        }}
        className={cn(
          // the HOVER changes only the colour of the number (darker, a pointer): a grey block would compete with the band; the chosen one is the band alone
          "relative z-10 flex h-[var(--row)] w-full shrink-0 cursor-pointer snap-center items-center justify-center rounded-lg text-sm tabular-nums transition-colors",
          selected ? "font-semibold text-primary-800" : suggested ? "text-primary-700 hover:text-primary-900" : "text-slate-600 hover:text-slate-900",
          usingKeys && col === column && (selected || suggested) && "ring-1 ring-inset ring-primary-500",
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
            {(["hours", "minutes"] as const).map((name, col) => (
              <Fragment key={name}>
                {col === 1 && <div className="w-3 shrink-0" />}
                <div
                  role="listbox"
                  aria-label={name === "hours" ? "Часы" : "Минуты"}
                  data-column={name}
                  onScroll={() => onColumnScroll(name)}
                  onWheel={takeOver}
                  onTouchStart={takeOver}
                  onPointerDown={takeOver}
                  className="relative h-[calc(var(--row)*5)] min-w-0 flex-1 touch-pan-y snap-y snap-mandatory overflow-y-auto overscroll-y-contain py-[calc(var(--row)*2)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {(name === "hours" ? TIME_HOURS : TIME_MINUTES).map((key) => option(col as 0 | 1, key, key === (name === "hours" ? currentHour : currentMinute)))}
                </div>
              </Fragment>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
});
