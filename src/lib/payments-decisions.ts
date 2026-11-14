// Money-1 V2: «Денежные решения» - who cancelled or corrected a payment, forgave a debt, gave an advance back (and cancelled that), with the reason.  The server (`GET /org/payments/decisions`) says every word;
// this file only reads the answer, names the filter and draws the numbers of a row in one line.
import { formatMoney } from "./money-format";
import { formatDateRu, formatUtcNaiveAsBusinessDateTime } from "./business-time";
import type { ChipTone } from "./chip-tone";

export const DECISIONS_PAGE_SIZE = 25;

export interface DecisionRow {
  id: string;
  /** naive UTC, ISO */
  at: string | null;
  kind: string;
  kind_label: string;
  student_id: string | null;
  student_name: string;
  group_name: string | null;
  amount: number;
  /** A corrected payment: the new sum. */
  new_amount: number | null;
  receipt_no: number | null;
  reason: string | null;
  actor_name: string | null;
  debt_before: number | null;
  debt_after: number | null;
  /** Money-1 Г (Г-4, Р-3): what the decision did to the debt in the OTHER groups of the student, in the server's words («В группе «Вторая» долг вырос на 300 000 сум — до 700 000 сум»); null - nothing to say. */
  consequence: string | null;
}

export interface DecisionsPage {
  as_of: string;
  from: string;
  to: string;
  page: number;
  size: number;
  total: number;
  pages: number;
  /** The business day of the earliest record of the new actions; null - none yet. */
  since: string | null;
  rows: DecisionRow[];
}

export interface DecisionsQuery { from: string; to: string; kind?: string; actor?: string; page?: number; size?: number }

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0);
const numOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null);
const textOf = (value: unknown): string => (typeof value === "string" ? value : "");
const textOrNull = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

export function normalizeDecisions(raw: Partial<DecisionsPage> | null | undefined): DecisionsPage {
  const rows = Array.isArray(raw?.rows) ? raw.rows : [];
  return {
    as_of: textOf(raw?.as_of), from: textOf(raw?.from), to: textOf(raw?.to),
    page: Math.max(1, num(raw?.page)), size: Math.max(1, num(raw?.size) || DECISIONS_PAGE_SIZE), total: num(raw?.total), pages: Math.max(1, num(raw?.pages)),
    since: textOrNull(raw?.since),
    rows: rows.map((row) => ({
      id: textOf(row?.id), at: textOrNull(row?.at), kind: textOf(row?.kind), kind_label: textOf(row?.kind_label), student_id: textOrNull(row?.student_id),
      student_name: textOf(row?.student_name), group_name: textOrNull(row?.group_name), amount: num(row?.amount), new_amount: numOrNull(row?.new_amount),
      receipt_no: numOrNull(row?.receipt_no), reason: textOrNull(row?.reason), actor_name: textOrNull(row?.actor_name),
      debt_before: numOrNull(row?.debt_before), debt_after: numOrNull(row?.debt_after), consequence: textOrNull(row?.consequence),
    })),
  };
}

/** The filter «Вид»: the words of the dictionary and the `kind` of the server. */
export const DECISION_KINDS: Array<{ value: string; label: string }> = [
  { value: "", label: "Все решения" },
  { value: "payment_void", label: "Оплата отменена" },
  { value: "payment_replace", label: "Оплата исправлена" },
  { value: "payment_writeoff", label: "Долг прощён" },
  { value: "payment_writeoff_void", label: "Прощение отменено" },
  { value: "payment_refund", label: "Аванс возвращён" },
  { value: "payment_refund_void", label: "Возврат отменён" },
];

/** Colour = meaning (LESSONS 108): a cancel is quiet, a correction is blue, a forgiveness is amber, a refund is neutral. */
export function decisionTone(kind: string): ChipTone {
  if (kind === "payment_replace") return "info";
  if (kind === "payment_writeoff") return "warn";
  if (kind === "payment_refund") return "neutral";
  return "muted";
}

/** «400 000 сум» / «400 000 → 200 000 сум» (a corrected payment). */
export function decisionAmountText(row: Pick<DecisionRow, "amount" | "new_amount">): string {
  return row.new_amount !== null && row.new_amount !== row.amount ? `${formatMoney(row.amount).replace(/\s*сум$/, "")} → ${formatMoney(row.new_amount)}` : formatMoney(row.amount);
}

/** «долг 0 → 400 000 сум»; a dash when the server did not count it. */
export function decisionDebtText(row: Pick<DecisionRow, "debt_before" | "debt_after">): string {
  if (row.debt_before === null || row.debt_after === null || row.debt_before === row.debt_after) return "—";      // an unchanged debt (0 → 0, N → N) is no news (Money-1 Г, Ф-9)
  return `${formatMoney(row.debt_before).replace(/\s*сум$/, "")} → ${formatMoney(row.debt_after)}`;
}

/** «05.11 · 14:20» on the business clock. */
export function decisionWhen(at: string | null): string {
  const full = formatUtcNaiveAsBusinessDateTime(at);
  const match = /^(\d{2}\.\d{2})\.\d{4} (\d{2}:\d{2})$/.exec(full);
  return match ? `${match[1]} · ${match[2]}` : full;
}

/** «Журнал ведётся с 05.11.2026»; empty while there is no record of the new actions. */
export function decisionsSinceText(since: string | null | undefined): string {
  return since ? `Журнал ведётся с ${formatDateRu(since)}` : "";
}

export const DECISIONS_EMPTY_TEXT = "За этот период денежных решений нет";
export const DECISIONS_FILTERED_EMPTY_TEXT = "По фильтру ничего нет";
