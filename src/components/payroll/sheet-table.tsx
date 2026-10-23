"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, HelpCircle } from "lucide-react";
import { formatMoney } from "@/lib/payments";
import {
  buildBlocks,
  buildLineViews,
  formatDayMonth,
  lessonTypeLabel,
  markCell,
  lineKeyOf,
  markFor,
  priceCellView,
  setIncludeEdit,
  UNPAID_INCLUDED_MARK_HINT,
  UNPAID_MARK_HINT,
  type LineView,
  type PayrollSheet,
  type SheetEdits,
} from "@/lib/payroll";
import {
  COUNTED_HEADER_HINT,
  INCLUDE_DONE_LABEL,
  INCLUDE_HINT,
  INCLUDE_LABEL,
  INCLUDE_NOT_DONE_LABEL,
  PRICE_HEADER_HINT,
  priceColumnLabel,
  SHEET_INCLUDE_NOTE,
  SHEET_LEGEND,
  UNPAID_HEADER_HINT,
} from "@/lib/payroll-help";
import { Hint } from "@/components/ui/hint";
import { groupPriceHref, priceLabelOf } from "@/lib/group-price";
import { splitLayout } from "@/lib/payroll-logica";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { Checkbox } from "@/components/ui/checkbox";

const CELL = "px-2 py-2 align-middle max-sm:px-1.5 print:px-1 print:py-1";
const HEAD = "px-2 py-2 text-left text-xs font-semibold text-slate-500 max-sm:px-1.5 whitespace-nowrap print:px-1 print:py-1 print:text-[9px]";
/**
 * Alignment (owner 21.10): the student is left; money (the price, «Заработано») is a ledger - right-aligned, and its header is
 * right-aligned over the same digits (same padding); dates, percent and counts are centred under centred headers.
 */
/** The first column keeps its place while the dates scroll; on paper there is nothing to scroll. */
const STICKY = "sticky left-0 z-10 w-[9rem] min-w-[9rem] max-w-[9rem] sm:w-[13rem] sm:min-w-[13rem] sm:max-w-[13rem] print:static print:w-[8rem] print:min-w-[8rem] print:max-w-[8rem]";

/** The price of a line is text: the group's or the student's own price; nothing to type (it is set in «Цены групп»). */
function PriceCell({ view, compact = false, freshPrice }: { view: LineView; compact?: boolean; freshPrice?: number }) {
  const { line } = view;
  const price = priceCellView(line);
  // saved with no price, but the group has one today (the diff says so): the row says what the recalculation will use
  const after = price.missing && freshPrice !== undefined;
  return (
    <div className={`flex flex-col gap-0.5 ${compact ? "items-start text-xs text-slate-500" : "items-end"}`}>
      {price.missing ? (
        // the column says only what to do: the link (a phone's line under the name keeps the words «нет цены»)
        after ? null : (
          <span className="whitespace-nowrap text-amber-700 print:text-black">
            {compact && <>нет цены · </>}
            <Link href={groupPriceHref("/owner/groups", line.group_id)} className="font-medium text-primary-700 underline-offset-2 hover:underline">
              задать
            </Link>
          </span>
        )
      ) : (
        <span className="whitespace-nowrap tabular-nums">{price.text}</span>
      )}
      {after && <span className="whitespace-nowrap text-[11px] font-medium tabular-nums text-slate-600 print:text-black">после пересчёта: {formatMoney(freshPrice)}</span>}
      {price.tag && <span className="text-[10px] font-medium text-primary-700 print:text-black">{price.tag}</span>}
      {price.note && (
        price.steps
          ? <Hint text={price.steps} className="text-[10px] font-medium text-amber-700 print:text-black">{price.note}</Hint>
          : <span className="text-[10px] font-medium text-amber-700 print:text-black">{price.note}</span>
      )}
    </div>
  );
}

function IncludeCell({
  view, editable, onChange,
}: {
  view: LineView;
  editable: boolean;
  onChange: (include: boolean) => void;
}) {
  const { line } = view;
  if (line.unpaid <= 0) return <span className="text-slate-300">—</span>;
  const label = `Начислить за неоплаченные уроки (${line.unpaid}): ${line.student_name}, ${line.group_name}`;
  return (
    <label className={`inline-flex items-center gap-1.5 whitespace-nowrap max-sm:flex-col max-sm:gap-0.5 ${editable ? "cursor-pointer" : ""}`}>
      <span className="font-semibold tabular-nums text-slate-700">{line.unpaid}</span>
      {editable ? (
        <>
          <Checkbox
            checked={view.include}
            onChange={(event) => onChange(event.target.checked)}
            aria-label={label}
            className="print:hidden"
          />
          <span className="text-xs text-slate-500 print:hidden">{INCLUDE_LABEL}</span>
          <Hint text={INCLUDE_HINT} className="inline-flex max-sm:hidden print:hidden">
            <HelpCircle className="h-3.5 w-3.5 text-slate-400" aria-label={`Что значит «${INCLUDE_LABEL}»`} />
          </Hint>
        </>
      ) : null}
      <span className={`${editable ? "hidden print:inline" : ""} text-xs text-slate-600`}>{view.include ? INCLUDE_DONE_LABEL : INCLUDE_NOT_DONE_LABEL}</span>
    </label>
  );
}

