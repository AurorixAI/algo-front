"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/payments";
import { collectionRows, collectionTotalView, debtorsHref, type CollectionRowView, type MonthCollection } from "@/lib/payments-income-v2";
import { ProgressBar } from "./income-parts";

const GRID = "md:grid md:grid-cols-[minmax(0,1.6fr)_7.5rem_7.5rem_minmax(0,1.3fr)_7rem_7.5rem] md:items-center md:gap-x-4";

const quiet = <span className="text-slate-400">нет</span>;

/** A cell of the row: its name on a phone (the card), only the figure from md (the table). */
function Cell({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm md:block md:text-right ${className}`}>
      <span className="text-xs text-slate-400 md:hidden">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

function RowBody({ row }: { row: CollectionRowView }) {
  return (
    <>
      <div className="order-1 min-w-0 md:order-none">
        <p className="break-words text-sm font-medium text-slate-900">{row.title}</p>
        {row.teacher && <p className="truncate text-xs text-slate-500">{row.teacher}</p>}
      </div>
      <Cell label="Стоимость за месяц" className="order-3 mt-1 text-slate-700 md:order-none md:mt-0">{formatMoney(row.charged)}</Cell>
      <Cell label="Оплачено" className="order-4 text-slate-900 md:order-none">{formatMoney(row.paid)}</Cell>
      <div className="order-2 mt-2 flex items-center gap-2.5 md:order-none md:mt-0">
        {row.pct !== null ? (
          <>
            <div className="min-w-0 flex-1"><ProgressBar pct={row.pct} label={`Собрано: ${row.title}`} /></div>
            <span className="w-11 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">{row.pctText}</span>
          </>
        ) : (
          <span className="text-xs text-slate-400">ничего не начислено</span>
        )}
      </div>
      <Cell label="Долг" className={`order-5 ${row.debt > 0 ? "font-medium text-rose-700" : ""} md:order-none`}>{row.debt > 0 ? formatMoney(row.debt) : quiet}</Cell>
      <Cell label="С долгом за месяц" className="order-6 text-slate-700 md:order-none">{row.debtors > 0 ? row.debtors : quiet}</Cell>
    </>
  );
}

/**
 * «Группы — собираемость» (month mode): the group (teacher) | cost of the month | paid | a bar with the percent | debt |
 * students with a debt.  The worst collection is on top; a row opens «Должники» of that group.  A card on a phone.
 */
export function CollectionTable({ collection, paymentsBase }: { collection: MonthCollection; paymentsBase: string }) {
  const rows = collectionRows(collection);
  const total = collectionTotalView(collection);
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center" data-testid="collection-empty">
        <p className="text-sm font-medium text-slate-600">В этом месяце в группах ничего не начислено</p>
      </div>
    );
  }
  return (
    <section aria-label="Группы — собираемость" className="md:overflow-hidden md:rounded-2xl md:border md:border-slate-200 md:bg-white" data-testid="income-collection">
      <div role="presentation" className={`hidden border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[13px] font-semibold text-slate-500 ${GRID}`}>
        <span>Группа (преподаватель)</span>
        <span className="text-right">Стоимость за месяц</span>
        <span className="text-right">Оплачено</span>
        <span>Собрано</span>
        <span className="text-right">Долг</span>
        <span className="text-right">С долгом за месяц</span>
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
          <RowBody row={total} />
        </div>
      )}
    </section>
  );
}
