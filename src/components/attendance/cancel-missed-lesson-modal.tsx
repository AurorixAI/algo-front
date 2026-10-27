"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatDateRu } from "@/lib/attendance-excuses";
import { Modal } from "@/components/ui/modal";
import { cancellationKindBody, DEFAULT_CANCELLATION_KIND, type CancellationKind } from "@/lib/payf";
import { useCanChooseCancellationKind } from "@/lib/use-cancellation-kind";
import { warningTexts } from "@/lib/ops-errors";
import { substitutionErrorText } from "@/lib/substitutions";
import { CancellationKindField } from "./cancellation-kind-field";

export interface CancelMissedTarget {
  groupId: string;
  lessonId: string;
  /** YYYY-MM-DD */
  lessonDate: string;
}

/**
 * «Урока не было»: a forgotten past lesson is closed as "did not take place" with a reason.
 * One component for the group journal (column menu) and the administrators' list of open lessons,
 * so both ask the same question and call the same endpoint.
 */
export function CancelMissedLessonModal({
  target,
  onClose,
  onCancelled,
}: {
  target: CancelMissedTarget | null;
  onClose: () => void;
  /** After the server accepted the cancellation (the dialog is already closed); `notes` are what the server said besides (a day off made it a holiday, a substitute was released). */
  onCancelled: (target: CancelMissedTarget, notes: string[]) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<CancellationKind>(DEFAULT_CANCELLATION_KIND);
  const canChooseKind = useCanChooseCancellationKind();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);        // a second press in the same tick sees the state of the first one (rule 27)

  // A fresh form for every lesson.
  useEffect(() => {
    setReason("");
    setKind(DEFAULT_CANCELLATION_KIND);
    setError(null);
  }, [target?.groupId, target?.lessonId, target?.lessonDate]);

  const submit = async () => {
    if (!target || busy || sending.current) return;
    const text = reason.trim();
    if (text.length < 3) {
      setError("Укажите причину — не менее 3 символов.");
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      const out = await orgApi.cancelMissedGroupAttendance(target.groupId, {
        lessonDate: target.lessonDate,
        lessonId: target.lessonId,
        cancellationReason: text,
        ...cancellationKindBody(kind, canChooseKind),
      });
      onClose();
      await onCancelled(target, warningTexts(out));
    } catch (err) {
      setError(substitutionErrorText(err, "Не удалось сохранить. Данные не изменены."));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      open={target !== null}
      title="Урока не было"
      description={target ? `Урок ${formatDateRu(target.lessonDate)} будет отмечен как не состоявшийся` : undefined}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Назад</button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || reason.trim().length < 3}
            className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Урока не было
          </button>
        </>
      }
    >
      {target && (
        <div className="space-y-2 pb-2">
          <label htmlFor="cancel-missed-reason" className="block text-[13px] font-semibold text-slate-500">Причина</label>
          <textarea
            id="cancel-missed-reason"
            value={reason}
            onChange={(event) => { setReason(event.target.value); setError(null); }}
            rows={3}
            maxLength={300}
            autoFocus
            placeholder="Например: преподаватель заболел, урок не проводился"
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/10"
          />
          <CancellationKindField canChooseKind={canChooseKind} value={kind} onChange={setKind} name="cancel-missed-kind" disabled={busy} />
          {error && <p role="alert" className="text-xs font-medium text-rose-600">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
