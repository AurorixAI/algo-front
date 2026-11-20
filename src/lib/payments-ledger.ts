/**
 * PAY-2 ledger rules of the front: how a balance (debt / advance) is worded, the form of the payment dialog and its live
 * preview, write-off and refund forms, the account statement of a student, and the tolerant reading of the server's answers.
 *
 * The sentences that describe a calculation (`summary_text`, the label of an allocation, `balance_text`, `days_text`)
 * are written by the server and shown as they come; this file only arranges them.  Pure: no React, no network.
 */
import { formatUtcNaiveAsBusinessDateTime } from "./business-time";
import { MONTHS_GENITIVE, MONTHS_NOMINATIVE } from "./ru-calendar";
import { formatMoneyInput } from "./money-format";
import {
  formatDateRu,
  formatMoney,
  isIsoDate,
  MAX_MONEY,
  NOTE_MAX,
  parseMoneyInput,
  PAYMENT_MAX_AGE_YEARS,
  paymentModelTitle,
  REASON_MAX,
  REASON_MIN,
  subtractYears,
  type Allocation,
  type AllocationSummary,
  type MembershipPaymentRow,
  type PayErrorDetail,
  type PayMethod,
  type PaymentCreate,
  type PaymentPreview,
  type PaymentSaveResult,
  type PaymentWarning,
  type PreviewDue,
  type PreviewResult,
  type RefundCreate,
  type Segment,
  type StatementOut,
  type OpenPart,
  type StatementRow,
  type StatementRowType,
  type StatementSummary,
  type WriteoffCreate,
} from "./payments";
import { formatDayMonthRu, shiftMonthKey } from "./business-time";
import { recalcAmountText, type RecalcLine } from "./payf";
import { serverEffectsRows } from "./money-effects";
import { rowUnpaid } from "./pay-state";

// ── Tolerant numbers and lists ─────────────────────────────────────────────

