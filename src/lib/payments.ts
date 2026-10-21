/**
 * Pure rules of the "Оплаты" screens (N13 P2): types of the API contract, money and date
 * formatting, status wording, form defaults and validation.
 * No React and no network here, so node:test can load this file directly.
 * Calendar days are computed in UTC from the ISO string, so they never drift with the
 * viewer's timezone; "today" comes from the caller (the Tashkent business date).
 */
export { formatDateRu } from "./attendance-excuses";
import { formatDateRu } from "./attendance-excuses";
import { CHIP_TONE_CLASS } from "./chip-tone";
import { daysLabel, leftPhrase, lessonsWord, pluralRu } from "./plural";
import type { PriceInfo } from "./group-price";

// ── API contract (spec §3) ─────────────────────────────────────────────────

export type PeriodMode = "calendar" | "lessons";
/** How a calendar period starts: from the payment date, or on one day of the month for the whole center. */
export type BillingAnchor = "payment_date" | "fixed_day";
export type PaymentStatus = "none" | "free" | "expired" | "ends_today" | "expiring" | "active";
export type PaymentBucket = "due" | "expiring" | "none" | "active";

export interface PaymentSettings {
  period_mode: PeriodMode;
  /** Only for `calendar`: `fixed_day` makes every period start on `billing_day`. */
  billing_anchor: BillingAnchor;
  /** 1..28: the day of the month the center's period starts on (used with `fixed_day`). */
  billing_day: number;
  lessons_per_payment: number;
  expiring_days: number;
  expiring_lessons: number;
  /** An excuse is confirmed this many days before the end of the paid period... */
  excuse_deadline_days: number;
  /** ...or when this many lessons are left in a lessons package. */
  excuse_deadline_lessons: number;
  admin_can_manage: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

export type PaymentSettingsUpdate = Partial<Omit<PaymentSettings, "updated_by" | "updated_at">>;

export interface PaymentsSummary {
  as_of: string;
  due: number;
  ends_today: number;
  expired: number;
  expiring: number;
  none: number;
  active: number;
  free: number;
  tracked_total: number;
  period_mode: PeriodMode;
  /** Not in the contract yet: used for the "уроков" default when the server sends it. */
  lessons_per_payment?: number | null;
  /** Distinct students behind `due` / `expired` (which count memberships); older servers do not send them. */
  students_due?: number | null;
  students_expired?: number | null;
}

/** The payment a carry-over (amount 0, made by a transfer) was made from. */
export interface CarriedFrom {
  payment_id: string;
  group_name: string;
}

/** The payment moved to another group with the student; it covers only the days before `date`. */
export interface CarriedOut {
  date: string;
  /** Null when the carry-over is gone (cancelled or replaced). */
  group_name: string | null;
}

export interface PaymentOut {
  id: string;
  membership_id: string;
  amount: number;
  currency: string;
  paid_on: string;
  valid_from: string;
  valid_to: string | null;
  lessons_count: number | null;
  note: string | null;
  replaces_payment_id: string | null;
  /** Set on a carry-over; an older server does not send it. */
  carried_from?: CarriedFrom | null;
  /** Set on the original once it moved (older servers do not send it). */
  carried_out?: CarriedOut | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string | null;
  voided_at: string | null;
  voided_by: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
  /** Receipt number inside the center; null for a carry-over (not money) and on an older server. */
  receipt_no?: number | null;
  /** The payment was made for a part of a center period (fixed day); a fact of its time, never recalculated. */
  partial_period?: boolean;
  /** Attached receipts / cheques (photo or PDF); the bytes are fetched one by one. */
  files?: PaymentFileOut[];
}

/** A photo / PDF of a bank slip attached to a payment (N13 P2.2). */
export interface PaymentFileOut {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string | null;
  uploaded_by_name: string | null;
}

export type QuoteBasis = "full" | "lessons" | "days" | "package" | "custom" | "none";

/** One piece of a quote: a part of a center period (fixed day) or the whole range. */
export interface PaymentQuotePart {
  from: string;
  to: string;
  period_from: string | null;
  period_to: string | null;
  lessons: number | null;
  period_lessons: number | null;
  amount: number | null;
}

/** `GET /auth/org/memberships/{id}/payments/quote`: dates and an amount for the next payment. */
export interface PaymentQuote {
  mode: PeriodMode;
  billing_anchor: BillingAnchor;
  billing_day: number;
  paid_on: string;
  valid_from: string;
  valid_to: string | null;
  lessons_count: number | null;
  partial: boolean;
  /** The sum the suggestion was made from (the price at the start of the period, or the one-off sum that was sent). */
  monthly_fee: number | null;
  /** The effective price at the start of the period (#105); an older server does not send it. */
  price?: PriceInfo;
  suggested_amount: number | null;
  basis: QuoteBasis;
  parts: PaymentQuotePart[];
  /** Russian text for the caption under the amount. */
  explanation: string;
}

/** Query of the quote: only `paid_on` is required, the server fills the rest the way a payment would. */
export interface PaymentQuoteQuery {
  paid_on: string;
  valid_from?: string;
  valid_to?: string;
  lessons_count?: number;
  /** Whole сум: replaces the price for this calculation only (a one-off sum; nothing is saved). */
  monthly_fee?: number;
}

/** `GET /auth/org/payments/{id}/receipt`. */
export interface ReceiptOut {
  receipt_no: number;
  org_name: string;
  org_city: string | null;
  org_phone: string | null;
  student_name: string;
  display_id: string | null;
  group_name: string;
  amount: number;
  /** «Пятьсот тысяч сум», with a capital letter. */
  amount_words: string;
  currency: string;
  paid_on: string;
  valid_from: string;
  valid_to: string | null;
  lessons_count: number | null;
  partial_period: boolean;
  note: string | null;
  accepted_by_name: string | null;
  created_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  replaced_by_receipt_no: number | null;
  replaces_receipt_no: number | null;
}

export interface MembershipPaymentRow {
  membership_id: string;
  student_id: string;
  student_name: string;
  display_id: string | null;
  class_level: number | null;
  group_id: string;
  group_name: string;
  teacher_id: string | null;
  teacher_name: string | null;
  is_primary: boolean;
  is_active: boolean;
  /**
   * #105: the effective price today - the price of the group, the individual price of the student, or none.
   * Money roles only.  An older server has no `price`; `priceOfRow` reads `monthly_fee` then.
   */
  price?: PriceInfo;
  /** The same sum as `price.amount`, kept by the server as a synonym; the front reads `price`. */
  monthly_fee: number | null;
  status: PaymentStatus;
  period_mode: PeriodMode | null;
  paid_until: string | null;
  days_overdue: number | null;
  days_left: number | null;
  lessons_total: number | null;
  lessons_used: number | null;
  lessons_left: number | null;
  last_payment: PaymentOut | null;
}

export interface PaymentWarning {
  code: "overlaps_previous" | "gap_before" | "period_over_62_days" | "paid_over_60_days_ago" | "short_period_full_amount" | string;
  message: string;
}

export interface PaymentCreate {
  amount: number;
  paid_on: string;
  valid_from?: string;
  valid_to?: string;
  lessons_count?: number;
  note?: string;
}

export interface PaymentSaveResult {
  payment: PaymentOut;
  warnings: PaymentWarning[];
  row: MembershipPaymentRow;
}

export interface PaymentsStatusList {
  items: MembershipPaymentRow[];
  total: number;
  limit: number;
  offset: number;
  as_of: string;
}

// ── Limits (spec §0.10, §3) ────────────────────────────────────────────────

export const MAX_MONEY = 10_000_000_000;
/** Backend rule: `valid_to - valid_from` may be at most 400 days (the inclusive length is then at most 401). */
export const MAX_PERIOD_DAYS = 400;
export const MAX_LESSONS = 120;
export const NOTE_MAX = 500;
export const REASON_MIN = 3;
export const REASON_MAX = 500;
export const PAYMENT_MAX_AGE_YEARS = 3;

// ── Money ──────────────────────────────────────────────────────────────────

const NBSP = " ";

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 450000 -> «450 000 сум» (non-breaking spaces: the amount never wraps in the middle). */
export function formatMoney(value: number | null | undefined): string {
  const amount = Math.round(Number(value) || 0);
  const sign = amount < 0 ? "-" : "";
  return `${sign}${groupDigits(String(Math.abs(amount)))}${NBSP}сум`;
}

/** Amount for an input field: thousands separated, no unit. */
export function formatMoneyInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
  return groupDigits(String(Math.max(0, Math.round(Number(value)))));
}

