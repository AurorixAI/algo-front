"use client";

import type { LogicaError, PriceImpactMoney } from "@/lib/payments-logica";
import { normalizeWhatIf } from "@/lib/whatif";
import { tidyMoneyText } from "@/lib/money-format";
import { CORRECTION_REASON_MAX } from "@/lib/group-price";
import { Checkbox } from "@/components/ui/checkbox";
import { Notice } from "@/components/ui/notice";
import { ReasonField } from "@/components/money/reason-field";
import { WhatIfBody } from "@/components/money/whatif-table";

/**
 * The money part of «Что изменится» of a price change (Money-1 B3): the sentence of the server and EVERY student the price moves as a table «было → станет».
 */
export function PriceImpactMoneyBlock({ money, single = false }: { money: PriceImpactMoney | null | undefined; /** The window of one student's individual price. */ single?: boolean }) {
  // Money-1 B3: every student the price moves, «было → станет» in сум, in lessons and in dates (+ the next period), the individual prices apart
  const window = normalizeWhatIf(money as unknown as Record<string, unknown> | null | undefined, "price");
  if (!window || (window.items.length === 0 && window.overrides.length === 0 && !window.text)) return null;
  return <WhatIfBody window={window} testId="price-impact-money" single={single} />;
}

/**
 * The refusal «Нельзя изменить цену задним числом…» (409 `PRICE_BACKDATE_WITH_PAYMENTS`): the blocked notice with the server's sentence and who stands in the way (the first 20).
 * The ways out: forgive the debt / give the money back - or, for a typo, `CorrectionSwitch` below it.
 */
export function PriceBlockedBanner({ error }: { error: LogicaError }) {
  return (
    <Notice variant="blocked" role="alert" testId="price-blocked" title={error.message}>
      {error.students.length > 0 && <span className="break-words">{error.students.map((student) => student.student_name).join(", ")}</span>}
    </Notice>
  );
}

/**
 * Money-1 V3: the question of an unusual price in the words of the server («Вы уверены: 3 000 000 сум? Сейчас 300 000 сум») and the box that has to be ticked before «Сохранить»
 * (the warning is not skipped by habit).
 */
export function UnusualPriceConfirm({ text, checked, onChange }: { text: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="space-y-2" data-testid="price-unusual">
      <Notice variant="warning" compact>{tidyMoneyText(text)}</Notice>
      <label className="flex min-h-10 items-center gap-2 text-sm text-slate-800">
        <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} data-testid="price-unusual-ok" />
        Да, цена верная
      </label>
    </div>
  );
}

/** Money-1 V3: «Исправляю опечатку в цене» - the way out of a blocked backdated price for a typo; on, it asks the reason (3..200). */
export function CorrectionSwitch({ on, onChange, reason = "", onReason, error = null }: { on: boolean; onChange: (next: boolean) => void; /** Absent: the window has its own reason field (an individual price: the reason of the price is the reason of the correction). */ reason?: string; onReason?: (next: string) => void; error?: string | null }) {
  return (
    <div className="space-y-2" data-testid="price-correction">
      <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-slate-800">
        <Checkbox checked={on} onChange={(event) => onChange(event.target.checked)} data-testid="price-correction-on" />
        Исправляю опечатку в цене
      </label>
      {on && onReason && (
        <ReasonField id="price-correction-reason" label="Причина исправления" value={reason} onChange={onReason} required error={error} maxLength={CORRECTION_REASON_MAX} rows={2} placeholder="Например: ошибся в нуле" />
      )}
    </div>
  );
}
