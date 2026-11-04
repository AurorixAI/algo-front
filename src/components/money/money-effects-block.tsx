"use client";

import { AlertTriangle, Info, Loader2 } from "lucide-react";
import {
  effectsFailureText,
  effectsFailureSoftText,
  EFFECTS_LOADING_TEXT,
  EFFECTS_NONE_TEXT,
  EFFECTS_RETRY_LABEL,
  EFFECTS_TITLE,
  effectLines,
  effectsEmpty,
  type MoneyEffects,
} from "@/lib/money-effects";
import { periodClosedOf } from "@/lib/closed-period";
import type { EffectsPreview } from "@/lib/money-preview";
import { PeriodClosedNotice } from "./period-closed-notice";

/** The lines of money of a done action (the toast and the note under a form use the same lines). */
export function EffectLines({ effects }: { effects: MoneyEffects }) {
  return (
    <ul className="space-y-0.5">
      {effectLines(effects).map((line) => (
        <li key={line.key} className={`text-sm ${line.tone === "warn" ? "font-medium text-amber-900" : "text-slate-800"}`}>{line.text}</li>
      ))}
    </ul>
  );
}

/**
 * «Что будет с деньгами» in a window of confirmation (I-5): the packs of the students and the saved sheets the action touches - the answer of the server to a dry run.
 * While it is asked the block says so; when it fails it says why and offers «Повторить» (the button of the window waits for the answer: `effectsAllowConfirm`).
 * A refusal «месяц закрыт» is the same sentence and the button «Переоткрыть месяц» of `PeriodClosedNotice`, after which the dry run is asked again.
 */
export function MoneyEffectsBlock({
  preview, onRetry, aboveLessonPanel = false, blocking = true, className = "",
}: {
  preview: EffectsPreview;
  onRetry: () => void;
  aboveLessonPanel?: boolean;
  /** false: the action does not wait for this block (a payment at the till) - a failure says the action is still possible. */
  blocking?: boolean;
  className?: string;
}) {
  if (preview.status === "idle") return null;
  if (preview.status === "ready" && preview.effects === null) return null;      // the server sent no block: nothing is claimed about the money
  const closed = preview.status === "failed" ? periodClosedOf(preview.error) : null;
  const none = preview.status === "ready" && preview.effects !== null && effectsEmpty(preview.effects);
  const warn = preview.status === "ready" && preview.effects !== null && effectLines(preview.effects).some((line) => line.tone === "warn");
  const tone = closed || warn ? "border-amber-200 bg-amber-50" : none ? "border-slate-200 bg-slate-50" : "border-primary-100 bg-primary-50/60";
  return (
    <section aria-label={EFFECTS_TITLE} data-testid="money-effects" data-state={preview.status} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${tone} ${className}`}>
      {closed || warn ? <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-semibold text-slate-600">{EFFECTS_TITLE}</p>
        {preview.status === "loading" && (
          <p role="status" className="flex items-center gap-1.5 text-sm text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />{EFFECTS_LOADING_TEXT}</p>
        )}
        {preview.status === "failed" && (closed ? (
          <PeriodClosedNotice info={closed} aboveLessonPanel={aboveLessonPanel} onReopened={onRetry} />
        ) : (
          <div role="alert" className="space-y-1.5">
            <p className="text-sm font-medium text-rose-700">{blocking ? effectsFailureText(preview.error) : effectsFailureSoftText(preview.error)}</p>
            <button type="button" data-testid="money-effects-retry" onClick={onRetry} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">{EFFECTS_RETRY_LABEL}</button>
          </div>
        ))}
        {preview.status === "ready" && preview.effects !== null && (none ? <p className="text-sm text-slate-700">{EFFECTS_NONE_TEXT}</p> : <EffectLines effects={preview.effects} />)}
      </div>
    </section>
  );
}
