/**
 * «Поступления» v2 (INCOME-2, ROADMAP #123).  The screen answers the owner's questions instead of showing every cut at once:
 * how much came in (and is it more or less than last time), how much of the month's price is collected, who owes, how much
 * cash must be in the till, which groups pay badly, what exactly was paid today.
 *
 * Every number comes from the server (`GET /org/payments/income`, `/journal`); this file only chooses the words, the order
 * and the visible parts.  The one arithmetic here is presentation: the percent shares of the «Куда ушли деньги» line
 * (rounded so they add up to 100) and the height of a bar.  Contract: tests/fixtures/income2 (the frozen income2_contract.json).
 * No React and no network here, so node:test loads this file.
 */
import { addDays, daysBetween, formatDateRu, formatMoney, isIsoDate, pluralRu } from "./payments";
import { monthEnd, monthStart, shiftMonth } from "./payments-income";
import { METHODS, sum } from "./payments-ledger";
import { capitalizeFirst, monthYearLabelRu } from "./business-time";

// ── Contract (income2_contract.json) ───────────────────────────────────────

export type PeriodKind = "day" | "week" | "month" | "custom";

export interface IncomePeriodOut {
  kind: PeriodKind;
  from: string;
  to: string;
  label: string;
  days: number;
  in_progress: boolean;
}

export interface IncomeTotals {
  received: number;
  payments_count: number;
  refunded: number;
  refunded_from_received: number;
  transferred: number;
  to_past_debt: number;
  to_current: number;
  to_advance: number;
  written_off: number;
  net_received: number;
}

export interface IncomeMethodRow { method: string; label: string; amount: number; count: number }
export interface IncomeDay { bucket: string; received: number; count: number }

export interface IncomeCash {
  date: string;
  label: string;
  cash_received: number;
  cash_refunded: number;
  expected: number;
  payments_count: number;
  text: string;
  /** `"centre"`: the till is the whole centre's, whatever group / teacher the screen is narrowed to (absent on an older server). */
  scope?: string | null;
  /** The server says the screen is narrowed (a group / teacher filter) while the till is the centre's (absent on an older server). */
  filtered_view?: boolean;
  /** The server's words for a narrowed screen: «в кассе центра за сегодня (все группы)»; null / absent when the screen is not narrowed. */
  scope_text?: string | null;
}

/** One part of «Куда ушли деньги» as the server sends it: its own kind («old_debt», «current», «forward», «advance», …) and its own label. */
export interface IncomeFlowItem { kind: string; label: string; amount: number }

export interface CollectionRow {
  group_id: string | null;
  group_name: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  charged: number;
  paid: number;
  forgiven: number;
  debt: number;
  students: number;
  students_with_debt: number;
  pct: number | null;
}

export interface MonthCollection {
  month: string;
  month_label: string;
  from: string;
  to: string;
  text: string;
  total: CollectionRow;
  groups: CollectionRow[];
}

export interface IncomePosition {
  debt_total: number;
  past_debt_total: number;
  advance_total: number;
  memberships_with_debt: number;
  students_with_debt: number;
  memberships_with_advance: number;
  students_with_advance: number;
}

export interface IncomeCheck { code: string; left: number; right: number; diff: number }

export interface IncomeOverview {
  as_of: string;
  period: IncomePeriodOut;
  previous_period: IncomePeriodOut;
  /** The human name of the comparison period, always present: «вчера», «1–21 сент.», «5–11 окт.», «сентябрь», «прошлая неделя». */
  previous_label: string;
  /** What the comparison means when the period is still running: «тех же дней прошлой недели» (absent on an older server). */
  previous_hint?: string | null;
  current: IncomeTotals;
  previous: IncomeTotals;
  delta_amount: number;
  delta_pct: number | null;
  delta_direction: "up" | "down" | "same" | null;
  delta_text: string | null;
  /** The server's one-sentence answer.  The screen does not show it any more (the cards carry the facts); kept as the contract has it. */
  summary_text: string;
  /** The parts of «Куда ушли деньги» with the server's kinds and labels (absent on an older server: the fixed fields of `current` are used). */
  strip?: IncomeFlowItem[] | null;
  by_method: IncomeMethodRow[];
  series: IncomeDay[];
  series_by: "day" | "month";
  cash: IncomeCash | null;
  collection: MonthCollection | null;
  position: IncomePosition;
  checks: IncomeCheck[];
  ok: boolean;
}

export interface JournalAllocation {
  segment_id: string;
  period_from: string;
  period_to: string;
  amount: number;
  days: number;
  bucket: string;
  closes: boolean;
  label: string;
  price: number | null;
  segment_remaining_after: number | null;
}

export type JournalStatus = "active" | "voided" | "replaced";

export interface JournalRow {
  id: string;
  receipt_no: number | null;
  paid_on: string;
  /** «11:40»; null for a back-dated payment (absent / null on an older server too): no time is shown then. */
  paid_time: string | null;
  created_at: string | null;
  /** «внесена 21.10 в 11:40»: when the payment was entered, said by the server (absent on an older server). */
  entered_at_text?: string | null;
  student_id: string;
  student_name: string;
  display_id: string | null;
  membership_id: string;
  group_id: string;
  group_name: string;
  teacher_name: string | null;
  amount: number;
  method: string;
  method_label: string;
  created_by_id: string | null;
  created_by_name: string | null;
  note: string | null;
  allocation_text: string | null;
  allocations: JournalAllocation[];
  /** The parts of THIS payment by kind (old_debt / current / forward / advance / …) with the server's labels; absent on an older server. */
  split?: IncomeFlowItem[];
  refunded: number;
  transferred: number;
  status: JournalStatus;
  replaces_receipt_no: number | null;
  replaces_amount: number | null;
  replaced_by_receipt_no: number | null;
  void_reason: string | null;
  voided_at: string | null;
  voided_by_name: string | null;
  /** The correction this payment made (INC-16; absent on an older server): why, who and when the earlier payment was replaced by this one. */
  replaces_reason?: string | null;
  corrected_by_name?: string | null;
  corrected_at?: string | null;
}

export interface JournalAuthor { user_id: string; name: string | null; count: number }
/** `count` / `sum` are the live payments; `voided_count` the cancelled ones and `replaced_count` the corrected ones of the same set (INC-16: absent on an older server = 0). */
export interface JournalTotals { count: number; sum: number; voided_count: number; replaced_count?: number }

export interface PaymentsJournal {
  as_of: string;
  from: string;
  to: string;
  page: number;
  size: number;
  total: number;
  pages: number;
  totals: JournalTotals;
  rows: JournalRow[];
  authors: JournalAuthor[];
}

export const JOURNAL_PAGE_SIZE = 25;

// ── Tolerant readers (an unexpected null never becomes NaN on screen) ──────

const arr = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const nullableText = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

const TOTALS_ZERO: IncomeTotals = {
  received: 0, payments_count: 0, refunded: 0, refunded_from_received: 0, transferred: 0,
  to_past_debt: 0, to_current: 0, to_advance: 0, written_off: 0, net_received: 0,
};

function totalsOf(raw: Partial<IncomeTotals> | null | undefined): IncomeTotals {
  const out = { ...TOTALS_ZERO };
  for (const key of Object.keys(TOTALS_ZERO) as Array<keyof IncomeTotals>) out[key] = sum(raw?.[key]);
  return out;
}

function periodOut(raw: Partial<IncomePeriodOut> | null | undefined): IncomePeriodOut {
  return {
    kind: (raw?.kind ?? "custom") as PeriodKind,
    from: text(raw?.from), to: text(raw?.to), label: text(raw?.label), days: sum(raw?.days), in_progress: raw?.in_progress === true,
  };
}

function collectionRow(raw: Partial<CollectionRow> | null | undefined): CollectionRow {
  return {
    group_id: raw?.group_id ?? null, group_name: raw?.group_name ?? null, teacher_id: raw?.teacher_id ?? null, teacher_name: raw?.teacher_name ?? null,
    charged: sum(raw?.charged), paid: sum(raw?.paid), forgiven: sum(raw?.forgiven), debt: sum(raw?.debt),
    students: sum(raw?.students), students_with_debt: sum(raw?.students_with_debt),
    pct: raw?.pct === null || raw?.pct === undefined ? null : sum(raw.pct),
  };
}

