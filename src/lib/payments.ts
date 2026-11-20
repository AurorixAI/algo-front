/**
 * Pure rules of the "Оплаты" screens: types of the API contract (PAY-2: payments are money, the server
 * works out the coverage, the debt and the advance), money and date formatting, status wording, limits, settings.
 * No React and no network here, so node:test can load this file directly.
 * Calendar days are computed in UTC from the ISO string, so they never drift with the
 * viewer's timezone; "today" comes from the caller (the Tashkent business date).
 * The ledger helpers (balance wording, preview, statement) live in `payments-ledger.ts`, the income
 * screen in `payments-income-v2.ts`; the Russian sentences of a calculation come from the server.
 */
export { formatDateRu } from "./attendance-excuses";
import { formatDateRu } from "./attendance-excuses";
import { formatDayMonthRu } from "./business-time";
import { formatMoney, formatMoneyInput, groupDigits } from "./money-format";
import { CHIP_TONE_CLASS } from "./chip-tone";
import { parseDebtAge, type DebtAge } from "./debt-ages";
import { daysLabel, leftPhrase, lessonsWord, pluralRu } from "./plural";
import type { PriceInfo } from "./group-price";
import { forecastText, type RecalcLine } from "./payf";
import { rowUnpaid, type PayState } from "./pay-state";
import { PAY_DUE_DAYS_RANGE, PAY_DUE_LESSONS_RANGE } from "./pay-due-setting";

// ── API contract (pay2_contract.json) ──────────────────────────────────────

export type PeriodMode = "calendar" | "lessons";
/** How a calendar period starts: from the payment date, or on one day of the month for the whole center. */
export type BillingAnchor = "payment_date" | "fixed_day";
export type PaymentStatus = "none" | "free" | "expired" | "ends_today" | "expiring" | "active" | "paused";
/** The tabs of «Оплаты» (the server's keys, PAY-DUE 10.2): «Должники» (`debtors`), «К оплате» (`to_pay`), «Заканчивается оплата», «Без долга», «На паузе».  A student with both sums is in both of the first two. */
export type PaymentBucket = "debtors" | "to_pay" | "expiring" | "active" | "paused";

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
  /** PAY-DUE 9.6: the term of the centre.  A calendar mode: the sum of a period is «К оплате» for this many days from its start (the first day counts as the first; 0 - a debt from the first day); a package: this many lessons may be held unpaid.  The owner changes them (own block, own dry run), nobody else reads them here. */
  pay_due_days: number;
  pay_due_lessons: number;
  /** PAY-DUE 14А.3: the example under the term in the SERVER'S words (the owner's GET and the dry run - for the requested values): `period` for a calendar mode, `package` for a package, `text` - of the centre's mode.  Read only, never sent back. */
  pay_due_example?: PayDueExample | null;
  /** An excuse is confirmed this many days before the end of the paid period... */
  excuse_deadline_days: number;
  /** ...or when this many lessons are left in a lessons package. */
  excuse_deadline_lessons: number;
  admin_can_manage: boolean;
  /** PAY-F: a lesson the CENTRE cancelled is deducted from the next payment of a monthly mode (false: not recalculated, as before). */
  centre_cancel_recalc: boolean;
  /** Money-1 B8: the server's sentence of the setting above («Урок, отменённый центром, уменьшит долг ученика сразу …»); read only. */
  recalc_hint?: string | null;
  /** The day the center starts to count money (PAY-2): nothing before it is charged.  Always the effective date from the server. */
  accounting_start_date?: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export type PaymentSettingsUpdate = Partial<Omit<PaymentSettings, "updated_by" | "updated_at" | "recalc_hint" | "pay_due_example">>;

/** What a change of `accounting_start_date` touches (`PUT /org/settings/payments?dry_run=true`). */
export interface AccountingStartImpact {
  memberships_with_new_debt: number;
  debt_delta: number;
  /** Groups whose advance changes, by how much, and how much of it could be given back (older servers do not send them). */
  memberships_with_changed_advance?: number;
  advance_delta?: number;
  refundable_delta?: number;
  /** S0: memberships whose live opening has «оплачено до» earlier than the new start − 1 (they need a second look in «Остатки на начало»; older servers do not send it). */
  openings_to_review?: number;
}

/** The sentences of the example under the term of payment (`pay_due_example`). */
export interface PayDueExample {
  period: string;
  package: string;
  text: string;
}

/** `PUT /org/settings/payments`: the settings plus the impact of the requested start date (`dry_run`: nothing was saved). */
export interface PaymentSettingsChanged extends PaymentSettings {
  dry_run?: boolean;
  impact?: AccountingStartImpact | null;
  /** PAY-DUE 10.6: only on the dry run of a new term: how many students change the NAME of their sum by it (`to_due`: debtors who become «К оплате»; `to_debt`: the other way) and the server's lines for them (`texts`, none at zero). */
  pay_due_impact?: { to_due: number; to_debt: number; texts: string[] } | null;
  /** LOGIC-A F12: only on the dry run of a change of the billing mode: who is touched and when each switches. */
  regime_impact?: ({ students_affected: number; first_switch: string | null; latest_switch: string | null; defer: boolean } & Record<string, unknown>) | null;
}

