import type { ComponentType, ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Hint } from "@/components/ui/hint";

/**
 * Shared frame of both attendance tabs («Пропуски» and «Незакрытые уроки», #103): one header style, one
 * row padding, one empty state.  The rule: text columns are left-aligned; a badge sits in its column with
 * its left edge on the left edge of the header, because the header and the rows use the very same grid
 * template and the very same horizontal padding.  Cells are top-aligned; a control taller than the 20 px
 * line of text (a 32 px button, a 22 px chip) is pulled up by the difference with a negative margin, so
 * the first lines and the controls of a row share one axis.  Where the table does not fit it becomes cards.
 *
 * Alignment rule of every table (owner 21.10): a header is aligned exactly like the content of its column.
 * The identity column (first) and long free text are LEFT; short data (lesson, group as the second column,
 * status, deadline, dates, counts, percents, marks, chips) are CENTRED, both lines of a two-line cell and the
 * chip; the action column is RIGHT and has no header text.  Only a money ledger is right-aligned over its digits.
 */

export type CellAlign = "left" | "center" | "right";

/** Text alignment of a header cell (always) and of a body cell (`xl:` / `lg:` variants are written next to the cell). */
export const ALIGN_CLASS: Record<CellAlign, string> = { left: "text-left", center: "text-center", right: "text-right" };

/** Horizontal padding of a header and of a row of the wide table. */
export const TABLE_PAD_X = "px-4";

/** Header cell: ordinary case (never ALL CAPS), semibold 13 px, muted.  Rows put their content on the same left edge. */
export const TABLE_HEAD_CELL = "min-w-0 text-[13px] font-semibold text-slate-500";

/** Header row of the wide table; `gridClass` is the same template the rows use. */
export function TableHeader({ gridClass, labels, aligns, hints, show }: {
  gridClass: string;
  labels: string[];
  aligns?: CellAlign[];
  /** A small «?» after the label with what the column holds (by the label's index; none for most). */
  hints?: Array<string | undefined>;
  show: "lg" | "xl";
}) {
  const visible = show === "lg" ? "lg:grid" : "xl:grid";
  return (
    <div
      role="presentation"
      className={`hidden border-b border-slate-100 bg-slate-50 py-2.5 ${TABLE_PAD_X} ${visible} items-center gap-x-3 ${gridClass}`}
    >
      {labels.map((label, index) => (
        <span key={`${label}-${index}`} className={`${TABLE_HEAD_CELL} ${ALIGN_CLASS[aligns?.[index] ?? "left"]}`}>
          {label ? (hints?.[index] ? (
            <span className="inline-flex items-center gap-1">
              {label}
              <Hint text={hints[index] as string} className="inline-flex text-slate-400">
                <HelpCircle className="h-3.5 w-3.5" aria-label={`Что в колонке «${label}»`} />
              </Hint>
            </span>
          ) : label) : <span className="sr-only">Действия</span>}
        </span>
      ))}
    </div>
  );
}

/** Calm empty state: icon, what is empty, what to expect. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-14 text-center">
      <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="max-w-sm text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
