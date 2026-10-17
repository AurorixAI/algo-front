"use client";

import { Wallet } from "lucide-react";

/**
 * «Без цены (N)» of the groups list (money roles only): the groups the students of which have no price.  The payroll
 * warning «не задана цена» leads here (`?price=none`).  Rendered only while there is something to show.
 */
export function GroupPriceFilter({ count, active, onToggle }: { count: number; active: boolean; onToggle: () => void }) {
  if (count === 0 && !active) return null;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Wallet className="h-4 w-4" aria-hidden="true" />
      Без цены{count > 0 ? ` (${count})` : ""}
    </button>
  );
}
