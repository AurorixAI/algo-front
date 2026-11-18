"use client";

import { tidyMoneyText } from "@/lib/money-format";
import { Disclosure } from "@/components/ui/disclosure";
import { calmMoneyText, effectFullTexts, effectSections, type TransferEffects } from "@/lib/transfer-effects";
import type { LeaveUndo } from "@/lib/transfer-effects";
import { pluralRu } from "@/lib/plural";

/**
 * Money-2 Э1 / А7: «Что изменится» of a transfer / leaving / archiving as SHORT ROWS «что → значение» from the structure of the server's `effects` (the sums and the days are the server's); the group
 * is named once, in the title of its block.  The whole sentences of the server stay under «Подробнее» of the block.  A section with no rows is not drawn.
 */
export function EffectsSections({ effects, target = null, testId = "transfer-effects", className = "" }: { effects: TransferEffects; /** the group the student goes to (a transfer): named once in «Перейдёт в «…»» */ target?: string | null; testId?: string; className?: string }) {
  const sections = effectSections(effects, target);
  const calm = calmMoneyText(effects);
  if (sections.length === 0 && !calm) return null;
  return (
    <div data-testid={testId} className={`space-y-2.5 ${className}`}>
      {calm && <p className="text-sm text-slate-600" data-testid="effects-calm">{tidyMoneyText(calm)}</p>}
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

/** Money-2 T6: coming back the day of the leaving - the sentence of the server (once); for an ordinary return the same sentence says why it is ordinary. */
export function LeaveUndoNote({ undo, className = "" }: { undo: LeaveUndo; className?: string }) {
  // ONE plate: the sentence of the server (it already says what was given back) and - for a student whose leaving IS cancelled - one grey line «what does not change» as its LAST line
  return (
    <div data-testid="leave-undo" data-undone={undo.undone ? "yes" : "no"} className={`rounded-xl border px-3.5 py-3 ${undo.undone ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"} ${className}`}>
      <p className="text-sm font-medium text-slate-800 [overflow-wrap:anywhere]">{tidyMoneyText(undo.text)}</p>
      {undo.undone && <LeaveUndoFixed className="mt-1.5" />}
    </div>
  );
}

/** Money-2 fix 9: the ONE grey line for every entrance - what a returning-the-day-of-the-leaving student does not get to set (the server refuses `pay_from` / the opening balance then; the price stays as it was). */
export const LEAVE_UNDO_FIXED_TEXT = "Дата начала оплаты, остаток и индивидуальная цена не меняются";
export function LeaveUndoFixed({ className = "" }: { className?: string }) {
  return <p data-testid="leave-undo-fixed" className={`text-xs text-slate-600 [overflow-wrap:anywhere] ${className}`}>{LEAVE_UNDO_FIXED_TEXT}</p>;
}

/** The line under the summary of several returning students: the same words as for one. */
export const LEAVE_UNDO_MANY_LINE = "Для них «Оплата с» и индивидуальная цена не действуют — всё остаётся как было";

/**
 * The drawer «Зачислить учеников» (one bulk answer): the students whose leaving is cancelled (`undone`) and those who come back in the ordinary way (`ordinary`), each with the sentence of the server.
 * One chosen student - one plate (the card of a student looks the same); several - a summary with a disclosure «имя: слова сервера».  Two kinds at once - two plates.
 */
export function BulkLeaveNotes({ undone, ordinary, names, single }: { undone: ReadonlyMap<string, LeaveUndo>; ordinary: ReadonlyMap<string, LeaveUndo>; names: ReadonlyMap<string, string>; single: boolean }) {
  if (undone.size === 0 && ordinary.size === 0) return null;
  if (single) return <LeaveUndoNote undo={Array.from((undone.size > 0 ? undone : ordinary).values())[0]} />;
  // the order the person chose them in (the answer of the server is in the order of the sorted ids)
  const order = Array.from(names.keys());
  const list = (entries: ReadonlyMap<string, LeaveUndo>) => (
    <ul className="mt-2 space-y-1.5">
      {Array.from(entries.entries()).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([id, undo]) => <li key={id} className="text-sm text-slate-700 [overflow-wrap:anywhere]"><span className="font-semibold">{names.get(id) ?? "Ученик"}</span>: {tidyMoneyText(undo.text)}</li>)}
    </ul>
  );
  return (
    <>
      {undone.size > 0 && (
        <div data-testid="leave-undo-many" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-slate-800">{undone.size} {pluralRu(undone.size, ["ученик возвращается", "ученика возвращаются", "учеников возвращаются"])} в день ухода — уход отменяется</summary>
            {list(undone)}
          </details>
          <p className="mt-2 text-xs text-slate-600 [overflow-wrap:anywhere]">{LEAVE_UNDO_MANY_LINE}</p>
        </div>
      )}
      {ordinary.size > 0 && (
        <div data-testid="leave-return-many" className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-slate-800">{ordinary.size} {pluralRu(ordinary.size, ["ученик возвращается", "ученика возвращаются", "учеников возвращаются"])} в группу после ухода</summary>
            {list(ordinary)}
          </details>
        </div>
      )}
    </>
  );
}
