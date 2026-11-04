"use client";

import { Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatDateRu } from "@/lib/business-time";
import { useDialogAction } from "@/lib/use-dialog-action";
import { oneOffRefusalText, UNDO_DECISION_BUTTON, UNDO_DECISION_NOTE, UNDO_DECISION_PAID_NOTE, UNDO_DECISION_TITLE, type MoneyDecisionOut, type OneOffMoney } from "@/lib/one-off";
import { Modal } from "@/components/ui/modal";
import { DialogError } from "@/components/money/dialog-error";

export interface UndoDecisionTarget {
  lessonId: string;
  /** `YYYY-MM-DD` */
  lessonDate: string;
  /** What was decided: `paid` (it is paid to the teacher) / `none` (without pay). */
  money: OneOffMoney | null | undefined;
}

/**
 * Money-1 A3 (ЗП-07): «Отменить решение об оплате» of an additional lesson - the lesson waits for «Оплатить / Не оплачивать» again.  Possible while the month of the teacher is open
 * (otherwise the sentence of the server and «Переоткрыть месяц» for who may).  No reason is asked: both decisions stay in the audit.
 */
export function UndoDecisionDialog({
  target, onClose, onDone, aboveLessonPanel = false,
}: {
  target: UndoDecisionTarget | null;
  onClose: () => void;
  onDone: (result: MoneyDecisionOut, target: UndoDecisionTarget) => void;
  aboveLessonPanel?: boolean;
}) {
  const { busy, error, setError, closed, run } = useDialogAction(target ? `${target.lessonId}|${target.lessonDate}` : null);

  const submit = async () => {
    if (!target || busy) return;
    await run(async () => { onDone(await orgApi.decideOneOffMoney(target.lessonId, "undo"), target); });
  };

  return (
    <Modal
      open={target !== null}
      title={UNDO_DECISION_TITLE}
      description={target ? `Дополнительный урок ${formatDateRu(target.lessonDate).slice(0, 5)}` : undefined}
      onClose={onClose}
      busy={busy}
      aboveLessonPanel={aboveLessonPanel}
      maxWidthClassName="max-w-md"
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Назад</button>
          <button
            type="button"
            data-testid="undo-decision-submit"
            onClick={() => void submit()}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {UNDO_DECISION_BUTTON}
          </button>
        </>
      )}
    >
      <div className="space-y-2 pb-2 text-sm leading-6 text-slate-700">
        <p>{UNDO_DECISION_NOTE}</p>
        {target?.money === "paid" && <p className="font-medium text-amber-900">{UNDO_DECISION_PAID_NOTE}</p>}
        <DialogError error={error} closed={closed} text={(failure) => oneOffRefusalText(failure, "Не удалось отменить решение. Данные не изменены.")} onReopened={() => setError(null)} aboveLessonPanel={aboveLessonPanel} />
      </div>
    </Modal>
  );
}
