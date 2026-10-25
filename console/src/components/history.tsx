"use client";

import type { AuditRow } from "../lib/types";
import { fmtDateTime } from "../lib/format";

/** The «История» block of a card: who did what and when (Tashkent time), with the reason when there is one. */
export function History({ rows }: { rows: AuditRow[] | undefined }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-slate-400">Действий пока не было.</p>;
  return (
    <ol className="space-y-3 border-l border-slate-200 pl-4">
      {rows.map((row) => (
        <li key={row.id} className="relative text-sm">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-slate-300 ring-2 ring-white" aria-hidden />
          <p className="font-medium text-slate-800">{row.label || row.action}</p>
          <p className="text-xs text-slate-500">
            {fmtDateTime(row.created_at)} · {row.actor?.name ?? "система"}
          </p>
          {row.reason && <p className="mt-0.5 text-slate-600">«{row.reason}»</p>}
        </li>
      ))}
    </ol>
  );
}
