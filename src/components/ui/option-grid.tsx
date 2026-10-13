"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { MathRenderer } from "@/components/ui/math-renderer";
import { pickOptionDisplayProjection } from "@/lib/task-display";
import { resolveOptionTap } from "@/lib/option-tap";
import { isScrollbarGutterHit, shouldIgnoreCardClick, type CardPointerRecord } from "@/lib/scroll-edges";

export interface OptionItem {
  id: string;
  key: string;
  label: string;
  content: string;
  contentLatex?: string | null;
}

interface OptionGridProps {
  options: OptionItem[];
  selected: string;
  onSelect: (key: string) => void;
  disabled?: boolean;
  /** Сбрасывает pending при смене вопроса */
  questionKey?: string;
}

/** The scroll boxes of a card: its formulas (MathRenderer / KaTeX display blocks scroll horizontally). */
const SCROLLERS = ".math-renderer, .katex-display";
const scrollsOf = (card: HTMLElement) => Array.from(card.querySelectorAll<HTMLElement>(SCROLLERS)).map((box) => box.scrollLeft);

/** Did this event land in the scrollbar gutter of a formula's scroller? (A click on the scrollbar is
 *  dispatched to the scroller and bubbles to the card: it must never count as a tap on the option.) */
function hitsScrollbar(target: EventTarget | null, native: Event): boolean {
  const box = target as HTMLElement | null;
  if (!box || typeof box.matches !== "function" || !box.matches(SCROLLERS)) return false;
  const { offsetX, offsetY } = native as MouseEvent;
  return isScrollbarGutterHit({ offsetX, offsetY }, { clientWidth: box.clientWidth, clientHeight: box.clientHeight, offsetWidth: box.offsetWidth, offsetHeight: box.offsetHeight, scrollWidth: box.scrollWidth });
}

/**
 * Двухшаговый выбор: 1-й клик — галочка (pending), 2-й на тот же вариант — подтверждение + onSelect
 * (resolveOptionTap: после подтверждения отметка сразу снимается). Клик по полосе прокрутки формулы или
 * после её перетаскивания (scrollLeft изменился между нажатием и кликом) — не нажатие на вариант.
 */
export function OptionGrid({
  options,
  selected,
  onSelect,
  disabled = false,
  questionKey = "",
}: OptionGridProps) {
  const [pending, setPending] = useState<string | null>(null);
  // the last press on a card: where it started and where the formulas were scrolled
  const pressRef = useRef<CardPointerRecord | null>(null);

  const optionDisplays = useMemo(
    () => options.map((option) => pickOptionDisplayProjection(option.content, option.contentLatex)),
    [options],
  );

  // Long prose inside an answer is not an edge case: theory questions and
  // multi-step explanations legitimately have it.  Put such options in one
  // column so the card can grow vertically rather than forcing KaTeX outside
  // a half-width grid cell.
  const hasLongOption = optionDisplays.some(({ text: display }) => {
    return display.length > 80 || /\\text\{|\n/.test(display);
  });

  const resetKey = useMemo(
    () => `${questionKey}|${options.map((o) => o.id).join("|")}`,
    [questionKey, options],
  );

  useEffect(() => {
    setPending(null);
  }, [resetKey]);

  function handleClick(answerValue: string) {
    const tap = resolveOptionTap(pending, answerValue, disabled);
    setPending(tap.pending);
    if (tap.confirm) onSelect(answerValue);
  }

  return (
    <div className={cn("grid w-full grid-cols-1 gap-3 md:gap-4", !hasLongOption && "md:grid-cols-2")}>
      {options.map((opt, idx) => {
        const display = optionDisplays[idx];
        const isConfirmed = selected === opt.key;
        const isPending = pending === opt.key;
        const isActive = isConfirmed || isPending;
        const isOddLast = options.length % 2 === 1 && idx === options.length - 1;

        return (
          <button
            key={opt.id}
            type="button"
            onPointerDownCapture={(event) => {
              pressRef.current = { at: performance.now(), inGutter: hitsScrollbar(event.target, event.nativeEvent), scrolls: scrollsOf(event.currentTarget) };
            }}
            onMouseDownCapture={(event) => {
              pressRef.current = { at: performance.now(), inGutter: hitsScrollbar(event.target, event.nativeEvent), scrolls: scrollsOf(event.currentTarget) };
            }}
            onClick={(event) => {
              const card = event.currentTarget;
              const ignore = shouldIgnoreCardClick({
                keyboard: event.detail === 0, // Enter / Space on the focused card
                down: pressRef.current,
                clickInGutter: hitsScrollbar(event.target, event.nativeEvent),
                scrollsNow: scrollsOf(card),
                now: performance.now(),
              });
              pressRef.current = null;
              if (ignore) return;
              handleClick(opt.key);
              // A press on a scrollable formula inside the card may have focused that formula (tabindex -1):
              // keep the keyboard on the card, so Enter / Space keep working after a tap.
              if (document.activeElement !== card) card.focus({ preventScroll: true });
            }}
            disabled={disabled}
            className={cn(
              "group glass-option relative flex min-w-0 items-start gap-4 overflow-hidden rounded-2xl p-4 text-left cursor-pointer md:gap-5 md:p-5",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
              isOddLast && !hasLongOption && "md:col-span-2 md:justify-center",
              isActive && "selected !border-primary-500 !bg-white !shadow-[0_8px_24px_rgba(37,99,235,0.2)]",
            )}
          >
            <div
              className={cn(
                "w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center font-sans font-bold text-sm border transition-colors flex-shrink-0",
                isActive
                  ? "bg-primary-500 text-white border-primary-500 shadow-md"
                  : "bg-white shadow-sm text-slate-400 border-slate-100 group-hover:text-primary-500 group-hover:border-primary-200",
              )}
            >
              {isActive ? <Check className="w-4 h-4" /> : opt.label}
            </div>

            {/* The block formula scrolls itself (MathRenderer: edge fade, tabindex -1 inside a button, see scroll-hint.tsx);
                select-none, and pointer events are NOT disabled, so wheel / touch reach it. Keyboard: the card is the
                control; the hidden part of a long formula is reachable by wheel / touch / scrollbar only. */}
            <div className={cn("min-w-0 flex-1 py-0.5", isOddLast && "flex-initial")}>
              <MathRenderer
                text={display.text}
                renderMode={display.renderMode}
                block
                focusable={false}
                className={cn(
                  "min-w-0 max-w-full font-sans text-base break-words select-none transition-colors md:text-lg",
                  isActive ? "text-slate-900" : "text-slate-700 group-hover:text-slate-900",
                )}
              />
            </div>

            {isConfirmed && (
              <div className="absolute right-5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary-500 shadow-sm" />
            )}
          </button>
        );
      })}
    </div>
  );
}
