import type { ReactNode } from "react";

/**
 * The bottom bar of a window that ends with an action that costs something: on the left a small caption and ONE big sum, on the right the button, under both one line that explains the sum
 * (a phone: the sum, the line, then the button across the whole width).  `dim`: the sum is the previous one and is being counted again - it fades, nothing moves.  No sum (`amount` empty): `idle`
 * says what is missing («Выберите учеников»).  The bar brings its own tone and padding; the window gives it the whole footer.
 */
export function SummaryBar({ label, amount, unit, dim = false, idle, line, action, children, testId = "summary-bar" }: {
  label: string;
  amount?: string | null;
  unit?: string;
  dim?: boolean;
  /** what stands instead of the sum when there is none */
  idle?: ReactNode;
  /** the one line under the sum and the button */
  line?: ReactNode;
  action: ReactNode;
  /** an extra part under the line (the list «По ученикам») */
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <div data-testid={testId} aria-busy={dim || undefined} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 bg-slate-50 px-5 pb-4 pt-4 max-sm:grid-cols-1 max-sm:px-4">
      <div className="min-w-0">
        {amount ? (
          <>
            <p className="text-xs text-slate-600">{label}</p>
            <p data-testid="summary-bar-sum" className={`mt-0.5 whitespace-nowrap text-2xl font-bold leading-tight tabular-nums text-slate-900 transition-opacity ${dim ? "opacity-50" : ""}`}>
              {amount}{unit && <>{"\u00a0"}<span className="text-base font-semibold text-slate-600">{unit}</span></>}
            </p>
          </>
        ) : idle ? (
          <p data-testid="summary-bar-idle" className="pb-3 text-sm text-slate-600 max-sm:pb-0">{idle}</p>
        ) : null}
      </div>
      <div className="max-sm:row-start-3 max-sm:mt-3 max-sm:[&>button]:w-full">{action}</div>
      {line ? <div data-testid="summary-bar-line" className="col-span-full mt-1.5 min-h-[1.25rem] text-xs text-slate-600 [overflow-wrap:anywhere]">{line}</div> : null}
      {children ? <div className="col-span-full">{children}</div> : null}
    </div>
  );
}
