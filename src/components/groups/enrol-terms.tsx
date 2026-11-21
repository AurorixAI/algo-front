"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { formatDateRu, formatDayMonthRu } from "@/lib/business-time";
import { formatMoneyInput } from "@/lib/money-format";
import { payFromRange, type PayFromDefault } from "@/lib/pay-from";
import { isOwnPrice, payFromReason, termsLine, type OwnPriceError } from "@/lib/enrol-terms";
import { TAP_ZONE } from "@/lib/tap-zone";
import { DateInput } from "@/components/ui/date-input";
import { MoneyField, PRICE_FIELD, PRICE_LABEL, ReasonField } from "@/components/payments/price-fields";
import { OpeningToggle } from "@/components/payments/opening-balance-fields";
import type { OpeningFormValues } from "@/lib/payments-logica";

export interface EnrolTermsOpening {
  on: boolean;
  onChange: (value: boolean) => void;
  values: OpeningFormValues;
  onValues: (next: OpeningFormValues) => void;
  today: string;
  accountingStart: string | null;
  needsReason: boolean;
}

/**
 * «Условия» of a window of enrolment as ONE line - «Оплата с 19 ноября, по цене группы» and, muted, the reason of the day (the server's words) - and «Изменить», which opens the rare fields in place:
 * «Оплата с» (with «По умолчанию 19.11» as the way back), «Цена в месяц» (an own price) and, only when the price differs from the group's, the required «Почему своя цена»; the opening balance only where
 * it is offered.  After a change the line says the new state and the button stays.  A role without the right to money never gets this block (its caller draws nothing).
 */
export function EnrolTerms({ idPrefix, payDef, payFrom, onPayFrom, accountingStart, priceLabel, groupAmount, amount, reason, onAmount, onReason, priceError = null, opening = null, openSignal = 0, onOpenChange, showPayFrom = true, whyNote = null }: {
  idPrefix: string;
  /** the server's day by default; null while it is not known (the line then has no day) */
  payDef: PayFromDefault | null;
  payFrom: string;
  onPayFrom: (next: string) => void;
  accountingStart: string | null;
  /** «Цена в месяц» / «Цена пакета» */
  priceLabel: string;
  /** the price of the group: a sum, `null` - not set */
  groupAmount: number | null;
  amount: string;
  reason: string;
  onAmount: (text: string) => void;
  onReason: (text: string) => void;
  /** the refusal of the own price: stands AT the field it is about (the panel opens itself and the field takes the focus) */
  priceError?: OwnPriceError | null;
  opening?: EnrolTermsOpening | null;
  /** a refusal of one of these fields changes this number: the panel opens so the field is in view */
  openSignal?: number;
  /** the window hides what is not needed while the fields are open (the list of students) */
  onOpenChange?: (open: boolean) => void;
  /** false: no «Оплата с» (a transfer has its own day) */
  showPayFrom?: boolean;
  /** PAY-TAILS Б2.5 (frame 14): the muted line of the server about the day that another group moved («сегодня ученик ещё числился в «Математике 7»»); it stands in place of the reason of the default day. */
  whyNote?: string | null;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (openSignal > 0) setOpen(true); }, [openSignal]);
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);
  const panelId = useId();
  // a refused own price: the field is in view and ready to be typed in
  useEffect(() => {
    if (!priceError || !open) return;
    document.getElementById(`${idPrefix}-price-${priceError.field === "reason" ? "reason" : "amount"}`)?.focus();
  }, [priceError, open, idPrefix]);
  const own = isOwnPrice(amount, groupAmount);
  const dayKnown = showPayFrom && payDef !== null;
  const changed = dayKnown && payFrom !== (payDef as PayFromDefault).default_pay_from;
  const range = payDef ? payFromRange(payDef.today, accountingStart) : null;
  const line = termsLine({ payFrom: dayKnown ? payFrom : "", today: payDef?.today, groupHasPrice: groupAmount !== null, ownAmount: own ? amount : "", opening: Boolean(opening?.on) });
  const why: ReactNode = dayKnown ? (changed ? "дату выбрали вы" : whyNote ?? payFromReason(payDef?.text)) : null;
  return (
    <section aria-label="Условия" data-testid="enrol-terms" className="border-t border-slate-100 px-5 py-3 max-sm:px-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 text-sm text-slate-900">
          <p data-testid="enrol-terms-line" className="[overflow-wrap:anywhere]">{line || "Условия по умолчанию"}</p>
          {why && <p data-testid="enrol-terms-why" className="mt-0.5 text-xs text-slate-600 [overflow-wrap:anywhere]">{why}</p>}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          data-testid="enrol-terms-toggle"
          className="inline-flex min-h-8 shrink-0 items-center rounded-md px-1 text-sm font-semibold text-primary-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary-500 max-sm:min-h-10"
        >
          {open ? "Свернуть" : "Изменить"}
        </button>
      </div>
      {open && (
        <div id={panelId} data-testid="enrol-terms-edit" className="mt-3 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          {dayKnown && range && (
            <div data-testid="pay-from">
              <label htmlFor={`${idPrefix}-pay-from`} className={PRICE_LABEL}>Оплата с</label>
              <DateInput id={`${idPrefix}-pay-from`} value={payFrom} min={range.min} max={range.max} onChange={onPayFrom} className={PRICE_FIELD} />
              <p className="mt-1.5 text-xs text-slate-600">
                По умолчанию{" "}
                {changed ? (
                  <button type="button" data-testid="pay-from-reset" aria-label={`Вернуть дату по умолчанию ${formatDateRu((payDef as PayFromDefault).default_pay_from)}`} onClick={() => onPayFrom((payDef as PayFromDefault).default_pay_from)} className={`${TAP_ZONE} font-semibold text-primary-700 hover:underline`}>
                    {formatDayMonthRu((payDef as PayFromDefault).default_pay_from)}
                  </button>
                ) : <span className="font-semibold text-slate-800">{formatDayMonthRu((payDef as PayFromDefault).default_pay_from)}</span>}
              </p>
            </div>
          )}
          <div>
            <MoneyField id={`${idPrefix}-price-amount`} label={priceLabel} value={amount} onChange={onAmount} placeholder={groupAmount !== null ? formatMoneyInput(groupAmount) : "Сумма"} error={priceError?.field === "amount" ? priceError.text : null} />
            <p className="mt-1.5 text-xs text-slate-600">{groupAmount !== null ? `Цена группы — ${formatMoneyInput(groupAmount)}` : "У группы нет цены"}</p>
          </div>
          {own && (
            <div className="col-span-full">
              <ReasonField id={`${idPrefix}-price-reason`} value={reason} onChange={onReason} label="Почему своя цена" error={priceError?.field === "reason" ? priceError.text : null} />
            </div>
          )}
          {opening && (
            <div className="col-span-full border-t border-slate-100 pt-2" data-testid="enrol-terms-opening">
              <OpeningToggle idPrefix={`${idPrefix}-opening`} enabled={opening.on} onEnabled={opening.onChange} values={opening.values} onChange={opening.onValues} enrolDate={opening.today} today={opening.today} accountingStart={opening.accountingStart} needsReason={opening.needsReason} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
