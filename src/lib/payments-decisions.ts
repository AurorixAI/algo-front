// Money-1 V2: «Денежные решения» - who cancelled or corrected a payment, forgave a debt, gave an advance back (and cancelled that), with the reason.  The server (`GET /org/payments/decisions`) says every word;
// this file only reads the answer, names the filter and draws the numbers of a row in one line.
import { formatMoney } from "./money-format";
import { formatDateRu, formatDayMonthRu, formatUtcNaiveAsBusinessDateTime } from "./business-time";
import type { ChipTone } from "./chip-tone";
import { periodShort, restoredNames } from "./transfer-effects";

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
  /** Money-2 Э7: the line of a transfer / a restored payment / a cancelled leaving / a moved pause in the server's words (who is the actor, the date and the sum are in the row); null for the older kinds. */
  text: string | null;
  /** Money-2 fix 3: the structure of a transfer / a moved pause: where from and where to (names), the days of the pause, the numbers of a restored payment, the day of the operation itself, the «Оплата с» that went along, what a cancelled leaving gave back. */
  from_group_name: string | null;
  to_group_name: string | null;
  first_day: string | null;
  last_day: string | null;
  new_receipt_no: number | null;
  /** The day of the operation itself - only when it is not the day of the record. */
  paid_on: string | null;
  carried_pay_from: string | null;
  restored: Record<string, number> | null;
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
      debt_before: numOrNull(row?.debt_before), debt_after: numOrNull(row?.debt_after), consequence: textOrNull(row?.consequence), text: textOrNull(row?.text),
      from_group_name: textOrNull(row?.from_group_name), to_group_name: textOrNull(row?.to_group_name), first_day: textOrNull(row?.first_day), last_day: textOrNull(row?.last_day),
      new_receipt_no: numOrNull(row?.new_receipt_no), paid_on: textOrNull(row?.paid_on), carried_pay_from: textOrNull(row?.carried_pay_from),
      restored: row?.restored && typeof row.restored === "object" && !Array.isArray(row.restored) ? (row.restored as Record<string, number>) : null,
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
  // Money-2 Э7
  { value: "student_transferred", label: "Перевод" },
  { value: "leave_undone", label: "Вернули в день ухода" },
  { value: "payment_restored", label: "Оплата восстановлена" },
  { value: "pause_moved", label: "Пауза перенесена" },
];

/** Colour = meaning (LESSONS 108): a cancel is quiet, a correction is blue, a forgiveness is amber, a refund is neutral. */
export function decisionTone(kind: string): ChipTone {
  if (kind === "payment_replace" || kind === "payment_restored") return "info";
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

/** Money-2 А8: the short name of the new kinds for the chip (the server's `kind_label` of a transfer is a whole sentence); the older kinds keep the server's label. */
const SHORT_KIND_LABEL: Record<string, string> = {
  student_transferred: "Перевод",
  leave_undone: "Вернули в день ухода",
  payment_restored: "Оплата восстановлена",
  pause_moved: "Пауза перенесена",
};
export const decisionKindLabel = (row: Pick<DecisionRow, "kind" | "kind_label">): string => SHORT_KIND_LABEL[row.kind] ?? row.kind_label;

/** A non-breaking space before the arrow: the arrow never starts a line alone. */
const NB = "\u00A0";

/**
 * Money-2 А8 + fix 3: the second line of a new kind from the STRUCTURAL fields of the row only: a transfer «Алгебра 7 → Физика 9» (no source name: «в «Физика 9»»), a moved pause the same plus the days «· 25–28.11»,
 * a restored payment «оплата № 41 → № 44», a cancelled leaving the group.  The sum is in the column «Сумма», the day and the author in their columns: nothing is said twice.  The whole sentence of the server is in
 * the opened row.  When the structure has nothing to say the sentence of the server stands as the line (`null` for the older kinds: their columns say everything).
 */
export function decisionSummary(row: Pick<DecisionRow, "kind" | "group_name" | "receipt_no" | "text"> & Partial<Pick<DecisionRow, "from_group_name" | "to_group_name" | "first_day" | "last_day" | "new_receipt_no">>): string | null {
  if (!SHORT_KIND_LABEL[row.kind]) return null;
  const target = row.to_group_name ?? row.group_name;
  const group = row.group_name ? `«${row.group_name}»` : null;
  const route = row.from_group_name && target ? `${row.from_group_name}${NB}→ ${target}` : target ? `в «${target}»` : null;
  let line: string | null;
  if (row.kind === "payment_restored") line = row.receipt_no !== null ? (row.new_receipt_no != null ? `оплата № ${row.receipt_no}${NB}→ № ${row.new_receipt_no}` : `оплата № ${row.receipt_no}`) : null;
  else if (row.kind === "leave_undone") line = group;
  else if (row.kind === "pause_moved") { const period = periodShort(row.first_day ?? undefined, row.last_day ?? undefined); line = route ? (period ? `${route} · ${period}` : route) : null; }
  else line = route;
  return line ?? row.text;
}

/** «за 02.11»: the day of the operation itself next to the time of the record - only when the server sends it (it differs from the day of the record). */
export function decisionPaidOn(row: Pick<DecisionRow, "paid_on">): string | null {
  const day = row.paid_on ? formatDayMonthRu(row.paid_on) : "";
  return day ? `за ${day}` : null;
}

/** The opened row of a transfer: «Оплата с» that went along with the student. */
export function decisionCarriedPayFrom(row: Pick<DecisionRow, "carried_pay_from">): string | null {
  const day = row.carried_pay_from ? formatDayMonthRu(row.carried_pay_from) : "";
  return day ? `«Оплата с» ${day} перенесена` : null;
}

/** The opened row of a cancelled leaving: what came back («индивидуальная цена, пауза ×2»). */
export function decisionRestoredText(row: Pick<DecisionRow, "restored">): string | null {
  const names = restoredNames(row.restored);
  return names.length > 0 ? `Вернулось: ${names.join(", ")}` : null;
}
