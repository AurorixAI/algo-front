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

// ── API contract (spec §3) ─────────────────────────────────────────────────

export type PeriodMode = "calendar" | "lessons";
export type PaymentStatus = "none" | "free" | "expired" | "ends_today" | "expiring" | "active";
export type PaymentBucket = "due" | "expiring" | "none" | "active";

export interface PaymentSettings {
  period_mode: PeriodMode;
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
}

/** The payment a carry-over (amount 0, made by a transfer) was made from. */
export interface CarriedFrom {
  payment_id: string;
  group_name: string;
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
  created_by: string | null;
  created_by_name: string | null;
  created_at: string | null;
  voided_at: string | null;
  voided_by: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
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
  code: "overlaps_previous" | "gap_before" | "period_over_62_days" | "paid_over_60_days_ago" | string;
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

/** Plural form for a Russian noun: [1 урок, 2 урока, 5 уроков]. */
export function pluralRu(count: number, forms: [string, string, string]): string {
  const n = Math.abs(Math.trunc(count));
  const last = n % 10;
  const lastTwo = n % 100;
  if (last === 1 && lastTwo !== 11) return forms[0];
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return forms[1];
  return forms[2];
}

// ── Buckets (tabs) ─────────────────────────────────────────────────────────

export const PAYMENT_BUCKETS: Array<{ key: PaymentBucket; label: string }> = [
  { key: "due", label: "Требуют оплаты" },
  { key: "expiring", label: "Скоро заканчивается" },
  { key: "none", label: "Нет данных" },
  { key: "active", label: "Оплачено" },
];

/** `?bucket=` of the page; unknown or missing values open the most urgent tab. */
export function parseBucket(value: string | null | undefined): PaymentBucket {
  return PAYMENT_BUCKETS.find((bucket) => bucket.key === value)?.key ?? "due";
}

/** Counters of the tabs that show one. */
export function bucketCount(summary: Pick<PaymentsSummary, "due" | "none"> | null, key: PaymentBucket): number | null {
  if (!summary) return null;
  if (key === "due") return summary.due;
  if (key === "none") return summary.none;
  return null;
}

// ── Status wording ─────────────────────────────────────────────────────────

export type StatusTone = "danger" | "warning" | "ok" | "muted" | "free";

export function lessonsWord(count: number): string {
  return pluralRu(count, ["урок", "урока", "уроков"]);
}

/** «Оплачено до 04.11.2026», «Сегодня последний день», «Закончилась 3 дн. назад», «Через 2 дн.», «Осталось 3 урока из 12»… */
export function statusLabel(
  row: Pick<MembershipPaymentRow, "status" | "period_mode" | "paid_until" | "days_overdue" | "days_left" | "lessons_total" | "lessons_left">,
): string {
  const lessons = row.period_mode === "lessons";
  switch (row.status) {
    case "none":
      return "Нет данных";
    case "free":
      return "Бесплатно";
    case "ends_today":
      return "Сегодня последний день";
    case "expired":
      if (lessons) return "Уроки закончились";
      return row.days_overdue ? `Закончилась ${row.days_overdue} дн. назад` : "Оплата закончилась";
    case "expiring":
    case "active":
      if (lessons) {
        if (row.lessons_left === null || row.lessons_left === undefined) return "Оплачено";
        const left = `Осталось ${row.lessons_left} ${lessonsWord(row.lessons_left)}`;
        return row.lessons_total ? `${left} из ${row.lessons_total}` : left;
      }
      if (row.status === "expiring") return row.days_left ? `Через ${row.days_left} дн.` : "Скоро закончится";
      return row.paid_until ? `Оплачено до ${formatDateRu(row.paid_until)}` : "Оплачено";
  }
  return "";
}

/** Second line under the badge: the date the calendar payment runs to. */
export function statusDetail(row: Pick<MembershipPaymentRow, "status" | "period_mode" | "paid_until">): string {
  if (row.period_mode === "lessons" || !row.paid_until) return "";
  if (row.status === "expiring" || row.status === "ends_today" || row.status === "expired") {
    return `до ${formatDateRu(row.paid_until)}`;
  }
  return "";
}

export function statusTone(status: PaymentStatus): StatusTone {
  switch (status) {
    case "expired":
    case "ends_today":
      return "danger";
    case "expiring":
      return "warning";
    case "active":
      return "ok";
    case "free":
      return "free";
    default:
      return "muted";
  }
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

/** «Период 31 дн.» under the dates; null while the dates are incomplete or reversed. */
export function periodHint(values: Pick<PaymentFormValues, "validFrom" | "validTo">, mode: PeriodMode): string | null {
  if (mode !== "calendar" || !isIsoDate(values.validFrom) || !isIsoDate(values.validTo)) return null;
  const days = periodDays(values.validFrom, values.validTo);
  return days >= 1 ? `Период ${days} дн.` : null;
}

/** Reason of a cancellation: trimmed 3..500 characters. */
export function validateVoidReason(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (text.length < REASON_MIN) return `Укажите причину (не короче ${REASON_MIN} символов)`;
  if (text.length > REASON_MAX) return `Причина не длиннее ${REASON_MAX} символов`;
  return null;
}

/** Monthly fee field: empty clears it (null), otherwise 0..10 000 000 000. */
export function parseMonthlyFee(text: string): { value: number | null; error: string | null } {
  const value = parseMoneyInput(text);
  if (value !== null && value > MAX_MONEY) return { value: null, error: "Сумма слишком большая" };
  return { value, error: null };
}

// ── Center settings ────────────────────────────────────────────────────────

export const LESSONS_PER_PAYMENT_RANGE = { min: 1, max: 60 } as const;
export const EXPIRING_DAYS_RANGE = { min: 0, max: 14 } as const;
export const EXPIRING_LESSONS_RANGE = { min: 0, max: 10 } as const;
export const EXCUSE_DEADLINE_DAYS_RANGE = { min: 0, max: 30 } as const;
export const EXCUSE_DEADLINE_LESSONS_RANGE = { min: 0, max: 12 } as const;

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  period_mode: "calendar",
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

export function validatePaymentSettings(
  settings: Pick<PaymentSettings, "lessons_per_payment" | "expiring_days" | "expiring_lessons"> &
    Partial<Pick<PaymentSettings, "excuse_deadline_days" | "excuse_deadline_lessons">>,
): string | null {
  if (!inRange(settings.lessons_per_payment, LESSONS_PER_PAYMENT_RANGE)) {
    return `Число уроков в оплате: от ${LESSONS_PER_PAYMENT_RANGE.min} до ${LESSONS_PER_PAYMENT_RANGE.max}`;
  }
  if (!inRange(settings.expiring_days, EXPIRING_DAYS_RANGE)) {
    return `Порог «скоро» в днях: от ${EXPIRING_DAYS_RANGE.min} до ${EXPIRING_DAYS_RANGE.max}`;
  }
  if (!inRange(settings.expiring_lessons, EXPIRING_LESSONS_RANGE)) {
    return `Порог «скоро» в уроках: от ${EXPIRING_LESSONS_RANGE.min} до ${EXPIRING_LESSONS_RANGE.max}`;
  }
  if (settings.excuse_deadline_days !== undefined && !inRange(settings.excuse_deadline_days, EXCUSE_DEADLINE_DAYS_RANGE)) {
    return `Срок подтверждения пропуска в днях: от ${EXCUSE_DEADLINE_DAYS_RANGE.min} до ${EXCUSE_DEADLINE_DAYS_RANGE.max}`;
  }
  if (settings.excuse_deadline_lessons !== undefined && !inRange(settings.excuse_deadline_lessons, EXCUSE_DEADLINE_LESSONS_RANGE)) {
    return `Срок подтверждения пропуска в уроках: от ${EXCUSE_DEADLINE_LESSONS_RANGE.min} до ${EXCUSE_DEADLINE_LESSONS_RANGE.max}`;
  }
  return null;
}

/** Only changed fields go to the server (PATCH semantics). */
export function diffPaymentSettings(before: PaymentSettings, after: PaymentSettings): PaymentSettingsUpdate {
  const keys = [
    "period_mode", "lessons_per_payment", "expiring_days", "expiring_lessons",
    "excuse_deadline_days", "excuse_deadline_lessons", "admin_can_manage",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const key of keys) {
    if (before[key] !== after[key]) patch[key] = after[key];
  }
  return patch as PaymentSettingsUpdate;
}

// ── Banner ─────────────────────────────────────────────────────────────────

/**
 * «Требуют оплаты: N». Counts memberships due today or overdue: a student in
 * two groups can appear twice, and «ends today» is still paid, so the banner
 * must not claim «оплата закончилась».
 */
export function bannerText(due: number): string {
  return `Требуют оплаты: ${due}`;
}
