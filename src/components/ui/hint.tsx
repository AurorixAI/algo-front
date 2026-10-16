"use client";

import { useCallback, useEffect, useId, useReducer, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFloatingPlacement } from "@/lib/use-floating-placement";
import { INITIAL_REVEAL, isRevealed, reduceReveal } from "@/lib/reveal";

/**
 * A short label with a detail that used to live in a `title=""` (visible on mouse hover only).
 * The detail is reachable without hover: the label is focusable (Tab), Enter / Space / a tap pins it open,
 * Escape or a press elsewhere closes it, hover still shows it on a desktop.  The text is also read by screen
 * readers (`aria-describedby`).  The bubble is portaled and placed by `useFloatingPlacement` (above the
 * label, flipped below / clamped into the screen), so no table `overflow` can clip it.
 * On a touch screen the emulated hover and the focus a tap causes are ignored: a tap opens it, the next tap closes it.
 * A tap or Enter never reaches a surrounding link / row (the label is a hint, not a navigation).
 */
export function Hint({
  text,
  children,
  className = "",
}: {
  /** The detail; line breaks are kept. */
  text: string;
  children: ReactNode;
  /** Classes of the label itself. */
  className?: string;
}) {
  const [reveal, dispatch] = useReducer(reduceReveal, INITIAL_REVEAL);
  const open = isRevealed(reveal);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  const hide = useCallback(() => dispatch({ type: "dismiss" }), []);

  const { fixedStyle } = useFloatingPlacement(triggerRef, bubbleRef, {
    open,
    width: 256,
    align: "center",
    preferSide: "above",
    gap: 6,
    onAnchorHidden: hide,
  });

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node)) hide();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      hide();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, hide]);

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-describedby={id}
        onPointerEnter={(event) => dispatch({ type: "pointer-enter", pointerType: event.pointerType })}
        onPointerDown={(event) => dispatch({ type: "pointer-down", pointerType: event.pointerType })}
        onPointerCancel={() => dispatch({ type: "pointer-cancel" })}
        onMouseEnter={() => dispatch({ type: "mouse-enter" })}
        onMouseLeave={() => dispatch({ type: "mouse-leave" })}
        onFocus={() => dispatch({ type: "focus" })}
        onBlur={() => dispatch({ type: "blur" })}
        onClick={(event) => {
          // A tap on a label inside a link / row never navigates: the label is a hint.
          event.preventDefault();
          event.stopPropagation();
          dispatch({ type: "click", mousePins: true });
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          dispatch({ type: "key-toggle" });
        }}
        className={`cursor-help rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${className}`}
      >
        {children}
      </span>
      {/* Read by screen readers whether or not the bubble is shown. */}
      <span id={id} className="sr-only">
        {text}
      </span>
      {open && typeof document !== "undefined" &&
        createPortal(
          <span
            ref={bubbleRef}
            role="tooltip"
            style={fixedStyle}
            className="pointer-events-none z-[100002] block whitespace-pre-line rounded-xl border border-white/10 bg-slate-900/95 p-3 text-left text-xs leading-relaxed text-white shadow-xl"
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}
