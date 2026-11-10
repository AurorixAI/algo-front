"use client";

import { useState } from "react";
import { Eraser, PiggyBank, Tag, Undo2 } from "lucide-react";
import { studentToast } from "@/lib/money-effects";
import { formatMoney, refundDoneText, refundReceiptHref, type MembershipPaymentRow, type PeriodMode } from "@/lib/payments";
import { membershipActionKeys, membershipActionLabel, type MembershipActionKey } from "@/lib/membership-actions";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { OpeningBalanceDialog } from "./opening-balance-dialog";
import { IndividualPriceDialog } from "./membership-price";
import { RefundDialog } from "./refund-dialog";
import { WriteoffDialog } from "./writeoff-dialog";

const ICON = { writeoff: Eraser, refund: Undo2, price: Tag, opening: PiggyBank } as const;

export interface MembershipRowActionsProps {
  row: MembershipPaymentRow;
  studentName: string;
  periodMode: PeriodMode;
  /** The student is in the archive: nothing here can be changed. */
  archived?: boolean;
  /** The day the membership started (the opening balance is checked against it). */
  joinedAt?: string | null;
  /**
   * The server accepted a change: the parent replaces the row it holds.  `kind` says what was changed (the group tab reads who set
   * the price again after `price`).
   */
  onRowChange: (row: MembershipPaymentRow, kind: MembershipActionKey) => void;
  onNotify: (text: string, type?: "success" | "error" | "warning", details?: string[], link?: { label: string; href: string }) => void;
  /** `/owner/payments` or `/admin/payments`: where the toast after a refund leads («Квитанция»). */
  paymentsBasePath?: string;
  /** Where the menu is placed: «Действия по оплате: …» is the accessible name (the e2e specs find the button by it). */
  label?: string;
}

/**
 * IA audit F1 / F13: THE «⋯» of a membership row and the dialogs it opens.  The student card and the group's «Оплаты» tab both render
 * this component, so the two menus are the same list by construction (`membershipActionKeys`).
 */
export function MembershipRowActions({ row, studentName, periodMode, archived = false, joinedAt = null, onRowChange, onNotify, label, paymentsBasePath }: MembershipRowActionsProps) {
  const [open, setOpen] = useState<MembershipActionKey | null>(null);
  const accountingStart = usePaymentsSummary((state) => state.accountingStart);
  const close = () => setOpen(null);
  const keys = membershipActionKeys(row, { archived });
  const items: RowMenuItem[] = keys.map((key) => ({
    key,
    label: membershipActionLabel(key, row),
    icon: ICON[key],
    onSelect: () => setOpen(key),
  }));

  return (
    <>
      <RowMenu items={items} label={label ?? `Действия по оплате: ${row.group_name}`} width={260} />
      <WriteoffDialog
        row={open === "writeoff" ? row : null}
        studentName={studentName}
        onClose={close}
        onDone={(result) => { onRowChange(result.row, "writeoff"); const note = studentToast([`Долг был ${formatMoney(result.debt_before)}, стал ${formatMoney(result.debt_after)}`]); onNotify("Долг прощён", note.tone, note.details); }}
        onDuplicate={() => { onNotify("Это прощение уже внесено", "success"); void usePaymentsSummary.getState().refresh(true); }}
      />
      <RefundDialog
        row={open === "refund" ? row : null}
        studentName={studentName}
        onClose={close}
        onDone={(result) => { onRowChange(result.row, "refund"); const note = studentToast([`Возвращено ${formatMoney(result.refund.amount)}`]); onNotify(refundDoneText(result.refund.receipt_no), note.tone, note.details, paymentsBasePath ? { label: "Квитанция", href: refundReceiptHref(paymentsBasePath, result.refund.id) } : undefined); }}
        onDuplicate={() => { onNotify("Этот возврат уже внесён", "success"); void usePaymentsSummary.getState().refresh(true); }}
      />
      <IndividualPriceDialog
        open={open === "price"}
        row={row}
        studentName={studentName}
        periodMode={periodMode}
        onClose={close}
        onRowChange={(next) => onRowChange(next, "price")}
        onNotify={onNotify}
      />
      <OpeningBalanceDialog
        open={open === "opening"}
        membershipId={row.membership_id}
        studentName={studentName}
        groupName={row.group_name}
        opening={row.opening ?? null}
        enrolDate={joinedAt}
        accountingStart={accountingStart}
        onClose={close}
        onSaved={(next, removed) => {
          if (next) onRowChange(next, "opening");
          onNotify(removed ? "Остаток на начало убран" : "Остаток на начало сохранён", "success");
        }}
      />
    </>
  );
}
