"use client";

import { Info, Loader2 } from "lucide-react";
import { MoneyEffectsBlock } from "@/components/money/money-effects-block";
import { effectsFailureText, EFFECTS_RETRY_LABEL, TRANSFER_LOADING_TEXT } from "@/lib/money-effects";
import type { EffectsPreview } from "@/lib/money-preview";
import { CARRIED_NONE_TEXT, CARRIED_TITLE, carriedOf } from "@/lib/dry-run";

/**
 * R3 #15: «Что переедет в новую группу» before a transfer is confirmed - the dry run of the same request (`mode=transfer&dry_run=true`): the payments and debts the server
 * carries over (`carried`, its own words) and what that does to the packs and the saved sheets.  While it is asked the block says so; a failure offers «Повторить»
 * (the button of the window waits for the answer).
 */
export function TransferPreviewBlock({ preview, onRetry, names }: { preview: EffectsPreview; onRetry: () => void; /** id → name of the students being moved: with several of them each line starts with the name. */ names?: ReadonlyMap<string, string> | null }) {
  if (preview.status === "idle") return null;
  if (preview.status !== "ready") {
    return (
      <section aria-label={CARRIED_TITLE} data-testid="transfer-preview" data-state={preview.status} className="mx-5 mb-4 flex items-start gap-2.5 rounded-xl border border-primary-100 bg-primary-50/60 px-3 py-2.5">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-semibold text-slate-600">{CARRIED_TITLE}</p>
          {preview.status === "loading" ? (
            <p role="status" className="flex items-center gap-1.5 text-sm text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />{TRANSFER_LOADING_TEXT}</p>
          ) : (
            <div role="alert" className="space-y-1.5">
              <p className="text-sm font-medium text-rose-700">{effectsFailureText(preview.error)}</p>
              <button type="button" data-testid="transfer-preview-retry" onClick={onRetry} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">{EFFECTS_RETRY_LABEL}</button>
            </div>
          )}
        </div>
      </section>
    );
  }
  const carried = carriedOf(preview.answer, names);
  return (
    <div className="mx-5 mb-4 space-y-2" data-testid="transfer-preview" data-state="ready">
      <section aria-label={CARRIED_TITLE} className="flex items-start gap-2.5 rounded-xl border border-primary-100 bg-primary-50/60 px-3 py-2.5">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-semibold text-slate-600">{CARRIED_TITLE}</p>
          {carried.length === 0 ? (
            <p className="text-sm text-slate-700" data-testid="transfer-carried-none">{CARRIED_NONE_TEXT}</p>
          ) : (
            <ul className="space-y-0.5" data-testid="transfer-carried">
              {carried.map((line, index) => <li key={`${line.code}-${index}`} className="text-sm text-slate-800">{line.message}</li>)}
            </ul>
          )}
        </div>
      </section>
      <MoneyEffectsBlock preview={preview} onRetry={onRetry} variant="payment" />
    </div>
  );
}
