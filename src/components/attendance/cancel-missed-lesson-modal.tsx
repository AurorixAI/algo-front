"use client";

import { useEffect, useRef, useState } from "react";
import { orgApi } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter } from "@/components/money/dialog-footer";
import { cancellationKindBody, DEFAULT_CANCELLATION_KIND, type CancellationKind } from "@/lib/payf";
import { useCanChooseCancellationKind } from "@/lib/use-cancellation-kind";
import { warningTexts } from "@/lib/ops-errors";
import { REASON_LIMITS, reasonProblemFor } from "@/lib/reason-rules";
import { CANCEL_CONSEQUENCES, substitutionErrorText } from "@/lib/substitutions";
import { CancellationKindField } from "./cancellation-kind-field";
import { useMoneyPreview } from "@/lib/use-money-preview";
import { cancelMoneyView } from "@/lib/cancel-preview";
import { PayrollEffect } from "@/components/money/money-effects-block";
import { DRY_RUN_REASON } from "@/lib/dry-run";
import { EFFECTS_TITLE } from "@/lib/money-effects";
import { periodClosedOf } from "@/lib/closed-period";
import { PeriodClosedNotice } from "@/components/money/period-closed-notice";
import { formatLessonWhen } from "@/lib/business-time";

export interface CancelMissedTarget {
  groupId: string;
  lessonId: string;
  /** YYYY-MM-DD */
  lessonDate: string;
  /** «7-А Алгебра · вт, 3 ноября · 11:00–12:00» - the lesson in the words of a window (re-audit С3); the date alone when the screen has no more. */
  lessonLabel?: string;
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

  // server 64a929b: the same road with `?dry_run=true` says what the cancellation does to money (asked again when the kind changes); a failure of the preview never blocks the real call
  const previewKey = target ? `${target.groupId}|${target.lessonId}|${target.lessonDate}|${canChooseKind ? kind : "centre"}` : null;
  const { preview, retry } = useMoneyPreview(previewKey, (signal) => orgApi.cancelMissedGroupAttendance(target!.groupId, {
    lessonDate: target!.lessonDate, lessonId: target!.lessonId, cancellationReason: DRY_RUN_REASON, ...cancellationKindBody(kind, canChooseKind),
  }, { dryRun: true, signal }));
  const closed = preview.status === "failed" ? periodClosedOf(preview.error) : null;
  const money = preview.status === "ready" ? cancelMoneyView(preview.answer) : null;

  const submit = async () => {
    if (!target || busy || sending.current) return;
    const text = reason.trim();
    const problem = reasonProblemFor("cancel", text);
    if (problem) {
      setError(problem);
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
      description={target ? (target.lessonLabel ?? `Урок ${formatLessonWhen({ date: target.lessonDate })} будет отмечен как не состоявшийся`) : undefined}
      onClose={onClose}
      busy={busy}
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={(
        // UX pack №5 / rule 3: the main button names the action; the window is reversible («Вернуть на отметку») - blue; the line «почему» stands over the off button
        <ConfirmFooter
          primary="Отметить: урока не было"
          onPrimary={() => void submit()}
          busy={busy}
          disabled={Boolean(reasonProblemFor("cancel", reason))}
          why={reasonProblemFor("cancel", reason)}
          whyId="cancel-missed-why"
          onCancel={onClose}
          testId="cancel-missed-submit"
        />
      )}
    >
      {target && (
        <div className="space-y-2 pb-2">
          <label htmlFor="cancel-missed-reason" className="block text-xs font-semibold text-slate-600">Причина (обязательно)</label>
          <textarea
            id="cancel-missed-reason"
            value={reason}
            onChange={(event) => { setReason(event.target.value); setError(null); }}
            rows={3}
            maxLength={REASON_LIMITS.cancel.max}
            autoFocus
            placeholder="Например: преподаватель заболел, урок не проводился"
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/10"
          />
          <CancellationKindField canChooseKind={canChooseKind} value={kind} onChange={setKind} name="cancel-missed-kind" disabled={busy} help={CANCEL_CONSEQUENCES} />
          {closed && <PeriodClosedNotice info={closed} onReopened={retry} />}
          {money && (money.students || money.payroll.length > 0) && (
            <section aria-label={EFFECTS_TITLE} data-testid="cancel-effects" className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
              <h3 className="text-xs font-semibold text-slate-600">{EFFECTS_TITLE}</h3>
              {money.students && <p className="text-sm text-slate-800" data-testid="cancel-effects-students">{money.students}</p>}
              {money.payroll.map((line) => <PayrollEffect key={line.key} line={line} />)}
            </section>
          )}
          {error && <p role="alert" className="text-xs font-medium text-rose-600">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
