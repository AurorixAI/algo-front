/**
 * «Поступления» (PAY-2): the money a center received in a day or a month, where it went, and what is owed today.
 * Pure rules of the report screen: the period picker, the query, the empty days the server leaves out, the figures
 * that open a list of payments, the reconciliation line.  The report itself is computed by the server.
 */
import { addDays, daysBetween, formatDateRu, formatMoney, isIsoDate } from "./payments";
import { sum, methodLabel } from "./payments-ledger";
import { capitalizeFirst, monthYearLabelRu } from "./business-time";
import type {
  BalancesPage,
  BalanceRow,
  ReceiptItem,
  ReceiptItemsQuery,
  ReceiptItems,
  ReceiptsByMethod,
  ReceiptsColumn,
  ReceiptsGroupRow,
  ReceiptsMoneyColumns,
  ReceiptsPosition,
  ReceiptsQuery,
  ReceiptsReport,
  ReceiptsSeriesPoint,
  ReceiptsTeacherRow,
  ReceiptsTotals,
  Reconciliation,
  ReconciliationCheck,
  PayMethod,
} from "./payments";

// ── Period picker ──────────────────────────────────────────────────────────

/** A day, a calendar month or any range up to a year. */
export type IncomePeriodKind = "day" | "month" | "range";

export interface IncomePeriod {
  kind: IncomePeriodKind;
  /** First day (`YYYY-MM-DD`); for a month: its first day. */
  from: string;
  to: string;
}

export const INCOME_PERIOD_KINDS: Array<{ key: IncomePeriodKind; label: string }> = [
  { key: "day", label: "День" },
  { key: "month", label: "Месяц" },
  { key: "range", label: "Период" },
];

