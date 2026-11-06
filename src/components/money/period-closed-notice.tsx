"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { canManageMoney, REOPEN_MONTH_LABEL } from "@/lib/money-effects";
import {
  REOPEN_EXPLAIN,
  REOPEN_REASON_LABEL,
  REOPEN_REASON_PLACEHOLDER,
  canReopenFrom,
  periodClosedText,
  reopenErrorText,
  type ClosedPurpose,
  type PeriodClosedInfo,
} from "@/lib/closed-period";
import { REASON_MAX } from "@/lib/payments";
import { useReopenMonth } from "@/lib/use-reopen-month";
import { useAuthStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

/**
 * Money-1 A1 + UX pack rule 2 / №27: the refusal «месяц закрыт» (409 `PERIOD_CLOSED`, a pause's 422 `PAUSE_LOCKED`) in the window of a lesson / a pause / a decision.  It is its OWN amber block
 * (not red, not under «Что изменится»): «Октябрь у Эргашева К. закрыт (зарплата сохранена 03.10.2026). Чтобы изменить урок, переоткройте месяц.» and - for the owner and an administrator with the
 * money access - the button «Переоткрыть месяц» for exactly that teacher and month.  The button opens the reason and the confirmation INSIDE the block (no window over a window); after the
 * reopening `onReopened` runs: the window repeats what it was asked to do (or asks the person to).  Everybody else reads the sentence and goes to the owner.
 */
export function PeriodClosedNotice({
  info, onReopened, purpose = "lesson", className = "",
}: {
  info: PeriodClosedInfo;
  onReopened: () => void;
  /** Kept for the callers that put the notice over a lesson panel: the form is inside the block now, so the layer does not matter. */
  aboveLessonPanel?: boolean;
  /** What the person wanted to do - the second sentence says it («Чтобы изменить урок, …»). */
  purpose?: ClosedPurpose;
  className?: string;
}) {
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);
  const allowed = canReopenFrom(info, canManageMoney(user));
  const text = periodClosedText(info, { canReopen: allowed, purpose });
  return (
    <div role="alert" data-testid="period-closed" className={`space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 ${className}`}>
      <p className="flex items-start gap-2 text-sm text-amber-900">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <span className="min-w-0"><span className="font-semibold" data-testid="period-closed-head">{text.head}</span>{text.advice ? <> <span data-testid="period-closed-advice">{text.advice}</span></> : null}</span>
      </p>
      {allowed && !open && (
        <Button type="button" data-testid="period-closed-reopen" onClick={() => setOpen(true)} variant="secondary" size="md">{REOPEN_MONTH_LABEL}</Button>
      )}
      {allowed && open && <ReopenInline info={info} onClose={() => setOpen(false)} onReopened={() => { setOpen(false); onReopened(); }} />}
    </div>
  );
}

/**
 * UX pack №27: the reason and the confirmation of «Переоткрыть месяц» inside the block of the closed month.  No `<form>` (the block lives inside the form of the window around it, and a form in a
 * form is not one): the reason is a textarea, so Enter never sends the window around it (LESSONS 101); the confirmation is a button of its own.
 */
function ReopenInline({ info, onClose, onReopened }: { info: PeriodClosedInfo & { teacherId: string }; onClose: () => void; onReopened: () => void }) {
  const { reason, setReason, busy, error, setError, revision, submit } = useReopenMonth(
    { month: info.month, teacherId: info.teacherId, teacherName: info.teacherName },
    () => onReopened(),
  );
  return (
    <div data-testid="reopen-inline" className="space-y-2 border-t border-amber-200 pt-2.5">
      <p className="text-xs leading-5 text-amber-900">{REOPEN_EXPLAIN}</p>
      <label htmlFor="reopen-inline-reason" className="block text-xs font-semibold text-amber-900">{REOPEN_REASON_LABEL}</label>
      <textarea
        id="reopen-inline-reason"
        value={reason}
        onChange={(event) => { setReason(event.target.value); setError(null); }}
        maxLength={REASON_MAX}
        rows={2}
        placeholder={REOPEN_REASON_PLACEHOLDER}
        className="w-full resize-none rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
      />
      {revision === undefined && <p role="status" data-testid="reopen-reading" className="flex items-center gap-1.5 text-xs text-amber-900"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Проверяем зарплату…</p>}
      {error !== null && error !== undefined && (
        <p role="alert" data-testid="reopen-inline-error" className="text-xs font-medium text-amber-900">{typeof error === "string" ? error : reopenErrorText(error)}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          data-testid="reopen-submit"
          onClick={() => void submit()}
          disabled={busy || typeof revision !== "number"}
          variant="primary" size="md"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Переоткрыть месяц
        </Button>
        <button type="button" onClick={onClose} disabled={busy} className="inline-flex min-h-[40px] items-center rounded-lg px-3.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50">Отмена</button>
      </div>
    </div>
  );
}
