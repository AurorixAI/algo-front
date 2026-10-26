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
        className="ml-1.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 align-middle text-[10px] font-bold leading-none text-slate-500 hover:border-slate-400 hover:bg-slate-100"
      >
        ?
      </button>
      {open && <span id={id} role="note" className="mt-1 block text-xs font-normal leading-relaxed text-slate-500">{children}</span>}
    </>
  );
}