/** The server accepts a range of at most 366 days and a day-by-day series of at most 92. */
export const MAX_RANGE_DAYS = 366;
export const MAX_DAILY_DAYS = 92;

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string): string {
  const [year, month] = iso.slice(0, 7).split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export function shiftMonth(iso: string, delta: number): string {
  const [year, month] = iso.slice(0, 7).split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
}

/** The period of `kind` that holds `anchor`: today → «День», this month → «Месяц». */
export function periodOf(kind: IncomePeriodKind, anchor: string, current?: IncomePeriod): IncomePeriod {
  if (kind === "day") return { kind, from: anchor, to: anchor };
  if (kind === "month") return { kind, from: monthStart(anchor), to: monthEnd(anchor) };
  return { kind, from: current?.from ?? monthStart(anchor), to: current?.to ?? anchor };
}

/** One step back / forward: a day, a month, or a range of the same length. */
export function stepPeriod(period: IncomePeriod, delta: 1 | -1): IncomePeriod {
  if (period.kind === "day") {
    const day = addDays(period.from, delta);
    return { kind: "day", from: day, to: day };
  }
  if (period.kind === "month") {
    const first = shiftMonth(period.from, delta);
    return { kind: "month", from: first, to: monthEnd(first) };
  }
  const length = daysBetween(period.from, period.to) + 1;
  return { kind: "range", from: addDays(period.from, delta * length), to: addDays(period.to, delta * length) };
}

export function validatePeriod(period: IncomePeriod): string | null {
  if (!isIsoDate(period.from) || !isIsoDate(period.to)) return "Укажите даты периода";
  if (period.to < period.from) return "Конец периода раньше начала";
  if (daysBetween(period.from, period.to) + 1 > MAX_RANGE_DAYS) return "Период не длиннее года";
  return null;
}

/** «21.10.2026» / «Октябрь 2026 г.» / «01.10.2026 — 21.10.2026». */
export function periodTitle(period: IncomePeriod): string {
  if (period.kind === "month") return capitalizeFirst(monthYearLabelRu(period.from.slice(0, 7)));
  if (period.kind === "day") return formatDateRu(period.from);
  return `${formatDateRu(period.from)} — ${formatDateRu(period.to)}`;
}

/** Day-by-day for up to 92 days, month-by-month for a longer range. */
export function groupByFor(period: IncomePeriod): "day" | "month" {
  return daysBetween(period.from, period.to) + 1 > MAX_DAILY_DAYS ? "month" : "day";
}

export interface IncomeFilters {
  method: string;
  groupId: string;
  teacherId: string;
}

export const NO_FILTERS: IncomeFilters = { method: "", groupId: "", teacherId: "" };

export function reportQuery(period: IncomePeriod, filters: IncomeFilters): ReceiptsQuery {
  const query: ReceiptsQuery = { from: period.from, to: period.to, group_by: groupByFor(period) };
  if (filters.method) query.method = filters.method;
  if (filters.groupId) query.group_id = filters.groupId;
  if (filters.teacherId) query.teacher_id = filters.teacherId;
  return query;
}

// ── Reading the report ─────────────────────────────────────────────────────

const ZERO_COLUMNS: ReceiptsMoneyColumns = { received: 0, refunded: 0, to_past_debt: 0, to_current: 0, to_advance: 0, written_off: 0, count: 0 };

function columns(row: Partial<ReceiptsMoneyColumns> | null | undefined): ReceiptsMoneyColumns {
  return {
    received: sum(row?.received),
    refunded: sum(row?.refunded),
    to_past_debt: sum(row?.to_past_debt),
    to_current: sum(row?.to_current),
    to_advance: sum(row?.to_advance),
    written_off: sum(row?.written_off),
    count: sum(row?.count),
  };
}

const arr = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export function normalizeReport(raw: ReceiptsReport): ReceiptsReport {
  const totals: Partial<ReceiptsTotals> = raw?.totals ?? {};
  const position: Partial<ReceiptsPosition> = raw?.position ?? {};
  const reconciliation: Partial<Reconciliation> = raw?.reconciliation ?? {};
  const received = sum(totals.received);
  const refunded = sum(totals.refunded);
  return {
    ...raw,
    totals: {
      received,
      refunded,
      refunded_from_received: totals.refunded_from_received === undefined ? refunded : sum(totals.refunded_from_received),
      net_received: totals.net_received === undefined ? received - refunded : sum(totals.net_received),
      to_past_debt: sum(totals.to_past_debt),
      to_current: sum(totals.to_current),
      to_advance: sum(totals.to_advance),
      written_off: sum(totals.written_off),
      payments_count: sum(totals.payments_count),
    },
    by_method: arr<ReceiptsByMethod>(raw?.by_method).map((item) => ({ method: item.method, amount: sum(item.amount), count: sum(item.count) })),
    by_group: arr<ReceiptsGroupRow>(raw?.by_group).map((item) => ({ ...item, ...columns(item), teacher_id: item.teacher_id ?? null, teacher_name: item.teacher_name ?? null })),
    by_teacher: arr<ReceiptsTeacherRow>(raw?.by_teacher).map((item) => ({ ...item, ...columns(item), teacher_id: item.teacher_id ?? null, teacher_name: item.teacher_name ?? null })),
    series: arr<ReceiptsSeriesPoint>(raw?.series).map((item) => ({ ...item, ...columns(item), by_method: item.by_method ?? {} })),
    position: {
      debt_total: sum(position.debt_total),
      past_debt_total: sum(position.past_debt_total),
      advance_total: sum(position.advance_total),
      memberships_with_debt: sum(position.memberships_with_debt),
      students_with_debt: sum(position.students_with_debt),
      memberships_with_advance: sum(position.memberships_with_advance),
    },
    reconciliation: {
      ok: reconciliation.ok !== false,
      checks: arr<ReconciliationCheck>(reconciliation.checks).map((check) => ({ ...check, left: sum(check.left), right: sum(check.right), diff: sum(check.diff) })),
    },
  };
}

export function normalizeItems(raw: ReceiptItems): ReceiptItems {
  return {
    items: arr<ReceiptItem>(raw?.items).map((item) => ({ ...item, amount: sum(item.amount), column_amount: sum(item.column_amount), allocations: arr(item.allocations) })),
    total: sum(raw?.total),
    limit: sum(raw?.limit),
    offset: sum(raw?.offset),
  };
}

export function normalizeBalances(raw: BalancesPage): BalancesPage {
  return {
    items: arr<BalanceRow>(raw?.items).map((item) => ({
      ...item,
      debt: sum(item.debt),
      past_debt: sum(item.past_debt),
      current_due: sum(item.current_due),
      advance: sum(item.advance),
      refundable: sum(item.refundable),
    })),
    total: sum(raw?.total),
    limit: sum(raw?.limit),
    offset: sum(raw?.offset),
  };
}

/** A bucket of the series: `YYYY-MM-DD` (day) or `YYYY-MM` (month). */
export function bucketLabel(bucket: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(bucket)) return formatDateRu(bucket).slice(0, 5);
  if (/^\d{4}-\d{2}$/.test(bucket)) return capitalizeFirst(monthYearLabelRu(bucket));
  return bucket;
}

