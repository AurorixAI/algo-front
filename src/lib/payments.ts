/**
 * Pure rules of the "Оплаты" screens: types of the API contract (PAY-2: payments are money, the server
 * works out the coverage, the debt and the advance), money and date formatting, status wording, limits, settings.
 * No React and no network here, so node:test can load this file directly.
 * Calendar days are computed in UTC from the ISO string, so they never drift with the
 * viewer's timezone; "today" comes from the caller (the Tashkent business date).
 * The ledger helpers (balance wording, preview, statement) live in `payments-ledger.ts`, the receipts
 * report in `payments-income.ts`; the Russian sentences of a calculation come from the server.
 */
export { formatDateRu } from "./attendance-excuses";
import { formatDateRu } from "./attendance-excuses";
import { CHIP_TONE_CLASS } from "./chip-tone";
import { daysLabel, leftPhrase, lessonsWord, pluralRu } from "./plural";
import type { PriceInfo } from "./group-price";

// ── API contract (pay2_contract.json) ──────────────────────────────────────

export type PeriodMode = "calendar" | "lessons";
/** How a calendar period starts: from the payment date, or on one day of the month for the whole center. */
export type BillingAnchor = "payment_date" | "fixed_day";
export type PaymentStatus = "none" | "free" | "expired" | "ends_today" | "expiring" | "active" | "paused";
/** The tabs of «Оплаты» by money: «Должники» (debt), «Скоро платить», «Оплачено» (owner 21.10; «Без оплат» is gone: its rows are debtors «Ещё не платил»). */
export type PaymentBucket = "debt" | "expiring" | "active" | "paused";

/** How the money was received.  `unknown` exists on old records only: the server refuses it for a new payment. */
export type PayMethod = "cash" | "card" | "bank_transfer" | "click" | "payme" | "other" | "unknown";
/** Where a part of a payment went: a past period (debt), the running one, or a future one (advance). */
export type AllocationBucket = "past_debt" | "current" | "advance";

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
  /** The day the center starts to count money (PAY-2): nothing before it is charged.  Always the effective date from the server. */
  accounting_start_date?: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export type PaymentSettingsUpdate = Partial<Omit<PaymentSettings, "updated_by" | "updated_at">>;

/** What a change of `accounting_start_date` touches (`PUT /org/settings/payments?dry_run=true`). */
export interface AccountingStartImpact {
  memberships_with_new_debt: number;
  debt_delta: number;
  /** Groups whose advance changes, by how much, and how much of it could be given back (older servers do not send them). */
  memberships_with_changed_advance?: number;
  advance_delta?: number;
  refundable_delta?: number;
}

/** `PUT /org/settings/payments`: the settings plus the impact of the requested start date (`dry_run`: nothing was saved). */
export interface PaymentSettingsChanged extends PaymentSettings {
  dry_run?: boolean;
  impact?: AccountingStartImpact | null;
  /** LOGIC-A F12: only on the dry run of a change of the billing mode: who is touched and when each switches. */
  regime_impact?: { students_affected: number; first_switch: string | null; latest_switch: string | null; defer: boolean } | null;
}

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
  /** PAY-2: the money position of the whole center today. */
  debt_total?: number;
  advance_total?: number;
  memberships_with_debt?: number;
  students_with_debt?: number;
  accounting_start_date?: string | null;
  /** LOGIC-A: memberships on a pause today (they are in no tab of the list). */
  paused?: number;
  /**
   * Owner 21.10 (the page «Оплаты»), read defensively until the server's names are frozen: the count of the «Должники» tab (the one
   * the card «Долг учеников» also shows), students who paid ahead, memberships whose group has no price.
   */
  debtors?: number;
  /** The rows of each tab (memberships): `buckets.debt` is the length of the «Должники» list. */
  buckets?: { debt: number; expiring: number; active: number; paused: number };
  /** Distinct students on a pause (the badge of «На паузе»); older answers only have `buckets.paused`. */
  students_paused?: number;
  students_with_advance?: number;
  price_missing?: number;
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

/** One line of «куда пошла оплата»: the label is the server's own sentence. */
export interface Allocation {
  segment_id: string;
  period_from: string;
  period_to: string;
  amount: number;
  /** Covered days (0 for an advance in lessons mode). */
  days: number;
  bucket: AllocationBucket;
  /** The payment closed the period completely. */
  closes: boolean;
  /** «Закрыла долг 15.09–14.10» / «На текущий период 15.10–14.11» / «Аванс на 15.11–14.12». */
  label: string;
  /** The price of that period; null for «аванс на следующие уроки». */
  price: number | null;
  /**
   * LOGIC-A addendum: what is still unpaid of THAT period right after this piece of money (after the earlier payments and
   * forgiven debts).  Null on the «аванс» line and in a receipt made before the addendum.
   */
  segment_remaining_after?: number | null;
}