export interface PaymentsSummary {
  as_of: string;
  ends_today: number;
  expiring: number;
  none: number;
  active: number;
  free: number;
  tracked_total: number;
  period_mode: PeriodMode;
  /** Not in the contract yet: used for the "уроков" default when the server sends it. */
  lessons_per_payment?: number | null;
  /** PAY-DUE 10.2: ONE meaning of the unpaid sum.  `debt_total` / `debtors`: the parts whose term has passed (students); `due_total` / `due_students`: the parts still within their term; a student with both is in both. */
  debt_total?: number;
  debtors?: number;
  due_total?: number;
  due_students?: number;
  /** The nearest term among the sums «К оплате»: the day and the server's words («сегодня» / «завтра, 21.11» / «24.11», without «до»); null - none. */
  due_nearest?: { date: string; text: string } | null;
  advance_total?: number;
  accounting_start_date?: string | null;
  /** LOGIC-A: memberships on a pause today. */
  paused?: number;
  /** Memberships of each tab (the same sets `payments/status?bucket=` lists); `debtors` and `to_pay` overlap. */
  buckets?: { debtors: number; to_pay: number; expiring: number; active: number; paused: number };
  /** Distinct students on a pause (the badge of «На паузе»). */
  students_paused?: number;
  students_with_advance?: number;
  price_missing?: number;
  /** Money-2 Т18: the debtors by the age of the debt (`overdue_days`) - four baskets in the order `to_30`, `31_60`, `61_90`, `over_90`. */
  debt_ages?: Array<{ bucket: string; students: number; memberships: number; debt_total: number }>;
  /** PAY-DUE 10.6: the term of the centre, READ ONLY here (the roles with the right to money read it; changing it is the owner's, `PUT /org/settings/payments`). */
  pay_due_days?: number;
  pay_due_lessons?: number;
  /** An unpaid lesson of a package stops being «К оплате» this many days after its date whatever the setting is (read only; the screen says «не дольше N дней» by it). */
  pay_due_package_max_days?: number;
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
  /** «Погашен долг за 15.09–14.10» / «На текущий период 15.10–14.11» / «Аванс на 15.11–14.12». */
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
  /** Money-2 T7: a cancelled payment that nothing replaced yet and that may be restored (the button «Восстановить оплату»). */
  restorable?: boolean;
  /** Money-2 T7: a cancelled payment - the receipt number of the payment that stands in its place (a correction or a restoration). */
  replaced_by_receipt_no?: number | null;
  /** Money-2 T7: the payment is the restoration of the cancelled payment with this receipt number. */
  restored_from_receipt_no?: number | null;
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
  /** The ids behind the names: a receipt opened by a bare link still leads on to the statement, the student and the group. */
  student_id?: string | null;
  membership_id?: string | null;
  group_id?: string | null;
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
  /** PAY-F: «−46 000 сум: урок 21.10 отменён центром» - what this payment took into account (empty on an old receipt). */
  recalc?: RecalcLine[];
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
  /** Money-1 V5: the moment the receipt is issued (naive UTC), the account of the student ON THAT DAY, «копия» for every print after the first, the note of a cancelled payment, the line «не фискальный чек». */
  issued_at?: string | null;
  state_on_issue?: ReceiptState | null;
  is_copy?: boolean;
  print_count?: number;
  void_note?: string | null;
  disclaimer?: string | null;
}

/** «На 07.11.2026: долг 100 000 сум, оплачено до 14.11» - the server's own sentence (`text`) and the numbers behind it. */
export interface ReceiptState {
  as_of: string;
  debt: number;
  advance: number;
  paid_until: string | null;
  text: string;
}

/** `GET /auth/org/refunds/{id}/receipt` (Money-1 V6): the sheet «Квитанция о возврате В-n».  No print counter and no «копия»: the number is enough (the receiver signs on paper). */
export interface RefundReceiptOut {
  refund_id: string;
  receipt_no: number | null;
  /** «В-12»; null for a refund older than the numbers. */
  receipt_label: string | null;
  org_name: string;
  org_city?: string | null;
  org_phone?: string | null;
  student_name: string;
  display_id?: string | null;
  group_name: string;
  amount: number;
  amount_words: string;
  method: PayMethod;
  method_label: string;
  reason?: string | null;
  note?: string | null;
  effective_on: string;
  created_at?: string | null;
  accepted_by_name?: string | null;
  voided_at?: string | null;
  voided_by_name?: string | null;
  void_reason?: string | null;
  void_note?: string | null;
  disclaimer: string;
  signature_line: string;
}

/** `/owner/payments` + refund id -> `/owner/payments/refund-receipt/<id>`. */
export function refundReceiptHref(paymentsBasePath: string, refundId: string): string {
  return `${paymentsBasePath.replace(/\/+$/, "")}/refund-receipt/${encodeURIComponent(refundId)}`;
}

