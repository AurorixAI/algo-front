"use client";

import { useEffect, useState } from "react";
import { isAttendanceConflict } from "@/lib/attendance-ops";
import { Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import {
  RETURN_LESSON_EXPLAIN,
  RETURN_LESSON_LABEL,
  RETURN_REASON_HINT,
  RETURN_REASON_LABEL,
  RETURN_REASON_PLACEHOLDER,
  RETURN_REVIEW_EXPLAIN,
  RETURN_REVIEW_PAY,
  RETURN_REVIEW_TITLE,
  RETURN_TO_REVIEW_LABEL,
  returnErrorText,
  returnTitle,
  validateReturnReason,
} from "@/lib/lesson-return";
import { effectsAllowConfirm } from "@/lib/money-preview";
import { useMoneyPreview } from "@/lib/use-money-preview";
import { useDialogAction } from "@/lib/use-dialog-action";
import type { ReturnHeldLessonResult, RestoreLessonResult } from "@/lib/ops-b-types";
import { REASON_MAX } from "@/lib/payments";
import { DRY_RUN_REASON } from "@/lib/dry-run";
import { Modal } from "@/components/ui/modal";
import { MoneyEffectsBlock } from "@/components/money/money-effects-block";
import { DialogError } from "@/components/money/dialog-error";
import { RestoreConsequences, useRestorePreview } from "./restore-consequences";

export interface ReturnLessonTarget {
  groupId: string;
  lessonId: string;
  /** `YYYY-MM-DD` */
  lessonDate: string;
}

const FIELD = "w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";

/** The reason field of both dialogs. */
function ReasonField({ id, value, onChange, disabled }: { id: string; value: string; onChange: (text: string) => void; disabled: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600">{RETURN_REASON_LABEL}</label>
      <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} maxLength={REASON_MAX} rows={3} autoFocus disabled={disabled} placeholder={RETURN_REASON_PLACEHOLDER} className={FIELD} />
      <p className="text-xs text-slate-400">{RETURN_REASON_HINT}</p>
    </div>
  );
}

/**
 * Money-1 A2: «Вернуть урок» - a HELD lesson goes back to «не проведён» (owner / administrator with the money right).  The dry run of the server says what it does to the packs of
 * the students and the saved sheets BEFORE the button can be pressed (I-5); a reason is required; the month of the teacher must be open (otherwise the sentence of the server and
 * «Переоткрыть месяц»).  The answer carries the same block for the toast.
 */
export function LessonReturnDialog({
  target, onClose, onDone, onStale, aboveLessonPanel = false,
}: {
  target: ReturnLessonTarget | null;
  onClose: () => void;
  onDone: (result: ReturnHeldLessonResult, target: ReturnLessonTarget) => void;
  /** R3 #11: somebody changed the lesson after the window read it (409 `ATTENDANCE_CONFLICT`): the page behind reads it again. */
  onStale?: () => void;
  aboveLessonPanel?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  /** R3 #11: the version of the lesson the dry run read - the request carries it (`expectedVersion` is required), so a late duplicate cannot return the lesson twice. */
  const [version, setVersion] = useState<number | undefined>(undefined);
  const key = target ? `${target.groupId}|${target.lessonId}|${target.lessonDate}` : null;
  const { busy, error, setError, closed, run } = useDialogAction(key);
  const { preview, retry } = useMoneyPreview(key, (signal) => {
    if (!target) return Promise.reject(new Error("no target"));
    return orgApi.returnHeldLesson(target.groupId, { lessonDate: target.lessonDate, lessonId: target.lessonId, reason: DRY_RUN_REASON, dryRun: true }, signal)
      .then((answer) => { setVersion(answer.version); return answer; });
  });
  useEffect(() => { setReason(""); setReasonError(null); setVersion(undefined); }, [key]);

  const canSend = effectsAllowConfirm(preview) && version !== undefined;
  const submit = async () => {
    if (!target || busy || !canSend || version === undefined) return;
    const problem = validateReturnReason(reason);
    if (problem) { setReasonError(problem); return; }
    await run(async () => {
      const result = await orgApi.returnHeldLesson(target.groupId, {
        lessonDate: target.lessonDate, lessonId: target.lessonId, reason: reason.trim(), expectedVersion: version,
      });
      onDone(result, target);
    }, (cause) => {
      // the lesson was changed (or returned and held again) after the window read it: read it again - the person looks at the new state and asks once more
      if (isAttendanceConflict(cause)) { setVersion(undefined); retry(); onStale?.(); }
    });
  };

  return (
    <Modal
      open={target !== null}
      title={target ? returnTitle(target.lessonDate) : RETURN_LESSON_LABEL}
      onClose={onClose}
      busy={busy}
      aboveLessonPanel={aboveLessonPanel}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Назад</button>
          <button
            type="submit"
            form="lesson-return-form"
            data-testid="lesson-return-submit"
            disabled={busy || !canSend}
            className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {RETURN_LESSON_LABEL}
          </button>
        </>
      )}
    >
      <form id="lesson-return-form" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void submit(); }} className="space-y-3 pb-2" noValidate>
        <p className="text-sm leading-6 text-slate-700">{RETURN_LESSON_EXPLAIN}</p>
        <MoneyEffectsBlock preview={preview} onRetry={retry} aboveLessonPanel={aboveLessonPanel} />
        <ReasonField id="lesson-return-reason" value={reason} onChange={(text) => { setReason(text); setReasonError(null); setError(null); }} disabled={busy} />
        {reasonError && <p role="alert" className="text-xs font-medium text-rose-700">{reasonError}</p>}
        <DialogError error={error} closed={closed} text={returnErrorText} onReopened={() => { setError(null); retry(); }} aboveLessonPanel={aboveLessonPanel} />
      </form>
    </Modal>
  );
}

