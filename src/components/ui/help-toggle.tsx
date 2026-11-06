"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * A «?» that opens a longer explanation under the line it stands in (a tap works on a phone, unlike a hover tooltip).  The line itself stays one short sentence.
 * The parent is a block: the note takes its own row.
 */
export function HelpToggle({ children, label = "Подробнее", testId }: { children: ReactNode; label?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        title={label}
        data-testid={testId}
        className="group -my-3 -mr-2 ml-0 inline-flex h-10 w-10 shrink-0 items-center justify-center align-middle focus-visible:outline-none"
      >
        {/* the touch target is 40 px (re-audit С3); the mark stays the small circle */}
        <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold leading-none text-slate-500 group-hover:border-slate-400 group-hover:bg-slate-100 group-focus-visible:ring-2 group-focus-visible:ring-primary-500/40">?</span>
      </button>
      {open && <span id={id} role="note" className="mt-1 block text-xs font-normal leading-relaxed text-slate-500">{children}</span>}
    </>
  );
}
