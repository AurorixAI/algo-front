"use client";

import { EFFECTS_LOADING_TEXT, EFFECTS_TITLE, effectsFailureText, EFFECTS_RETRY_LABEL } from "@/lib/money-effects";
import type { EffectsPreview } from "@/lib/money-preview";
import { carriedOf, carriedRows, CLOSING_PRICES_SHOWN, closingPricesOf } from "@/lib/dry-run";
import { useState } from "react";
import { Notice } from "@/components/ui/notice";
import { tidyMoneyText } from "@/lib/money-format";
import { serverPhraseShown } from "@/lib/enrol-labels";
import { Button } from "@/components/ui/button";
import { EffectsSections } from "@/components/money/effects-sections";
import { effectsEmpty, effectsOfAnswer } from "@/lib/transfer-effects";
import { othersOf, recalcOf } from "@/lib/paytails-contract";
import { OtherGroupLines, RecalcLines } from "@/components/money/recalc-lines";
import { isStaleRefusal, refusedInWords, REFRESH_LABEL } from "@/lib/money-preview";

/**
 * «Что изменится» before a transfer is confirmed (UX pack №15; the principle of the owner: the window shows only its own - the money OF THE STUDENT): the dry run of the same request
 * (`mode=transfer&dry_run=true`) - the sentences the server says about the payments and debts that go to the new group (`carried`, `carry_after.text`; its own words, with the name of the
 * student when there are several).  The pay of the teachers is NOT here: it is told in «Зарплата».  While it is asked the block is a skeleton of the same size; a failure offers «Повторить»
 * (the button of the window waits for the answer).
 */
export function TransferPreviewBlock({ preview, onRetry, onRefresh, names, target = null, className = "mx-5 mb-4" }: { preview: EffectsPreview; onRetry: () => void; /** the action of a stale refusal (409): the window asks the page for fresh data */ onRefresh?: () => void; /** id → name of the students being moved: with several of them each line starts with the name. */ names?: ReadonlyMap<string, string> | null; /** The group the student goes to (the window of a transfer): the block names it once. */ target?: string | null; /** The outer margin: a window without its own padding keeps the default, the footer of the drawer passes "". */ className?: string }) {
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
          {isStaleRefusal(preview.error) ? <Button type="button" data-testid="transfer-preview-refresh" onClick={onRefresh ?? (() => window.location.reload())} variant="secondary" size="sm">{REFRESH_LABEL}</Button>
            : !refusedInWords(preview.error) && <Button type="button" data-testid="transfer-preview-retry" onClick={onRetry} variant="secondary" size="sm">{EFFECTS_RETRY_LABEL}</Button>}
        </div>
      </section>
    );
  }
  // Money-2 Э1: a server that sends `effects` says «что перейдёт / останется / закончится» itself - the old sentences of `carried` are not said next to it (one fact, once)
  const effects = effectsOfAnswer(preview.answer);
  // PAY-TAILS Б2.4: «что было → что станет» of the group the student leaves (`recalc`) and the sentence about the new group (`others`: «Начисление в «Б» начнётся с 23.11») - the server's lines, over the sections
  const recalc = recalcOf(preview.answer);
  const others = othersOf(preview.answer);
  const money = recalc !== null || others.length > 0;
  if (effects) {
    if (effectsEmpty(effects) && !money) return null;
    return (
      <section aria-label={EFFECTS_TITLE} data-testid="transfer-preview" data-state="ready" className={shell}>
        <h3 className="text-xs font-semibold text-slate-600">{EFFECTS_TITLE}</h3>
        <div className="mt-1.5 space-y-2.5">
          <RecalcLines block={recalc} testId="transfer-recalc" />
          <OtherGroupLines lines={others} testId="transfer-others" />
          {!effectsEmpty(effects) && <EffectsSections effects={effects} target={target} />}
        </div>
      </section>
    );
  }
  const carried = carriedOf(preview.answer, names);
  const closing = closingPricesOf(preview.answer, names);
  // the server said nothing about the money of this move: the window says nothing too (it never claims what the server did not - LESSONS 143)
  if (carried.length === 0 && closing.length === 0 && !money) return null;
  return (
    <section aria-label={EFFECTS_TITLE} data-testid="transfer-preview" data-state="ready" className={shell}>
      <h3 className="text-xs font-semibold text-slate-600">{EFFECTS_TITLE}</h3>
      {money && <div className="mt-1.5 space-y-2.5"><RecalcLines block={recalc} testId="transfer-recalc" /><OtherGroupLines lines={others} testId="transfer-others" /></div>}
      {carried.length > 0 && (
        <ul className="mt-1.5 space-y-1" data-testid="transfer-carried">
          {carried.flatMap((line, index) => carriedRows(line.message).map((row, part) => <li key={`${line.code}-${index}-${part}`} className="text-sm text-slate-800">{serverPhraseShown(tidyMoneyText(row))}</li>))}
        </ul>
      )}
      {closing.length > 0 && <ClosingPrices lines={closing} />}
    </section>
  );
}

/** Money-1 V: one amber line per individual price that does not follow the student; more than five - «и ещё N» that opens the rest.  A warning, not a fork: nothing to tick. */
function ClosingPrices({ lines }: { lines: Array<{ text: string }> }) {
  const [all, setAll] = useState(false);
  const shown = all ? lines : lines.slice(0, CLOSING_PRICES_SHOWN);
  const rest = lines.length - shown.length;
  return (
    <div className="mt-2 space-y-1.5" data-testid="transfer-closing-prices">
      {shown.map((line, index) => <Notice key={`${index}-${line.text}`} variant="warning" compact testId="transfer-closing-price">{serverPhraseShown(line.text)}</Notice>)}
      {rest > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => setAll(true)} data-testid="transfer-closing-more">и ещё {rest}</Button>}
    </div>
  );
}
