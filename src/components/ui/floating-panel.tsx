"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { FloatingAlign } from "@/lib/floating-placement";
import { useFloatingPlacement } from "@/lib/use-floating-placement";

/** Keyboard-reachable rows of a menu (buttons / links). */
const ROW_SELECTOR = 'button:not([disabled]), a[href], [role="menuitem"]:not([disabled])';

/**
 * Menu / popover of a «⋯» or filter button.  It is rendered into <body> with position: fixed, so no
 * `overflow-hidden` / `overflow-x-auto` ancestor, transformed card or modal body can clip it; it opens
 * below the trigger when it fits, otherwise above, aligns to the trigger's nearer viewport edge, is
 * clamped into the visible area and scrolls inside a height cap (see `useFloatingPlacement`).
 *
 * Reachable without a mouse or hover: the trigger toggles it by click / tap / Enter / Space; focus moves to
 * the first row, ArrowUp / ArrowDown / Home / End move between rows, Escape closes and returns focus to the
 * trigger, Tab closes (focus continues from the trigger).  A press outside, or scrolling the trigger out of sight,
 * closes it too.
 *
 * Like the shared <Select>, the panel has no opacity / exit animation: an animation stalled mid-way
 * (throttled frames on a phone) used to leave a semi-transparent list over the next controls.
 *
 * Clicks inside do not bubble through the React tree (a menu inside a `<Link>` card must not navigate).
 */
export function FloatingPanel({
  open,
  triggerRef,
  onClose,
  width = 224,
  align = "auto",
  maxHeight,
  maxHeightRatio,
  id,
  label,
  role = "group",
  zIndexClass = "z-[100000]",
  className = "",
  children,
}: {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  width?: number;
  align?: FloatingAlign;
  maxHeight?: number;
  maxHeightRatio?: number;
  id?: string;
  /** Accessible name of the panel. */
  label?: string;
  /** "menu" when the rows are `role="menuitem"` buttons. */
  role?: "group" | "menu";
  /** Above a modal that is itself above the page (default is above every modal of the app but a <Select> list). */
  zIndexClass?: string;
  /** Surface classes only (background, border, radius, shadow, padding): placement is set here. */
  className?: string;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const { placement, fixedStyle } = useFloatingPlacement(triggerRef, menuRef, {
    open,
    width,
    align,
    maxHeight,
    maxHeightRatio,
    onAnchorHidden: () => onCloseRef.current(),
  });

  // Focus moves into the panel once it has been placed (keyboard and screen-reader users).
  const placed = placement !== null;
  useEffect(() => {
    if (!open || !placed) return;
    menuRef.current?.querySelector<HTMLElement>(ROW_SELECTOR)?.focus({ preventScroll: true });
  }, [open, placed]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The trigger toggles the panel itself; closing here would reopen it on click.
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        triggerRef.current?.focus({ preventScroll: true });
        return;
      }
      const menu = menuRef.current;
      if (!menu || !menu.contains(document.activeElement)) return;
      if (event.key === "Tab") {
        // Focus goes back to the trigger first, so the browser's Tab moves on from there (the portaled panel sits
        // at the end of <body>: leaving from inside it would jump out of the page).
        onCloseRef.current();
        triggerRef.current?.focus({ preventScroll: true });
        return;
      }
      const rows = Array.from(menu.querySelectorAll<HTMLElement>(ROW_SELECTOR));
      if (rows.length === 0) return;
      const index = rows.indexOf(document.activeElement as HTMLElement);
      let next: number | null = null;
      if (event.key === "ArrowDown") next = (index + 1) % rows.length;
      else if (event.key === "ArrowUp") next = (index - 1 + rows.length) % rows.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = rows.length - 1;
      if (next === null) return;
      event.preventDefault();
      rows[next].focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, triggerRef]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={menuRef}
      id={id}
      role={role}
      aria-label={label}
      style={fixedStyle}
      // Choosing a row hands focus back to the trigger first (an action that opens a dialog then moves it on).
      onClickCapture={(event) => {
        if ((event.target as Element).closest?.(ROW_SELECTOR)) triggerRef.current?.focus({ preventScroll: true });
      }}
      onClick={(event) => event.stopPropagation()}
      className={`${zIndexClass} text-left ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
