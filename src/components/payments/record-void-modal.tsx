"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { REASON_MAX } from "@/lib/payments";
import { payError, validateReason } from "@/lib/payments-ledger";
import { effectsAllowConfirm } from "@/lib/money-preview";
import { useMoneyPreview } from "@/lib/use-money-preview";
import { useDialogAction } from "@/lib/use-dialog-action";
import { MoneyEffectsBlock } from "@/components/money/money-effects-block";
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
  /** R3 #15: the dry run of the same request (`?dry_run=true`, any reason text): what the cancel does to the packs and the saved sheets; the red button waits for it. */
  preview?: (signal: AbortSignal) => Promise<unknown>;
}

/**
 * A reason of 3..500 characters and a red button: the ONE cancel dialog of a payment, a write-off and a refund.  The record stays in the history, grey (said by `explain`).  When the
 * target has a `preview`, the window asks the dry run when it opens and the button waits for the answer (the block says «Считаем…» or why it could not).
 */
export function RecordVoidModal({ target, onClose }: { target: VoidTarget | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { busy, error, setError, run } = useDialogAction(target?.key ?? null);
  useEffect(() => { setReason(""); }, [target?.key]);

  const previewRef = target?.preview;
  const effects = useMoneyPreview(target && previewRef ? target.key : null, (signal) => (previewRef ? previewRef(signal) : Promise.reject(new Error("no preview"))));
  const asked = Boolean(target?.preview);
  const allowed = !asked || effectsAllowConfirm(effects.preview);

  const submit = async () => {
    if (!target || busy || !allowed) return;
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
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Назад</button>
          <button
            type="submit"
            form="record-void-form"
            disabled={busy || !allowed}
            className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {target?.action}
          </button>
        </>
      }
    >
      <form id="record-void-form" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void submit(); }} className="space-y-2 pb-2" noValidate>
        <label htmlFor="record-void-reason" className="block text-xs font-semibold text-slate-600">Причина</label>
        <textarea
          id="record-void-reason"
          value={reason}
          onChange={(event) => { setReason(event.target.value); setError(null); }}
          maxLength={REASON_MAX}
          rows={3}
          autoFocus
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
        />
        {explain.map((text, index) => <p key={index} className="text-xs text-slate-500">{text}</p>)}
        {asked && <MoneyEffectsBlock preview={effects.preview} onRetry={effects.retry} variant="payment" />}
        {error !== null && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{typeof error === "string" ? error : payError(error, target?.failure ?? "Не удалось отменить").message}</p>}
      </form>
    </Modal>
  );
}
