/**
 * PAY-2 ledger rules of the front: how a balance (debt / advance) is worded, the form of the payment dialog and its live
 * preview, write-off and refund forms, the account statement of a student, and the tolerant reading of the server's answers.
 *
 * The sentences that describe a calculation (`summary_text`, the label of an allocation, `balance_text`, `days_text`)
 * are written by the server and shown as they come; this file only arranges them.  Pure: no React, no network.
 */
import {
  formatDateRu,
  formatMoney,
  isIsoDate,
  MAX_MONEY,
  NOTE_MAX,
  parseMoneyInput,
  PAYMENT_MAX_AGE_YEARS,
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
  type StatementRow,
  type StatementRowType,
  type StatementSummary,
  type WriteoffCreate,
} from "./payments";

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

export type AllocationTone = "debt" | "current" | "advance";

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

/** «Закрыла долг 15.09–14.10 · 269 000 сум» */
export function allocationText(item: Pick<Allocation, "label" | "amount">): string {
  return `${item.label} · ${formatMoney(item.amount)}`;
}

/** Where the money of a saved payment went, for a toast: one line per period and the balance left. */
/** «Баланс после оплаты: долг 469 000 сум» / «аванс 300 000 сум» / «0» (owner's vocabulary: one word for what is left). */
export function balanceAfterText(debtAfter: number | null | undefined, advanceAfter: number | null | undefined, lead = "Баланс после оплаты"): string {
  const debt = sum(debtAfter);
  const advance = sum(advanceAfter);
  if (debt > 0) return `${lead}: долг ${formatMoney(debt)}`;
  if (advance > 0) return `${lead}: аванс ${formatMoney(advance)}`;
  return `${lead}: 0`;
}

