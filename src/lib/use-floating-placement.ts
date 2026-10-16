"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import {
  computeFloatingPlacement,
  type FloatingAlign,
  type FloatingPlacement,
  type FloatingViewport,
} from "./floating-placement";
import { isAnchorInSight, type SightHit, type SightRect } from "./select-menu";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Layout viewport plus the part of it the user can see (on-screen keyboard, pinch-zoom). */
export function readViewport(): FloatingViewport {
  const viewport: FloatingViewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
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
 * Is the trigger still in sight (so the open panel stays)?  False once it is scrolled out of the
 * page or of an inner scroll container / clip parent, or hidden under a sticky header or overlay.
 */
function triggerInSight(trigger: HTMLElement, menu: HTMLElement | null): boolean {
  if (!trigger.isConnected) return false;
  const rect = trigger.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  const clickThrough = getComputedStyle(trigger).pointerEvents === "none";
  const hitKind: SightHit =
    !hit || clickThrough ? "none" : trigger.contains(hit) ? "anchor" : menu?.contains(hit) ? "list" : "other";
  const viewport = readViewport();
  const visible: SightRect = {
    top: viewport.visibleTop ?? 0,
    bottom: viewport.visibleBottom ?? viewport.height,
    left: viewport.visibleLeft ?? 0,
    right: viewport.visibleRight ?? viewport.width,
  };
  const clips: SightRect[] = [];
  for (let el = trigger.parentElement; el && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if ([cs.overflowX, cs.overflowY].some((v) => v !== "visible")) clips.push(el.getBoundingClientRect());
  }
  return isAnchorInSight(rect, visible, clips, hitKind);
}

export interface UseFloatingPlacementOptions {
  open: boolean;
  /** Wanted panel width, px. */
  width: number;
  /** "auto" (default): the trigger's nearer viewport edge. */
  align?: FloatingAlign;
  maxHeight?: number;
  /** Share of the visible height the panel may take (default 0.6). */
  maxHeightRatio?: number;
  gap?: number;
  margin?: number;
  minHeight?: number;
  preferSide?: "below" | "above";
  /** The trigger scrolled out of sight: the panel should close. */
  onAnchorHidden?: () => void;
}

export interface FloatingPlacementResult {
  /** null until the panel has been measured (render it `visibility: hidden` meanwhile). */
  placement: FloatingPlacement | null;
  /** For a panel portaled into <body>. */
  fixedStyle: CSSProperties;
  /**
   * For a panel rendered next to the trigger inside a `relative` wrapper that hugs it (DOM / Tab order stays
   * natural): offsets are relative to that wrapper, the horizontal clamp is kept.
   */
  anchoredStyle: CSSProperties;
  update: () => void;
}

/**
 * Where an open floating panel goes: below / above the trigger, aligned to its nearer viewport edge,
 * clamped into the visible area, height-capped with an inner scroll.  Computed from getBoundingClientRect
 * when the panel opens and again on resize and on every scroll (page or an inner container); closes via
 * `onAnchorHidden` when the trigger leaves the screen.  The maths is `computeFloatingPlacement`.
 */
export function useFloatingPlacement(
  triggerRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  options: UseFloatingPlacementOptions,
): FloatingPlacementResult {
  const { open, width, align, maxHeight, maxHeightRatio, gap = 8, margin, minHeight, preferSide } = options;
  const [state, setState] = useState<{ placement: FloatingPlacement; anchorLeft: number; anchorBottom: number } | null>(null);
  const onHiddenRef = useRef(options.onAnchorHidden);
  onHiddenRef.current = options.onAnchorHidden;

  const update = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const next = computeFloatingPlacement(
      { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      readViewport(),
      { width, contentHeight: menu.scrollHeight, align, maxHeight, maxHeightRatio, gap, margin, minHeight, preferSide },
    );
    setState((prev) =>
      prev &&
      prev.anchorLeft === rect.left &&
      prev.anchorBottom === rect.bottom &&
      prev.placement.side === next.side &&
      prev.placement.left === next.left &&
      prev.placement.width === next.width &&
      prev.placement.maxHeight === next.maxHeight &&
      prev.placement.top === next.top &&
      prev.placement.bottom === next.bottom
        ? prev
        : { placement: next, anchorLeft: rect.left, anchorBottom: rect.bottom },
    );
  }, [triggerRef, menuRef, width, align, maxHeight, maxHeightRatio, gap, margin, minHeight, preferSide]);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setState(null);
      return undefined;
    }
    update();
    const sync = () => {
      const trigger = triggerRef.current;
      if (trigger && !triggerInSight(trigger, menuRef.current)) onHiddenRef.current?.();
      else update();
    };
    const onScroll = (event: Event) => {
      // Scrolling the panel itself does not move it.
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
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
  }, [open, update, triggerRef, menuRef]);

  const placement = state?.placement ?? null;
  const visibility: CSSProperties["visibility"] = placement ? "visible" : "hidden";
  const common: CSSProperties = { width: placement?.width ?? width, maxHeight: placement?.maxHeight, overflowY: "auto", visibility };

  const fixedStyle: CSSProperties = {
    ...common,
    position: "fixed",
    left: placement?.left ?? 0,
    ...(placement?.side === "above" ? { bottom: placement.bottom } : { top: placement?.top ?? 0 }),
  };

  const anchoredStyle: CSSProperties = {
    ...common,
    position: "absolute",
    left: placement && state ? placement.left - state.anchorLeft : 0,
    ...(placement?.side === "above"
      ? { bottom: "100%", marginBottom: gap }
      // Normally `gap` under the trigger; a panel pinned inside a tiny viewport may sit elsewhere.
      : { top: "100%", marginTop: placement && state ? (placement.top ?? 0) - state.anchorBottom : gap }),
  };

  return { placement, fixedStyle, anchoredStyle, update };
}
