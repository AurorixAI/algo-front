"use client";

import { Disclosure } from "@/components/ui/disclosure";
import { tidyMoneyText } from "@/lib/money-format";
import { otherGroupsOf } from "@/lib/other-groups";

/** Money-2 А7: «В других группах» - short rows «Аванс в «Бета» · −30 000 сум»; the whole sentence of the server under «Подробнее».  Nothing to say - nothing drawn. */
export function OtherGroupsRows({ answer, testId = "other-groups", className = "" }: { answer: unknown; testId?: string; className?: string }) {
  const { rows, full } = otherGroupsOf(answer);
  if (rows.length === 0) return null;
  return (
    <div data-testid={testId} className={className}>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.key} data-testid="effect-row" className="flex items-baseline justify-between gap-x-3 text-sm leading-snug text-slate-800">
            <span className="min-w-0 [overflow-wrap:anywhere]">{tidyMoneyText(row.label)}</span>
            {row.value && <span className="shrink-0 whitespace-nowrap text-right font-semibold tabular-nums">{row.value}</span>}
          </li>
        ))}
      </ul>
      {full && <Disclosure testId={`${testId}-full`}><p className="[overflow-wrap:anywhere]">{tidyMoneyText(full)}</p></Disclosure>}
    </div>
  );
}
