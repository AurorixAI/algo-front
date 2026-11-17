"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PAST_BALANCES_TITLE, pastBalanceLabel, pastBalancesByStudent, pastBalancesManyTitle, pastBalancesOf, type PastBalance } from "@/lib/past-balances";
import { statementHref } from "@/lib/payments";
import { tidyMoneyText } from "@/lib/money-format";

/**
 * Money-2 Э2: before a student is written into a group - the debts and the advances he left in his past groups, each with a link to the statement of that stay (to take the payment, forgive the debt or
 * give the advance back there).  Nothing to say - nothing drawn.  `paymentsBase` null: the rows without a link.
 */
export function PastBalancesNote({ answer, paymentsBase, className = "" }: { answer: unknown; paymentsBase: string | null; className?: string }) {
  const rows = pastBalancesOf(answer);
  return rows.length === 0 ? null : <PlainBox rows={rows} paymentsBase={paymentsBase} className={className} />;
}

function PlainBox({ rows, paymentsBase, className }: { rows: PastBalance[]; paymentsBase: string | null; className: string }) {
  return (
    <section aria-label={PAST_BALANCES_TITLE} data-testid="past-balances" className={`rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 ${className}`}>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-amber-900"><AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />{PAST_BALANCES_TITLE}</h3>
      <BalanceRows rows={rows} paymentsBase={paymentsBase} className="mt-1.5" />
    </section>
  );
}

/**
 * The same block for the bulk answer (`students[].past_balances`): one student - his rows as they are; several - one summary line «У N учеников остались долги или авансы с прошлого раза» and, under
 * a disclosure, the rows by student.  The sums arrive only for the money right (as they come).
 */
export function BulkPastBalancesNote({ answer, names, paymentsBase, className = "" }: { answer: unknown; names: ReadonlyMap<string, string>; paymentsBase: string | null; className?: string }) {
  const groups = pastBalancesByStudent(answer);
  if (groups.length === 0) return null;
  if (groups.length === 1) return <PlainBox rows={groups[0].rows} paymentsBase={paymentsBase} className={className} />;
  return (
    <section aria-label={PAST_BALANCES_TITLE} data-testid="past-balances" className={`rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 ${className}`}>
      <details>
        <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-amber-900"><AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />{pastBalancesManyTitle(groups.length)}</summary>
        <div className="mt-2 space-y-2">
          {groups.map((group) => (
            <div key={group.studentId}>
              <p className="text-xs font-semibold text-slate-700 [overflow-wrap:anywhere]">{names.get(group.studentId) ?? "Ученик"}</p>
              <BalanceRows rows={group.rows} paymentsBase={paymentsBase} className="mt-1" />
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function BalanceRows({ rows, paymentsBase, className }: { rows: PastBalance[]; paymentsBase: string | null; className: string }) {
  return (
    <ul className={`space-y-1.5 ${className}`}>
      {rows.map((row) => (
        <li key={row.key} data-testid="past-balance" className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm text-slate-900">
          <span className="min-w-0 [overflow-wrap:anywhere]">{tidyMoneyText(pastBalanceLabel(row))}</span>
          <span className="flex shrink-0 items-baseline gap-x-3">
            {row.value && <span className="whitespace-nowrap font-semibold tabular-nums">{row.value}</span>}
            {paymentsBase && <Link href={statementHref(paymentsBase, row.membershipId)} className="inline-flex min-h-10 items-center text-xs font-semibold text-primary-700 hover:underline sm:min-h-0" data-testid="past-balance-link">Выписка</Link>}
          </span>
        </li>
      ))}
    </ul>
  );
}
