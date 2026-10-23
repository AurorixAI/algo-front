"use client";

import { cn } from "@/lib/utils";
import {
  computeMenuPlacement,
  isAnchorInSight,
  moveActiveIndex,
  resolveSelectKey,
  type MenuNavKey,
  type MenuPlacement,
  type MenuViewport,
  type SightHit,
  type SightRect,
} from "@/lib/select-menu";
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
  /** The id of the field (a surrounding `<label htmlFor>` points at it). */
  id?: string;
  /** The accessible name when there is no visible `label` (a toolbar filter). */
  ariaLabel?: string;
  disabled?: boolean;
  testId?: string;
  /** Set on the field when the surrounding form marks it invalid (the border turns red). */
  invalid?: boolean;
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The list is capped at 15rem and scrolls inside; a row is ~44px (min touch target). */
const MENU_MAX_HEIGHT = 240;
const OPTION_HEIGHT_ESTIMATE = 48;

/** Layout viewport plus the part of it the user can see (on-screen keyboard, pinch-zoom). */
function readViewport(): MenuViewport {
  const viewport: MenuViewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
  const vv = window.visualViewport;
  if (vv) {
    viewport.visibleTop = vv.offsetTop;
    viewport.visibleBottom = vv.offsetTop + vv.height;
    viewport.visibleLeft = vv.offsetLeft;
    viewport.visibleRight = vv.offsetLeft + vv.width;
  }
  return viewport;
}

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
 * choose; Escape closes; Tab closes and moves on. Outside press closes, and so
 * does scrolling the field out of sight (page, inner scroller or sticky header).
 * Keys the Select handles do not bubble, so a surrounding form's Enter handler
 * (login) does not fire with a half-chosen value.
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
  id,
  ariaLabel,
  disabled = false,
  testId,
  invalid = false,
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
  const triggerId = id ?? `${uid}-trigger`;
  const labelId = `${uid}-label`;
  const listId = `${uid}-list`;
  const errorId = `${uid}-error`;
  const optionId = (index: number) => `${uid}-opt-${index}`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback(() => setOpen(false), []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.length ? 0 : -1);
    keyboardNav.current = true;
    lastMouse.current = null;
    setOpen(true);
  }, [selectedIndex, options.length, disabled]);

  // Where the list goes: recomputed on open, resize and any scroll (page or an inner container).
  const updatePlacement = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const next = computeMenuPlacement(
      rect,
      readViewport(),
      { maxHeight: MENU_MAX_HEIGHT, contentHeight: options.length * OPTION_HEIGHT_ESTIMATE + 12 },
    );
    setPlacement((prev) =>
      prev && prev.side === next.side && prev.left === next.left && prev.width === next.width
        && prev.maxHeight === next.maxHeight && prev.top === next.top && prev.bottom === next.bottom
        ? prev
        : next,
    );
  }, [options.length]);

  // The field is "in sight" while it is what is painted at its centre (or the list pinned
  // over it); with no usable hit test (off-screen, pointer-events: none) its geometry decides.
  // False once it is scrolled out of the page or an inner scroller/clip parent, or sits under a
  // sticky header or other overlay.
  const anchorInSight = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return false;
    const rect = anchor.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const clickThrough = getComputedStyle(anchor).pointerEvents === "none";
    const hitKind: SightHit =
      !hit || clickThrough ? "none" : anchor.contains(hit) ? "anchor" : listRef.current?.contains(hit) ? "list" : "other";
    const viewport = readViewport();
    const visible: SightRect = {
      top: viewport.visibleTop ?? 0,
      bottom: viewport.visibleBottom ?? viewport.height,
      left: viewport.visibleLeft ?? 0,
      right: viewport.visibleRight ?? viewport.width,
    };
    const clips: SightRect[] = [];
    for (let el = anchor.parentElement; el && el !== document.documentElement; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if ([cs.overflowX, cs.overflowY].some((v) => v !== "visible")) clips.push(el.getBoundingClientRect());
    }
    return isAnchorInSight(rect, visible, clips, hitKind);
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    updatePlacement();
    const sync = () => {
      if (!anchorInSight()) setOpen(false);
      else updatePlacement();
    };
    const onScroll = (e: Event) => {
      // Scrolling the list itself does not move it.
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return;
      sync();
    };
    const vv = window.visualViewport;
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", onScroll, true);
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", onScroll, true);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
    };
  }, [open, updatePlacement, anchorInSight]);

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
      triggerRef.current?.focus({ preventScroll: true });
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
    triggerRef.current?.focus({ preventScroll: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    // A stale "swallow the Space release" flag must not outlive the key press it belongs to.
    if (e.key !== " ") swallowSpaceUp.current = false;
    const result = resolveSelectKey(open, e.key);
    if (result.stop) e.stopPropagation();
    if (result.prevent) e.preventDefault();
    switch (result.action) {
      case "open":
        openMenu();
        break;
      case "move":
        keyboardNav.current = true;
        setActiveIndex((current) => moveActiveIndex(options.length, current, e.key as MenuNavKey));
        break;
      case "choose": {
        // A button clicks on Space *release*: swallow it, or the list would reopen at once.
        if (e.key === " ") swallowSpaceUp.current = true;
        const option = options[activeIndex];
        if (option) handleSelect(option.value);
        else close();
        break;
      }
      case "close":
        close();
        break;
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " ") {
      // Space opened/chose through this field: its release is ours too.
      e.stopPropagation();
      if (swallowSpaceUp.current) {
        swallowSpaceUp.current = false;
        e.preventDefault();
      }
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
        <label
          id={labelId}
          htmlFor={triggerId}
          // Like a native select: the label focuses the field, it does not also click (toggle) it.
          onClick={(e) => {
            e.preventDefault();
            triggerRef.current?.focus({ preventScroll: true });
          }}
          className="block text-[13px] font-semibold text-slate-500 mb-1.5"
        >
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
          aria-label={!label ? ariaLabel : undefined}
          disabled={disabled}
          data-testid={testId}
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-invalid={error || invalid ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onBlur={() => {
            swallowSpaceUp.current = false;
          }}
          onClick={() => {
            swallowSpaceUp.current = false;
            if (open) close();
            else openMenu();
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          className={cn(
            "w-full px-4 py-3 rounded-xl text-left text-sm font-medium transition-all duration-200 cursor-pointer flex items-center justify-between gap-2",
            "bg-slate-50 border border-slate-200 text-slate-900 shadow-xs",
            "hover:border-slate-300 hover:bg-slate-100/70",
            "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:bg-white",
            open && "border-primary-500 ring-2 ring-primary-500/10 bg-white shadow-sm",
            !selectedOption && "text-slate-400",
            (error || invalid) && "border-red-400 focus:ring-red-500/20 focus:border-red-500",
            disabled && "cursor-not-allowed opacity-60 hover:border-slate-200 hover:bg-slate-50",
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
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
