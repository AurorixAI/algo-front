"use client";

import Link from "next/link";
import { formatMoney, tidyMoneyText } from "@/lib/money-format";
import { IMMEDIATE_TITLE, IMMEDIATE_TOTAL_TITLE, PAY_FROM_NOTHING_NOW, immediateHint, immediatePartRows, sharedPeriodLine, type ImmediatePart } from "@/lib/pay-from";
import { pastBalanceNote, type PastBalance } from "@/lib/past-balances";
import { statementHref } from "@/lib/payments";
import type { LeaveUndo } from "@/lib/transfer-effects";
import { HelpHint } from "@/components/ui/help-hint";

/** One chosen student of the summary: what he pays at once and what the server said about him (all of it fields of the answer, never parsed sentences). */
export interface EnrolSummaryStudent {
  id: string;
  name: string;
  /** null - nothing to pay at once (or not known yet) */
  amount: number | null;
  parts: ImmediatePart[];
  past: PastBalance[];
  /** comes back in the ordinary way (`undone = false`): the server's words are in the «?» */
  rewrite: LeaveUndo | null;
  /** comes back as he was while a common price / day is entered: they do not apply to him */
  sharedUndone: LeaveUndo | null;
}

/** ready: the sums are the answer of the probe; stale: the previous answer of the same students, muted while the new one is coming; off: no sums (no right to money / a transfer). */
export type EnrolSummaryAmounts = "ready" | "stale" | "off";

/**
 * Money-2 fix 10Д: ONE card under the conditions of the window «Зачислить учеников» - the title «К оплате сразу» with the total, then a row per student (the name, the sum on the right edge) with his own notes under the name:
 * the debt or the advance of the last time (amber, with the link «Выписка» - no «?» about the statement), «Записывается заново» and «Общие цена и дата не действуют» (grey, the server's words in «?»).  A period shared by everybody is said once under the title.
 * A role without the right to money: «Выбрано: N», names and notes, no sums.  Over six rows the card scrolls inside (about 280 px).  Nothing to say - nothing drawn.
 */
