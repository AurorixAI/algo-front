import { PACKAGE_FILL_CLASS, PACKAGE_TEXT_CLASS, packageProgress, type PackageProgress as Progress } from "@/lib/package-progress";
import type { MembershipPaymentRow } from "@/lib/payments";

type Row = Parameters<typeof packageProgress>[0];

function Bar({ p, thin }: { p: Progress; thin?: boolean }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={p.total}
      aria-valuenow={p.used}
      aria-label={p.ariaLabel}
      data-testid="package-bar"
      data-tone={p.tone}
      className={`w-full overflow-hidden rounded-full bg-slate-100 ${thin ? "h-1" : "h-2"}`}
    >
      <div className={`h-full rounded-full transition-[width] ${PACKAGE_FILL_CLASS[p.tone]}`} style={{ width: `${p.percent}%` }} />
    </div>
  );
}

/**
 * The package of lessons as a progress line (nothing for a calendar mode).  `card`: under the price on the card of the student - «Осталось 8 из 12 уроков», the bar, what the
 * schedule promises.  `compact`: in the tables - «8/12 уроков» (the colour of the state), the date as quiet grey text, a thin bar.  One component for every place.
 */
export function PackageProgress({ row, variant = "card", className = "" }: { row: Row | MembershipPaymentRow; variant?: "card" | "compact"; className?: string }) {
  const p = packageProgress(row);
  if (!p) return null;
  if (variant === "compact") {
    return (
      <div data-testid="package-progress-compact" className={`w-full max-w-[9.5rem] min-w-[6.5rem] space-y-1 ${className}`}>
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs leading-tight tabular-nums">
          <span className={`whitespace-nowrap font-semibold ${PACKAGE_TEXT_CLASS[p.tone]}`}>{p.shortText}</span>
          {p.forecastDay ? <span className="whitespace-nowrap text-[11px] text-slate-400">до {p.forecastDay}</span> : p.left === 0 ? <span className="text-[11px] text-slate-400">закончился</span> : null}
        </p>
        <Bar p={p} thin />
      </div>
    );
  }
  return (
    <div data-testid="package-progress" className={`max-w-sm space-y-1.5 ${className}`}>
      <p className={`text-xs font-semibold tabular-nums ${PACKAGE_TEXT_CLASS[p.tone]}`}>{p.leftText}</p>
      <Bar p={p} />
      {p.forecastLine && <p className="text-xs text-slate-500" data-testid="package-forecast">{p.forecastLine}</p>}
    </div>
  );
}
