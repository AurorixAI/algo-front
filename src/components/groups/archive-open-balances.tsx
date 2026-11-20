"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Disclosure } from "@/components/ui/disclosure";
import { formatDayMonthRu } from "@/lib/business-time";
import { formatMoney, tidyMoneyText } from "@/lib/money-format";
import { statementHref } from "@/lib/payments";
import type { ArchiveBalance } from "@/lib/ops-b-types";

/**
 * Money-2 Э5 (Т12): the refusal `OPEN_BALANCES` of the archive of a group - every stay with a debt or an advance (the left students too): who, «Долг · ушёл 20.11», the sum and the actions of the server
 * (`Принять оплату`, `Простить долг`, `Вернуть аванс`) as links to the statement of that stay.  A role without money gets the fact (the sentence without digits) and no link.  The sentence of the server
 * is under «Подробнее».
 */
const KIND_NAME = { debt: "Долг", due: "К оплате", advance: "Аванс" } as const;

export function ArchiveOpenBalances({ title, words = [], balances, paymentsBase }: { title: string; /** the sentences of the server about what the archive does to the unpaid sums (none - nothing is said) */ words?: readonly string[]; balances: ReadonlyArray<ArchiveBalance>; paymentsBase: string | null }) {
  return (
    <div data-testid="archive-open-balances" className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5">
      <p className="flex items-start gap-2 text-sm font-medium text-rose-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{title}</span></p>
      {words.map((line) => <p key={line} data-testid="archive-balance-words" className="mt-1.5 text-sm text-rose-900 [overflow-wrap:anywhere]">{tidyMoneyText(line)}</p>)}
      <ul className="mt-3 divide-y divide-rose-100 rounded-lg bg-white">
        {balances.map((row, index) => {
          const left = row.left_on ? formatDayMonthRu(row.left_on) : "";
          const actions = paymentsBase ? (row.actions ?? []) : [];
          return (
            <li key={`${row.membership_id}-${row.kind}-${index}`} data-testid="archive-balance" className="px-3 py-2">
              <div className="flex items-baseline justify-between gap-x-3">
                <p className="min-w-0 text-sm font-medium text-slate-900 [overflow-wrap:anywhere]">{row.name}</p>
                {typeof row.amount === "number" && <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900">{formatMoney(row.amount)}</span>}
              </div>
              <p className="text-xs text-slate-600">{KIND_NAME[row.kind] ?? "Аванс"}{left ? ` · ушёл ${left}` : ""}</p>
              {actions.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                  {actions.map((action) => (
                    <Link key={action.code} href={statementHref(paymentsBase as string, row.membership_id)} data-testid={`archive-balance-${action.code}`} className="inline-flex min-h-10 items-center text-sm font-semibold text-primary-700 hover:underline sm:min-h-0">{action.label}</Link>
                  ))}
                </p>
              )}
              <Disclosure testId="archive-balance-full"><p className="[overflow-wrap:anywhere]">{tidyMoneyText(row.text)}</p></Disclosure>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
