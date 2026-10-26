"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  payIsDue,
  PAY_ACTION_LABEL,
  PAYMENT_SAVED_TEXT,
  statementHref,
  membershipChip,
  type MembershipPaymentRow,
  type PaymentSaveResult,
  type PeriodMode,
} from "@/lib/payments";
import { lastPaymentLine } from "@/lib/membership-actions";
import { canPayLeftDebt, openingSummary } from "@/lib/payments-logica";
import { savedPaymentDetails } from "@/lib/payments-ledger";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { markReceiptNavigation } from "@/lib/receipt-nav";
import { PackageProgress } from "./package-progress";
import { Chip } from "@/components/ui/chip";
import { moneyChipTone } from "@/lib/status-registry";
import { BalanceNote } from "./balance-note";
import { MembershipPriceLine } from "./membership-price";
import { MembershipRowActions } from "./membership-row-actions";
import { PaymentDialog, type PaymentFormKind } from "./payment-dialog";

interface MembershipPaymentsProps {
  row: MembershipPaymentRow;
  /** Row 1, left: the name of the group (with its badges and the teacher). */
  heading: ReactNode;
  studentName: string;
  periodMode: PeriodMode;
  /** `/owner/payments` or `/admin/payments`: where the statement and the receipt pages of this workspace live. */
  paymentsBasePath: string;
  /** `/owner/groups` or `/admin/groups`: «Задать цену группы» leads to the group. */
  groupsBasePath: string;
  /**
   * The student is in the archive: history only - no «Внести оплату», no individual price (the server answers 409 «Ученик в
   * архиве — сначала верните его»); the history, with «Отменить» of a mistaken payment, is «Выписка».
   */
  archived?: boolean;
  /** The day the membership started (the card knows it): the opening balance is checked against it. */
  joinedAt?: string | null;
  /** The server accepted a change: the parent replaces the row it holds. */
  onRowChange: (row: MembershipPaymentRow) => void;
  onNotify: (text: string, type?: "success" | "error" | "warning", details?: string[]) => void;
}

/**
 * Money of one membership on the «Оплаты» tab of the student card, ordered by importance (IA audit 22.10):
 *  1. the group, its status chip and the buttons: «Внести оплату» (filled when overdue or never paid, outlined when running), «Выписка»
 *     (THE history of the payments: correct / cancel / receipt / cheque), and «⋯» (`MembershipRowActions`, the same menu as on the
 *     group's «Оплаты» tab: forgive the debt / return the advance, the individual price, the opening balance);
 *  2. the price in a line: «Цена 500 000 сум/мес · цена группы» / «Индивидуальная цена … · причина»;
 *  3. «Последняя оплата: …» - the one line left of the history.
 * A pause is not here: it is a property of the enrolment («Обучение»); the chip only says «На паузе до …».
 * Rendered only for roles that may see money, and only while the server says so.
 */
