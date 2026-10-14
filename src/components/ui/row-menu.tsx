"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export interface RowMenuItem {
  key: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onSelect: () => void;
  /** Red text for destructive actions (cancelling a payment). */
  danger?: boolean;
  disabled?: boolean;
}

type Anchor = { top: number; bottom: number; left: number; right: number };

/**
 * One «⋯» button that opens a menu of the actions of a row.  The menu is rendered in
 * <body> with position: fixed, so no overflow of a list or table can clip it; it opens
 * below the button when it fits, otherwise above, and is shifted into the screen.
 * It closes on a click outside, Escape, resize and scrolling of the page.
 */
export function RowMenu({
  items,
  label = "Действия",
  busy = false,
  width = 232,
}: {
  items: RowMenuItem[];
  label?: string;
  busy?: boolean;
  width?: number;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) { setPos(null); return; }
    const pad = 8;
    const gap = 6;
    const menuWidth = Math.min(width, window.innerWidth - pad * 2);
    const height = menuRef.current.scrollHeight;
    const below = window.innerHeight - anchor.bottom - gap - pad;
    const above = anchor.top - gap - pad;
    let top: number;
    let maxHeight: number;
    if (height <= below) { top = anchor.bottom + gap; maxHeight = below; }
    else if (height <= above) { top = anchor.top - gap - height; maxHeight = above; }
    else if (below >= above) { top = anchor.bottom + gap; maxHeight = Math.max(below, 120); }
    else { maxHeight = Math.max(above, 120); top = anchor.top - gap - Math.min(height, maxHeight); }
    top = Math.max(pad, top);
    const left = Math.min(Math.max(pad, anchor.right - menuWidth), window.innerWidth - menuWidth - pad);
    setPos({ top, left, maxHeight, width: menuWidth });
  }, [anchor, width, items.length]);

  const closeAndFocus = () => {
    setAnchor(null);
    triggerRef.current?.focus();
  };

  // Focus moves into the menu when it opens (keyboard and screen-reader users).
  useEffect(() => {
    if (!pos || !menuRef.current) return;
    menuRef.current.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    // Only when the menu has just been placed, not on every reposition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos !== null]);

  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The trigger toggles the menu itself; closing here would reopen it on click.
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closeAndFocus(); return; }
      const menu = menuRef.current;
      if (!menu || !menu.contains(document.activeElement)) return;
      const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      let next: number | null = null;
      if (event.key === "ArrowDown") next = (index + 1) % items.length;
      else if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = items.length - 1;
      else if (event.key === "Tab") { setAnchor(null); return; }
      if (next === null) return;
      event.preventDefault();
      items[next].focus();
    };
    // A resize (the mobile URL bar showing / hiding) only re-places the menu under its button.
    const onResize = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
    };
    const onScroll = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        title={label}
        disabled={busy}
        onClick={(event) => {
          if (anchor) { setAnchor(null); return; }
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
        }}
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {anchor && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: "fixed",
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            width: pos?.width ?? width,
            maxHeight: pos?.maxHeight,
            overflowY: "auto",
            visibility: pos ? "visible" : "hidden",
          }}
          className="z-[90] rounded-2xl border border-slate-200 bg-white p-1.5 text-left shadow-xl"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => { closeAndFocus(); item.onSelect(); }}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 ${item.danger ? "text-rose-700" : "text-slate-700"}`}
              >
                {Icon && <Icon className={`h-4 w-4 ${item.danger ? "text-rose-500" : "text-slate-500"}`} />}
                {item.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
