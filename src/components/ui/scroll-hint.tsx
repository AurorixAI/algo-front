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
 * scroll region (tabindex 0, role region, aria-label «Формула, прокрутите по горизонтали»); with
 * `focusable={false}` (inside a button / link) an overflowing box gets tabindex -1 instead, so Tab skips it.
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
  if (!focusable) {
    // Inside a button / link the scroller must not be a tab stop of its own: Chrome makes every scroller
    // without a focusable child keyboard-focusable, so Tab would stop on the formula between two options.
    // tabindex -1 keeps it out of the Tab order (wheel / touch / pointer scrolling is unaffected).
    if (edges.overflows) {
      if (!el.hasAttribute("tabindex")) {
        el.setAttribute("tabindex", "-1");
        el.setAttribute(A11Y_MARK, "");
      }
    } else {
      dropA11y(el);
    }
    return;
  }
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
  /**
   * Make an overflowing box a keyboard scroll region (tabindex 0, role, aria-label). Forced to false
   * inside a button / link (a focusable region cannot nest in one): there the box gets tabindex -1 so Tab
   * skips it. KNOWN LIMITATION: inside a button / link the hidden part of a formula cannot be scrolled
   * with the keyboard - the card itself is the control, its formula is reachable by wheel, touch and the
   * scrollbar only.
   */
  focusable?: boolean;
  /** attach at all (an inline renderer without display math has nothing to scroll) */
  enabled?: boolean;
}

// One ResizeObserver for the whole page: every attached root registers a "re-measure" callback, the
// observer finds it through the observed element or its ancestors. (MutationObserver has no per-target
// unobserve, so each root keeps its own.)
const remeasure = new Map<Element, () => void>();
// how many attached roots watch an element: nested roots can watch the same box, and one owner stopping
// must not drop the other's observation
const watchers = new Map<Element, number>();
let sharedResizeObserver: ResizeObserver | null = null;
function notify(el: Element | null) {
  for (let node: Element | null = el; node; node = node.parentElement) remeasure.get(node)?.();
}
function resizeObserver(): ResizeObserver | null {
  if (typeof ResizeObserver === "undefined") return null;
  if (!sharedResizeObserver) sharedResizeObserver = new ResizeObserver((entries) => entries.forEach((entry) => notify(entry.target)));
  return sharedResizeObserver;
}
function watch(el: Element) {
  const n = watchers.get(el) ?? 0;
  watchers.set(el, n + 1);
  if (n === 0) resizeObserver()?.observe(el);
}
function unwatch(el: Element) {
  const n = watchers.get(el) ?? 0;
  if (n <= 1) {
    watchers.delete(el);
    sharedResizeObserver?.unobserve(el);
  } else {
    watchers.set(el, n - 1);
  }
}

/**
 * Attach the affordance; returns the cleanup (listeners off, attributes removed).
 * Scroll is captured on the root (scroll does not bubble, but it can be captured), and the boxes are
 * re-collected on every measure, so a KaTeX block that is replaced or laid out later is never missed.
 * Observed for size changes: the scroll boxes and the first element inside each (the formula itself: late
 * fonts, the --math-fit scale); a content change is caught by the MutationObserver.
 */
export function attachScrollHints(root: HTMLElement, options: ScrollHintOptions = {}): () => void {
  const { selector = ".katex-display", includeRoot = true } = options;
  // a focusable scroll region cannot sit inside a button / link
  const interactive = typeof root.closest === "function" && Boolean(root.closest("button, a"));
  const focusable = options.focusable !== false && !interactive;
  const marked = new Set<HTMLElement>();
  const observed = new Set<Element>(); // what THIS attach watches (reference-counted in `watchers`)
  let boxes: HTMLElement[] = [];
  let raf = 0;
  let stopped = false;

  const collect = () => {
    boxes = [
      ...(includeRoot ? [root] : []),
      ...(selector ? Array.from(root.querySelectorAll<HTMLElement>(selector)) : []),
    ];
    const wanted = new Set<Element>();
    boxes.forEach((box) => {
      wanted.add(box);
      if (box.firstElementChild) wanted.add(box.firstElementChild);
    });
    wanted.forEach((el) => {
      if (!observed.has(el)) {
        observed.add(el);
        watch(el);
      }
    });
    observed.forEach((el) => {
      if (!wanted.has(el)) {
        observed.delete(el);
        unwatch(el);
      }
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

  remeasure.set(root, schedule);
  root.addEventListener("scroll", onScroll, { capture: true, passive: true });
  const mutationObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => schedule());
  mutationObserver?.observe(root, { childList: true, subtree: true });
  measure();
  // KaTeX glyph metrics change when the web fonts arrive
  void document.fonts?.ready.then(schedule);

  return () => {
    stopped = true;
    if (raf) window.cancelAnimationFrame(raf);
    remeasure.delete(root);
    root.removeEventListener("scroll", onScroll, { capture: true });
    observed.forEach((el) => unwatch(el));
    observed.clear();
    mutationObserver?.disconnect();
    marked.forEach((box) => {
      box.removeAttribute("data-sh-left");
      box.removeAttribute("data-sh-right");
      dropA11y(box);
    });
    marked.clear();
  };
}

const NO_KEY = Symbol("no key");

/**
 * `key` re-attaches when the rendered content changes (e.g. the math HTML); a changed key on the same
 * instance also brings the root back to scrollLeft 0 (new content must not open scrolled to the old offset).
 */
export function useScrollHint(
  ref: React.RefObject<HTMLElement | null>,
  key: unknown,
  { selector = ".katex-display", includeRoot = true, focusable = true, enabled = true }: ScrollHintOptions = {},
) {
  const lastKey = useRef<unknown>(NO_KEY);
  useEffect(() => {
    const el = ref.current;
    const changed = lastKey.current !== NO_KEY && lastKey.current !== key;
    lastKey.current = key;
    if (!el || !enabled) return;
    if (changed && includeRoot) el.scrollLeft = 0;
    return attachScrollHints(el, { selector, includeRoot, focusable });
  }, [ref, key, selector, includeRoot, focusable, enabled]);
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
