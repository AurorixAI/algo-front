import { RECALC_HEADING, recalcLines, type RecalcLine } from "@/lib/payf";

/**
 * PAY-F: «Перерасчёт за уроки, отменённые центром» - one quiet line per lesson the centre cancelled («−46 000 сум: урок 21.10 отменён центром»).
 * Used by «Что будет после сохранения» of the payment dialog and by the receipt (the statement draws the same lines as its own rows).  Nothing when there is none.
 */
export function RecalcNote({ lines, testId = "recalc-note", className = "" }: { lines: ReadonlyArray<RecalcLine> | null | undefined; testId?: string; className?: string }) {
  const { texts } = recalcLines(lines);
  if (texts.length === 0) return null;
  return (
    <section aria-label={RECALC_HEADING} data-testid={testId} className={`mt-2.5 text-xs ${className}`}>
      <h4 className="font-semibold text-slate-700">{RECALC_HEADING}</h4>
      <ul className="mt-1 space-y-0.5 text-slate-600">
        {texts.map((text) => <li key={text} className="tabular-nums">{text}</li>)}
      </ul>
    </section>
  );
}
