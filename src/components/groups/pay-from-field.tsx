"use client";

import { Loader2 } from "lucide-react";
import { formatDateRu } from "@/lib/business-time";
import { formatMoney } from "@/lib/money-format";
import { PAY_FROM_LABEL, immediatePartRows, type ImmediatePart, PAY_FROM_NOTHING_NOW, payFromDefaultLine, payFromIsPast, payFromRange, type PayFromDefault } from "@/lib/pay-from";
import type { PayFromPreview } from "@/lib/use-pay-from";

export const PAY_FROM_FAILED_TEXT = "Не удалось посчитать, сколько начислится сразу";
import { DateInput } from "@/components/ui/date-input";
import { PRICE_FIELD, PRICE_LABEL } from "@/components/payments/price-fields";

/**
 * Money-1 B1 - «Оплата с» of a student who is added to a group.  With access to money: the date, the first lesson of the group by default, and - for a day in the past - what is charged at once.
 * Without it the field is NOT here (not blocked, absent): one quiet line says from which day the student is charged.  A transfer has no such field (the server refuses it): the caller draws nothing.
 */
export function PayFromField({ idPrefix, moneyRight, def, value, onChange, accountingStart, preview, names, onRetry }: {
  idPrefix: string;
  moneyRight: boolean;
  def: PayFromDefault | null;
  value: string;
  onChange: (next: string) => void;
  accountingStart: string | null;
  /** The dry run of the add of ONE student from a past day. */
  preview: PayFromPreview;
  onRetry?: () => void;
  /** id → name of the students chosen (a line per student names him when there are several). */
  names?: ReadonlyMap<string, string> | null;
}) {
  if (!def) return null;
  if (!moneyRight) {
    return <p className="text-xs text-slate-600" data-testid="pay-from-line">{payFromDefaultLine(def)}</p>;
  }
  const range = payFromRange(def.today, accountingStart);
  const past = payFromIsPast(value, def);
  const changed = value !== def.default_pay_from;
  // Д3: the line is there whenever the server sent `immediate` (today's lesson charges at once too); «ничего не начислится», «Считаем…» and a failure - only for a day in the past
  const said = preview.status === "ready" && preview.immediate.students.length > 0;
  return (
    <div data-testid="pay-from">
      <label htmlFor={`${idPrefix}-pay-from`} className={PRICE_LABEL}>{PAY_FROM_LABEL}</label>
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
        {changed && (
          <button type="button" onClick={() => onChange(def.default_pay_from)} className="min-h-10 text-xs font-semibold text-primary-700 hover:underline sm:min-h-0" data-testid="pay-from-reset">
            Вернуть {formatDateRu(def.default_pay_from)}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500" data-testid="pay-from-hint">
        {changed ? "Дату выбрали вы: ученик платит с неё." : payFromDefaultLine(def)}
      </p>
      {past && preview.status === "loading" && (
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500" role="status" data-testid="pay-from-immediate"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />Считаем…</p>
      )}
      {past && preview.status === "failed" && (
        <p className="mt-1 text-xs text-amber-900" role="alert" data-testid="pay-from-failed">{PAY_FROM_FAILED_TEXT}{onRetry && <>{" "}<button type="button" onClick={onRetry} className="font-semibold underline">Повторить</button></>}</p>
      )}
      {preview.status === "ready" && (past || said) && (
        <div className="mt-1 space-y-0.5 text-xs text-slate-800" role="status" data-testid="pay-from-immediate">
          {preview.immediate.students.length === 0 && <p className="font-medium">{PAY_FROM_NOTHING_NOW}</p>}
          {/* one student: his line only - the total would say the same again */}
          {preview.immediate.students.length === 1 && <ImmediateBlock amount={preview.immediate.students[0].amount} parts={preview.immediate.students[0].parts} text={preview.immediate.students[0].text} />}
          {preview.immediate.students.length > 1 && (
            <>
              <ul className="space-y-0.5" data-testid="pay-from-immediate-students">
                {preview.immediate.students.map((line) => <li key={line.studentId} className="break-words">{names?.get(line.studentId) ? `${names.get(line.studentId)}: ` : ""}{line.text}{line.parts.length > 0 && (
                  <ul className="mt-0.5 space-y-0.5 text-slate-700" data-testid="pay-from-immediate-parts">
                    {immediatePartRows(line.parts).map((row) => <li key={row.label} className="flex justify-between gap-3"><span className="min-w-0 break-words">{row.label}</span><span className="whitespace-nowrap tabular-nums">{row.amount}</span></li>)}
                  </ul>
                )}</li>)}
              </ul>
              {preview.immediate.total && <p className="font-semibold" data-testid="pay-from-immediate-total">{preview.immediate.total}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * «Сразу начислится» as a BLOCK, like «Что изменится» of the payment window: a light card, the title on the left and the total on the right (bold), under it a row per month - the caption left, the sum right (tabular, never wrapped).
 * Nothing but the sentence of the server when an older server sends no `parts`.
 */
function ImmediateBlock({ amount, parts, text }: { amount: number; parts: ImmediatePart[]; text: string }) {
  if (parts.length === 0) return <p className="font-medium">{text}</p>;
  return (
    <div data-testid="pay-from-immediate-block" className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">Сразу начислится</p>
        <p data-testid="pay-from-immediate-total-sum" className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900">{formatMoney(amount)}</p>
      </div>
      <ul className="mt-2 space-y-1" data-testid="pay-from-immediate-parts">
        {immediatePartRows(parts).map((row) => (
          <li key={row.label} className="flex items-baseline justify-between gap-3 text-xs text-slate-700">
            <span className="min-w-0 break-words">{row.label}</span>
            <span className="whitespace-nowrap tabular-nums">{row.amount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
