"use client";

import { tidyMoneyText } from "@/lib/money-format";
import { Disclosure } from "@/components/ui/disclosure";
import { calmMoneyText, effectFullTexts, effectSections, type TransferEffects } from "@/lib/transfer-effects";
import type { LeaveUndo } from "@/lib/transfer-effects";
import { pluralRu } from "@/lib/plural";
import { HelpHint } from "@/components/ui/help-hint";

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

/** The one short line of a student who comes back as he was (his leaving of today is cancelled) - Money-2 fix 10. */
export const LEAVE_UNDO_ONE_LINE = "Ученика убрали сегодня — вернётся как был";
/** The grey sentence of the hint: what a returning-as-he-was student does not get to set (the server refuses `pay_from` / the opening balance then; the price stays as it was). */
export const LEAVE_UNDO_FIXED_TEXT = "Дату оплаты и цену здесь задать нельзя — они остаются прежними";
/** The hint of several returning students: the common fields do not act on them. */
export const LEAVE_UNDO_MANY_LINE = "Общие «Оплата с» и цена на них не действуют";
/** Comes back in the ordinary way / is written anew (the server's `undone = false`): the short line, the server's words are in the «?». */
export const LEAVE_ORDINARY_ONE_LINE = "Ученик записывается заново";

/**
 * Money-2 T6 / fix 10: coming back the day of the leaving - ONE short line and a «?» with the sentence of the server (and, for a cancelled leaving, the grey line of what cannot be set).  The screen does not
 * parse the sentence of the server: «undone» decides the line; the answer has no field that tells «a transfer, go back from there» from «the money forbids the cancel», so every `undone = false` reads as the plain «записывается заново» + the server's words (the sentence itself says which).
 */
export function LeaveUndoNote({ undo, className = "" }: { undo: LeaveUndo; className?: string }) {
  const hint = undo.undone ? `${tidyMoneyText(undo.text)}\n${LEAVE_UNDO_FIXED_TEXT}` : tidyMoneyText(undo.text);
  return (
    <div data-testid="leave-undo" data-undone={undo.undone ? "yes" : "no"} className={`flex items-start justify-between gap-2 rounded-xl border px-3.5 py-2.5 ${undo.undone ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"} ${className}`}>
      <p className="min-w-0 text-sm font-medium text-slate-800 [overflow-wrap:anywhere]" data-testid="leave-undo-line">{undo.undone ? LEAVE_UNDO_ONE_LINE : LEAVE_ORDINARY_ONE_LINE}</p>
      <HelpHint text={hint} testId="leave-undo-help" />
    </div>
  );
}

/**
 * The drawer «Зачислить учеников» (one bulk answer): the students whose leaving is cancelled (`undone`) and those written anew (`ordinary`).  One chosen student - one line + «?» (the card of a student
 * looks the same); several - a line with the count + «?» that holds the common sentence and a line «имя: слова сервера» per student.  Two kinds at once - two lines.
 */
export function BulkLeaveNotes({ undone, ordinary, names, single }: { undone: ReadonlyMap<string, LeaveUndo>; ordinary: ReadonlyMap<string, LeaveUndo>; names: ReadonlyMap<string, string>; single: boolean }) {
  if (undone.size === 0 && ordinary.size === 0) return null;
  if (single) return <LeaveUndoNote undo={Array.from((undone.size > 0 ? undone : ordinary).values())[0]} />;
  // the order the person chose them in (the answer of the server is in the order of the sorted ids)
  const order = Array.from(names.keys());
  const list = (entries: ReadonlyMap<string, LeaveUndo>) => Array.from(entries.entries()).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([id, undo]) => ({ name: names.get(id) ?? "Ученик", text: tidyMoneyText(undo.text) }));
  // the sentence for a screen reader keeps «имя: текст»; the bubble shows a paragraph per student: the name in bold on its own line, the server's words under it
  const plain = (rows: Array<{ name: string; text: string }>, lead?: string) => [lead, ...rows.map((row) => `${row.name}: ${row.text}`)].filter(Boolean).join("\n");
  const paragraphs = (rows: Array<{ name: string; text: string }>, lead?: string) => (
    <span className="block space-y-2.5" data-testid="leave-hint-paragraphs">
      {lead && <span className="block border-b border-white/15 pb-2 text-white/70" data-testid="leave-hint-rule">{lead}</span>}
      {rows.map((row, index) => <span key={`${row.name}-${index}`} className="block" data-testid="leave-hint-student"><span className="block font-semibold">{row.name}</span><span className="block">{row.text}</span></span>)}
    </span>
  );
  return (
    <>
      {undone.size > 0 && (
        <div data-testid="leave-undo-many" className="flex items-start justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
          <p className="min-w-0 text-sm font-medium text-slate-800 [overflow-wrap:anywhere]" data-testid="leave-undo-line">{undone.size} {pluralRu(undone.size, ["ученика", "ученика", "учеников"])} убрали сегодня — вернутся как были</p>
          <HelpHint text={plain(list(undone), LEAVE_UNDO_MANY_LINE)} content={paragraphs(list(undone), LEAVE_UNDO_MANY_LINE)} testId="leave-undo-help" />
        </div>
      )}
      {ordinary.size > 0 && (
        <div data-testid="leave-return-many" className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <p className="min-w-0 text-sm font-medium text-slate-800 [overflow-wrap:anywhere]" data-testid="leave-undo-line">{ordinary.size === 1 ? "1 ученик записывается заново" : `${ordinary.size} ${pluralRu(ordinary.size, ["ученика", "ученика", "учеников"])} записываются заново`}</p>
          <HelpHint text={plain(list(ordinary))} content={paragraphs(list(ordinary))} testId="leave-undo-help" />
        </div>
      )}
    </>
  );
}
