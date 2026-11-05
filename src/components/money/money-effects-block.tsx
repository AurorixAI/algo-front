"use client";

import { AlertTriangle } from "lucide-react";
import {
  effectsFailureText,
  type EffectsVariant,
  EFFECTS_LOADING_TEXT,
  EFFECTS_NONE_TEXT,
  EFFECTS_RETRY_LABEL,
  EFFECTS_TITLE,
  effectLines,
  effectsEmpty,
  type MoneyEffects,
} from "@/lib/money-effects";
import { periodClosedOf, type ClosedPurpose } from "@/lib/closed-period";
import type { EffectsPreview } from "@/lib/money-preview";
import { PeriodClosedNotice } from "./period-closed-notice";

/**
 * The lines of money of an action (the same ones the toast carries).  The pay of the teachers is a heading, a line per teacher and - only when something has to be done - a sentence of what
 * (an amber one, UX round of the owner 05.11); everything else is information.
 */
export function EffectLines({ effects, withPaid = false }: { effects: MoneyEffects; withPaid?: boolean }) {
  return (
    <ul className="space-y-1.5">
      {effectLines(effects, { withPaid }).map((line) => (
        <li key={line.key} data-testid="effect-line" className="text-sm text-slate-800">
          <p className={line.tone === "warn" && !line.note ? "font-medium text-amber-900" : undefined}>{line.text}</p>
          {line.items && line.items.length > 0 && (
            <ul className="mt-0.5 space-y-0.5 pl-3">
              {line.items.map((item) => <li key={item} className="tabular-nums">{item}</li>)}
            </ul>
          )}
          {line.after && line.after.length > 0 && (
            <ul className="mt-1 space-y-0.5" data-testid="effect-paid">
              {line.after.map((text) => <li key={text} className="tabular-nums text-slate-700">{text}</li>)}
            </ul>
          )}
          {line.note && <p className="mt-1 font-medium text-amber-900" data-testid="effect-note">{line.note}</p>}
        </li>
      ))}
    </ul>
  );
}

/** The grey bars that stand where the lines of the block will be: the same size and colour as the block itself, so nothing jumps when the answer comes (UX pack, rule 1). */
function EffectsSkeleton() {
  return (
    <div role="status" aria-label={EFFECTS_LOADING_TEXT} data-testid="money-effects-skeleton" className="space-y-1.5" aria-busy="true">
      <span className="sr-only">{EFFECTS_LOADING_TEXT}</span>
      <div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-200" />
      <div className="h-3.5 w-1/2 animate-pulse rounded bg-slate-200" />
    </div>
  );
}

/**
 * «Что изменится» in a window of confirmation (I-5, UX pack rule 1): the packs of the students and the pay of the teachers the action touches - the answer of the server to a dry run.
 *  - ONE title for every window; NEUTRAL colour; amber only when the person has to do a step after the action (a closed month: «сохраните новую сумму»); never red inside the block;
 *  - nothing changes: ONE grey line «Деньги не изменятся» and no block;
 *  - while it is asked: a skeleton of the same size and colour; a failure says so in amber and offers «Повторить» (the button of the window waits for the answer: `effectsAllowConfirm`);
 *  - a refusal «месяц закрыт» is NOT a part of the block: it is its own amber block (`PeriodClosedNotice`) with «Переоткрыть месяц», after which the dry run is asked again;
 *  - `variant="quiet"` (a transfer of a student: the window has its own part about the student's money): when nothing moves for the teachers it says NOTHING (no «Деньги не изменятся»).
 *  - The windows of a PAYMENT, its correction / cancel, a write-off and a refund do not draw this block at all (UX pack §5.1-тер, decision of the owner 05.11): they are about the student only.
 */
export function MoneyEffectsBlock({
  preview, onRetry, aboveLessonPanel = false, variant = "lesson", noneText, className = "", closedPurpose, withPaid = false,
}: {
  preview: EffectsPreview;
  onRetry: () => void;
  aboveLessonPanel?: boolean;
  variant?: EffectsVariant;
  /** What «nothing moves» says when the action has a sense of its own (a decision «Включить в зарплату» in a month without a saved sheet), instead of the common line. */
  noneText?: string;
  className?: string;
  closedPurpose?: ClosedPurpose;
  /** A decision about the pay of a lesson also says what is paid already («Уже выплачено … — до новой суммы останется …», owner only). */
  withPaid?: boolean;
}) {
  const closed = preview.status === "failed" ? periodClosedOf(preview.error) : null;
  if (closed) return <PeriodClosedNotice info={closed} aboveLessonPanel={aboveLessonPanel} onReopened={onRetry} purpose={closedPurpose} className={className} />;
  const lines = preview.status === "ready" && preview.effects !== null ? effectLines(preview.effects, { withPaid }) : [];
  const none = preview.status === "ready" && preview.effects !== null && (effectsEmpty(preview.effects) || lines.length === 0);
  const warn = lines.some((line) => line.tone === "warn");
  const failed = preview.status === "failed";
  const idle = preview.status === "idle" || (preview.status === "ready" && preview.effects === null);   // the server sent no block: nothing is claimed about the money
  if (idle) return null;
  if (none) {
    if (variant === "quiet" && !noneText) return null;
    const text = noneText ?? EFFECTS_NONE_TEXT;
    return <p data-testid="money-effects-none" data-state="ready" className={`text-sm text-slate-600 ${className}`}>{text}</p>;
  }
  const amber = warn || failed;
  const tone = amber ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50";
  return (
    <section aria-label={EFFECTS_TITLE} data-testid="money-effects" data-state={preview.status} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${tone} ${className}`}>
      {amber && <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs font-semibold text-slate-600">{EFFECTS_TITLE}</p>
        {preview.status === "loading" && <EffectsSkeleton />}
        {failed && (
          <div role="alert" className="space-y-1.5">
            <p className="text-sm font-medium text-amber-900">{effectsFailureText(preview.error)}</p>
            <button type="button" data-testid="money-effects-retry" onClick={onRetry} className="inline-flex min-h-[40px] items-center rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100 sm:min-h-[32px]">{EFFECTS_RETRY_LABEL}</button>
          </div>
        )}
        {preview.status === "ready" && preview.effects !== null && <EffectLines effects={preview.effects} withPaid={withPaid} />}
      </div>
    </section>
  );
}
