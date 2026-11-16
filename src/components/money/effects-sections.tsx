"use client";

import { tidyMoneyText } from "@/lib/money-format";
import { Disclosure } from "@/components/ui/disclosure";
import { effectFullTexts, effectSections, lonelyMoneyText, type TransferEffects } from "@/lib/transfer-effects";
import type { LeaveUndo } from "@/lib/transfer-effects";

/**
 * Money-2 Э1 / А7: «Что изменится» of a transfer / leaving / archiving as SHORT ROWS «что → значение» from the structure of the server's `effects` (the sums and the days are the server's); the group
 * is named once, in the title of its block.  The whole sentences of the server stay under «Подробнее» of the block.  A section with no rows is not drawn.
 */
export function EffectsSections({ effects, target = null, testId = "transfer-effects", className = "" }: { effects: TransferEffects; /** the group the student goes to (a transfer): named once in «Перейдёт в «…»» */ target?: string | null; testId?: string; className?: string }) {
  const sections = effectSections(effects, target);
  const lonely = lonelyMoneyText(effects);
  if (sections.length === 0 && !lonely) return null;
  return (
    <div data-testid={testId} className={`space-y-2.5 ${className}`}>
      {lonely && <p className="text-sm text-slate-700" data-testid="effects-lonely">{tidyMoneyText(lonely)}</p>}
      {sections.map((section) => (
        <section key={section.key} aria-label={section.title}>
          <h4 className="text-xs font-semibold text-slate-600 [overflow-wrap:anywhere]">{section.title}</h4>
          <ul className="mt-1 space-y-1" data-testid={`effects-${section.key}`}>
            {section.rows.map((row) => (
              <li key={row.key} data-testid="effect-row" className="flex items-baseline justify-between gap-x-3 text-sm leading-snug text-slate-800">
                <span className="min-w-0 [overflow-wrap:anywhere]">{tidyMoneyText(row.label)}</span>
                {row.value && <span className="shrink-0 whitespace-nowrap text-right font-semibold tabular-nums">{row.value}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Disclosure testId="effects-full">
        <ul className="space-y-1">{effectFullTexts(effects).map((text, index) => <li key={`${index}-${text}`} className="[overflow-wrap:anywhere]">{tidyMoneyText(text)}</li>)}</ul>
      </Disclosure>
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