/** «Квитанция о возврате В-12» / «Квитанция о возврате» (a refund older than the numbers has no number). */
export function refundReceiptTitle(label: string | null | undefined): string {
  return label ? `Квитанция о возврате ${label}` : "Квитанция о возврате";
}

/** The toast after a refund: «Аванс возвращён · В-12» (the number is the paper the person can print next). */
export function refundDoneText(receiptNo: number | null | undefined): string {
  return receiptNo ? `Аванс возвращён · В-${receiptNo}` : "Аванс возвращён";
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
  /** Money-2 Т18: the basket of `overdue_days` (`to_30` / `31_60` / `61_90` / `over_90`; null - no debt). */
  debt_age_bucket?: string | null;
  days_left?: number | null;
  lessons_total?: number | null;
  lessons_used?: number | null;
  lessons_left?: number | null;
  /** PAY-F: the day of the last paid lesson by the schedule (a package only; null: no forecast). */
  paid_through_forecast?: string | null;
  last_payment?: PaymentOut | null;
  /**
   * EVERYTHING unpaid of the group (whole сум) = `debt_amount + due_amount`: a sum, never a name (the name is `state`).  The server renames it `debt` → `unpaid`
   * (PAY-DUE, second part): the screens read it ONLY through `rowUnpaid` (lib/pay-state.ts), so the change of the name is one line there.
   */
  unpaid?: number;
  /** The same sum in the normalised row (`normalizeRow` copies `unpaid` here): the screens that have always read `row.debt` keep working, nothing reads the server's name but `rowUnpaid`. */
  debt?: number;
  advance?: number;
  /** Money that covers a part of a day / lesson not bought completely. */
  partial_credit?: number;
  price_missing?: boolean;
  lessons_unpaid?: number;
  /** How much of the advance may be given back. */
  refundable?: number;
  writeoff_allowed?: boolean;
  /**
   * PAY-DUE 10.2: the unpaid sum is split by its TERM and named by the server (the screen never decides, LESSONS 143): `debt_amount` (the term has passed) and `due_amount` (still within it, until `due_until`),
   * `overdue_days` (K, null without a debt), for packages `due_lessons` / `debt_lessons`; the words of each name - `debt_text` / `debt_sub`, `due_text` / `due_sub` (which of them leads is the choice of the tab).
   */
  debt_amount?: number;
  due_amount?: number;
  due_until?: string | null;
  overdue_days?: number | null;
  due_lessons?: Record<string, number> | null;
  debt_lessons?: number;
  debt_text?: string | null;
  debt_sub?: string | null;
  due_text?: string | null;
  due_sub?: string | null;
  /** The WORST state of the membership (debt → to pay → payment ends soon → pause → paid / advance → free → no price) and its one label: the single chip of a group / a card reads these two. */
  state?: PayState;
  state_text?: string | null;
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
  /** Everything unpaid before / after the payment (the server's `unpaid_*`, 14А.6): a sum, never a name. */
  unpaid_before: number;
  unpaid_after: number;
  advance_after: number;
  paid_until_before: string | null;
  paid_until_after: string | null;
}

export interface PaymentSaveResult {
  payment: PaymentOut;
  allocation?: AllocationSummary | null;
  warnings: PaymentWarning[];
  row: MembershipPaymentRow;
  /** Money-1 A3: the saved payroll sheets this payment touches (`lib/money-effects.ts`); absent from an older server. */
  money_effects?: unknown;
}

