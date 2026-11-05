"use client";

import { Loader2 } from "lucide-react";
import {
  REOPEN_BUTTON,
  REOPEN_EXPLAIN,
  REOPEN_REASON_LABEL,
  REOPEN_REASON_PLACEHOLDER,
  REOPEN_TITLE,
  reopenDescription,
  reopenErrorText,
  type ReopenResult,
} from "@/lib/closed-period";
import { REASON_MAX } from "@/lib/payments";
import { useReopenMonth, type ReopenTarget } from "@/lib/use-reopen-month";
import { DialogError } from "@/components/money/dialog-error";
import { Modal } from "@/components/ui/modal";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter } from "@/components/money/dialog-footer";

export type { ReopenTarget };

/**
 * Money-1 A1: «Переоткрыть месяц» - a month of a teacher that a saved sheet has closed is opened for corrections.  A reason (3..500 characters) is required, it goes to the
 * journal; the dialog says what opening does and what the person does next (corrects the lessons, saves the new sum - the month closes again).  The owner opens it from the
 * sheet of the teacher; inside a window of a lesson the same form is a block of the window (`ReopenInline`, UX pack №27), not a window over a window.
 */
export function ReopenMonthDialog({
  target, onClose, onReopened, aboveLessonPanel = false,
}: {
  target: ReopenTarget | null;
  onClose: () => void;
  onReopened: (result: ReopenResult, target: ReopenTarget) => void;
  aboveLessonPanel?: boolean;
}) {
  const { reason, setReason, busy, error, setError, revision, submit } = useReopenMonth(target, onReopened);

  return (
    <Modal
      open={target !== null}
      title={REOPEN_TITLE}
      description={target ? reopenDescription(target.teacherName, target.month) : undefined}
      onClose={onClose}
      busy={busy}
      aboveLessonPanel={aboveLessonPanel}
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={(
        <ConfirmFooter primary={REOPEN_BUTTON} submitFor="reopen-month-form" busy={busy} disabled={typeof revision !== "number"} why="Загружаем версию зарплаты…" whyId="reopen-why" onCancel={onClose} testId="reopen-submit" />
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
        <p className="text-xs text-slate-500">Причина и ваше имя останутся в журнале.</p>
        {revision === undefined && <p role="status" data-testid="reopen-reading" className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Проверяем зарплату…</p>}
        <DialogError error={error} closed={null} text={(failure) => (typeof failure === "string" ? failure : reopenErrorText(failure))} onReopened={() => setError(null)} aboveLessonPanel={aboveLessonPanel} />
      </form>
    </Modal>
  );
}