/**
 * «450 000» / «450000» / «450 000 сум» -> 450000.  Everything but digits is ignored;
 * an empty field (no digits) is null.  Range is checked by the validators.
 */
export function parseMoneyInput(text: string | null | undefined): number | null {
  const digits = String(text ?? "").replace(/\D+/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : Number.MAX_SAFE_INTEGER;
}

/** Re-formats what the user is typing: digits only, thousands separated. */
export function reformatMoneyTyping(text: string): string {
  const value = parseMoneyInput(text);
  return value === null ? "" : groupDigits(String(value));
}

// ── Dates ──────────────────────────────────────────────────────────────────

function parseIso(iso: string | null | undefined): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return [year, month, day];
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toIso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isIsoDate(value: string | null | undefined): boolean {
  return parseIso(value) !== null;
}

/** ISO date + n days (n may be negative). */
export function addDays(iso: string, days: number): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Whole days from `fromIso` to `toIso` (positive when `toIso` is later). */
export function daysBetween(fromIso: string, toIso_: string): number {
  const a = parseIso(fromIso);
  const b = parseIso(toIso_);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

/** Number of days a period covers, both ends included (05.10 - 04.11 -> 31). */
export function periodDays(validFrom: string, validTo: string): number {
  return daysBetween(validFrom, validTo) + 1;
}

/**
 * «с» + 1 месяц − 1 день: 05.10 -> 04.11, 01.10 -> 31.10.  When the next month is
 * shorter, the period ends on its last day: 31.01 -> 28.02 (29.02 in a leap year).
 */
export function addMonthMinusDay(iso: string): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  const [year, month, day] = parts;
  if (day === 1) return toIso(year, month, daysInMonth(year, month));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return toIso(nextYear, nextMonth, Math.min(day - 1, daysInMonth(nextYear, nextMonth)));
}

/** The same calendar day `years` earlier (29.02 -> 28.02). */
export function subtractYears(iso: string, years: number): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  const year = parts[0] - years;
  return toIso(year, parts[1], Math.min(parts[2], daysInMonth(year, parts[1])));
}

// ── Center periods of the «единый день оплаты» model (mirrors payment_status.py) ──

export const BILLING_DAY_RANGE = { min: 1, max: 28 } as const;

/** Start of the center period that contains `iso`: the `billingDay` of this month, or of the previous one. */
export function billingPeriodStart(iso: string, billingDay: number): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  const [year, month, day] = parts;
  if (day >= billingDay) return toIso(year, month, billingDay);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  return toIso(previousYear, previousMonth, billingDay);
}

/** End of the center period that contains `iso`: the next `billingDay` minus a day (the last day of the month for day 1). */
export function billingPeriodEndOf(iso: string, billingDay: number): string {
  return addMonthMinusDay(billingPeriodStart(iso, billingDay));
}