export interface PaymentsStatusList {
  items: MembershipPaymentRow[];
  /** Memberships (rows) of the filter. */
  total: number;
  limit: number;
  offset: number;
  as_of: string;
  /** PAY-DUE 10.2: DISTINCT students of the filter - the number of the tab; `amount_total`: the tab's part of the money over ALL its rows (`debtors`: `debt_amount`, `to_pay`: `due_amount`). */
  students?: number;
  amount_total?: number;
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
/** What the student owes today (before the typed amount), named by the term - the server's words (PAY-DUE 10.2 / 10.10): the old `past_debt` / `current_due` / `days_overdue` are gone. */
export interface PreviewDue {
  /** Everything unpaid (`debt_amount + due_amount`). */
  unpaid: number;
  debt_amount: number;
  due_amount: number;
  due_until: string | null;
  overdue_days: number | null;
  debt_text: string | null;
  debt_sub: string | null;
  due_text: string | null;
  due_sub: string | null;
  advance: number;
  /** Segments that have begun and are not paid up. */
  segments: Segment[];
  paid_until: string | null;
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
  /** Everything unpaid after the payment (a sum; the names are `debt_amount_after` / `due_amount_after`). */
  unpaid_after: number;
  debt_amount_after: number;
  due_amount_after: number;
  due_until_after: string | null;
  overdue_days_after: number | null;
  advance_after: number;
  /** Null in lessons mode. */
  paid_until_before: string | null;
  paid_until_after: string | null;
  status_after: PaymentStatus;
  partial_credit_after: number;
  lessons: PreviewLessons | null;
  price_ahead: PriceAhead[];
  /** The server's sentence BEFORE the button (10.10): «Погасит долг 187 000 сум · к оплате 44 000 сум» - which sum the typed amount closes first, and what is left. */
  summary_text: string;
  /** The state after the payment in the words of the server (15А.1): «Останется: долг 100 000 сум · к оплате 50 000 сум» / «Оплачено до 15.11» / «Аванс 21 000 сум». It repeats the end of `summary_text`, so the window shows the sentence once. */
  after_text: string;
}

export interface PaymentPreview {
  as_of: string;
  mode: PeriodMode;
  price: Partial<PriceInfo>;
  due: PreviewDue;
  /** The whole unpaid sum (calendar) / to the end of the package (lessons); 0 - nothing is due: the window fills the field with it, the screen counts nothing (10.10). */
  suggested_amount: number;
  /** The amount the preview was asked for; null without it. */
  amount: number | null;
  /** Null when no amount was asked about. */
  result: PreviewResult | null;
  warnings: PaymentWarning[];
  /** PAY-F: deductions for lessons the centre cancelled that this payment is the first to take into account. */
  recalc?: RecalcLine[];
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
  /** Money-1 V1: the debt the person SAW; another one now -> 409 `BALANCE_CHANGED`. */
  expected_debt?: number;
}

export interface WriteoffCreated {
  writeoff: WriteoffOut;
  /** Money-1 V9: the period the forgiveness closes (`label` «06.10–05.11»); null - it closes nothing.  Only the student's period is shown, never the pay of the teacher. */
  closes?: { from: string; to: string; label: string } | null;
  /** Everything unpaid before / after the forgiveness (the server's `unpaid_*`). */
  unpaid_before: number;
  unpaid_after: number;
  row: MembershipPaymentRow;
  /** Money-1 A3: a forgiven debt is paid to the teacher - the sheets it moves (`lib/money-effects.ts`). */
  money_effects?: unknown;
}

export interface WriteoffVoided {
  writeoff: WriteoffOut;
  row: MembershipPaymentRow;
  money_effects?: unknown;
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
  /** Money-1 V6: the number of the receipt of the refund («В-n»); null for a refund older than the numbers. */
  receipt_no?: number | null;
}

export interface RefundCreate {
  amount: number;
  method: Exclude<PayMethod, "unknown">;
  /** Money-1 V6: mandatory (3..500). */
  reason: string;
  note?: string;
  effective_on?: string;
  /** Money-1 V1: the sum to return the person SAW; another one now -> 409 `BALANCE_CHANGED`. */
  expected_refundable?: number;
}

export interface RefundCreated {
  refund: RefundOut;
  advance_before: number;
  advance_after: number;
  row: MembershipPaymentRow;
  money_effects?: unknown;
}

export interface RefundVoided {
  refund: RefundOut;
  row: MembershipPaymentRow;
  money_effects?: unknown;
}

/** `{detail: {code, message, debt?, refundable?, payment_id?}}` of the PAY-2 routes (kept on `ApiError.detail`). */
export interface PayErrorDetail {
  code: string | null;
  message: string;
  debt: number | null;
  refundable: number | null;
  payment_id: string | null;
  /** Money-1 V1: the fresh numbers of a 409 `BALANCE_CHANGED`, the id of the record a `DUPLICATE_*` answers with, who and when cancelled an `ALREADY_VOIDED` one. */
  advance?: number | null;
  refund_id?: string | null;
  writeoff_id?: string | null;
  voided_at?: string | null;
  voided_by_name?: string | null;
}

// ── Statement (GET …/statement) ────────────────────────────────────────────

/**
 * `opening_debt` (the debt «на начало учёта», debit) and `opening_paid_until` / `pause` (information rows, no money) are the LOGIC-A
 * ledger events; the contract does not freeze how the statement carries them, so the front reads them defensively.
 */
export type StatementRowType = "charge" | "payment" | "writeoff" | "refund" | "transfer_in" | "transfer_out" | "opening_debt" | "opening_paid_until" | "pause" | "recalc";

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
  /** PAY-F: the line of a `recalc` row. */
  recalc?: RecalcLine | null;
  /** A corrected payment: the receipt it replaces and what it was («исправлена: было 450 000»). */
  replaces_receipt_no?: number | null;
  replaces_amount?: number | null;
  /** On the cancelled original: the receipt of its correction. */
  replaced_by_receipt_no?: number | null;
  /** Money-2 fix 3: a refund / a write-off - the business day the record was entered (`date` is the day it is dated by). */
  recorded_on?: string | null;
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
  /** The RUNNING total (minus = debt, plus = advance).  The server drops it after the screens' part 2 (PAY-DUE 10.11): the column «Остаток» reads `open_*`, nothing reads these two any more. */
  balance_after?: number | null;
  balance_text?: string | null;
  /**
   * PAY-DUE 10.11: what is open on the row ITSELF today, in the server's words.  A charge: the unpaid part of THIS charge named by the term (`paid` «Оплачено», `due` «К оплате N», `debt` «Долг N»); a payment (and a transfer
   * that brought money): `advance` («Аванс N») while a part of it is not laid on the charges yet, else null; a refund, a write-off, a transfer out: null.  `open_parts`: the same split by name - one element, or TWO
   * (the debt first) when the unpaid part of one charge holds both names; `open_name` is the worst of them (the tone), `open_amount` their sum, `open_text` the words of both.
   */
  open_amount?: number | null;
  open_name?: OpenName | null;
  open_text?: string | null;
  open_parts?: OpenPart[];
  /** PAY-DUE 16Б.1: the term under the title of a charge, in the words of the server («до 24.11» / «до сегодня» for a part «к оплате», «срок был 06.11» for a debt); null for a paid one and for every other row. A server without the field - no line. */
  open_sub?: string | null;
  details: StatementDetails;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
}

