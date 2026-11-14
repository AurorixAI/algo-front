import { orgApi } from "./api";
import { DRY_RUN_REASON } from "./dry-run";
import { effectsWhyOff, formAllowsConfirm } from "./money-preview";
import { buildPaymentPayload, validatePaymentForm, type PaymentFormValues } from "./payments-ledger";
import type { EffectsPreview } from "./money-preview";
import { useFormMoneyPreview } from "./use-money-preview";

/**
 * Money-1 Г-4б: «Исправить оплату» asks the dry run of the correction - the form as it stands, the reason is not needed for it - and its «Что изменится» (a debt in another group, the pay of
 * the teachers: the server's own sentence) stands BEFORE the button.  `draft` null: the form cannot be sent yet, nothing is asked.  `why` is the reason the button waits (null: it may be pressed).
 */
export function useReplaceEffects({ payment, active, values, today }: { payment: { id: string } | null; active: boolean; values: PaymentFormValues; today: string }): {
  draft: string | null; preview: EffectsPreview; retry: () => void; why: string | null;
} {
  const draft = payment && active && validatePaymentForm(values, today) === null ? JSON.stringify(buildPaymentPayload(values)) : null;
  const { preview, retry } = useFormMoneyPreview(draft, (signal) => orgApi.replacePayment(payment!.id, { ...buildPaymentPayload(values), reason: DRY_RUN_REASON }, undefined, { dryRun: true, signal }));
  return { draft, preview, retry, why: formAllowsConfirm(draft, preview) ? null : effectsWhyOff(preview) };
}