/**
 * Money-1 A2: «Вернуть в разбор» - «Урока не было» said by mistake for a lesson that had begun: it goes back to «Незакрытые уроки» (owner / administrator with the money right, an
 * open month).  The server has no dry run for it, so the consequence is said in the window by the rule (the deduction of a cancellation «по вине центра» goes away; the teacher is paid
 * when the lesson is held); the answer carries the real block for the toast.
 */
export function ReturnToReviewDialog({
  target, onClose, onDone, aboveLessonPanel = false,
}: {
  target: ReturnLessonTarget | null;
  onClose: () => void;
  onDone: (result: RestoreLessonResult, target: ReturnLessonTarget) => void;
  aboveLessonPanel?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const key = target ? `${target.groupId}|${target.lessonId}|${target.lessonDate}` : null;
  const { busy, error, setError, closed, run } = useDialogAction(key);
  // R3 #23: the dry run of the return (`dryRun: true`) says what it does to the deductions of the students and the saved sheets BEFORE the button can be pressed
  const { preview, retry } = useRestorePreview(target);
  useEffect(() => { setReason(""); setReasonError(null); }, [key]);

  const submit = async () => {
    if (!target || busy || !effectsAllowConfirm(preview)) return;
    const problem = validateReturnReason(reason);
    if (problem) { setReasonError(problem); return; }
    await run(async () => {
      const result = await orgApi.restoreLesson(target.groupId, { lessonId: target.lessonId, lessonDate: target.lessonDate, reason: reason.trim() });
      onDone(result, target);
    });
  };

  return (
    <Modal
      open={target !== null}
      title={RETURN_REVIEW_TITLE}
      onClose={onClose}
      busy={busy}
      aboveLessonPanel={aboveLessonPanel}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Назад</button>
          <button
            type="submit"
            form="return-review-form"
            data-testid="return-review-submit"
            disabled={busy || !effectsAllowConfirm(preview)}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {RETURN_TO_REVIEW_LABEL}
          </button>
        </>
      )}
    >
      <form id="return-review-form" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void submit(); }} className="space-y-3 pb-2" noValidate>
        <div className="space-y-1 text-sm leading-6 text-slate-700">
          <p>{RETURN_REVIEW_EXPLAIN}</p>
          <p>{RETURN_REVIEW_PAY}</p>
        </div>
        <RestoreConsequences preview={preview} onRetry={retry} aboveLessonPanel={aboveLessonPanel} />
        <ReasonField id="return-review-reason" value={reason} onChange={(text) => { setReason(text); setReasonError(null); setError(null); }} disabled={busy} />
        {reasonError && <p role="alert" className="text-xs font-medium text-rose-700">{reasonError}</p>}
        <DialogError error={error} closed={closed} text={returnErrorText} onReopened={() => { setError(null); retry(); }} aboveLessonPanel={aboveLessonPanel} />
      </form>
    </Modal>
  );
}