export type OpenName = "paid" | "forgiven" | "due" | "debt" | "advance";

export interface OpenPart {
  name: OpenName;
  amount: number;
  text: string;
}

export interface StatementSummary {
  charged: number;
  paid: number;
  transferred_in: number;
  written_off: number;
  /** PAY-F: deductions for the lessons the centre cancelled (older servers do not send it). */
  recalculated?: number;
  refunded: number;
  transferred_out: number;
  /** Everything unpaid (`debt_amount + due_amount`): a sum, never a name (the server's `unpaid`, 14А.6). */
  unpaid: number;
  advance: number;
  paid_until: string | null;
  status: PaymentStatus;
  /** charged − paid − written_off − recalculated + refunded = unpaid − advance (checked by the server). */
  reconciles: boolean;
  /** PAY-DUE 10.2: the unpaid sum NAMED by the term and the server's words (the same fields as a row of the list): `debt_*` the part whose term has passed, `due_*` the part within it, `state` / `state_text` the worst state. */
  debt_amount?: number;
  due_amount?: number;
  due_until?: string | null;
  overdue_days?: number | null;
  debt_text?: string | null;
  debt_sub?: string | null;
  due_text?: string | null;
  due_sub?: string | null;
  state?: PayState;
  state_text?: string | null;
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

// ── Limits ─────────────────────────────────────────────────────────────────

/** Backend rule (10^10 сум, safe for JS integers): the amount of a payment is 1..MAX_MONEY. */
export const MAX_MONEY = 10_000_000_000;
export const NOTE_MAX = 500;
export const REASON_MIN = 3;
export const REASON_MAX = 500;
export const PAYMENT_MAX_AGE_YEARS = 3;

// ── Money ──────────────────────────────────────────────────────────────────

export { formatMoney, formatMoneyInput } from "./money-format";

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
  { key: "debtors", label: "Должники" },
  { key: "to_pay", label: "К оплате" },
  { key: "expiring", label: "Заканчивается оплата" },
  { key: "active", label: "Без долга" },
];

/** «На паузе»: a fifth tab, shown while somebody is on a pause (or while it is the open one). */
export const PAUSED_BUCKET: { key: PaymentBucket; label: string } = { key: "paused", label: "На паузе" };

/** `?bucket=` of the page; unknown or missing values (and the old `debt` / `waiting` / `due` / `none` links) open «Должники», the most urgent tab. */
export function parseBucket(value: string | null | undefined): PaymentBucket {
  return [...PAYMENT_BUCKETS, PAUSED_BUCKET].find((bucket) => bucket.key === value)?.key ?? "debtors";
}

/**
 * IA audit F34: the whole list of «Оплаты» is in the address - `?bucket=debtors&group_id=…&teacher_id=…&q=иван&page=3` (`page` is 1-based there):
 * a return from a card, a reload and a shared link keep the tab, the filter, the search and the page.  Defaults are not written.
 */
export interface PaymentsListState {
  bucket: PaymentBucket;
  groupId: string;
  teacherId: string;
  q: string;
  /** 0-based. */
  page: number;
  /** Money-2 Т18: the basket of the age of the debt (only «Должники»); "" - all. */
  age: DebtAge | "";
}

export function parsePaymentsListQuery(params: { get(name: string): string | null } | null | undefined): PaymentsListState {
  const page = Math.floor(Number(params?.get("page")));
  return {
    bucket: parseBucket(params?.get("bucket")),
    groupId: params?.get("group_id") ?? "",
    teacherId: params?.get("group_id") ? "" : params?.get("teacher_id") ?? "",
    q: (params?.get("q") ?? "").slice(0, 80),
    page: Number.isFinite(page) && page >= 2 ? page - 1 : 0,
    age: parseBucket(params?.get("bucket")) === "debtors" ? parseDebtAge(params?.get("age")) : "",
  };
}

