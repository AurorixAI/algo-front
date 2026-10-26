import { PACKAGE_FILL_CLASS, PACKAGE_SEGMENTS_MAX, PACKAGE_TEXT_CLASS, packageProgress, type PackageProgress as Progress } from "@/lib/package-progress";
import type { MembershipPaymentRow } from "@/lib/payments";

type Row = Parameters<typeof packageProgress>[0];

const EMPTY = "bg-slate-200 dark:bg-slate-600";

/**
 * The bar of a package: ONE SEGMENT PER LESSON (up to 24; a bigger package is a solid bar).  The lessons that are left are filled with the colour of the state (green /
 * amber / red), the used ones are a quiet grey.  It shows what is LEFT, as its words say (LESSONS_LEARNED 13a).  `role="progressbar"`: now = lessons left, max = the package.
 */
function Bar({ p, compact }: { p: Progress; compact?: boolean }) {
  const segmented = p.total <= PACKAGE_SEGMENTS_MAX;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={p.total}
      aria-valuenow={p.left}
      aria-label={p.ariaLabel}
      data-testid="package-bar"
      data-tone={p.tone}
      data-segments={segmented ? p.total : 0}
      className={`flex w-full ${compact ? "h-1.5 gap-px" : "h-2 gap-[2px]"} ${segmented ? "" : `overflow-hidden rounded-full ${EMPTY}`}`}
    >
      {segmented
        ? Array.from({ length: p.total }, (_, index) => (
            <span key={index} aria-hidden data-filled={index < p.left ? "1" : "0"} className={`h-full min-w-0 flex-1 rounded-[3px] ${index < p.left ? PACKAGE_FILL_CLASS[p.tone] : EMPTY}`} />
          ))
        : <span aria-hidden className={`h-full rounded-full transition-[width] ${PACKAGE_FILL_CLASS[p.tone]}`} style={{ width: `${p.percent}%` }} />}
    </div>
  );
}

/**
 * The package of lessons as a progress block (nothing for a calendar mode).  `card`: on the card of the student - «Осталось 8 из 12 уроков» and «до ~21.11» over the segmented bar,
 * «по расписанию» / «Пакет закончился» under it.  `compact`: in the tables - «8/12 уроков» (the colour of the state), the date as quiet grey text, a thin bar.  One component for every place.
 */
export function PackageProgress({ row, variant = "card", className = "" }: { row: Row | MembershipPaymentRow; variant?: "card" | "compact"; className?: string }) {
  const p = packageProgress(row);
  if (!p) return null;
  if (variant === "compact") {
    return (
      <div data-testid="package-progress-compact" className={`w-full max-w-[10.5rem] min-w-[7rem] space-y-1 ${className}`}>
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs leading-tight tabular-nums">
          <span className={`whitespace-nowrap font-semibold ${PACKAGE_TEXT_CLASS[p.tone]}`}>{p.shortText}</span>
          {p.forecastDay ? <span className="whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-400">до {p.forecastDay}</span> : p.left === 0 ? <span className="text-[11px] text-slate-400">закончился</span> : null}
        </p>
        <Bar p={p} compact />
      </div>
    );
  }
  return (
    <div data-testid="package-progress" className={`w-full space-y-1.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={`text-xs font-semibold tabular-nums ${PACKAGE_TEXT_CLASS[p.tone]}`}>{p.leftText}</p>
        {p.forecastDay && <p className="whitespace-nowrap text-xs tabular-nums text-slate-500 dark:text-slate-400" data-testid="package-forecast-day">до ~{p.forecastDay}</p>}
      </div>
      <Bar p={p} />
      {p.forecastNote && <p className="text-[11px] text-slate-500 dark:text-slate-400" data-testid="package-forecast">{p.forecastNote}</p>}
    </div>
  );
}
