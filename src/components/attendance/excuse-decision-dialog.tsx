"use client";

import { useEffect, useRef, useState } from "react";
import { REVIEW_NOTE_MAX } from "@/lib/attendance-excuses";
import {
  canSubmitExcuseDecision,
  excuseDecisionCopy,
  excusesWord,
  excuseNoteToSend,
  type ExcuseDecision,
  type ExcuseDecisionSubject,
  type ExcuseNoteMode,
} from "@/lib/excuse-decision";
import { Modal } from "@/components/ui/modal";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter } from "@/components/money/dialog-footer";
import { EFFECTS_LOADING_TEXT } from "@/lib/money-effects";
import { ExcuseDecisionBody } from "@/components/attendance/excuse-decision-body";
import { orgApi } from "@/lib/api";
import { effectsAllowConfirm } from "@/lib/money-preview";
import { useMoneyPreview } from "@/lib/use-money-preview";
import { MoneyEffectsBlock } from "@/components/money/money-effects-block";

/**
 * What the dialog is about: one excuse, or (bulk) several; `noteMode` says whether a note can / must be typed.
 * Used by the «Пропуски» list and by the cells of the group journal: one dialog, one wording.
 */
export interface ExcuseDecisionTarget {
  items: ExcuseDecisionSubject[];
  decision: ExcuseDecision;
  noteMode: ExcuseNoteMode;
}

/**
 * «Подтвердить» / «Отклонить» an excused absence always asks first (#103): the dialog names the student, the
 * lesson and the reason, and says in plain words what the decision does to the teacher's payroll.  Nothing
 * is sent before the button is pressed, and pressing it twice sends once.
 *
 * Money-1 A3 (I-5): for ONE excuse the dialog also asks the server for the money of THIS decision (a dry run: the pack of the student, the saved sheets of the teacher)
 * and shows it as «Что изменится»; «Подтвердить» / «Отклонить» wait for that answer (a closed month: the server's sentence and «Переоткрыть месяц»).
 */
export function ExcuseDecisionDialog({
  target,
  busy,
  error = null,
  onClose,
  onSubmit,
}: {
  target: ExcuseDecisionTarget | null;
  /** True while the request of this dialog is in flight. */
  busy: boolean;
  /** Why the last attempt failed (shown inside the dialog, which stays open); null when there is nothing to say. */
  error?: string | null;
  onClose: () => void;
  /** Sends the decision; the page closes the dialog itself when the server accepted it. */
  onSubmit: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  // The state `busy` arrives a render later than the second click of a double click: a ref closes that gap.
  const sending = useRef(false);
  // A fresh note for every excuse / decision; an error shown in the dialog (a new `target` object) keeps what was typed.
  const targetKey = target ? `${target.decision}:${target.items.map((item) => item.id).join(",")}` : "";
  useEffect(() => { setNote(""); }, [targetKey]);

  const decision = target?.decision ?? "confirmed";
  const noteMode = target?.noteMode ?? "none";
  const copy = excuseDecisionCopy(decision, target?.items.length ?? 1);
  const single = target && target.items.length === 1 ? target.items[0] : null;
  const { preview, retry } = useMoneyPreview(
    single ? `${single.id}|${single.status}|${decision}` : null,
    (signal) => orgApi.reviewAttendanceExcuse(single!.id, { decision, expected_status: single!.status }, { dryRun: true, signal }),
  );
  const moneyReady = !single || effectsAllowConfirm(preview);
  const canSubmit = canSubmitExcuseDecision(noteMode, note, busy) && moneyReady;
  const count = target?.items.length ?? 1;
  const verb = decision === "confirmed" ? "Подтвердить" : "Отклонить";
  const decisionLabel = count > 1 ? `${verb} ${count} ${excusesWord(count)}` : `${verb} пропуск`;

  const submit = async () => {
    if (!target || sending.current || !canSubmit) return;
    sending.current = true;
    try {
      await onSubmit(excuseNoteToSend(noteMode, note));
    } finally {
      sending.current = false;
    }
  };

  return (
    <Modal
      open={target !== null}
      title={copy.title}
      onClose={onClose}
      busy={busy}
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={(
        // UX pack №11 / rule 3: the main button names the action («Подтвердить пропуск», «Отклонить 3 пропуска»); a decision can be reset - blue; off - with the line «почему»
        <ConfirmFooter
          primary={decisionLabel}
          onPrimary={() => void submit()}
          busy={busy}
          disabled={!canSubmit}
          why={!moneyReady ? EFFECTS_LOADING_TEXT : noteMode === "required" && note.trim().length === 0 ? "Напишите примечание." : null}
          whyId="excuse-decision-why"
          onCancel={onClose}
          cancelLabel={copy.cancelLabel}
          testId="excuse-decision-submit"
        />
      )}
    >
      {target && (
        <>
          <ExcuseDecisionBody items={target.items} decision={target.decision} serverBlock={Boolean(single)} />
          {single && <MoneyEffectsBlock preview={preview} onRetry={retry} className="mt-3" />}
          {noteMode !== "none" && (
            <div className="space-y-1.5 pb-2 pt-3">
              <label htmlFor="excuse-decision-note" className="block text-xs font-medium text-slate-600">
                {noteMode === "required" ? "Примечание" : "Причина отказа (необязательно)"}
              </label>
              <textarea
                id="excuse-decision-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={REVIEW_NOTE_MAX}
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
              />
            </div>
          )}
          {error && <p role="alert" className="pt-3 text-xs font-medium text-rose-600">{error}</p>}
        </>
      )}
    </Modal>
  );
}
