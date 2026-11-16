"use client";

import { Disclosure } from "@/components/ui/disclosure";
import { Button } from "@/components/ui/button";
import { EFFECTS_LOADING_TEXT, EFFECTS_RETRY_LABEL, effectsFailureText } from "@/lib/money-effects";
import type { EffectsPreview } from "@/lib/money-preview";
import { tidyMoneyText } from "@/lib/money-format";
import { FORGIVENESS_LABEL, forgivenessOf } from "@/lib/forgiveness";

/** Money-2 Э6: under the amount of a forgiveness - «Зарплата преподавателя · +125 000 сум» (the server's sum), the sentence of the server under «Подробнее».  The administrator gets nothing (the server sends none). */
export function ForgivenessLine({ preview, onRetry, className = "" }: { preview: EffectsPreview; onRetry: () => void; className?: string }) {
  if (preview.status === "idle") return null;
  if (preview.status === "loading") return <p role="status" data-testid="forgiveness-loading" className={`text-xs text-slate-500 ${className}`}>{EFFECTS_LOADING_TEXT}</p>;
  if (preview.status === "failed") {
    return (
      <div role="alert" data-testid="forgiveness-failed" className={`space-y-1 text-xs ${className}`}>
        <p className="font-medium text-amber-900">{effectsFailureText(preview.error)}</p>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>{EFFECTS_RETRY_LABEL}</Button>
      </div>
    );
  }
  const forgiveness = forgivenessOf(preview.answer);
  if (!forgiveness) return null;
  return (
    <div data-testid="forgiveness" className={`rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 ${className}`}>
      <p className="flex items-baseline justify-between gap-x-3 text-sm text-slate-800" data-testid="forgiveness-row">
        <span className="min-w-0">{FORGIVENESS_LABEL}</span>
        {forgiveness.value && <span className="shrink-0 whitespace-nowrap text-right font-semibold tabular-nums">{forgiveness.value}</span>}
      </p>
      {forgiveness.text && <Disclosure testId="forgiveness-full"><p className="[overflow-wrap:anywhere]">{tidyMoneyText(forgiveness.text)}</p></Disclosure>}
    </div>
  );
}
