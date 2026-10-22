/**
 * IA audit 22.10 (F1, F13): the «⋯» of one membership row - the SAME list on the «Оплаты» tab of the student card and on the
 * «Оплаты» tab of the group page.  Pure: no React, so node:test loads it.  The menu keeps the rare money and accounting actions
 * only (at most three items, one per domain):
 *   1. «Простить долг» or «Вернуть аванс» (money; by the state of the row);
 *   2. «Индивидуальная цена…» (the price: one window with assign / return to the group price / cancel a scheduled one / the history);
 *   3. «Остаток на начало…» (the accounting before ALGO).
 * Not here: «Пауза» (a property of the enrolment: «Обучение»), «История оплат» (the one history is «Выписка»), «История цены»
 * (inside «Индивидуальная цена…»), navigation (links of the row).
 */
import { formatDateRu, isCarryOver, paymentAmountLabel, type MembershipPaymentRow } from "./payments";
import { canRefund, canWriteOff } from "./payments-ledger";

export const WRITEOFF_MENU_LABEL = "Простить долг";
export const REFUND_MENU_LABEL = "Вернуть аванс";
export const INDIVIDUAL_PRICE_MENU_LABEL = "Индивидуальная цена…";
export const OPENING_SET_MENU_LABEL = "Внести остаток на начало…";
export const OPENING_EDIT_MENU_LABEL = "Остаток на начало…";

/** The most items the menu of a membership row may ever have. */
export const MEMBERSHIP_MENU_MAX = 3;

export type MembershipActionKey = "writeoff" | "refund" | "price" | "opening";

export interface MembershipActionInput {
  /** The student is in the archive: history only, nothing can be changed (the server answers 409). */
  archived?: boolean;
}

/**
 * The items of the menu in order.  `writeoff` / `refund` follow the server's own flags (`writeoff_allowed`, `refundable`) and
 * stay for a group the student has left (the debt or the advance remains); the price and the opening balance need an active
 * membership of a student who is not archived.
 */
export function membershipActionKeys(
  row: Pick<MembershipPaymentRow, "is_active" | "debt" | "writeoff_allowed" | "refundable">,
  input: MembershipActionInput = {},
): MembershipActionKey[] {
  const archived = Boolean(input.archived);
  const editable = row.is_active && !archived;
  const out: MembershipActionKey[] = [];
  if (!archived && canWriteOff(row)) out.push("writeoff");
  if (!archived && canRefund(row)) out.push("refund");
  if (editable) out.push("price");
  if (!archived && row.is_active) out.push("opening");
  return out;
}

export function membershipActionLabel(key: MembershipActionKey, row: Pick<MembershipPaymentRow, "opening">): string {
  switch (key) {
    case "writeoff": return WRITEOFF_MENU_LABEL;
    case "refund": return REFUND_MENU_LABEL;
    case "price": return INDIVIDUAL_PRICE_MENU_LABEL;
    case "opening": return row.opening ? OPENING_EDIT_MENU_LABEL : OPENING_SET_MENU_LABEL;
  }
}

/** The labels of the menu, for tests and for any screen that wants to name them. */
export function membershipMenuLabels(
  row: Pick<MembershipPaymentRow, "is_active" | "debt" | "writeoff_allowed" | "refundable" | "opening">,
  input: MembershipActionInput = {},
): string[] {
  return membershipActionKeys(row, input).map((key) => membershipActionLabel(key, row));
}

/**
 * The one line the card keeps of the payment history: «Последняя оплата: 500 000 сум · 12.10.2026» (a carry-over: «… · перенесено 12.10.2026»).
 * The history itself is «Выписка» (one history, with correct / cancel / receipt / cheque).  "" when there is nothing to say.
 */
export function lastPaymentLine(row: Pick<MembershipPaymentRow, "last_payment">): string {
  const last = row.last_payment;
  if (!last || last.voided_at) return "";
  return `Последняя оплата: ${paymentAmountLabel(last)} · ${isCarryOver(last) ? "перенесено " : ""}${formatDateRu(last.paid_on)}`;
}
