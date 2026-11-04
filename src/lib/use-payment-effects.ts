import { useMemo, useRef } from "react";
import { orgApi } from "./api";
import { paymentDraft } from "./dry-run";
import { tillAllowsConfirm, tillNotice, type EffectsPreview } from "./money-preview";
import type { PaymentFormValues } from "./payments-ledger";
import { useFormMoneyPreview } from "./use-money-preview";

/**
 * R3 #15: what the payment being typed will do to the packs of the students and the saved sheets - the dry run of the SAME body the real request will send (no Idempotency-Key),
 * asked once the form can be sent and has stood still; `key` is null (nothing to ask, nothing to show) while the form cannot be sent.  «Внести» waits for the answer; a failed or an
 * `unavailable` calculation lets it go (`tillAllowsConfirm`, `tillNotice` of `money-preview.ts`).
 */
export function usePaymentEffects(input: {
  active: boolean;
  kind: "create" | "replace";
  membershipId: string | null;
  paymentId: string | null;
  values: PaymentFormValues;
  today: string;
}): { key: string | null; preview: EffectsPreview; retry: () => void; allows: boolean; notice: string | null } {
  const { active, kind, membershipId, paymentId, values, today } = input;
  const draft = useMemo(() => (active && membershipId ? paymentDraft(values, today, kind) : null), [active, membershipId, values, today, kind]);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const { preview, retry } = useFormMoneyPreview(draft?.key ?? null, (signal) => {
    const body = draftRef.current?.body;
    if (!body || !membershipId) return Promise.reject(new Error("no draft"));
    return kind === "replace" && paymentId ? orgApi.dryRunReplacePayment(paymentId, body, signal) : orgApi.dryRunCreatePayment(membershipId, body, signal);
  });
  const key = draft?.key ?? null;
  return { key, preview, retry, allows: tillAllowsConfirm(key, preview), notice: tillNotice(key, preview) };
}