/** The series has only the days with money: the others are filled with zeros so the table has every day of the period. */
export function fillSeries(report: Pick<ReceiptsReport, "from" | "to" | "group_by" | "series">): ReceiptsSeriesPoint[] {
  const byBucket = new Map(report.series.map((point) => [point.bucket, point]));
  const empty = (bucket: string): ReceiptsSeriesPoint => ({ ...ZERO_COLUMNS, bucket, by_method: {} });
  const out: ReceiptsSeriesPoint[] = [];
  if (report.group_by === "month") {
    let cursor = monthStart(report.from);
    let guard = 0;
    while (cursor <= report.to && guard++ < 60) {
      const key = cursor.slice(0, 7);
      out.push(byBucket.get(key) ?? empty(key));
      cursor = shiftMonth(cursor, 1);
    }
    return out;
  }
  let guard = 0;
  for (let day = report.from; day <= report.to && guard++ < 400; day = addDays(day, 1)) {
    out.push(byBucket.get(day) ?? empty(day));
  }
  return out;
}

// ── Figures that open a list ───────────────────────────────────────────────

export const COLUMN_LABEL: Record<ReceiptsColumn, string> = {
  received: "Поступило",
  to_past_debt: "На долги прошлых периодов",
  to_current: "На текущие периоды",
  to_advance: "В аванс",
  written_off: "Списано",
  refunded: "Возвращено",
};

/** What a figure of the screen opens: a list of payments (`receipts/items`) or a list of balances (`balances`). */
export type DrillTarget =
  | { kind: "items"; column: ReceiptsColumn; bucket?: string; method?: string; groupId?: string; teacherId?: string; title: string }
  | { kind: "balances"; balance: "debt" | "advance"; title: string };

export function itemsDrill(column: ReceiptsColumn, extra: { bucket?: string; method?: string; groupId?: string; teacherId?: string; of?: string } = {}): DrillTarget {
  const of = extra.of ? ` · ${extra.of}` : "";
  return { kind: "items", column, bucket: extra.bucket, method: extra.method, groupId: extra.groupId, teacherId: extra.teacherId, title: `${COLUMN_LABEL[column]}${of}` };
}

export function balancesDrill(balance: "debt" | "advance"): DrillTarget {
  return { kind: "balances", balance, title: balance === "debt" ? "Ученики с долгом" : "Ученики с авансом" };
}

/** Items query of a drill target, inside the period and the filters on screen. */
export function drillQuery(target: Extract<DrillTarget, { kind: "items" }>, period: IncomePeriod, filters: IncomeFilters, offset = 0, limit = 50): ReceiptItemsQuery {
  const query: ReceiptItemsQuery = { from: period.from, to: period.to, column: target.column, limit, offset };
  const method = target.method ?? filters.method;
  const groupId = target.groupId ?? filters.groupId;
  const teacherId = target.teacherId ?? filters.teacherId;
  if (target.bucket) query.bucket = target.bucket;
  if (method) query.method = method;
  if (groupId) query.group_id = groupId;
  if (teacherId) query.teacher_id = teacherId;
  return query;
}

// ── Distribution and reconciliation ────────────────────────────────────────

export interface DistributionRow {
  column: ReceiptsColumn;
  label: string;
  amount: number;
}

/** Where the money went: the part of the received money that closed past debts / the running periods / became an advance. */
export function distributionRows(totals: ReceiptsTotals): DistributionRow[] {
  return ([
    ["to_past_debt", totals.to_past_debt],
    ["to_current", totals.to_current],
    ["to_advance", totals.to_advance],
  ] as Array<[ReceiptsColumn, number]>).map(([column, amount]) => ({ column, label: COLUMN_LABEL[column], amount: sum(amount) }));
}

