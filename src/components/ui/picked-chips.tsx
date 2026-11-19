"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { TAP_ZONE, TAP_ZONE_ROWS } from "@/lib/tap-zone";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface PickedChip {
  id: string;
  label: string;
}

/** One chosen thing as a label with a cross: the cross is a button named by `removeLabel`; a long name wraps inside the label (names are never cut). */
export function RemovableChip({ label, onRemove, removeLabel, testId }: { label: string; onRemove: () => void; removeLabel: string; testId?: string }) {
  return (
    <span data-testid={testId} data-kind="removable-chip" className="inline-flex min-h-[30px] max-w-full items-center gap-1.5 rounded-2xl bg-primary-50 py-0.5 pl-3 pr-1 text-sm font-medium text-primary-900">
      <span className="min-w-0 [overflow-wrap:anywhere]" title={label}>{label}</span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className={`${TAP_ZONE} inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-800 outline-none hover:bg-primary-200 focus-visible:ring-2 focus-visible:ring-primary-500`}
      >
        <X className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </span>
  );
}

const MORE_CLASS = "inline-flex min-h-[30px] items-center rounded-full bg-slate-100 px-3 text-sm font-medium text-slate-700 outline-none hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-primary-500 max-sm:min-h-10";

/**
 * The chosen ones as labels under a search field: the row never grows over `maxRows` lines - what does not fit hides behind «ещё N» (a button that opens all of them, «Свернуть» closes).  The measuring
 * happens in the layout effect before the first paint, so nothing flickers; a change of the set or of the width starts the measuring again.
 */
export function PickedChips({ items, onRemove, removeLabel, maxRows = 2, testId = "picked-chips" }: { items: readonly PickedChip[]; onRemove: (id: string) => void; removeLabel: (label: string) => string; maxRows?: number; testId?: string }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [limit, setLimit] = useState<number>(Number.POSITIVE_INFINITY);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(0);
  const signature = items.map((item) => `${item.id}:${item.label}`).join("|");

  // a new set of chips or another width: measure again from «all of them»
  useIsomorphicLayoutEffect(() => { setLimit(Number.POSITIVE_INFINITY); }, [signature, width, open]);
  useEffect(() => { if (items.length === 0) setOpen(false); }, [items.length]);
  // another window width (a phone turned over): measure again.  Not an observer of the box: its own height changes the scrollbar of the window, the scrollbar changes the width, and the measuring would never rest.
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const shown = open ? items.length : Math.min(limit, items.length);
  useIsomorphicLayoutEffect(() => {
    const element = box.current;
    if (!element || open) return;
    const children = Array.from(element.children) as HTMLElement[];
    if (children.length === 0) return;
    const tops = Array.from(new Set(children.map((child) => child.offsetTop))).sort((a, b) => a - b);
    if (tops.length <= maxRows) return;
    const firstOver = children.findIndex((child) => child.offsetTop >= tops[maxRows]);
    // the «ещё N» button itself may be the one that does not fit: take one more chip away
    setLimit(Math.max(0, firstOver >= shown ? shown - 1 : firstOver - 1));
  });

  const hidden = items.length - shown;
  return (
    <div ref={box} data-testid={testId} role="list" aria-label="Выбранные" className={`flex flex-wrap gap-1.5 ${TAP_ZONE_ROWS} ${open ? "max-h-44 overflow-y-auto overscroll-contain" : ""}`}>
      {items.slice(0, shown).map((item) => (
        <div key={item.id} role="listitem" className="max-w-full">
          <RemovableChip label={item.label} removeLabel={removeLabel(item.label)} onRemove={() => onRemove(item.id)} testId="picked-chip" />
        </div>
      ))}
      {hidden > 0 && (
        <button type="button" aria-expanded={false} onClick={() => setOpen(true)} data-testid="picked-chips-more" className={MORE_CLASS}>
          ещё {hidden}
        </button>
      )}
      {open && items.length > 0 && (
        <button type="button" aria-expanded onClick={() => setOpen(false)} data-testid="picked-chips-less" className={MORE_CLASS}>
          Свернуть
        </button>
      )}
    </div>
  );
}