export function EnrolSummary({ students, amounts, past, paymentsBase, sameGroup, rounded }: {
  students: EnrolSummaryStudent[];
  amounts: EnrolSummaryAmounts;
  /** a day in the past is chosen: «Сразу платить не нужно» is worth saying */
  past: boolean;
  paymentsBase: string | null;
  sameGroup: boolean;
  rounded: boolean;
}) {
  const many = students.length > 1;
  const noted = students.some((s) => s.past.length > 0 || s.rewrite !== null || s.sharedUndone !== null);
  const payers = students.filter((s) => s.amount !== null);
  const sums = amounts !== "off";
  if (sums && payers.length === 0 && !noted) {
    return amounts === "ready" && past ? <p className="text-xs font-medium text-slate-800" role="status" data-testid="pay-from-immediate">{PAY_FROM_NOTHING_NOW}</p> : null;
  }
  if (!sums && !noted) return null;
  const total = payers.reduce((sum, s) => sum + (s.amount ?? 0), 0);
  const hint = sums && payers.length > 0 ? immediateHint({ rounded, sameGroup }) : "";
  const shared = sums && many ? sharedPeriodLine(payers.map((s) => s.parts), payers.length === students.length) : null;
  const periodsInRows = sums && many && shared === null;
  return (
    <section aria-label={sums ? IMMEDIATE_TITLE : "Выбрано"} aria-busy={amounts === "stale"} data-testid="enrol-summary" className="max-h-[280px] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-slate-50">
      <header className="sticky top-0 z-10 bg-slate-50 px-3 pt-3">
        <div className="flex items-baseline justify-between gap-3" data-testid="enrol-summary-head">
          <p className="inline-flex min-w-0 items-center gap-1 text-sm font-semibold text-slate-900">
            {sums ? (many ? IMMEDIATE_TOTAL_TITLE : IMMEDIATE_TITLE) : `Выбрано: ${students.length}`}
            {hint && <HelpHint testId="enrol-summary-help" text={hint} />}
          </p>
          {sums && <p data-testid="enrol-summary-total" className={`whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900 ${amounts === "stale" ? "opacity-60" : ""}`}>{payers.length > 0 ? formatMoney(total) : "—"}</p>}
        </div>
        {shared && <p className={`mt-0.5 text-xs text-slate-500 ${amounts === "stale" ? "opacity-60" : ""}`} data-testid="enrol-summary-period">{shared}</p>}
      </header>
      <div className={`px-3 pb-3 ${amounts === "stale" ? "opacity-60" : ""}`}>
        {!many && sums && <Periods parts={students[0].parts} className="mt-0.5" />}
        {!many && <Notes student={students[0]} paymentsBase={paymentsBase} className="mt-1" />}
        {many && (
          <ul className="mt-2 space-y-2" data-testid="enrol-summary-students">
            {students.map((student) => (
              <li key={student.id} data-testid="enrol-summary-student">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-900" title={student.name} data-testid="enrol-summary-name">{student.name}</span>
                  {sums && <span className="whitespace-nowrap font-medium tabular-nums text-slate-900" data-testid="enrol-summary-sum">{student.amount === null ? "—" : formatMoney(student.amount)}</span>}
                </div>
                {periodsInRows && <Periods parts={student.parts} className="mt-0.5" />}
                <Notes student={student} paymentsBase={paymentsBase} className="mt-0.5" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** The periods of one student under his name / under the title: «Ноябрь, с 19.11 · 5 уроков из 12»; with two periods a sum per period on the right. */
function Periods({ parts, className }: { parts: ImmediatePart[]; className: string }) {
  const rows = immediatePartRows(parts);
  if (rows.length === 0) return null;
  return (
    <ul className={`space-y-0.5 text-xs text-slate-500 ${className}`} data-testid="enrol-summary-period">
      {rows.map((row) => (
        <li key={row.label} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 [overflow-wrap:anywhere]">{row.label}</span>
          {rows.length > 1 && <span className="whitespace-nowrap tabular-nums">{row.amount}</span>}
        </li>
      ))}
    </ul>
  );
}

const REWRITE_LINE = "Записывается заново";
const SHARED_LINE = "Общие цена и дата не действуют — остаются прежние";

function Notes({ student, paymentsBase, className }: { student: EnrolSummaryStudent; paymentsBase: string | null; className: string }) {
  if (student.past.length === 0 && !student.rewrite && !student.sharedUndone) return null;
  return (
    <ul className={`space-y-0.5 text-xs ${className}`} data-testid="enrol-summary-notes">
      {student.past.map((row) => (
        <li key={row.key} data-testid="enrol-note-past" className="text-warning-800 [overflow-wrap:anywhere]">
          {tidyMoneyText(pastBalanceNote(row))}
          {paymentsBase && <>{" "}<Link href={statementHref(paymentsBase, row.membershipId)} className="inline-flex min-h-10 items-center font-semibold text-primary-700 hover:underline max-sm:-my-2.5 sm:min-h-0" data-testid="past-balance-link">Выписка</Link></>}
        </li>
      ))}
      {student.rewrite && <GreyNote testId="enrol-note-rewrite" line={REWRITE_LINE} help={student.rewrite.text} />}
      {student.sharedUndone && <GreyNote testId="enrol-note-shared" line={SHARED_LINE} help={student.sharedUndone.text} />}
    </ul>
  );
}

function GreyNote({ testId, line, help }: { testId: string; line: string; help: string }) {
  return (
    <li data-testid={testId} className="text-slate-600 [overflow-wrap:anywhere]">
      <span data-testid="leave-undo-line">{line}</span>
      <HelpHint text={tidyMoneyText(help)} testId="leave-undo-help" />
    </li>
  );
}
