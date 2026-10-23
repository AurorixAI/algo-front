import { Hint } from "../ui/hint";
import {
  LEGEND_DECISIONS,
  LEGEND_MARKS,
  MARK_CELL_LABEL,
  excuseStatusMeaning,
} from "../../lib/attendance-marks"; // relative, so node:test can render this file

/**
 * The key to the journal, in words: every mark as a cell writes it, and what the decisions about an «Уважительная» mean.
 * It used to be two always-visible rows above the table; now it opens from a «?» next to the journal title (and each
 * decision chip carries its own line as a tooltip).
 */
export function attendanceLegendText(): string {
  const marks = LEGEND_MARKS.map((value) => MARK_CELL_LABEL[value]).join(" · ");
  const decisions = LEGEND_DECISIONS.map((decision) => excuseStatusMeaning(decision));
  return [`Отметки: ${marks}`, "Решение по уважительной причине:", ...decisions].join("\n");
}

export function AttendanceLegendHint() {
  return (
    <Hint
      text={attendanceLegendText()}
      side="below"
      width={340}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-bold text-slate-500 hover:border-slate-400 hover:text-slate-700"
    >
      <span aria-hidden="true">?</span>
      <span className="sr-only">Обозначения в журнале</span>
    </Hint>
  );
}
