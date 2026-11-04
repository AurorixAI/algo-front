"use client";

import { useState } from "react";
import { formatIsoDateLabel } from "@/lib/business-time";
import { REASON_LIMITS, reasonProblemFor } from "@/lib/reason-rules";

/** What the exam bound to the lesson means for the cancellation (the page reads `lesson-exam-binding` when the panel opens). */
export interface LessonCancelBinding {
  loading: boolean;
  attached: boolean;
  canCancel: boolean;
  examTitle?: string;
  message?: string | null;
}

/**
 * W1 F1: «Урока не было» on the lesson panel of the TEACHER - the reason and the exam note, one panel for the schedule and the dashboard (it was two copies).
 * The kind of the cancellation is never asked here: a teacher always cancels «по вине центра» (the server decides, S3).
 * The minimum of the reason is a quiet grey line from the start (as on the other forms); it turns red only after an attempt to send a short reason or after
 * the person leaves the field - the button stays pressable, so the attempt is answered with the reason, not with a dead button.
 */
export function LessonCancelPanel({ date, oneOff = false, autoFocus = false, binding, reason, onReason, busy, onConfirm, onBack }: {
  /** YYYY-MM-DD */
  date: string;
  /** W1 S27: the teacher cancels the one-off lesson he added himself (not «урока не было»). */
  oneOff?: boolean;
  autoFocus?: boolean;
  /** The exam bound to the lesson; `undefined` = the list of missed lessons does not ask (the server decides), no exam line and no waiting. */
  binding?: LessonCancelBinding | null;
  reason: string;
  onReason: (value: string) => void;
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const problem = reasonProblemFor("cancel", reason);
  const [asked, setAsked] = useState(false);        // a short reason was sent, or the field was left
  const showProblem = asked && Boolean(problem);
  const confirm = () => {
    if (problem) { setAsked(true); return; }
    onConfirm();
  };
  return (
    <div data-testid="lesson-cancel-panel" className="mb-5 space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
      <div>
        <p className="text-sm font-bold text-rose-900">{oneOff ? "Отменить разовый урок" : "Урока не было"}: {formatIsoDateLabel(date, { day: "numeric", month: "long" })}</p>
        <p className="mt-0.5 text-xs text-rose-700">{oneOff ? "Разовый урок будет отменён. Причина сохранится в истории." : "Урок будет отмечен как не состоявшийся. Причина сохранится в истории урока."}</p>
      </div>
      {binding?.loading && (
        <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">Проверяем связанный экзамен…</p>
      )}
      {!binding?.loading && binding?.attached && binding.canCancel && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-900">Экзамен «{binding.examTitle}» вернётся в черновик, а код доступа будет закрыт.</p>
      )}
      {!binding?.loading && binding && !binding.canCancel && (
        <p className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium leading-5 text-rose-800">{binding.message || "Отмена недоступна."}</p>
      )}
      <textarea
        autoFocus={autoFocus}
        value={reason}
        onChange={(event) => onReason(event.target.value)}
        onBlur={() => setAsked(true)}
        maxLength={REASON_LIMITS.cancel.max}
        rows={3}
        placeholder="Причина (обязательно)"
        aria-label="Причина"
        aria-invalid={showProblem || undefined}
        aria-describedby={problem ? "lesson-cancel-reason-hint" : undefined}
        className="w-full resize-none rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
      />
      {problem && <p id="lesson-cancel-reason-hint" data-testid="reason-hint" role={showProblem ? "alert" : undefined} className={`text-xs ${showProblem ? "font-medium text-rose-700" : "text-slate-500"}`}>{problem}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onBack} disabled={busy} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">Назад</button>
        <button
          type="button"
          onClick={confirm}
          disabled={busy || (binding !== undefined && (!binding || binding.loading || !binding.canCancel))}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Сохранение..." : oneOff ? "Отменить урок" : "Урока не было"}
        </button>
      </div>
    </div>
  );
}
