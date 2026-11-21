"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

/** How far (px) a swipe down has to go, or how fast (px/ms), to close a bottom sheet. */
export const SWIPE_CLOSE_DISTANCE = 80;
export const SWIPE_CLOSE_SPEED = 0.5;

/**
 * PAY-TAILS Б2.8: a bottom sheet closes by a swipe DOWN from its header.  Returns the `onPointerDown` of the header; the card follows the finger (a transform written straight to the DOM, no re-render) and
 * either goes (`onClose`) or springs back.  Pure pointer events: no animation library, nothing to stub in a test.
 */
export function useSwipeDown(cardRef: RefObject<HTMLElement | null>, enabled: boolean, onClose: () => void) {
  const state = useRef<{ y: number; t: number } | null>(null);
  return useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const card = cardRef.current;
    if (!enabled || !card || (event.pointerType === "mouse" && event.button !== 0)) return;
    state.current = { y: event.clientY, t: Date.now() };
    const move = (e: PointerEvent) => {
      const start = state.current;
      if (!start) return;
      card.style.transition = "none";
      card.style.transform = `translateY(${Math.max(0, e.clientY - start.y)}px)`;
    };
    const end = (e: PointerEvent) => {
      const start = state.current;
      state.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!start) return;
      const distance = e.clientY - start.y;
      const speed = distance / Math.max(1, Date.now() - start.t);
      card.style.transition = "transform 150ms ease-out";
      if (e.type !== "pointercancel" && (distance >= SWIPE_CLOSE_DISTANCE || (distance > 20 && speed >= SWIPE_CLOSE_SPEED))) onClose();
      else card.style.transform = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }, [cardRef, enabled, onClose]);
}