export function MembershipPayments({ row, heading, studentName, periodMode, paymentsBasePath, groupsBasePath, archived = false, joinedAt = null, onRowChange, onNotify }: MembershipPaymentsProps) {
  const refreshSummary = usePaymentsSummary((state) => state.refresh);
  const pathname = usePathname();
  const editable = row.is_active && !archived;
  const [form, setForm] = useState<{ kind: PaymentFormKind } | null>(null);

  const changed = (next: MembershipPaymentRow) => {
    onRowChange(next);
    void refreshSummary(true);
  };

  const onSaved = (result: PaymentSaveResult) => {
    changed(result.row);
    onNotify(PAYMENT_SAVED_TEXT[form?.kind ?? "create"], "success", savedPaymentDetails(result.allocation));
  };

  const chip = membershipChip(row);
  const due = payIsDue(row);
  const lastLine = lastPaymentLine(row);
  const statement = statementHref(paymentsBasePath, row.membership_id);
  const menu = (
    <MembershipRowActions
      row={row}
      studentName={studentName}
      periodMode={periodMode}
      archived={archived}
      joinedAt={joinedAt}
      onRowChange={(next) => changed(next)}
      onNotify={onNotify}
    />
  );

  return (
    <div className="space-y-2.5">
      {/* Row 1: the group; one chip with the key fact (one line); the actions in one row: «Внести оплату», «Выписка», «⋯».  A phone or a narrow column: the group, under it the chip, then the actions in one row. */}
      <div
        className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 lg:items-start ${
          editable
            ? "lg:grid-cols-[minmax(0,1fr)_auto_auto] [grid-template-areas:'heading_heading'_'status_status'_'actions_actions'] lg:[grid-template-areas:'heading_status_actions']"
            : "[grid-template-areas:'heading_menu']"
        }`}
      >
        <div className="min-w-0 [grid-area:heading]">{heading}</div>
        {editable && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 [grid-area:status] lg:pt-1">
            <Chip tone={moneyChipTone(chip.tone, true)} title={chip.title ?? undefined} testId="membership-chip" className="whitespace-nowrap tabular-nums">{chip.label}</Chip>
            {/* IA audit F2: a pause is managed in «Обучение»; here it is only the chip «На паузе до …» and the way there */}
            {row.paused && (
              <Link href={`${pathname ?? ""}?tab=learning`} data-testid="membership-pause-link" className="text-[11px] font-semibold text-primary-700 hover:underline">Пауза — в «Обучении»</Link>
            )}
          </div>
        )}
        {editable && (
          <div className="flex items-center gap-2 [grid-area:actions] lg:justify-self-end">
            <button
              type="button"
              onClick={() => setForm({ kind: "create" })}
              className={`min-w-0 flex-1 whitespace-nowrap rounded-lg border px-3.5 py-2 text-center text-xs font-semibold lg:flex-none lg:py-1.5 ${
                due
                  ? "border-primary-600 bg-primary-600 text-white hover:bg-primary-700"
                  : "border-primary-200 bg-white text-primary-700 hover:bg-primary-50"
              }`}
            >
              {PAY_ACTION_LABEL}
            </button>
            <Link
              href={statement}
              onClick={() => markReceiptNavigation(row.membership_id)}
              data-testid="membership-statement"
              className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50 lg:py-1.5"
            >
              Выписка
            </Link>
            {menu}
          </div>
        )}
        {!editable && <div className="justify-self-end [grid-area:menu] lg:pt-px">{menu}</div>}
      </div>

      {/* A group the student has left (or an archived student): no status, but the debt or the advance and the statement stay */}
      {!editable && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <BalanceNote row={row} />
          <Link href={statement} onClick={() => markReceiptNavigation(row.membership_id)} className="text-xs font-medium text-primary-700 hover:underline">Выписка</Link>
          {/* S-5: the debt of a student who has left can still be paid (at most the debt) */}
          {canPayLeftDebt(row, archived) && (
            <button
              type="button"
              onClick={() => setForm({ kind: "create" })}
              className="rounded-lg border border-primary-600 bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
            >
              Оплатить долг
            </button>
          )}
        </div>
      )}

      {/* F13: an individual price ends with the stay in the group - said in the leave dialog (settle-block), not on the card (INC-14) */}

      {/* What the student had before ALGO */}
      {row.opening && openingSummary(row.opening) && (
        <p className="text-xs text-slate-500" data-testid="opening-summary">{openingSummary(row.opening)}</p>
      )}

      {/* Row 2: what the student pays */}
      <MembershipPriceLine row={row} periodMode={periodMode} groupsBasePath={groupsBasePath} />
      {/* a package: the count, the bar and what the schedule promises (nothing for a monthly mode) */}
      {editable && <PackageProgress row={row} />}

      {/* IA audit F10: the one line left of the payment history; the history is «Выписка» */}
      {lastLine && <p className="text-xs text-slate-500" data-testid="membership-last-payment">{lastLine}</p>}

      <PaymentDialog
        open={form !== null}
        kind="create"
        membership={{ membership_id: row.membership_id, group_id: row.group_id, student_name: studentName, group_name: row.group_name }}
        payment={null}
        groupsBasePath={groupsBasePath}
        onClose={() => setForm(null)}
        onSaved={onSaved}
        onDuplicate={() => { onNotify("Эта оплата уже внесена"); void refreshSummary(true); }}
      />
    </div>
  );
}
