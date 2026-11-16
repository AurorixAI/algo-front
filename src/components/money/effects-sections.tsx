"use client";

import { tidyMoneyText } from "@/lib/money-format";
import { effectSections, lonelyMoneyText, type TransferEffects } from "@/lib/transfer-effects";
import type { LeaveUndo } from "@/lib/transfer-effects";

/**
 * Money-2 Э1: «Что изменится» of a transfer / leaving / archiving as the server's `effects` - «Перейдёт», «Останется в группе …», «Закончится», «Перейдёт вместе с учеником».  The window adds titles;
 * every sentence and sum is the server's, said once.  A section with no rows is not drawn (so a leaving shows «Закончится» and «Останется» only).
 */
export function EffectsSections({ effects, testId = "transfer-effects", className = "" }: { effects: TransferEffects; testId?: string; className?: string }) {
  const sections = effectSections(effects);
  const lonely = lonelyMoneyText(effects);
  if (sections.length === 0 && !lonely) return null;
  return (
    <div data-testid={testId} className={`space-y-2.5 ${className}`}>
      {lonely && <p className="text-sm text-slate-700" data-testid="effects-lonely">{tidyMoneyText(lonely)}</p>}
      {sections.map((section) => (
        <section key={section.key} aria-label={section.title}>
          <h4 className="text-xs font-semibold text-slate-600">{section.title}</h4>
          <ul className="mt-1 space-y-1" data-testid={`effects-${section.key}`}>
            {section.rows.map((row, index) => <li key={`${index}-${row}`} className="text-sm leading-snug text-slate-800 [overflow-wrap:anywhere]">{tidyMoneyText(row)}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Money-2 T6: coming back the day of the leaving - the sentence of the server and what it restored; for an ordinary return the same sentence says why it is ordinary. */
export function LeaveUndoNote({ undo, className = "" }: { undo: LeaveUndo; className?: string }) {
  return (
    <div data-testid="leave-undo" data-undone={undo.undone ? "yes" : "no"} className={`rounded-xl border px-3.5 py-3 ${undo.undone ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"} ${className}`}>
      <p className="text-sm font-medium text-slate-800 [overflow-wrap:anywhere]">{tidyMoneyText(undo.text)}</p>
      {undo.restored.length > 0 && (
        <ul className="mt-1.5 space-y-1">{undo.restored.map((text, index) => <li key={`${index}-${text}`} className="text-sm text-slate-700 [overflow-wrap:anywhere]">{tidyMoneyText(text)}</li>)}</ul>
      )}
    </div>
  );
}