/** Where a fixed-day payment may end: the end of its center period, and one more period after it. */
export interface FixedDayChips {
  /** «До конца месяца»: the end of the period that contains «с». */
  toEnd: string;
  /** «+ следующий месяц»: the end of the period after the one the current «до» is in. */
  plusNext: string;
}

/**
 * The two shortcuts under «Оплачено до» of the fixed-day model.  `plusNext` is the end of the
 * period that follows the one `validTo` ends in: 31.10 -> 30.11 (day 1), 09.11 -> 09.12 (day 10),
 * and clicking it again keeps adding months.  null while «с» is not a date.
 */
export function fixedDayChips(validFrom: string, validTo: string, billingDay: number): FixedDayChips | null {
  if (!isIsoDate(validFrom) || !Number.isInteger(billingDay) || billingDay < BILLING_DAY_RANGE.min || billingDay > BILLING_DAY_RANGE.max) {
    return null;
  }
  const toEnd = billingPeriodEndOf(validFrom, billingDay);
  const base = isIsoDate(validTo) && validTo >= validFrom ? validTo : toEnd;
  const plusNext = billingPeriodEndOf(addDays(billingPeriodEndOf(base, billingDay), 1), billingDay);
  return { toEnd, plusNext };
}

// The one Russian plural of the project lives in `./plural`; it is re-exported here for the older imports.
export { pluralRu };

// ── Buckets (tabs) ─────────────────────────────────────────────────────────

export const PAYMENT_BUCKETS: Array<{ key: PaymentBucket; label: string }> = [
  { key: "due", label: "Требуют оплаты" },
  { key: "expiring", label: "Скоро заканчивается" },
  { key: "none", label: "Без оплат" },
  { key: "active", label: "Оплачено" },
];

/** `?bucket=` of the page; unknown or missing values open the most urgent tab. */
export function parseBucket(value: string | null | undefined): PaymentBucket {
  return PAYMENT_BUCKETS.find((bucket) => bucket.key === value)?.key ?? "due";
}

/** The number on a tab - every tab has one; null while the summary is not known. */
export function bucketCount(
  summary: Partial<Pick<PaymentsSummary, "due" | "expiring" | "none" | "active">> | null,
  key: PaymentBucket,
): number | null {
  const value = summary?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** «Требуют оплаты (12)»; the bare label while the number is not known. */
export function bucketTabLabel(label: string, count: number | null): string {
  return count === null ? label : `${label} (${count})`;
}

// ── Status wording ─────────────────────────────────────────────────────────

export type StatusTone = "danger" | "warning" | "ok" | "muted" | "free";

/** One word-forms helper of the project (`lib/plural.ts`); the payments screens import it from here as before. */
export { lessonsWord };

/**
 * The chip of a row, in words and without abbreviations:
 * «Просрочено на 31 день» (red), «Осталось 5 дней» / «Остался 1 день» (amber, while the server calls it «скоро заканчивается»),
 * «Сегодня последний день» (amber), «Оплачено» (grey), «Без оплат», «Бесплатно».
 * By lessons: «Осталось 3 урока из 12» / «Остался 1 урок из 12» (amber), «Уроки закончились» (red).
 */
export function statusLabel(
  row: Pick<MembershipPaymentRow, "status" | "period_mode" | "days_overdue" | "days_left" | "lessons_total" | "lessons_left">,
): string {
  const lessons = row.period_mode === "lessons";
  switch (row.status) {
    case "none":
      return "Без оплат";
    case "free":
      return "Бесплатно";
    case "ends_today":
      return "Сегодня последний день";
    case "expired":
      if (lessons) return "Уроки закончились";
      return row.days_overdue ? `Просрочено на ${daysLabel(row.days_overdue)}` : "Оплата просрочена";
    case "expiring":
      if (lessons) return lessonsLeftText(row) || "Скоро закончится";
      return row.days_left ? leftPhrase(row.days_left, "день", "дня", "дней") : "Скоро закончится";
    case "active":
      return "Оплачено";
  }
  return "";
}

/** «Осталось 3 урока из 12» / «Остался 1 урок из 12» / «Осталось 3 урока»; "" when the count is not known. */
function lessonsLeftText(row: Pick<MembershipPaymentRow, "lessons_total" | "lessons_left">): string {
  if (row.lessons_left === null || row.lessons_left === undefined) return "";
  const left = leftPhrase(row.lessons_left, "урок", "урока", "уроков");
  return row.lessons_total ? `${left} из ${row.lessons_total}` : left;
}

/**
 * The second line under the chip: «оплачено до 19.09.2026» (calendar), «осталось 9 уроков из 12» / «остался 1 урок из 12» (a package that is
 * paid and not running out yet).
 */
export function statusDetail(
  row: Pick<MembershipPaymentRow, "status" | "period_mode" | "paid_until" | "lessons_total" | "lessons_left">,
): string {
  if (row.period_mode === "lessons") {
    return row.status === "active" ? lessonsLeftText(row).toLowerCase() : "";
  }
  if (!row.paid_until) return "";
  if (row.status === "expiring" || row.status === "ends_today" || row.status === "expired" || row.status === "active") {
    return `оплачено до ${formatDateRu(row.paid_until)}`;
  }
  return "";
}

/** Red is for a real problem (overdue, used up); the last day and «soon» are amber; paid is grey. */
export function statusTone(status: PaymentStatus): StatusTone {
  switch (status) {
    case "expired":
      return "danger";
    case "expiring":
    case "ends_today":
      return "warning";
    case "active":
      return "ok";
    case "free":
      return "free";
    default:
      return "muted";
  }
}

/**
 * One verb for every payment: «Внести оплату» on the row, in the student's card, in the title of the dialog.
 * (The dialog is the same for a first, an overdue and a running payment - only the proposed period start differs,
 * and the server decides it.)
 */
export const PAY_ACTION_LABEL = "Внести оплату";

/** The toast after a payment is saved: the same verb as the button and the title of the dialog. */
export const PAYMENT_SAVED_TEXT: Record<"create" | "replace", string> = {
  create: "Оплата внесена",
  replace: "Оплата исправлена",
};

/** A first or an overdue payment is due: the button in the student's card is filled; for a running payment it is outlined. */
export function payIsDue(row: Pick<MembershipPaymentRow, "status" | "last_payment">): boolean {
  if (!row.last_payment) return true;
  return row.status === "expired" || row.status === "none";
}

/** Same grey / amber / red as the deadline chips of «Пропуски»; paid, free and no-data states stay grey. */
export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  danger: CHIP_TONE_CLASS.danger,
  warning: CHIP_TONE_CLASS.warn,
  ok: CHIP_TONE_CLASS.neutral,
  free: CHIP_TONE_CLASS.neutral,
  muted: CHIP_TONE_CLASS.neutral,
};

