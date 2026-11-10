"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { REASON_MAX, REASON_MIN } from "@/lib/payments";
import { alreadyVoidedText, balanceChangeOf, payError, validateReason } from "@/lib/payments-ledger";
import { BalanceChangedNotice } from "@/components/money/balance-changed-notice";
import { DialogError } from "@/components/money/dialog-error";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter } from "@/components/money/dialog-footer";
import { ReasonField, reasonFieldError } from "@/components/money/reason-field";
import { useDialogAction } from "@/lib/use-dialog-action";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";

/** What is being cancelled: the key changes the state of the dialog, the rest is its wording. */
export interface VoidTarget {
  key: string;
  /** «Отменить прощение долга?» */
  title: string;
  /** «Иванов · 21.10.2026 · 40 000 сум» */
  description: string;
  /** Under the reason: what happens to the money (one paragraph each). */
  explain?: ReactNode | ReactNode[];
  /** Label of the red button: «Отменить прощение». */
  action: string;
  /** The words of a failure that has none of its own (the server's sentence comes first): «Не удалось отменить оплату». */
  failure?: string;
  /** `expected`: the debt / the advance the window SHOWED (Money-1 V1); absent for the cancel of a payment, which has no such check. */
  run: (reason: string, expected?: number) => Promise<void>;
  /** The number the window shows and the server checks (debt for a write-off, advance for a refund). */
  expected?: number;
  /** Which number a 409 `BALANCE_CHANGED` carries for this cancel. */
  expectedKind?: "debt" | "advance";
  /** Said when the fresh number is 0: «Долга больше нет» - there is nothing to cancel. */
  emptyText?: string;
  /** An `ALREADY_VOIDED` (somebody did it first) or a continue after a change: the page reads its data again. */
  onStale?: () => void;
}

/**
 * A reason of 3..500 characters and a red button: the ONE cancel dialog of a payment, a write-off and a refund.  The record stays in the history, grey (said by `explain`).  The window is about the
 * STUDENT's money only (UX pack §5.1-тер): the pay of the teachers is not drawn here, so there is no dry run to wait for.
 */
export function RecordVoidModal({ target, onClose }: { target: VoidTarget | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [expected, setExpected] = useState<number | undefined>(target?.expected);
  const { busy, error, setError, closed, run } = useDialogAction(target?.key ?? null);
  useEffect(() => { setReason(""); setTouched(false); setExpected(target?.expected); }, [target?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = target?.expectedKind ? balanceChangeOf(error, target.expectedKind) : null;
  const voided = alreadyVoidedText(error);

  const submit = async () => {
    if (!target || busy) return;
    const problem = validateReason(reason);
    if (problem) { setTouched(true); if (reason.trim().length >= REASON_MIN) setError(new Error(problem)); return; }
    if (await run(() => target.run(reason.trim(), expected))) onClose();
  };

  const explain = Array.isArray(target?.explain) ? target?.explain : target?.explain ? [target.explain] : [];
  return (
    <Modal
      open={target !== null}
      title={target?.title ?? ""}
      description={target?.description}
      onClose={onClose}
      busy={busy}
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={voided !== null ? (
        // somebody cancelled it first: nothing to confirm, the page reads its data again
        <ConfirmFooter primary={null} cancelLabel="Понятно" onCancel={() => { target?.onStale?.(); onClose(); }} />
      ) : (
        // red: cancelling a payment / a write-off cannot be undone for the money (UX pack, rule 3); the secondary button is «Не отменять»
        <ConfirmFooter primary={target?.action ?? ""} submitFor="record-void-form" tone="danger" busy={busy} disabled={change !== null} why={change ? "Сумма изменилась — нажмите «Продолжить»" : null} whyId="record-void-why" onCancel={onClose} />
      )}
    >
      <form id="record-void-form" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void submit(); }} className="space-y-2 pb-2" noValidate>
        <ReasonField id="record-void-reason" value={reason} onChange={(next) => { setReason(next); setError(null); }} required error={reasonFieldError(reason, touched)} onBlur={() => setTouched(reason.length > 0)} autoFocus maxLength={REASON_MAX} />
        {explain.map((text, index) => <p key={index} className="text-xs text-slate-600">{text}</p>)}
        {voided !== null && <Notice variant="info" compact testId="already-voided">{voided}</Notice>}
        {change && (
          <BalanceChangedNotice
            message={change.message}
            fresh={change.fresh}
            emptyText={target?.emptyText ?? "Отменять нечего"}
            onContinue={() => { setExpected(change.fresh); setError(null); target?.onStale?.(); }}
            onClose={() => { target?.onStale?.(); onClose(); }}
          />
        )}
        {voided === null && !change && <DialogError error={error} closed={closed} text={(cause) => payError(cause, target?.failure ?? "Не удалось отменить").message} onReopened={() => setError(null)} />}
      </form>
    </Modal>
  );
}
