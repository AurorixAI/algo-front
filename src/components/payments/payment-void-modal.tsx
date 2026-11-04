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
import { payError } from "@/lib/payments-ledger";
import { DRY_RUN_REASON } from "@/lib/payment-dry-run";
import { effectsAllowConfirm, effectsWaitReason } from "@/lib/money-preview";
import { useMoneyPreview } from "@/lib/use-money-preview";
import { MoneyEffectsBlock } from "@/components/money/money-effects-block";
import { Modal } from "@/components/ui/modal";

/** What the dialog needs to know of the payment (the statement knows no more than this). */
export type VoidablePayment = Pick<PaymentOut, "id" | "paid_on" | "amount"> & Partial<Pick<PaymentOut, "carried_from">>;

interface PaymentVoidModalProps {
  /** The payment to cancel; null keeps the dialog closed. */
  payment: VoidablePayment | null;
  studentName?: string;
  onClose: () => void;
  onVoided: (result: { payment: PaymentOut; row: MembershipPaymentRow; money_effects?: unknown }) => void;
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

  // R3 #15: what the cancel does to the packs and the saved sheets - the dry run of the same request, asked when the window opens; the button waits for it
  const paymentId = payment?.id ?? null;
  const effects = useMoneyPreview(paymentId, (signal) => (paymentId ? orgApi.dryRunVoidPayment(paymentId, DRY_RUN_REASON, signal) : Promise.reject(new Error("no payment"))));
  const waiting = payment ? effectsWaitReason(effects.preview) : null;

  const submit = async () => {
    if (!payment || busy || !effectsAllowConfirm(effects.preview)) return;
    const problem = validateVoidReason(reason);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.voidPayment(payment.id, reason.trim());
      onVoided(result);
      onClose();
    } catch (cause) {
      // The server's own text: «Сначала отмените возврат: без этой оплаты вернуть нечего» (409 VOID_BREAKS_REFUND) and the like.
      setError(payError(cause, "Не удалось отменить оплату").message);
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
            disabled={busy || !effectsAllowConfirm(effects.preview)}
            aria-describedby={waiting ? "payment-void-wait" : undefined}
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
          <p className="text-xs text-slate-500">Деньги группы распределятся заново: долг, аванс и «оплачено до» пересчитаются так, будто этой оплаты не было.</p>
        )}
        {payment && isCarryOver(payment) && (
          <p className="text-xs text-slate-400">Исходная оплата в «{payment.carried_from?.group_name}» снова начнёт действовать.</p>
        )}
        {payment && <MoneyEffectsBlock preview={effects.preview} onRetry={effects.retry} />}
        {waiting && <p id="payment-void-wait" data-testid="payment-void-wait" className="text-xs text-slate-500">{waiting}</p>}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
      </form>
    </Modal>
  );
}
