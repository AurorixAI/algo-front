/**
 * PAY-TAILS (package Б, screens part 1): THE one place where the screens read what the server's contract Б1.1 / Б1.2 adds - the tab «Аванс», the closed memberships with settlements, the action of a row by its state.
 * Pure (no React): node:test loads it.  While the server does not send a field, the reader returns «nothing» and the screen says nothing (LESSONS 151); when the server does, only THIS file reads it.
 *
 * What is read (artifacts/analysis/PAY_TAILS_SPEC.md):
 *  - `GET /org/payments/summary`: `buckets.advance` (students), `advance_left_students`, `advance_text` (the sub-line of the card) → `advanceSummaryOf`;
 *  - `GET /org/payments/status?bucket=advance[&left_only=true]`: the rows carry `is_active`, `left_on`, `refundable`, `state_text`, `state_sub`; the page `students`, `left_students`, `amount_total` → `advanceLeftOf`;
 *  - a group's closed memberships with ANY settlement (debt, «к оплате», advance) → `fetchGroupSettled` in `lib/paytails-read.ts` (the one request of the contract; it needs the API, so it is apart from this pure file).
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
 * A button the server would refuse is not drawn: a closed membership never gets «Внести оплату» without something to pay (`debt` = debt + due), a refund only with `refundable` > 0.
 */
export function rowActionsOf(row: Pick<MembershipPaymentRow, "is_active" | "debt" | "refundable">, archived = false): RowActionSet {
  const owes = Math.max(0, Math.round(Number(row.debt) || 0)) > 0;
  if (!isClosedRow(row, archived)) return { pay: true, refund: false, menuRefund: canRefund(row) };
  return { pay: owes, refund: !owes && canRefund(row), menuRefund: false };
}

/**
 * PAY-TAILS Б1.2: the closed memberships of a group that still have ANY settlement, from the lists the server gave (a membership may stand in more than one): each once, never an open one, never one without a settlement, never one already among the active rows.
 * The order: the debt first (the biggest), then «к оплате», then the advance (the biggest), then by name.
 */
export function settledRowsOf(lists: ReadonlyArray<ReadonlyArray<MembershipPaymentRow>>, activeIds: ReadonlySet<string>): MembershipPaymentRow[] {
  const seen = new Set<string>();
  const rows: MembershipPaymentRow[] = [];
  for (const row of lists.flat()) {
    const settles = (Number(row.debt_amount) || 0) > 0 || (Number(row.due_amount) || 0) > 0 || (Number(row.advance) || 0) > 0;
    if (row.is_active || !settles || activeIds.has(row.membership_id) || seen.has(row.membership_id)) continue;
    seen.add(row.membership_id);
    rows.push(row);
  }
  const weight = (row: MembershipPaymentRow) => ((Number(row.debt_amount) || 0) > 0 ? 0 : (Number(row.due_amount) || 0) > 0 ? 1 : 2);
  const size = (row: MembershipPaymentRow) => (weight(row) === 2 ? Number(row.advance) || 0 : Number(row.debt) || 0);
  return rows.sort((a, b) => weight(a) - weight(b) || size(b) - size(a) || a.student_name.localeCompare(b.student_name, "ru"));
}

/** «Ушли из группы — расчёт не закрыт 3» - the title of the band (the number is the count of its rows). */
export const SETTLED_BAND_TITLE = "Ушли из группы — расчёт не закрыт";

/** The words of the empty tab «Аванс» (frame 3). */
export const ADVANCE_EMPTY = { title: "Авансов нет", sub: "Никто не оплатил вперёд и возвращать некому" } as const;