/**
 * The part of the received money that went back out: refunds and transfers to another group (`refunded_from_received`).
 * Together with the three rows of `distributionRows` it adds up to what was received; null when nothing went back.
 */
export function returnedRow(totals: ReceiptsTotals): { label: string; amount: number } | null {
  const amount = sum(totals.refunded_from_received);
  return amount > 0 ? { label: "Возвращено и переведено в другие группы", amount } : null;
}

/** The days (months) of the series that have money moving: the others are not worth a row of a table. */
export function activeSeries(points: ReceiptsSeriesPoint[]): ReceiptsSeriesPoint[] {
  return points.filter((point) => point.count > 0 || point.received !== 0 || point.refunded !== 0 || point.written_off !== 0 || point.to_past_debt !== 0 || point.to_current !== 0 || point.to_advance !== 0);
}

/** Received − returned equals what was distributed: the first check of the report, kept on screen. */
export function distributionAddsUp(totals: ReceiptsTotals): boolean {
  return sum(totals.received) - sum(totals.refunded_from_received) === sum(totals.to_past_debt) + sum(totals.to_current) + sum(totals.to_advance);
}

export const CHECK_LABEL: Record<ReconciliationCheck["code"], string> = {
  received_eq_allocated_plus_refunded: "Поступило = распределено + возвращено из поступивших",
  charged_minus_paid_eq_debt_minus_advance: "Начислено − оплачено − списано + возвращено = долг − аванс",
  transfers_net_zero: "Переводы между группами в сумме дают ноль",
};

export interface ReconciliationView {
  ok: boolean;
  /** «Сходится» / «Не сходится: расхождение 1 000 сум». */
  text: string;
  failed: Array<{ label: string; diff: string }>;
  lines: Array<{ label: string; left: string; right: string; ok: boolean }>;
}

export function reconciliationView(reconciliation: Reconciliation | null | undefined): ReconciliationView {
  const checks = arr<ReconciliationCheck>(reconciliation?.checks);
  const bad = checks.filter((check) => sum(check.diff) !== 0);
  const ok = reconciliation?.ok !== false && bad.length === 0;
  const total = bad.reduce((acc, check) => acc + Math.abs(sum(check.diff)), 0);
  return {
    ok,
    text: ok ? "Сходится" : bad.length > 0 ? `Не сходится: расхождение ${formatMoney(total)}` : "Не сходится",
    failed: bad.map((check) => ({ label: CHECK_LABEL[check.code] ?? check.code, diff: formatMoney(check.diff) })),
    lines: checks.map((check) => ({
      label: CHECK_LABEL[check.code] ?? check.code,
      left: formatMoney(check.left),
      right: formatMoney(check.right),
      ok: sum(check.diff) === 0,
    })),
  };
}

// ── Items and balances: small wording ──────────────────────────────────────

export const ITEM_TYPE_LABEL: Record<ReceiptItem["type"], string> = {
  payment: "Оплата",
  writeoff: "Списание",
  refund: "Возврат",
};

/** «Оплата № 17 · Наличные» / «Списание» / «Возврат · Наличные». */
export function itemTitle(item: Pick<ReceiptItem, "type" | "receipt_no" | "method">): string {
  const head = item.type === "payment" && item.receipt_no ? `Оплата № ${item.receipt_no}` : ITEM_TYPE_LABEL[item.type];
  return item.type === "writeoff" ? head : `${head} · ${methodLabel(item.method as PayMethod | null)}`;
}

/** The share of a record that lies in the clicked column, when it is not the whole record: «из 500 000 сум». */
export function itemPartNote(item: Pick<ReceiptItem, "amount" | "column_amount">): string | null {
  return sum(item.column_amount) !== sum(item.amount) ? `из ${formatMoney(item.amount)}` : null;
}

// ── Small arithmetic of the screen ─────────────────────────────────────────

/** Whole percent of `part` in `total` («22%»); 0 when there is no total. */
export function sharePercent(part: number, total: number): number {
  const whole = sum(total);
  return whole > 0 ? Math.round((sum(part) * 100) / whole) : 0;
}

/** «+»-free money cell of a table: «—» for zero, otherwise «269 000 сум». */
export function cellMoney(value: number): string {
  return sum(value) === 0 ? "—" : formatMoney(value);
}
