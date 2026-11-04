import { PERIOD_CHIP_CLASS, type PeriodView } from "@/lib/closed-period";

/**
 * Money-1 A1: «Месяц закрыт» / «Месяц переоткрыт» / «Месяц открыт» - the state of the month of a teacher as the server gives it (the rule «закрыт, когда ведомость сохранена
 * после конца месяца» is the server's).  One chip for the month list and the sheet; the hint (what it means, what to do) is its tooltip.
 */
export function PeriodChip({ view, className = "" }: { view: PeriodView; className?: string }) {
  return (
    <span
      data-testid="period-chip"
      data-tone={view.tone}
      title={view.hint}
      className={`inline-block max-w-full rounded-2xl border px-2.5 py-0.5 text-xs font-semibold ${PERIOD_CHIP_CLASS[view.tone]} ${className}`}
    >
      {view.label}
    </span>
  );
}
