"use client";

import { recalcMoreText, type RecalcBlock } from "@/lib/paytails-contract";

/**
 * PAY-TAILS Б2.4: «что было → что станет» of a leaving, an archiving of a student and a transfer - the lines of the server (`recalc`): the sentence in bold («Ноябрь: 600 000 → 415 000 сум»),
 * the basis grey under it («пересчёт по день ухода · 9 уроков из 13»); the periods the server sent, «и ещё N периодов», then the forgiveness that fell with them.  The screen counts nothing.  No lines - nothing is drawn.
 */
export function RecalcLines({ block, testId = "recalc-lines", className = "" }: { block: RecalcBlock | null; testId?: string; className?: string }) {
  if (!block || block.lines.length === 0) return null;
  const line = (item: RecalcBlock["lines"][number], index: number) => (
    <li key={`${index}-${item.text}`} data-testid="recalc-line">
      <p className="text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{item.text}</p>
      {item.basisText && <p data-testid="recalc-basis" className="text-xs text-slate-500 [overflow-wrap:anywhere]">{item.basisText}</p>}
    </li>
  );
  const periods = block.lines.filter((item) => !item.isForgiven);
  const forgiven = block.lines.filter((item) => item.isForgiven);
  return (
    <ul data-testid={testId} className={`space-y-1.5 ${className}`}>
      {periods.map(line)}
      {block.more > 0 && <li data-testid="recalc-more" className="text-xs text-slate-500">{recalcMoreText(block.more)}</li>}
      {forgiven.map(line)}
    </ul>
  );
}

/** What the closing does to the student's OTHER groups (`others`): the server's sentences, one per group. */
export function OtherGroupLines({ lines, testId = "others-lines", className = "" }: { lines: readonly string[]; testId?: string; className?: string }) {
  if (lines.length === 0) return null;
  return (
    <div data-testid={testId} className={`space-y-1 ${className}`}>
      {lines.map((text) => <p key={text} className="text-sm text-slate-800 [overflow-wrap:anywhere]">{text}</p>)}
    </div>
  );
}
