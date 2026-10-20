// relative imports, like the dialog body: node:test renders this file
import { CHIP_BASE_CLASS, CHIP_TONE_CLASS } from "../../lib/chip-tone";
import type { AfterDeadlineMark } from "../../lib/excuse-decision";

/**
 * «после срока»: a small neutral chip next to a decision that was made after the confirmation deadline.  The tooltip says
 * which deadline («Решение принято после срока (до 12.10)»); a screen reader gets the date after the label.
 * Neutral on purpose: deciding late is allowed, it is a fact to know, not a problem.
 */
export function AfterDeadlineChip({ mark, className = "" }: { mark: AfterDeadlineMark; className?: string }) {
  return (
    <span
      data-testid="after-deadline-chip"
      title={mark.title}
      className={`${CHIP_BASE_CLASS} ${CHIP_TONE_CLASS.neutral} cursor-help ${className}`}
    >
      {mark.label}
      {mark.date && <span className="sr-only"> (до {mark.date})</span>}
    </span>
  );
}
