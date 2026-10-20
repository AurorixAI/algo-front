/**
 * Page scroll lock for dialogs, drawers and lightboxes (the hook `useScrollLock` in `components/ui/modal.tsx` wraps it).
 *
 *  - The lock is on `<html>`: `overflow: hidden` there stops the document from scrolling and removes the page scrollbar,
 *    so the dim / blur of a `fixed inset-0` layer then covers the whole window.
 *  - The scrollbar's width goes into `padding-right` of `<html>` (added to what is already there), so the page does not
 *    jump sideways when the scrollbar disappears.
 *  - Locks are counted: stacked dialogs lock once, and the page is released by the LAST one to close.  The inline styles
 *    that were on `<html>` before the first lock come back exactly (value and `!important`), nothing is guessed.
 *  - iOS / iPadOS (Safari up to 15 ignores `overflow: hidden` on the root: the page behind a dialog keeps scrolling and
 *    the rubber band drags it) lock the `<body>` instead: `position: fixed; top: -scrollY; width: 100%`, and `scrollTo`
 *    gives the page back at the very place it was.  Same count, same exact restore of the body's inline styles.
 *
 * The DOM is passed in, so the rules are testable without a browser.
 */

/** The inline properties the lock changes.  The shorthand comes first: restoring it clears its longhands, which then return. */
const LOCKED_PROPERTIES = ["overflow", "overflow-x", "overflow-y", "padding-right"] as const;

export interface ScrollLockEnv {
  document: { documentElement: { style: StyleLike; clientWidth: number }; body?: { style: StyleLike } | null };
  window: {
    innerWidth: number;
    getComputedStyle: (element: unknown) => { paddingRight: string };
    /** Only the iOS lock reads these: where the page is scrolled to, and how to put it back. */
    scrollY?: number;
    scrollTo?: (x: number, y: number) => void;
    /** What tells an iPhone / iPad (an iPad with desktop Safari says «MacIntel» and has a touch screen). */
    navigator?: { userAgent?: string; platform?: string; maxTouchPoints?: number };
  };
}

/** The part of `CSSStyleDeclaration` the lock uses. */
export interface StyleLike {
  getPropertyValue(name: string): string;
  getPropertyPriority(name: string): string;
  setProperty(name: string, value: string | null, priority?: string): void;
  removeProperty(name: string): string;
}

interface Held {
  saved: Array<{ name: string; value: string; priority: string }>;
  /** Which element's inline styles were changed: `<html>` (everywhere) or `<body>` (iOS). */
  target: "html" | "body";
  /** iOS: the scroll position to give back. */
  scrollY: number;
}

/** The inline properties the iOS lock changes on `<body>`. */
const IOS_PROPERTIES = ["position", "top", "width"] as const;

/** An iPhone, an iPod or an iPad (including the iPad that calls itself a Mac but has a touch screen). */
export function isIosEnv(env: ScrollLockEnv): boolean {
  const nav = env.window.navigator;
  if (!nav) return false;
  return /iP(hone|ad|od)/.test(nav.userAgent ?? "") || (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1);
}

/** One lock state per environment (per document); the browser has exactly one. */
const holds = new WeakMap<object, { count: number; held: Held | null }>();

function browserEnv(): ScrollLockEnv | null {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  return { document, window } as unknown as ScrollLockEnv;
}

/** Width of the vertical scrollbar that is on screen now (0 for overlay scrollbars and when the page does not scroll). */
export function scrollbarWidth(env: ScrollLockEnv): number {
  return Math.max(0, Math.round(env.window.innerWidth - env.document.documentElement.clientWidth));
}

/**
 * Lock the page scroll; returns the function that releases THIS lock (calling it twice does nothing the second time).
 * Without a DOM (server render) it locks nothing.
 */
export function lockScroll(env: ScrollLockEnv | null = browserEnv()): () => void {
  if (!env) return () => {};
  const html = env.document.documentElement;
  let state = holds.get(html);
  if (!state) {
    state = { count: 0, held: null };
    holds.set(html, state);
  }
  const mine = state;
  if (mine.count === 0) {
    const body = env.document.body;
    if (isIosEnv(env) && body) {
      const scrollY = Math.max(0, Math.round(env.window.scrollY ?? 0));
      mine.held = {
        target: "body",
        scrollY,
        saved: IOS_PROPERTIES.map((name) => ({ name, value: body.style.getPropertyValue(name), priority: body.style.getPropertyPriority(name) })),
      };
      body.style.setProperty("position", "fixed");
      body.style.setProperty("top", `-${scrollY}px`);
      body.style.setProperty("width", "100%");
    } else {
      // Measure before `overflow: hidden` takes the scrollbar away.
      const bar = scrollbarWidth(env);
      const paddingNow = parseFloat(env.window.getComputedStyle(html).paddingRight) || 0;
      mine.held = {
        target: "html",
        scrollY: 0,
        saved: LOCKED_PROPERTIES.map((name) => ({
          name,
          value: html.style.getPropertyValue(name),
          priority: html.style.getPropertyPriority(name),
        })),
      };
      html.style.setProperty("overflow", "hidden");
      if (bar > 0) html.style.setProperty("padding-right", `${paddingNow + bar}px`);
    }
  }
  mine.count += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    mine.count -= 1;
    if (mine.count > 0 || !mine.held) return;
    const held = mine.held;
    const style = held.target === "body" ? env.document.body?.style ?? html.style : html.style;
    for (const { name, value, priority } of held.saved) {
      if (value) style.setProperty(name, value, priority);
      else style.removeProperty(name);
    }
    mine.held = null;
    if (held.target === "body") env.window.scrollTo?.(0, held.scrollY);
  };
}

/** How many locks are held now (for tests and diagnostics). */
export function scrollLockCount(env: ScrollLockEnv | null = browserEnv()): number {
  return env ? holds.get(env.document.documentElement)?.count ?? 0 : 0;
}
