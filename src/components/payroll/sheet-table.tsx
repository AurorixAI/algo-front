"use client";

import { useMemo, useState } from "react";
import { HelpCircle } from "lucide-react";
import { MAX_MONEY, formatMoney, formatMoneyInput, parseMoneyInput, reformatMoneyTyping } from "@/lib/payments";
import {
  buildBlocks,
  buildLineViews,
  formatDayMonth,
  lessonTypeLabel,
  lineNotes,
  markCell,
  markFor,
  percentLabel,
  setFeeEdit,
  setIncludeEdit,
  sheetTotal,
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
  priceFieldHint,
  priceSourceNote,
  priceStepsLines,
  PRICE_HEADER_HINT,
  SHEET_INCLUDE_NOTE,
  SHEET_LEGEND,
  UNPAID_HEADER_HINT,
} from "@/lib/payroll-help";
import { Hint } from "@/components/ui/hint";
import { priceLabelOf } from "@/lib/group-price";
import { usePaymentsSummary } from "@/lib/payments-summary";

const CELL = "px-2 py-2 align-middle print:px-1 print:py-1";
const HEAD = "px-2 py-2 text-left text-xs font-semibold text-slate-500 whitespace-nowrap print:px-1 print:py-1 print:text-[9px]";
/**
 * Alignment (owner 21.10): the student is left; money (the price, «Начислено») is a ledger - right-aligned, and its header is
 * right-aligned over the same digits (same padding); dates, percent and counts are centred under centred headers.
 */
/** The first column keeps its place while the dates scroll; on paper there is nothing to scroll. */
const STICKY = "sticky left-0 z-10 w-[9rem] min-w-[9rem] max-w-[9rem] sm:w-[13rem] sm:min-w-[13rem] sm:max-w-[13rem] print:static print:w-[8rem] print:min-w-[8rem] print:max-w-[8rem]";