/** The current, factual distribution of a payment (it changes when other money changes). */
export interface PaymentAllocation {
  items: Allocation[];
  /** Part of the payment that was given back (real refunds only). */
  refunded: number;
  /** Part of the payment that travelled to another group with the student. */
  transferred?: number;
  /** amount − refunded − transferred. */
  net: number;
}

export interface PaymentOut {
  id: string;
  membership_id: string;
  amount: number;
  currency: string;
  paid_on: string;
  /** Only on a pre-PAY-2 record (`legacy_period`); on a new one they are a courtesy copy for the old front: do not read them. */
  valid_from?: string | null;
  valid_to?: string | null;
  lessons_count?: number | null;
  /** True on a payment made before PAY-2: it still shows its period. */
  legacy_period?: boolean;
  method?: PayMethod;
  kind?: "payment" | "legacy_carry";
  /** Where the money went now (the server works it out from all the money of the group). */
  allocation?: PaymentAllocation | null;
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
  /** A pre-PAY-2 payment for a part of a center period; a fact of its time, never recalculated. */
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

/** The slice of a payment the receipt page keeps: what the money covered at the moment of payment. */
export interface SnapshotPrice {
  amount: number | null;
  source: "group" | "override" | "none";
}

/** `GET /auth/org/payments/{id}/receipt`.  A new receipt reads the snapshot; a pre-PAY-2 one still has a period. */
export interface ReceiptOut {
  receipt_no: number;
  org_name: string;
  org_city?: string | null;
  org_phone?: string | null;
  student_name: string;
  display_id?: string | null;
  group_name: string;
  amount: number;
  /** «Пятьсот тысяч сум», with a capital letter. */
  amount_words: string;
  currency: string;
  paid_on: string;
  method?: PayMethod;
  /** The distribution at the moment of payment (null on an old receipt). */
  allocations?: Allocation[] | null;
  debt_before?: number | null;
  debt_after?: number | null;
  advance_after?: number | null;
  paid_until_before?: string | null;
  paid_until_after?: string | null;
  price_snapshot?: SnapshotPrice | null;
  mode?: PeriodMode | null;
  /** Only an old (pre-PAY-2) receipt. */
  valid_from?: string | null;
  valid_to?: string | null;
  lessons_count?: number | null;
  partial_period?: boolean;
  note?: string | null;
  accepted_by_name?: string | null;
  created_at?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  replaced_by_receipt_no?: number | null;
  replaces_receipt_no?: number | null;
  /** The amount of the payment this one replaces («Исправление оплаты № 17 (было 450 000 сум)»). */
  replaces_amount?: number | null;
}

export interface MembershipPaymentRow {
  membership_id: string;
  student_id: string;
  student_name: string;
  display_id?: string | null;
  class_level?: number | null;
  group_id: string;
  group_name: string;
  teacher_id?: string | null;
  teacher_name?: string | null;
  is_primary: boolean;
  is_active: boolean;
  /**
   * #105: the effective price today - the price of the group, the individual price of the student, or none.
   * Money roles only.  An older server has no `price`; `priceOfRow` reads `monthly_fee` then.
   */
  price?: PriceInfo;
  /** The same sum as `price.amount`, kept by the server as a synonym; the front reads `price`. */
  monthly_fee?: number | null;
  status: PaymentStatus;
  period_mode?: PeriodMode | null;
  paid_until?: string | null;
  days_overdue?: number | null;
  days_left?: number | null;
  lessons_total?: number | null;
  lessons_used?: number | null;
  lessons_left?: number | null;
  last_payment?: PaymentOut | null;
  /** PAY-2 balance of the group (whole сум).  An older server does not send them: read through `rowBalance`. */
  debt?: number;
  past_debt?: number;
  current_due?: number;
  advance?: number;
  /** Money that covers a part of a day / lesson not bought completely. */
  partial_credit?: number;
  price_missing?: boolean;
  lessons_unpaid?: number;
  /** How much of the advance may be given back. */
  refundable?: number;
  writeoff_allowed?: boolean;
  /** Owner 21.10: why the row is among the debtors, in the server's words («Не доплачено за октябрь: 150 000»). */
  reason?: string | null;
  /** The tab the row is on (null: on none, e.g. a free student) and why it is a debtor. */
  bucket?: PaymentBucket | null;
  debt_reason?: "overdue" | "partial" | "never_paid" | null;
  /** LOGIC-A: the live pause that covers today («На паузе до …»); null outside a pause. */
  paused?: PausedRange | null;
  /** LOGIC-A decision 1: the live opening balance of the membership (null when there is none). */
  opening?: OpeningBrief | null;
  /** LOGIC-A F13: the individual price of this membership ends when the student leaves. */
  price_ends_on_leave?: boolean;
}

/** `from` / `to` are business days, both included. */
export interface PausedRange {
  from: string;
  to: string;
}

/** The live opening balance of a membership as the list shows it: «оплачено до» and / or «долг X на дату T». */
export interface OpeningBrief {
  id: string;
  paid_until: string | null;
  debt_amount: number | null;
  debt_on: string | null;
}

/** A warning of a saved payment or of a preview. */
export interface PaymentWarning {
  code: "price_missing" | "horizon_capped" | "large_overpay" | "student_archived" | "price_change_ahead" | "paid_over_60_days_ago" | string;
  message: string;
}

/** Body of a new payment (and of a correction): money only, the server distributes it. */
export interface PaymentCreate {
  amount: number;
  paid_on: string;
  method?: Exclude<PayMethod, "unknown">;
  note?: string;
}

/** Where the money of a saved payment went (the answer to a create / replace). */
export interface AllocationSummary {
  items: Allocation[];
  debt_before: number;
  debt_after: number;
  advance_after: number;
  paid_until_before: string | null;
  paid_until_after: string | null;
}

export interface PaymentSaveResult {
  payment: PaymentOut;
  allocation?: AllocationSummary | null;
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

// ── Preview «что закроет» (GET …/payments/preview) ─────────────────────────

export type SegmentState = "closed" | "future" | "partial" | "open" | "unpriced";

/** One charge: a period of a calendar student or a package of lessons that has held lessons. */
export interface Segment {
  id: string;
  kind: "period" | "package";
  period_from: string;
  period_to: string;
  billable_days: number;
  /** «с 16.10 (7 уроков из 13)» for an incomplete period, otherwise null. */
  days_text: string | null;
  price: Partial<PriceInfo> & { amount?: number | null };
  charge: number;
  basis: "full" | "lessons" | "days" | "zero";
  lessons: { in_part: number; in_period: number } | null;
  paid: number;
  written_off: number;
  unpaid: number;
  covered_days: number;
  covered_through: string | null;
  partial_credit: number;
  state: SegmentState;
  /** Relative to `as_of`: the period has ended / is running / has not begun (a lessons package is `past_debt` once all its lessons are held). */
  bucket?: "past_debt" | "current" | "future";
  /** LOGIC-A addendum: the unpaid part of THIS charge as of the statement date (= `unpaid`); the month header reads charge / paid / remaining. */
  remaining?: number;
}

/** What is due now, for the top block of the payment dialog. */
export interface PreviewDue {
  debt: number;
  past_debt: number;
  current_due: number;
  advance: number;
  /** Segments that have begun and are not paid up. */
  segments: Segment[];
  paid_until: string | null;
  days_overdue: number | null;
}

export interface PriceAhead {
  period_from: string;
  period_to: string;
  amount: number;
  current_amount: number | null;
}

export interface PreviewLessons {
  covered_before: number;
  covered_after: number;
  left_after: number;
  unpaid_after: number;
}

export interface PreviewResult {
  allocations: Allocation[];
  debt_after: number;
  past_debt_after: number;
  current_due_after: number;
  advance_after: number;
  /** Null in lessons mode. */
  paid_until_before: string | null;
  paid_until_after: string | null;
  status_after: PaymentStatus;
  days_overdue_after: number | null;
  partial_credit_after: number;
  lessons: PreviewLessons | null;
  price_ahead: PriceAhead[];
  /** The server's sentence: «Закроет долг 269 000 · на текущий период 31 000 → оплачено до 15.10 · останется 469 000». */
  summary_text: string;
}

export interface PaymentPreview {
  as_of: string;
  mode: PeriodMode;
  price: Partial<PriceInfo>;
  due: PreviewDue;
  suggested_amount: number;
  /** The amount the preview was asked for; null without it. */
  amount: number | null;
  /** Null when no amount was asked about. */
  result: PreviewResult | null;
  warnings: PaymentWarning[];
}

export interface PreviewQuery {
  amount?: number;
  paid_on?: string;
  /** A payment being corrected: it is left out of the calculation. */
  replace_payment_id?: string;
}

// ── Write-offs, refunds ────────────────────────────────────────────────────

export interface WriteoffOut {
  id: string;
  membership_id: string;
  amount: number;
  reason: string;
  effective_on: string;
  created_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
  voided_at: string | null;
  voided_by: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
}

export interface WriteoffCreate {
  amount?: number;
  /** Write off the whole debt instead of an amount. */
  all?: boolean;
  reason: string;
  effective_on?: string;
}

export interface WriteoffCreated {
  writeoff: WriteoffOut;
  debt_before: number;
  debt_after: number;
  row: MembershipPaymentRow;
}

export interface WriteoffVoided {
  writeoff: WriteoffOut;
  row: MembershipPaymentRow;
}

export interface RefundOut {
  id: string;
  membership_id: string;
  amount: number;
  method: PayMethod;
  reason: string | null;
  note: string | null;
  effective_on: string;
  created_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
  voided_at: string | null;
  voided_by: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
}

export interface RefundCreate {
  amount: number;
  method: Exclude<PayMethod, "unknown">;
  reason?: string;
  note?: string;
  effective_on?: string;
}

export interface RefundCreated {
  refund: RefundOut;
  advance_before: number;
  advance_after: number;
  row: MembershipPaymentRow;
}

export interface RefundVoided {
  refund: RefundOut;
  row: MembershipPaymentRow;
}

/** `{detail: {code, message, debt?, refundable?, payment_id?}}` of the PAY-2 routes (kept on `ApiError.detail`). */
export interface PayErrorDetail {
  code: string | null;
  message: string;
  debt: number | null;
  refundable: number | null;
  payment_id: string | null;
}

// ── Statement (GET …/statement) ────────────────────────────────────────────

/**
 * `opening_debt` (the debt «на начало учёта», debit) and `opening_paid_until` / `pause` (information rows, no money) are the LOGIC-A
 * ledger events; the contract does not freeze how the statement carries them, so the front reads them defensively.
 */
export type StatementRowType = "charge" | "payment" | "writeoff" | "refund" | "transfer_in" | "transfer_out" | "opening_debt" | "opening_paid_until" | "pause";

export interface StatementDetails {
  allocations: Allocation[];
  created_by_name: string | null;
  from_group_name: string | null;
  from_membership_id: string | null;
  method: PayMethod | null;
  note: string | null;
  payment_id: string | null;
  reason: string | null;
  receipt_no: number | null;
  refund_id: string | null;
  segment: Segment | null;
  to_group_name: string | null;
  to_membership_id: string | null;
  writeoff_id: string | null;
  /** A corrected payment: the receipt it replaces and what it was («исправлена: было 450 000»). */
  replaces_receipt_no?: number | null;
  replaces_amount?: number | null;
  /** On the cancelled original: the receipt of its correction. */
  replaced_by_receipt_no?: number | null;
}

export interface StatementRow {
  seq: number;
  date: string;
  type: StatementRowType;
  title: string;
  /** Charge (the student owes more). */
  debit: number;
  /** Money in / write-off (the student owes less). */
  credit: number;
  /** Money out: a refund or a transfer to another group. */
  outflow: number;
  /** Minus = debt, plus = advance.  Null on a cancelled row. */
  balance_after: number | null;
  /** «Долг 269 000» / «Аванс 21 000» / «Нет долга» — the server's words. */
  balance_text: string | null;
  details: StatementDetails;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
}

export interface StatementSummary {
  charged: number;
  paid: number;
  transferred_in: number;
  written_off: number;
  refunded: number;
  transferred_out: number;
  debt: number;
  advance: number;
  paid_until: string | null;
  status: PaymentStatus;
  /** charged − paid − written_off + refunded = debt − advance (checked by the server). */
  reconciles: boolean;
}

export interface StatementMembership {
  membership_id: string;
  student_id: string;
  student_name: string;
  display_id: string | null;
  group_id: string;
  group_name: string;
  teacher_name: string | null;
  is_active: boolean;
}

export interface StatementOut {
  membership: StatementMembership;
  as_of: string;
  mode: PeriodMode;
  accounting_start: string;
  summary: StatementSummary;
  rows: StatementRow[];
  voided: StatementRow[];
  upcoming: Segment[];
}

export interface StatementQuery {
  from?: string;
  to?: string;
  include_voided?: boolean;
}

// ── Receipts report «Поступления» ──────────────────────────────────────────

export type ReceiptsGroupBy = "day" | "month";
export type ReceiptsColumn = "received" | "to_past_debt" | "to_current" | "to_advance" | "written_off" | "refunded";

export interface ReceiptsTotals {
  received: number;
  refunded: number;
  /** Real refunds of the received money. */
  refunded_from_received: number;
  /** Received money that moved to another group with the student. */
  transferred_from_received?: number;
  net_received: number;
  to_past_debt: number;
  to_current: number;
  to_advance: number;
  written_off: number;
  payments_count: number;
}

export interface ReceiptsByMethod {
  method: PayMethod;
  amount: number;
  count: number;
}

export interface ReceiptsMoneyColumns {
  received: number;
  refunded: number;
  to_past_debt: number;
  to_current: number;
  to_advance: number;
  written_off: number;
  count: number;
}

export interface ReceiptsGroupRow extends ReceiptsMoneyColumns {
  group_id: string;
  group_name: string;
  teacher_id: string | null;
  teacher_name: string | null;
}

export interface ReceiptsTeacherRow extends ReceiptsMoneyColumns {
  teacher_id: string | null;
  teacher_name: string | null;
}

export interface ReceiptsSeriesPoint extends ReceiptsMoneyColumns {
  /** `YYYY-MM-DD` (by day) or `YYYY-MM` (by month). */
  bucket: string;
  by_method: Partial<Record<PayMethod, number>>;
}

export interface ReceiptsPosition {
  debt_total: number;
  past_debt_total: number;
  advance_total: number;
  memberships_with_debt: number;
  students_with_debt: number;
  memberships_with_advance: number;
}

export type ReconciliationCode =
  | "received_eq_allocated_plus_refunded"
  | "charged_minus_paid_eq_debt_minus_advance"
  | "transfers_net_zero";

export interface ReconciliationCheck {
  code: ReconciliationCode;
  left: number;
  right: number;
  diff: number;
}

export interface Reconciliation {
  ok: boolean;
  checks: ReconciliationCheck[];
}

export interface ReceiptsReport {
  as_of: string;
  from: string;
  to: string;
  group_by: ReceiptsGroupBy;
  totals: ReceiptsTotals;
  by_method: ReceiptsByMethod[];
  by_group: ReceiptsGroupRow[];
  by_teacher: ReceiptsTeacherRow[];
  /** Only the buckets that have money: the front fills the empty ones. */
  series: ReceiptsSeriesPoint[];
  position: ReceiptsPosition;
  reconciliation: Reconciliation;
}

export interface ReceiptsQuery {
  from: string;
  to: string;
  group_by: ReceiptsGroupBy;
  method?: string;
  group_id?: string;
  teacher_id?: string;
}

export interface ReceiptItemsQuery extends Omit<ReceiptsQuery, "group_by"> {
  column: ReceiptsColumn;
  bucket?: string;
  limit?: number;
  offset?: number;
}

export interface ReceiptItem {
  type: "payment" | "writeoff" | "refund";
  id: string;
  date: string;
  amount: number;
  /** The part of the record that lies in the clicked column. */
  column_amount: number;
  student_id: string;
  student_name: string;
  membership_id: string;
  group_name: string;
  teacher_name: string | null;
  method: PayMethod | null;
  receipt_no: number | null;
  allocations: Allocation[];
}

export interface ReceiptItems {
  items: ReceiptItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface BalanceRow {
  membership_id: string;
  student_id: string;
  student_name: string;
  display_id: string | null;
  group_id: string;
  group_name: string;
  teacher_id: string | null;
  teacher_name: string | null;
  debt: number;
  past_debt: number;
  current_due: number;
  advance: number;
  refundable: number;
  paid_until: string | null;
  status: PaymentStatus;
  is_active: boolean;
  student_archived: boolean;
}

export interface BalancesPage {
  items: BalanceRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface BalancesQuery {
  kind: "debt" | "advance";
  group_id?: string;
  teacher_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// ── Limits ─────────────────────────────────────────────────────────────────

/** Backend rule (10^10 сум, safe for JS integers): the amount of a payment is 1..MAX_MONEY. */
export const MAX_MONEY = 10_000_000_000;
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

/** The same calendar day `years` earlier (29.02 -> 28.02). */
export function subtractYears(iso: string, years: number): string {
  const parts = parseIso(iso);
  if (!parts) return iso;
  const year = parts[0] - years;
  return toIso(year, parts[1], Math.min(parts[2], daysInMonth(year, parts[1])));
}

// ── Center periods ─────────────────────────────────────────────────────────

export const BILLING_DAY_RANGE = { min: 1, max: 28 } as const;

// The one Russian plural of the project lives in `./plural`; it is re-exported here for the older imports.
export { pluralRu };

// ── Buckets (tabs) ─────────────────────────────────────────────────────────

export const PAYMENT_BUCKETS: Array<{ key: PaymentBucket; label: string }> = [
  { key: "debt", label: "Должники" },
  { key: "expiring", label: "Скоро платить" },
  { key: "active", label: "Оплачено" },
];

/** «На паузе»: a fourth tab, shown while somebody is on a pause (or while it is the open one). */
export const PAUSED_BUCKET: { key: PaymentBucket; label: string } = { key: "paused", label: "На паузе" };

/** `?bucket=` of the page; unknown or missing values (and the old `due` / `none` links) open «Должники», the most urgent tab. */
export function parseBucket(value: string | null | undefined): PaymentBucket {
  return [...PAYMENT_BUCKETS, PAUSED_BUCKET].find((bucket) => bucket.key === value)?.key ?? "debt";
}

/** The tabs on screen: the three of the owner, and «На паузе» when it has somebody or is the open one. */
export function visibleBuckets(summary: { buckets?: { paused?: number | null } | null; paused?: number | null } | null | undefined, open: PaymentBucket): Array<{ key: PaymentBucket; label: string }> {
  const paused = Number(summary?.buckets?.paused ?? summary?.paused ?? 0);
  return paused > 0 || open === "paused" ? [...PAYMENT_BUCKETS, PAUSED_BUCKET] : PAYMENT_BUCKETS;
}

/**
 * The number of the «Должники» tab AND of the card «Долг учеников»: one function, so the two can never differ.  The server's
 * `debtors`; an answer without it falls back to the students with a debt.
 */
export function debtorsCount(summary: { debtors?: number | null; students_with_debt?: number | null } | null | undefined): number | null {
  const value = summary?.debtors ?? summary?.students_with_debt;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/** The number on a tab - every tab has one; null while the summary is not known. */
export function bucketCount(
  summary: {
    buckets?: { debt?: number | null; expiring?: number | null; active?: number | null; paused?: number | null } | null;
    debtors?: number | null; students_with_debt?: number | null; students_paused?: number | null; expiring?: number | null; active?: number | null; paused?: number | null;
  } | null,
  key: PaymentBucket,
): number | null {
  // Owner 21.10: the badge counts STUDENTS (a student with a debt in two groups is one), the same number as the card «Долг учеников»;
  // the list under the tab still has a row per group membership.
  if (key === "debt") {
    const students = debtorsCount(summary);
    if (students !== null) return students;
  }
  if (key === "paused" && typeof summary?.students_paused === "number") return summary.students_paused;
  const own = summary?.buckets?.[key];
  if (typeof own === "number" && Number.isFinite(own)) return own;
  const value = key === "debt" ? null : summary?.[key as "expiring" | "active" | "paused"];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The reason line of a debtor's row: the server's (`reason`: «Просрочено на 12 дней» / «Не доплачено за октябрь: 150 000» / «Ещё не
 * платил»), else read from the row: overdue days, never paid, or the debt.
 */
export function debtReasonText(row: Pick<MembershipPaymentRow, "status" | "days_overdue" | "debt" | "last_payment" | "reason">): string {
  if (row.reason) return row.reason;
  if (row.status === "expired" && row.days_overdue) return `Просрочено на ${daysLabel(row.days_overdue)}`;
  if (!row.last_payment && (row.status === "none" || row.status === "expired")) return "Ещё не платил";
  if ((row.debt ?? 0) > 0) return `Долг ${formatMoney(row.debt)}`;
  return "";
}

/** A debtor who has never paid: his row keeps the quick entry of a first payment. */
export function isFirstPaymentRow(row: Pick<MembershipPaymentRow, "status" | "last_payment" | "is_active">): boolean {
  return row.status === "none" && !row.last_payment && row.is_active;
}

/** «У 3 учеников не задана цена» above the list (the card links to «Цены групп»). */
export function priceMissingText(count: number | null | undefined): string | null {
  const n = Math.floor(Number(count) || 0);
  return n > 0 ? `У ${n} ${pluralRu(n, "ученика", "учеников", "учеников")} не задана цена` : null;
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
  row: Pick<MembershipPaymentRow, "status" | "period_mode" | "days_overdue" | "days_left" | "lessons_total" | "lessons_left"> & Partial<Pick<MembershipPaymentRow, "paused">>,
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
    case "paused":
      // «На паузе до 20.10» (the day is the end of the live pause).
      return row.paused?.to ? `На паузе до ${formatDateRu(row.paused.to).slice(0, 5)}` : "На паузе";
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
  if (row.status === "expiring" || row.status === "ends_today" || row.status === "expired" || row.status === "active" || row.status === "paused") {
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
 * (The dialog is the same for a first, an overdue and a running payment: the amount is the only thing to decide,
 * the server distributes the money.)
 */
export const PAY_ACTION_LABEL = "Внести оплату";

/** The toast after a payment is saved: the same verb as the button and the title of the dialog. */
export const PAYMENT_SAVED_TEXT: Record<"create" | "replace", string> = {
  create: "Оплата внесена",
  replace: "Оплата исправлена",
};

/**
 * Money is due when the group has a debt, was never paid, or the paid period has ended: the button in the student's
 * card is filled; for a running payment it is outlined.
 */
export function payIsDue(row: Pick<MembershipPaymentRow, "status" | "last_payment"> & { debt?: number | null }): boolean {
  if ((row.debt ?? 0) > 0) return true;
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

/**
 * The period of a pre-PAY-2 payment: «05.10.2026 — 04.11.2026» (calendar) or «12 уроков с 05.10.2026» (by lessons).
 * A new payment has no period (the money is distributed by the server): "".
 */
export function paymentPeriodLabel(payment: Pick<PaymentOut, "valid_from" | "valid_to" | "lessons_count">): string {
  if (!payment.valid_from) return "";
  if (payment.lessons_count) {
    return `${payment.lessons_count} ${lessonsWord(payment.lessons_count)} с ${formatDateRu(payment.valid_from)}`;
  }
  return payment.valid_to ? `${formatDateRu(payment.valid_from)} — ${formatDateRu(payment.valid_to)}` : `с ${formatDateRu(payment.valid_from)}`;
}

/** The mark of a pre-PAY-2 payment for a part of a center period (history and receipt); new payments have no period. */
export const PARTIAL_PERIOD_TAG = "неполный месяц";

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

/** Reason of a cancellation: trimmed 3..500 characters. */
export function validateVoidReason(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (text.length < REASON_MIN) return `Укажите причину (не короче ${REASON_MIN} символов)`;
  if (text.length > REASON_MAX) return `Причина не длиннее ${REASON_MAX} символов`;
  return null;
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

/** «Исправление оплаты № 120 (было 450 000 сум)» on the receipt of a correction; null otherwise.  The old sum is said when the server sends it. */
export function receiptReplacesNote(receipt: Pick<ReceiptOut, "replaces_receipt_no"> & Partial<Pick<ReceiptOut, "replaces_amount">>): string | null {
  if (!receipt.replaces_receipt_no) return null;
  const was = receipt.replaces_amount ? ` (было ${formatMoney(receipt.replaces_amount)})` : "";
  return `Исправление оплаты № ${receipt.replaces_receipt_no}${was}`;
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

/** `/owner/payments` + id -> `/owner/payments/statement/<membership>`: the account of a student in a group. */
export function statementHref(paymentsBasePath: string, membershipId: string): string {
  return `${paymentsBasePath.replace(/\/+$/, "")}/statement/${encodeURIComponent(membershipId)}`;
}

/** `/owner/payments` -> `/owner/payments/income`: «Поступления» of the center. */
export function incomeHref(paymentsBasePath: string): string {
  return `${paymentsBasePath.replace(/\/+$/, "")}/income`;
}

/** `/owner/groups` -> `/owner/payments`: the payments base next to a groups base. */
export function paymentsBaseOf(groupsBasePath: string): string {
  return `${groupsBasePath.replace(/\/+$/, "").replace(/\/groups$/, "")}/payments`;
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
  "period_mode", "billing_anchor", "billing_day", "lessons_per_payment", "expiring_days", "expiring_lessons", "admin_can_manage", "accounting_start_date",
] as const;
export const ATTENDANCE_SCOPE_KEYS = ["excuse_deadline_days", "excuse_deadline_lessons"] as const;

type SettingsKey = (typeof PAYMENTS_SCOPE_KEYS)[number] | (typeof ATTENDANCE_SCOPE_KEYS)[number];

/**
 * The fields of the «Оплаты» section that the chosen card shows (and therefore may change): the model itself
 * and the admin switch always, then the day of a fixed-day center, the warning in days for a calendar one,
 * the package size and its warning for a package center.  The others are hidden and are neither validated nor sent.
 */
export function paymentsScopeKeys(model: PaymentModel): SettingsKey[] {
  const common: SettingsKey[] = ["period_mode", "billing_anchor", "admin_can_manage", "accounting_start_date"];
  if (model === "lessons") return [...common, "lessons_per_payment", "expiring_lessons"];
  if (model === "fixed_day") return [...common, "billing_day", "expiring_days"];
  return [...common, "expiring_days"];
}

/** «Изменит долг у 12 учеников: +5 400 000 сум» — what a new start of the accounting does (the dry run of the server). */
export function accountingStartImpactLines(impact: AccountingStartImpact | null | undefined): string[] {
  if (!impact) return [];
  const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "\u2212" : ""}${formatMoney(Math.abs(value))}`;
  const lines: string[] = [];
  const debtCount = Math.max(0, Math.round(impact.memberships_with_new_debt));
  const debtDelta = Math.round(impact.debt_delta);
  if (debtCount > 0 || debtDelta !== 0) lines.push(`Долг изменится у ${debtCount} ${pluralRu(debtCount, "ученика", "учеников", "учеников")}: ${signed(debtDelta)}`);
  const advanceCount = Math.max(0, Math.round(impact.memberships_with_changed_advance ?? 0));
  const advanceDelta = Math.round(impact.advance_delta ?? 0);
  if (advanceCount > 0 || advanceDelta !== 0) lines.push(`Аванс изменится у ${advanceCount} ${pluralRu(advanceCount, "ученика", "учеников", "учеников")}: ${signed(advanceDelta)}`);
  const refundable = Math.round(impact.refundable_delta ?? 0);
  if (refundable !== 0) lines.push(`Можно будет вернуть: ${signed(refundable)}`);
  return lines.length > 0 ? lines : ["Долг и аванс ни у кого не изменятся"];
}

/** The same lines as one text (a sentence for assistive technology and tests). */
export function accountingStartImpactText(impact: AccountingStartImpact | null | undefined): string {
  return accountingStartImpactLines(impact).join(" · ");
}

/** The server accepts a start of the accounting not before this day. */
export const ACCOUNTING_START_MIN = "2020-01-01";

export function validatePaymentSettings(
  settings: Pick<PaymentSettings, "lessons_per_payment" | "expiring_days" | "expiring_lessons"> &
    Partial<Pick<PaymentSettings, "excuse_deadline_days" | "excuse_deadline_lessons" | "billing_day" | "period_mode" | "billing_anchor" | "accounting_start_date">>,
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
    if (check("accounting_start_date") && settings.accounting_start_date && !isIsoDate(settings.accounting_start_date)) {
      return "Укажите дату начала учёта оплат";
    }
    if (check("accounting_start_date") && settings.accounting_start_date && isIsoDate(settings.accounting_start_date) && settings.accounting_start_date < ACCOUNTING_START_MIN) {
      return "Начало учёта оплат — не раньше 01.01.2020";
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

// ── The two cards under the header of «Оплаты» (owner 21.10) ───────────────

export interface PositionCard {
  key: "debt" | "advance";
  label: string;
  /** The big sum: «1 250 000 сум». */
  amount: string;
  /** Under it: «33 ученика с долгом» / «5 учеников оплатили вперёд»; "" while the server has not told the count. */
  sub: string;
  tone: "debt" | "advance" | "none";
}

/**
 * «Долг учеников» (big, red) with «33 ученика с долгом» and «Аванс» (big, green) with «N учеников оплатили вперёд».  The debtors count is
 * `debtorsCount`, the very number of the «Должники» tab.
 */
export function positionCards(summary: {
  debt_total?: number | null;
  advance_total?: number | null;
  debtors?: number | null;
  students_with_debt?: number | null;
  students_with_advance?: number | null;
} | null | undefined): PositionCard[] {
  const debt = Math.max(0, Math.round(Number(summary?.debt_total) || 0));
  const advance = Math.max(0, Math.round(Number(summary?.advance_total) || 0));
  const debtors = debtorsCount(summary);
  const ahead = typeof summary?.students_with_advance === "number" && summary.students_with_advance >= 0 ? Math.floor(summary.students_with_advance) : null;
  return [
    {
      key: "debt",
      label: "Долг учеников",
      amount: formatMoney(debt),
      sub: debtors === null ? "" : `${debtors} ${pluralRu(debtors, "ученик с долгом", "ученика с долгом", "учеников с долгом")}`,
      tone: debt > 0 ? "debt" : "none",
    },
    {
      key: "advance",
      label: "Аванс",
      amount: formatMoney(advance),
      sub: ahead === null ? "" : `${ahead} ${pluralRu(ahead, "ученик оплатил вперёд", "ученика оплатили вперёд", "учеников оплатили вперёд")}`,
      tone: advance > 0 ? "advance" : "none",
    },
  ];
}
