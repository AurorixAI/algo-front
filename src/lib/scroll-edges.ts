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
