"use client";

import { formatMoney } from "@/lib/money-format";
import type { EnrolBarRow } from "@/lib/enrol-bar";
import { immediatePartRows } from "@/lib/pay-from";

/** The words of the button that opens the details of the sum: one student - his periods, several - each student. */
export const barMoreLabel = (rows: readonly EnrolBarRow[], open: boolean): string => (open ? "Свернуть" : rows.filter((row) => row.amount !== null).length === 1 ? "По периодам" : "По ученикам");

/** The small button at the end of the line under the sum. */
export function BarMoreButton({ rows, open, onToggle }: { rows: readonly EnrolBarRow[]; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-expanded={open} onClick={onToggle} data-testid="enrol-by-student-toggle" className="inline-flex min-h-6 items-center font-semibold text-primary-700 hover:underline max-sm:min-h-10">
      {barMoreLabel(rows, open)}
    </button>
  );
}

/** What the sum is made of: a row per student (name, his periods when there are two, his sum); one student - a row per period («Октябрь, с 27.10 · 2 урока из 9», «Ноябрь, весь месяц»).  The numbers and the periods are the server's, nothing is recounted. */
export function BarDetails({ rows }: { rows: readonly EnrolBarRow[] }) {
  const payers = rows.filter((row) => row.amount !== null);
  const single = payers.length === 1 ? payers[0] : null;
  return (
    <ul className="mt-2 grid max-h-40 gap-2 overflow-y-auto overscroll-contain text-sm" data-testid="enrol-by-student">
      {single
        ? immediatePartRows(single.parts).map((part) => (
          <li key={part.label} className="flex items-baseline justify-between gap-3" data-testid="enrol-by-student-row">
            <span className="min-w-0 [overflow-wrap:anywhere]">{part.label}</span>
            <span className="whitespace-nowrap font-medium tabular-nums">{part.amount}</span>
          </li>
        ))
        : payers.map((row) => (
          <li key={row.id} className="flex items-baseline justify-between gap-3" data-testid="enrol-by-student-row">
            <span className="min-w-0 [overflow-wrap:anywhere]">{row.name}
              {row.parts.length > 1 && (
                <span className="block text-xs text-slate-600">
                  {immediatePartRows(row.parts).map((part) => <span key={part.label} className="flex justify-between gap-3"><span>{part.label}</span><span className="tabular-nums">{part.amount}</span></span>)}
                </span>
              )}
            </span>
            <span className="whitespace-nowrap font-medium tabular-nums">{formatMoney(row.amount)}</span>
          </li>
        ))}
    </ul>
  );
}
