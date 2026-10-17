"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { REVIEW_NOTE_MAX } from "@/lib/attendance-excuses";
import {
  canSubmitExcuseDecision,
  excuseDecisionCopy,
  excuseNoteToSend,
  type ExcuseBillingMode,
  type ExcuseDecision,
  type ExcuseDecisionSubject,
  type ExcuseNoteMode,
} from "@/lib/excuse-decision";
import { Modal } from "@/components/ui/modal";
import { ExcuseDecisionBody } from "@/components/attendance/excuse-decision-body";

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
 */
export function ExcuseDecisionDialog({
  target,
  busy,
  error = null,
  billingMode = null,
  onClose,
  onSubmit,
}: {
  target: ExcuseDecisionTarget | null;
  /** True while the request of this dialog is in flight. */
  busy: boolean;
  /** Why the last attempt failed (shown inside the dialog, which stays open); null when there is nothing to say. */
  error?: string | null;
  /** How the centre bills, when this user can see it (the payments summary); null: the package sentence is left out. */
  billingMode?: ExcuseBillingMode;
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
  const canSubmit = canSubmitExcuseDecision(noteMode, note, busy);

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
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {copy.cancelLabel}
          </button>
          <button
            type="button"
            data-testid="excuse-decision-submit"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className={`flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
              decision === "rejected" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {copy.confirmLabel}
          </button>
        </>
      }
    >
      {target && (
        <>
          <ExcuseDecisionBody items={target.items} decision={target.decision} billingMode={billingMode} />
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
          {noteMode === "none" && <div className="pb-2" />}
        </>
      )}
    </Modal>
  );
}