export function normalizeOverview(raw: IncomeOverview): IncomeOverview {
  const cash = raw?.cash ?? null;
  const collection = raw?.collection ?? null;
  const position: Partial<IncomePosition> = raw?.position ?? {};
  return {
    as_of: text(raw?.as_of),
    period: periodOut(raw?.period),
    previous_period: periodOut(raw?.previous_period),
    previous_label: text(raw?.previous_label) || text(raw?.previous_period?.label),
    previous_hint: nullableText(raw?.previous_hint),
    current: totalsOf(raw?.current),
    previous: totalsOf(raw?.previous),
    delta_amount: sum(raw?.delta_amount),
    delta_pct: raw?.delta_pct === null || raw?.delta_pct === undefined ? null : sum(raw.delta_pct),
    delta_direction: raw?.delta_direction === "up" || raw?.delta_direction === "down" || raw?.delta_direction === "same" ? raw.delta_direction : null,
    delta_text: nullableText(raw?.delta_text),
    summary_text: text(raw?.summary_text),
    strip: Array.isArray(raw?.strip) ? raw.strip.map((item) => ({ kind: text(item?.kind), label: text(item?.label), amount: sum(item?.amount) })) : null,
    by_method: arr<IncomeMethodRow>(raw?.by_method).map((item) => ({ method: text(item.method), label: text(item.label), amount: sum(item.amount), count: sum(item.count) })),
    series: arr<IncomeDay>(raw?.series).map((item) => ({ bucket: text(item.bucket), received: sum(item.received), count: sum(item.count) })),
    series_by: raw?.series_by === "month" ? "month" : "day",
    cash: cash ? { date: text(cash.date), label: text(cash.label), cash_received: sum(cash.cash_received), cash_refunded: sum(cash.cash_refunded), expected: sum(cash.expected), payments_count: sum(cash.payments_count), text: text(cash.text), scope: nullableText(cash.scope), filtered_view: cash.filtered_view === true, scope_text: nullableText(cash.scope_text) } : null,
    collection: collection ? {
      month: text(collection.month), month_label: text(collection.month_label), from: text(collection.from), to: text(collection.to), text: text(collection.text),
      total: collectionRow(collection.total), groups: arr<CollectionRow>(collection.groups).map(collectionRow),
    } : null,
    position: {
      debt_total: sum(position.debt_total), past_debt_total: sum(position.past_debt_total), advance_total: sum(position.advance_total),
      memberships_with_debt: sum(position.memberships_with_debt), students_with_debt: sum(position.students_with_debt),
      memberships_with_advance: sum(position.memberships_with_advance), students_with_advance: sum(position.students_with_advance),
    },
    checks: arr<IncomeCheck>(raw?.checks).map((check) => ({ code: text(check.code), left: sum(check.left), right: sum(check.right), diff: sum(check.diff) })),
    ok: raw?.ok !== false,
  };
}

function journalRow(raw: JournalRow): JournalRow {
  const status: JournalStatus = raw.status === "voided" || raw.status === "replaced" ? raw.status : "active";
  return {
    id: text(raw.id), receipt_no: raw.receipt_no ?? null, paid_on: text(raw.paid_on), paid_time: nullableText(raw.paid_time), created_at: nullableText(raw.created_at), entered_at_text: nullableText(raw.entered_at_text),
    student_id: text(raw.student_id), student_name: text(raw.student_name), display_id: nullableText(raw.display_id), membership_id: text(raw.membership_id),
    group_id: text(raw.group_id), group_name: text(raw.group_name), teacher_name: nullableText(raw.teacher_name),
    amount: sum(raw.amount), method: text(raw.method), method_label: text(raw.method_label),
    created_by_id: nullableText(raw.created_by_id), created_by_name: nullableText(raw.created_by_name), note: nullableText(raw.note),
    allocation_text: nullableText(raw.allocation_text), allocations: arr<JournalAllocation>(raw.allocations),
    split: arr<IncomeFlowItem>(raw.split).map((part) => ({ kind: text(part?.kind), label: text(part?.label), amount: sum(part?.amount) })),
    refunded: sum(raw.refunded), transferred: sum(raw.transferred), status,
    replaces_receipt_no: raw.replaces_receipt_no ?? null, replaces_amount: raw.replaces_amount ?? null, replaced_by_receipt_no: raw.replaced_by_receipt_no ?? null,
    void_reason: nullableText(raw.void_reason), voided_at: nullableText(raw.voided_at), voided_by_name: nullableText(raw.voided_by_name),
    replaces_reason: nullableText(raw.replaces_reason), corrected_by_name: nullableText(raw.corrected_by_name), corrected_at: nullableText(raw.corrected_at),
  };
}

export function normalizeJournal(raw: PaymentsJournal): PaymentsJournal {
  const totals: Partial<JournalTotals> = raw?.totals ?? {};
  return {
    as_of: text(raw?.as_of), from: text(raw?.from), to: text(raw?.to),
    page: Math.max(1, sum(raw?.page)), size: Math.max(1, sum(raw?.size) || JOURNAL_PAGE_SIZE), total: sum(raw?.total), pages: Math.max(1, sum(raw?.pages)),
    totals: { count: sum(totals.count), sum: sum(totals.sum), voided_count: sum(totals.voided_count), replaced_count: sum(totals.replaced_count) },
    rows: arr<JournalRow>(raw?.rows).map(journalRow),
    authors: arr<JournalAuthor>(raw?.authors).map((author) => ({ user_id: text(author.user_id), name: nullableText(author.name), count: sum(author.count) })),
  };
}

// ── Period: «День / Неделя / Месяц / Свой период» with arrows ──────────────

export interface Period { kind: PeriodKind; from: string; to: string }

/** The server accepts a range of at most 366 days; longer than 92 days it answers month by month. */
export const MAX_RANGE_DAYS = 366;

/**
 * The period of `kind` that holds `anchor`: a month, one day (only the till of today asks for it), or a custom range that keeps the
 * dates it had.  The screen shows a month (the arrows move by month) or a custom range; there is no week / day switch.
 */
export function periodOf(kind: "day" | "month" | "custom", anchor: string, current?: Period): Period {
  if (kind === "day") return { kind, from: anchor, to: anchor };
  if (kind === "month") return { kind, from: monthStart(anchor), to: monthEnd(anchor) };
  return { kind, from: current?.from ?? monthStart(anchor), to: current?.to ?? anchor };
}

/** One step back / forward: a month, or a custom range of the same length. */
export function stepPeriod(period: Period, delta: 1 | -1): Period {
  if (period.kind === "month") {
    const first = shiftMonth(period.from, delta);
    return { kind: "month", from: first, to: monthEnd(first) };
  }
  const length = daysBetween(period.from, period.to) + 1;
  return { kind: "custom", from: addDays(period.from, delta * length), to: addDays(period.to, delta * length) };
}

/** The forward arrow stops at the period that holds today: there is nothing to read in the future. */
export function canStepForward(period: Period, today: string): boolean {
  return period.to < today;
}

/** The ✕ of the custom chip: back to the month that holds the end of the range (never later than today). */
export function monthOfPeriod(period: Period, today: string): Period {
  return periodOf("month", period.to <= today ? period.to : today);
}

export function validatePeriod(period: Period): string | null {
  if (!isIsoDate(period.from) || !isIsoDate(period.to)) return "Укажите даты периода";
  if (period.to < period.from) return "Конец периода раньше начала";
  if (daysBetween(period.from, period.to) + 1 > MAX_RANGE_DAYS) return "Период не длиннее года";
  return null;
}

const MONTHS_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** «21 октября» (+ « 2025» when the year is not the year of `today`). */
export function dayLabel(iso: string, today: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS_GENITIVE[month - 1]}${iso.slice(0, 4) === today.slice(0, 4) ? "" : ` ${year}`}`;
}

/** The title between the arrows: «Октябрь 2026 г.».  A custom range is the chip `rangeChipText`. */
export function periodTitle(period: Period): string {
  if (period.kind === "month") return capitalizeFirst(monthYearLabelRu(period.from.slice(0, 7)));
  return `${formatDateRu(period.from)} — ${formatDateRu(period.to)}`;
}

/** The chip of a custom range: «12.10 – 18.10» (the year is added when the range is not inside the year of `today`). */
export function rangeChipText(period: Pick<Period, "from" | "to">, today: string): string {
  const inYear = period.from.slice(0, 4) === today.slice(0, 4) && period.to.slice(0, 4) === today.slice(0, 4);
  const short = (iso: string) => (inYear ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`);
  return `${short(period.from)} – ${short(period.to)}`;
}

/** Whether the screen is on the month that holds today: only then «Сегодня наличными» is asked for. */
export function isCurrentMonth(period: Period, today: string): boolean {
  return period.kind === "month" && period.from === monthStart(today);
}

/** «За этот день» / «За эту неделю» / «За этот месяц» / «За этот период»: the words of an empty state. */
export function periodWords(kind: PeriodKind): string {
  return kind === "day" ? "За этот день" : kind === "week" ? "За эту неделю" : kind === "month" ? "За этот месяц" : "За этот период";
}

// ── Queries ────────────────────────────────────────────────────────────────

/** The page narrows by the method only (a click on the donut); the centre is never narrowed to a group / teacher here (INC-14). */
export interface IncomeFilters { method: string }
export const NO_FILTERS: IncomeFilters = { method: "" };

export interface IncomeQuery { from: string; to: string; period: PeriodKind; method?: string }

/** The overview never takes the method: the donut «Чем платили» always shows every method; the method narrows only the journal. */
export function overviewQuery(period: Period): IncomeQuery {
  return { from: period.from, to: period.to, period: period.kind };
}

/** The days a click on a bar narrows the journal to (a day, or a month of a long period). */
export interface JournalRange { from: string; to: string; label: string }

export interface JournalQuery {
  from: string;
  to: string;
  page?: number;
  size?: number;
  method?: string;
  created_by?: string;
  q?: string;
  status?: "all" | "active" | "voided";
  /** INC-16: the journal narrowed to the payments that went to this part of «Куда ушли деньги» (old_debt / current / forward / advance). */
  kind?: FlowKind;
}

/** `kind` — a part of the strip chosen by a click; `withVoided` — the toggle «Показать отменённые и исправленные» (off = `status=active`). */
export interface JournalExtras { q: string; createdBy: string; kind?: FlowKind | ""; withVoided?: boolean }
export const NO_JOURNAL_EXTRAS: JournalExtras = { q: "", createdBy: "" };

