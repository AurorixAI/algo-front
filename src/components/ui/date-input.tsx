"use client";

import { cn } from "@/lib/utils";
import { formatBusinessDate } from "@/lib/business-time";
import {
  MONTHS_RU,
  WEEKDAYS_RU,
  clampIso,
  isWithin,
  isoToDmy,
  longDateLabel,
  maskDateInput,
  monthGrid,
  moveCalendarFocus,
  parseDateText,
  parseIso,
  addDaysIso,
  addMonthsIso,
  toIso,
  type CalendarKey,
} from "@/lib/form-fields";
import { computeMenuPlacement, type MenuPlacement } from "@/lib/select-menu";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Seven 40 px days and the padding: fits a 320 px phone (the placement clamps it to the screen anyway). */
const CALENDAR_WIDTH = 304;
const CALENDAR_HEIGHT = 392;

export interface DateInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max" | "inputMode" | "maxLength" | "defaultValue"> {
  /** ISO «YYYY-MM-DD» or "" (nothing chosen). */
  value: string;
  /** Called with the ISO date, or "" while the text is not a complete real date. */
  onChange: (value: string) => void;
  /** The earliest / latest allowed day (ISO).  The calendar disables the others; a typed one outside is flagged invalid. */
  min?: string;
  max?: string;
  /** The classes of the wrapper (its width). */
  wrapperClassName?: string;
  /** Shown red even when the date itself is fine (the form's own rule failed). */
  invalid?: boolean;
}

