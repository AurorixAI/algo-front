"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import {
  formatDateRu,
  isCarryOver,
  paymentAmountLabel,
  REASON_MAX,
  validateVoidReason,
  type MembershipPaymentRow,
  type PaymentOut,
} from "@/lib/payments";
import { Modal } from "@/components/ui/modal";

interface PaymentVoidModalProps {
  /** The payment to cancel; null keeps the dialog closed. */
  payment: PaymentOut | null;
  studentName?: string;
  onClose: () => void;
  onVoided: (result: { payment: PaymentOut; row: MembershipPaymentRow }) => void;
}

/** «Отменить оплату»: a reason of 3..500 characters is required; the record stays in the history, grey. */
export function PaymentVoidModal({ payment, studentName, onClose, onVoided }: PaymentVoidModalProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setBusy(false);
    setError(null);
  }, [payment?.id]);

  const submit = async () => {
    if (!payment || busy) return;
    const problem = validateVoidReason(reason);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.voidPayment(payment.id, reason.trim());
      onVoided(result);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отменить оплату");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={payment !== null}
      title="Отменить оплату?"
      description={payment ? `${studentName ? `${studentName} · ` : ""}${formatDateRu(payment.paid_on)} · ${paymentAmountLabel(payment)}` : undefined}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Назад</button>
          <button
            type="submit"
            form="payment-void-form"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Отменить оплату
          </button>
        </>
      }
    >
      <form id="payment-void-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-2 pb-2" noValidate>
        <label htmlFor="payment-void-reason" className="block text-xs font-semibold text-slate-600">Причина</label>
        <textarea
          id="payment-void-reason"
          value={reason}
          onChange={(event) => { setReason(event.target.value); setError(null); }}
          maxLength={REASON_MAX}
          rows={3}
          autoFocus
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
        />
        <p className="text-xs text-slate-400">Запись не удаляется: она останется в истории серым с этой причиной.</p>
        {payment && !isCarryOver(payment) && (
          <p className="text-xs text-slate-400">Если оплата переносилась при переводе в другую группу, перенос тоже отменится.</p>
        )}
        {payment && isCarryOver(payment) && (
          <p className="text-xs text-slate-400">Исходная оплата в «{payment.carried_from?.group_name}» снова начнёт действовать.</p>
        )}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}
