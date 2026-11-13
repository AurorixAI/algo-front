"use client";

import { createContext, useContext, type CSSProperties, type ElementType, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

/**
 * DataTable (design system, wave 3): ONE frame for every list of rows of the platform - the header, the grid of the rows, the cards on a narrow place.
 *
 * - The columns are declared once: `{ key, header, align, width }`.  The header and every row use the same grid template and the same padding, so a header and its cells share one left edge.
 * - Alignment: text and names LEFT (`start`), money and numbers RIGHT (`end`, `tabular-nums`, the header over them is right too), short status / date columns `center` only when asked; the action column is RIGHT and has no header text.
 * - Rows are one height by their content; the cells are vertically centred (`align="start"` for rows of several lines).
 * - Where the place is narrower than `minWidth` (the width of the TABLE itself, not of the screen: the sidebar takes 240 px) the rows become cards: the first column is the title, a cell with a
 *   `cardLabel` reads «подпись … значение», the action cell is a row of controls at the bottom.  A card holds nothing that scrolls sideways.
 * Semantics: a LIST of rows (`ul` > `li`), the rows of an expanding / opening kind are buttons or links; the header is presentational (the columns are named in the cards by their captions).
 * The look lives in globals.css (`.dt*`), the breakpoints are container queries, so the same table is right in a column, in a window and on a phone.
 */

export type DataAlign = "start" | "center" | "end";
export type DataMinWidth = 640 | 760 | 880 | 1040;

export interface DataColumn {
  key: string;
  /** The header text; "" for the action column (read as «Действия» by a screen reader). */
  header: ReactNode;
  align?: DataAlign;
  /** A CSS grid track: `minmax(0, 1.2fr)`, `132px` ... */
  width: string;
  /** The label of the cell in a CARD; none = the value stands alone (the title of the card). */
  cardLabel?: string;
  /** A small «?» after the header with what the column holds. */
  hint?: string;
  /** In a card this cell is a row of controls (buttons, «⋯») at the bottom. */
  actions?: boolean;
  /** The header is a button that sorts by this key (`DataTable` gets `sort` and `onSort`). */
  sortKey?: string;
}

interface Ctx { columns: readonly DataColumn[]; minWidth: DataMinWidth; align: "center" | "start"; compact: boolean }
const TableContext = createContext<Ctx | null>(null);

const ALIGN_ATTR: Record<DataAlign, string> = { start: "start", center: "center", end: "end" };

/** The columns of a table for rows that are drawn on their own (a row rendered outside its `DataTable`, e.g. in a test or a preview). */
export function DataColumns({ columns, minWidth = 880, align = "center", compact = false, children }: { columns: readonly DataColumn[]; minWidth?: DataMinWidth; align?: "center" | "start"; compact?: boolean; children: ReactNode }) {
  return <TableContext.Provider value={{ columns, minWidth, align, compact }}>{children}</TableContext.Provider>;
}

export function DataTable({ columns, minWidth = 880, align = "center", children, className, testId, ariaLabel, hideHeader = false, headTestId, gap, sort, onSort, compact = false }: {
  columns: readonly DataColumn[];
  /** The table is a table from this width of ITSELF; narrower it is a list of cards. */
  minWidth?: DataMinWidth;
  /** Vertical alignment of the cells of a wide row. */
  align?: "center" | "start";
  children: ReactNode;
  className?: string;
  testId?: string;
  ariaLabel?: string;
  hideHeader?: boolean;
  headTestId?: string;
  /** The sorted column and its direction; the headers of the columns with a `sortKey` are buttons. */
  sort?: { key: string; asc: boolean };
  onSort?: (key: string) => void;
  /** A middle place (560 px up to the width of the table; only for a table of 880) gets a COMPACT card: title, status and button in the first line, the captioned cells as equal columns under it. */
  compact?: boolean;
  /** The gap between the columns of a wide row (a CSS length; 1.5rem by default). */
  gap?: string;
}) {
  const template = columns.map((column) => column.width).join(" ");
  return (
    <TableContext.Provider value={{ columns, minWidth, align, compact }}>
      <div className={cn("dt", className)} data-testid={testId} data-min={minWidth} style={{ "--dt-cols": template, ...(gap ? { "--dt-gap": gap } : {}) } as CSSProperties}>
        <div className="dt-frame" data-min={minWidth}>
        {!hideHeader && (
          <div role="presentation" className="dt-head" data-min={minWidth} data-testid={headTestId}>
            {columns.map((column) => (
              <span key={column.key} className="dt-head-cell" data-col={column.key} data-align={ALIGN_ATTR[column.align ?? "start"]} aria-sort={column.sortKey && sort?.key === column.sortKey ? (sort.asc ? "ascending" : "descending") : undefined}>
                {column.header && column.sortKey && onSort ? (
                  <button type="button" onClick={() => onSort(column.sortKey as string)} aria-label={`Сортировать: ${typeof column.header === "string" ? column.header : column.key}`}
                    className={cn("inline-flex items-center gap-1 rounded text-inherit hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500", column.align === "end" && "flex-row-reverse")}>
                    {column.header}
                    {sort?.key === column.sortKey ? (sort.asc ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />) : <span className="inline-block h-3.5 w-3.5" aria-hidden />}
                  </button>
                ) : column.header ? (column.hint ? (
                  <span className="inline-flex items-center gap-1">
                    {column.header}
                    <Hint text={column.hint} className="inline-flex text-slate-500">
                      <HelpCircle className="h-3.5 w-3.5" aria-label={`Что в колонке «${typeof column.header === "string" ? column.header : column.key}»`} />
                    </Hint>
                  </span>
                ) : column.header) : <span className="sr-only">Действия</span>}
              </span>
            ))}
          </div>
        )}
        <ul role="list" aria-label={ariaLabel} className="dt-body">{children}</ul>
        </div>
      </div>
    </TableContext.Provider>
  );
}

/**
 * One row (a `<li>`; a card on a narrow place).  Its children are `DataCell`s in the order of the columns.
 * - `href`: the whole row is a link (the `<li>` holds one `<a class="dt-row">`); `onActivate`: the whole row is a button (opens a drawer / unfolds a detail);
 * - `detail`: a block under the cells over the whole width of the row (the unfolded part of an expanding row).
 */
export function DataRow({ children, className, testId, as: Tag = "li", href, onActivate, expanded, haspopup, ariaLabel, detail, ...rest }: {
  children: ReactNode;
  className?: string;
  testId?: string;
  as?: ElementType;
  href?: string;
  onActivate?: () => void;
  expanded?: boolean;
  haspopup?: "dialog";
  ariaLabel?: string;
  detail?: ReactNode;
} & Record<string, unknown>) {
  const ctx = useContext(TableContext);
  const common = { "data-min": ctx?.minWidth, "data-valign": ctx?.align, "data-compact": ctx?.compact ? "" : undefined };
  if (href) {
    return (
      <Tag className="dt-li">
        <Link href={href} className={cn("dt-row dt-row-action", className)} data-testid={testId} aria-label={ariaLabel} {...common} {...rest}>{children}</Link>
      </Tag>
    );
  }
  if (onActivate) {
    return (
      <Tag className="dt-li">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-haspopup={haspopup}
          aria-label={ariaLabel}
          data-testid={testId}
          onClick={onActivate}
          onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onActivate(); } }}
          className={cn("dt-row dt-row-action cursor-pointer text-left", className)}
          {...common}
          {...rest}
        >
          {children}
        </div>
        {detail}
      </Tag>
    );
  }
  return (
    <Tag className={cn("dt-row", className)} data-testid={testId} {...common} {...rest}>
      {children}
    </Tag>
  );
}

