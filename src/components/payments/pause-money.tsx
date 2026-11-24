"use client";

import type { ReactNode } from "react";
import type { PauseMoneyModel } from "@/lib/payments-logica";

/**
 * PAY-TAILS Б11.39 Э6 / Б11.40: the money of a pause as rows - ONE block for the three places (the calculation under the form, the confirmation of the ending, of the taking off).  The look of the rows is that of
 * `PlanSplitRows` (the label on the left and it wraps, the sum on the right in one line, bold; the total under a line).  Every word and number is the server's (`charge_rows`, `charge_later`, `impact`) and is put
 * together in `pauseMoneyModel`; here nothing is counted.  `children` stand under the rows inside the same grey box (the old one line, «Оплачено до станет…», the other groups).
 */
export function PauseMoneyBox({ model, children, testId }: { model: PauseMoneyModel | null; children?: ReactNode; testId: string }) {
  return (
    <div aria-live="polite" className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700" data-testid={testId}>
      {model && (
        <div data-testid="pause-money" className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-600" data-testid="pause-money-heading">{model.heading}</p>
          {model.rows.length > 0 && (
            <ul className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-y-1.5">
              {model.rows.map((row) => (
                <li key={row.key} className="contents" data-testid="pause-money-row">
                  <span className={`min-w-0 text-slate-800 ${row.amount === null ? "col-span-2" : ""}`} data-testid="pause-money-label">{row.label}</span>
                  {row.amount !== null && <span className="whitespace-nowrap pl-3 text-right font-semibold tabular-nums text-slate-900" data-testid="pause-money-amount">{row.amount}</span>}
                </li>
              ))}
            </ul>
          )}
          {model.total !== null && (
            <p className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2 text-slate-800" data-testid="pause-money-total">
              <span className="min-w-0">Итого</span>
              <span className="shrink-0 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900" data-testid="pause-money-total-amount">{model.total}</span>
            </p>
          )}
          {model.later && <p className="text-xs text-slate-600" data-testid="pause-money-later">{model.later}</p>}
          {model.note && <p className="text-xs text-slate-600" data-testid="pause-money-note">{model.note}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
