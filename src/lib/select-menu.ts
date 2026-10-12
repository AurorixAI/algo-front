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
  /** Layout viewport size (CSS `bottom` of an upward list is measured from its bottom edge). */
  width: number;
  height: number;
  /**
   * Part of the layout viewport the user can actually see: the visual viewport
   * (on-screen keyboard, pinch-zoom). Defaults to the whole layout viewport.
   */
  visibleTop?: number;
  visibleBottom?: number;
  visibleLeft?: number;
  visibleRight?: number;
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
 * left edge into the visible viewport and caps the height to the space actually
 * left. When neither side has room for `minHeight` (landscape phone, on-screen
 * keyboard) the list is pinned inside the visible area, covering the field if it
 * has to, and shrinks below `minHeight` rather than leaving the screen: it
 * always scrolls inside its own height.
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

  const vTop = viewport.visibleTop ?? 0;
  const vBottom = viewport.visibleBottom ?? viewport.height;
  const vLeft = viewport.visibleLeft ?? 0;
  const vRight = viewport.visibleRight ?? viewport.width;

  const width = Math.max(0, Math.min(anchor.width, vRight - vLeft - 2 * margin));
  const left = Math.max(vLeft + margin, Math.min(anchor.left, vRight - margin - width));

  const spaceBelow = vBottom - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - vTop - gap - margin;
  const side: MenuPlacement["side"] = spaceBelow >= need || spaceBelow >= spaceAbove ? "below" : "above";
  const space = side === "below" ? spaceBelow : spaceAbove;

  if (space < Math.min(minHeight, need)) {
    const height = Math.max(0, Math.min(maxHeight, need, vBottom - vTop - 2 * margin));
    const top = Math.max(vTop + margin, Math.min(anchor.bottom + gap, vBottom - margin - height));
    return { side: "below", left, width, maxHeight: height, top };
  }

  const height = Math.min(maxHeight, space);
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

export type SelectKeyAction = "none" | "open" | "move" | "choose" | "close";

export interface SelectKeyResult {
  action: SelectKeyAction;
  /** The Select handled the key: it must not bubble (a login form's Enter handler must not fire). */
  stop: boolean;
  /** Suppress the browser default (page scroll on arrows, Space activation). */
  prevent: boolean;
}

/**
 * What a key does on the Select's field. Enter/Space on a closed field open it
 * through the button's own click (no preventDefault) but are still ours: they
 * must not reach an ancestor key handler. Tab only closes and keeps its default.
 */
export function resolveSelectKey(open: boolean, key: string): SelectKeyResult {
  const nav = key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
  if (!open) {
    if (key === "ArrowDown" || key === "ArrowUp") return { action: "open", stop: true, prevent: true };
    if (key === "Enter" || key === " ") return { action: "none", stop: true, prevent: false };
    return { action: "none", stop: false, prevent: false };
  }
  if (nav) return { action: "move", stop: true, prevent: true };
  if (key === "Enter" || key === " ") return { action: "choose", stop: true, prevent: true };
  if (key === "Tab") return { action: "close", stop: false, prevent: false };
  return { action: "none", stop: false, prevent: false };
}