/** A row that spans every column: a month heading in a ledger, a quiet note («С сентября перенесён аванс …»). */
export function DataSpanRow({ children, className, testId, tone = "heading" }: { children: ReactNode; className?: string; testId?: string; tone?: "heading" | "note" }) {
  const ctx = useContext(TableContext);
  return (
    <li className={cn("dt-row dt-row-span", className)} data-tone={tone} data-testid={testId} data-min={ctx?.minWidth} data-valign={ctx?.align}>
      <div className="dt-span-cell">{children}</div>
    </li>
  );
}

/** One cell of a row: `col` is the key of its column (alignment, card label and role come from the column). */
export function DataCell({ col, children, className, testId, title }: { col: string; children: ReactNode; className?: string; testId?: string; title?: string }) {
  const ctx = useContext(TableContext);
  const column = ctx?.columns.find((item) => item.key === col);
  const align = column?.align ?? "start";
  return (
    <div className={cn("dt-cell", className)} data-col={col} data-align={ALIGN_ATTR[align]} data-actions={column?.actions ? "true" : undefined} data-labelled={column?.cardLabel ? "true" : undefined} data-testid={testId} title={title}>
      {column?.cardLabel ? <span className="dt-label">{column.cardLabel}</span> : null}
      <div className="dt-value">{children}</div>
    </div>
  );
}

/** The sign of an empty value («—»): in a table it stands in the CENTRE of its column, under the centre of the heading, whatever the alignment of the values (it is not a number: no digit alignment). */
export function DataEmpty({ testId }: { testId?: string }) {
  return <span className="dt-empty" data-testid={testId}>—</span>;
}
