"use client";

import { AlertTriangle, ShieldAlert } from "lucide-react";
import { priceItemLine, priceMoneyLines, type LogicaError, type PriceImpactMoney } from "@/lib/payments-logica";

/**
 * The money part of «Что изменится» of a price change: «С этого дня у 2 учеников появится долг: 140 000 сум.» / «У 1 ученика аванс
 * купит меньше дней…» and, below, who it is (the first ones, with the numbers).  The sheets that go «Есть изменения» are counted here too.
 */
export function PriceImpactMoneyBlock({ money }: { money: PriceImpactMoney | null | undefined }) {
  const lines = priceMoneyLines(money, 0);
  const items = (money?.items ?? []).filter((item) => item.debt_after !== item.debt_before || item.advance_after !== item.advance_before || item.paid_until_after !== item.paid_until_before);
  if (lines.length === 0 && items.length === 0) return null;
  return (
    <div className="space-y-1.5" data-testid="price-impact-money">
      {lines.map((line) => (
        <p key={line} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{line}</span>
        </p>
      ))}
      {items.length > 0 && (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto pl-1 text-slate-600" aria-label="У кого изменятся деньги">
          {items.slice(0, 12).map((item) => <li key={item.membership_id}>{priceItemLine(item)}</li>)}
          {items.length > 12 && <li className="text-slate-400">и ещё {items.length - 12}</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * The refusal «Нельзя изменить цену задним числом…» (409 `PRICE_BACKDATE_WITH_PAYMENTS`): a red banner with the server's sentence and
 * who stands in the way (the first 20).  The way out is told in it: forgive the debt or give the money back.
 */
export function PriceBlockedBanner({ error }: { error: LogicaError }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs text-rose-900" data-testid="price-blocked">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">{error.message}</p>
        {error.students.length > 0 && <p className="mt-1">{error.students.map((student) => student.student_name).join(", ")}</p>}
      </div>
    </div>
  );
}
