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
  isSheetChanged,
  reopenDescription,
  reopenErrorText,
  revisionOf,
  validateReopenReason,
  REOPEN_NO_SHEET_TEXT,
  type ReopenResult,
} from "@/lib/closed-period";
import { REASON_MAX } from "@/lib/payments";
import { useDialogAction } from "@/lib/use-dialog-action";
import { DialogError } from "@/components/money/dialog-error";
import { Modal } from "@/components/ui/modal";

export interface ReopenTarget {
  /** `YYYY-MM` */
  month: string;
  teacherId: string;
  teacherName: string | null;
  /** The revision of the saved sheet the screen saw (`sheetRevision` of the list of months); absent: the dialog reads it itself when it opens. */
  sheetRevision?: number | null;
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
  const { busy, error, setError, run } = useDialogAction(target ? `${target.month}|${target.teacherId}` : null);
  /** R3 #11: the revision of the sheet the person is looking at; undefined while it is being read; null: the teacher has no sheet in that month. */
  const [revision, setRevision] = useState<number | null | undefined>(typeof target?.sheetRevision === "number" ? target.sheetRevision : undefined);
  const reads = useRef(0);

  /** Reads the list of months again: the revision to send (a sheet saved meanwhile has a new one). */
  const readRevision = async (month: string, teacherId: string) => {
    const token = ++reads.current;
    setRevision(undefined);
    try {
      const periods = await orgApi.getPayrollPeriods(month);
      if (token !== reads.current) return;
      const next = revisionOf(periods, teacherId);
      setRevision(next);
      if (next === null) setError(REOPEN_NO_SHEET_TEXT);
    } catch (cause) {
      if (token !== reads.current) return;
      setRevision(null);
      setError(reopenErrorText(cause));
    }
  };

  useEffect(() => {
    setReason("");
    reads.current += 1;
    if (!target) { setRevision(undefined); return; }
    if (typeof target.sheetRevision === "number") setRevision(target.sheetRevision);
    else void readRevision(target.month, target.teacherId);
    // the revision is read when the dialog opens for a teacher and a month, not when the page behind it refreshes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.month, target?.teacherId]);

  const submit = async () => {
    if (!target || busy || typeof revision !== "number") return;
    const problem = validateReopenReason(reason);
    if (problem) { setError(problem); return; }
    await run(async () => {
      const result = await orgApi.reopenPayrollPeriod(target.month, buildReopenBody(target.teacherId, reason, revision));
      onReopened(result, target);
    }, (cause) => {
      // the sheet was saved again after the screen read it: read it again - the person looks at the new state and asks once more
      if (isSheetChanged(cause)) void readRevision(target.month, target.teacherId);
    });
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
            data-testid="reopen-submit"
            disabled={busy || typeof revision !== "number"}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {REOPEN_BUTTON}
          </button>
        </>
      )}
    >
      <form id="reopen-month-form" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void submit(); }} className="space-y-2 pb-2" noValidate>
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
        {revision === undefined && <p role="status" data-testid="reopen-reading" className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Проверяем ведомость…</p>}
        <DialogError error={error} closed={null} text={(failure) => (typeof failure === "string" ? failure : reopenErrorText(failure))} onReopened={() => setError(null)} aboveLessonPanel={aboveLessonPanel} />
      </form>
    </Modal>
  );
}
