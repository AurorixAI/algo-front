"use client";

import { formAllowsConfirm, type EffectsPreview } from "@/lib/money-preview";
import type { EffectsVariant } from "@/lib/money-effects";
import { useFormMoneyPreview } from "@/lib/use-money-preview";
import { MoneyEffectsBlock } from "./money-effects-block";

/**
 * R3 m7: the dry run of a FORM that moves money (a write-off, a refund): `key` is everything the real request will carry (null while the form cannot be sent - nothing to ask), `load` is
 * the dry run of the same body.  One hook for the state and the answer, one block for the screen; `allowed` is the button of the form.
 */
export function useDryRunForm(key: string | null, load: (signal: AbortSignal) => Promise<unknown>): { key: string | null; preview: EffectsPreview; retry: () => void; allowed: boolean } {
  const { preview, retry } = useFormMoneyPreview(key, load);
  return { key, preview, retry, allowed: formAllowsConfirm(key, preview) };
}

export function FormEffects({ form, variant = "payment" }: { form: { key: string | null; preview: EffectsPreview; retry: () => void }; variant?: EffectsVariant }) {
  return form.key === null ? null : <MoneyEffectsBlock preview={form.preview} onRetry={form.retry} variant={variant} />;
}
