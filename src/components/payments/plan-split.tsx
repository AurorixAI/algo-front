"use client";

import type { PlanSplit } from "@/lib/payment-plan";

/**
 * PAY-TAILS Б11.33 п.2 (lesson 174): «Куда пойдут N сум» - a row per period (the label on the left, the sum and its quiet mark on the right: «из 550 000» / «✓ закрыт»), then the total under a line:
 * what stays («Останется долг» and the quiet «месяц сумма · …»), or no debt.  Every word and number is the server's (`money_rows`, `debt_rest`); nothing is added or folded here.  A sum never breaks; the label does.
 */
export function PlanSplitRows({ split }: { split: PlanSplit }) {
  return (
    <div data-testid="payment-split">
      {/* one grid for all rows: the sums of the rows stand on ONE line (right-aligned), the quiet marks after them in a column of their own */}
      <ul className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-y-1.5 text-sm">
        {split.rows.map((row, index) => (
          <li key={`${row.label}-${index}`} className="contents" data-testid="payment-split-row">
            <span className="min-w-0 text-slate-700" data-testid="payment-split-label">{row.label}</span>
            <span className="whitespace-nowrap pl-3 text-right font-semibold tabular-nums text-slate-900" data-testid="payment-split-amount">{row.amount}</span>
            {row.mark
              ? <span className={`whitespace-nowrap pl-1.5 text-xs ${row.mark.kind === "closed" ? "font-semibold text-emerald-700" : "text-slate-500"}`} data-testid="payment-split-mark">{row.mark.text}</span>
              : <span aria-hidden="true" />}
          </li>
        ))}
      </ul>
      <div className="mt-2 border-t border-slate-200 pt-2" data-testid="payment-split-total">
        <p className="flex items-baseline justify-between gap-3 text-sm font-semibold">
          <span className={`min-w-0 ${split.total.kind === "debt" ? "text-rose-700" : "text-slate-900"}`} data-testid="payment-split-total-label">{split.total.label}</span>
          {split.total.amount && <span className={`shrink-0 whitespace-nowrap text-right tabular-nums ${split.total.kind === "debt" ? "text-rose-700" : "text-slate-900"}`} data-testid="payment-split-total-amount">{split.total.amount}</span>}
        </p>
        {split.debtRest.length > 0 && (
          <p className="mt-0.5 text-xs text-slate-500" data-testid="payment-split-rest">
            {split.debtRest.map((piece, index) => <span key={`${piece}-${index}`}>{index > 0 && " · "}<span className="whitespace-nowrap">{piece}</span></span>)}
          </p>
        )}
      </div>
    </div>
  );
}