/** «05.10.2026 — 04.11.2026» (calendar) or «12 уроков с 05.10.2026» (by lessons). */
export function paymentPeriodLabel(payment: Pick<PaymentOut, "valid_from" | "valid_to" | "lessons_count">): string {
  if (payment.lessons_count) {
    return `${payment.lessons_count} ${lessonsWord(payment.lessons_count)} с ${formatDateRu(payment.valid_from)}`;
  }
  return `${formatDateRu(payment.valid_from)} — ${formatDateRu(payment.valid_to)}`;
}

/** A payment made by a transfer (amount 0): the money stays with the original in the old group. */
export function isCarryOver(payment: Pick<PaymentOut, "carried_from"> | null | undefined): boolean {
  return Boolean(payment?.carried_from);
}

/** «перенос из «Алгебра 7А»» */
export function carryOverLabel(payment: Pick<PaymentOut, "carried_from">): string {
  const name = payment.carried_from?.group_name?.trim();
  return name ? `перенос из «${name}»` : "перенос из другой группы";
}

/** «перенесено в «Алгебра 9Б» 15.10.2026» on the original that moved with the student; "" otherwise. */
export function carriedOutLabel(payment: Pick<PaymentOut, "carried_out"> | null | undefined): string {
  const out = payment?.carried_out;
  if (!out) return "";
  const name = out.group_name?.trim();
  return `перенесено в ${name ? `«${name}»` : "другую группу"} ${formatDateRu(out.date)}`;
}

/** «450 000 сум», or «перенос из «Алгебра 7А»» for a carry-over (never «0 сум»). */
export function paymentAmountLabel(payment: Pick<PaymentOut, "amount" | "carried_from">): string {
  return isCarryOver(payment) ? carryOverLabel(payment) : formatMoney(payment.amount);
}

/** «05.10.2026 · 450 000 сум» */
export function lastPaymentLabel(payment: Pick<PaymentOut, "paid_on" | "amount" | "carried_from"> | null | undefined): string {
  return payment ? `${formatDateRu(payment.paid_on)} · ${paymentAmountLabel(payment)}` : "—";
}

// ── Transfer: the payment follows the student (N13 P2.1) ───────────────────

/** `code` of the server note that says a payment moved to the new group. */
export const CARRY_OVER_CODE = "payment_carried_over";

/** Muted hint in the transfer choice; shown only to users who see money. */
export const TRANSFER_PAYMENT_HINT = "Действующая оплата перейдёт в новую группу";

/**
 * The hint belongs to a real transfer ("Перевести"), never to «Добавить ещё», and only
 * while the user may see payments (the server words the note with dates only for them).
 */
export function transferPaymentHint(input: { transfer: boolean; moneyAvailable: boolean }): string | null {
  return input.transfer && input.moneyAvailable ? TRANSFER_PAYMENT_HINT : null;
}

export interface ServerNote {
  code?: string;
  message: string;
  student_id?: string;
}

/**
 * Server notes of a transfer/enrolment: the carry-over message is information (shown calmly),
 * everything else stays a warning.  `nameOf` prefixes a bulk note with the student it is about.
 */
export function splitTransferNotes(
  notes: ServerNote[] | null | undefined,
  nameOf?: (studentId: string) => string,
): { infos: string[]; warnings: string[] } {
  const infos: string[] = [];
  const warnings: string[] = [];
  for (const note of notes ?? []) {
    if (!note?.message) continue;
    const line = note.student_id && nameOf ? `${nameOf(note.student_id)} — ${note.message}` : note.message;
    (note.code === CARRY_OVER_CODE ? infos : warnings).push(line);
  }
  return { infos, warnings };
}

export function periodModeOf(payment: Pick<PaymentOut, "lessons_count"> | null | undefined, fallback: PeriodMode): PeriodMode {
  if (!payment) return fallback;
  return payment.lessons_count ? "lessons" : "calendar";
}

// ── Payment form ───────────────────────────────────────────────────────────

export interface PaymentFormValues {
  /** Digits with thousands separators, as typed. */
  amount: string;
  paidOn: string;
  validFrom: string;
  validTo: string;
  lessons: string;
  note: string;
  /** Only for a correction. */
  reason: string;
}

/** «С» of a new calendar payment: the day after the previous «оплачено до» unless that is before the payment date. */
export function defaultValidFrom(paidOn: string, previousPaidUntil: string | null | undefined): string {
  if (previousPaidUntil && isIsoDate(previousPaidUntil)) {
    const next = addDays(previousPaidUntil, 1);
    if (next >= paidOn) return next;
  }
  return paidOn;
}

