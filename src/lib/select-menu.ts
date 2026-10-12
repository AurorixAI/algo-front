/**
 * Pure helpers behind the shared <Select> (src/components/ui/select.tsx).
 * They hold the two decisions that used to be wrong on narrow screens and are
 * therefore covered by node tests (tests/select-menu.test.cjs): where the open
 * list sits relative to the viewport, and which option the arrow keys move to.
 */

export interface MenuAnchor {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface MenuViewport {
  width: number;
  height: number;
}

export interface MenuPlacement {
  side: "below" | "above";
  left: number;
  width: number;
  /** Height cap: the list scrolls inside it instead of growing past the viewport. */
  maxHeight: number;
  /** Set when side === "below" (distance from the viewport top). */
  top?: number;
  /** Set when side === "above" (distance from the viewport bottom). */
  bottom?: number;
}

export interface MenuPlacementOptions {
  /** Upper bound of the list height, px. */
  maxHeight?: number;
  /** Estimated natural height of the list, px (a short list does not need to flip). */
  contentHeight?: number;
  /** Space between the trigger and the list, px. */
  gap?: number;
  /** Minimum distance kept to every viewport edge, px. */
  margin?: number;
  /** The list is never made shorter than this, px. */
  minHeight?: number;
}

/**
 * Fixed-position box for the open list: opens below the trigger when there is
 * room (or more room than above), otherwise flips above; clamps the width and
 * left edge into the viewport and caps the height to the space actually left.
 */
export function computeMenuPlacement(
  anchor: MenuAnchor,
  viewport: MenuViewport,
  opts: MenuPlacementOptions = {},
): MenuPlacement {
  const maxHeight = opts.maxHeight ?? 240;
  const gap = opts.gap ?? 6;
  const margin = opts.margin ?? 8;
  const minHeight = opts.minHeight ?? 64;
  const need = Math.min(maxHeight, opts.contentHeight ?? maxHeight);

  const spaceBelow = viewport.height - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - gap - margin;
  const side: MenuPlacement["side"] = spaceBelow >= need || spaceBelow >= spaceAbove ? "below" : "above";
  const space = side === "below" ? spaceBelow : spaceAbove;

  const width = Math.max(0, Math.min(anchor.width, viewport.width - 2 * margin));
  const left = Math.max(margin, Math.min(anchor.left, viewport.width - margin - width));
  const height = Math.max(Math.min(minHeight, maxHeight), Math.min(maxHeight, space));

  return side === "below"
    ? { side, left, width, maxHeight: height, top: anchor.bottom + gap }
    : { side, left, width, maxHeight: height, bottom: viewport.height - anchor.top + gap };
}

export type MenuNavKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/** Index the highlight moves to; -1 (nothing highlighted yet) counts as "before the first". */
export function moveActiveIndex(count: number, current: number, key: MenuNavKey): number {
  if (count <= 0) return -1;
  switch (key) {
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "ArrowDown":
      return current < 0 ? 0 : Math.min(count - 1, current + 1);
    case "ArrowUp":
      return current < 0 ? count - 1 : Math.max(0, current - 1);
  }
}
