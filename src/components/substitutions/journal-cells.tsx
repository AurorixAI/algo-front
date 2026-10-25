import { CHIP_BASE_CLASS } from "@/lib/chip-tone";
import { clearedLine, decidedByLine, decisionResultText, originLine, reasonChipText } from "@/lib/substitutions";
import type { SubstitutionItem } from "@/lib/substitution-types";

/** The line under the teacher of a record the system made («Заменил администратор, без запроса», «Перенёс сам, без запроса», …). */
export function OriginLine({ item }: { item: SubstitutionItem }) {
  const line = originLine(item);
  return line ? <p className="text-xs text-slate-500">{line}</p> : null;
}

/** The reason of the row: the chip («Болезнь», «Перенос», «Замена») and the comment under it. */
export function ReasonCell({ item }: { item: SubstitutionItem }) {
  return (
    <>
      <span className={`${CHIP_BASE_CLASS} border-slate-200 bg-slate-50 text-slate-700`}>{reasonChipText(item)}</span>
      {item.comment && <p className="mt-1 line-clamp-3 break-words text-sm text-slate-700" title={item.comment}>{item.comment}</p>}
    </>
  );
}

/** The decision of a decided row: the result, the note, who decided and when, and what became of the substitution afterwards (P1.2). */
export function DecisionCell({ item }: { item: SubstitutionItem }) {
  const cleared = clearedLine(item);
  return (
    <>
      <p className="break-words text-sm font-medium text-slate-800">{decisionResultText(item)}</p>
      {item.decision?.note && item.status !== "substituted" && <p className="break-words text-xs text-slate-500">{item.decision.note}</p>}
      <p className="text-xs text-slate-500">{decidedByLine(item)}</p>
      {cleared && <p className="text-xs text-slate-500" data-testid="substitution-cleared">{cleared}</p>}
    </>
  );
}
