"use client";

import { cn } from "@/lib/utils";
import { computeMenuPlacement, moveActiveIndex, type MenuNavKey, type MenuPlacement } from "@/lib/select-menu";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

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
  onChange?: (e: any) => void;
  className?: string;
  buttonClassName?: string;
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The list is capped at 15rem and scrolls inside; a row is ~44px (min touch target). */
const MENU_MAX_HEIGHT = 240;
const OPTION_HEIGHT_ESTIMATE = 48;

const NAV_KEYS: readonly string[] = ["ArrowDown", "ArrowUp", "Home", "End"];

/**
 * Custom select. The open list is rendered into <body> with fixed positioning, so
 * it is never clipped or painted over by the content that follows the field (cards,
 * radio groups, sibling stacking contexts) and always sits on an opaque, elevated
 * surface. It deliberately has no opacity / exit animation: an animation stalled
 * mid-way (throttled frames on a phone, a background tab) used to leave a
 * semi-transparent list over the next controls.
 *
 * Keyboard: Enter/Space/ArrowDown/ArrowUp open; ArrowUp/ArrowDown/Home/End move
 * the highlight (focus stays on the field, aria-activedescendant); Enter/Space
 * choose; Escape closes; Tab closes and moves on. Outside press closes.
 */
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
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const keyboardNav = useRef(false);
  const swallowSpaceUp = useRef(false);
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  const uid = useId();
  const triggerId = `${uid}-trigger`;
  const labelId = `${uid}-label`;
  const listId = `${uid}-list`;
  const optionId = (index: number) => `${uid}-opt-${index}`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback(() => setOpen(false), []);

  const openMenu = useCallback(() => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.length ? 0 : -1);
    keyboardNav.current = true;
    setOpen(true);
  }, [selectedIndex, options.length]);

  // Where the list goes: recomputed on open, resize and any scroll (page or an inner container).
  const updatePlacement = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const next = computeMenuPlacement(
      rect,
      { width: document.documentElement.clientWidth, height: window.innerHeight },
      { maxHeight: MENU_MAX_HEIGHT, contentHeight: options.length * OPTION_HEIGHT_ESTIMATE + 12 },
    );
    setPlacement((prev) =>
      prev && prev.side === next.side && prev.left === next.left && prev.width === next.width
        && prev.maxHeight === next.maxHeight && prev.top === next.top && prev.bottom === next.bottom
        ? prev
        : next,
    );
  }, [options.length]);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    updatePlacement();
    const onScroll = (e: Event) => {
      // Scrolling the list itself does not move it.
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return;
      updatePlacement();
    };
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, updatePlacement]);

  // Outside press and Escape (the latter also when focus is not on the field).
  useEffect(() => {
    if (!open) return;
    const onPress = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
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

  // Keep the keyboard-highlighted row visible inside the scrolling list.
  useEffect(() => {
    if (!open || !placement || activeIndex < 0 || !keyboardNav.current) return;
    keyboardNav.current = false;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placement, activeIndex]);

  const handleSelect = (val: string) => {
    // Pass standard event object { target: { value: val } } for backward compatibility
    // with inputs like onChange={(e) => setValue(e.target.value)}
    const event = { target: { value: val } };
    onChange?.(event);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu();
      }
      return; // Enter / Space: the button's own click opens it
    }
    if (NAV_KEYS.includes(e.key)) {
      e.preventDefault();
      keyboardNav.current = true;
      setActiveIndex((current) => moveActiveIndex(options.length, current, e.key as MenuNavKey));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      // A button clicks on Space *release*: swallow it, or the list would reopen at once.
      if (e.key === " ") swallowSpaceUp.current = true;
      const option = options[activeIndex];
      if (option) handleSelect(option.value);
      else close();
    } else if (e.key === "Tab") {
      close();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " && swallowSpaceUp.current) {
      swallowSpaceUp.current = false;
      e.preventDefault();
    }
  };

  const menu =
    open && placement && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            style={{
              position: "fixed",
              left: placement.left,
              width: placement.width,
              maxHeight: placement.maxHeight,
              ...(placement.side === "below" ? { top: placement.top } : { bottom: placement.bottom }),
            }}
            // Opaque surface + border + elevation, above modals/toasts; scrolls inside its own height cap.
            className="z-[100001] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl ring-1 ring-slate-900/5
              [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full"
            // Keep focus on the field while the list is pressed.
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400 text-center">Нет вариантов</div>
            ) : (
              options.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <div
                    key={option.value}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(option.value)}
                    onMouseMove={(e) => {
                      // Browsers replay a mousemove after a keyboard scroll; only a real move counts.
                      const last = lastMouse.current;
                      lastMouse.current = { x: e.clientX, y: e.clientY };
                      if (last && last.x === e.clientX && last.y === e.clientY) return;
                      if (activeIndex !== index) setActiveIndex(index);
                    }}
                    className={cn(
                      "w-full min-h-[44px] px-3.5 py-2.5 rounded-lg text-left text-sm transition-colors duration-100 flex items-center justify-between gap-2 cursor-pointer my-0.5",
                      isSelected ? "bg-primary-50 text-primary-700 font-semibold" : "text-slate-700",
                      isActive && (isSelected ? "bg-primary-100" : "bg-slate-100 text-slate-900"),
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {option.icon}
                      <div className="min-w-0 break-words">
                        <div>{option.label}</div>
                        {option.sublabel && (
                          <div className="text-[11px] text-slate-400 font-normal">{option.sublabel}</div>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-primary-600 shrink-0" />}
                  </div>
                );
              })
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={cn("w-full relative", className)}>
      {label && (
        <label id={labelId} className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
          {label}
        </label>
      )}
      <div className="relative" ref={anchorRef}>
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-labelledby={label ? `${labelId} ${triggerId}` : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-invalid={error ? true : undefined}
          onClick={() => (open ? close() : openMenu())}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
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
        {menu}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}