export function paymentsListQueryString(state: PaymentsListState): string {
  const params = new URLSearchParams({ bucket: state.bucket });
  if (state.groupId) params.set("group_id", state.groupId);
  else if (state.teacherId) params.set("teacher_id", state.teacherId);
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.bucket === "debtors" && state.age) params.set("age", state.age);
  if (state.page > 0) params.set("page", String(state.page + 1));
  return `?${params.toString()}`;
}

/** The tabs on screen: the four of the owner, and «На паузе» when it has somebody or is the open one. */
export function visibleBuckets(summary: { paused?: number | null; students_paused?: number | null } | null | undefined, open: PaymentBucket): Array<{ key: PaymentBucket; label: string }> {
  const paused = Number(summary?.students_paused ?? summary?.paused ?? 0);
  return paused > 0 || open === "paused" ? [...PAYMENT_BUCKETS, PAUSED_BUCKET] : PAYMENT_BUCKETS;
}

/** The number on a tab: STUDENTS (the server's counts - never counted on the screen); null while it is not known. */
export interface TabCounts { debtors: number | null; to_pay: number | null; expiring: number | null; active: number | null; paused: number | null }
export function bucketCount(counts: Partial<TabCounts> | null | undefined, key: PaymentBucket): number | null {
  const value = counts?.[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/** «У 3 учеников не задана цена» above the list (the card links to «Цены групп»). */
export function priceMissingText(count: number | null | undefined): string | null {
  const n = Math.floor(Number(count) || 0);
  return n > 0 ? `У ${n} ${pluralRu(n, "ученика", "учеников", "учеников")} не задана цена` : null;
}

/** «Должники 12»: the label and the number of a tab; the bare label while the number is not known. */
export function bucketTabLabel(label: string, count: number | null): string {
  return count === null ? label : `${label} ${count}`;
}

// ── Status wording ─────────────────────────────────────────────────────────

/** One word-forms helper of the project (`lib/plural.ts`); the payments screens import it from here as before. */
export { lessonsWord };

/** «На паузе до 01.11» for a student of the group list (`paused_until` = the last day of the live pause, ISO); «На паузе» without the day. */
export function pausedChipText(student: { on_pause?: boolean | null; paused_until?: string | null }): string | null {
  if (!student.on_pause) return null;
  const day = student.paused_until;
  return day && /^\d{4}-\d{2}-\d{2}/.test(day) ? `На паузе до ${formatDayMonthRu(day)}` : "На паузе";
}

/** The tone of a package bar (`lib/package-progress.ts`): red - used up, amber - runs out, green - paid.  The tone of a LABEL is `PAY_STATE_TONE` (lib/pay-state.ts). */
export type StatusTone = "danger" | "warning" | "ok" | "muted" | "free";
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
export function payIsDue(row: Pick<MembershipPaymentRow, "status" | "last_payment"> & { debt?: number | null; unpaid?: number | null }): boolean {
  if (rowUnpaid(row) > 0 || (Number(row.debt) || 0) > 0) return true;       // the server's `unpaid` or the normalised row's `debt` (the same sum)
  if (!row.last_payment) return true;
  return row.status === "expired" || row.status === "none";
}

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

/** UX pack №7: the page of «Оплаты» for an administrator without the money access (one card, one voice on every page of the section). */
export const MONEY_DENIED_TITLE = "Раздел «Оплаты» вам недоступен.";
export const MONEY_DENIED_HINT = "Доступ включает владелец центра.";
export const MONEY_DENIED_HOME = "На главную";

/** `code` of the server note that says a payment moved to the new group. */
export const CARRY_OVER_CODE = "payment_carried_over";
/** Walk of 05.11, D-6: the sentence of a transfer about the NEW account after it («Перенесено 640 000 сум; аванс останется …»). */
export const TRANSFER_BALANCE_CODE = "transfer_balance_after";
/** Money-1 B6: the days paid for WITHOUT money (the «оплачено до» of an opening balance) travel with the student - «Оплаченные дни — по 20.11.2026 — перешли вместе с учеником». */
export const PAID_DAYS_CARRIED_CODE = "paid_days_carried_over";

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
  // the sentence of the balance after the transfer starts with what arrived: the plain «перенесён» of the same student is not said next to it (rule 87)
  const withBalance = new Set((notes ?? []).filter((note) => note?.code === TRANSFER_BALANCE_CODE && note.message).map((note) => note.student_id ?? ""));
  for (const note of notes ?? []) {
    if (!note?.message) continue;
    if (note.code === CARRY_OVER_CODE && withBalance.has(note.student_id ?? "")) continue;
    const line = note.student_id && nameOf ? `${nameOf(note.student_id)} — ${note.message}` : note.message;
    (note.code === CARRY_OVER_CODE || note.code === TRANSFER_BALANCE_CODE || note.code === PAID_DAYS_CARRIED_CODE ? infos : warnings).push(line);
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

/** The stamp of a cancelled payment: the word of the dictionary («Оплата отменена»), not «аннулирована» (LESSONS 109). */
export const RECEIPT_VOID_STAMP = "ОПЛАТА ОТМЕНЕНА";
export const RECEIPT_DISCLAIMER = "Не является фискальным чеком";
export const RECEIPT_COPY_STAMP = "КОПИЯ";
export const REFUND_VOID_STAMP = "ВОЗВРАТ ОТМЕНЁН";
export const RECEIPT_PRINT_FAILED = "Не удалось записать печать. Повторите";

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
export function receiptHref(paymentsBasePath: string, paymentId: string, context?: ReceiptContext): string {
  const base = `${paymentsBasePath.replace(/\/+$/, "")}/receipt/${encodeURIComponent(paymentId)}`;
  const params = new URLSearchParams();
  if (context?.membershipId) params.set("m", context.membershipId);
  if (context?.studentId) params.set("s", context.studentId);
  if (context?.groupId) params.set("g", context.groupId);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/**
 * IA audit F28: the receipt does not carry the student, the membership or the group (the server's `ReceiptOut` has only their names), so the
 * screen that links to it says where it came from: `?m=<membership>&s=<student>&g=<group>`.  The receipt then leads on to the statement, the
 * student's «Оплаты» and the group; opened by a bare link it shows no such links.
 */
export interface ReceiptContext {
  membershipId?: string | null;
  studentId?: string | null;
  groupId?: string | null;
}

export function receiptContextOf(params: { get(name: string): string | null } | null | undefined): ReceiptContext {
  const clean = (value: string | null | undefined) => (value && /^[\w-]{1,64}$/.test(value) ? value : null);
  return { membershipId: clean(params?.get("m")), studentId: clean(params?.get("s")), groupId: clean(params?.get("g")) };
}

/** The links of the receipt: what the address says first, the ids of the receipt itself when it was opened by a bare link. */
export function receiptContextWithFallback(
  context: ReceiptContext,
  receipt: Pick<ReceiptOut, "membership_id" | "student_id" | "group_id"> | null | undefined,
): ReceiptContext {
  const clean = (value: string | null | undefined) => (value && /^[\w-]{1,64}$/.test(value) ? value : null);
  return {
    membershipId: context.membershipId ?? clean(receipt?.membership_id),
    studentId: context.studentId ?? clean(receipt?.student_id),
    groupId: context.groupId ?? clean(receipt?.group_id),
  };
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
  pay_due_days: 5,
  pay_due_lessons: 2,
  excuse_deadline_days: 5,
  excuse_deadline_lessons: 2,
  admin_can_manage: false,
  centre_cancel_recalc: false,
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
  "centre_cancel_recalc", "pay_due_days", "pay_due_lessons",
] as const;
export const ATTENDANCE_SCOPE_KEYS = ["excuse_deadline_days", "excuse_deadline_lessons"] as const;

type SettingsKey = (typeof PAYMENTS_SCOPE_KEYS)[number] | (typeof ATTENDANCE_SCOPE_KEYS)[number];

/**
 * The fields of the «Оплаты» section that the chosen card shows (and therefore may change): the model itself
 * and the admin switch always, then the day of a fixed-day center, the warning in days for a calendar one,
 * the package size and its warning for a package center.  The others are hidden and are neither validated nor sent.
 * PAY-F: «уроки, отменённые центром» belongs to the monthly modes only (a package never charges a cancelled lesson).
 */
export function paymentsScopeKeys(model: PaymentModel): SettingsKey[] {
  const common: SettingsKey[] = ["period_mode", "billing_anchor", "admin_can_manage", "accounting_start_date"];
  if (model === "lessons") return [...common, "lessons_per_payment", "expiring_lessons", "pay_due_lessons"];
  if (model === "fixed_day") return [...common, "billing_day", "expiring_days", "centre_cancel_recalc", "pay_due_days"];
  return [...common, "expiring_days", "centre_cancel_recalc", "pay_due_days"];
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
  if (lines.length === 0) lines.push("Долг и аванс ни у кого не изменятся");
  const review = accountingStartOpeningsToReview(impact);
  if (review > 0) lines.push(`У ${review} ${pluralRu(review, "остатка", "остатков", "остатков")} «оплачено до» раньше нового начала — пересмотрите их в «Остатки на начало»`);
  return lines;
}

/** How many live openings the new start leaves with «оплачено до» before it (0 from an older server). */
export function accountingStartOpeningsToReview(impact: AccountingStartImpact | null | undefined): number {
  const count = Math.floor(Number(impact?.openings_to_review));
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/** The same lines as one text (a sentence for assistive technology and tests). */
export function accountingStartImpactText(impact: AccountingStartImpact | null | undefined): string {
  return accountingStartImpactLines(impact).join(" · ");
}

/** The server accepts a start of the accounting not before this day. */
export const ACCOUNTING_START_MIN = "2020-01-01";

export function validatePaymentSettings(
  settings: Pick<PaymentSettings, "lessons_per_payment" | "expiring_days" | "expiring_lessons"> &
    Partial<Pick<PaymentSettings, "pay_due_days" | "pay_due_lessons" | "excuse_deadline_days" | "excuse_deadline_lessons" | "billing_day" | "period_mode" | "billing_anchor" | "accounting_start_date">>,
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
      return `${BILLING_DAY_LABEL}: число от ${BILLING_DAY_RANGE.min} до ${BILLING_DAY_RANGE.max}`;
    }
    if (check("pay_due_days") && settings.pay_due_days !== undefined && !inRange(settings.pay_due_days, PAY_DUE_DAYS_RANGE)) {
      return `Срок оплаты: от ${PAY_DUE_DAYS_RANGE.min} до ${PAY_DUE_DAYS_RANGE.max} дней`;
    }
    if (check("pay_due_lessons") && settings.pay_due_lessons !== undefined && !inRange(settings.pay_due_lessons, PAY_DUE_LESSONS_RANGE)) {
      return `Уроков без оплаты: от ${PAY_DUE_LESSONS_RANGE.min} до ${PAY_DUE_LESSONS_RANGE.max}`;
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

// PAY-F: ONE dictionary of the names (settings, hints, statements); the server mirrors it in `payments_texts.MODE_NAMES`.
export const PAYMENT_MODELS: Array<{ key: PaymentModel; title: string; hint: string }> = [
  { key: "payment_date", title: "Свой месяц у каждого ученика", hint: "Месяц считается с даты «Оплата с» — по умолчанию это первое занятие ученика в группе: 05.10 → 04.11" },
  { key: "fixed_day", title: "Общий месяц для всех", hint: "У всех один период, например с 1-го по последнее число; первый неполный месяц — по урокам" },
  { key: "lessons", title: "Пакет уроков", hint: "Оплата закрывает заданное число проведённых уроков; отменённые уроки не списываются" },
];

/** The name of a way to count a payment, from the dictionary above. */
export function paymentModelTitle(model: PaymentModel): string {
  return PAYMENT_MODELS.find((option) => option.key === model)?.title ?? "";
}

/** The field of the «Общий месяц»: the day its period starts on. */
export const BILLING_DAY_LABEL = "День, с которого начинается общий месяц";

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

// ── The three cards under the header of «Оплаты» (PAY-DUE 9.7) ─────────────

export interface PositionCard {
  key: "debt" | "due" | "advance";
  label: string;
  /** The big sum: «1 250 000 сум». */
  amount: string;
  /** Under it: «12 учеников · срок прошёл» / «6 учеников · ближайший срок сегодня» / «4 ученика»; "" while the server has not told the count. */
  sub: string;
  /** The students of the card (the server's number; null while it is not known) - the compact summary of a phone says it on the right of the sum. */
  students: number | null;
  tone: "debt" | "due" | "advance" | "none";
}

const studentsText = (n: number) => `${n} ${pluralRu(n, "ученик", "ученика", "учеников")}`;
const count = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null);

/**
 * «Долг» (red, the term has passed), «К оплате» (calm, still within the term, with the nearest term in the server's words) and «Аванс».  Every number is the server's (`/org/payments/summary`):
 * the debtors and the students of «К оплате» are the very numbers of the tabs, the two sums add up to everything unpaid.
 */
export function positionCards(summary: {
  debt_total?: number | null;
  debtors?: number | null;
  due_total?: number | null;
  due_students?: number | null;
  due_nearest?: { text?: string | null } | null;
  advance_total?: number | null;
  students_with_advance?: number | null;
} | null | undefined): PositionCard[] {
  const money = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));
  const debt = money(summary?.debt_total);
  const due = money(summary?.due_total);
  const advance = money(summary?.advance_total);
  const debtors = count(summary?.debtors);
  const dueStudents = count(summary?.due_students);
  const ahead = count(summary?.students_with_advance);
  const nearest = summary?.due_nearest?.text?.trim();
  const dueSub = [dueStudents === null || dueStudents === 0 ? "" : studentsText(dueStudents), nearest ? `ближайший срок ${nearest}` : ""].filter(Boolean).join(" · ");
  return [
    { key: "debt", label: "Долг", amount: formatMoney(debt), sub: debtors === null || debtors === 0 ? "" : `${studentsText(debtors)} · срок прошёл`, students: debtors, tone: debt > 0 ? "debt" : "none" },
    { key: "due", label: "К оплате", amount: formatMoney(due), sub: dueSub, students: dueStudents, tone: due > 0 ? "due" : "none" },
    { key: "advance", label: "Аванс", amount: formatMoney(advance), sub: ahead === null || ahead === 0 ? "" : studentsText(ahead), students: ahead, tone: advance > 0 ? "advance" : "none" },
  ];
}

/** The toast after a forgiveness: «Прощён долг 300 000 сум за 06.10–05.11» (the period is the server's `closes.label`; without it - no period). */
export function writeoffDoneText(result: Pick<WriteoffCreated, "writeoff" | "closes">): string {
  const label = result.closes?.label?.trim();
  return `Прощён долг ${formatMoney(result.writeoff.amount)}${label ? ` за ${label}` : ""}`;
}