export interface FormDefaultsInput {
  mode: PeriodMode;
  /** Business date, YYYY-MM-DD. */
  today: string;
  monthlyFee: number | null;
  paidUntil: string | null;
  /** Lessons of one payment when known; otherwise the field stays empty and the server applies the center setting. */
  lessonsDefault: number | null;
  /** Set when a payment is being corrected: its values are the starting point. */
  payment?: PaymentOut | null;
}

export function paymentFormDefaults(input: FormDefaultsInput): PaymentFormValues {
  const { mode, today, monthlyFee, paidUntil, lessonsDefault, payment } = input;
  if (payment) {
    return {
      amount: formatMoneyInput(payment.amount),
      paidOn: payment.paid_on,
      validFrom: payment.valid_from,
      validTo: payment.valid_to ?? "",
      lessons: payment.lessons_count ? String(payment.lessons_count) : "",
      note: payment.note ?? "",
      reason: "",
    };
  }
  const validFrom = mode === "calendar" ? defaultValidFrom(today, paidUntil) : today;
  return {
    amount: formatMoneyInput(monthlyFee && monthlyFee > 0 ? monthlyFee : null),
    paidOn: today,
    validFrom,
    validTo: mode === "calendar" ? addMonthMinusDay(validFrom) : "",
    lessons: mode === "lessons" && lessonsDefault ? String(lessonsDefault) : "",
    note: "",
    reason: "",
  };
}

export function validatePaymentForm(values: PaymentFormValues, mode: PeriodMode, today: string): string | null {
  const amount = parseMoneyInput(values.amount);
  if (amount === null) return "Укажите сумму";
  if (amount > MAX_MONEY) return "Сумма слишком большая";
  if (!isIsoDate(values.paidOn)) return "Укажите дату оплаты";
  if (values.paidOn > today) return "Дата оплаты не может быть в будущем";
  if (values.paidOn < subtractYears(today, PAYMENT_MAX_AGE_YEARS)) return "Дата оплаты старше 3 лет";
  if (!isIsoDate(values.validFrom)) return "Укажите начало периода";
  if (mode === "calendar") {
    if (!isIsoDate(values.validTo)) return "Укажите, до какого числа оплачено";
    if (values.validTo < values.validFrom) return "«Оплачено до» не может быть раньше начала периода";
    if (daysBetween(values.validFrom, values.validTo) > MAX_PERIOD_DAYS) return `Период не может быть длиннее ${MAX_PERIOD_DAYS} дней`;
  } else if (values.lessons.trim()) {
    const lessons = Number(values.lessons);
    if (!Number.isInteger(lessons) || lessons < 1 || lessons > MAX_LESSONS) return `Уроков должно быть от 1 до ${MAX_LESSONS}`;
  }
  if (values.note.trim().length > NOTE_MAX) return `Комментарий не длиннее ${NOTE_MAX} символов`;
  if (values.reason.trim().length > REASON_MAX) return `Причина не длиннее ${REASON_MAX} символов`;
  return null;
}

/** Request body of a payment; call only after `validatePaymentForm` returned null. */
export function buildPaymentPayload(values: PaymentFormValues, mode: PeriodMode): PaymentCreate {
  const payload: PaymentCreate = {
    amount: parseMoneyInput(values.amount) ?? 0,
    paid_on: values.paidOn,
    valid_from: values.validFrom,
  };
  if (mode === "calendar") payload.valid_to = values.validTo;
  else if (values.lessons.trim()) payload.lessons_count = Number(values.lessons);
  const note = values.note.trim();
  if (note) payload.note = note;
  return payload;
}

/** «Период 31 день» under the dates; null while the dates are incomplete or reversed. */
export function periodHint(values: Pick<PaymentFormValues, "validFrom" | "validTo">, mode: PeriodMode): string | null {
  if (mode !== "calendar" || !isIsoDate(values.validFrom) || !isIsoDate(values.validTo)) return null;
  const days = periodDays(values.validFrom, values.validTo);
  return days >= 1 ? `Период ${daysLabel(days)}` : null;
}

/** Reason of a cancellation: trimmed 3..500 characters. */
export function validateVoidReason(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (text.length < REASON_MIN) return `Укажите причину (не короче ${REASON_MIN} символов)`;
  if (text.length > REASON_MAX) return `Причина не длиннее ${REASON_MAX} символов`;
  return null;
}

// ── Quote of the next payment (N13 P2.2) ───────────────────────────────────

export interface QuoteInputs {
  mode: PeriodMode;
  paidOn: string;
  validFrom: string;
  validTo: string;
  lessons: string;
  /** The user typed the field, so it is sent and never overwritten. */
  fromTouched: boolean;
  toTouched: boolean;
  /** A one-off sum for this calculation only (nothing is saved); sent so the suggestion is made for it. Omit when the price counts. */
  monthlyFee?: number | null;
}

/**
 * The request for the server's suggestion, or null while the inputs cannot be asked about (no
 * payment date, reversed period, a lessons count that is not a number).  While the user has not touched
 * the dates only `paid_on` is sent and the server picks the period by the same code a payment uses;
 * once a date is touched both dates are sent explicitly, so the answer is about exactly what is on screen.
 */