/** The legend of the date grid: what the marks mean (the dashed «1» is the one the owner asks about most). */
function SheetLegend() {
  const looks: Record<string, string> = {
    counted: "font-semibold text-slate-800",
    zero: "font-bold text-rose-600 print:text-black",
    pending: "rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-800 print:bg-transparent print:text-black",
    unpaid: "rounded border border-dashed border-slate-300 px-1 text-slate-500",
  };
  return (
    <ul aria-label="Обозначения" className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2 text-xs text-slate-600">
      {SHEET_LEGEND.map((item) => (
        <li key={item.key}>
          <span className={looks[item.key]}>{item.mark}</span> — {item.text}
        </li>
      ))}
    </ul>
  );
}

/**
 * The sheet as blocks, one per group: the total of the group in its header, the students in rows
 * (Ученик | Цена в месяц | Засчитано | Без оплаты [начислить] | Заработано).  The dates of the month are behind «По датам» of
 * a group (and on paper, when the page prints with them): a date grid is the proof of a sum, not the thing the owner reads first.
 *
 * The amounts are the server's; a line whose «начислить» the owner has changed is previewed with the same formula until saved.
 * With the dates open, a block scrolls sideways under its own sticky column of names; on paper nothing scrolls.
 */
export function PayrollSheetTable({
  sheet, edits, editable = true, onEdits, forceDates = false, priceLabel: priceLabelProp, freshPrices,
}: {
  sheet: PayrollSheet;
  edits: SheetEdits;
  editable?: boolean;
  onEdits?: (update: (previous: SheetEdits) => SheetEdits) => void;
  /** Every group shows its dates (the print of a sheet). */
  forceDates?: boolean;
  /** What the price is called in the centre («Цена в месяц» / «Цена пакета»); by default the centre's mode, as everywhere. */
  priceLabel?: string;
  /** Membership id -> the price the recalculation would use, for a line saved with none (from the diff of the saved sheet). */
  freshPrices?: Record<string, number>;
}) {
  const views = useMemo(() => buildLineViews(sheet, edits), [sheet, edits]);
  const blocks = useMemo(() => buildBlocks(sheet, views), [sheet, views]);
  const canEdit = editable && Boolean(onEdits);
  const [openDates, setOpenDates] = useState<ReadonlySet<string>>(new Set());
  // the price is called by the centre's mode, like everywhere else
  const centreLabel = priceLabelOf(usePaymentsSummary((state) => state.periodMode));
  const priceColumn = priceColumnLabel(priceLabelProp ?? centreLabel);

  if (sheet.lines.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
        В этом месяце у преподавателя нет учеников с засчитанными уроками.
      </p>
    );
  }

  const toggleDates = (key: string) => {
    setOpenDates((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="min-w-0 space-y-4 print:space-y-4">
      {blocks.map((block) => {
        const key = block.key || block.groupId || block.groupName;
        const showDates = forceDates || openDates.has(key);
        const gridId = `payroll-dates-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        return (
          <section
            key={key}
            aria-label={`Группа ${block.groupName}`}
            className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white print:overflow-visible print:break-inside-avoid-page print:rounded-none print:border-slate-400"
          >
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-100 bg-slate-50/70 px-4 py-3 print:bg-transparent">
              <h3 className="min-w-0 break-words text-base font-bold text-slate-900">{block.groupName}</h3>
              {block.lessonTypes.length > 1
                ? block.lessonTypes.map((type) => <span key={type} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">{lessonTypeLabel(type)}</span>)
                : <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">{lessonTypeLabel(block.lessonType)}</span>}
              {block.lessonTime && <span className="text-sm text-slate-500">{block.lessonTime}</span>}
              <span className="ml-auto flex items-center gap-3">
                {block.columns.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleDates(key)}
                    aria-expanded={showDates}
                    aria-controls={gridId}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 print:hidden"
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    {showDates ? "Скрыть даты" : "По датам"}
                  </button>
                )}
              </span>
            </header>

            <div
              id={gridId}
              role="region"
              tabIndex={0}
              aria-label={`Таблица группы ${block.groupName}${showDates ? ": прокручивается вбок" : ""}`}
              className="relative max-w-full overflow-x-auto overscroll-x-contain print:overflow-visible"
            >
              <table className="w-full border-collapse text-sm print:text-[11px]">
                <thead className="print:table-header-group">
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th scope="col" className={`${HEAD} ${showDates ? STICKY : "min-w-[9rem] max-sm:min-w-[6.5rem]"} bg-slate-50`}>Ученик</th>
                    <th scope="col" aria-label={priceColumn} className={`${HEAD} text-right max-sm:hidden`}>
                      <Hint text={PRICE_HEADER_HINT}>{priceColumn}</Hint>
                    </th>
                    {showDates && block.columns.map((column) => (
                      <th key={column.key} scope="col" className="min-w-[2.75rem] px-1 py-2 text-center text-xs font-semibold text-slate-500 print:min-w-0 print:px-0.5 print:py-1 print:text-[9px]">
                        {formatDayMonth(column.date)}
                      </th>
                    ))}
                    <th scope="col" aria-label="Засчитано" className={`${HEAD} text-center`}>
                      <Hint text={COUNTED_HEADER_HINT}>Засчитано</Hint>
                    </th>
                    <th scope="col" aria-label="Без оплаты" className={`${HEAD} text-center`}>
                      <Hint text={UNPAID_HEADER_HINT}>Без оплаты</Hint>
                    </th>
                    <th scope="col" className={`${HEAD} text-right`}>Заработано</th>
                  </tr>
                </thead>
                <tbody>
                  {block.lines.map((view, rowIndex) => {
                    const { line } = view;
                    const id = line.membership_id;
                    // F14: a student whose group changed its type inside the month has one sub-row per type («Группа · 6 уроков» / «Пара · 6 уроков»)
                    const split = splitLayout(block.lines.map((item) => item.line))[rowIndex];
                    return (
                      <tr key={line.line_key ?? id} className={`border-b border-slate-100 last:border-b-0 print:break-inside-avoid ${split.first ? "" : "border-t-0"}`}>
                        <th scope="row" className={`${CELL} ${showDates ? `${STICKY} bg-white shadow-[1px_0_0_0_rgb(226_232_240)] print:shadow-none` : ""} text-left font-medium text-slate-900`}>
                          <span className={split.first ? "block break-words leading-tight" : "sr-only"}>{line.student_name}</span>
                          {split.first && line.display_id && <span className="block font-mono text-[11px] font-normal text-slate-400">{line.display_id}</span>}
                          {split.typeLabel && <span className="block text-xs font-medium text-slate-600" data-testid="split-type">{split.typeLabel}</span>}
                          {line.pending_excused > 0 && (
                            <span className="block text-[11px] font-normal text-amber-700">ожидает: {line.pending_excused}</span>
                          )}
                          {/* a phone has no room for the price column: the price is the second line of the name */}
                          <span className="mt-0.5 block font-normal sm:hidden"><PriceCell view={view} compact freshPrice={freshPrices?.[id]} /></span>
                        </th>
                        <td className={`${CELL} text-right max-sm:hidden`}>
                          <PriceCell view={view} freshPrice={freshPrices?.[id]} />
                        </td>
                        {showDates && block.columns.map((column) => {
                          const mark = markFor(line, column);
                          const cell = markCell(mark ? mark.mark : null, mark ? mark.state : "not_in_group", { includeUnpaid: view.include });
                          return (
                            <td
                              key={column.key}
                              className="px-1 py-2 text-center align-middle text-sm print:px-0.5 print:py-1"
                              // an unpaid cell has its own tooltip (the Hint below): no second one
                              title={cell.tone === "unpaid" || cell.tone === "unpaid_included" ? undefined : `${line.student_name}, ${formatDayMonth(column.date)}: ${cell.title}`}
                            >
                              {cell.tone === "unpaid" || cell.tone === "unpaid_included" ? (
                                <Hint text={cell.tone === "unpaid" ? UNPAID_MARK_HINT : UNPAID_INCLUDED_MARK_HINT} className="inline-block">
                                  <span className={`inline-block min-w-[1.25rem] ${cell.className}`}>
                                    {cell.label}
                                    <span className="sr-only">{`${formatDayMonth(column.date)}: ${cell.title}`}</span>
                                  </span>
                                </Hint>
                              ) : (
                                <span className={`inline-block min-w-[1.25rem] ${cell.className}`}>
                                  {cell.label}
                                  <span className="sr-only">{`${formatDayMonth(column.date)}: ${cell.title}`}</span>
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className={`${CELL} text-center font-semibold tabular-nums text-slate-900`}>{line.counted}</td>
                        <td className={`${CELL} text-center`}>
                          <IncludeCell
                            view={view}
                            editable={canEdit}
                            onChange={(include) => onEdits?.((previous) => setIncludeEdit(previous, sheet, lineKeyOf(line), include))}
                          />
                        </td>
                        <td className={`${CELL} whitespace-nowrap text-right font-semibold tabular-nums text-slate-900`}>
                          {formatMoney(view.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800 print:bg-transparent">
                    <th scope="row" className={`${CELL} ${showDates ? `${STICKY} bg-slate-50 print:bg-transparent` : ""} text-left`}>Итого по группе</th>
                    <td className={`${CELL} max-sm:hidden`} />
                    {showDates && <td colSpan={block.columns.length} />}
                    <td className={`${CELL} text-center tabular-nums`}>{block.counted}</td>
                    <td className={`${CELL} text-center tabular-nums`}>{block.unpaid > 0 ? block.unpaid : <span className="font-normal text-slate-300">—</span>}</td>
                    <td className={`${CELL} whitespace-nowrap text-right tabular-nums text-slate-900`}>{formatMoney(block.amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {showDates && <SheetLegend />}
          </section>
        );
      })}
      {blocks.some((block) => block.unpaid > 0) && <p className="text-xs text-slate-500 print:hidden">{SHEET_INCLUDE_NOTE}</p>}
    </div>
  );
}
