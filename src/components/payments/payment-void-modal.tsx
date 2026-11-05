"use client";

import { orgApi } from "@/lib/api";
import {
  formatDateRu,
  isCarryOver,
  paymentAmountLabel,
  type MembershipPaymentRow,
  type PaymentOut,
} from "@/lib/payments";
import { RecordVoidModal, type VoidTarget } from "./record-void-modal";

/** What the dialog needs to know of the payment (the statement knows no more than this). */
export type VoidablePayment = Pick<PaymentOut, "id" | "paid_on" | "amount"> & Partial<Pick<PaymentOut, "carried_from">>;

/** «Отменить оплату?»: the words and the calls of the cancel of a payment, for the one cancel dialog of money. */
export function paymentVoidTarget(payment: VoidablePayment, studentName: string | undefined, onVoided: (result: { payment: PaymentOut; row: MembershipPaymentRow }) => void): VoidTarget {
  return {
    key: payment.id,
    title: "Отменить оплату?",
    description: `${studentName ? `${studentName} · ` : ""}${formatDateRu(payment.paid_on)} · ${paymentAmountLabel(payment)}`,
    explain: [
      "Запись не удаляется: она останется в истории серым с этой причиной.",
      isCarryOver(payment)
        ? `Исходная оплата в «${payment.carried_from?.group_name}» снова начнёт действовать.`
        : "Деньги группы распределятся заново: долг, аванс и «оплачено до» пересчитаются так, будто этой оплаты не было.",
    ],
    action: "Отменить оплату",
    failure: "Не удалось отменить оплату",
    run: async (reason) => { onVoided(await orgApi.voidPayment(payment.id, reason)); },
  };
}

/** «Отменить оплату»: a reason of 3..500 characters is required; the record stays in the history, grey.  The window is the one of the cancels of money. */
export function PaymentVoidModal({ payment, studentName, onClose, onVoided }: {
  /** The payment to cancel; null keeps the dialog closed. */
  payment: VoidablePayment | null;
  studentName?: string;
  onClose: () => void;
  onVoided: (result: { payment: PaymentOut; row: MembershipPaymentRow }) => void;
}) {
  return <RecordVoidModal target={payment ? paymentVoidTarget(payment, studentName, onVoided) : null} onClose={onClose} />;
}