export function journalQuery(period: Period, range: JournalRange | null, filters: IncomeFilters, extras: JournalExtras, page = 1, size = JOURNAL_PAGE_SIZE): JournalQuery {
  const query: JournalQuery = { from: range?.from ?? period.from, to: range?.to ?? period.to, page, size, status: extras.withVoided ? "all" : "active" };
  if (filters.method) query.method = filters.method;
  if (extras.kind) query.kind = extras.kind;
  if (extras.createdBy) query.created_by = extras.createdBy;
  if (extras.q.trim()) query.q = extras.q.trim();
  return query;
}

/** The file has every row of the filtered set: the page and the size are the screen's, not the file's. */
export function exportQuery(query: JournalQuery): Omit<JournalQuery, "page" | "size"> {
  const { page: _page, size: _size, ...rest } = query;
  return rest;
}

// ── The four cards ─────────────────────────────────────────────────────────

export type Tone = "up" | "down" | "same" | "none";

export interface DeltaView {
  /** «▲» / «▼» / «» (the arrow is the front's; the sentence is the server's). */
  arrow: string;
  text: string;
  tone: Tone;
  /** The long words of a shortened line (the tooltip of line 1); absent when the line is already whole. */
  full?: string;
}

/**
 * «▲ 12% к сентябрю» (green) / «▼ 30% к сентябрю» (red) / «0% к сентябрю» (grey); nothing to compare → a quiet word.
 * A running period: when the server says what the comparison means (`previous_hint`: «тем же дням прошлой недели») it replaces the
 * bare label at the end of the sentence («▲ 170% к тем же дням прошлой недели»).
 */
export function deltaView(overview: IncomeOverview): DeltaView {
  const direction = overview.delta_direction;
  if (overview.delta_text && direction) {
    const text = foldPreviousHint(overview.delta_text, overview);
    if (direction === "up") return { arrow: "▲", text, tone: "up" };
    if (direction === "down") return { arrow: "▼", text, tone: "down" };
    return { arrow: "", text, tone: "same" };
  }
  // No percent to show (the previous period took nothing): a quiet sentence instead.
  if (overview.previous.payments_count > 0) return { arrow: "", tone: "none", text: "" };
  const full = noPaymentsBefore(overview.previous_label);
  const text = shortNoPaymentsBefore(overview);
  return { arrow: "", tone: "none", text, ...(text !== full ? { full } : {}) };
}

/**
 * The quiet line of «nothing to compare with» in ONE line: a running month is «Сентябрь: оплат не было» (the same days of September
 * are the tooltip's words), a custom range «9–15 окт.: оплат не было»; anything else the usual words of `noPaymentsBefore`.
 */
export function shortNoPaymentsBefore(overview: Pick<IncomeOverview, "period" | "previous_period" | "previous_label">): string {
  const from = overview.previous_period.from;
  if (overview.period.kind === "month" && overview.period.in_progress && isIsoDate(from)) {
    return `${capitalizeFirst(MONTHS_NOMINATIVE[Number(from.slice(5, 7)) - 1] ?? "")}: оплат не было`;
  }
  return noPaymentsBefore(overview.period.kind === "custom" && overview.previous_period.label.trim() ? overview.previous_period.label : overview.previous_label);
}

/** «170% к 12–15 окт.» + the hint «тем же дням прошлой недели» → «170% к тем же дням прошлой недели»; no hint, or the label is not at the end: the sentence as it is. */
export function foldPreviousHint(sentence: string, overview: Pick<IncomeOverview, "previous_hint" | "previous_label" | "previous_period">): string {
  const hint = (overview.previous_hint ?? "").trim();
  if (!hint) return sentence;
  for (const label of [overview.previous_period.label, overview.previous_label]) {
    const name = label.trim();
    if (name && sentence.endsWith(` к ${name}`)) return `${sentence.slice(0, sentence.length - name.length)}${hint}`;
  }
  return sentence;
}

const MONTH_PREPOSITIONAL: Record<string, string> = {
  январь: "январе", февраль: "феврале", март: "марте", апрель: "апреле", май: "мае", июнь: "июне",
  июль: "июле", август: "августе", сентябрь: "сентябре", октябрь: "октябре", ноябрь: "ноябре", декабрь: "декабре",
};

/**
 * «Вчера оплат не было» / «На прошлой неделе оплат не было» / «В августе оплат не было» / «В декабре 2025 оплат не было»;
 * any other label («5–11 окт.», «1–21 сент.») is not declined: «5–11 окт.: оплат не было».
 */
export function noPaymentsBefore(label: string): string {
  const name = label.trim();
  if (!name) return "";
  if (name === "вчера") return "Вчера оплат не было";
  if (name === "прошлая неделя") return "На прошлой неделе оплат не было";
  const month = /^([а-яё]+)(?: (\d{4}))?$/i.exec(name);
  if (month && MONTH_PREPOSITIONAL[month[1].toLowerCase()]) return `В ${MONTH_PREPOSITIONAL[month[1].toLowerCase()]}${month[2] ? ` ${month[2]}` : ""} оплат не было`;
  return `${capitalizeFirst(name)}: оплат не было`;
}

/** The tooltip of the delta: a running period is compared like for like — the server's `previous_hint`, else «сравнение с 1–21 сент.»; a closed period says nothing. */
export function compareHint(overview: Pick<IncomeOverview, "period" | "previous_label" | "previous_hint">): string {
  if (!overview.period.in_progress) return "";
  const hint = (overview.previous_hint ?? "").trim();
  if (hint) return `Сравнение с ${hint}`;
  return overview.previous_label ? `сравнение с ${overview.previous_label}` : "";
}

export const DELTA_CLASS: Record<Tone, string> = {
  up: "text-emerald-700",
  down: "text-rose-700",
  same: "text-slate-500",
  none: "text-slate-400",
};

/** «7 оплат» / «1 оплата» / «оплат не было». */
export function paymentsCountText(count: number): string {
  const n = sum(count);
  return n > 0 ? `${n} ${pluralRu(n, "оплата", "оплаты", "оплат")}` : "оплат не было";
}

export interface ReceivedCard {
  amount: string;
  /** Line 1: «▲ 170% к 12–15 окт.» / «В сентябре оплат не было» / (nothing received) «Оплат не было». */
  delta: DeltaView;
  /** Line 2: «10 оплат»; when nothing was received: «22 авг.: 300 000 сум» (what the previous period took), or «» when it took nothing. */
  countText: string;
  /** Not a line of its own: the tooltip of line 1 («Сравнение с тем же дням прошлой недели»). */
  hint: string;
}

/**
 * The card «Поступило» says at most two quiet lines under the number, never the same thing twice:
 * the delta (or the quiet «В сентябре оплат не было»), then the number of payments.  With nothing received the first line is
 * «Оплат не было» and the second one appears only when the previous period took something.
 */
export function receivedCard(overview: IncomeOverview): ReceivedCard {
  const amount = formatMoney(overview.current.received);
  if (overview.current.received === 0 && overview.current.payments_count === 0) {
    const label = overview.previous_label.trim();
    const before = overview.previous.received > 0 && label ? `${capitalizeFirst(label)}: ${formatMoney(overview.previous.received)}` : "";
    return { amount, delta: { arrow: "", text: "Оплат не было", tone: "none" }, countText: before, hint: "" };
  }
  const delta = deltaView(overview);
  return { amount, delta, countText: paymentsCountText(overview.current.payments_count), hint: delta.full ?? compareHint(overview) };
}

export interface CollectedCard {
  /** The accent number: what has been paid of the month's price. */
  amount: string;
  /** «из 2 500 000 сум · 76%»; the server's words when nothing was charged. */
  caption: string;
  /** 0–100 for the bar; null: nothing was charged, no bar. */
  pct: number | null;
}

/** «Собрано за месяц» (month mode only): X из Y (Z%) with a bar; `charged` and `paid` are the server's, the percent too. */
export function collectedCard(overview: IncomeOverview): CollectedCard | null {
  const total = overview.collection?.total;
  if (!total) return null;
  if (total.charged <= 0) return { amount: formatMoney(0), caption: "За этот месяц стоимости нет", pct: null };
  const pct = Math.max(0, Math.min(100, sum(total.pct)));
  return { amount: formatMoney(total.paid), caption: `из ${formatMoney(total.charged)} · ${pct}%`, pct };
}

export interface PositionCard {
  /** The accent: «1 250 000 сум», or the word when there is none. */
  amount: string;
  /** «3 ученика». */
  caption: string;
  none: boolean;
}

const studentsText = (count: number): string => `${count} ${pluralRu(count, "ученик", "ученика", "учеников")}`;

export function debtCard(overview: IncomeOverview): PositionCard {
  const { debt_total: debt, students_with_debt: students } = overview.position;
  return debt > 0 ? { amount: formatMoney(debt), caption: studentsText(students), none: false } : { amount: "Долгов нет", caption: "Все оплатили вовремя", none: true };
}

export function advanceCard(overview: IncomeOverview): PositionCard {
  const { advance_total: advance, students_with_advance: students } = overview.position;
  return advance > 0 ? { amount: formatMoney(advance), caption: `${studentsText(students)} ${pluralRu(students, "оплатил", "оплатили", "оплатили")} вперёд`, none: false } : { amount: "Авансов нет", caption: "Никто не платил вперёд", none: true };
}

