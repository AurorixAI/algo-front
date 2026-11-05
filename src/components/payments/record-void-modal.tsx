"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { REASON_MAX } from "@/lib/payments";
import { payError, validateReason } from "@/lib/payments-ledger";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter } from "@/components/money/dialog-footer";
import { useDialogAction } from "@/lib/use-dialog-action";
import { Modal } from "@/components/ui/modal";

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
  run: (reason: string) => Promise<void>;
}

/**
 * A reason of 3..500 characters and a red button: the ONE cancel dialog of a payment, a write-off and a refund.  The record stays in the history, grey (said by `explain`).  The window is about the
 * STUDENT's money only (UX pack §5.1-тер): the pay of the teachers is not drawn here, so there is no dry run to wait for.
 */
export function RecordVoidModal({ target, onClose }: { target: VoidTarget | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { busy, error, setError, run } = useDialogAction(target?.key ?? null);
  useEffect(() => { setReason(""); }, [target?.key]);

  const submit = async () => {
    if (!target || busy) return;
    const problem = validateReason(reason);
    if (problem) { setError(problem); return; }
    if (await run(() => target.run(reason.trim()))) onClose();
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
      footer={(
        // red: cancelling a payment / a write-off cannot be undone for the money (UX pack, rule 3); the secondary button is «Не отменять»
        <ConfirmFooter primary={target?.action ?? ""} submitFor="record-void-form" tone="danger" busy={busy} onCancel={onClose} />
      )}
    >
      <form id="record-void-form" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void submit(); }} className="space-y-2 pb-2" noValidate>
        <label htmlFor="record-void-reason" className="block text-xs font-semibold text-slate-600">Причина (обязательно)</label>
        <textarea
          id="record-void-reason"
          value={reason}
          onChange={(event) => { setReason(event.target.value); setError(null); }}
          maxLength={REASON_MAX}
          rows={3}
          autoFocus
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
        />
        {explain.map((text, index) => <p key={index} className="text-xs text-slate-600">{text}</p>)}
        {error !== null && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{typeof error === "string" ? error : payError(error, target?.failure ?? "Не удалось отменить").message}</p>}
      </form>
    </Modal>
  );
}
