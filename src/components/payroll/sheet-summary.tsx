"use client";

import { Download, Loader2, Printer, RefreshCw, Save } from "lucide-react";
import { formatMoney } from "@/lib/payments";
import { formatBusinessDate } from "@/lib/business-time";
import {
  NOTE_MAX_LENGTH,
  sheetFactsParts,
  type RatesNow,
  type PayrollDiff,
  type PayrollMonthWarnings,
  type PayrollSheet,
  type PayrollSheetWarnings,
  type SheetCardStatus,
} from "@/lib/payroll";
import { RESAVE_LABEL, savedChangeLine, sheetHeadline, sheetPrintTotals, sheetWrittenOffLessons, splitSavedFacts, writtenOffText } from "@/lib/payroll-logica";
import { CLOSE_MONTH_LABEL, REOPEN_BUTTON, type PeriodView } from "@/lib/closed-period";
import { DiffDetails } from "./sheet-controls";
import { PeriodChip } from "./period-chip";

const DOT: Record<SheetCardStatus["tone"], string> = {
  preview: "bg-slate-400",
  saved: "bg-emerald-500",
  changed: "bg-amber-500",
  dirty: "bg-primary-500",
};

/**
 * The card on top of a sheet (UX-2): «К выплате» big (an open month: «Начислено сейчас», D-2 of the walk of 05.11), ONE line of facts under it (rate · counted · unpaid), the status of the
 * sheet («Сохранено 16.10.2026 в 08:56» / «После сохранения изменились данные: −16 666 сум») and the ONE main button.
 * Excel and print are the quiet buttons of the corner.  The total here follows the unsaved edits, like the table.
 */
