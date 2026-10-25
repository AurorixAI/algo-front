"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadFailure } from "./bits";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Server sort field: the header becomes a sort button. */
  sortKey?: string;
  align?: "right";
  /** The cell that opens the row: it carries the button a keyboard reaches (the whole row also reacts to a click). */
  primary?: boolean;
  className?: string;
}

export interface SortState {
  key: string;
  order: "asc" | "desc";
}

interface DataTableProps<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[] | null;
  rowKey: (row: T) => string;
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onOpen?: (row: T) => void;
  openLabel?: (row: T) => string;
  selectedKey?: string | null;
  sort?: SortState;
  onSort?: (key: string) => void;
  empty: { title: string; text?: string; action?: ReactNode };
}

const SKELETON_ROWS = 8;

/**
 * The dense table of the console.  Keyboard: the main cell of a row holds a real button (Tab to it, Enter opens), the
 * headers of sortable columns are buttons.  States: skeleton while the first load runs, the old rows stay (dimmed) while
 * a new page loads, a failed load shows an error with a retry instead of an empty table.
 */
export function DataTable<T>({
  caption, columns, rows, rowKey, loading, refreshing, error, onRetry, onOpen, openLabel, selectedKey, sort, onSort, empty,
}: DataTableProps<T>) {
  if (error && !rows) return <LoadFailure message={error} onRetry={onRetry} />;
  return (
    <div className="relative overflow-x-auto" aria-busy={loading || refreshing || undefined}>
      {error && rows && <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">{error}</div>}
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-left">
            {columns.map((column) => {
              const sorted = sort && column.sortKey === sort.key ? sort.order : null;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}
                  className={cn("whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500", column.align === "right" && "text-right", column.className)}
                >
                  {column.sortKey && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(column.sortKey as string)}
                      className="inline-flex items-center gap-1 rounded uppercase tracking-wider hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
                    >
                      {column.header}
                      {sorted === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : sorted === "desc" ? <ArrowDown className="h-3 w-3" aria-hidden /> : <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden />}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className={cn("divide-y divide-slate-100", refreshing && "opacity-60 transition-opacity")}>
          {loading && !rows
            ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <tr key={index} aria-hidden>
                  {columns.map((column) => (
                    <td key={column.key} className="px-3 py-2.5"><div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-100" /></td>
                  ))}
                </tr>
              ))
            : (rows ?? []).map((row) => {
                const key = rowKey(row);
                return (
                  <tr
                    key={key}
                    onClick={onOpen ? () => onOpen(row) : undefined}
                    className={cn("align-middle", onOpen && "cursor-pointer hover:bg-slate-50", selectedKey === key && "bg-primary-50/60")}
                    aria-selected={selectedKey === key || undefined}
                  >
                    {columns.map((column) => (
                      <td key={column.key} className={cn("px-3 py-2", column.align === "right" && "text-right tabular-nums", column.className)}>
                        {column.primary && onOpen ? (
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); onOpen(row); }}
                            aria-label={openLabel?.(row)}
                            className="block max-w-full rounded text-left font-medium text-slate-900 hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                          >
                            {column.cell(row)}
                          </button>
                        ) : (
                          column.cell(row)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
        </tbody>
      </table>
      {!loading && rows && rows.length === 0 && <EmptyState title={empty.title} text={empty.text} action={empty.action} />}
    </div>
  );
}

export function Pagination({
  page, pages, total, pageSize, onPage, disabled,
}: { page: number; pages: number; total: number; pageSize: number; onPage: (page: number) => void; disabled?: boolean }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Страницы" className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-[13px] text-slate-600">
      <span aria-live="polite">{from}–{to} из {total}</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} aria-label="Предыдущая страница" icon={<ChevronLeft className="h-4 w-4" />} />
        <span className="px-1 tabular-nums">{page} / {Math.max(1, pages)}</span>
        <Button variant="ghost" size="sm" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)} aria-label="Следующая страница" icon={<ChevronRight className="h-4 w-4" />} />
      </div>
    </nav>
  );
}

/** Next sort state when a header is clicked: a new column starts descending for dates and numbers, ascending for names. */
export function nextSort(current: SortState | undefined, key: string, firstOrder: "asc" | "desc" = "asc"): SortState {
  if (current?.key === key) return { key, order: current.order === "asc" ? "desc" : "asc" };
  return { key, order: firstOrder };
}
