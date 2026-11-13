"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { formatMoney } from "@/lib/payments";
import { COLLECTION_COST_HINT, COLLECTION_COST_LINE, collectionDebtNote, collectionRows, collectionTotalDebtorsHint, collectionTotalView, debtorsHref, type CollectionRowView, type MonthCollection } from "@/lib/payments-income-v2";
import { ProgressBar } from "./income-parts";
import { EmptyState } from "@/components/ui/empty-state";
import { DataCell, DataEmpty, DataRow, DataTable, type DataColumn } from "@/components/ui/data-table";

/** The columns: the group is text (left, wide); the cost, the paid sum and the debt are money (RIGHT); «Собрано» is a bar; the number of debtors is a count (RIGHT). */
const COLLECTION_COLUMNS: DataColumn[] = [
  { key: "group", header: "Группа", width: "minmax(0,1.6fr)" },
  { key: "charged", header: <>Стоимость <InfoTip text={COLLECTION_COST_HINT} label="Что значит «Стоимость»" /></>, align: "end", width: "7.5rem", cardLabel: "Стоимость" },
  { key: "paid", header: "Оплачено", align: "end", width: "7.5rem", cardLabel: "Оплачено" },
  { key: "pct", header: "Собрано", width: "minmax(0,1.3fr)" },
  { key: "debt", header: "Долг", align: "end", width: "7.5rem", cardLabel: "Долг" },
  { key: "debtors", header: "Должников", align: "end", width: "6rem", cardLabel: "Должников" },
];

/** The words of an empty cell: debt 0 is good news (a quiet green tick), no debtors is a muted 0 — never «нет». */
export const PAID_TEXT = "оплачено";

/** ⓘ: the shared `Hint` (hover, keyboard focus, a tap pins it open, Escape closes it; the bubble is portaled, so the table never clips it). */
function InfoTip({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  return (
    <span className={`inline-flex align-middle ${className}`} data-testid="collection-cost-info">
      <Hint text={text} side="below" width={320} className="inline-flex p-0.5 text-slate-500 hover:text-slate-600">
        <Info className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">{label}</span>
      </Hint>
    </span>
  );
}

const MUTED_ZERO = <span className="text-slate-500">0</span>;

function RowBody({ row, debtorsHint }: { row: CollectionRowView; /** Total row only: the tooltip of the distinct-students cell and the «*» when it differs from the sum of the rows. */ debtorsHint?: { title: string; marker: boolean } | null }) {
  // Nothing charged: there is no debt to call paid.
  const nothingCharged = row.charged === 0 && row.debt === 0;
  return (
    <>
      <DataCell col="group">
        <p className="break-words text-sm font-medium text-slate-800">{row.title}</p>
        {row.teacher && <p className="truncate text-xs text-slate-500">{row.teacher}</p>}
      </DataCell>
      <DataCell col="charged"><span className="font-medium text-slate-700">{formatMoney(row.charged)}</span></DataCell>
      <DataCell col="paid"><span className="font-medium text-slate-800">{formatMoney(row.paid)}</span></DataCell>
      <DataCell col="pct">
        <div className="flex items-center gap-2.5">
          {row.pct !== null ? (
            <>
              <div className="min-w-0 flex-1"><ProgressBar pct={row.pct} label={`Собрано: ${row.title}`} /></div>
              <span className="w-11 shrink-0 text-right text-sm font-medium tabular-nums text-slate-700">{row.pctText}</span>
            </>
          ) : (
            <span className="text-xs text-slate-500">нет стоимости</span>
          )}
        </div>
      </DataCell>
      <DataCell col="debt">
        {row.debt > 0 ? <span className="font-medium text-rose-600">{formatMoney(row.debt)}</span> : row.waitingDebt > 0 ? null : nothingCharged ? <DataEmpty /> : <span className="text-xs font-medium text-emerald-700" data-testid="collection-paid">✓ {PAID_TEXT}</span>}
        {row.waitingDebt > 0 && <span className="block text-xs font-normal text-slate-600" data-testid="collection-waiting">ждём оплату {formatMoney(row.waitingDebt)}</span>}
      </DataCell>
      <DataCell col="debtors" title={debtorsHint?.title}>
        <span className={row.debtors > 0 ? "font-medium text-slate-700" : ""}>
        {row.debtors > 0 ? row.debtors : MUTED_ZERO}
        {debtorsHint?.marker && <span data-testid="collection-total-marker" aria-hidden className="ml-0.5 text-slate-500">*</span>}
        </span>
      </DataCell>
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
      <EmptyState testId="collection-empty" title="В этом месяце в группах нет стоимости обучения" hint="Стоимость появится, когда у групп будет задана цена." />
    );
  }
  return (
    <section aria-label="Группы — собираемость" data-testid="income-collection">
      {caption && (
        <div className="mb-2 px-1" data-testid="collection-caption-box">
          <p className="text-xs text-slate-500" data-testid="collection-caption">{caption}</p>
          {/* A phone has no hover and the bubble would cover the cards: the explanation is one quiet line, always visible. */}
          <p className="mt-0.5 text-xs leading-snug text-slate-500 md:hidden" data-testid="collection-cost-line">{COLLECTION_COST_LINE}</p>
        </div>
      )}
      <DataTable columns={COLLECTION_COLUMNS} minWidth={760} testId="collection-table" headTestId="collection-head">
        {rows.map((row) => (
          <DataRow key={row.key} href={debtorsHref(paymentsBase, { groupId: row.groupId })} testId="collection-row" ariaLabel={`${row.title}: открыть должников группы`}>
            <RowBody row={row} />
          </DataRow>
        ))}
        {total && (
          <DataRow testId="collection-total" className="bg-slate-50">
            <RowBody row={total} debtorsHint={totalHint} />
          </DataRow>
        )}
      </DataTable>
      {debtNote && <p className="mt-2.5 px-1 text-xs leading-relaxed text-slate-600" data-testid="collection-debt-note">{debtNote}</p>}
    </section>
  );
}