/** The «Должники» tab of «Оплаты», narrowed to a group when a row of the collection table leads there. */
export function debtorsHref(paymentsBase: string, scope: { groupId?: string | null } = {}): string {
  const params = new URLSearchParams({ bucket: "debt" });
  if (scope.groupId) params.set("group_id", scope.groupId);
  return `${paymentsBase.replace(/\/+$/, "")}?${params.toString()}`;
}

// ── «Куда ушли деньги»: one line ───────────────────────────────────────────

export interface FlowPart {
  /** The server's kind («old_debt», «current», «forward», «advance», …), or the legacy name of the field; any string. */
  key: string;
  label: string;
  amount: number;
  /** Whole percent of the line; the parts add up to 100. */
  percent: number;
  /** Tailwind background of the bar segment / the dot. */
  dot: string;
}

/** The colour of a kind is fixed (a part keeps its colour whichever parts are present); a kind the front does not know is a neutral grey. */
export const FLOW_DOT: Record<string, string> = {
  old_debt: "bg-slate-700",
  current: "bg-primary-600",
  forward: "bg-violet-500",
  advance: "bg-emerald-600",
  refunded: "bg-amber-400",
  transferred: "bg-slate-300",
  // the older server's field names
  to_past_debt: "bg-slate-700",
  to_current: "bg-primary-600",
  to_advance: "bg-emerald-600",
};
export const FLOW_DOT_UNKNOWN = "bg-slate-400";
export const flowDot = (kind: string): string => FLOW_DOT[kind] ?? FLOW_DOT_UNKNOWN;

/** The fixed fields of an older server, in the order of the line; the words are the front's. */
const LEGACY_FLOW: Array<{ key: string; field: keyof IncomeTotals; label: string }> = [
  { key: "to_past_debt", field: "to_past_debt", label: "на старые долги" },
  { key: "to_current", field: "to_current", label: "на текущие периоды" },
  { key: "to_advance", field: "to_advance", label: "в аванс" },
  { key: "refunded", field: "refunded_from_received", label: "возвращено" },
  { key: "transferred", field: "transferred", label: "переведено в другие группы" },
];

/** The kinds and the words come from the server when it sends `strip`; otherwise the fixed fields of `current`. */
function flowItems(overview: IncomeOverview): Array<{ key: string; label: string; amount: number }> {
  if (overview.strip) return overview.strip.map((item) => ({ key: item.kind, label: item.label || item.kind, amount: item.amount }));
  return LEGACY_FLOW.map((part) => ({ key: part.key, label: part.label, amount: sum(overview.current[part.field]) }));
}

/** Percent shares that add up to exactly 100 (largest remainder); the plain rounding gives 99 or 101 too often. */
export function sharesOf(amounts: number[]): number[] {
  const total = amounts.reduce((acc, value) => acc + value, 0);
  if (total <= 0) return amounts.map(() => 0);
  const exact = amounts.map((value) => (value * 100) / total);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((acc, value) => acc + value, 0);
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    if (amounts[index] > 0) { floors[index] += 1; left -= 1; }
  }
  return floors;
}

/** The parts of the received money that are not zero (a zero part is not shown, no «0%»); the kinds and the labels are whatever the server sends. */
export function flowParts(overview: IncomeOverview): FlowPart[] {
  const present = flowItems(overview).filter((item) => item.amount > 0);
  const shares = sharesOf(present.map((item) => item.amount));
  return present.map((item, index) => ({ key: item.key, label: item.label, amount: item.amount, percent: shares[index], dot: flowDot(item.key) }));
}

/** «Прощено долгов: 100 000 сум», or «» when nobody was forgiven (nothing is said about zero). */
export function writtenOffText(overview: IncomeOverview): string {
  return overview.current.written_off > 0 ? `Прощено долгов: ${formatMoney(overview.current.written_off)}` : "";
}

// ── «Куда ушли деньги»: the sentence, the kinds that filter the journal, the notice and the chips (INC-16) ──

/** The parts of the strip the journal can be narrowed to (the server's param `kind`); «возвращено» / «переведено» have no payment rows of their own. */
export type FlowKind = "old_debt" | "current" | "forward" | "advance";
export const FLOW_KINDS: readonly FlowKind[] = ["old_debt", "current", "forward", "advance"];

/** The kind a strip part filters by: the server's kind, or the field name of an older server; null for a part without journal meaning. */
export function flowKindOf(key: string): FlowKind | null {
  if ((FLOW_KINDS as readonly string[]).includes(key)) return key as FlowKind;
  if (key === "to_past_debt") return "old_debt";
  if (key === "to_current") return "current";
  if (key === "to_advance") return "advance";
  return null;
}

/** The words of a kind: the chip above the journal, the clause of the notice, the label of the button that clears it. */
export const KIND_WORDS: Record<FlowKind, { chip: string; notice: string }> = {
  old_debt: { chip: "Старые долги", notice: "на старые долги" },
  current: { chip: "Текущие периоды", notice: "на текущие периоды" },
  forward: { chip: "Периоды вперёд", notice: "на периоды вперёд" },
  advance: { chip: "Аванс", notice: "в аванс" },
};

/** The insight under the strip says something only when a share is big: old debts take half the money (or more), advances take 30 % (or more). */
export const INSIGHT_OLD_DEBT_PERCENT = 50;
export const INSIGHT_ADVANCE_PERCENT = 30;
export const INSIGHT_OLD_DEBT_TEXT = "Больше половины денег закрыли старые долги — оплаты отстают.";
export const INSIGHT_ADVANCE_TEXT = "Много оплат вперёд — у центра запас на следующие периоды.";

/** One sentence under the strip, or null when nothing is worth saying.  Old debts first (it is the worse news).  Integer arithmetic: no rounding at the edge. */
export function flowInsight(overview: IncomeOverview): string | null {
  const received = sum(overview.current.received);
  if (received <= 0) return null;
  const of = (kind: FlowKind) => flowItems(overview).filter((item) => flowKindOf(item.key) === kind).reduce((acc, item) => acc + item.amount, 0);
  if (of("old_debt") * 100 >= received * INSIGHT_OLD_DEBT_PERCENT) return INSIGHT_OLD_DEBT_TEXT;
  if (of("advance") * 100 >= received * INSIGHT_ADVANCE_PERCENT) return INSIGHT_ADVANCE_TEXT;
  return null;
}

/** What a click on a day / a method / a part of the strip narrowed the journal to. */
export interface FilterState { day?: string | null; method?: string | null; kind?: FlowKind | "" | null }

export const JUMP_TEXT = "К списку ↓";

const lowerFirst = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);

/** «15 октября» stays; a month bar's «Октябрь 2026 г.» is lowered to follow «за». */
export function dayPhrase(label: string): string {
  const value = label.trim();
  return /^[А-ЯЁ][а-яё]+ \d{4}/.test(value) ? lowerFirst(value) : value;
}

/**
 * The inline notice near the clicked widget: «Показаны 5 оплат за 15 октября» (+ «способом Наличные», «на старые долги»), the count from the
 * journal's answer.  The verb agrees with the number: «Показана 1 оплата», «Показаны 2 оплаты», «Показаны 5 оплат», «Показана 21 оплата».
 * `count` null = the answer is on its way.
 */
export function filterNoticeText(input: FilterState & { count: number | null }): string {
  if (input.count === null) return "Загружаю оплаты…";
  const clauses: string[] = [];
  if (input.day) clauses.push(`за ${dayPhrase(input.day)}`);
  if (input.method) clauses.push(`способом ${input.method}`);
  if (input.kind) clauses.push(KIND_WORDS[input.kind].notice);
  const tail = clauses.length > 0 ? ` ${clauses.join(" ")}` : "";
  const n = Math.max(0, Math.round(sum(input.count)));
  if (n === 0) return `Оплат нет${tail}`;
  const one = n % 10 === 1 && n % 100 !== 11;
  return `${one ? "Показана" : "Показаны"} ${n} ${pluralRu(n, "оплата", "оплаты", "оплат")}${tail}`;
}

export interface FilterChip { key: "day" | "method" | "kind"; label: string; clearLabel: string }

/** The chips above the journal: «15 октября ✕», «Наличные ✕», «Старые долги ✕» — they combine, each is removed alone. */
export function filterChips(input: FilterState): FilterChip[] {
  const chips: FilterChip[] = [];
  if (input.day) chips.push({ key: "day", label: input.day, clearLabel: "Показать весь период" });
  if (input.method) chips.push({ key: "method", label: input.method, clearLabel: "Показать все способы" });
  if (input.kind) chips.push({ key: "kind", label: KIND_WORDS[input.kind].chip, clearLabel: "Показать все виды" });
  return chips;
}

/** A click on a part of the strip: the kind is chosen; the same one again clears it. */
export function toggleKind(current: FlowKind | "", clicked: FlowKind): FlowKind | "" {
  return current === clicked ? "" : clicked;
}

/** The server refuses (or does not know) the param `kind`: the strip is then not clickable. */
export function kindRejected(cause: unknown): boolean {
  const status = (cause as { status?: number } | null)?.status;
  return status === 422 || status === 400;
}

