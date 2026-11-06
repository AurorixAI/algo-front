"use client";

import { ShieldAlert } from "lucide-react";
import type { LogicaError, PriceImpactMoney } from "@/lib/payments-logica";
import { normalizeWhatIf } from "@/lib/whatif";
import { WhatIfBody } from "@/components/money/whatif-table";

/**
 * The money part of «Что изменится» of a price change (Money-1 B3): the sentence of the server and EVERY student the price moves as a table «было → станет».
 */
export function PriceImpactMoneyBlock({ money }: { money: PriceImpactMoney | null | undefined }) {
  // Money-1 B3: every student the price moves, «было → станет» in сум, in lessons and in dates (+ the next period), the individual prices apart
  const window = normalizeWhatIf(money as unknown as Record<string, unknown> | null | undefined, "price");
  if (!window || (window.items.length === 0 && window.overrides.length === 0 && !window.text)) return null;
  return <WhatIfBody window={window} testId="price-impact-money" />;
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
