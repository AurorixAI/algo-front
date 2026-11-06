"use client";

import { EFFECTS_LOADING_TEXT, EFFECTS_TITLE, effectsFailureText, EFFECTS_RETRY_LABEL } from "@/lib/money-effects";
import type { EffectsPreview } from "@/lib/money-preview";
import { CARRIED_NONE_TEXT, carriedOf, carriedRows } from "@/lib/dry-run";
import { tidyMoneyText } from "@/lib/money-format";
import { Button } from "@/components/ui/button";

/**
 * «Что изменится» before a transfer is confirmed (UX pack №15; the principle of the owner: the window shows only its own - the money OF THE STUDENT): the dry run of the same request
 * (`mode=transfer&dry_run=true`) - the sentences the server says about the payments and debts that go to the new group (`carried`, `carry_after.text`; its own words, with the name of the
 * student when there are several).  The pay of the teachers is NOT here: it is told in «Зарплата».  While it is asked the block is a skeleton of the same size; a failure offers «Повторить»
 * (the button of the window waits for the answer).
 */
export function TransferPreviewBlock({ preview, onRetry, names, className = "mx-5 mb-4" }: { preview: EffectsPreview; onRetry: () => void; /** id → name of the students being moved: with several of them each line starts with the name. */ names?: ReadonlyMap<string, string> | null; /** The outer margin: a window without its own padding keeps the default, the footer of the drawer passes "". */ className?: string }) {
  // re-audit В2: the window does NOT scroll itself to the block (it cut the card above it); the block stands under the list, always in view
  if (preview.status === "idle") return null;
  const shell = `${className} rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3`;
  if (preview.status === "loading") {
    return (
      <section aria-label={EFFECTS_TITLE} data-testid="transfer-preview" data-state="loading" aria-busy="true" className={shell}>
        <h3 className="text-xs font-semibold text-slate-600">{EFFECTS_TITLE}</h3>
        <div role="status" aria-label={EFFECTS_LOADING_TEXT} className="mt-2 space-y-1.5">
          <span className="sr-only">{EFFECTS_LOADING_TEXT}</span>
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-200" />
          <div className="h-3.5 w-1/2 animate-pulse rounded bg-slate-200" />
        </div>
      </section>
    );
  }
  if (preview.status === "failed") {
    return (
      <section aria-label={EFFECTS_TITLE} data-testid="transfer-preview" data-state="failed" className={`${className} rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3`}>
        <h3 className="text-xs font-semibold text-slate-600">{EFFECTS_TITLE}</h3>
        <div role="alert" className="mt-1.5 space-y-1.5">
          <p className="text-sm font-medium text-amber-900">{effectsFailureText(preview.error)}</p>
          <Button type="button" data-testid="transfer-preview-retry" onClick={onRetry} variant="secondary" size="sm">{EFFECTS_RETRY_LABEL}</Button>
        </div>
      </section>
    );
  }
  const carried = carriedOf(preview.answer, names);
  return (
    <section aria-label={EFFECTS_TITLE} data-testid="transfer-preview" data-state="ready" className={shell}>
      <h3 className="text-xs font-semibold text-slate-600">{EFFECTS_TITLE}</h3>
      {carried.length === 0 ? (
        <p className="mt-1.5 text-sm text-slate-700" data-testid="transfer-carried-none">{CARRIED_NONE_TEXT}</p>
      ) : (
        <ul className="mt-1.5 space-y-1" data-testid="transfer-carried">
          {carried.flatMap((line, index) => carriedRows(line.message).map((row, part) => <li key={`${line.code}-${index}-${part}`} className="text-sm text-slate-800">{tidyMoneyText(row)}</li>))}
        </ul>
      )}
    </section>
  );
}
