"use client";

import { useCallback, useEffect, useId, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { RowStatusView } from "@/lib/payroll";
import { STATUS_CHIP_CLASS } from "@/lib/payroll";
import { INITIAL_REVEAL, isRevealed, reduceReveal } from "@/lib/reveal";
import { useFloatingPlacement } from "@/lib/use-floating-placement";
import { StatusChip } from "./sheet-controls";

/**
 * The ONE status chip of a row of the month list (UX pack §5.2-бис).  «Сохранено 05.11» and «Не рассчитано» are plain chips; «Требует действия» is amber and OPENS the list of its items - on hover,
 * on a tap / a click and on focus (the tested state machine of the project, `reduceReveal`, as the hint) - every item a link to where it is done (the changed salary among them: «Зарплата изменилась на
 * −45 000 сум — сохраните новую сумму»).  The list is drawn in a layer of the page (a portal, placed by `useFloatingPlacement`), so the rounded table around the rows never cuts it; Escape and a press
 * outside close it.  The mouse may travel from the chip to the list: leaving waits a moment.
 */
/** Re-audit С17: below 1280 px the card is narrow and the page is long - the list opens INSIDE the card (an accordion), a floating layer would cover the name, the sums or the next card. */
const INLINE_QUERY = "(max-width: 1279px)";
function useInlineList(): boolean {
  const [inline, setInline] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(INLINE_QUERY);
    const sync = () => setInline(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);
  return inline;
}

function TodoItems({ status }: { status: RowStatusView }) {
  return (
    <ul className="space-y-0.5">
      {status.items.map((item) => (
        <li key={item.key}>
          <Link href={item.href} data-testid="status-todo-item" className="group flex min-h-[40px] items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium leading-5 text-amber-900 hover:bg-amber-100 focus-visible:bg-amber-100 focus-visible:outline-none">
            <span className="min-w-0 break-words group-hover:underline">{item.text}</span>
            <ChevronRight aria-hidden="true" data-testid="status-todo-item-arrow" className="h-4 w-4 shrink-0 text-amber-600 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function InlineTodo({ status, name }: { status: RowStatusView; name: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="min-w-0 text-left">
      <button
        type="button"
        data-testid="status-todo"
        data-kind="status"
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={`${status.label}: ${name}`}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-2xl border px-2.5 py-1 text-xs font-semibold ${STATUS_CHIP_CLASS.changed}`}
      >
        <span className="whitespace-nowrap text-left">{status.label}</span>
        <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id={panelId} role="group" aria-label={`Что нужно сделать: ${name}`} data-testid="status-todo-panel" data-inline="true" className="mt-2 rounded-xl border border-amber-200 bg-amber-50/60 p-2">
          <p className="px-2 pb-1 pt-0.5 text-xs font-semibold text-slate-600">Что нужно сделать</p>
          <TodoItems status={status} />
        </div>
      )}
    </div>
  );
}

export function RowStatus({ status, hint, name }: { status: RowStatusView; hint?: string; name: string }) {
  const inline = useInlineList();
  const [reveal, dispatch] = useReducer(reduceReveal, INITIAL_REVEAL);
  const open = isRevealed(reveal);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();
  const hide = useCallback(() => dispatch({ type: "dismiss" }), []);
  const { fixedStyle } = useFloatingPlacement(triggerRef, panelRef, { open, width: 352, align: "center", preferSide: "below", gap: 6, onAnchorHidden: hide });

  const enter = useCallback(() => { if (leaving.current) clearTimeout(leaving.current); dispatch({ type: "mouse-enter" }); }, []);
  const leave = useCallback(() => { if (leaving.current) clearTimeout(leaving.current); leaving.current = setTimeout(() => dispatch({ type: "mouse-leave" }), 160); }, []);
  useEffect(() => () => { if (leaving.current) clearTimeout(leaving.current); }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (triggerRef.current?.contains(target) || panelRef.current?.contains(target))) return;
      hide();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      hide();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, hide]);

  if (status.tone !== "todo") return <StatusChip status={{ tone: status.tone, label: status.label }} hint={hint} />;
  if (inline) return <InlineTodo status={status} name={name} />;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="status-todo"
        data-kind="status"
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={`${status.label}: ${name}`}
        onPointerEnter={(event) => dispatch({ type: "pointer-enter", pointerType: event.pointerType })}
        onPointerDown={(event) => dispatch({ type: "pointer-down", pointerType: event.pointerType })}
        onPointerCancel={() => dispatch({ type: "pointer-cancel" })}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={() => dispatch({ type: "focus" })}
        onBlur={() => dispatch({ type: "blur" })}
        onClick={() => dispatch({ type: "click", mousePins: true })}
        className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-2xl border px-2.5 py-1 text-xs font-semibold xl:min-h-[32px] ${STATUS_CHIP_CLASS.changed}`}
      >
        <span className="whitespace-nowrap text-left">{status.label}</span>
        <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={`Что нужно сделать: ${name}`}
          data-testid="status-todo-panel"
          onMouseEnter={enter}
          onMouseLeave={leave}
          style={fixedStyle}
          className="z-[100002] rounded-xl border border-amber-200 bg-white p-2 text-left shadow-xl"
        >
          <p className="px-2 pb-1 pt-0.5 text-xs font-semibold text-slate-600">Что нужно сделать</p>
          <TodoItems status={status} />
        </div>,
        document.body,
      )}
    </>
  );
}