/** «К списку ↓» scrolls the page (smoothly, or at once for a visitor who asked for less motion) so that the toolbar of the journal stays visible. */
export const JOURNAL_SCROLL_OFFSET = 88;
export function journalScrollOptions(input: { journalTop: number; scrollY: number; reducedMotion: boolean; offset?: number }): ScrollToOptions {
  const options: ScrollToOptions = { top: Math.max(0, Math.round(input.journalTop + input.scrollY - (input.offset ?? JOURNAL_SCROLL_OFFSET))), behavior: "smooth" };
  if (input.reducedMotion) options.behavior = "auto";
  return options;
}

export const CHECK_LABEL: Record<string, string> = {
  received_eq_strip: "Поступило = куда ушли деньги",
  received_eq_methods: "Поступило = сумма по способам оплаты",
  received_eq_series: "Поступило = сумма по дням",
  received_eq_journal: "Поступило = сумма журнала оплат",
  collection_total_eq_groups: "Стоимость месяца = сумма по группам",
};

export interface CheckView {
  ok: boolean;
  /** «Сходится» / «Не сходится: расхождение 1 000 сум». */
  text: string;
  lines: Array<{ label: string; left: string; right: string; ok: boolean }>;
}

export function checkView(overview: Pick<IncomeOverview, "ok" | "checks">): CheckView {
  const bad = overview.checks.filter((check) => check.diff !== 0);
  const ok = overview.ok && bad.length === 0;
  const gap = bad.reduce((acc, check) => acc + Math.abs(check.diff), 0);
  return {
    ok,
    text: ok ? "Сходится" : gap > 0 ? `Не сходится: расхождение ${formatMoney(gap)}` : "Не сходится",
    lines: overview.checks.map((check) => ({ label: CHECK_LABEL[check.code] ?? check.code, left: formatMoney(check.left), right: formatMoney(check.right), ok: check.diff === 0 })),
  };
}

// ── The chart of income by day ─────────────────────────────────────────────

export interface Bar {
  bucket: string;
  /** Under the bar: «7» (a day of a month), «пн 12» (a week), «окт» (a month). */
  label: string;
  /** The tooltip's first line: «7 октября» / «Октябрь 2026 г.». */
  title: string;
  amount: number;
  count: number;
  /** 0–100; a day with money is never thinner than a sliver. */
  height: number;
  /** After today: nothing to read yet, drawn faint. */
  future: boolean;
  /** The journal range a click opens; null for a day without payments. */
  range: JournalRange | null;
  /** The tooltip's second line: «1 250 000 сум · 1 оплата». */
  detail: string;
}

const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** The chart has something to tell when the period has more than one day and some money. */
export function showChart(overview: IncomeOverview): boolean {
  return overview.series.length > 1 && overview.series.some((point) => point.received !== 0 || point.count > 0);
}

export function chartBars(overview: IncomeOverview, today: string): Bar[] {
  const peak = Math.max(0, ...overview.series.map((point) => point.received));
  const dayBuckets = overview.series_by === "day";
  const week = dayBuckets && overview.series.length <= 7;
  const { from: periodFrom, to: periodTo } = overview.period;
  return overview.series.map((point) => {
    const active = point.received !== 0 || point.count > 0;
    let label: string;
    let title: string;
    let range: JournalRange | null = null;
    if (dayBuckets) {
      const [year, month, day] = point.bucket.split("-").map(Number);
      const weekday = WEEKDAYS_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
      label = week ? `${weekday} ${day}` : String(day);
      title = `${dayLabel(point.bucket, today)}, ${weekday}`;
      range = active ? { from: point.bucket, to: point.bucket, label: dayLabel(point.bucket, today) } : null;
    } else {
      const first = `${point.bucket}-01`;
      const month = Number(point.bucket.split("-")[1]);
      label = MONTHS_SHORT[month - 1] ?? point.bucket;
      title = capitalizeFirst(monthYearLabelRu(point.bucket));
      const from = first < periodFrom ? periodFrom : first;
      const to = monthEnd(first) > periodTo ? periodTo : monthEnd(first);
      range = active ? { from, to, label: title } : null;
    }
    return {
      bucket: point.bucket, label, title, amount: point.received, count: point.count,
      height: peak > 0 && point.received > 0 ? Math.max(4, Math.round((point.received * 100) / peak)) : 0,
      future: dayBuckets && point.bucket > today,
      range,
      detail: active ? `${formatMoney(point.received)} · ${paymentsCountText(point.count)}` : "оплат не было",
    };
  });
}

/**
 * The bar a phone opens the chart at: the last day with money, else today, else the last bar.  The chart is wider than a phone
 * (26 px a day) and must not open on the 1st of the month with every bar of the 13th–22nd behind the right edge.
 */
export function chartFocusIndex(bars: Array<Pick<Bar, "bucket" | "range">>, today: string): number {
  for (let index = bars.length - 1; index >= 0; index -= 1) if (bars[index].range) return index;
  const todayIndex = bars.findIndex((bar) => bar.bucket === today || bar.bucket === today.slice(0, 7));
  return todayIndex >= 0 ? todayIndex : Math.max(0, bars.length - 1);
}

/** `scrollLeft` that brings the right edge of a bar to the right edge of the view (a little air after it); never negative, never past the end. */
export function chartScrollLeft(input: { barRight: number; viewWidth: number; contentWidth: number; air?: number }): number {
  const wanted = input.barRight + (input.air ?? 8) - input.viewWidth;
  return Math.max(0, Math.min(Math.round(wanted), Math.max(0, input.contentWidth - input.viewWidth)));
}

/** The bar that is pressed: the one whose day (month) the journal is narrowed to. */
export function focusBucket(range: JournalRange | null, overview: Pick<IncomeOverview, "series" | "series_by">): string | null {
  if (!range) return null;
  const key = overview.series_by === "month" ? range.from.slice(0, 7) : range.from;
  const bucket = overview.series.find((point) => point.bucket === key)?.bucket ?? null;
  return overview.series_by === "day" && range.to !== range.from ? null : bucket;
}

// ── «Чем платили»: the donut ───────────────────────────────────────────────

/** Calm, distinct colours of the methods: a Tailwind class for the dot and one for the ring (the classes are written out so they are generated). */
export const METHOD_COLOR: Record<string, { dot: string; stroke: string }> = {
  cash: { dot: "bg-emerald-500", stroke: "stroke-emerald-500" },
  card: { dot: "bg-blue-600", stroke: "stroke-blue-600" },
  bank_transfer: { dot: "bg-violet-500", stroke: "stroke-violet-500" },
  click: { dot: "bg-amber-400", stroke: "stroke-amber-400" },
  payme: { dot: "bg-cyan-600", stroke: "stroke-cyan-600" },
  other: { dot: "bg-pink-400", stroke: "stroke-pink-400" },
  unknown: { dot: "bg-slate-400", stroke: "stroke-slate-400" }, // darker than the empty ring track, so a mostly-unknown month does not look empty
};
const METHOD_COLOR_FALLBACK = METHOD_COLOR.unknown;

/** One method of the donut: its part of the ring (degrees, 0 = twelve o'clock, clockwise), its share and its colour. */
export interface MethodSegment {
  method: string;
  label: string;
  amount: number;
  count: number;
  /** Whole percent; the segments add up to 100. */
  percent: number;
  /** «3%», «<1%» for a method that took less than one percent. */
  percentText: string;
  dot: string;
  stroke: string;
  start: number;
  end: number;
  sweep: number;
}

const METHOD_ORDER = ["cash", "card", "bank_transfer", "click", "payme", "other", "unknown"];

/**
 * The segments of the donut, the biggest sum first.  A method that took nothing (zero or less) is not drawn.  The sweeps add up to
 * exactly 360 (the last segment closes the ring); a single method is a whole ring (sweep 360).
 */
export function methodSegments(byMethod: Array<Pick<IncomeMethodRow, "method" | "label" | "amount" | "count">> | null | undefined): MethodSegment[] {
  const present = (byMethod ?? [])
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount || METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method));
  const total = present.reduce((acc, item) => acc + item.amount, 0);
  const shares = sharesOf(present.map((item) => item.amount));
  let start = 0;
  return present.map((item, index) => {
    const last = index === present.length - 1;
    const end = last ? 360 : start + (item.amount * 360) / total;
    const color = METHOD_COLOR[item.method] ?? METHOD_COLOR_FALLBACK;
    const segment: MethodSegment = {
      method: item.method,
      label: item.method === "unknown" ? "Не указан" : item.label || "Способ не указан", // short, so the legend line never truncates
      amount: item.amount,
      count: item.count,
      percent: shares[index],
      percentText: shares[index] > 0 ? `${shares[index]}%` : "<1%",
      dot: color.dot,
      stroke: color.stroke,
      start,
      end,
      sweep: end - start,
    };
    start = end;
    return segment;
  });
}

/** The centre of the donut: the sum of the drawn methods and the number of their payments. */
export function methodsTotal(segments: Array<Pick<MethodSegment, "amount" | "count">>): { amount: number; count: number; amountText: string; countText: string } {
  const amount = segments.reduce((acc, item) => acc + item.amount, 0);
  const count = segments.reduce((acc, item) => acc + item.count, 0);
  return { amount, count, amountText: formatMoney(amount), countText: paymentsCountText(count) };
}

/** The ring of the donut (px of the 180 × 180 box); the centre text is fitted to its inner edge. */
export const DONUT = { size: 180, radius: 80, width: 13, widthActive: 16, clearance: 8 } as const;