export function buildQuoteQuery(input: QuoteInputs): PaymentQuoteQuery | null {
  if (!isIsoDate(input.paidOn)) return null;
  const query: PaymentQuoteQuery = { paid_on: input.paidOn };
  if (typeof input.monthlyFee === "number" && Number.isSafeInteger(input.monthlyFee) && input.monthlyFee > 0 && input.monthlyFee <= MAX_MONEY) {
    query.monthly_fee = input.monthlyFee;
  }
  if (input.mode === "calendar") {
    if (!input.fromTouched && !input.toTouched) return query;
    if (!isIsoDate(input.validFrom) || !isIsoDate(input.validTo) || input.validTo < input.validFrom) return null;
    query.valid_from = input.validFrom;
    query.valid_to = input.validTo;
    return query;
  }
  if (input.fromTouched) {
    if (!isIsoDate(input.validFrom)) return null;
    query.valid_from = input.validFrom;
  }
  const lessons = input.lessons.trim();
  if (lessons) {
    const count = Number(lessons);
    if (!Number.isInteger(count) || count < 1 || count > MAX_LESSONS) return null;
    query.lessons_count = count;
  }
  return query;
}

/** Stable text of a query: two requests with the same text ask the same thing. */
export function quoteQueryKey(query: PaymentQuoteQuery | null): string {
  if (!query) return "";
  return [query.paid_on, query.valid_from ?? "", query.valid_to ?? "", query.lessons_count ?? "", query.monthly_fee ?? ""].join("|");
}

export interface QuoteTouched {
  from: boolean;
  to: boolean;
  amount: boolean;
}

/**
 * What an answer may write into the form: only fields the user has not touched.  An answer without a
 * suggested amount leaves the amount alone, except a custom period or a part of a month, where the old amount
 * (the full fee, an earlier suggestion) no longer fits and the field is emptied so the user has to state it.
 */
export function quotePrefill(quote: PaymentQuote, touched: QuoteTouched, mode: PeriodMode): Partial<PaymentFormValues> {
  const patch: Partial<PaymentFormValues> = {};
  if (!touched.from && isIsoDate(quote.valid_from)) patch.validFrom = quote.valid_from;
  if (mode === "calendar" && !touched.to && quote.valid_to && isIsoDate(quote.valid_to)) patch.validTo = quote.valid_to;
  if (!touched.amount) {
    if (quote.suggested_amount !== null && quote.suggested_amount !== undefined) patch.amount = formatMoneyInput(quote.suggested_amount);
    else if (quote.basis === "custom" || quote.partial) patch.amount = "";
  }
  return patch;
}

/** «Неполный месяц» on the form: the answer says the period is a part of the center's period. */
export const PARTIAL_PERIOD_BADGE = "Неполный месяц";
/** The same fact in the history, in lower case. */
export const PARTIAL_PERIOD_TAG = "неполный месяц";

/** Under the amount while the server could not be asked (offline, 5xx, timeout). */
export const QUOTE_FAILED_NOTE = "Подсказка суммы недоступна — проверьте даты и сумму";
/** A part of a center period has no price until the quote (or the user) states one. */
export const PARTIAL_AMOUNT_PROMPT = "Для неполного месяца введите сумму";

/** Under the amount when the group (and the student) has no price: the amount is typed by hand. */
export const PRICE_NOT_SET_TEXT = "Цена группы не задана — введите сумму вручную";

/** The answer says there is no price to suggest from (a price of 0 is a price: «Бесплатно»). */
export function quoteLacksPrice(quote: Pick<PaymentQuote, "basis" | "monthly_fee">): boolean {
  return quote.monthly_fee !== 0 && quote.basis === "none";
}

/**
 * Caption under the amount.  Where the answer says there is no price, the wording is the screen's own
 * («Цена группы не задана»), so it is right whatever an older server writes; everything else is the server's own
 * explanation.
 */
export function quoteCaption(
  quote: Pick<PaymentQuote, "basis" | "monthly_fee" | "explanation" | "partial" | "suggested_amount">,
): string {
  if (quote.monthly_fee === 0) return "Бесплатно — сумма 0";
  if (quote.basis === "none") return PRICE_NOT_SET_TEXT;
  if (quote.partial && quote.suggested_amount === null) return PARTIAL_AMOUNT_PROMPT;
  return quote.explanation || "";
}

/**
 * True when a fixed-day payment covers only a part of a center period: «с» is not the start of its period
 * or «до» is not the end of its period (mirrors `is_partial_period` of the server).
 */
export function isPartialPeriod(validFrom: string, validTo: string, billingDay: number): boolean {
  if (!isIsoDate(validFrom) || !isIsoDate(validTo)) return false;
  return validFrom !== billingPeriodStart(validFrom, billingDay) || validTo !== billingPeriodEndOf(validTo, billingDay);
}

/**
 * «С» of a fixed-day payment when the server cannot be asked: the day after the previous «оплачено до» if that
 * is later than the start of the center period of the payment date, otherwise that start; a first payment
 * counts from the payment date (the server uses the enrolment date, which the form does not know).
 */
export function fixedDayFallbackFrom(paidOn: string, previousPaidUntil: string | null | undefined, billingDay: number): string {
  if (previousPaidUntil && isIsoDate(previousPaidUntil)) {
    const anchor = billingPeriodStart(paidOn, billingDay);
    const next = addDays(previousPaidUntil, 1);
    return next > anchor ? next : anchor;
  }
  return paidOn;
}

// ── Receipts and attached files (N13 P2.2) ─────────────────────────────────

export const PAYMENT_FILE_MAX_BYTES = 2 * 1024 * 1024;
export const PAYMENT_FILE_MAX_COUNT = 3;
export const PAYMENT_FILE_ACCEPT = "image/jpeg,image/png,application/pdf";

/** «№ 123», or null when there is no receipt (a carry-over, an older server). */
export function receiptNumberLabel(payment: Pick<PaymentOut, "receipt_no" | "carried_from"> | null | undefined): string | null {
  if (!payment || isCarryOver(payment)) return null;
  const number = payment.receipt_no;
  return typeof number === "number" && Number.isFinite(number) && number > 0 ? `№ ${number}` : null;
}

