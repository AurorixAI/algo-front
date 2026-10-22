"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { REASON_MAX } from "@/lib/payments";
import { payError, validateReason } from "@/lib/payments-ledger";
import { Modal } from "@/components/ui/modal";

/** What is being cancelled: the key changes the state of the dialog, the rest is its wording. */
export interface VoidTarget {
  key: string;
  /** «Отменить прощение долга?» */
  title: string;
  /** «Иванов · 21.10.2026 · 40 000 сум» */
  description: string;
  /** Under the reason: what happens to the money. */
  explain?: ReactNode;
  /** Label of the red button: «Отменить прощение». */
  action: string;
  run: (reason: string) => Promise<void>;
}

/** A reason of 3..500 characters and a red button: the shared cancel dialog of write-offs and refunds (a payment has its own). */
export function RecordVoidModal({ target, onClose }: { target: VoidTarget | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setBusy(false);
    setError(null);
  }, [target?.key]);

  const submit = async () => {
    if (!target || busy) return;
    const problem = validateReason(reason);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      await target.run(reason.trim());
      onClose();
    } catch (cause) {
      setError(payError(cause, "Не удалось отменить").message);
    } finally {
      setBusy(false);
    }
  };

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
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {target?.action}
          </button>
        </>
      }
    >
      <form id="record-void-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-2 pb-2" noValidate>
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
        {target?.explain && <p className="text-xs text-slate-500">{target.explain}</p>}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}
