"use client";

import { Loader2 } from "lucide-react";
import { formatDateRu } from "@/lib/business-time";
import { formatMoney } from "@/lib/money-format";
import { PAY_FROM_LABEL, PAY_FROM_HELP, IMMEDIATE_TITLE, immediateHint, immediatePartRows, type ImmediatePart, PAY_FROM_NOTHING_NOW, payFromDefaultLine, payFromIsPast, payFromRange, type PayFromDefault } from "@/lib/pay-from";
import type { PayFromPreview } from "@/lib/use-pay-from";
import { pastBalancesByStudent, pastBalancesOf } from "@/lib/past-balances";
import { HelpHint } from "@/components/ui/help-hint";

export const PAY_FROM_FAILED_TEXT = "Не удалось посчитать, сколько начислится сразу";
import { DateInput } from "@/components/ui/date-input";
import { PRICE_FIELD, PRICE_LABEL } from "@/components/payments/price-fields";

/**
 * Money-1 B1 - «Оплата с» of a student who is added to a group.  With access to money: the date, the first lesson of the group by default, and - for a day in the past - what is charged at once.
 * Without it the field is NOT here (not blocked, absent): one quiet line says from which day the student is charged.  A transfer has no such field (the server refuses it): the caller draws nothing.
 */
export function PayFromField({ idPrefix, moneyRight, def, value, onChange, accountingStart, preview, onRetry, bare = false }: {
  idPrefix: string;
  moneyRight: boolean;
  def: PayFromDefault | null;
  value: string;
  onChange: (next: string) => void;
  accountingStart: string | null;
  /** The dry run of the add of ONE student from a past day. */
  preview: PayFromPreview;
  onRetry?: () => void;
  /** The drawer of the group page: only the field (label, «?», date, «Вернуть …») and the states «Считаем…» / failure; the sums of the charge at once are the summary card under the list. */
  bare?: boolean;
}) {
  if (!def) return null;
  // a role without the right to money sees no money and cannot choose the day: the sentence would give it nothing to decide (LESSONS 148 p.5)
  if (!moneyRight) return null;
  const range = payFromRange(def.today, accountingStart);
  const past = payFromIsPast(value, def);
  const changed = value !== def.default_pay_from;
  // Д3: the line is there whenever the server sent `immediate` (today's lesson charges at once too); «ничего не начислится», «Считаем…» and a failure - only for a day in the past
  const said = preview.status === "ready" && preview.immediate.students.length > 0;
  return (
    <div data-testid="pay-from">
      <div className="mb-1 flex items-center gap-1">
        <label htmlFor={`${idPrefix}-pay-from`} className={PRICE_LABEL.replace("mb-1 block", "block")}>{PAY_FROM_LABEL}</label>
        <HelpHint text={PAY_FROM_HELP} testId="pay-from-help" />
        {bare && changed && <ResetButton def={def} onChange={onChange} className="ml-auto" />}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <DateInput
          id={`${idPrefix}-pay-from`}
          value={value}
          min={range.min}
          max={range.max}
          onChange={onChange}
          wrapperClassName="w-44 max-w-full"
          className={PRICE_FIELD}
        />
        {!bare && changed && <ResetButton def={def} onChange={onChange} />}
      </div>
      {!bare && <PayFromStatus past={past} preview={preview} onRetry={onRetry} />}
      {!bare && preview.status === "ready" && (past || said) && (
        <div className="mt-1 space-y-0.5 text-xs text-slate-800" role="status" data-testid="pay-from-immediate">
          {preview.immediate.students.length === 0 && <p className="font-medium">{PAY_FROM_NOTHING_NOW}</p>}
                    {preview.immediate.students.length > 0 && <ImmediateBlock amount={preview.immediate.students[0].amount} parts={preview.immediate.students[0].parts} text={preview.immediate.students[0].text} sameGroup={sameGroupOf(preview.answer)} />}
        </div>
      )}
    </div>
  );
}

/** «Считаем…» / the failure of the probe of a day in the past (the bare field of the drawer has them under its row, full width). */
export function PayFromStatus({ past, preview, onRetry }: { past: boolean; preview: PayFromPreview; onRetry?: () => void }) {
  return (
    <>
      {past && preview.status === "loading" && (
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500" role="status" data-testid="pay-from-immediate"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />Считаем…</p>
      )}
      {past && preview.status === "failed" && (
        <p className="mt-1 text-xs text-amber-900" role="alert" data-testid="pay-from-failed">{PAY_FROM_FAILED_TEXT}{onRetry && <>{" "}<button type="button" onClick={onRetry} className="font-semibold underline">Повторить</button></>}</p>
      )}
    </>
  );
}

function ResetButton({ def, onChange, className = "" }: { def: PayFromDefault; onChange: (next: string) => void; className?: string }) {
  return (
    <button type="button" onClick={() => onChange(def.default_pay_from)} className={`min-h-10 text-xs font-semibold text-primary-700 hover:underline sm:min-h-0 ${className}`} data-testid="pay-from-reset">
      Вернуть {formatDateRu(def.default_pay_from)}
    </button>
  );
}

/** True when a chosen student has a stay in THIS group behind him (`past_balances[].same_group`) - the answer of one add (top level) and of a bulk one (`students[]`). */
export function sameGroupOf(answer: unknown): boolean {
  return pastBalancesOf(answer).some((row) => row.sameGroup) || pastBalancesByStudent(answer).some((entry) => entry.rows.some((row) => row.sameGroup));
}

/**
 * «К оплате сразу» as a BLOCK, like «Что изменится» of the payment window: a light card, the title on the left and the total on the right (bold), under it a row per month - the caption left, the sum right (tabular, never wrapped).
 * Nothing but the sentence of the server when an older server sends no `parts`.
 */
function ImmediateBlock({ amount, parts, text, sameGroup }: { amount: number; parts: ImmediatePart[]; text: string; sameGroup: boolean }) {
  if (parts.length === 0) return <p className="font-medium">{text}</p>;
  return (
    <>
    <div data-testid="pay-from-immediate-block" className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900">{IMMEDIATE_TITLE}<HelpHint testId="pay-from-immediate-help" text={immediateHint({ rounded: parts.some((part) => !part.whole), sameGroup })} /></p>
        <p data-testid="pay-from-immediate-total-sum" className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900">{formatMoney(amount)}</p>
      </div>
      {/* one period: its sum is the total above - the row is the caption only; two and more - a sum per period */}
      <ul className="mt-2 space-y-1" data-testid="pay-from-immediate-parts">
        {immediatePartRows(parts).map((row, _index, all) => (
          <li key={row.label} className={`flex items-baseline justify-between gap-3 text-xs ${all.length > 1 ? "text-slate-700" : "text-slate-500"}`}>
            <span className="min-w-0 break-words">{row.label}</span>
            {all.length > 1 && <span className="whitespace-nowrap tabular-nums">{row.amount}</span>}
          </li>
        ))}
      </ul>
    </div>
    </>
  );
}
