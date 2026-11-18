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

/** Comes back in the ordinary way / is written anew (the server's `undone = false`): the short line, the server's words are in the «?». */
export const LEAVE_ORDINARY_ONE_LINE = "Ученик записывается заново";

/**
 * Money-2 T6 / fix 10B: a student whose leaving of today is NOT cancelled comes back in the ordinary way - the grey line «Ученик записывается заново» + a «?» with the sentence of the server (it changes what the
 * administrator has to set: the price and the pauses are to be set again).  A student who comes back AS HE WAS has no plate before the action - «всё останется как было» is the expected result; the server's words
 * come after the action, in the message of success.  The screen does not parse the sentence of the server: `undone` decides.
 */
export function LeaveUndoNote({ undo, className = "" }: { undo: LeaveUndo; className?: string }) {
  if (undo.undone) return null;
  return (
    <div data-testid="leave-undo" data-undone="no" className={`flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 ${className}`}>
      <p className="min-w-0 text-sm font-medium text-slate-800 [overflow-wrap:anywhere]" data-testid="leave-undo-line">{LEAVE_ORDINARY_ONE_LINE}</p>
      <HelpHint text={tidyMoneyText(undo.text)} testId="leave-undo-help" />
    </div>
  );
}

type NamedText = { name: string; text: string };
/** The sentence for a screen reader keeps «имя: текст»; the bubble shows a paragraph per student: the name in bold on its own line, the server's words under it. */
const plainOf = (rows: NamedText[]) => rows.map((row) => `${row.name}: ${row.text}`).join("\n");
const paragraphsOf = (rows: NamedText[]) => (
  <span className="block space-y-2.5" data-testid="leave-hint-paragraphs">
    {rows.map((row, index) => <span key={`${row.name}-${index}`} className="block" data-testid="leave-hint-student"><span className="block font-semibold">{row.name}</span><span className="block">{row.text}</span></span>)}
  </span>
);
const namedList = (entries: ReadonlyMap<string, LeaveUndo>, names: ReadonlyMap<string, string>): NamedText[] => {
  // the order the person chose them in (the answer of the server is in the order of the sorted ids)
  const order = Array.from(names.keys());
  return Array.from(entries.entries()).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([id, undo]) => ({ name: names.get(id) ?? "Ученик", text: tidyMoneyText(undo.text) }));
};

/**
 * The drawer «Зачислить учеников»: those who come back in the ordinary way (`ordinary`, the server's `undone = false`).  One chosen student - the line + «?» (the card of a student looks the same); several - a line
 * with the count + «?» with a paragraph per student.
 */
export function BulkLeaveNotes({ ordinary, names, single }: { ordinary: ReadonlyMap<string, LeaveUndo>; names: ReadonlyMap<string, string>; single: boolean }) {
  if (ordinary.size === 0) return null;
  if (single) return <LeaveUndoNote undo={Array.from(ordinary.values())[0]} />;
  const rows = namedList(ordinary, names);
  return (
    <div data-testid="leave-return-many" className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
      <p className="min-w-0 text-sm font-medium text-slate-800 [overflow-wrap:anywhere]" data-testid="leave-undo-line">{ordinary.size === 1 ? "1 ученик записывается заново" : `${ordinary.size} ${pluralRu(ordinary.size, ["ученика", "ученика", "учеников"])} записываются заново`}</p>
      <HelpHint text={plainOf(rows)} content={paragraphsOf(rows)} testId="leave-undo-help" />
    </div>
  );
}

/**
 * Several students, some of them come back as they were: a quiet line right under the fields of the price / the day, ONLY when the administrator really entered a common price or changed «Оплата с» (there is a
 * difference to be surprised at); the «?» holds the server's words per student.  Nothing common entered - no line; all come back - the fields are hidden, no line.
 */
export function SharedTermsNote({ undone, names }: { undone: ReadonlyMap<string, LeaveUndo>; names: ReadonlyMap<string, string> }) {
  if (undone.size === 0) return null;
  const rows = namedList(undone, names);
  const line = rows.length === 1 ? `На ${rows[0].name} общие цена и дата не действуют — остаются прежние` : `На ${rows.length} ${pluralRu(rows.length, ["ученика", "ученика", "учеников"])} общие цена и дата не действуют — у них остаются прежние`;
  return (
    <div data-testid="leave-shared-note" className="flex items-start justify-between gap-2 px-1 text-xs text-slate-500">
      <p className="min-w-0 [overflow-wrap:anywhere]" data-testid="leave-shared-line">{line}</p>
      <HelpHint text={plainOf(rows)} content={paragraphsOf(rows)} testId="leave-undo-help" />
    </div>
  );
}