export function savedPaymentDetails(allocation: AllocationSummary | null | undefined): string[] {
  if (!allocation) return [];
  const lines = allocationLines(allocation.items).map(allocationText);
  lines.push(balanceAfterText(allocation.debt_after, allocation.advance_after));
  return lines;
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

export function validatePaymentForm(values: PaymentFormValues, today: string): string | null {
  const amountProblem = validateAmount(values.amount);
  if (amountProblem) return amountProblem;
  if (!isIsoDate(values.paidOn)) return "Укажите дату оплаты";
  if (values.paidOn > today) return "Дата оплаты не может быть в будущем";
  if (values.paidOn < subtractYears(today, PAYMENT_MAX_AGE_YEARS)) return "Дата оплаты старше 3 лет";
  if (!values.method) return "Выберите способ оплаты";
  if (values.note.trim().length > NOTE_MAX) return `Комментарий не длиннее ${NOTE_MAX} символов`;
  if (values.reason.trim().length > REASON_MAX) return `Причина не длиннее ${REASON_MAX} символов`;
  return null;
}

/** Request body of a payment: money, date, method, note.  Call only after `validatePaymentForm` returned null. */
export function buildPaymentPayload(values: PaymentFormValues): PaymentCreate {
  const payload: PaymentCreate = {
    amount: parseMoneyInput(values.amount) ?? 0,
    paid_on: values.paidOn,
    method: values.method ?? "other",
  };
  const note = values.note.trim();
  if (note) payload.note = note;
  return payload;
}

/** A correction starts from the payment being replaced. */
export function paymentFormFrom(payment: { amount: number; paid_on: string; method?: PayMethod; note: string | null }): PaymentFormValues {
  return {
    amount: String(sum(payment.amount)).replace(/\B(?=(\d{3})+(?!\d))/g, " "),
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

export interface DueRow {
  key: "debt" | "current" | "advance";
  label: string;
  /** What the amount is made of: «15.09–14.10, оплачено 231 000 из 500 000». */
  note: string | null;
  amount: number;
}

export interface DueView {
  /** Debt of past periods + the running period: what the student owes today. */
  total: number;
  pastDebt: number;
  currentDue: number;
  advance: number;
  rows: DueRow[];
  totalLabel: string;
  /** One line for assistive text / tests: «Долг 269 000 сум (15.09–14.10, оплачено 231 000 из 500 000 сум) · Текущий период 15.10–14.11: 500 000 сум · Всего к оплате 769 000 сум». */
  text: string;
}

/** «231 000» - the amount without the unit, for «оплачено 231 000 из 500 000». */
function digits(value: number): string {
  return formatMoney(value).replace(/\u00A0сум$/, "");
}

function dm(iso: string): string {
  return formatDateRu(iso).slice(0, 5);
}

function periodText(from: string, to: string): string {
  return `${dm(from)}–${dm(to)}`;
}

function segmentName(segment: Segment): string {
  return segment.kind === "package" ? `пакет ${periodText(segment.period_from, segment.period_to)}` : periodText(segment.period_from, segment.period_to);
}

/**
 * Splits the segments of `due` into the periods of the debt and the running one by the server's `bucket`.  An older
 * answer without it falls back to the dates: the running period is the begun one that holds `as_of`.
 */
export function splitDueSegments(preview: Pick<PaymentPreview, "as_of" | "due">): { past: Segment[]; running: Segment | null } {
  const open = list<Segment>(preview.due?.segments).filter((segment) => sum(segment.unpaid) > 0);
  if (open.some((segment) => segment.bucket)) {
    return { past: open.filter((segment) => segment.bucket === "past_debt"), running: open.find((segment) => segment.bucket === "current") ?? null };
  }
  if (sum(preview.due?.current_due) <= 0) return { past: open, running: null };
  const running = [...open].reverse().find((segment) => segment.period_from <= preview.as_of && preview.as_of <= segment.period_to) ?? null;
  return { past: open.filter((segment) => segment !== running), running };
}

/** The block above the amount: «Долг … · Текущий период … · Всего к оплате …». */
export function dueView(preview: Pick<PaymentPreview, "as_of" | "due"> | null | undefined): DueView | null {
  if (!preview?.due) return null;
  const due = preview.due;
  const pastDebt = sum(due.past_debt);
  const currentDue = sum(due.current_due);
  const advance = sum(due.advance);
  const { past, running } = splitDueSegments(preview);
  const rows: DueRow[] = [];
  if (pastDebt > 0) {
    let note: string | null = null;
    if (past.length === 1) {
      const only = past[0];
      note = `${segmentName(only)}${sum(only.paid) > 0 ? `, оплачено ${digits(only.paid)} из ${digits(only.charge)}` : ""}`;
    } else if (past.length > 1) {
      note = `${segmentName(past[0])} … ${segmentName(past[past.length - 1])}, ${past.length} ${past.length < 5 ? "периода" : "периодов"}`;
    }
    rows.push({ key: "debt", label: "Долг", note, amount: pastDebt });
  }
  if (currentDue > 0) {
    rows.push({ key: "current", label: "Текущий период", note: running ? segmentName(running) : null, amount: currentDue });
  }
  if (advance > 0 && pastDebt + currentDue === 0) rows.push({ key: "advance", label: "Аванс", note: null, amount: advance });
  const total = sum(due.debt);
  const totalLabel = `Всего к оплате ${formatMoney(total)}`;
  const parts = rows
    .filter((row) => row.key !== "advance")
    .map((row) => (row.key === "debt"
      ? `Долг ${formatMoney(row.amount)}${row.note ? ` (${row.note})` : ""}`
      : `Текущий период${row.note ? ` ${row.note}` : ""}: ${formatMoney(row.amount)}`));
  return { total, pastDebt, currentDue, advance, rows, totalLabel, text: [...parts, totalLabel].join(" · ") };
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
  /** The balance after the payment: «Баланс после оплаты: долг 469 000 сум» / «аванс 300 000 сум» / «0». */
  remaining: { kind: BalanceKind; text: string };
  /** The D8 price-rise sentences. */
  priceAhead: string[];
  warnings: string[];
}

export function previewView(preview: PaymentPreview | null | undefined): PreviewView | null {
  const result: PreviewResult | null | undefined = preview?.result;
  if (!preview || !result) return null;
  const debtAfter = sum(result.debt_after);
  const advanceAfter = sum(result.advance_after);
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
    remaining: {
      kind: debtAfter > 0 ? "debt" : advanceAfter > 0 ? "advance" : "none",
      text: balanceAfterText(debtAfter, advanceAfter),
    },
    priceAhead: ahead,
    warnings: preview.warnings.filter((warning) => warning.code !== "price_change_ahead").map((warning) => warning.message),
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
      debt: sum(due.debt),
      past_debt: sum(due.past_debt),
      current_due: sum(due.current_due),
      advance: sum(due.advance),
      segments: list<Segment>(due.segments),
      paid_until: due.paid_until ?? null,
      days_overdue: nullableSum(due.days_overdue),
    },
    suggested_amount: sum(data.suggested_amount),
    amount: nullableSum(data.amount),
    result: result
      ? {
          allocations: list<Allocation>(result.allocations),
          debt_after: sum(result.debt_after),
          past_debt_after: sum(result.past_debt_after),
          current_due_after: sum(result.current_due_after),
          advance_after: sum(result.advance_after),
          paid_until_before: result.paid_until_before ?? null,
          paid_until_after: result.paid_until_after ?? null,
          status_after: result.status_after ?? "none",
          days_overdue_after: nullableSum(result.days_overdue_after),
          partial_credit_after: sum(result.partial_credit_after),
          lessons: result.lessons ?? null,
          price_ahead: list(result.price_ahead),
          summary_text: String(result.summary_text ?? ""),
        }
      : null,
    warnings: list<PaymentWarning>(data.warnings),
  };
}

/** A row with the PAY-2 numbers present (an older server sends none of them). */
export function normalizeRow(row: MembershipPaymentRow): MembershipPaymentRow {
  if (!row) return row;
  return {
    ...row,
    debt: sum(row.debt),
    past_debt: sum(row.past_debt),
    current_due: sum(row.current_due),
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
  | "other";

export interface PayError {
  kind: PayErrorKind;
  /** The server's own Russian text. */
  message: string;
  paymentId: string | null;
  debt: number | null;
  refundable: number | null;
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
  };
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

export function buildWriteoffPayload(values: WriteoffFormValues, today?: string): WriteoffCreate {
  const body: WriteoffCreate = { reason: values.reason.trim() };
  if (values.all) body.all = true;
  else body.amount = parseMoneyInput(values.amount) ?? 0;
  if (today) body.effective_on = today;
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
  if (!values.method) return "Выберите, как вернули деньги";
  if (values.reason.trim().length > REASON_MAX) return `Причина не длиннее ${REASON_MAX} символов`;
  return null;
}

export function buildRefundPayload(values: RefundFormValues, today?: string): RefundCreate {
  const body: RefundCreate = { amount: parseMoneyInput(values.amount) ?? 0, method: values.method ?? "other" };
  const reason = values.reason.trim();
  if (reason) body.reason = reason;
  if (today) body.effective_on = today;
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
  transfer_in: "Перенос из группы",
  transfer_out: "Перенос в группу",
  opening_debt: "Долг на начало учёта",
  opening_paid_until: "Оплачено до начала учёта",
  pause: "Пауза",
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
    default:
      break;
  }
  return notes;
}

export interface StatementTotal {
  key: "charged" | "paid" | "written_off" | "refunded" | "transferred_in" | "transferred_out" | "balance";
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
  refunded: "Возвращено — аванс, возвращённый ученику (кнопка «Вернуть аванс»)",
  transferred_in: "Деньги, которые пришли вместе с учеником из другой группы",
  transferred_out: "Деньги, которые ушли вместе с учеником в другую группу",
  reconciles: "Счёт сходится: стоимость − оплачено − прощено + возвращено = долг − аванс",
} as const;

/**
 * The tiles above the statement: Стоимость обучения · Оплачено · Баланс; «Прощено» and «Возвращено» (and the transfers) only
 * when there is something, each with a hint saying what it is.
 */
export function statementTotals(summary: StatementSummary | null | undefined): StatementTotal[] {
  if (!summary) return [];
  const money = (key: StatementTotal["key"], label: string, value: number, hint?: string): StatementTotal => ({ key, label, amount: sum(value), text: formatMoney(value), tone: "plain", hint });
  const out: StatementTotal[] = [money("charged", "Стоимость обучения", summary.charged), money("paid", "Оплачено", summary.paid)];
  if (sum(summary.transferred_in) > 0) out.push(money("transferred_in", "Перенесено из групп", summary.transferred_in, STATEMENT_HINTS.transferred_in));
  if (sum(summary.written_off) > 0) out.push(money("written_off", "Прощено", summary.written_off, STATEMENT_HINTS.written_off));
  if (sum(summary.refunded) > 0) out.push(money("refunded", "Возвращено", summary.refunded, STATEMENT_HINTS.refunded));
  if (sum(summary.transferred_out) > 0) out.push(money("transferred_out", "Перенесено в группы", summary.transferred_out, STATEMENT_HINTS.transferred_out));
  const left = sum(summary.advance) - sum(summary.debt);
  const cell = balanceCell(left);
  out.push({ key: "balance", label: "Баланс", amount: Math.abs(left), text: cell.text, tone: cell.kind });
  return out;
}

/** The identity of the statement: стоимость − оплачено − перенесено − прощено + возвращено + перенесено в другие = долг − аванс. */
export function statementDiff(summary: StatementSummary): number {
  const left = sum(summary.charged) - sum(summary.paid) - sum(summary.transferred_in) - sum(summary.written_off) + sum(summary.refunded) + sum(summary.transferred_out);
  return left - (sum(summary.debt) - sum(summary.advance));
}

/** «сходится» only when the server and this check agree. */
export function statementReconciles(summary: StatementSummary | null | undefined): boolean {
  return Boolean(summary) && summary!.reconciles !== false && statementDiff(summary!) === 0;
}

/** The balance after the last row must be the balance of the header (advance − debt). */
export function statementEndsAtBalance(statement: Pick<StatementOut, "rows" | "summary">): boolean {
  const rows = statement.rows.filter((row) => row.balance_after !== null);
  if (rows.length === 0) return true;
  return sum(rows[rows.length - 1].balance_after) === sum(statement.summary.advance) - sum(statement.summary.debt);
}

/** Every `balance_after` equals the previous one plus the effect of the row (rows are in time order). */
export function statementRunningConsistent(rows: StatementRow[]): boolean {
  let running: number | null = null;
  for (const row of rows) {
    if (row.balance_after === null) continue;
    if (running !== null && sum(row.balance_after) !== running + effectOf(row)) return false;
    running = sum(row.balance_after);
  }
  return true;
}

export function normalizeStatement(raw: StatementOut): StatementOut {
  const summary = (raw?.summary ?? {}) as Partial<StatementSummary>;
  const row = (item: StatementRow): StatementRow => ({
    ...item,
    debit: sum(item.debit),
    credit: sum(item.credit),
    outflow: sum(item.outflow),
    balance_after: nullableSum(item.balance_after),
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
      replaces_receipt_no: item.details?.replaces_receipt_no ?? null,
      replaces_amount: item.details?.replaces_amount ?? null,
      replaced_by_receipt_no: item.details?.replaced_by_receipt_no ?? null,
    },
  });
  return {
    ...raw,
    summary: {
      charged: sum(summary.charged),
      paid: sum(summary.paid),
      transferred_in: sum(summary.transferred_in),
      written_off: sum(summary.written_off),
      refunded: sum(summary.refunded),
      transferred_out: sum(summary.transferred_out),
      debt: sum(summary.debt),
      advance: sum(summary.advance),
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

// ── Idempotency ────────────────────────────────────────────────────────────

/** One key per opening of a payment form: a repeated send of the same payment is recognised by the server (409 `DUPLICATE_PAYMENT`). */
export function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // fall through to the weaker key below
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

// ── Receipt: what the money covered at the moment of payment ───────────────

export interface ReceiptFacts {
  /** A receipt of the old model: it shows the period, not the distribution. */
  legacy: boolean;
  method: string | null;
  lines: AllocationLine[];
  /** «Долг до оплаты: 769 000 сум». */
  debtBefore: string | null;
  /** «Баланс после оплаты: долг 469 000 сум» / «аванс 21 000 сум» / «0». */
  after: string | null;
  /** «Оплачено до: 15.10.2026 (было 27.09.2026)». */
  paidUntil: string | null;
  /** «Цена периода: 500 000 сум». */
  price: string | null;
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
  if (legacy) return { legacy: true, method: null, lines: [], debtBefore: null, after: null, paidUntil: null, price: null };
  const debtAfter = nullableSum(receipt.debt_after);
  const advanceAfter = nullableSum(receipt.advance_after);
  const before = receipt.paid_until_before ?? null;
  const after = receipt.paid_until_after ?? null;
  const debtBefore = nullableSum(receipt.debt_before);
  const snapshotPrice = receipt.price_snapshot?.amount;
  return {
    legacy: false,
    method: receipt.method ? methodLabel(receipt.method) : null,
    lines: allocationLines(receipt.allocations),
    debtBefore: debtBefore !== null && debtBefore > 0 ? `Долг до оплаты: ${formatMoney(debtBefore)}` : null,
    after: debtAfter === null && advanceAfter === null ? null : balanceAfterText(debtAfter, advanceAfter),
    paidUntil: after ? `Оплачено до: ${formatDateRu(after)}${before && before !== after ? ` (было ${formatDateRu(before)})` : ""}` : null,
    price: snapshotPrice !== null && snapshotPrice !== undefined ? `Цена периода: ${formatMoney(snapshotPrice)}` : null,
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
  const balance = row.balance_after;
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

/** «· ученик в архиве» / «· ушёл из группы» in the list of balances: a debt or an advance of a student who is gone stays visible, marked. */
export function balanceRowNote(row: { is_active?: boolean; student_archived?: boolean }): string {
  if (row.student_archived) return " · ученик в архиве";
  if (row.is_active === false) return " · ушёл из группы";
  return "";
}

// ── Statement as a bank statement: Дата | Операция | Стоимость | Оплачено | Баланс ─────────────

const MONTH_NAMES = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

/** `YYYY-MM` of a date. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** «Сентябрь 2026» */
export function monthTitle(key: string): string {
  const month = Number(key.slice(5, 7));
  const name = MONTH_NAMES[month - 1] ?? key;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${key.slice(0, 4)}`;
}

/** «сентябрь» (a month inside a sentence). */
export function monthWord(key: string): string {
  return MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? key;
}

function lastDayOf(key: string): string {
  const day = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
  return `${key}-${String(day).padStart(2, "0")}`;
}

/** The first / last day of a month key, for the filter of the server's export. */
export function monthRange(key: string): { from: string; to: string } {
  return { from: `${key}-01`, to: lastDayOf(key) };
}

export function shiftMonthKey(key: string, delta: number): string {
  const total = Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1) + delta;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
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
      : `цена ${digitsOf(price)} сум ${unit} · ${priceSourceText(segment.price?.source)}`;
  const part = segment.days_text
    ? partWords(segment.days_text)
    : segment.kind === "package" && segment.lessons ? `${segment.lessons.in_part} из ${segment.lessons.in_period} ${segment.lessons.in_period % 10 === 1 && segment.lessons.in_period % 100 !== 11 ? "урок" : "уроков"}` : "";
  if (segment.kind === "package") {
    return { title: `Пакет уроков ${dm(segment.period_from)}–${dm(segment.period_to)}${part ? ` (${part})` : ""}`, sub };
  }
  if (isCalendarMonthPeriod(segment.period_from, segment.period_to)) {
    const key = monthKey(segment.period_from);
    const partial = Boolean(segment.days_text) || segment.basis === "lessons" || segment.basis === "days";
    const words = part || `с ${dm(segment.period_from)}`;
    return { title: partial ? `${monthTitle(key)} — неполный месяц (${words})` : monthTitle(key), sub };
  }
  return { title: `Период ${dm(segment.period_from)}–${dm(segment.period_to)}${part ? ` (${part})` : ""}`, sub };
}

/** «август» / «15.09–14.10» / «пакет 25.09–21.10»: how a period is named inside «за …». */
function periodName(from: string, to: string, kind?: "period" | "package"): string {
  if (kind === "package") return `пакет ${dm(from)}–${dm(to)}`;
  return isCalendarMonthPeriod(from, to) ? monthWord(monthKey(from)) : `${dm(from)}–${dm(to)}`;
}

/** «август закрыт» for a month, «период закрыт» / «пакет закрыт» otherwise. */
function closedWords(name: string, kind: "period" | "package" | undefined, line: Pick<Allocation, "period_from" | "period_to">): string {
  if (kind === "package") return "пакет закрыт";
  return isCalendarMonthPeriod(line.period_from, line.period_to) ? `${name} закрыт` : "период закрыт";
}

/** The balance cell: «Долг 68 000» / «Аванс 21 000» / «0» (no unit: the header says сум once). */
export function balanceCell(balance: number | null | undefined): { kind: BalanceKind; text: string } {
  if (balance === null || balance === undefined) return { kind: "none", text: "" };
  const value = sum(balance);
  if (value < 0) return { kind: "debt", text: `Долг ${digitsOf(-value)}` };
  if (value > 0) return { kind: "advance", text: `Аванс ${digitsOf(value)}` };
  return { kind: "none", text: "0" };
}

const MONTH_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** «сентября» / «декабря 2025» (the year only when it is not the year of `of`): the month a balance is carried from, after «С». */
export function monthFromWords(key: string, of: string): string {
  const name = MONTH_GENITIVE[Number(key.slice(5, 7)) - 1] ?? key;
  return key.slice(0, 4) === of.slice(0, 4) ? name : `${name} ${key.slice(0, 4)}`;
}

/**
 * The quiet line over a month: «С сентября перенесён аванс 508 000» / «С сентября перенесён долг 92 000».
 * null when nothing is carried (a zero balance, the first month of the enrolment): the line is not drawn.
 */
export function carryLine(month: string, carry: { kind: BalanceKind; text: string }): { lead: string; amount: string; kind: BalanceKind; text: string } | null {
  if (carry.kind === "none") return null;
  const lead = `С ${monthFromWords(shiftMonthKey(month, -1), month)} перенесён`;
  const amount = carry.kind === "debt" ? `долг ${carry.text.replace("Долг ", "")}` : `аванс ${carry.text.replace("Аванс ", "")}`;
  return { lead, amount, kind: carry.kind, text: `${lead} ${amount}` };
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
  balance: { kind: BalanceKind; text: string };
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

export interface StatementCarryItem {
  kind: "carry";
  /** «С сентября перенесён аванс 508 000». */
  text: string;
  /** «С сентября перенесён» */
  lead: string;
  /** «аванс 508 000» (coloured) */
  amount: string;
  balance: { kind: BalanceKind; text: string };
}

export type StatementItem = StatementMonthItem | StatementCarryItem | StatementEntry;

// ── Statement: how a row is drawn (icon, amounts, balance chip, alignment) ───────────────────────────────

/** What a row is, for its small icon: a charge, a payment, a forgiven debt, a refund, a transfer, a corrected / cancelled payment… */
export type StatementIconKind = "charge" | "payment" | "writeoff" | "refund" | "transfer" | "correction" | "void" | "opening" | "pause";

export function statementIconKind(entry: Pick<StatementEntry, "type" | "cancelled" | "replaced">): StatementIconKind {
  if (entry.cancelled) return "void";
  switch (entry.type) {
    case "charge": return "charge";
    case "payment": return entry.replaced ? "correction" : "payment";
    case "writeoff": return "writeoff";
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

/** «600 000»: a whole sum without the unit (the header of the statement says сум once). */
export function statementDigits(value: number): string {
  return digitsOf(value);
}

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

/** The «Баланс» chip: the same height for every row, the tone says debt / advance / zero. */
export const BALANCE_CHIP_BASE = "inline-flex h-6 items-center justify-center whitespace-nowrap rounded-full px-2.5 text-[13px] font-medium tabular-nums";
export const BALANCE_CHIP_TONE: Record<BalanceKind, string> = {
  debt: "bg-rose-50 text-rose-700",
  advance: "bg-emerald-50 text-emerald-700",
  none: "bg-slate-100 text-slate-600",
};
export function balanceChipClass(kind: BalanceKind): string {
  return `${BALANCE_CHIP_BASE} ${BALANCE_CHIP_TONE[kind]}`;
}

/** Alignment of the columns on a desktop (owner 23.10: centre everywhere, only the operation stays left). */
export const STATEMENT_ALIGN = {
  date: "text-center",
  operation: "text-left",
  money: "text-center tabular-nums",
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

/** The balance before the first day of `month`: the balance after the last earlier row, 0 before the first row. */
export function openingBalance(rows: StatementRow[], month: string): number {
  let balance = 0;
  for (const row of rows) {
    if (monthKey(row.date) >= month) break;
    if (row.balance_after !== null) balance = sum(row.balance_after);
  }
  return balance;
}

function lowerMethod(method: PayMethod | null | undefined): string {
  return methodLabel(method).toLowerCase();
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
    const balance = balanceCell(row.balance_after);
    const base = { kind: "row" as const, seq: row.seq, type: row.type, date: row.date, balance, allocations: [] as string[], replaced: null as string | null, cancelled: Boolean(row.voided_at), cancelNote: null as string | null, raw: row };
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
    if (month) {
      // only a single month explains where its balance began; every month at once never repeats it, and a zero is not told
      const line = carryLine(key, balanceCell(openingBalance(statement.rows, key)));
      if (line) items.push({ kind: "carry", text: line.text, lead: line.lead, amount: line.amount, balance: { kind: line.kind, text: line.amount } });
    }
    items.push(...inMonth);
  }
  return items;
}
