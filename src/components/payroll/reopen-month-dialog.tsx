"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import {
  REOPEN_BUTTON,
  REOPEN_EXPLAIN,
  REOPEN_REASON_LABEL,
  REOPEN_REASON_PLACEHOLDER,
  REOPEN_TITLE,
  buildReopenBody,
  reopenDescription,
  reopenErrorText,
  validateReopenReason,
  type ReopenResult,
} from "@/lib/closed-period";
import { REASON_MAX } from "@/lib/payments";
import { Modal } from "@/components/ui/modal";

export interface ReopenTarget {
  /** `YYYY-MM` */
  month: string;
  teacherId: string;
  teacherName: string | null;
}

/**
 * Money-1 A1: «Переоткрыть месяц» - a month of a teacher that a saved sheet has closed is opened for corrections.  A reason (3..500 characters) is required, it goes to the
 * journal; the dialog says what opening does and what the person does next (corrects the lessons, saves the sheet again - the month closes again).  The owner opens it from the
 * sheet of the teacher; the owner and an administrator with the money right open it from the refusal «месяц закрыт» of a lesson window.
 */
export function ReopenMonthDialog({
  target, onClose, onReopened, aboveLessonPanel = false,
}: {
  target: ReopenTarget | null;
  onClose: () => void;
  onReopened: (result: ReopenResult, target: ReopenTarget) => void;
  aboveLessonPanel?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);          // a second press in the same tick sees the state of the first one (rule 27)
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setBusy(false);
    setError(null);
    sending.current = false;
  }, [target?.month, target?.teacherId]);

  const submit = async () => {
    if (!target || busy || sending.current) return;
    const problem = validateReopenReason(reason);
    if (problem) { setError(problem); return; }
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.reopenPayrollPeriod(target.month, buildReopenBody(target.teacherId, reason));
      onReopened(result, target);
    } catch (cause) {
      setError(reopenErrorText(cause));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      open={target !== null}
      title={REOPEN_TITLE}
      description={target ? reopenDescription(target.teacherName, target.month) : undefined}
      onClose={onClose}
      busy={busy}
      aboveLessonPanel={aboveLessonPanel}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Назад</button>
          <button
            type="submit"
            form="reopen-month-form"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {REOPEN_BUTTON}
          </button>
        </>
      )}
    >
      <form id="reopen-month-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-2 pb-2" noValidate>
        <p className="text-sm leading-6 text-slate-700">{REOPEN_EXPLAIN}</p>
        <label htmlFor="reopen-month-reason" className="block pt-1 text-xs font-semibold text-slate-600">{REOPEN_REASON_LABEL}</label>
        <textarea
          id="reopen-month-reason"
          value={reason}
          onChange={(event) => { setReason(event.target.value); setError(null); }}
          maxLength={REASON_MAX}
          rows={3}
          autoFocus
          placeholder={REOPEN_REASON_PLACEHOLDER}
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
        />
        <p className="text-xs text-slate-400">Причина и ваше имя останутся в журнале.</p>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}
