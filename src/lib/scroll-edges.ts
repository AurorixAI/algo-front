/**
 * Overflow edges of a horizontally scrollable box, for the scroll affordance of math
 * containers (formulas that are wider than their card): which side still hides content.
 * Pure, so it is tested without a DOM (tests/task-display-contract.test.cjs).
 */

/** aria-label of a scroll region; set only while the region really overflows. */
export const SCROLL_REGION_LABEL = "Формула, прокрутите по горизонтали";

/** Sub-pixel rounding of scrollWidth / clientWidth / scrollLeft must not flip an edge. */
export const SCROLL_EDGE_TOLERANCE = 2;

export interface ScrollMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export interface OverflowEdges {
  /** content is wider than the box */
  overflows: boolean;
  /** content is hidden on the left (scrolled away from the start) */
  left: boolean;
  /** content is hidden on the right (not scrolled to the end) */
  right: boolean;
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function overflowEdgeState(m: ScrollMetrics, tolerance: number = SCROLL_EDGE_TOLERANCE): OverflowEdges {
  const none: OverflowEdges = { overflows: false, left: false, right: false };
  if (!m || !finite(m.scrollWidth) || !finite(m.clientWidth) || !(m.clientWidth > 0)) return none;
  const max = m.scrollWidth - m.clientWidth;
  if (!(max > tolerance)) return none;
  // RTL boxes report a negative scrollLeft: only the distance from the start matters
  const at = Math.min(Math.max(0, finite(m.scrollLeft) ? Math.abs(m.scrollLeft) : 0), max);
  return { overflows: true, left: at > tolerance, right: max - at > tolerance };
}

// ─── Clicks that are not taps on an option card ───────────────────────────────

export interface BoxMetrics {
  clientWidth: number;
  clientHeight: number;
  offsetWidth: number;
  offsetHeight: number;
  scrollWidth?: number;
}

/** Overlay scrollbars (macOS, touch-style) take no gutter: they are painted over the bottom edge of the box. */
export const OVERLAY_SCROLLBAR_ZONE_PX = 14;

/**
 * Is a pointer position (offsetX / offsetY of an event whose target is the scroller itself) on the
 * scrollbar of that scroller? Clicks on a scrollbar are dispatched to the scroller and bubble like a click
 * on its content; they must never count as a tap on the option inside which it sits.
 *  - classic scrollbar: the gutter, offsetY in [clientHeight, offsetHeight] (or offsetX on the right);
 *  - overlay scrollbar (no gutter) on a box that overflows horizontally: the bottom OVERLAY_SCROLLBAR_ZONE_PX
 *    of the padding box, where the overlay thumb / track is painted - for a MOUSE only. A finger or a pen
 *    scrolls by panning (a tap is never a scrollbar press), so a touch / pen tap in that strip is a real tap.
 *    The classic gutter (box is taller than its client area) is a scrollbar for every pointer type.
 */
export function isScrollbarGutterHit(hit: { offsetX: number; offsetY: number; pointerType?: string | null }, box: BoxMetrics): boolean {
  if (!hit || !box || !finite(hit.offsetX) || !finite(hit.offsetY)) return false;
  const bottom = box.offsetHeight > box.clientHeight && hit.offsetY >= box.clientHeight && hit.offsetY <= box.offsetHeight;
  const right = box.offsetWidth > box.clientWidth && hit.offsetX >= box.clientWidth && hit.offsetX <= box.offsetWidth;
  const overlay =
    hit.pointerType === "mouse" &&
    box.offsetHeight <= box.clientHeight &&
    finite(box.scrollWidth) && (box.scrollWidth as number) > box.clientWidth + 1 &&
    hit.offsetY >= box.clientHeight - OVERLAY_SCROLLBAR_ZONE_PX && hit.offsetY <= box.clientHeight;
  return bottom || right || overlay;
}

/** Did any of the inner scrollers move between the two snapshots (a scrollbar drag, a pan)? */
export function scrollMoved(before: number[], after: number[], tolerance = 0.5): boolean {
  if (before.length !== after.length) return true;
  return before.some((x, i) => Math.abs(x - after[i]) > tolerance);
}

export interface CardPointerRecord {
  /** performance.now() of the pointer / mouse down */
  at: number;
  /** "mouse" | "touch" | "pen" of the press (a compatibility mousedown after a touch is recorded as "mouse" only when no touch press precedes it) */
  pointerType?: string;
  /** the press started in a scrollbar gutter */
  inGutter: boolean;
  /** scrollLeft of every inner scroller at that moment */
  scrolls: number[];
}

/** A press older than this is not the press of the click that follows. */
export const CARD_PRESS_MAX_AGE_MS = 3000;

/**
 * Should the click on an option card be ignored? True for a click that comes from using a scrollbar or
 * from panning the formula: the press / the click landed in a scrollbar gutter, or an inner scroller moved
 * between the press and the click. Keyboard-initiated clicks (Enter / Space, detail 0) are always real.
 */
export function shouldIgnoreCardClick(args: {
  keyboard: boolean;
  down: CardPointerRecord | null;
  clickInGutter: boolean;
  scrollsNow: number[];
  now: number;
}): boolean {
  if (args.keyboard) return false;
  if (args.clickInGutter) return true;
  const down = args.down;
  if (!down || args.now - down.at > CARD_PRESS_MAX_AGE_MS) return false;
  return down.inGutter || scrollMoved(down.scrolls, args.scrollsNow);
}

/** A touch / pen tap is followed by emulated (compatibility) mouse events within about this long. */
export const COMPAT_MOUSE_WINDOW_MS = 1000;

/**
 * Is this mousedown only the compatibility event of a touch / pen press that was just recorded? It must
 * not overwrite that record (its pointer type is "touch", and a "mouse" overlay-zone rule must not apply).
 */
export function isCompatMouseAfterTouch(prev: CardPointerRecord | null, now: number, firesTouchEvents = false): boolean {
  if (firesTouchEvents) return true;
  return Boolean(prev && prev.pointerType && prev.pointerType !== "mouse" && now - prev.at >= 0 && now - prev.at <= COMPAT_MOUSE_WINDOW_MS);
}
