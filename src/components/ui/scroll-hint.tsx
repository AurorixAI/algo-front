"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import { SCROLL_REGION_LABEL, overflowEdgeState } from "../../lib/scroll-edges";

/**
 * Scroll affordance for math overflow containers. Formulas that are wider than their card live
 * in `overflow-x: auto` boxes whose scrollbar is hidden, so the cut-off part gave no hint. This
 * marks every such box with `data-sh-left` / `data-sh-right` on the sides that hide content
 * (globals.css turns them into an edge fade: a mask, so it fits any card background and moves
 * no layout), and - only while the box really overflows and `focusable` - makes it a keyboard
 * scroll region (tabindex 0, role region, aria-label «Формула, прокрутите по горизонтали»).
 * Everything is written straight to the DOM (no React state, no re-render, no layout change).
 * The edge logic is the pure overflowEdgeState (src/lib/scroll-edges.ts).
 */

const A11Y_MARK = "data-sh-a11y";

function setFlag(el: HTMLElement, name: string, on: boolean) {
  if (on) {
    if (!el.hasAttribute(name)) el.setAttribute(name, "");
  } else if (el.hasAttribute(name)) {
    el.removeAttribute(name);
  }
}

function dropA11y(el: HTMLElement) {
  if (!el.hasAttribute(A11Y_MARK)) return;
  el.removeAttribute("tabindex");
  el.removeAttribute("role");
  el.removeAttribute("aria-label");
  el.removeAttribute(A11Y_MARK);
}

function refresh(el: HTMLElement, focusable: boolean) {
  const edges = overflowEdgeState({ scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
  setFlag(el, "data-sh-left", edges.left);
  setFlag(el, "data-sh-right", edges.right);
  if (!focusable) return;
  if (edges.overflows) {
    // an author-set tabindex is never touched
    if (!el.hasAttribute("tabindex")) {
      el.setAttribute("tabindex", "0");
      el.setAttribute(A11Y_MARK, "");
    }
    if (el.hasAttribute(A11Y_MARK)) {
      el.setAttribute("role", "region");
      el.setAttribute("aria-label", SCROLL_REGION_LABEL);
    }
  } else {
    dropA11y(el);
  }
}

export interface ScrollHintOptions {
  /** descendants that scroll on their own (KaTeX display blocks) */
  selector?: string;
  /** the root itself scrolls */
  includeRoot?: boolean;
  /** make an overflowing box a keyboard scroll region (false inside buttons / links) */
  focusable?: boolean;
}

/**
 * Attach the affordance; returns the cleanup (listeners off, attributes removed).
 * Scroll is captured on the root (scroll does not bubble, but it can be captured), and the boxes are
 * re-collected on every measure, so a KaTeX block that is replaced or laid out later is never missed.
 */
export function attachScrollHints(root: HTMLElement, options: ScrollHintOptions = {}): () => void {
  const { selector = ".katex-display", includeRoot = true, focusable = true } = options;
  const marked = new Set<HTMLElement>();
  const observed = new Set<Element>();
  let boxes: HTMLElement[] = [];
  let raf = 0;
  let stopped = false;
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => schedule());

  const collect = () => {
    boxes = [
      ...(includeRoot ? [root] : []),
      ...(selector ? Array.from(root.querySelectorAll<HTMLElement>(selector)) : []),
    ];
    boxes.forEach((box) => {
      [box, ...Array.from(box.children)].forEach((el) => {
        if (!observed.has(el)) {
          observed.add(el);
          resizeObserver?.observe(el);
        }
      });
    });
  };
  const measure = () => {
    if (stopped) return;
    collect();
    // boxes that left the DOM or the selection lose their marks
    marked.forEach((box) => {
      if (!boxes.includes(box)) {
        box.removeAttribute("data-sh-left");
        box.removeAttribute("data-sh-right");
        dropA11y(box);
        marked.delete(box);
      }
    });
    boxes.forEach((box) => {
      refresh(box, focusable);
      marked.add(box);
    });
  };
  function schedule() {
    if (stopped || raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      measure();
    });
  }
  const isBox = (target: EventTarget | null): target is HTMLElement => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (includeRoot && el === root) return true;
    return Boolean(selector) && typeof el.matches === "function" && el.matches(selector) && root.contains(el);
  };
  const onScroll = (event: Event) => {
    if (isBox(event.target)) refresh(event.target, focusable);
  };

  root.addEventListener("scroll", onScroll, { capture: true, passive: true });
  const mutationObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => schedule());
  mutationObserver?.observe(root, { childList: true, subtree: true });
  measure();
  // KaTeX glyph metrics change when the web fonts arrive
  void document.fonts?.ready.then(schedule);

  return () => {
    stopped = true;
    if (raf) window.cancelAnimationFrame(raf);
    root.removeEventListener("scroll", onScroll, { capture: true });
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    marked.forEach((box) => {
      box.removeAttribute("data-sh-left");
      box.removeAttribute("data-sh-right");
      dropA11y(box);
    });
    marked.clear();
  };
}

/** `key` re-attaches when the rendered content changes (e.g. the math HTML). */
export function useScrollHint(
  ref: React.RefObject<HTMLElement | null>,
  key: unknown,
  { selector = ".katex-display", includeRoot = true, focusable = true }: ScrollHintOptions = {},
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return attachScrollHints(el, { selector, includeRoot, focusable });
  }, [ref, key, selector, includeRoot, focusable]);
}

/**
 * A horizontally scrollable box with the affordance: put the overflow classes on it
 * (`overflow-x-auto ...`) exactly as on a plain div.
 */
export function ScrollHint({
  as: Tag = "div",
  className,
  focusable = true,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: "div" | "span"; focusable?: boolean }) {
  const ref = useRef<HTMLElement | null>(null);
  // root only: a MathRenderer inside takes care of its own scrollers (two owners of one box would fight)
  useScrollHint(ref, null, { selector: "", includeRoot: true, focusable });
  return (
    <Tag ref={ref as React.Ref<HTMLDivElement & HTMLSpanElement>} className={cn("scroll-hint", className)} {...rest}>
      {children}
    </Tag>
  );
}