/** A carry-over is not money: it has neither a receipt nor a cheque. */
export function hasReceipt(payment: Pick<PaymentOut, "carried_from"> | null | undefined): boolean {
  return Boolean(payment) && !isCarryOver(payment);
}

/** A cheque can be attached to a live payment that is real money. */
export function canAttachFile(payment: Pick<PaymentOut, "carried_from" | "voided_at">): boolean {
  return !isCarryOver(payment) && !payment.voided_at;
}

export const RECEIPT_VOID_STAMP = "АННУЛИРОВАНА";

/** «Квитанция № 123». */
export function receiptTitle(receiptNo: number): string {
  return `Квитанция № ${receiptNo}`;
}

/** «заменена квитанцией № 124» on a receipt of a payment that was corrected; null otherwise. */
export function receiptReplacedNote(receipt: Pick<ReceiptOut, "replaced_by_receipt_no">): string | null {
  return receipt.replaced_by_receipt_no ? `заменена квитанцией № ${receipt.replaced_by_receipt_no}` : null;
}

/** «заменяет квитанцию № 120» on the receipt of a correction; null otherwise. */
export function receiptReplacesNote(receipt: Pick<ReceiptOut, "replaces_receipt_no">): string | null {
  return receipt.replaces_receipt_no ? `заменяет квитанцию № ${receipt.replaces_receipt_no}` : null;
}

/** What the receipt page says when the server refuses: 403 no right, 404 no such payment, 409 a carry-over (the server's own text). */
export function receiptErrorText(status: number | undefined, message: string | undefined): string {
  if (status === 403) return "Нет доступа к квитанциям. Доступ даёт владелец центра в настройках.";
  if (status === 404) return "Квитанция не найдена. Возможно, ссылка устарела или оплата относится к другому центру.";
  if (status === 409) return message || "Перенос оплаты — не денежная операция, квитанции нет";
  return message || "Не удалось загрузить квитанцию";
}

/** `/owner/payments` + id -> `/owner/payments/receipt/<id>`. */
export function receiptHref(paymentsBasePath: string, paymentId: string): string {
  return `${paymentsBasePath.replace(/\/+$/, "")}/receipt/${encodeURIComponent(paymentId)}`;
}

export interface PaymentFileCheck {
  ok: boolean;
  error?: string;
}

/**
 * Pre-check of a picked cheque; the server re-checks the signature bytes.  JPEG, PNG or PDF,
 * at most 2 МБ, at most 3 per payment.
 */
export function checkPaymentFile(file: { name: string; type: string; size: number }, currentCount: number): PaymentFileCheck {
  if (currentCount >= PAYMENT_FILE_MAX_COUNT) {
    return { ok: false, error: `К оплате можно приложить не более ${PAYMENT_FILE_MAX_COUNT} файлов` };
  }
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  const known = type === "image/jpeg" || type === "image/png" || type === "application/pdf"
    || (!type && /\.(jpe?g|png|pdf)$/.test(name));
  if (!known) return { ok: false, error: "Допустимы только фото (JPEG, PNG) и PDF" };
  if (file.size <= 0) return { ok: false, error: "Файл пустой" };
  if (file.size > PAYMENT_FILE_MAX_BYTES) return { ok: false, error: "Файл больше 2 МБ. Уменьшите его или сделайте фото поменьше" };
  return { ok: true };
}

// ── Center settings ────────────────────────────────────────────────────────

export const LESSONS_PER_PAYMENT_RANGE = { min: 1, max: 60 } as const;
export const EXPIRING_DAYS_RANGE = { min: 0, max: 14 } as const;
export const EXPIRING_LESSONS_RANGE = { min: 0, max: 10 } as const;
export const EXCUSE_DEADLINE_DAYS_RANGE = { min: 0, max: 30 } as const;
export const EXCUSE_DEADLINE_LESSONS_RANGE = { min: 0, max: 12 } as const;

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  period_mode: "calendar",
  billing_anchor: "payment_date",
  billing_day: 1,
  lessons_per_payment: 12,
  expiring_days: 3,
  expiring_lessons: 3,
  excuse_deadline_days: 5,
  excuse_deadline_lessons: 2,
  admin_can_manage: false,
  updated_by: null,
  updated_at: null,
};

function inRange(value: number, range: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= range.min && value <= range.max;
}

/** The two settings sections that live in one record on the server; each saves only its own fields. */
export type PaymentSettingsScope = "payments" | "attendance";

export const PAYMENTS_SCOPE_KEYS = [
  "period_mode", "billing_anchor", "billing_day", "lessons_per_payment", "expiring_days", "expiring_lessons", "admin_can_manage",
] as const;
export const ATTENDANCE_SCOPE_KEYS = ["excuse_deadline_days", "excuse_deadline_lessons"] as const;

type SettingsKey = (typeof PAYMENTS_SCOPE_KEYS)[number] | (typeof ATTENDANCE_SCOPE_KEYS)[number];

/**
 * The fields of the «Оплаты» section that the chosen card shows (and therefore may change): the model itself
 * and the admin switch always, then the day of a fixed-day center, the warning in days for a calendar one,
 * the package size and its warning for a package center.  The others are hidden and are neither validated nor sent.
 */
export function paymentsScopeKeys(model: PaymentModel): SettingsKey[] {
  const common: SettingsKey[] = ["period_mode", "billing_anchor", "admin_can_manage"];
  if (model === "lessons") return [...common, "lessons_per_payment", "expiring_lessons"];
  if (model === "fixed_day") return [...common, "billing_day", "expiring_days"];
  return [...common, "expiring_days"];
}