function FeeCell({
  view, editable, priceLabel, onChange,
}: {
  view: LineView;
  editable: boolean;
  /** What the price is called in the centre («Оплата в месяц» / «Стоимость пакета»). */
  priceLabel: string;
  onChange: (fee: number | null) => void;
}) {
  const { line } = view;
  // While the field has focus it shows what is typed: an emptied field means «the membership's own fee» and must not
  // be refilled under the owner's fingers; on leaving it shows the fee in force.
  const [draft, setDraft] = useState<string | null>(null);
  const label = `${priceLabel}: ${line.student_name}, ${line.group_name}`;
  const source = line.source_fee;
  // #105: whose price this is, and the steps when it changed inside the month
  const sourceNote = priceSourceNote(line);
  const steps = priceStepsLines(line);
  const stepsHint = priceFieldHint(line, editable);
  return (
    <div className="flex flex-col items-end gap-0.5">
      {editable ? (
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={label}
          placeholder={source !== null ? formatMoneyInput(source) : "не задана"}
          value={draft ?? formatMoneyInput(view.fee)}
          onChange={(event) => {
            const text = reformatMoneyTyping(event.target.value);
            setDraft(text);
            const parsed = parseMoneyInput(text);
            onChange(parsed === null ? null : Math.min(parsed, MAX_MONEY));
          }}
          onBlur={() => setDraft(null)}
          className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 print:hidden"
        />
      ) : null}
      <span className={`${editable ? "hidden print:inline" : ""} whitespace-nowrap tabular-nums`}>
        {view.fee !== null ? formatMoney(view.fee) : "не задана"}
      </span>
      {view.feeOverridden && (
        <span className="text-[10px] font-medium text-primary-700 print:text-black">
          изменена{source !== null ? ` · было ${formatMoney(source)}` : ""}
        </span>
      )}
      {sourceNote && (
        <span className="text-[10px] font-medium text-primary-700 print:text-black" title="Индивидуальная цена ученика (исключение из цены группы)">
          {sourceNote}
        </span>
      )}
      {steps.length > 0 && (
        <span className="flex flex-col items-end text-[10px] leading-tight text-slate-500 print:text-black" aria-label="Цена менялась в течение месяца">
          {stepsHint ? (
            <Hint text={stepsHint} className="font-medium text-amber-700 print:text-black">цена менялась</Hint>
          ) : (
            <span className="font-medium text-amber-700 print:text-black">цена менялась</span>
          )}
          {steps.map((step) => <span key={step} className="whitespace-nowrap tabular-nums">{step}</span>)}
        </span>
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
    <label className={`inline-flex items-center gap-1.5 whitespace-nowrap ${editable ? "cursor-pointer" : ""}`}>
      <span className="font-semibold tabular-nums text-slate-700">{line.unpaid}</span>
      {editable ? (
        <>
          <input
            type="checkbox"
            checked={view.include}
            onChange={(event) => onChange(event.target.checked)}
            aria-label={label}
            className="h-4 w-4 accent-primary-600 print:hidden"
          />
          <span className="text-xs text-slate-500 print:hidden">{INCLUDE_LABEL}</span>
          <Hint text={INCLUDE_HINT} className="inline-flex print:hidden">
            <HelpCircle className="h-3.5 w-3.5 text-slate-400" aria-label={`Что значит «${INCLUDE_LABEL}»`} />
          </Hint>
        </>
      ) : null}
      <span className={`${editable ? "hidden print:inline" : ""} text-xs text-slate-600`}>{view.include ? INCLUDE_DONE_LABEL : INCLUDE_NOT_DONE_LABEL}</span>
    </label>
  );
}

/** The legend over the table: what the marks mean (the dashed «1» is the one the owner asks about most). */
function SheetLegend({ showIncludeNote }: { showIncludeNote: boolean }) {
  const looks: Record<string, string> = {
    counted: "font-semibold text-slate-800",
    zero: "font-bold text-rose-600 print:text-black",
    pending: "rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-800 print:bg-transparent print:text-black",
    unpaid: "rounded border border-dashed border-slate-300 px-1 text-slate-500",
    empty: "text-slate-400",
  };
  return (
    <div className="space-y-1">
      <ul aria-label="Обозначения" className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-600">
        {SHEET_LEGEND.map((item) => (
          <li key={item.key}>
            <span className={looks[item.key]}>{item.mark}</span> — {item.text}
          </li>
        ))}
      </ul>
      {showIncludeNote && <p className="text-xs text-slate-500 print:hidden">{SHEET_INCLUDE_NOTE}</p>}
    </div>
  );
}

/**
 * The sheet as the partner keeps it: a block per group - the students in rows, the lessons of the month in
 * columns (1 counted, 0 red, «Ждёт» yellow, empty not in the group, grey not paid) - then the fee, the
 * percent, the counted and unpaid lessons and the pay of each line, a subtotal per group and the sheet's «Итого».
 *
 * The amounts are the server's; a line the owner has edited is previewed with the same formula until saved.
 * On a phone every block scrolls sideways under its own sticky column of names; on paper nothing scrolls.
 */
export function PayrollSheetTable({
  sheet, edits, editable = true, onEdits, priceLabel: priceLabelProp,
}: {
  sheet: PayrollSheet;
  edits: SheetEdits;
  editable?: boolean;
  onEdits?: (update: (previous: SheetEdits) => SheetEdits) => void;
  /** What the price is called («Оплата в месяц» / «Стоимость пакета»); by default the centre's mode, as everywhere. */
  priceLabel?: string;
}) {
  const views = useMemo(() => buildLineViews(sheet, edits), [sheet, edits]);
  const blocks = useMemo(() => buildBlocks(sheet, views), [sheet, views]);
  const total = sheetTotal(sheet, views, edits);
  const canEdit = editable && Boolean(onEdits);
  // The price is called by the centre's mode, like everywhere else
  const centreLabel = priceLabelOf(usePaymentsSummary((state) => state.periodMode));
  const priceLabel = priceLabelProp ?? centreLabel;

  if (sheet.lines.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
        В этом месяце у преподавателя нет учеников с засчитанными уроками.
      </p>
    );
  }

  return (
    <div className="min-w-0 space-y-5 print:space-y-4">
      <SheetLegend showIncludeNote={blocks.some((block) => block.unpaid > 0)} />
      {blocks.map((block) => {
        const span = 3 + block.columns.length;
        return (
          <section
            key={block.groupId || block.groupName}
            aria-label={`Группа ${block.groupName}`}
            className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white print:overflow-visible print:break-inside-avoid-page print:rounded-none print:border-slate-400"
          >
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50/70 px-4 py-3 print:bg-transparent">
              <h3 className="min-w-0 break-words text-base font-bold text-slate-900">{block.groupName}</h3>
              <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">{lessonTypeLabel(block.lessonType)}</span>
              {block.lessonTime && <span className="text-sm text-slate-500">{block.lessonTime}</span>}
            </header>

            <div
              role="region"
              tabIndex={0}
              aria-label={`Таблица группы ${block.groupName}: прокручивается вбок`}
              className="relative max-w-full overflow-x-auto overscroll-x-contain print:overflow-visible"
            >
              <table className="w-full border-collapse text-sm print:text-[11px]">
                <thead className="print:table-header-group">
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th scope="col" className={`${HEAD} ${STICKY} bg-slate-50`}>Ученик</th>
                    <th scope="col" aria-label={priceLabel} className={`${HEAD} text-right`}>
                      <Hint text={PRICE_HEADER_HINT}>{priceLabel}</Hint>
                    </th>
                    <th scope="col" className={`${HEAD} text-center`}>%</th>
                    {block.columns.map((column) => (
                      <th key={column.key} scope="col" className="min-w-[2.75rem] px-1 py-2 text-center text-xs font-semibold text-slate-500 print:min-w-0 print:px-0.5 print:py-1 print:text-[9px]">
                        {formatDayMonth(column.date)}
                      </th>
                    ))}
                    <th scope="col" aria-label="Засчитано" className={`${HEAD} text-center`}>
                      <Hint text={COUNTED_HEADER_HINT}>Засчитано</Hint>
                    </th>
                    <th scope="col" aria-label="Не оплачено" className={`${HEAD} text-center`}>
                      <Hint text={UNPAID_HEADER_HINT}>Не оплачено</Hint>
                    </th>
                    <th scope="col" className={`${HEAD} text-right`}>Начислено</th>
                  </tr>
                </thead>
                <tbody>
                  {block.lines.map((view) => {
                    const { line } = view;
                    const id = line.membership_id;
                    return (
                      <tr key={id} className="border-b border-slate-100 last:border-b-0 print:break-inside-avoid">
                        <th scope="row" className={`${CELL} ${STICKY} bg-white text-left font-medium text-slate-900 shadow-[1px_0_0_0_rgb(226_232_240)] print:shadow-none`}>
                          <span className="block break-words leading-tight">{line.student_name}</span>
                          {line.display_id && <span className="block font-mono text-[11px] font-normal text-slate-400">{line.display_id}</span>}
                          {line.pending_excused > 0 && (
                            <span className="block text-[11px] font-normal text-amber-700">ожидает: {line.pending_excused}</span>
                          )}
                          {lineNotes(view).map((note) => (
                            <span key={note} className="block text-[11px] font-normal leading-tight text-amber-700">{note}</span>
                          ))}
                        </th>
                        <td className={`${CELL} text-right`}>
                          <FeeCell
                            view={view}
                            editable={canEdit}
                            priceLabel={priceLabel}
                            onChange={(fee) => onEdits?.((previous) => setFeeEdit(previous, sheet, id, fee))}
                          />
                        </td>
                        <td className={`${CELL} whitespace-nowrap text-center tabular-nums text-slate-600`}>{percentLabel(view.percent)}</td>
                        {block.columns.map((column) => {
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
                            onChange={(include) => onEdits?.((previous) => setIncludeEdit(previous, sheet, id, include))}
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
                    <th scope="row" className={`${CELL} ${STICKY} bg-slate-50 text-left print:bg-transparent`}>Итого по группе</th>
                    <td colSpan={span - 1} />
                    <td className={`${CELL} text-center tabular-nums`}>{block.counted}</td>
                    <td className={`${CELL} text-center tabular-nums`}>{block.unpaid}</td>
                    <td className={`${CELL} whitespace-nowrap text-right tabular-nums`}>{formatMoney(block.amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-900 bg-slate-900 px-5 py-4 text-white print:rounded-none print:border-black print:bg-transparent print:text-black">
        <span className="text-sm font-semibold">Итого</span>
        <span className="text-xl font-bold tabular-nums" data-testid="payroll-total">{formatMoney(total)}</span>
      </div>
    </div>
  );
}
