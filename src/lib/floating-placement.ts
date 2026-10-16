/**
 * Pure placement maths behind every floating panel that is not the shared <Select>
 * (dropdown filters, «⋯» menus of a page header or a card, popovers).
 * Used by `useFloatingPlacement` (src/lib/use-floating-placement.ts); covered by
 * tests/n13-ui-floating.test.cjs.
 *
 * Two decisions used to be wrong in hand-written `absolute right-0 top-full` panels:
 *  - horizontally: a panel hanging off the trigger's far edge left the screen
 *    (a filter at the right edge opened its flyout off-screen);
 *  - vertically: a panel opened downward even when the trigger sat at the bottom of
 *    the viewport (or of a scroll container), so its tail was clipped.
 * Here the panel opens towards the roomier side, aligns to the trigger's nearer
 * viewport edge, is clamped into the visible area and capped in height (it scrolls
 * inside its own box instead of leaving the screen).
 */

/** Viewport rectangle of the trigger (`getBoundingClientRect()`). */
export interface FloatingAnchor {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface FloatingViewport {
  /** Layout viewport size (`bottom` of an upward panel is measured from the layout viewport's bottom). */
  width: number;
  height: number;
  /** Part of the layout viewport the user really sees (on-screen keyboard, pinch-zoom). Default: all of it. */
  visibleTop?: number;
  visibleBottom?: number;
  visibleLeft?: number;
  visibleRight?: number;
}

export type FloatingAlign = "auto" | "start" | "end" | "center";
export type ResolvedAlign = "start" | "end" | "center";

export interface FloatingOptions {
  /** Wanted panel width, px (shrunk to fit the visible viewport). */
  width: number;
  /** Natural height of the panel content, px (`scrollHeight`): a short panel does not need to flip. */
  contentHeight: number;
  /** "auto" (default): align to the trigger's nearer viewport edge. */
  align?: FloatingAlign;
  /** Hard cap of the panel height, px (default: none besides the ratio). */
  maxHeight?: number;
  /** Cap as a share of the visible height (default 0.6 - the panel never takes more than ~60vh). */
  maxHeightRatio?: number;
  /** Space between trigger and panel, px (default 8). */
  gap?: number;
  /** Minimum distance kept to every viewport edge, px (default 8). */
  margin?: number;
  /** A panel is not squeezed below this unless the whole visible area is smaller, px (default 96). */
  minHeight?: number;
  /** Which side to try first when both fit (default "below"). */
  preferSide?: "below" | "above";
}

export interface FloatingPlacement {
  side: "below" | "above";
  align: ResolvedAlign;
  /** Left edge in viewport coordinates, already clamped into the visible area. */
  left: number;
  width: number;
  /** Height cap: the panel scrolls inside it. */
  maxHeight: number;
  /** Set when side === "below": distance from the viewport top. */
  top?: number;
  /** Set when side === "above": distance from the viewport bottom. */
  bottom?: number;
}

/** `end` (= `right-0`) when the trigger's centre is in the right half of the visible width, else `start`. */
export function pickHorizontalAlign(anchor: FloatingAnchor, viewport: FloatingViewport): "start" | "end" {
  const vLeft = viewport.visibleLeft ?? 0;
  const vRight = viewport.visibleRight ?? viewport.width;
  const centre = (anchor.left + anchor.right) / 2;
  return centre > (vLeft + vRight) / 2 ? "end" : "start";
}

export function computeFloatingPlacement(
  anchor: FloatingAnchor,
  viewport: FloatingViewport,
  opts: FloatingOptions,
): FloatingPlacement {
  const gap = opts.gap ?? 8;
  const margin = opts.margin ?? 8;
  const minHeight = opts.minHeight ?? 96;

  const vTop = viewport.visibleTop ?? 0;
  const vBottom = viewport.visibleBottom ?? viewport.height;
  const vLeft = viewport.visibleLeft ?? 0;
  const vRight = viewport.visibleRight ?? viewport.width;

  // ---- horizontal: align to the nearer edge, then clamp into the visible area -------------
  const width = Math.max(0, Math.min(opts.width, vRight - vLeft - 2 * margin));
  const requested = opts.align ?? "auto";
  const align: ResolvedAlign = requested === "auto" ? pickHorizontalAlign(anchor, viewport) : requested;
  const wanted =
    align === "end" ? anchor.right - width : align === "center" ? (anchor.left + anchor.right) / 2 - width / 2 : anchor.left;
  const left = Math.max(vLeft + margin, Math.min(wanted, vRight - margin - width));

  // ---- vertical: roomier side, height cap with an inner scroll ----------------------------
  const ratioCap = Math.max(0, (vBottom - vTop) * (opts.maxHeightRatio ?? 0.6));
  const cap = Math.min(opts.maxHeight ?? Infinity, ratioCap);
  const need = Math.min(cap, Math.max(0, opts.contentHeight));

  const spaceBelow = vBottom - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - vTop - gap - margin;
  const preferAbove = opts.preferSide === "above";
  let side: "below" | "above";
  if (preferAbove ? spaceAbove >= need : spaceBelow >= need) side = preferAbove ? "above" : "below";
  else if (preferAbove ? spaceBelow >= need : spaceAbove >= need) side = preferAbove ? "below" : "above";
  else side = spaceBelow >= spaceAbove ? "below" : "above";
  const space = side === "below" ? spaceBelow : spaceAbove;

  // Neither side has room (landscape phone, on-screen keyboard): pin the panel inside the visible
  // area - it may cover the trigger - and let it scroll inside its own height.
  if (space < Math.min(minHeight, need)) {
    const height = Math.max(0, Math.min(cap, need, vBottom - vTop - 2 * margin));
    const top = Math.max(vTop + margin, Math.min(anchor.bottom + gap, vBottom - margin - height));
    return { side: "below", align, left, width, maxHeight: height, top };
  }

  const maxHeight = Math.min(cap, space);
  return side === "below"
    ? { side, align, left, width, maxHeight, top: anchor.bottom + gap }
    : { side, align, left, width, maxHeight, bottom: viewport.height - anchor.top + gap };
}

/** Viewport-space box [top, bottom) the placement occupies for a panel of `contentHeight` (tests, hit checks). */
export function placementBox(p: FloatingPlacement, viewport: FloatingViewport, contentHeight: number) {
  const height = Math.min(p.maxHeight, contentHeight);
  const top = p.side === "below" ? (p.top as number) : viewport.height - (p.bottom as number) - height;
  return { top, bottom: top + height, left: p.left, right: p.left + p.width };
}
