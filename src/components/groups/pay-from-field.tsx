"use client";

import { Loader2 } from "lucide-react";
import { formatDateRu } from "@/lib/business-time";
import { PAY_FROM_LABEL, PAY_FROM_MANY_PAST, PAY_FROM_NOTHING_NOW, payFromDefaultLine, payFromIsPast, payFromRange, type PayFromDefault } from "@/lib/pay-from";
import type { PayFromPreview } from "@/lib/use-pay-from";
import { DateInput } from "@/components/ui/date-input";
import { PRICE_FIELD, PRICE_LABEL } from "@/components/payments/price-fields";

/**
 * Money-1 B1 - «Оплата с» of a student who is added to a group.  With access to money: the date, the first lesson of the group by default, and - for a day in the past - what is charged at once.
 * Without it the field is NOT here (not blocked, absent): one quiet line says from which day the student is charged.  A transfer has no such field (the server refuses it): the caller draws nothing.
 */
export function PayFromField({ idPrefix, moneyRight, def, value, onChange, accountingStart, preview, many = false }: {
  idPrefix: string;
  moneyRight: boolean;
  def: PayFromDefault | null;
  value: string;
  onChange: (next: string) => void;
  accountingStart: string | null;
  /** The dry run of the add of ONE student from a past day. */
  preview: PayFromPreview;
  /** More than one student is chosen: one day for all, no sum in advance. */
  many?: boolean;
}) {
  if (!def) return null;
  if (!moneyRight) {
    return <p className="text-xs text-slate-600" data-testid="pay-from-line">{payFromDefaultLine(def)}</p>;
  }
  const range = payFromRange(def.today, accountingStart);
  const past = payFromIsPast(value, def);
  const changed = value !== def.default_pay_from;
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
      {past && !many && (
        <p className="mt-1 text-xs font-medium text-slate-800" role="status" data-testid="pay-from-immediate">
          {preview.status === "loading" && <span className="inline-flex items-center gap-1.5 font-normal text-slate-500"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />Считаем…</span>}
          {preview.status === "ready" && (preview.text ?? PAY_FROM_NOTHING_NOW)}
        </p>
      )}
      {past && many && <p className="mt-1 text-xs text-slate-600" data-testid="pay-from-many">{PAY_FROM_MANY_PAST}</p>}
    </div>
  );
}