/**
 * The sum in the centre: exact below 1 000 000 («850 000 сум»), compact from there with three significant digits at most, the ru comma,
 * trailing zeros trimmed: «3,05 млн сум», «21,4 млн сум», «123 млн сум», «10 млн сум», «1,2 млрд сум».  `title` is always the exact sum.
 */
export function donutCenterAmount(amount: number): { text: string; title: string } {
  const title = formatMoney(amount);
  if (amount < 1_000_000) return { text: title, title };
  // integer arithmetic on the scaled sum (21 450 000 is exactly 21,5; a float's toFixed would give 21,4)
  const scaled = (unit: number) => {
    const value = amount / unit;
    // «млрд» is the longer word: from 10 of them no decimals, so the centre keeps its font
    const factor = value < 10 ? 100 : value < 100 && unit < 1_000_000_000 ? 10 : 1;
    return { rounded: Math.round((amount * factor) / unit), factor };
  };
  const write = ({ rounded, factor }: { rounded: number; factor: number }, unit: string) => {
    const frac = String(rounded % factor).padStart(String(factor).length - 1, "0").replace(/0+$/, "");
    return `${Math.floor(rounded / factor)}${frac ? `,${frac}` : ""} ${unit} сум`;
  };
  const million = scaled(1_000_000);
  if (amount < 1_000_000_000 && million.rounded < 1000 * million.factor) return { text: write(million, "млн"), title };
  return { text: write(scaled(1_000_000_000), "млрд"), title };
}

/** The width of a glyph, em: a digit / a Cyrillic letter 0.6 (wider than the fonts' real average), a space or a comma 0.28. */
const glyphEm = (char: string): number => (/[\s\u00a0\u202f,.]/.test(char) ? 0.28 : 0.6);

/** The farthest corner of the centre block (the amount line at `fontPx`, the 14 px count line below it) from the centre of the ring, px. */
export function donutCenterReach(text: string, fontPx: number): number {
  const width = Array.from(text).reduce((acc, char) => acc + glyphEm(char), 0) * fontPx;
  const height = fontPx * 1.3 + 14;
  return Math.hypot(width / 2, height / 2);
}

/** The biggest font ≤ `cap` whose centre block keeps `DONUT.clearance` px from the inner edge of the (highlighted, thickest) ring. */
export function donutCenterFont(text: string, cap: number): number {
  const room = DONUT.radius - DONUT.widthActive / 2 - DONUT.clearance;
  let font = cap;
  while (font > 9 && donutCenterReach(text, font) > room) font -= 0.25;
  return font;
}

/** «Наличные · 235 000 сум · 1 оплата · 3%»: the tooltip of a segment and the line of the screen reader. */
export function methodTooltip(segment: Pick<MethodSegment, "label" | "amount" | "count" | "percentText">): string {
  return `${segment.label} · ${formatMoney(segment.amount)} · ${paymentsCountText(segment.count)} · ${segment.percentText}`;
}

/** A click on a segment / a legend line: the method is chosen; the same one again clears it. */
export function toggleMethod(current: string, clicked: string): string {
  return current === clicked ? "" : clicked;
}

/** The label of the chip «Наличные ✕» above the journal. */
export function methodChipLabel(method: string, byMethod: Array<Pick<IncomeMethodRow, "method" | "label">> | null | undefined): string {
  const row = (byMethod ?? []).find((item) => item.method === method);
  return row?.label || METHODS.find((item) => item.key === method)?.label || "Способ не указан";
}

/** A whole ring cannot be one SVG arc (its ends coincide): it is drawn as a circle. */
export function isFullRing(segment: Pick<MethodSegment, "sweep">): boolean {
  return segment.sweep >= 359.999;
}