export function validatePaymentSettings(
  settings: Pick<PaymentSettings, "lessons_per_payment" | "expiring_days" | "expiring_lessons"> &
    Partial<Pick<PaymentSettings, "excuse_deadline_days" | "excuse_deadline_lessons" | "billing_day" | "period_mode" | "billing_anchor">>,
  scope?: PaymentSettingsScope,
): string | null {
  if (scope !== "attendance") {
    // For the «Оплаты» section only what its card shows is checked (a hidden field with a leftover value must not block the save).
    const shown = scope === "payments" && settings.period_mode
      ? paymentsScopeKeys(paymentModelOf({ period_mode: settings.period_mode, billing_anchor: settings.billing_anchor ?? "payment_date" }))
      : null;
    const check = (key: SettingsKey) => shown === null || shown.includes(key);
    if (check("lessons_per_payment") && !inRange(settings.lessons_per_payment, LESSONS_PER_PAYMENT_RANGE)) {
      return `Число уроков в оплате: от ${LESSONS_PER_PAYMENT_RANGE.min} до ${LESSONS_PER_PAYMENT_RANGE.max}`;
    }
    if (check("expiring_days") && !inRange(settings.expiring_days, EXPIRING_DAYS_RANGE)) {
      return `Порог «скоро» в днях: от ${EXPIRING_DAYS_RANGE.min} до ${EXPIRING_DAYS_RANGE.max}`;
    }
    if (check("expiring_lessons") && !inRange(settings.expiring_lessons, EXPIRING_LESSONS_RANGE)) {
      return `Порог «скоро» в уроках: от ${EXPIRING_LESSONS_RANGE.min} до ${EXPIRING_LESSONS_RANGE.max}`;
    }
    if (check("billing_day") && settings.billing_day !== undefined && !inRange(settings.billing_day, BILLING_DAY_RANGE)) {
      return `Единый день оплаты: число от ${BILLING_DAY_RANGE.min} до ${BILLING_DAY_RANGE.max}`;
    }
  }
  if (scope !== "payments") {
    if (settings.excuse_deadline_days !== undefined && !inRange(settings.excuse_deadline_days, EXCUSE_DEADLINE_DAYS_RANGE)) {
      return `Срок подтверждения пропуска в днях: от ${EXCUSE_DEADLINE_DAYS_RANGE.min} до ${EXCUSE_DEADLINE_DAYS_RANGE.max}`;
    }
    if (settings.excuse_deadline_lessons !== undefined && !inRange(settings.excuse_deadline_lessons, EXCUSE_DEADLINE_LESSONS_RANGE)) {
      return `Срок подтверждения пропуска в уроках: от ${EXCUSE_DEADLINE_LESSONS_RANGE.min} до ${EXCUSE_DEADLINE_LESSONS_RANGE.max}`;
    }
  }
  return null;
}

// The three ways a center counts a payment, as the owner sees them (spec §1).
export type PaymentModel = "payment_date" | "fixed_day" | "lessons";

export const PAYMENT_MODELS: Array<{ key: PaymentModel; title: string; hint: string }> = [
  { key: "payment_date", title: "От даты оплаты", hint: "Месяц считается со дня оплаты: 05.10 → 04.11" },
  { key: "fixed_day", title: "Единый день оплаты", hint: "У всех учеников один период, например с 1-го по последнее число месяца" },
  { key: "lessons", title: "Пакет уроков", hint: "Оплата закрывает заданное число проведённых уроков" },
];

export const FIXED_DAY_HINT = "Ученик, пришедший в середине месяца, платит за неполный месяц — сумма пересчитывается по урокам";

/** Which of the three cards is selected for these settings. */
export function paymentModelOf(settings: Pick<PaymentSettings, "period_mode" | "billing_anchor">): PaymentModel {
  if (settings.period_mode === "lessons") return "lessons";
  return settings.billing_anchor === "fixed_day" ? "fixed_day" : "payment_date";
}

/** The fields a card sets; the chosen day and the other mode's values are left as they are. */
export function paymentModelPatch(model: PaymentModel): Pick<PaymentSettings, "period_mode"> & Partial<Pick<PaymentSettings, "billing_anchor">> {
  if (model === "lessons") return { period_mode: "lessons" };
  return { period_mode: "calendar", billing_anchor: model };
}

/** «Период: с 1-го по последнее число месяца», «Период: с 10-го числа по 9-е число следующего месяца». */
export function billingDayHint(day: number): string {
  if (!Number.isInteger(day) || day < BILLING_DAY_RANGE.min || day > BILLING_DAY_RANGE.max) return "";
  return day === 1
    ? "Период: с 1-го по последнее число месяца"
    : `Период: с ${day}-го числа по ${day - 1}-е число следующего месяца`;
}

/** Only changed fields go to the server (PATCH semantics); `keys` limits the comparison to one section. */
export function diffPaymentSettings(
  before: PaymentSettings,
  after: PaymentSettings,
  keys: ReadonlyArray<SettingsKey> = [...PAYMENTS_SCOPE_KEYS, ...ATTENDANCE_SCOPE_KEYS],
): PaymentSettingsUpdate {
  const patch: Record<string, unknown> = {};
  for (const key of keys) {
    if (before[key] !== after[key]) patch[key] = after[key];
  }
  return patch as PaymentSettingsUpdate;
}

// ── Banner ─────────────────────────────────────────────────────────────────

/**
 * The banner is hidden for this session after the user dismissed it, until MORE people wait than at that moment
 * (`dismissedAt` = the count at dismissal, null = never dismissed).
 */
export function bannerDismissed(dismissedAt: number | null, due: number): boolean {
  return dismissedAt !== null && due <= dismissedAt;
}
