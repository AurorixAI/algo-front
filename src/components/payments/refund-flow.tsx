"use client";

import { useState, type ReactNode } from "react";
import { studentToast } from "@/lib/money-effects";
import { formatMoney, refundDoneText, refundReceiptHref, type MembershipPaymentRow } from "@/lib/payments";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { RefundDialog } from "./refund-dialog";

/**
 * PAY-TAILS Б2.2: the button «Вернуть» of a row of a CLOSED membership with an advance opens the window of the refund that already exists (`RefundDialog`, the same one as «Вернуть аванс» of the «⋯»).
 * ONE flow for the student's card and the group's tab (they own no dialog of their own, IA audit F1 / F13): `open(row)` from the button, `dialog` rendered once by the list.  The toasts are the ones of the «⋯».
 */
export function useRefundFlow({ onRowChange, onNotify, onDuplicate, paymentsBasePath }: {
  /** The server accepted the refund: the list replaces the row it holds. */
  onRowChange: (row: MembershipPaymentRow) => void;
  onNotify: (text: string, type?: "success" | "error" | "warning", details?: string[], link?: { label: string; href: string }) => void;
  /** The same intention was already written: the list reads its data again. */
  onDuplicate?: () => void;
  paymentsBasePath: string;
}): { open: (row: MembershipPaymentRow) => void; dialog: ReactNode } {
  const [row, setRow] = useState<MembershipPaymentRow | null>(null);
  const dialog = (
    <RefundDialog
      row={row}
      studentName={row?.student_name ?? ""}
      onClose={() => setRow(null)}
      onDone={(result) => { onRowChange(result.row); const note = studentToast([`Возвращено ${formatMoney(result.refund.amount)}`]); onNotify(refundDoneText(result.refund.receipt_no), note.tone, note.details, { label: "Квитанция", href: refundReceiptHref(paymentsBasePath, result.refund.id) }); }}
      onDuplicate={() => { onNotify("Этот возврат уже внесён", "success"); void usePaymentsSummary.getState().refresh(true); onDuplicate?.(); }}
    />
  );
  return { open: setRow, dialog };
}
