/**
 * PAY-TAILS (package Б, screens part 1): THE one place where the screens read what the server's contract Б1.1 / Б1.2 adds - the tab «Аванс», the closed memberships with settlements, the action of a row by its state.
 * Pure (no React): node:test loads it.  While the server does not send a field, the reader returns «nothing» and the screen says nothing (LESSONS 151); when the server does, only THIS file reads it.
 *
 * What is read (artifacts/analysis/PAY_TAILS_SPEC.md):
 *  - `GET /org/payments/summary`: `buckets.advance` (students), `advance_left_students`, `advance_text` (the sub-line of the card) → `advanceSummaryOf`;
 *  - `GET /org/payments/status?bucket=advance[&left_only=true]`: the rows carry `is_active`, `left_on`, `advance`, `state_text`, `state_sub`; the page `students`, `left_students`, `amount_total` → `advanceLeftOf`;
 *  - a group's closed memberships with ANY settlement (debt, «к оплате», advance) → ONE request `status?group_id=&bucket=left_open`, the number `left_count` → `fetchGroupSettled` in `lib/paytails-read.ts` (the one request of the contract; it needs the API, so it is apart from this pure file).
 */
import { canRefund } from "./payments-ledger";
import type { MembershipPaymentRow, PaymentsStatusList, PaymentsSummary } from "./payments";

const optionalCount = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null);
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** What the summary says about the advance: the students (the number of the tab), how many left, and the server's sub-line of the card. */
export interface AdvanceSummary {
  students: number | null;
  leftStudents: number | null;
  /** The server's sub-line («5 учеников · из них 4 ушли»); "" at zero; null - an older server did not send it. */
  text: string | null;
}

export function advanceSummaryOf(summary: Pick<Partial<PaymentsSummary>, "buckets" | "advance_left_students" | "advance_text" | "students_with_advance"> | null | undefined): AdvanceSummary {
  const raw = summary?.advance_text;
  return {
    students: optionalCount(summary?.buckets?.advance) ?? optionalCount(summary?.students_with_advance),
    leftStudents: optionalCount(summary?.advance_left_students),
    text: typeof raw === "string" ? raw.trim() : null,
  };
}

/** How many of the students of the list left (`left_students` of the page): null while the server does not send it - the toggle «Все / Ушедшие» is then not drawn. */
export function advanceLeftOf(page: Pick<PaymentsStatusList, "left_students"> | null | undefined): number | null {
  return optionalCount(page?.left_students);
}

/** `left_count` of `status?group_id=…&bucket=left_open`: how many closed memberships of the group still have a settlement (the number of the band); null while the server does not say it. */
export function leftCountOf(page: Pick<Partial<PaymentsStatusList>, "left_count"> | null | undefined): number | null {
  return optionalCount(page?.left_count);
}

/** The membership is closed: the student left the group or sits in the archive. */
export function isClosedRow(row: Pick<MembershipPaymentRow, "is_active">, archived = false): boolean {
  return !row.is_active || archived;
}

export interface RowActionSet {
  /** «Внести оплату» stands in the row. */
  pay: boolean;
  /** «Вернуть» stands in the row (the window of the refund that already exists). */
  refund: boolean;
  /** «Вернуть аванс» stays in the «⋯» (an open membership with an advance). */
  menuRefund: boolean;
}

/**
 * PAY-TAILS Б2.2: the action of a row by its STATE, the same on every list (the tabs of «Оплаты», the «Оплаты» of a group, the card of a student):
 *  - a closed membership with an advance: «Вернуть» (+ the statement); with a debt or a sum «к оплате»: «Внести оплату»; with nothing left: the statement only;
 *  - an open membership: «Внести оплату», the statement, «⋯» (an advance is given back from the «⋯»).
 * A button the server would refuse is not drawn: a closed membership never gets «Внести оплату» without something to pay (`debt` = debt + due), a refund only with an `advance` > 0.
 */
export function rowActionsOf(row: Pick<MembershipPaymentRow, "is_active" | "debt" | "advance">, archived = false): RowActionSet {
  const owes = Math.max(0, Math.round(Number(row.debt) || 0)) > 0;
  if (!isClosedRow(row, archived)) return { pay: true, refund: false, menuRefund: canRefund(row) };
  return { pay: owes, refund: !owes && canRefund(row), menuRefund: false };
}

/** «Ушли из группы — расчёт не закрыт 3» - the title of the band (the number is the count of its rows). */
export const SETTLED_BAND_TITLE = "Ушли из группы — расчёт не закрыт";

/** The words of the empty tab «Аванс» (frame 3). */
export const ADVANCE_EMPTY = { title: "Авансов нет", sub: "Никто не оплатил вперёд и возвращать некому" } as const;
