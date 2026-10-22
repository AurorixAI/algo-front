"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { formatMoney } from "@/lib/payments";
import { COLLECTION_COST_HINT, collectionDebtNote, collectionRows, collectionTotalDebtorsHint, collectionTotalView, debtorsHref, type CollectionRowView, type MonthCollection } from "@/lib/payments-income-v2";
import { ProgressBar } from "./income-parts";

const GRID = "md:grid md:grid-cols-[minmax(0,1.6fr)_7.5rem_7.5rem_minmax(0,1.3fr)_7rem_6.5rem] md:items-center md:gap-x-4";

/** The words of an empty cell: debt 0 is good news (a quiet green tick), no debtors is a muted 0 — never «нет». */
export const PAID_TEXT = "оплачено";

/** A cell of the row: its name on a phone (the card), only the figure from md (the table).  Money is right-aligned, «Должников» is centred. */
function Cell({ label, col, align, className = "", title, children }: { label: string; col: string; align: "right" | "center"; className?: string; title?: string; children: React.ReactNode }) {
  return (
    <div title={title} data-col={col} className={`flex items-baseline justify-between gap-3 text-sm md:block ${align === "center" ? "md:text-center" : "md:text-right"} ${className}`}>
      <span className="text-xs text-slate-400 md:hidden">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

/** ⓘ: the shared `Hint` (hover, keyboard focus, a tap pins it open, Escape closes it; the bubble is portaled, so the table never clips it). */
function InfoTip({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  return (
    <span className={`inline-flex align-middle ${className}`} data-testid="collection-cost-info">
      <Hint text={text} className="inline-flex p-0.5 text-slate-400 hover:text-slate-600">
        <Info className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">{label}</span>
      </Hint>
    </span>
  );
}

const MUTED_ZERO = <span className="text-slate-400">0</span>;

function RowBody({ row, debtorsHint }: { row: CollectionRowView; /** Total row only: the tooltip of the distinct-students cell and the «*» when it differs from the sum of the rows. */ debtorsHint?: { title: string; marker: boolean } | null }) {
  // Nothing charged: there is no debt to call paid.
  const nothingCharged = row.charged === 0 && row.debt === 0;
  return (
    <>
      <div className="order-1 min-w-0 md:order-none" data-col="group">
        <p className="break-words text-sm font-medium text-slate-800">{row.title}</p>
        {row.teacher && <p className="truncate text-xs text-slate-500">{row.teacher}</p>}
      </div>
      <Cell label="Стоимость" col="charged" align="right" className="order-3 mt-1 font-medium text-slate-700 md:order-none md:mt-0">{formatMoney(row.charged)}</Cell>
      <Cell label="Оплачено" col="paid" align="right" className="order-4 font-medium text-slate-800 md:order-none">{formatMoney(row.paid)}</Cell>
      <div className="order-2 mt-2 flex items-center gap-2.5 md:order-none md:mt-0" data-col="pct">
        {row.pct !== null ? (
          <>
            <div className="min-w-0 flex-1"><ProgressBar pct={row.pct} label={`Собрано: ${row.title}`} /></div>
            <span className="w-11 shrink-0 text-right text-sm font-medium tabular-nums text-slate-700">{row.pctText}</span>
          </>
        ) : (
          <span className="text-xs text-slate-400">ничего не начислено</span>
        )}
      </div>
      <Cell label="Долг" col="debt" align="right" className="order-5 md:order-none">
        {row.debt > 0 ? <span className="font-medium text-rose-600">{formatMoney(row.debt)}</span> : nothingCharged ? <span className="text-slate-400">—</span> : <span className="text-xs font-medium text-emerald-600" data-testid="collection-paid">✓ {PAID_TEXT}</span>}
      </Cell>
      <Cell label="Должников" col="debtors" align="center" className={`order-6 md:order-none ${row.debtors > 0 ? "font-medium text-slate-700" : ""}`} title={debtorsHint?.title}>
        {row.debtors > 0 ? row.debtors : MUTED_ZERO}
        {debtorsHint?.marker && <span data-testid="collection-total-marker" aria-hidden className="ml-0.5 text-slate-400">*</span>}
      </Cell>
    </>
  );
}

/**
 * «Группы — собираемость»: a caption, then the group (teacher) | cost | paid | a bar with the percent | debt | debtors; every header is one
 * line.  The worst collection is on top; a row opens «Должники» of that group.  A card on a phone with the same short labels.
 */
export function CollectionTable({ collection, paymentsBase, debtToday, caption }: { collection: MonthCollection; paymentsBase: string; /** The card «Долг на сегодня» (all months): when it differs from the month's debt, one quiet line says why. */ debtToday?: number | null; /** «Октябрь 2026 · по группам». */ caption?: string }) {
  const rows = collectionRows(collection);
  const total = collectionTotalView(collection);
  const totalHint = collectionTotalDebtorsHint(collection);
  const debtNote = collectionDebtNote(collection, debtToday);
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center" data-testid="collection-empty">
        <p className="text-sm font-medium text-slate-600">В этом месяце в группах ничего не начислено</p>
      </div>
    );
  }
  return (
    <section aria-label="Группы — собираемость" data-testid="income-collection">
      {caption && (
        <p className="mb-2 flex items-center gap-1 px-1 text-xs text-slate-500" data-testid="collection-caption">
          {caption}
          <InfoTip text={COLLECTION_COST_HINT} label="Что значит «Стоимость»" className="md:hidden" />
        </p>
      )}
      <div className="md:overflow-hidden md:rounded-2xl md:border md:border-slate-200 md:bg-white">
        <div role="presentation" className={`hidden border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[13px] font-semibold text-slate-500 [&>span]:whitespace-nowrap ${GRID}`} data-testid="collection-head">
          <span data-col="group">Группа</span>
          <span data-col="charged" className="text-right" title={COLLECTION_COST_HINT}>Стоимость <InfoTip text={COLLECTION_COST_HINT} label="Что значит «Стоимость»" /></span>
          <span data-col="paid" className="text-right">Оплачено</span>
          <span data-col="pct">Собрано</span>
          <span data-col="debt" className="text-right">Долг</span>
          <span data-col="debtors" className="text-center">Должников</span>
        </div>
        <ul className="flex flex-col gap-2.5 md:gap-0 md:divide-y md:divide-slate-100">
          {rows.map((row) => (
            <li key={row.key}>
              <Link
                href={debtorsHref(paymentsBase, { groupId: row.groupId })}
                data-testid="collection-row"
                aria-label={`${row.title}: открыть должников группы`}
                className={`flex flex-col rounded-xl border border-slate-200 bg-white p-3.5 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 md:rounded-none md:border-0 md:px-4 md:py-3 ${GRID}`}
              >
                <RowBody row={row} />
              </Link>
            </li>
          ))}
        </ul>
        {total && (
          <div className={`mt-2.5 flex flex-col rounded-xl bg-slate-50 p-3.5 md:mt-0 md:rounded-none md:border-t md:border-slate-200 md:px-4 md:py-3 ${GRID}`} data-testid="collection-total">
            <RowBody row={total} debtorsHint={totalHint} />
          </div>
        )}
        {debtNote && <p className="mt-2.5 px-1 text-xs leading-relaxed text-slate-600 md:mt-0 md:border-t md:border-slate-100 md:px-4 md:py-2.5" data-testid="collection-debt-note">{debtNote}</p>}
      </div>
    </section>
  );
}