export function SheetSummaryCard({
  sheet, total, accrued, status, savedBy, busy, blockedReason, diff, ratesNow, warnings, period, monthRunning = false, onReopen,
  onPrimary, onExcel, exporting, onPrint, note, onNote,
}: {
  sheet: PayrollSheet;
  total: number;
  /** The unpaid lessons switched to «начислить» (with the unsaved edits). */
  accrued: number;
  status: SheetCardStatus;
  /** «Иванов И.» - who saved the sheet; null for a calculation not saved yet. */
  savedBy?: string | null;
  /** The main button is working. */
  busy: boolean;
  /** Why the main button is off (a sheet with no lines cannot be saved). */
  blockedReason?: string | null;
  /** The difference the recalculation would make (a sheet whose data moved). */
  diff?: PayrollDiff | null;
  /** The rate in force in the month of a saved sheet: the facts line says when it is not the sheet's. */
  ratesNow?: RatesNow | null;
  /**
   * The warnings under the total.  A saved sheet passes the FRESH ones (the month overview of this teacher: a price set after the
   * saving is not «нет цены» any more); `null` = not known yet (nothing is said); absent = the sheet's own (a calculation not saved).
   */
  warnings?: PayrollSheetWarnings | PayrollMonthWarnings | null;
  /** Money-1 A1: the state of the month of this teacher (a saved sheet only); `onReopen` is given to a person who may reopen it (the owner). */
  period?: PeriodView | null;
  /** The month is still going: the page already says «месяц ещё идёт» - the chip «Месяц открыт» would say it twice (UX pack №23). */
  monthRunning?: boolean;
  onReopen?: () => void;
  onPrimary: () => void;
  /** Absent for a calculation not saved yet: there is no file of it. */
  onExcel?: () => void;
  exporting?: boolean;
  onPrint: () => void;
  /** The note of the version; shown next to «Сохранить» of a calculation not saved yet. */
  note?: string;
  onNote?: (text: string) => void;
}) {
  const facts = sheetFactsParts(sheet, accrued, ratesNow);
  // D-2 (walk of 05.11): an open month is paid by what is accrued now - the big number is that, the saved one opens the line of facts with the counts in its brackets (they describe the saved sheet)
  const headline = sheetHeadline({ total, dirty: status.tone === "dirty", payout: sheet.payout, updatedAt: sheet.updated_at });
  const changed = status.tone === "changed";
  const printTotals = status.tone === "dirty" ? null : sheetPrintTotals({ payout: sheet.payout, today: formatBusinessDate() });
  // a REOPENED month is closed again by a save, with or without changes: its button says so
  const primaryLabel = status.action === "recalculate" ? (period?.tone === "reopened" ? CLOSE_MONTH_LABEL : RESAVE_LABEL) : "Сохранить";
  return (
    <section
      aria-label="Итог ведомости"
      className={`rounded-2xl border bg-white px-5 py-5 print:rounded-none print:border-slate-400 print:px-0 print:py-2 ${changed ? "border-amber-200 bg-amber-50/50" : "border-slate-200"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className={`min-w-0 ${printTotals ? "print:hidden" : ""}`}>
          <p className="text-sm text-slate-500" data-testid="payroll-total-label">{headline.label}</p>
          <p data-testid="payroll-total" className="mt-0.5 text-3xl font-bold tabular-nums text-slate-900">{formatMoney(headline.value)}</p>
          {/* a changed sheet: the line holds the rate only - the counts of the SAVED sheet are under «Что изменилось ▸» (UX pack №3) */}
          <p className="mt-2 text-sm text-slate-600" data-testid="payroll-facts">{[headline.saved ? splitSavedFacts(facts).rest.join(" · ") : facts.join(" · "), writtenOffText(sheetWrittenOffLessons(sheet))].filter(Boolean).join(" · ")}</p>
          {sheet.note && <p className="mt-1.5 break-words text-sm text-slate-600">Примечание: {sheet.note}</p>}
        </div>
        {/* UX pack №3 / №19: the PRINT of a changed sheet is a document with ONE total (the saved one) and one line about the accrual of today */}
        {printTotals && (
          <div className="hidden min-w-0 print:block" data-testid="sheet-print-totals">
            <p className="text-sm text-black">{printTotals.label}</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-black">{formatMoney(printTotals.value)}</p>
            <p className="mt-1 text-xs text-black">{printTotals.accruedLine}</p>
            {sheet.note && <p className="mt-1 break-words text-xs text-black">Примечание: {sheet.note}</p>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {onExcel && (
            <button
              type="button"
              onClick={onExcel}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Скачать Excel
            </button>
          )}
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Печать
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-100 pt-3 print:hidden">
        <p role="status" className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
          {/* a reopened month is not «saved and done»: no green dot (UX pack №23) */}
          {!(period?.tone === "reopened" && status.tone === "saved") && <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[status.tone]}`} />}
          <span className="min-w-0" data-testid="sheet-status-text">
            {headline.saved ? savedChangeLine({ payout: sheet.payout, updatedAt: sheet.updated_at }) ?? status.text : status.text}
            {status.tone === "saved" && savedBy ? <span className="text-slate-500"> · {savedBy}</span> : null}
          </span>
        </p>
        {/* a changed salary is saved by the button of the block «Что нужно сделать» over the card - ONE button, not two */}
        {status.action && !changed && (
          <button
            type="button"
            onClick={onPrimary}
            disabled={busy || Boolean(blockedReason)}
            title={blockedReason ?? undefined}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : status.action === "save" ? <Save className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            {primaryLabel}
          </button>
        )}
      </div>

      {period && !(period.tone === "open" && monthRunning && !period.canReopen) && (
        <div data-testid="sheet-period" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 print:hidden">
          <PeriodChip view={period} />
          {period.canReopen && onReopen && (
            <button type="button" data-testid="reopen-month" onClick={onReopen} className="text-sm font-semibold text-primary-700 underline-offset-2 hover:underline">{REOPEN_BUTTON}</button>
          )}
          {period.tone === "reopened" && <span className="text-xs text-amber-900">Исправьте уроки и нажмите «Сохранить и закрыть месяц» — месяц закроется снова</span>}
        </div>
      )}

      {status.action === "save" && onNote && (
        <div className="mt-3 print:hidden">
          <label htmlFor="payroll-card-note" className="mb-1 block text-xs font-medium text-slate-600">Примечание к версии (необязательно)</label>
          <input
            id="payroll-card-note"
            type="text"
            value={note ?? ""}
            maxLength={NOTE_MAX_LENGTH}
            onChange={(event) => onNote(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
          />
        </div>
      )}

      {headline.saved && splitSavedFacts(facts).counted.length > 0 && (
        <details data-testid="sheet-changes" className="mt-3 text-sm text-slate-700 print:hidden">
          <summary className="cursor-pointer select-none font-semibold text-slate-800">Что изменилось</summary>
          <p className="mt-1 text-slate-600" data-testid="sheet-saved-facts">Сохранённая версия: {splitSavedFacts(facts).counted.join(", ")}</p>
          {changed && diff && <DiffDetails diff={diff} />}
        </details>
      )}
      {changed && diff && !(headline.saved && splitSavedFacts(facts).counted.length > 0) && <DiffDetails diff={diff} />}
    </section>
  );
}
