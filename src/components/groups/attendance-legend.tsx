import {
  EXCUSE_REVIEW_LABEL,
  EXCUSE_REVIEW_MEANING,
  LEGEND_DECISIONS,
  LEGEND_MARKS,
  MARK_CELL_LABEL,
  type ExcuseReviewState,
  type MarkValue,
} from "../../lib/attendance-marks"; // relative, so node:test can render this file

export interface LegendMarkStyle {
  value: MarkValue;
  /** The classes of the journal cell (the legend drops its hover). */
  className: string;
  dotClassName: string;
}

/** A sample of a cell: the same colours and the same word, smaller, not a button. */
function Sample({ className, dotClassName, children }: { className: string; dotClassName: string; children: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-bold ${className.replace(/\shover:\S+/g, "")}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClassName}`} />
      {children}
    </span>
  );
}

/**
 * The key to the journal, above its table: every mark exactly as a cell writes it, and what the three decisions about an
 * «Уважительная» mean.  The words come from `attendance-marks`, the colours from the cells (the journal passes them in).
 */
export function AttendanceLegend({
  marks,
  decisionTones,
}: {
  marks: ReadonlyArray<LegendMarkStyle>;
  decisionTones: Record<ExcuseReviewState, string>;
}) {
  const style = (value: MarkValue) => marks.find((mark) => mark.value === value);
  const excused = style("excused");
  return (
    <div role="group" aria-label="Обозначения в журнале" className="space-y-2 border-b border-slate-100 px-4 py-3 text-xs text-slate-600 sm:px-5">
      <ul className="flex flex-wrap items-center gap-1.5">
        {LEGEND_MARKS.map((value) => {
          const mark = style(value);
          return mark ? (
            <li key={value}><Sample className={mark.className} dotClassName={mark.dotClassName}>{MARK_CELL_LABEL[value]}</Sample></li>
          ) : null;
        })}
      </ul>
      {excused && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="font-semibold text-slate-500">Решение по уважительной причине</span>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {LEGEND_DECISIONS.map((decision) => (
              <li key={decision} className="flex items-center gap-1.5">
                <Sample className={decisionTones[decision]} dotClassName={excused.dotClassName}>{EXCUSE_REVIEW_LABEL[decision]}</Sample>
                <span>{EXCUSE_REVIEW_MEANING[decision]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