/**
 * The date field of the platform.  It shows «дд.мм.гггг» whatever the browser's locale, takes typing with a mask («22102026»,
 * «22.10.26», «22.10.2026») and opens a calendar of our own: Monday first, Russian month and day names, today marked in
 * the Tashkent business clock, `min` / `max` respected, keyboard (arrows, Home/End, PageUp/PageDown, Enter, Escape).
 * The value is the ISO date, so nothing downstream changes.
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { value, onChange, min, max, className, wrapperClassName, invalid = false, disabled, required, onBlur, onKeyDown, id, placeholder = "дд.мм.гггг", ...rest },
  forwardedRef,
) {
  const [text, setText] = useState(() => isoToDmy(value));
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const testId = (rest as Record<string, unknown>)["data-testid"] as string | undefined;
  const popId = `${uid}-calendar`;
  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

  // The parent changed the value (a reset, a default, another field): show it.  Typing a date that parses to the same
  // value, or a half-typed one while the value is "", leaves the text alone.
  useEffect(() => {
    const parsed = parseDateText(text) ?? "";
    if (parsed !== value) setText(isoToDmy(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const parsed = parseDateText(text);
  const outOfRange = parsed !== null && !isWithin(parsed, min, max);
  const broken = text !== "" && parsed === null;
  const problem = broken
    ? "Введите дату в формате дд.мм.гггг"
    : outOfRange
      ? min && parsed! < min
        ? `Не раньше ${isoToDmy(min)}`
        : `Не позже ${isoToDmy(max)}`
      : "";

  // A native form (required, Enter) refuses a half-typed or out-of-range date, like <input type="date"> did.
  useEffect(() => {
    inputRef.current?.setCustomValidity(problem);
  }, [problem]);

  const commit = (nextText: string, final: boolean) => {
    setText(nextText);
    const iso = parseDateText(nextText);
    // While typing only a four-digit year is complete; «22.10.26» is taken on blur / Enter.
    const complete = iso !== null && (final || /\d{4}$/.test(nextText) || /^\d{4}-/.test(nextText));
    if (complete) {
      if (iso !== value) onChange(iso);
      if (final) setText(isoToDmy(iso));
    } else if (value !== "") {
      onChange("");
    }
  };

  const close = useCallback(() => setOpen(false), []);

  // The calendar floats in <body> (never clipped by a dialog's scroller), placed like the Select's list.
  const updatePlacement = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const vv = window.visualViewport;
    const next = computeMenuPlacement(
      { top: rect.top, bottom: rect.bottom, left: rect.left, width: Math.max(rect.width, CALENDAR_WIDTH) },
      {
        width: document.documentElement.clientWidth,
        height: window.innerHeight,
        ...(vv ? { visibleTop: vv.offsetTop, visibleBottom: vv.offsetTop + vv.height, visibleLeft: vv.offsetLeft, visibleRight: vv.offsetLeft + vv.width } : {}),
      },
      { maxHeight: CALENDAR_HEIGHT, contentHeight: CALENDAR_HEIGHT, minHeight: 240 },
    );
    setPlacement((prev) =>
      prev && prev.side === next.side && prev.left === next.left && prev.width === next.width && prev.maxHeight === next.maxHeight && prev.top === next.top && prev.bottom === next.bottom ? prev : next,
    );
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return undefined;
    }
    updatePlacement();
    const sync = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) setOpen(false);
      else updatePlacement();
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && popRef.current?.contains(event.target)) return;
      sync();
    };
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", onScroll, true);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", onScroll, true);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, [open, updatePlacement]);

  // Outside press and Escape (the latter stops here, so a dialog around the field stays open).
  useEffect(() => {
    if (!open) return undefined;
    const onPress = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      inputRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("mousedown", onPress);
    document.addEventListener("touchstart", onPress, { passive: true });
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPress);
      document.removeEventListener("touchstart", onPress);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const choose = (iso: string) => {
    setText(isoToDmy(iso));
    if (iso !== value) onChange(iso);
    setOpen(false);
    inputRef.current?.focus({ preventScroll: true });
  };

  const calendar =
    open && placement && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popRef}
            id={popId}
            role="dialog"
            aria-label="Календарь"
            data-testid="date-calendar"
            style={{
              position: "fixed",
              left: placement.left,
              width: Math.min(CALENDAR_WIDTH, placement.width),
              maxHeight: placement.maxHeight,
              ...(placement.side === "below" ? { top: placement.top } : { bottom: placement.bottom }),
            }}
            className="z-[100001] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl ring-1 ring-slate-900/5"
            // Pressing inside the calendar keeps the focus where it is.
            onMouseDown={(event) => {
              if (!(event.target instanceof HTMLElement && event.target.closest("button"))) event.preventDefault();
            }}
          >
            <Calendar value={parsed ?? ""} min={min} max={max} required={Boolean(required)} onChoose={choose} onClear={() => { setText(""); if (value !== "") onChange(""); setOpen(false); inputRef.current?.focus({ preventScroll: true }); }} onTab={() => { setOpen(false); inputRef.current?.focus({ preventScroll: true }); }} />
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className={cn("relative w-full", wrapperClassName)}>
      <input
        {...rest}
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        required={required}
        aria-invalid={invalid || problem !== "" ? true : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        title={problem || rest.title}
        onChange={(event) => commit(maskDateInput(event.target.value, text), false)}
        onBlur={(event) => {
          if (text !== "" && parsed !== null) commit(text, true);
          onBlur?.(event);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "ArrowDown" && !disabled) {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === "Enter" && parsed !== null && text !== isoToDmy(parsed)) {
            commit(text, true);
          }
        }}
        className={cn(
          "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400",
          "focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-60",
          className,
          (invalid || problem !== "") && "border-red-400 focus:border-red-500 focus:ring-red-500/20",
          "pr-9",
        )}
      />
      <button
        type="button"
        aria-label="Открыть календарь"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        data-testid={testId ? `${testId}-calendar` : undefined}
        onClick={() => setOpen((current) => !current)}
        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:pointer-events-none disabled:opacity-50"
      >
        <CalendarDays className="h-4 w-4" aria-hidden />
      </button>
      {calendar}
    </div>
  );
});

function Calendar({
  value, min, max, required, onChoose, onClear, onTab,
}: {
  value: string;
  min?: string;
  max?: string;
  required: boolean;
  onChoose: (iso: string) => void;
  onClear: () => void;
  onTab: () => void;
}) {
  const today = formatBusinessDate();
  // The focused day: the chosen one, else today, nudged into [min, max].
  const start = clampIso(parseIso(value) ? value : today, min, max);
  const [focused, setFocused] = useState(start);
  const [shown, setShown] = useState(() => {
    const parts = parseIso(start)!;
    return { year: parts.year, month: parts.month };
  });
  const gridRef = useRef<HTMLDivElement>(null);
  const focusAfterMove = useRef(true);

  // Keep the focused day inside the shown month and focus its button (arrow keys move across months).
  useEffect(() => {
    const parts = parseIso(focused);
    if (parts && (parts.year !== shown.year || parts.month !== shown.month)) setShown({ year: parts.year, month: parts.month });
    if (focusAfterMove.current) gridRef.current?.querySelector<HTMLButtonElement>(`button[data-iso="${focused}"]`)?.focus({ preventScroll: true });
  }, [focused, shown.year, shown.month]);

  const weeks = monthGrid(shown.year, shown.month);
  const goMonth = (delta: number) => {
    const next = addMonthsIso(toIso(shown.year, shown.month, 1), delta);
    const parts = parseIso(next)!;
    focusAfterMove.current = false;
    setShown({ year: parts.year, month: parts.month });
    // the focused day follows the month when it has left it
    setFocused((current) => clampIso(addMonthsIso(current, delta), min, max));
  };
  // A month the arrows would go to has no allowed day at all (before `min` / after `max`).
  const monthDisabled = (delta: number) => {
    const first = addMonthsIso(toIso(shown.year, shown.month, 1), delta);
    const last = addDaysIso(addMonthsIso(first, 1), -1);
    return delta < 0 ? Boolean(min && last < min) : Boolean(max && first > max);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Tab") {
      onTab();
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      focusAfterMove.current = true;
      setFocused((current) => clampIso(moveCalendarFocus(current, event.key as CalendarKey, event.shiftKey), min, max));
    }
  };

  const todayOk = isWithin(today, min, max);

  return (
    <div onKeyDown={onKeyDown}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <div className="flex items-center">
          <NavButton label="Предыдущий год" disabled={monthDisabled(-12)} onClick={() => goMonth(-12)}><ChevronsLeft className="h-4 w-4" /></NavButton>
          <NavButton label="Предыдущий месяц" disabled={monthDisabled(-1)} onClick={() => goMonth(-1)}><ChevronLeft className="h-4 w-4" /></NavButton>
        </div>
        <div className="text-sm font-semibold text-slate-900" aria-live="polite" data-testid="date-calendar-title">{MONTHS_RU[shown.month - 1]} {shown.year}</div>
        <div className="flex items-center">
          <NavButton label="Следующий месяц" disabled={monthDisabled(1)} onClick={() => goMonth(1)}><ChevronRight className="h-4 w-4" /></NavButton>
          <NavButton label="Следующий год" disabled={monthDisabled(12)} onClick={() => goMonth(12)}><ChevronsRight className="h-4 w-4" /></NavButton>
        </div>
      </div>
      <div ref={gridRef} role="grid" aria-label={`${MONTHS_RU[shown.month - 1]} ${shown.year}`}>
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS_RU.map((name, index) => (
            <div key={name} role="columnheader" className={cn("flex h-7 items-center justify-center text-[11px] font-semibold uppercase tracking-wide", index >= 5 ? "text-rose-400" : "text-slate-400")}>{name}</div>
          ))}
        </div>
        {weeks.map((week) => (
          <div role="row" key={week[0].iso} className="grid grid-cols-7">
            {week.map((day) => {
              const allowed = isWithin(day.iso, min, max);
              const selected = day.iso === value;
              const isToday = day.iso === today;
              return (
                <div role="gridcell" key={day.iso} aria-selected={selected} className="flex items-center justify-center">
                  <button
                    type="button"
                    data-iso={day.iso}
                    disabled={!allowed}
                    tabIndex={day.iso === focused ? 0 : -1}
                    aria-label={longDateLabel(day.iso)}
                    aria-current={isToday ? "date" : undefined}
                    aria-pressed={selected}
                    onClick={() => onChoose(day.iso)}
                    onFocus={() => { focusAfterMove.current = true; setFocused(day.iso); }}
                    className={cn(
                      "relative flex h-10 w-10 items-center justify-center rounded-xl text-sm tabular-nums transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50",
                      day.inMonth ? "text-slate-800" : "text-slate-300",
                      allowed && !selected && "hover:bg-slate-100",
                      selected && "bg-primary-600 font-semibold text-white hover:bg-primary-600",
                      !selected && isToday && "font-semibold text-primary-700 ring-1 ring-inset ring-primary-300",
                      !allowed && "cursor-not-allowed text-slate-300",
                    )}
                  >
                    {day.day}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
        <button
          type="button"
          disabled={!todayOk}
          onClick={() => onChoose(today)}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
        >
          Сегодня
        </button>
        {!required && value && (
          <button type="button" onClick={onClear} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
            Очистить
          </button>
        )}
      </div>
    </div>
  );
}

function NavButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
