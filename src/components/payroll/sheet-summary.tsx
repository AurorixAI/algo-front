"use client";

import { Download, Loader2, Printer, RefreshCw, Save } from "lucide-react";
import { formatMoney } from "@/lib/payments";
import {
  NOTE_MAX_LENGTH,
  sheetFactsParts,
  type RatesNow,
  sheetNoFeeHref,
  warningViews,
  type PayrollDiff,
  type PayrollMonthWarnings,
  type PayrollSheet,
  type PayrollSheetWarnings,
  type SheetCardStatus,
} from "@/lib/payroll";
import { DiffDetails, WarningLinks } from "./sheet-controls";

const DOT: Record<SheetCardStatus["tone"], string> = {
  preview: "bg-slate-400",
  saved: "bg-emerald-500",
  changed: "bg-amber-500",
  dirty: "bg-primary-500",
};

/**
 * The card on top of a sheet (UX-2): «К выплате» big, ONE line of facts under it (rate · counted · unpaid), the status of the
 * sheet («Сохранено 16.10.2026 в 08:56» / «После сохранения изменились данные: −16 666 сум») and the ONE main button.
 * Excel and print are the quiet buttons of the corner.  The total here follows the unsaved edits, like the table.
 */
export function SheetSummaryCard({
  sheet, total, accrued, status, savedBy, busy, blockedReason, diff, ratesNow, warnings,
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
  // «без оплаты» is already in the line of facts under the total: the card does not say it twice
  const counts = warnings === undefined ? sheet.warnings : warnings;
  const warningList = counts
    ? warningViews(counts, counts === sheet.warnings ? { noFeeHref: sheetNoFeeHref(sheet) } : {}).filter((view) => view.key !== "unpaid")
    : [];
  const changed = status.tone === "changed";
  const primaryLabel = status.action === "recalculate" ? "Пересчитать" : "Сохранить";
  return (
    <section
      aria-label="Итог ведомости"
      className={`rounded-2xl border bg-white px-5 py-5 print:rounded-none print:border-slate-400 print:px-0 print:py-2 ${changed ? "border-amber-200 bg-amber-50/50" : "border-slate-200"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">К выплате</p>
          <p data-testid="payroll-total" className="mt-0.5 text-3xl font-bold tabular-nums text-slate-900">{formatMoney(total)}</p>
          <p className="mt-2 text-sm text-slate-600">{facts.join(" · ")}</p>
          {warningList.length > 0 && (
            <div className="mt-1.5">
              <WarningLinks views={warningList} label="Предупреждения ведомости" />
            </div>
          )}
          {sheet.note && <p className="mt-1.5 break-words text-sm text-slate-600">Примечание: {sheet.note}</p>}
        </div>
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
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[status.tone]}`} />
          <span className="min-w-0">
            {status.text}
            {status.tone === "saved" && savedBy ? <span className="text-slate-500"> · {savedBy}</span> : null}
          </span>
        </p>
        {status.action && (
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

      {changed && diff && <DiffDetails diff={diff} />}
    </section>
  );
}