/** A whole сум: null, undefined, text or NaN from an older server read as 0. */
export function sum(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

const nullableSum = (value: unknown): number | null => (value === null || value === undefined ? null : sum(value));
const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

// ── Methods ────────────────────────────────────────────────────────────────

export type EnterableMethod = Exclude<PayMethod, "unknown">;

export const METHODS: Array<{ key: EnterableMethod; label: string }> = [
  { key: "cash", label: "Наличные" },
  { key: "card", label: "Карта" },
  { key: "bank_transfer", label: "Перевод" },
  { key: "click", label: "Click" },
  { key: "payme", label: "Payme" },
  { key: "other", label: "Другое" },
];

/** «Наличные»; an old record without a method (or with `unknown`) reads «Способ не указан». */
export function methodLabel(method: PayMethod | null | undefined): string {
  return METHODS.find((item) => item.key === method)?.label ?? "Способ не указан";
}

/** A method the form may send (`unknown` is only an old record). */
export function enterableMethod(method: PayMethod | null | undefined): EnterableMethod | null {
  return METHODS.find((item) => item.key === method)?.key ?? null;
}

// ── Balance of a group: «Долг …» / «Аванс …» ───────────────────────────────

export type BalanceKind = "debt" | "advance" | "none";

export interface BalanceView {
  kind: BalanceKind;
  amount: number;
  /** «Долг 269 000 сум» / «Аванс 21 000 сум»; "" when there is neither. */
  text: string;
  /** Tailwind classes of the text: red for a debt, green for an advance. */
  className: string;
}

export const BALANCE_TEXT_CLASS: Record<BalanceKind, string> = {
  debt: "text-rose-700",
  advance: "text-emerald-700",
  none: "text-slate-500",
};

export function debtLabel(amount: number): string {
  return `Долг ${formatMoney(amount)}`;
}

export function advanceLabel(amount: number): string {
  return `Аванс ${formatMoney(amount)}`;
}

/** Debt and advance of a row (an older server sends neither: both 0).  A debt wins over an advance by construction. */
export function rowBalance(row: Pick<MembershipPaymentRow, "debt" | "advance"> | null | undefined): { debt: number; advance: number } {
  return { debt: Math.max(0, sum(row?.debt)), advance: Math.max(0, sum(row?.advance)) };
}

export function balanceView(row: Pick<MembershipPaymentRow, "debt" | "advance"> | null | undefined): BalanceView {
  const { debt, advance } = rowBalance(row);
  if (debt > 0) return { kind: "debt", amount: debt, text: debtLabel(debt), className: BALANCE_TEXT_CLASS.debt };
  if (advance > 0) return { kind: "advance", amount: advance, text: advanceLabel(advance), className: BALANCE_TEXT_CLASS.advance };
  return { kind: "none", amount: 0, text: "", className: BALANCE_TEXT_CLASS.none };
}

/** «Долг 269 000 сум» / «Аванс 21 000 сум» / «0» (the owner's «Баланс») from a signed balance (minus = debt, plus = advance). */
export function signedBalanceText(balance: number | null | undefined): string {
  if (balance === null || balance === undefined) return "";
  const value = sum(balance);
  if (value < 0) return debtLabel(-value);
  if (value > 0) return advanceLabel(value);
  return "0";
}

/** The write-off button is offered with a debt, to a role the server allowed. */
export function canWriteOff(row: Pick<MembershipPaymentRow, "debt" | "writeoff_allowed">): boolean {
  return row.writeoff_allowed !== false && rowBalance(row).debt > 0;
}

/** The refund button is offered when the server says there is something to give back. */
export function canRefund(row: Pick<MembershipPaymentRow, "refundable">): boolean {
  return sum(row.refundable) > 0;
}

// ── Allocation: where a payment went ───────────────────────────────────────

export interface AllocationLine {
  label: string;
  amount: number;
  bucket: Allocation["bucket"];
  closes: boolean;
  /** What is left unpaid of that period right after this piece (null: an advance line or a receipt made before the addendum). */
  remainingAfter: number | null;
}

export function allocationLines(items: Allocation[] | null | undefined): AllocationLine[] {
  return list<Allocation>(items)
    .filter((item) => sum(item.amount) > 0)
    .map((item) => ({ label: item.label, amount: sum(item.amount), bucket: item.bucket, closes: Boolean(item.closes), remainingAfter: nullableSum(item.segment_remaining_after) }));
}

/** «Погашен долг за 15.09–14.10 · 269 000 сум» (the label is the server's) */
export function allocationText(item: Pick<Allocation, "label" | "amount">): string {
  return `${item.label} · ${formatMoney(item.amount)}`;
}

/** Where the money of a saved payment went, for a toast: one line per period and the balance left. */
/** «Остаток долга после оплаты: 469 000 сум» / «Аванс после оплаты: 300 000 сум» / «Остаток долга после оплаты: 0 сум» (UX pack §1, №14: the words of the receipt and the toast). */
export function balanceAfterText(unpaidAfter: number | null | undefined, advanceAfter: number | null | undefined, lead = "после оплаты"): string {
  const unpaid = sum(unpaidAfter);
  const advance = sum(advanceAfter);
  if (unpaid > 0) return `Останется неоплаченным ${lead}: ${formatMoney(unpaid)}`;
  if (advance > 0) return `Аванс ${lead}: ${formatMoney(advance)}`;
  return `Останется неоплаченным ${lead}: ${formatMoney(0)}`;
}

export function savedPaymentDetails(allocation: AllocationSummary | null | undefined): string[] {
  if (!allocation) return [];
  const lines = allocationLines(allocation.items).map(allocationText);
  lines.push(balanceAfterText(allocation.unpaid_after, allocation.advance_after));
  return lines;
}

/** The lines under the toast of a saved payment: where the money went; after a CORRECTION also what the server says it did to the debt in other groups and to the pay (Money-1 Г-4б, `money_effects.text`). */
export function savedPaymentToastDetails(kind: "create" | "replace", result: PaymentSaveResult): string[] {
  return [...savedPaymentDetails(result.allocation), ...(kind === "replace" ? serverEffectsRows(result) : [])];
}

// ── Payment form ───────────────────────────────────────────────────────────

export interface PaymentFormValues {
  /** Digits with thousands separators, as typed. */
  amount: string;
  paidOn: string;
  method: EnterableMethod | null;
  note: string;
  /** Only for a correction. */
  reason: string;
}

/** The amount a new payment starts with: everything that is due (debt + current period), 0 → the field stays empty. */
export function defaultAmount(preview: Pick<PaymentPreview, "suggested_amount"> | null | undefined): number | null {
  const amount = sum(preview?.suggested_amount);
  return amount > 0 ? amount : null;
}

export function validateAmount(text: string | null | undefined): string | null {
  const amount = parseMoneyInput(text);
  if (amount === null) return "Укажите сумму";
  if (amount < 1) return "Сумма должна быть больше нуля";
  if (amount > MAX_MONEY) return "Сумма слишком большая";
  return null;
}

/** The amount to ask the preview about, or null while the field is empty or out of range. */
export function previewAmount(text: string | null | undefined): number | null {
  const amount = parseMoneyInput(text);
  return amount !== null && amount >= 1 && amount <= MAX_MONEY ? amount : null;
}

export function validatePaymentForm(values: PaymentFormValues, today: string, reasonRequired = false): string | null {
  const amountProblem = validateAmount(values.amount);
  if (amountProblem) return amountProblem;
  if (!isIsoDate(values.paidOn)) return "Укажите дату оплаты";
  if (values.paidOn > today) return "Дата оплаты не может быть в будущем";
  if (values.paidOn < subtractYears(today, PAYMENT_MAX_AGE_YEARS)) return "Дата оплаты старше 3 лет";
  if (!values.method) return "Выберите способ оплаты";
  if (values.note.trim().length > NOTE_MAX) return `Комментарий не длиннее ${NOTE_MAX} символов`;
  if (reasonRequired) return validateReason(values.reason);
  if (values.reason.trim().length > REASON_MAX) return `Причина не длиннее ${REASON_MAX} символов`;
  return null;
}

/** Request body of a payment: money, date, method, note.  Call only after `validatePaymentForm` returned null. */
export function buildPaymentPayload(values: PaymentFormValues): PaymentCreate {
  if (!values.method) throw new Error("A payment needs a method");   // Money-1 V5: «other» is never sent for the person
  const payload: PaymentCreate = {
    amount: parseMoneyInput(values.amount) ?? 0,
    paid_on: values.paidOn,
    method: values.method,
  };
  const note = values.note.trim();
  if (note) payload.note = note;
  return payload;
}

/** A correction starts from the payment being replaced. */
export function paymentFormFrom(payment: { amount: number; paid_on: string; method?: PayMethod; note: string | null }): PaymentFormValues {
  return {
    amount: formatMoneyInput(sum(payment.amount)),
    paidOn: payment.paid_on,
    method: enterableMethod(payment.method),
    note: payment.note ?? "",
    reason: "",
  };
}

/** Reason of a cancellation / write-off: trimmed 3..500 characters. */
export function validateReason(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (text.length < REASON_MIN) return `Укажите причину (не короче ${REASON_MIN} символов)`;
  if (text.length > REASON_MAX) return `Причина не длиннее ${REASON_MAX} символов`;
  return null;
}

// ── Preview of a payment: top block and live calculation ──────────────────

function periodText(from: string, to: string): string {
  return `${formatDayMonthRu(from)}–${formatDayMonthRu(to)}`;
}

/** One sum on the top of «Внести оплату», named by the term in the SERVER'S words: «Долг 600 000 сум» + «просрочено 45 дней», «К оплате 231 000 сум» + «до 24.11» (PAY-DUE 10.10, frame 14). */
export interface DueState {
  key: "debt" | "due";
  text: string;
  sub: string | null;
  tone: "debt" | "due";
}

export interface DueBlock {
  /** Everything unpaid (the sum the window may take at most from a student who has left). */
  unpaid: number;
  advance: number;
  /** One or TWO states, the debt first; empty - nothing is due (or the server said nothing: LESSONS 151). */
  states: DueState[];
}

/** The block above the amount: both sums of the server, named, the debt first.  The screen adds and names nothing. */
export function dueBlock(preview: Pick<PaymentPreview, "due"> | null | undefined): DueBlock | null {
  if (!preview?.due) return null;
  const due = preview.due;
  const clean = (value: string | null | undefined) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const states: DueState[] = [];
  const debtText = clean(due.debt_text);
  const dueText = clean(due.due_text);
  if (sum(due.debt_amount) > 0 && debtText) states.push({ key: "debt", text: debtText, sub: clean(due.debt_sub), tone: "debt" });
  if (sum(due.due_amount) > 0 && dueText) states.push({ key: "due", text: dueText, sub: clean(due.due_sub), tone: "due" });
  return { unpaid: sum(due.unpaid), advance: sum(due.advance), states };
}

/** Under the amount when the group (and the student) has no price: the amount is typed by hand. */
export const PRICE_NOT_SET_TEXT = "Цена группы не задана — введите сумму вручную";

/** The server says there is no price to charge from (a price of 0 is a price: «Бесплатно»). */
export function priceMissing(preview: Pick<PaymentPreview, "price" | "warnings"> | null | undefined): boolean {
  if (!preview) return false;
  if (preview.warnings.some((warning) => warning.code === "price_missing")) return true;
  return preview.price?.amount === null || (preview.price?.amount === undefined && preview.price?.source === "none");
}

export interface PreviewLine {
  label: string;
  amount: number;
  bucket: Allocation["bucket"];
  closes: boolean;
  /** The exact unpaid remainder of that period right after this piece of money (null on an advance line). */
  remainingAfter: number | null;
}

export interface PreviewView {
  /** The server's sentence about the whole calculation. */
  headline: string;
  lines: PreviewLine[];
  /** «Оплачено до: 27.09.2026 → 15.10.2026»; null when it does not move (or in lessons mode). */
  paidUntil: string | null;
  /** «Уроков оплачено: 0 → 12, осталось 0» in lessons mode. */
  lessons: string | null;
  /** The D8 price-rise sentences. */
  priceAhead: string[];
  warnings: string[];
  /** Money-1 B9: the same sum to the same student within 24 hours - the server's sentence (a warning, never a ban). */
  repeated: string | null;
}

/** Money-1 B9: `code` of the warning «Такая же оплата внесена 5 минут назад — Иванов А.». */
export const PAYMENT_REPEATED_CODE = "payment_repeated";

/**
 * The warnings that stay on screen AFTER a payment was saved.  `payment_repeated` is a question for the moment BEFORE «Внести» (the preview): in the answer of the save it would ask it too late - the
 * payment is already booked - so it is dropped there (R3 №3).
 */
export function warningsAfterSave<T extends { code?: string }>(warnings: ReadonlyArray<T> | null | undefined): T[] {
  return (warnings ?? []).filter((warning) => warning.code !== PAYMENT_REPEATED_CODE);
}

export function previewView(preview: PaymentPreview | null | undefined): PreviewView | null {
  const result: PreviewResult | null | undefined = preview?.result;
  if (!preview || !result) return null;
  const before = result.paid_until_before;
  const after = result.paid_until_after;
  const lessons = result.lessons;
  const ahead = preview.warnings.filter((warning) => warning.code === "price_change_ahead").map((warning) => warning.message);
  return {
    headline: result.summary_text || "",
    lines: allocationLines(result.allocations),
    paidUntil: after && after !== before
      ? `Оплачено до: ${before ? `${formatDateRu(before)} → ` : ""}${formatDateRu(after)}`
      : null,
    lessons: lessons
      ? `Уроков оплачено: ${sum(lessons.covered_before)} → ${sum(lessons.covered_after)}, осталось ${sum(lessons.left_after)}${sum(lessons.unpaid_after) > 0 ? `, не оплачено ${sum(lessons.unpaid_after)}` : ""}`
      : null,
    priceAhead: ahead,
    warnings: preview.warnings.filter((warning) => warning.code !== "price_change_ahead" && warning.code !== PAYMENT_REPEATED_CODE && warning.code !== "left_debt_only").map((warning) => warning.message),
    repeated: preview.warnings.find((warning) => warning.code === PAYMENT_REPEATED_CODE)?.message ?? null,
  };
}

/** Normal reading of `GET …/payments/preview`: every number a number, every list a list. */
export function normalizePreview(raw: unknown): PaymentPreview {
  const data = (raw ?? {}) as Partial<PaymentPreview>;
  const due = (data.due ?? {}) as Partial<PreviewDue>;
  const result = data.result as Partial<PreviewResult> | null | undefined;
  return {
    as_of: String(data.as_of ?? ""),
    mode: data.mode === "lessons" ? "lessons" : "calendar",
    price: data.price ?? {},
    due: {
      unpaid: sum(due.unpaid),
      debt_amount: sum(due.debt_amount),
      due_amount: sum(due.due_amount),
      due_until: due.due_until ?? null,
      overdue_days: nullableSum(due.overdue_days),
      debt_text: due.debt_text ?? null,
      debt_sub: due.debt_sub ?? null,
      due_text: due.due_text ?? null,
      due_sub: due.due_sub ?? null,
      advance: sum(due.advance),
      segments: list<Segment>(due.segments),
      paid_until: due.paid_until ?? null,
    },
    suggested_amount: sum(data.suggested_amount),
    amount: nullableSum(data.amount),
    result: result
      ? {
          allocations: list<Allocation>(result.allocations),
          unpaid_after: sum(result.unpaid_after),
          debt_amount_after: sum(result.debt_amount_after),
          due_amount_after: sum(result.due_amount_after),
          due_until_after: result.due_until_after ?? null,
          overdue_days_after: nullableSum(result.overdue_days_after),
          advance_after: sum(result.advance_after),
          paid_until_before: result.paid_until_before ?? null,
          paid_until_after: result.paid_until_after ?? null,
          status_after: result.status_after ?? "none",
          partial_credit_after: sum(result.partial_credit_after),
          lessons: result.lessons ?? null,
          price_ahead: list(result.price_ahead),
          summary_text: String(result.summary_text ?? ""),
          after_text: String(result.after_text ?? ""),
        }
      : null,
    warnings: list<PaymentWarning>(data.warnings),
    recalc: list<RecalcLine>(data.recalc),
  };
}

/** A row with the PAY-2 numbers present (an older server sends none of them). */
export function normalizeRow(row: MembershipPaymentRow): MembershipPaymentRow {
  if (!row) return row;
  return {
    ...row,
    debt: rowUnpaid(row),
    advance: sum(row.advance),
    partial_credit: sum(row.partial_credit),
    refundable: sum(row.refundable),
    lessons_unpaid: sum(row.lessons_unpaid),
    price_missing: Boolean(row.price_missing),
    writeoff_allowed: row.writeoff_allowed !== false,
  };
}

export function normalizeSaveResult(raw: PaymentSaveResult): PaymentSaveResult {
  return { ...raw, warnings: list<PaymentWarning>(raw?.warnings), row: normalizeRow(raw?.row), allocation: raw?.allocation ?? null };
}

// ── Errors of the PAY-2 routes ─────────────────────────────────────────────

export type PayErrorKind =
  | "duplicate"
  | "amount_range"
  | "paid_on_range"
  | "method_required"
  | "writeoff_exceeds"
  | "refund_exceeds"
  | "reason_required"
  | "void_breaks_refund"
  | "already_voided"
  | "student_archived"
  /** Money-1 V1: the sum the person saw is not the sum now (409, with the fresh numbers). */
  | "balance_changed"
  /** Money-1 V1: the same `Idempotency-Key` again - the write is already there (409 with its id): a success, not an error. */
  | "duplicate_writeoff"
  | "duplicate_refund"
  /** Money-1 V3 / V4: a price or a rate in times: the person is asked once more (409). */
  | "price_unusual"
  | "rate_unusual"
  | "other";

export interface PayError {
  kind: PayErrorKind;
  /** The server's own Russian text. */
  message: string;
  paymentId: string | null;
  debt: number | null;
  refundable: number | null;
  advance: number | null;
  refundId: string | null;
  writeoffId: string | null;
  /** `ALREADY_VOIDED`: when and by whom the record was cancelled. */
  voidedAt: string | null;
  voidedByName: string | null;
}

const ERROR_KIND: Record<string, PayErrorKind> = {
  DUPLICATE_PAYMENT: "duplicate",
  AMOUNT_RANGE: "amount_range",
  PAID_ON_RANGE: "paid_on_range",
  METHOD_REQUIRED: "method_required",
  WRITEOFF_EXCEEDS_DEBT: "writeoff_exceeds",
  REFUND_EXCEEDS_ADVANCE: "refund_exceeds",
  REASON_REQUIRED: "reason_required",
  VOID_BREAKS_REFUND: "void_breaks_refund",
  ALREADY_VOIDED: "already_voided",
  STUDENT_ARCHIVED: "student_archived",
  BALANCE_CHANGED: "balance_changed",
  DUPLICATE_WRITEOFF: "duplicate_writeoff",
  DUPLICATE_REFUND: "duplicate_refund",
  PRICE_UNUSUAL: "price_unusual",
  RATE_UNUSUAL: "rate_unusual",
};

/** The error of a payments call (an `ApiError` carries `code`, `message` and the whole `detail`) in one shape. */
export function payError(error: unknown, fallback = "Не удалось выполнить действие"): PayError {
  const e = (error ?? {}) as { message?: string; code?: string; detail?: Partial<PayErrorDetail> | string | null };
  const detail = e.detail && typeof e.detail === "object" ? e.detail : null;
  const code = e.code ?? detail?.code ?? null;
  const message = (detail?.message || e.message || fallback).replace(/[.\s]+$/, "");
  return {
    kind: (code && ERROR_KIND[code]) || "other",
    message,
    paymentId: detail?.payment_id ?? null,
    debt: detail?.debt ?? null,
    refundable: detail?.refundable ?? null,
    advance: detail?.advance ?? null,
    refundId: detail?.refund_id ?? null,
    writeoffId: detail?.writeoff_id ?? null,
    voidedAt: detail?.voided_at ?? null,
    voidedByName: detail?.voided_by_name ?? null,
  };
}

/** What a 409 `BALANCE_CHANGED` tells: the sentence of the server («Долг изменился: было …, сейчас …») and the number the window continues with (`field` of the body: debt / refundable / advance). */
export interface BalanceChange { message: string; fresh: number; }
export function balanceChangeOf(error: unknown, field: "debt" | "refundable" | "advance"): BalanceChange | null {
  const info = payError(error);
  if (info.kind !== "balance_changed") return null;
  const fresh = info[field];
  return typeof fresh === "number" ? { message: info.message, fresh } : null;
}

/** «Оплата уже отменена · Иванова Д., 05.11 14:20»: the sentence of the server and who cancelled it, for an `ALREADY_VOIDED` (null when it is another failure). */
export function alreadyVoidedText(error: unknown): string | null {
  const info = payError(error);
  if (info.kind !== "already_voided") return null;
  const when = info.voidedAt ? formatUtcNaiveAsBusinessDateTime(info.voidedAt) : "";
  const who = [info.voidedByName, when].filter(Boolean).join(", ");
  return who ? `${info.message} · ${who}` : info.message;
}

// ── Write-off ──────────────────────────────────────────────────────────────

export interface WriteoffFormValues {
  /** Digits as typed; ignored while `all` is set. */
  amount: string;
  all: boolean;
  reason: string;
}

export function writeoffAmount(values: WriteoffFormValues, debt: number): number | null {
  return values.all ? debt : parseMoneyInput(values.amount);
}

export function validateWriteoff(values: WriteoffFormValues, debt: number): string | null {
  if (debt <= 0) return "Долга нет — прощать нечего";
  if (!values.all) {
    const amount = parseMoneyInput(values.amount);
    if (amount === null) return "Укажите сумму или выберите «Весь долг»";
    if (amount < 1) return "Сумма должна быть больше нуля";
    if (amount > debt) return `Простить можно не больше долга: ${formatMoney(debt)}`;
  }
  return validateReason(values.reason);
}

export function buildWriteoffPayload(values: WriteoffFormValues, today?: string, expectedDebt?: number): WriteoffCreate {
  const body: WriteoffCreate = { reason: values.reason.trim() };
  if (values.all) body.all = true;
  else body.amount = parseMoneyInput(values.amount) ?? 0;
  if (today) body.effective_on = today;
  if (expectedDebt !== undefined) body.expected_debt = expectedDebt;
  return body;
}

/** «Долг станет 60 000 сум» / «Долг будет прощён полностью» under the amount. */
export function writeoffPreviewText(values: WriteoffFormValues, debt: number): string {
  const amount = writeoffAmount(values, debt);
  if (amount === null || amount < 1 || amount > debt) return "";
  return amount === debt ? "Долг будет прощён полностью" : `Долг станет ${formatMoney(debt - amount)}`;
}

// ── Refund ─────────────────────────────────────────────────────────────────

export interface RefundFormValues {
  amount: string;
  method: EnterableMethod | null;
  reason: string;
}

export function validateRefund(values: RefundFormValues, refundable: number): string | null {
  if (refundable <= 0) return "Возвращать нечего";
  const amount = parseMoneyInput(values.amount);
  if (amount === null) return "Укажите сумму";
  if (amount < 1) return "Сумма должна быть больше нуля";
  if (amount > refundable) return `Вернуть можно не больше ${formatMoney(refundable)}`;
  if (!values.method) return "Выберите способ возврата";
  return validateReason(values.reason);
}

/** The body of a refund: the method and the reason are the person's (a refund without them is not sent); `expectedRefundable` is the sum the window SHOWED (Money-1 V1). */
export function buildRefundPayload(values: RefundFormValues, today?: string, expectedRefundable?: number): RefundCreate {
  if (!values.method) throw new Error("A refund needs a method");
  const body: RefundCreate = { amount: parseMoneyInput(values.amount) ?? 0, method: values.method, reason: values.reason.trim() };
  if (today) body.effective_on = today;
  if (expectedRefundable !== undefined) body.expected_refundable = expectedRefundable;
  return body;
}

/** «Останется аванс 100 000 сум» / «Аванс будет возвращён полностью». */
export function refundPreviewText(values: RefundFormValues, refundable: number): string {
  const amount = parseMoneyInput(values.amount);
  if (amount === null || amount < 1 || amount > refundable) return "";
  return amount === refundable ? "Аванс будет возвращён полностью" : `Останется аванс ${formatMoney(refundable - amount)}`;
}

// ── Statement ──────────────────────────────────────────────────────────────

export const STATEMENT_TYPE_LABEL: Record<StatementRowType, string> = {
  charge: "Стоимость",
  payment: "Оплата",
  writeoff: "Долг прощён",
  refund: "Возврат",
  transfer_in: "Деньги ученика перешли из группы",
  transfer_out: "Деньги ученика перешли в группу",
  opening_debt: "Долг на начало учёта",
  opening_paid_until: "Оплачено до начала учёта",
  pause: "Пауза",
  recalc: "Перерасчёт",
};

const MINUS = "−";

/** «+231 000» / «−500 000» (a true minus sign): how the row moved the balance.  Money in is plus, a charge or money out is minus. */
export function effectText(row: Pick<StatementRow, "debit" | "credit" | "outflow">): string {
  const effect = sum(row.credit) - sum(row.debit) - sum(row.outflow);
  if (effect === 0) return "0";
  const digits = formatMoney(Math.abs(effect)).replace(/ сум$/, "");
  return `${effect > 0 ? "+" : MINUS}${digits}`;
}

export function effectOf(row: Pick<StatementRow, "debit" | "credit" | "outflow">): number {
  return sum(row.credit) - sum(row.debit) - sum(row.outflow);
}

export function priceSourceText(source: string | null | undefined): string {
  if (source === "override") return "индивидуальная цена";
  if (source === "group") return "цена группы";
  return "цена не задана";
}

/** A line under the title of a row: what the charge / payment / write-off / refund is made of. */
export function statementRowNotes(row: StatementRow): string[] {
  const d = row.details;
  const notes: string[] = [];
  switch (row.type) {
    case "charge": {
      const segment = d.segment;
      if (segment) {
        const price = sum(segment.price?.amount);
        const priceText = segment.price?.amount === null || segment.price?.amount === undefined
          ? "цена не задана"
          : `${formatMoney(price)} · ${priceSourceText(segment.price?.source)}`;
        notes.push(priceText);
        if (segment.days_text) notes.push(segment.days_text);
        else if (segment.kind === "package" && segment.lessons) notes.push(`${segment.lessons.in_part} из ${segment.lessons.in_period} уроков`);
      }
      break;
    }
    case "payment":
      notes.push(methodLabel(d.method));
      if (d.created_by_name) notes.push(`внёс: ${d.created_by_name}`);
      if (d.note) notes.push(d.note);
      break;
    case "writeoff":
      if (d.reason) notes.push(`причина: ${d.reason}`);
      if (d.created_by_name) notes.push(`простил: ${d.created_by_name}`);
      break;
    case "refund":
      notes.push(methodLabel(d.method));
      if (d.reason) notes.push(`причина: ${d.reason}`);
      if (d.created_by_name) notes.push(`вернул: ${d.created_by_name}`);
      break;
    case "recalc":
      if (d.recalc) notes.push(recalcAmountText(d.recalc));       // the title names the lesson; the line carries the amount only
      break;
    default:
      break;
  }
  return notes;
}

export interface StatementTotal {
  key: "charged" | "paid" | "written_off" | "recalculated" | "refunded" | "transferred_in" | "transferred_out";
  label: string;
  /** Money; for the balance the signed text is `text`. */
  amount: number;
  text: string;
  tone: BalanceKind | "plain";
  /** The «?» next to the label: what the figure is. */
  hint?: string;
}

export const STATEMENT_HINTS = {
  written_off: "Прощено — долг, который центр простил (кнопка «Простить долг»)",
  recalculated: "Перерасчёт — уроки, которые отменил центр, вычтены из оплаты (настройка «Оплаты»)",
  refunded: "Возвращено — аванс, возвращённый ученику (кнопка «Вернуть аванс»)",
  transferred_in: "Деньги, которые пришли вместе с учеником из другой группы",
  transferred_out: "Деньги, которые ушли вместе с учеником в другую группу",
  reconciles: "Счёт сходится: стоимость − оплачено − прощено − перерасчёт + возвращено = неоплачено − аванс; «Остаток» по строкам складывается в итог вверху (долг, к оплате, аванс)",
} as const;

/**
 * The tiles above the statement: Стоимость обучения · Оплачено · Остаток; «Прощено» and «Возвращено» (and the transfers) only
 * when there is something, each with a hint saying what it is.
 */
export function statementTotals(summary: StatementSummary | null | undefined): StatementTotal[] {
  if (!summary) return [];
  const money = (key: StatementTotal["key"], label: string, value: number, hint?: string): StatementTotal => ({ key, label, amount: sum(value), text: formatMoney(value), tone: "plain", hint });
  const out: StatementTotal[] = [money("charged", "Стоимость обучения", summary.charged), money("paid", "Оплачено", summary.paid)];
  if (sum(summary.transferred_in) > 0) out.push(money("transferred_in", "Деньги из других групп", summary.transferred_in, STATEMENT_HINTS.transferred_in));
  if (sum(summary.written_off) > 0) out.push(money("written_off", "Прощено", summary.written_off, STATEMENT_HINTS.written_off));
  if (sum(summary.recalculated) > 0) out.push(money("recalculated", "Перерасчёт", sum(summary.recalculated), STATEMENT_HINTS.recalculated));
  if (sum(summary.refunded) > 0) out.push(money("refunded", "Возвращено", summary.refunded, STATEMENT_HINTS.refunded));
  if (sum(summary.transferred_out) > 0) out.push(money("transferred_out", "Деньги в другие группы", summary.transferred_out, STATEMENT_HINTS.transferred_out));
  return out;
}

/** One state on the right of the summary: «Долг 600 000 сум» + «просрочено 14 дней», «К оплате 231 000 сум» + «до 24.11», «Оплачено до 30.11»: the server's words, the tone by the name. */
export interface StatementState {
  key: "debt" | "due" | "state";
  text: string;
  sub: string | null;
  tone: "debt" | "due" | "paid" | "advance" | "plain";
}

/**
 * The state of the statement (PAY-DUE 9.8 / 10.11, frames 11-14): the part whose term has passed (the debt) and the part within it, each with its words and its quiet line - one or TWO, the debt first;
 * with no unpaid sum - the server's `state_text` of the worst state («Оплачено до 30.11», «Аванс 21 000 сум», «Осталось 7 уроков»).  The server said nothing - nothing is shown (LESSONS 151).
 */
export function statementStates(summary: StatementSummary | null | undefined): StatementState[] {
  if (!summary) return [];
  const clean = (value: string | null | undefined) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const out: StatementState[] = [];
  const debtText = clean(summary.debt_text);
  const dueText = clean(summary.due_text);
  if (sum(summary.debt_amount) > 0 && debtText) out.push({ key: "debt", text: debtText, sub: clean(summary.debt_sub), tone: "debt" });
  if (sum(summary.due_amount) > 0 && dueText) out.push({ key: "due", text: dueText, sub: clean(summary.due_sub), tone: "due" });
  if (out.length === 0) {
    const text = clean(summary.state_text);
    if (text) out.push({ key: "state", text, sub: null, tone: sum(summary.advance) > 0 ? "advance" : summary.state === "paid" ? "paid" : "plain" });
  }
  return out;
}

/** The identity of the statement: стоимость − оплачено − перенесено − прощено + возвращено + перенесено в другие = долг − аванс. */
export function statementDiff(summary: StatementSummary): number {
  const left = sum(summary.charged) - sum(summary.paid) - sum(summary.transferred_in) - sum(summary.written_off) - sum(summary.recalculated) + sum(summary.refunded) + sum(summary.transferred_out);
  return left - (sum(summary.unpaid) - sum(summary.advance));
}

/** What is open on a row, by name: the server's `open_parts` (one or two), else its single `open_name` / `open_text`; a row the server named nothing for has none (PAY-DUE 10.11). */
export function openParts(row: Pick<StatementRow, "open_parts" | "open_name" | "open_amount" | "open_text">): OpenPart[] {
  const parts = list<OpenPart>(row.open_parts).filter((part) => part && part.name);
  if (parts.length > 0) return parts.map((part) => ({ name: part.name, amount: sum(part.amount), text: String(part.text ?? "") }));
  if (row.open_name && typeof row.open_text === "string" && row.open_text.trim()) return [{ name: row.open_name, amount: sum(row.open_amount), text: row.open_text.trim() }];
  return [];
}

/** The sums of what is open on the rows, by name - the three equalities of the statement (10.11): `due` = «К оплате» of the summary, `debt` = its «Долг», `advance` = its «Аванс». */
export function openSums(statement: Pick<StatementOut, "rows" | "summary">): { due: number; debt: number; advance: number; paid: number } {
  const total = { due: 0, debt: 0, advance: 0, paid: 0 };
  for (const row of statement.rows) {
    if (row.voided_at) continue;
    for (const part of openParts(row)) total[part.name] += sum(part.amount);
  }
  return total;
}

/** The four checks of the statement: the identity of the summary and the three sums of the rows against the summary at the top. */
export function statementChecks(statement: Pick<StatementOut, "rows" | "summary"> | null | undefined): { identity: boolean; due: boolean; debt: boolean; advance: boolean } {
  if (!statement?.summary) return { identity: false, due: false, debt: false, advance: false };
  const { summary } = statement;
  const sums = openSums(statement);
  return {
    identity: summary.reconciles !== false && statementDiff(summary) === 0,
    due: sums.due === sum(summary.due_amount),
    debt: sums.debt === sum(summary.debt_amount),
    advance: sums.advance === sum(summary.advance),
  };
}

/** «сходится» only when the server and every check agree: the identity AND the sums of the «Остаток» of the rows by name (14Б.7; replaces the running total). */
export function statementReconciles(statement: Pick<StatementOut, "rows" | "summary"> | null | undefined): boolean {
  const checks = statementChecks(statement);
  return checks.identity && checks.due && checks.debt && checks.advance;
}

export function normalizeStatement(raw: StatementOut): StatementOut {
  const summary = (raw?.summary ?? {}) as Partial<StatementSummary>;
  const row = (item: StatementRow): StatementRow => ({
    ...item,
    debit: sum(item.debit),
    credit: sum(item.credit),
    outflow: sum(item.outflow),
    balance_after: nullableSum(item.balance_after),
    open_amount: nullableSum(item.open_amount),
    open_name: item.open_name ?? null,
    open_text: item.open_text ?? null,
    open_parts: list<OpenPart>(item.open_parts).map((part) => ({ name: part.name, amount: sum(part.amount), text: String(part.text ?? "") })),
    details: {
      allocations: list<Allocation>(item.details?.allocations),
      created_by_name: item.details?.created_by_name ?? null,
      from_group_name: item.details?.from_group_name ?? null,
      from_membership_id: item.details?.from_membership_id ?? null,
      method: item.details?.method ?? null,
      note: item.details?.note ?? null,
      payment_id: item.details?.payment_id ?? null,
      reason: item.details?.reason ?? null,
      receipt_no: item.details?.receipt_no ?? null,
      refund_id: item.details?.refund_id ?? null,
      segment: item.details?.segment ?? null,
      to_group_name: item.details?.to_group_name ?? null,
      to_membership_id: item.details?.to_membership_id ?? null,
      writeoff_id: item.details?.writeoff_id ?? null,
      recalc: item.details?.recalc ?? null,
      replaces_receipt_no: item.details?.replaces_receipt_no ?? null,
      replaces_amount: item.details?.replaces_amount ?? null,
      replaced_by_receipt_no: item.details?.replaced_by_receipt_no ?? null,
      recorded_on: item.details?.recorded_on ?? null,
    },
  });
  return {
    ...raw,
    summary: {
      charged: sum(summary.charged),
      paid: sum(summary.paid),
      transferred_in: sum(summary.transferred_in),
      written_off: sum(summary.written_off),
      recalculated: sum(summary.recalculated),
      refunded: sum(summary.refunded),
      transferred_out: sum(summary.transferred_out),
      unpaid: sum(summary.unpaid),
      advance: sum(summary.advance),
      debt_amount: sum(summary.debt_amount),
      due_amount: sum(summary.due_amount),
      due_until: summary.due_until ?? null,
      overdue_days: nullableSum(summary.overdue_days),
      debt_text: summary.debt_text ?? null,
      debt_sub: summary.debt_sub ?? null,
      due_text: summary.due_text ?? null,
      due_sub: summary.due_sub ?? null,
      state: summary.state ?? "none",
      state_text: summary.state_text ?? null,
      paid_until: summary.paid_until ?? null,
      status: summary.status ?? "none",
      reconciles: summary.reconciles !== false,
    },
    rows: list<StatementRow>(raw?.rows).map(row),
    voided: list<StatementRow>(raw?.voided).map(row),
    upcoming: list<Segment>(raw?.upcoming),
  };
}

/** A statement filter is a pair of dates in order (either may be empty). */
export function validateStatementRange(from: string, to: string): string | null {
  if (from && !isIsoDate(from)) return "Укажите начало периода";
  if (to && !isIsoDate(to)) return "Укажите конец периода";
  if (from && to && to < from) return "Конец периода раньше начала";
  return null;
}

/** File name of the downloaded statement when the server sends none. */
export function statementFileName(statement: Pick<StatementOut, "membership" | "as_of">, month: string | null = null): string {
  const who = `${statement.membership.student_name}_${statement.membership.group_name}`.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  // the file of one month says which one; «Все месяцы» keeps the date of the statement
  return `Выписка_${who}_${month ?? statement.as_of}.xlsx`;
}

/** The upcoming (already paid) periods, for the quiet block under the table. */
export function upcomingLine(segment: Segment): string {
  const period = segment.kind === "package" ? `Пакет ${periodText(segment.period_from, segment.period_to)}` : periodText(segment.period_from, segment.period_to);
  const paid = sum(segment.paid) > 0 ? `оплачено ${formatMoney(segment.paid)} из ${formatMoney(segment.charge)}` : `к оплате ${formatMoney(segment.charge)}`;
  return `${period}: ${paid}`;
}

// ── Receipt: what the money covered at the moment of payment ───────────────

export interface ReceiptFacts {
  /** A receipt of the old model: it shows the period, not the distribution. */
  legacy: boolean;
  method: string | null;
  lines: AllocationLine[];
  /** «Было не оплачено: 769 000 сум». */
  unpaidBefore: string | null;
  /** «Остаток долга после оплаты: 469 000 сум» / «Аванс после оплаты: 21 000 сум». */
  after: string | null;
  /** «Оплачено до: 15.10.2026 (было 27.09.2026)». */
  paidUntil: string | null;
}

/** The facts of a new receipt come from its snapshot; an old receipt (no allocations) is legacy. */
export function receiptFacts(receipt: {
  method?: PayMethod;
  allocations?: Allocation[] | null;
  debt_before?: number | null;
  debt_after?: number | null;
  advance_after?: number | null;
  paid_until_before?: string | null;
  paid_until_after?: string | null;
  price_snapshot?: { amount: number | null; source: string } | null;
}): ReceiptFacts {
  const legacy = !Array.isArray(receipt.allocations);
  if (legacy) return { legacy: true, method: null, lines: [], unpaidBefore: null, after: null, paidUntil: null };
  const debtAfter = nullableSum(receipt.debt_after);
  const advanceAfter = nullableSum(receipt.advance_after);
  const before = receipt.paid_until_before ?? null;
  const after = receipt.paid_until_after ?? null;
  const unpaidBefore = nullableSum(receipt.debt_before);
  return {
    legacy: false,
    method: receipt.method ? methodLabel(receipt.method) : null,
    lines: allocationLines(receipt.allocations),
    unpaidBefore: unpaidBefore !== null && unpaidBefore > 0 ? `Было не оплачено: ${formatMoney(unpaidBefore)}` : null,
    after: debtAfter === null && advanceAfter === null ? null : balanceAfterText(debtAfter, advanceAfter),
    paidUntil: after ? `Оплачено до: ${formatDateRu(after)}${before && before !== after ? ` (было ${formatDateRu(before)})` : ""}` : null,
  };
}

// ── Statement row, ready to draw ───────────────────────────────────────────

export interface StatementRowView {
  seq: number;
  type: StatementRowType;
  /** Стоимость / Оплата / Долг прощён… */
  typeLabel: string;
  /** The server's title: «Стоимость 15.09–14.10», «Оплата № 17». */
  title: string;
  date: string;
  notes: string[];
  /** «+231 000» / «−500 000». */
  effect: string;
  /** Plus (money in) or minus (a charge, money out): the colour. */
  effectSign: "plus" | "minus" | "zero";
  /** «Долг 269 000» (the server's words) — "" on a cancelled row. */
  balance: string;
  balanceKind: BalanceKind;
  allocations: AllocationLine[];
  paymentId: string | null;
  writeoffId: string | null;
  refundId: string | null;
  receiptNo: number | null;
  cancelled: boolean;
  /** «Отменено: причина · кто». */
  cancelNote: string | null;
}

export function statementRowView(row: StatementRow): StatementRowView {
  const effect = effectOf(row);
  const balance = row.balance_after ?? null;
  const balanceKind: BalanceKind = balance === null ? "none" : balance < 0 ? "debt" : balance > 0 ? "advance" : "none";
  const cancelled = Boolean(row.voided_at);
  return {
    seq: row.seq,
    type: row.type,
    typeLabel: STATEMENT_TYPE_LABEL[row.type],
    title: row.title,
    date: row.date,
    notes: statementRowNotes(row),
    effect: effectText(row),
    effectSign: effect > 0 ? "plus" : effect < 0 ? "minus" : "zero",
    balance: balance === null ? "" : row.balance_text || signedBalanceText(balance),
    balanceKind,
    allocations: row.type === "payment" ? allocationLines(row.details.allocations) : [],
    paymentId: row.details.payment_id,
    writeoffId: row.details.writeoff_id,
    refundId: row.details.refund_id,
    receiptNo: row.details.receipt_no,
    cancelled,
    cancelNote: cancelled
      ? `Отменено: ${row.void_reason || "причина не указана"}${row.voided_by_name ? ` · ${row.voided_by_name}` : ""}${row.details.replaced_by_receipt_no ? ` · заменена оплатой № ${row.details.replaced_by_receipt_no}` : ""}`
      : null,
  };
}

// ── Statement as a bank statement: Дата | Операция | Стоимость | Оплачено | Баланс ─────────────


/** `YYYY-MM` of a date. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** «Сентябрь 2026» */
export function monthTitle(key: string): string {
  const month = Number(key.slice(5, 7));
  const name = MONTHS_NOMINATIVE[month - 1] ?? key;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${key.slice(0, 4)}`;
}

/** «сентябрь» (a month inside a sentence). */
export function monthWord(key: string): string {
  return MONTHS_NOMINATIVE[Number(key.slice(5, 7)) - 1] ?? key;
}

function lastDayOf(key: string): string {
  const day = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
  return `${key}-${String(day).padStart(2, "0")}`;
}

/** The first / last day of a month key, for the filter of the server's export. */
export function monthRange(key: string): { from: string; to: string } {
  return { from: `${key}-01`, to: lastDayOf(key) };
}

/** A period inside one calendar month that starts on its 1st or ends on its last day: it is called by the month. */
export function isCalendarMonthPeriod(from: string, to: string): boolean {
  return monthKey(from) === monthKey(to) && (from.endsWith("-01") || to === lastDayOf(monthKey(from)));
}

/** «с 16.10 (7 уроков из 13)» -> «с 16.10, 7 уроков из 13»; «11 дней из 31» stays. */
function partWords(daysText: string): string {
  const match = /^(.*?)\s*\((.*)\)$/.exec(daysText.trim());
  return match ? `${match[1]}, ${match[2]}` : daysText.trim();
}

function digitsOf(value: number): string {
  return formatMoney(value).replace(/ сум$/, "");
}

/** «Август 2026 — неполный месяц (с 28.08, 2 урока из 13)» / «Сентябрь 2026» / «15.09–14.10» / «Пакет уроков 25.09–21.10 (12 уроков из 12)». */
export function chargeWords(segment: Segment): { title: string; sub: string } {
  const price = segment.price?.amount;
  const unit = segment.kind === "package" ? "за пакет" : "в месяц";
  const sub = price === null || price === undefined
    ? "цена не задана"
    : price === 0
      ? "бесплатно"
      : `цена ${digitsOf(price)} сум ${unit} · ${priceSourceText(segment.price?.source)}`;
  const part = segment.days_text
    ? partWords(segment.days_text)
    : segment.kind === "package" && segment.lessons ? `${segment.lessons.in_part} из ${segment.lessons.in_period} ${segment.lessons.in_period % 10 === 1 && segment.lessons.in_period % 100 !== 11 ? "урок" : "уроков"}` : "";
  if (segment.kind === "package") {
    return { title: `${paymentModelTitle("lessons")} ${formatDayMonthRu(segment.period_from)}–${formatDayMonthRu(segment.period_to)}${part ? ` (${part})` : ""}`, sub };
  }
  if (isCalendarMonthPeriod(segment.period_from, segment.period_to)) {
    const key = monthKey(segment.period_from);
    const partial = Boolean(segment.days_text) || segment.basis === "lessons" || segment.basis === "days";
    const words = part || `с ${formatDayMonthRu(segment.period_from)}`;
    return { title: partial ? `${monthTitle(key)} — неполный месяц (${words})` : monthTitle(key), sub };
  }
  return { title: `Период ${formatDayMonthRu(segment.period_from)}–${formatDayMonthRu(segment.period_to)}${part ? ` (${part})` : ""}`, sub };
}

/** «август» / «15.09–14.10» / «пакет 25.09–21.10»: how a period is named inside «за …». */
function periodName(from: string, to: string, kind?: "period" | "package"): string {
  if (kind === "package") return `пакет ${formatDayMonthRu(from)}–${formatDayMonthRu(to)}`;
  return isCalendarMonthPeriod(from, to) ? monthWord(monthKey(from)) : `${formatDayMonthRu(from)}–${formatDayMonthRu(to)}`;
}

/** «август закрыт» for a month, «период закрыт» / «пакет закрыт» otherwise. */
function closedWords(name: string, kind: "period" | "package" | undefined, line: Pick<Allocation, "period_from" | "period_to">): string {
  if (kind === "package") return "пакет закрыт";
  return isCalendarMonthPeriod(line.period_from, line.period_to) ? `${name} закрыт` : "период закрыт";
}

export interface StatementEntry {
  kind: "row";
  seq: number;
  type: StatementRowType;
  date: string;
  title: string;
  /** A quiet second line (the price of a charge, a note, a reason). */
  sub: string | null;
  /** «прощено» / «возврат» / «перенос» next to the amount. */
  tag: string | null;
  charged: number | null;
  /** Money in the «Оплачено» column; negative for a refund or a transfer out. */
  paid: number | null;
  /** What is open on the row itself, by name, in the server's words (PAY-DUE 10.11): none = the cell is empty. */
  open: OpenPart[];
  /** «за август — 69 000 (август закрыт)» lines of a payment. */
  allocations: string[];
  /** «исправлена: было 450 000» / «исправление оплаты № 17». */
  replaced: string | null;
  cancelled: boolean;
  cancelNote: string | null;
  raw: StatementRow;
}

export interface StatementMonthItem {
  kind: "month";
  key: string;
  /** «Октябрь 2026»: the header row says only the month, the columns carry the figures. */
  title: string;
  /** A single month without a record: a quiet «записей нет» is drawn under it. */
  empty: boolean;
}

export type StatementItem = StatementMonthItem | StatementEntry;

// ── Statement: how a row is drawn (icon, amounts, balance chip, alignment) ───────────────────────────────

/** What a row is, for its small icon: a charge, a payment, a forgiven debt, a refund, a transfer, a corrected / cancelled payment… */
export type StatementIconKind = "charge" | "payment" | "writeoff" | "refund" | "transfer" | "correction" | "void" | "opening" | "pause";

export function statementIconKind(entry: Pick<StatementEntry, "type" | "cancelled" | "replaced">): StatementIconKind {
  if (entry.cancelled) return "void";
  switch (entry.type) {
    case "charge": return "charge";
    case "payment": return entry.replaced ? "correction" : "payment";
    case "writeoff":
    case "recalc": return "writeoff";
    case "refund": return "refund";
    case "transfer_in":
    case "transfer_out": return "transfer";
    case "pause": return "pause";
    default: return "opening";
  }
}

/** The round tint behind the icon: a charge is slate, money in is emerald, the rest has its own quiet colour. */
export const STATEMENT_ICON_TONE: Record<StatementIconKind, string> = {
  charge: "bg-slate-100 text-slate-500",
  payment: "bg-emerald-50 text-emerald-600",
  correction: "bg-emerald-50 text-emerald-600",
  writeoff: "bg-sky-50 text-sky-600",
  refund: "bg-amber-50 text-amber-600",
  transfer: "bg-indigo-50 text-indigo-600",
  void: "bg-slate-100 text-slate-400",
  opening: "bg-slate-100 text-slate-500",
  pause: "bg-slate-100 text-slate-500",
};

/** The «Стоимость» cell: «600 000», empty when the row has no charge. */
export function statementChargedText(entry: Pick<StatementEntry, "charged">): string {
  return entry.charged === null ? "" : digitsOf(entry.charged);
}

/** The «Оплачено» cell: money in is «+600 000» (a write-off and a transfer in too), money out «−500 000» (a true minus), nothing is empty. */
export function statementPaidText(entry: Pick<StatementEntry, "paid">): string {
  if (entry.paid === null) return "";
  if (entry.paid > 0) return `+${digitsOf(entry.paid)}`;
  if (entry.paid < 0) return `${MINUS}${digitsOf(-entry.paid)}`;
  return "0";
}

/** The amounts are plain slate-800: the colour is only for the balance chip (a green payment next to a green advance read as one thing). */
export const STATEMENT_AMOUNT_CLASS = "text-sm tabular-nums text-slate-800";
export const STATEMENT_PAID_CLASS = "text-sm font-medium tabular-nums text-slate-800";

/** Alignment of the columns on a desktop (owner 05.11, design system wave 3: text and the date LEFT, money RIGHT over its digits - the digits of «400 000» and «+400 000» and «Долг 1 200 000» line up). */
export const STATEMENT_ALIGN = {
  date: "text-left",
  operation: "text-left",
  money: "text-right tabular-nums",
} as const;

// ── Statement: which month it opens on ──────────────────────────────────────────────────────────────

/**
 * What the address / the user chose: `null` = nothing yet (the page opens on its own choice), `"all"` = every month,
 * `"YYYY-MM"` = that month.
 */
export type StatementMonthChoice = string | null;

/** `?month=2026-10` → that month, `?month=all` → every month, anything else (a missing or broken value) → no choice yet. */
export function parseStatementMonth(raw: string | null | undefined): StatementMonthChoice {
  const value = (raw ?? "").trim();
  if (value === "all") return "all";
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

/** The value for the address of a choice: `all` or `YYYY-MM`; no choice → no parameter. */
export function statementMonthParam(choice: StatementMonthChoice): string | null {
  return choice;
}

/**
 * The month the statement opens on: the current month of the centre (Tashkent business date) when it has rows, else the latest
 * month that has rows (a student who left earlier, a future enrolment); a statement without rows opens on the current month.
 */
export function defaultStatementMonth(statement: Pick<StatementOut, "rows">, currentMonth: string): string {
  const keys = statement.rows.filter((row) => !row.voided_at).map((row) => monthKey(row.date));
  if (keys.length === 0 || keys.includes(currentMonth)) return currentMonth;
  return keys.reduce((latest, key) => (key > latest ? key : latest));
}

/** The month on screen: `null` = every month. */
export function resolveStatementMonth(choice: StatementMonthChoice, statement: Pick<StatementOut, "rows">, currentMonth: string): string | null {
  if (choice === "all") return null;
  return choice ?? defaultStatementMonth(statement, currentMonth);
}

/** «Октябрь 2026» for the file and the switcher; «Все месяцы» for no month. */
export function statementMonthLabel(month: string | null): string {
  return month ? monthTitle(month) : "Все месяцы";
}

/** The months that hold rows, from the first to the month of the statement date (the arrows of the switcher stop there). */
export function statementMonths(statement: Pick<StatementOut, "rows" | "as_of">): string[] {
  const first = statement.rows.length > 0 ? monthKey(statement.rows[0].date) : monthKey(statement.as_of);
  const lastRow = statement.rows.length > 0 ? monthKey(statement.rows[statement.rows.length - 1].date) : first;
  const last = lastRow > monthKey(statement.as_of) ? lastRow : monthKey(statement.as_of);
  const out: string[] = [];
  for (let key = first; key <= last && out.length < 240; key = shiftMonthKey(key, 1)) out.push(key);
  return out;
}

/** The method inside a sentence: generic words in lower case («наличные», «карта»), brand names keep their capitals («Click», «Payme»). */
function lowerMethod(method: PayMethod | null | undefined): string {
  const label = methodLabel(method);
  return method === "click" || method === "payme" ? label : label.toLowerCase();
}

/**
 * The statement as a list of drawn items: a light row per month with its totals, the rows of the month (charges in words,
 * payments with where each went, write-offs, refunds, transfers) and, for one month, the balance carried in.
 * `month` null = every month.  The balance after every row is the server's; nothing is recomputed except the
 * «осталось» of a period after a payment, from the charges and the earlier allocations of the same statement.
 */
export function buildStatementItems(statement: StatementOut, month: string | null): StatementItem[] {
  const segments = new Map<string, Segment>();
  for (const row of statement.rows) if (row.details.segment) segments.set(row.details.segment.id, row.details.segment);
  for (const segment of statement.upcoming) segments.set(segment.id, segment);
  const allocated = new Map<string, number>();
  let writeoffSeen = false;
  const entries: StatementEntry[] = [];

  for (const row of statement.rows) {
    const d = row.details;
    const base = { kind: "row" as const, seq: row.seq, type: row.type, date: row.date, open: openParts(row), allocations: [] as string[], replaced: null as string | null, cancelled: Boolean(row.voided_at), cancelNote: null as string | null, raw: row };
    if (row.type === "charge") {
      const words = d.segment ? chargeWords(d.segment) : { title: row.title, sub: "" };
      entries.push({ ...base, title: words.title, sub: words.sub || null, tag: null, charged: sum(row.debit), paid: null });
    } else if (row.type === "payment") {
      const head = [`Оплата${d.receipt_no ? ` № ${d.receipt_no}` : ""}`, lowerMethod(d.method), d.created_by_name ? `внёс ${d.created_by_name}` : ""].filter(Boolean).join(" · ");
      const lines: string[] = [];
      for (const line of list<Allocation>(d.allocations)) {
        if (sum(line.amount) <= 0) continue;
        const segment = segments.get(line.segment_id);
        if (line.bucket === "advance" || line.segment_id === "advance") {
          lines.push(line.segment_id === "advance" ? `аванс на следующие уроки — ${digitsOf(line.amount)}` : `аванс на ${periodName(line.period_from, line.period_to, segment?.kind)} — ${digitsOf(line.amount)}`);
          continue;
        }
        const name = periodName(line.period_from, line.period_to, segment?.kind);
        const total = allocated.get(line.segment_id) ?? 0;
        allocated.set(line.segment_id, total + sum(line.amount));
        let outcome = "";
        const exact = nullableSum(line.segment_remaining_after);
        if (exact !== null) {
          // The server's exact remainder of this period right after this piece of money.
          outcome = line.closes || exact === 0 ? ` (${closedWords(name, segment?.kind, line)})` : ` (осталось ${digitsOf(exact)})`;
        } else if (segment) {
          // A statement made before the addendum: the remainder is recomputed from the charge and the earlier pieces.
          const off = writeoffSeen ? sum(segment.written_off) : 0;
          const remaining = Math.max(0, sum(segment.charge) - total - sum(line.amount) - off);
          outcome = line.closes || remaining === 0 ? ` (${closedWords(name, segment.kind, line)})` : ` (осталось ${digitsOf(remaining)})`;
        } else if (line.closes) {
          outcome = ` (${closedWords(name, undefined, line)})`;
        }
        lines.push(`за ${name} — ${digitsOf(line.amount)}${outcome}`);
      }
      const replaced = d.replaces_amount ? `исправлена: было ${digitsOf(d.replaces_amount)}` : d.replaces_receipt_no ? `исправление оплаты № ${d.replaces_receipt_no}` : null;
      entries.push({ ...base, title: head, sub: d.note ? `комментарий: ${d.note}` : null, tag: null, charged: null, paid: sum(row.credit), allocations: lines, replaced });
    } else if (row.type === "writeoff") {
      writeoffSeen = true;
      const title = `Долг прощён${d.reason ? ` — причина: ${d.reason}` : ""}${d.created_by_name ? ` · ${d.created_by_name}` : ""}`;
      entries.push({ ...base, title, sub: null, tag: "прощено", charged: null, paid: sum(row.credit) });
    } else if (row.type === "recalc") {
      // PAY-F: the lesson the centre cancelled, taken off the money like a forgiven debt (the line is derived by the server, nothing was entered)
      entries.push({ ...base, title: row.title, sub: d.recalc ? recalcAmountText(d.recalc) : null, tag: "перерасчёт", charged: null, paid: sum(row.credit) });
    } else if (row.type === "refund") {
      const title = `Возврат аванса — ${lowerMethod(d.method)}${d.created_by_name ? ` · ${d.created_by_name}` : ""}`;
      entries.push({ ...base, title, sub: d.reason ? `причина: ${d.reason}` : null, tag: "возврат", charged: null, paid: -sum(row.outflow) });
    } else if (row.type === "transfer_in") {
      entries.push({ ...base, title: row.title, sub: null, tag: "перенос", charged: null, paid: sum(row.credit) });
    } else if (row.type === "transfer_out") {
      entries.push({ ...base, title: row.title, sub: null, tag: "перенос", charged: null, paid: -sum(row.outflow) });
    } else if (row.type === "opening_debt") {
      // The debt «на начало учёта»: a charge in the «Стоимость» column that is paid first.
      entries.push({ ...base, title: row.title || "Долг на начало учёта", sub: "до запуска в ALGO", tag: null, charged: sum(row.debit), paid: null });
    } else {
      // «Остаток на начало: оплачено до 31.10 (до ALGO)» and a pause: facts without money.
      entries.push({ ...base, title: row.title || STATEMENT_TYPE_LABEL[row.type], sub: null, tag: null, charged: null, paid: null });
    }
  }

  const items: StatementItem[] = [];
  const keys = month ? [month] : [...new Set(entries.map((entry) => monthKey(entry.date)))];
  for (const key of keys) {
    const inMonth = entries.filter((entry) => monthKey(entry.date) === key);
    items.push({ kind: "month", key, title: monthTitle(key), empty: Boolean(month) && inMonth.length === 0 });
    items.push(...inMonth);
  }
  return items;
}
