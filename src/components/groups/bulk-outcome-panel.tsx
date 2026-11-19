"use client";

import { Check, X } from "lucide-react";
import { SOURCE_REQUIRED_HINT } from "@/lib/transfer-source";

/** One chosen student after the write: got in, or was refused with the reason of the server. */
export interface BulkOutcomeRow { id: string; name: string; ok: boolean; reason: string | null; code?: string | null }

/** Money-2 Э4: the result of a bulk enrolment / transfer PER STUDENT in the order they were chosen - a tick for the ones who got in, a cross and the server's reason for every refused one. */
export function BulkOutcomePanel({ rows }: { rows: readonly BulkOutcomeRow[] }) {
  return (
    <ul data-testid="bulk-outcome" className="grid gap-2.5 px-5 pb-4 pt-1 text-sm max-sm:px-4">
      {rows.map((row) => (
        <li key={row.id} data-testid={row.ok ? "bulk-outcome-added" : "bulk-outcome-skipped"} className="grid grid-cols-[18px_minmax(0,1fr)] items-baseline gap-2.5">
          {row.ok
            ? <Check className="h-4 w-4 translate-y-0.5 text-success-700" strokeWidth={3} aria-label="Записан" />
            : <X className="h-4 w-4 translate-y-0.5 text-danger-600" strokeWidth={3} aria-label="Не записан" />}
          <span className="min-w-0">
            <span className="[overflow-wrap:anywhere]">{row.name}</span>
            {!row.ok && row.reason && <span className="mt-0.5 block text-xs text-slate-600 [overflow-wrap:anywhere]" data-testid="bulk-outcome-reason">{row.reason}</span>}
            {!row.ok && row.code === "TRANSFER_SOURCE_REQUIRED" && <span className="mt-0.5 block text-xs text-slate-600 [overflow-wrap:anywhere]" data-testid="bulk-outcome-hint">{SOURCE_REQUIRED_HINT}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
