"use client";

import { orgApi } from "@/lib/api";
import { formatWeekdayDate } from "@/lib/business-time";
import { useDialogAction } from "@/lib/use-dialog-action";
import { DECISION_UNDO_NO_SHEET_TEXT, oneOffRefusalText, UNDO_DECISION_BUTTON, UNDO_DECISION_NOTE, undoDecisionTitle, type MoneyDecisionOut, type OneOffMoney } from "@/lib/one-off";
import { effectsAllowConfirm, effectsWhyOff } from "@/lib/money-preview";
import { useMoneyPreview } from "@/lib/use-money-preview";
import { MoneyEffectsBlock } from "@/components/money/money-effects-block";
import { Modal } from "@/components/ui/modal";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter } from "@/components/money/dialog-footer";
import { DialogError } from "@/components/money/dialog-error";

export interface UndoDecisionTarget {
  lessonId: string;
  /** `YYYY-MM-DD` */
  lessonDate: string;
  /** What was decided: `paid` (it is in the pay of the teacher) / `none` (left out of it). */
  money: OneOffMoney | null | undefined;
  /** «Эргашев К.» - the title names whose pay it leaves («Исключить урок из зарплаты Эргашева К.?»). */
  teacherName?: string | null;
}

/**
 * Money-1 A3 (ЗП-07): «Отменить решение» of an additional lesson - the lesson waits for «Включить в зарплату / Не включать» again.  Possible while the month of the teacher is open
 * (otherwise the sentence of the server and «Переоткрыть месяц» for who may).  No reason is asked: both decisions stay in the audit.  D-5 of the walk of 05.11: the window says before the
 * press what it does to the saved sheet (the dry run), and a closed month blocks the button at once.
 */
export function UndoDecisionDialog({
  target, onClose, onDone, aboveLessonPanel = false,
}: {
  target: UndoDecisionTarget | null;
  onClose: () => void;
  onDone: (result: MoneyDecisionOut, target: UndoDecisionTarget) => void;
  aboveLessonPanel?: boolean;
}) {
  const key = target ? `${target.lessonId}|${target.lessonDate}` : null;
  const { busy, error, setError, closed, run } = useDialogAction(key);
  // D-5 (walk of 05.11, I-5): what taking the decision back does to the saved sheet - the dry run of the same request; a closed month is its refusal with «Переоткрыть месяц» and the button stays off
  const { preview, retry } = useMoneyPreview(key, (signal) => (target ? orgApi.decideOneOffMoney(target.lessonId, "undo", { dryRun: true, signal }) : Promise.reject(new Error("no target"))));
  const ready = effectsAllowConfirm(preview);

  const submit = async () => {
    if (!target || busy || !ready) return;
    await run(async () => { onDone(await orgApi.decideOneOffMoney(target.lessonId, "undo"), target); });
  };

  return (
    <Modal
      open={target !== null}
      title={undoDecisionTitle(target?.money, target?.teacherName)}
      description={target ? `Дополнительный урок · ${formatWeekdayDate(target.lessonDate)}` : undefined}
      onClose={onClose}
      busy={busy}
      aboveLessonPanel={aboveLessonPanel}
      size="sm"
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={(
        <ConfirmFooter
          primary={UNDO_DECISION_BUTTON}
          onPrimary={() => void submit()}
          testId="undo-decision-submit"
          disabled={!ready}
          busy={busy}
          why={effectsWhyOff(preview)}
          onCancel={onClose}
        />
      )}
    >
      <div className="space-y-2 pb-2 text-sm leading-6 text-slate-700">
        <p>{UNDO_DECISION_NOTE}</p>
        <MoneyEffectsBlock preview={preview} onRetry={retry} noneText={target?.money === "paid" ? DECISION_UNDO_NO_SHEET_TEXT : undefined} aboveLessonPanel={aboveLessonPanel} withPaid teacherName={target?.teacherName ?? null} closedPurpose="decision" />
        <DialogError error={error} closed={closed} text={(failure) => oneOffRefusalText(failure, "Не удалось отменить решение. Данные не изменены.")} onReopened={() => { setError(null); retry(); }} aboveLessonPanel={aboveLessonPanel} />
      </div>
    </Modal>
  );
}