/** The SVG path of an arc of the ring from `start` to `end` degrees (0 = twelve o'clock, clockwise); for a whole ring use a circle. */
export function arcPath(cx: number, cy: number, radius: number, start: number, end: number): string {
  const point = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${(cx + radius * Math.cos(rad)).toFixed(3)} ${(cy + radius * Math.sin(rad)).toFixed(3)}`;
  };
  return `M ${point(start)} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${point(end)}`;
}

/**
 * The quiet line of the donut card on the current month: how much cash must be in the till today (the server's `cash.expected`, the
 * till of the whole centre).  No answer → no line; nothing taken in cash and nothing returned → «Сегодня наличными оплат не было»
 * (never «0 сум»).
 */
export function cashTodayLine(cash: Pick<IncomeCash, "expected" | "cash_received" | "cash_refunded"> | null | undefined): { text: string; note: string | null } | null {
  if (!cash) return null;
  if (cash.expected === 0 && cash.cash_received === 0 && cash.cash_refunded === 0) return { text: "Сегодня наличными оплат не было", note: null };
  return {
    text: `Сегодня наличными: ${formatMoney(cash.expected)} — столько должно быть в кассе`,
    note: cash.cash_refunded > 0 ? `принято ${formatMoney(cash.cash_received)}, возвращено ${formatMoney(cash.cash_refunded)}` : null,
  };
}

// ── «Группы — собираемость» ────────────────────────────────────────────────

export interface CollectionRowView {
  key: string;
  groupId: string | null;
  title: string;
  teacher: string | null;
  charged: number;
  paid: number;
  debt: number;
  debtors: number;
  /** 0–100 or null (nothing charged). */
  pct: number | null;
  pctText: string;
  /** «3 ученика с долгом» / «долгов нет». */
  debtorsText: string;
}

function collectionView(row: CollectionRow, index: number): CollectionRowView {
  return {
    key: row.group_id ?? `row-${index}`,
    groupId: row.group_id,
    title: row.group_name || "Без группы",
    teacher: row.teacher_name,
    charged: row.charged, paid: row.paid, debt: row.debt, debtors: row.students_with_debt,
    pct: row.pct === null ? null : Math.max(0, Math.min(100, row.pct)),
    pctText: row.pct === null ? "" : `${row.pct}%`,
    debtorsText: row.students_with_debt > 0 ? `${row.students_with_debt} ${pluralRu(row.students_with_debt, "ученик", "ученика", "учеников")} с долгом за месяц` : "долгов за месяц нет",
  };
}

/** Worst first: the lowest percent on top; a group with nothing charged has no percent and goes last; ties: the bigger debt first. */
export function collectionRows(collection: MonthCollection | null | undefined): CollectionRowView[] {
  if (!collection) return [];
  return collection.groups
    .map((row, index) => ({ row, view: collectionView(row, index) }))
    .sort((a, b) => {
      const pa = a.row.pct === null ? 101 : a.row.pct;
      const pb = b.row.pct === null ? 101 : b.row.pct;
      return pa - pb || b.row.debt - a.row.debt || a.view.title.localeCompare(b.view.title, "ru");
    })
    .map((item) => item.view);
}

/**
 * Under the total row: the month's debt is not the card «Долг на сегодня» (that one counts the previous months too).
 * «Долг за октябрь — 1 800 000 сум. Всего долг на сегодня — 1 950 000 сум (с прошлыми месяцами).»; null when the two are the same.
 */
export function collectionDebtNote(collection: MonthCollection | null | undefined, debtToday: number | null | undefined): string | null {
  if (!collection || debtToday === null || debtToday === undefined) return null;
  const month = collection.total.debt;
  if (month === debtToday) return null;
  const name = (collection.month_label || "").trim().split(/\s+/)[0].toLowerCase();
  return `Долг ${name ? `за ${name}` : "за месяц"} — ${formatMoney(month)}. Всего долг на сегодня — ${formatMoney(debtToday)} (с прошлыми месяцами).`;
}

export function collectionTotalView(collection: MonthCollection | null | undefined): CollectionRowView | null {
  return collection ? { ...collectionView(collection.total, 0), key: "total", title: "Всего" } : null;
}

/** The small caption above the table of the groups: «Октябрь 2026 · по группам» / «12.10–18.10 · по группам». */
export function collectionCaption(period: Pick<Period, "kind" | "from" | "to">, today: string): string {
  if (period.kind === "month") return `${capitalizeFirst(monthYearLabelRu(period.from.slice(0, 7))).replace(/\s*г\.$/, "")} · по группам`;
  return `${rangeChipText(period, today).replace(" – ", "–")} · по группам`;
}

/** The tooltip of the column «Стоимость» (and of its ⓘ). */
export const COLLECTION_COST_HINT = "Сколько ученики группы должны заплатить за этот месяц: цена × ученики, с учётом индивидуальных цен, пауз и прихода в середине месяца";

/** The same words as one quiet line under the caption of a phone (no popover there). */
export const COLLECTION_COST_LINE = `Стоимость — ${COLLECTION_COST_HINT.charAt(0).toLowerCase()}${COLLECTION_COST_HINT.slice(1)}`;

export const COLLECTION_DEBTORS_TOTAL_TITLE = "учеников без повторов: кто учится в двух группах, считается один раз";

/**
 * The «С долгом за месяц» cell of the total row counts DISTINCT students, the rows above count a student once per group.
 * The tooltip always says so; the «*» marker only when the total really differs from the sum of the rows.
 */
export function collectionTotalDebtorsHint(collection: MonthCollection | null | undefined): { title: string; marker: boolean } | null {
  if (!collection) return null;
  const rowsSum = collection.groups.reduce((acc, row) => acc + sum(row.students_with_debt), 0);
  return { title: COLLECTION_DEBTORS_TOTAL_TITLE, marker: sum(collection.total.students_with_debt) !== rowsSum };
}

// ── The journal ────────────────────────────────────────────────────────────

/** «отменена» for a cancelled payment, «исправлена → № 11» for one that a correction replaced. */
export function statusTag(row: Pick<JournalRow, "status" | "replaced_by_receipt_no">): string | null {
  if (row.status === "voided") return "отменена";
  if (row.status === "replaced") return row.replaced_by_receipt_no ? `исправлена → № ${row.replaced_by_receipt_no}` : "исправлена";
  return null;
}

/** The small chip on a live payment that corrected an earlier one. */
export const CORRECTED_CHIP = "исправлена";

/** A live payment that replaced an earlier one (the earlier one is `replaced` and, by default, not in the list). */
export function isCorrection(row: Pick<JournalRow, "status" | "replaces_receipt_no">): boolean {
  return row.status === "active" && row.replaces_receipt_no !== null && row.replaces_receipt_no !== undefined;
}

/** «20.10» from an ISO date or date-time; null when there is no usable date. */
function shortDate(value: string | null | undefined): string | null {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? `${match[3]}.${match[2]}` : null;
}

/** The drawer of a corrected payment: «Было 350 000 сум → стало 300 000 сум · исправил Нодира 15.10 · причина: опечатка».  Each part only when the server sent it. */
export function correctionLine(row: JournalRow): string | null {
  if (!isCorrection(row)) return null;
  const parts: string[] = [];
  if (typeof row.replaces_amount === "number") parts.push(`Было ${formatMoney(row.replaces_amount)} → стало ${formatMoney(row.amount)}`);
  const date = shortDate(row.corrected_at);
  const who = [row.corrected_by_name ? `исправил ${row.corrected_by_name}` : date ? "исправлена" : "", date].filter(Boolean).join(" ");
  if (who) parts.push(who);
  if (row.replaces_reason) parts.push(`причина: ${row.replaces_reason}`);
  if (parts.length === 0) return null;
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** The drawer of a cancelled payment: «Отменена 20.10 · Нодира Саидова · причина: Ошибочный ввод». */
export function voidedLine(row: JournalRow): string | null {
  if (row.status !== "voided") return null;
  const date = shortDate(row.voided_at);
  const parts = [date ? `Отменена ${date}` : "Отменена"];
  if (row.voided_by_name) parts.push(row.voided_by_name);
  if (row.void_reason) parts.push(`причина: ${row.void_reason}`);
  return parts.join(" · ");
}

export interface JournalRowView {
  id: string;
  /** «21.10» (+ year when the period spans years). */
  date: string;
  time: string;
  student: string;
  displayId: string | null;
  group: string;
  teacher: string | null;
  amount: string;
  method: string;
  /** «отменена» / «исправлена → № N»; null for a live payment. */
  tag: string | null;
  muted: boolean;
  /** «исправлена» — a live payment that replaced an earlier one; null otherwise. */
  correctedChip: string | null;
  /** «внесена 21.10 в 11:40»: a quiet second line of the phone card; null when the server did not send it. */
  enteredAt: string | null;
}

/** The server's «внесена 21.10 в 11:40» (trimmed); null when it is absent. */
export function enteredAtText(row: Pick<JournalRow, "entered_at_text">): string | null {
  const value = typeof row.entered_at_text === "string" ? row.entered_at_text.trim() : "";
  return value || null;
}

export function journalRowView(row: JournalRow, withYear = false): JournalRowView {
  const date = formatDateRu(row.paid_on);
  const tag = statusTag(row);
  return {
    id: row.id,
    date: withYear ? date : date.slice(0, 5),
    time: row.paid_time ?? "",
    student: row.student_name,
    displayId: row.display_id,
    group: row.group_name,
    teacher: row.teacher_name,
    amount: formatMoney(row.amount),
    method: row.method_label,
    tag,
    muted: tag !== null,
    correctedChip: isCorrection(row) ? CORRECTED_CHIP : null,
    enteredAt: enteredAtText(row),
  };
}

/** The columns carry the year only when the shown days are not all of one year. */
export function journalSpansYears(from: string, to: string): boolean {
  return from.slice(0, 4) !== to.slice(0, 4);
}

export interface DrawerFact { label: string; value: string }

export interface DrawerLink { key: "receipt" | "student" | "statement"; label: string }

export interface DrawerView {
  title: string;
  /** «21.10.2026 · 11:40» (the date alone for a back-dated payment). */
  when: string;
  /** «внесена 21.10 в 11:40», quietly under the amount; null when the server did not send it. */
  entered: string | null;
  amount: string;
  method: string;
  tag: string | null;
  /** «исправлена» next to the method of a live payment that corrected an earlier one. */
  correctedChip: string | null;
  facts: DrawerFact[];
  /** «Куда пошли деньги»: «за сентябрь — 200 000», «аванс — 50 000»; the server's lines. */
  destination: string[];
  /** The same lines with the colour of the kind (the strip's); the drawer shows a dot. */
  destinationItems: DestinationLine[];
  /** The history of a cancelled or corrected payment, in words. */
  notes: string[];
  note: string | null;
  links: DrawerLink[];
}

/**
 * One line of «Куда пошли деньги» in words: the amount says «сум» and a bare period says «за период 22.10–21.11 — 450 000 сум».
 * The server's lines are kept as they are when they already say it; an older server's «за 22.10–21.11 — 450 000» is completed.
 */
export function humanDestinationLine(line: string): string {
  let out = line.trim();
  out = out.replace(/^за (\d{1,2}\.\d{2}\s*[–-]\s*\d{1,2}\.\d{2})/, "за период $1");
  out = out.replace(/(—|-)\s*(\d[\d\s\u00a0\u202f]*)$/, (_all, dash: string, amount: string) => `${dash} ${amount.trim()} сум`);
  return out;
}

const MONTHS_NOMINATIVE = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const dayMonth = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** A whole calendar month is «сентябрь», any other period is «20.09–19.10». */
function allocationPeriodName(allocation: Pick<JournalAllocation, "period_from" | "period_to">): string {
  const { period_from: from, period_to: to } = allocation;
  if (isIsoDate(from) && isIsoDate(to) && from.slice(8) === "01" && monthEnd(from) === to) return MONTHS_NOMINATIVE[Number(from.slice(5, 7)) - 1] ?? "";
  return isIsoDate(from) && isIsoDate(to) ? `${dayMonth(from)}–${dayMonth(to)}` : "";
}

/** «за сентябрь» / «за период 20.10–19.11» / «за периоды 20.09–19.10, 20.10–19.11»; «» when the periods are not known. */
function allocationPeriodsText(allocations: Array<Pick<JournalAllocation, "period_from" | "period_to">>): string {
  const names = allocations.map(allocationPeriodName).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return /^\d/.test(names[0]) ? `за период ${names[0]}` : `за ${names[0]}`;
  return `за периоды ${names.join(", ")}`;
}

/** The periods of a kind: the allocations of the kind's bucket (the earliest first) whose amounts add up exactly to the kind's amount; «» when they do not. */
function kindPeriods(kind: string, amount: number, row: Pick<JournalRow, "allocations"> & Partial<Pick<JournalRow, "paid_on">>): string {
  const bucket = kind === "old_debt" ? "past_debt" : kind === "current" ? "current" : kind === "forward" ? "advance" : "";
  if (!bucket) return "";
  const candidates = row.allocations
    .filter((line) => line.bucket === bucket && line.amount > 0 && (kind !== "forward" || !row.paid_on || line.period_from > row.paid_on))
    .sort((a, b) => a.period_from.localeCompare(b.period_from));
  const taken: JournalAllocation[] = [];
  let total = 0;
  for (const line of candidates) {
    taken.push(line);
    total += line.amount;
    if (total >= amount) break;
  }
  return total === amount ? allocationPeriodsText(taken) : "";
}

export interface DestinationLine {
  text: string;
  /** The colour of the kind (the same as in the strip and its legend); null for a line without a kind. */
  dot: string | null;
}

/**
 * One line of «Куда пошли деньги» by the row's `split`: the kind named in words of the strip, the periods from the allocations, then the amount.
 * «Вперёд — за период 20.10–19.11 (начался после оплаты) · 100 000 сум», «Аванс (пока не потрачен) · 200 000 сум», «Старый долг за сентябрь · 300 000 сум».
 */
export function splitLine(part: IncomeFlowItem, row: Pick<JournalRow, "allocations"> & Partial<Pick<JournalRow, "paid_on">>): DestinationLine {
  const periods = kindPeriods(part.kind, part.amount, row);
  let head: string;
  if (part.kind === "old_debt") head = periods ? `Старый долг ${periods}` : "Старый долг";
  else if (part.kind === "current") head = periods ? `Текущий период — ${periods}` : "Текущий период";
  else if (part.kind === "forward") head = periods ? `Вперёд — ${periods} (начался после оплаты)` : "Вперёд — за будущие периоды (начались после оплаты)";
  else if (part.kind === "advance") head = "Аванс (пока не потрачен)";
  else head = capitalizeFirst(part.label || part.kind);
  return { text: `${head} · ${formatMoney(part.amount)}`, dot: flowDot(part.kind) };
}

/** «за сентябрь — 200 000 сум · аванс — 50 000 сум» → two lines; the sentence is the server's, the split and the words «сум» / «период» are the layout. */
export function destinationLines(row: Pick<JournalRow, "allocation_text" | "allocations"> & Partial<Pick<JournalRow, "split" | "paid_on">>): string[] {
  return destinationItems(row).map((line) => line.text);
}

/** The lines of «Куда пошли деньги» with the colour of each kind: the row's `split` when the server sends it, else the sentence `allocation_text`, else the allocations. */
export function destinationItems(row: Pick<JournalRow, "allocation_text" | "allocations"> & Partial<Pick<JournalRow, "split" | "paid_on">>): DestinationLine[] {
  const parts = (row.split ?? []).filter((part) => part.amount > 0);
  if (parts.length > 0) return parts.map((part) => splitLine(part, row));
  if (row.allocation_text) return row.allocation_text.split(" · ").map(humanDestinationLine).filter(Boolean).map((text) => ({ text, dot: null }));
  return row.allocations.filter((line) => line.amount > 0).map((line) => ({ text: `${line.label} — ${formatMoney(line.amount)}`, dot: null }));
}

export function drawerView(row: JournalRow): DrawerView {
  const facts: DrawerFact[] = [{ label: "Ученик", value: row.student_name }, { label: "Группа", value: row.teacher_name ? `${row.group_name} · ${row.teacher_name}` : row.group_name }];
  if (row.created_by_name) facts.push({ label: "Кто внёс", value: row.created_by_name });
  const notes: string[] = [];
  if (row.status === "voided") {
    notes.push(voidedLine(row) as string);
  } else if (row.status === "replaced") {
    notes.push(`Оплата исправлена${row.replaced_by_receipt_no ? `: действует квитанция № ${row.replaced_by_receipt_no}` : ""}${row.void_reason ? ` (${row.void_reason})` : ""}`);
  }
  if (row.replaces_receipt_no) {
    notes.push(`Исправляет квитанцию № ${row.replaces_receipt_no}`);
    const correction = correctionLine(row);
    if (correction) notes.push(correction);
  }
  return {
    title: row.receipt_no ? `Оплата № ${row.receipt_no}` : "Оплата",
    when: `${formatDateRu(row.paid_on)}${row.paid_time ? ` · ${row.paid_time}` : ""}`,
    entered: enteredAtText(row),
    amount: formatMoney(row.amount),
    method: row.method_label,
    tag: statusTag(row),
    correctedChip: isCorrection(row) ? CORRECTED_CHIP : null,
    facts,
    destination: row.status === "active" ? destinationLines(row) : [],
    destinationItems: row.status === "active" ? destinationItems(row) : [],
    notes,
    note: row.note,
    links: [
      { key: "receipt", label: row.receipt_no ? `Квитанция № ${row.receipt_no}` : "Квитанция" },
      { key: "student", label: "Карточка ученика" },
      { key: "statement", label: "Выписка по группе" },
    ],
  };
}

export interface JournalPaging {
  /** «1–25 из 98». */
  text: string;
  page: number;
  pages: number;
  canPrev: boolean;
  canNext: boolean;
}

export function journalPaging(journal: Pick<PaymentsJournal, "page" | "size" | "total" | "pages" | "rows">): JournalPaging {
  const first = (journal.page - 1) * journal.size + 1;
  const last = first + journal.rows.length - 1;
  return {
    text: journal.rows.length === 0 ? "" : `${first}–${last} из ${journal.total}`,
    page: journal.page, pages: journal.pages,
    canPrev: journal.page > 1, canNext: journal.page < journal.pages,
  };
}

/** «19 оплат на 7 885 000 сум»; nothing when there are no live payments.  The cancelled and corrected ones are the toggle's business (`hiddenPaymentsCount`). */
export function journalTotalsText(totals: JournalTotals): string {
  return totals.count <= 0 ? "" : `${paymentsCountText(totals.count)} на ${formatMoney(totals.sum)}`;
}

/** The cancelled and the corrected payments of the set: what the toggle would add to the list (an older server sends no `replaced_count`). */
export function hiddenPaymentsCount(totals: Pick<JournalTotals, "voided_count" | "replaced_count"> | null | undefined): number {
  return sum(totals?.voided_count) + sum(totals?.replaced_count);
}

/** The label of the toggle; the same words on and off (the pressed state says which). */
export function showVoidedLabel(totals: Pick<JournalTotals, "voided_count" | "replaced_count"> | null | undefined): string {
  return `Показать отменённые и исправленные (${hiddenPaymentsCount(totals)})`;
}

export interface EmptyContext {
  kind: PeriodKind;
  /** A bar was clicked: the journal is narrowed to this label. */
  focusLabel: string | null;
  /** The search, the author or a method / group / teacher is set. */
  narrowed: boolean;
  /** The year of today («2026»): a month of another year is named with it. */
  year?: string;
}

/**
 * The empty text of a journal narrowed by a click on the chart.  A month bar («Октябрь 2026 г.»): «В октябре оплат не было»
 * (the year only when it is not `year`); a day bar («21 октября»): «В этот день оплат не было»; any other label: the words of the period.
 */
export function focusEmptyText(label: string, kind: PeriodKind, year?: string): string {
  const name = label.trim();
  const month = /^([а-яё]+)(?: (\d{4}))?(?: г\.)?$/i.exec(name);
  const declined = month ? MONTH_PREPOSITIONAL[month[1].toLowerCase()] : undefined;
  if (month && declined) return `В ${declined}${month[2] && month[2] !== year ? ` ${month[2]}` : ""} оплат не было`;
  if (/^\d/.test(name)) return "В этот день оплат не было";
  return `${periodWords(kind)} оплат не было`;
}

/** The human sentence of an empty journal: never a bare table. */
export function journalEmptyText(context: EmptyContext): string {
  if (context.narrowed) return "По этому запросу оплат не нашлось";
  if (context.focusLabel) return focusEmptyText(context.focusLabel, context.kind, context.year);
  return `${periodWords(context.kind)} оплат не было`;
}

/** Zero rows and nothing narrowed (no search, no author, no filter, no bar): the journal has nothing to search or export, so it is one quiet line. */
export function journalIsQuiet(journal: (Pick<PaymentsJournal, "rows"> & { totals?: Pick<JournalTotals, "voided_count" | "replaced_count"> }) | null | undefined, context: Pick<EmptyContext, "narrowed" | "focusLabel">): boolean {
  // cancelled / corrected payments behind the toggle are something to show: the journal is not empty then
  return Boolean(journal) && journal!.rows.length === 0 && !context.narrowed && !context.focusLabel && hiddenPaymentsCount(journal!.totals) === 0;
}

/** The one line of a journal without rows: the sentence and the card above already say «оплат не было», so this one says only where the rows would be. */
export const JOURNAL_QUIET_TEXT = "Журнал оплат пуст";

export const LOAD_ERROR_FALLBACK = "Не удалось загрузить поступления";
export const NO_ACCESS_TEXT = "Нет доступа к поступлениям. Доступ даёт владелец центра в настройках.";

/** What the screen says when a request fails: the server's own sentence when it has one, a calm default otherwise. */
export function incomeErrorText(cause: unknown): { text: string; denied: boolean } {
  const status = (cause as { status?: number } | null)?.status;
  if (status === 403 || status === 404) return { text: NO_ACCESS_TEXT, denied: true };
  const message = cause instanceof Error && cause.message ? cause.message : "";
  return { text: message || LOAD_ERROR_FALLBACK, denied: false };
}

export const EXPORT_TOO_LONG_TEXT = "Слишком много строк — сузьте период или фильтры";

/** The Excel of the journal holds at most 20 000 rows: the server's 422 `EXPORT_TOO_LONG` becomes one human sentence. */
export function exportErrorText(cause: unknown): string {
  const code = (cause as { code?: string } | null)?.code;
  if (code === "EXPORT_TOO_LONG") return EXPORT_TOO_LONG_TEXT;
  return cause instanceof Error && cause.message ? cause.message : "Не удалось скачать Excel";
}

/** The note of «Должники» opened from a group's row: the tab counts the debt of all months, the row only of the month. */
export const DEBTORS_GROUP_NOTE = "Показаны все долги группы, не только за месяц";

// ── «Поступления» in the address (IA audit F34) ─────────────────────────────

/**
 * `?month=2026-09` (a whole month other than this one), `?from=2026-09-05&to=2026-09-20` (a custom range) and `?tab=groups` («Группы —
 * собираемость»): a reload, a link and «Назад» from a payment keep the period and the tab.  This month and the journal are the defaults and
 * are not written.
 */
export function incomeQueryString(period: Period, tab: "journal" | "groups", today: string): string {
  const params = new URLSearchParams();
  if (period.kind === "custom") { params.set("from", period.from); params.set("to", period.to); }
  else if (period.kind === "month" && period.from !== monthStart(today)) params.set("month", period.from.slice(0, 7));
  if (tab === "groups") params.set("tab", "groups");
  const text = params.toString();
  return text ? `?${text}` : "?";
}

export function parseIncomeQuery(params: { get(name: string): string | null } | null | undefined, today: string): { period: Period; tab: "journal" | "groups" } {
  const tab = params?.get("tab") === "groups" ? "groups" : "journal";
  const from = params?.get("from") ?? "";
  const to = params?.get("to") ?? "";
  if (isIsoDate(from) && isIsoDate(to) && to >= from) return { period: { kind: "custom", from, to }, tab };
  const month = params?.get("month") ?? "";
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { period: periodOf("month", `${month}-01`), tab };
  return { period: periodOf("month", today), tab };
}
