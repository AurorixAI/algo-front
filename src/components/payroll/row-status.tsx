"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { RowStatusView } from "@/lib/payroll";
import { STATUS_CHIP_CLASS } from "@/lib/payroll";
import { StatusChip } from "./sheet-controls";

/**
 * The ONE status chip of a row of the month list (UX pack §5.2-бис).  «Сохранено 05.11» and «Не рассчитано» are plain chips; «Требует действия · N» is amber and OPENS the list of its items - on hover,
 * on a tap / a click and on focus - every item a link to where it is done (the changed salary among them: «Зарплата изменилась на −45 000 сум — сохраните новую сумму»).  The list is drawn in a layer of
 * the page (a portal), so the rounded table around the rows never cuts it; Escape and a click outside close it.
 */
export function RowStatus({ status, hint, name }: { status: RowStatusView; hint?: string; name: string }) {
  const button = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);

  const place = useCallback(() => {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(352, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12));
    setBox({ top: rect.bottom + 6, left, width });
  }, []);
  const show = useCallback(() => { if (timer.current) clearTimeout(timer.current); place(); setOpen(true); }, [place]);
  const hideSoon = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 160); }, []);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: Event) => {
      const target = event.target as Node | null;
      if (target && (button.current?.contains(target) || panel.current?.contains(target))) return;
      setOpen(false);
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (status.tone !== "todo") return <StatusChip status={{ tone: status.tone, label: status.label }} hint={hint} />;
  return (
    <>
      <button
        ref={button}
        type="button"
        data-testid="status-todo"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${status.label}: ${name}`}
        onClick={show}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        className={`inline-flex min-h-[40px] max-w-full items-center gap-1 xl:min-h-[32px] rounded-2xl border px-2.5 py-1 text-xs font-semibold ${STATUS_CHIP_CLASS.changed}`}
      >
        <span className="min-w-0 break-words text-left">{status.label}</span>
        <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && box && typeof document !== "undefined" && createPortal(
        <div
          ref={panel}
          role="region"
          aria-label={`Что нужно сделать: ${name}`}
          data-testid="status-todo-panel"
          onMouseEnter={show}
          onMouseLeave={hideSoon}
          style={{ position: "fixed", top: box.top, left: box.left, width: box.width }}
          className="z-[200] rounded-xl border border-amber-200 bg-white p-2 text-left shadow-xl"
        >
          <p className="px-2 pb-1 pt-0.5 text-xs font-semibold text-slate-600">Что нужно сделать</p>
          <ul className="space-y-0.5">
            {status.items.map((item) => (
              <li key={item.key}>
                <Link href={item.href} data-testid="status-todo-item" className="flex min-h-[40px] items-center rounded-lg px-2 py-1.5 text-sm font-medium leading-5 text-amber-900 hover:bg-amber-50 hover:underline">{item.text}</Link>
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
