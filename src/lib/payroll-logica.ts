/**
 * LOGIC-A «деньги», payroll part: payouts of the teachers' pay (decision 6), the divisor by month (F7), the lines of a sheet split
 * by lesson type (F14), the money cover of a lesson (decision 5) and the demand for the fingerprint (F14).
 * Contract: `tests/fixtures/logicA` (A19–A28).  The sentences of a payout state (`PayoutState.text`) are the server's (spec §5.8).
 *
 * The pay of a teacher is a different account from the student's: «начислено / к выплате» keep their words here (owner 21.10).
 * Pure: no React, no network.
 */
import {
  formatDateRu,
  formatMoney,
  isIsoDate,
  MAX_MONEY,
  NOTE_MAX,
  parseMoneyInput,
  pluralRu,
  REASON_MAX,
  REASON_MIN,
  subtractYears,
} from "./payments";
import {
  lessonTypeLabel,
  monthNameRu,
  monthTitle,
  RATE_FROM_START,
  RATE_FROM_START_LABEL,
  type PayrollErrorLike,
  type PayrollLine,
  type PayrollMark,
} from "./payroll";

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};
const arr = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

// ── Payouts ─────────────────────────────────────────────────────────────────

export type PayoutMethod = "cash" | "card" | "bank_transfer" | "other";
export type PayoutStateKind = "unpaid" | "due" | "settled" | "overpaid";

export const PAYOUT_METHODS: Array<{ key: PayoutMethod; label: string }> = [
  { key: "cash", label: "Наличные" },
  { key: "card", label: "Карта" },
  { key: "bank_transfer", label: "Перевод" },
  { key: "other", label: "Другое" },
];

export function payoutMethodLabel(method: string | null | undefined): string {
  return PAYOUT_METHODS.find((item) => item.key === method)?.label ?? "Способ не указан";
}

export interface PayoutOut {
  id: string;
  sheet_id: string;
  teacher_id: string;
  /** `YYYY-MM` of the sheet: a payout belongs to the month of the sheet, not to the day it was paid. */
  month: string;
  amount: number;
  paid_on: string;
  method: PayoutMethod;
  note: string | null;
  sheet_revision: number;
  sheet_total: number;
  created_by_name: string | null;
  created_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
}

export interface PayoutState {
  saved_total: number;
  /** The pay by today's data; null when it cannot be counted (no rate, a hand-set price): the saved sum stands. */
  fresh_total: number | null;
  target: number;
  paid: number;
  /** target − paid: positive «доплатить», negative «переплачено». */
  balance: number;
  state: PayoutStateKind;
  /** `fresh`: the sheet is out of date, the target is the fresh total. */
  basis: "fresh" | "saved";
  /** The sentence of the server (spec §5.8). */
  text: string;
  /** Live and cancelled, the oldest first. */
  items: PayoutOut[];
}

export interface PayoutCreated {
  payout: PayoutOut;
  state: PayoutState;
}

export interface PayoutVoided {
  payout: PayoutOut;
  state: PayoutState;
}

export interface PayoutCreate {
  amount: number;
  paid_on?: string | null;
  method?: PayoutMethod | null;
  note?: string | null;
}

export function normalizePayout(raw: Partial<PayoutOut> | null | undefined): PayoutOut | null {
  if (!raw || !raw.id) return null;
  return {
    id: String(raw.id),
    sheet_id: String(raw.sheet_id ?? ""),
    teacher_id: String(raw.teacher_id ?? ""),
    month: String(raw.month ?? ""),
    amount: num(raw.amount),
    paid_on: String(raw.paid_on ?? ""),
    method: (raw.method as PayoutMethod) ?? "other",
    note: raw.note ?? null,
    sheet_revision: num(raw.sheet_revision),
    sheet_total: num(raw.sheet_total),
    created_by_name: raw.created_by_name ?? null,
    created_at: raw.created_at ?? null,
    voided_at: raw.voided_at ?? null,
    void_reason: raw.void_reason ?? null,
  };
}

/** A state read without surprises: numbers are numbers, the list is a list, an older answer without it is «не выплачено». */
export function normalizePayoutState(raw: Partial<PayoutState> | null | undefined): PayoutState | null {
  if (!raw) return null;
  const items = arr<Partial<PayoutOut>>(raw.items).map(normalizePayout).filter((item): item is PayoutOut => item !== null);
  const kind = raw.state === "due" || raw.state === "settled" || raw.state === "overpaid" ? raw.state : "unpaid";
  return {
    saved_total: num(raw.saved_total),
    fresh_total: raw.fresh_total === null || raw.fresh_total === undefined ? null : num(raw.fresh_total),
    target: num(raw.target),
    paid: num(raw.paid),
    balance: num(raw.balance),
    state: kind,
    basis: raw.basis === "fresh" ? "fresh" : "saved",
    text: String(raw.text ?? ""),
    items,
  };
}

/** The payouts that count (not cancelled). */
export function livePayouts(state: Pick<PayoutState, "items"> | null | undefined): PayoutOut[] {
  return arr<PayoutOut>(state?.items).filter((item) => !item.voided_at);
}

export type PayoutTone = "none" | "due" | "ok" | "over";

export interface PayoutChip {
  text: string;
  tone: PayoutTone;
}

/**
 * The chip of the «Выплата» column: «Не выплачено» / «Выплачено 475 000 из 600 000» / «Доплатить 125 000» (the sheet is out of date) /
 * «Выплачено полностью» / «Переплачено 125 000».  null while the teacher has no saved sheet (nothing to pay yet).
 */
export function payoutChip(state: PayoutState | null | undefined): PayoutChip | null {
  if (!state) return null;
  switch (state.state) {
    case "settled":
      return { text: "Выплачено полностью", tone: "ok" };
    case "overpaid":
      return { text: `Переплачено ${formatMoney(Math.abs(state.balance))}`, tone: "over" };
    case "due":
      return state.basis === "fresh"
        ? { text: `Доплатить ${formatMoney(Math.max(0, state.balance))}`, tone: "due" }
        : { text: `Выплачено ${formatMoney(state.paid)} из ${formatMoney(state.target)}`, tone: "due" };
    default:
      return { text: "Не выплачено", tone: "none" };
  }
}

export const PAYOUT_CHIP_CLASS: Record<PayoutTone, string> = {
  none: "border-slate-200 bg-slate-50 text-slate-600",
  due: "border-amber-200 bg-amber-50 text-amber-900",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  over: "border-sky-200 bg-sky-50 text-sky-900",
};

/** The totals of the month under the heading: «К выплате за октябрь: 600 000 сум · выплачено 475 000 · доплатить 125 000». */
export function monthPayoutText(month: string, teachers: ReadonlyArray<{ payout?: PayoutState | null }>): string | null {
  const states = teachers.map((teacher) => normalizePayoutState(teacher.payout)).filter((state): state is PayoutState => state !== null);
  if (states.length === 0) return null;
  const target = states.reduce((total, state) => total + state.target, 0);
  const paid = states.reduce((total, state) => total + state.paid, 0);
  const due = states.reduce((total, state) => total + Math.max(0, state.balance), 0);
  const over = states.reduce((total, state) => total + Math.max(0, -state.balance), 0);
  const stale = states.some((state) => state.basis === "fresh" && state.balance > 0);
  const parts = [`К выплате за ${monthNameRu(month).toLowerCase()}: ${formatMoney(target)}`, `выплачено ${formatMoney(paid)}`];
  if (due > 0 && paid > 0) parts.push(`${stale ? "доплатить" : "осталось выплатить"} ${formatMoney(due)}`);
  if (over > 0) parts.push(`переплачено ${formatMoney(over)}`);
  return parts.join(" · ");
}

/** The block of a sheet: «К выплате 600 000 · Выплачено 475 000 · Доплатить 125 000» as parts, each with its tone. */
export function sheetPayoutParts(state: PayoutState | null | undefined): Array<{ label: string; value: string; tone: "plain" | "due" | "over" }> {
  if (!state) return [];
  const parts: Array<{ label: string; value: string; tone: "plain" | "due" | "over" }> = [
    { label: "К выплате", value: formatMoney(state.target), tone: "plain" },
    { label: "Выплачено", value: formatMoney(state.paid), tone: "plain" },
  ];
  if (state.balance > 0 && state.paid > 0) parts.push({ label: state.basis === "fresh" ? "Доплатить" : "Осталось выплатить", value: formatMoney(state.balance), tone: "due" });
  else if (state.balance > 0) parts.push({ label: "Осталось выплатить", value: formatMoney(state.balance), tone: "due" });
  else if (state.balance < 0) parts.push({ label: "Переплачено", value: formatMoney(-state.balance), tone: "over" });
  return parts;
}

// ── The form «Отметить выплату» ─────────────────────────────────────────────

export interface PayoutFormValues {
  /** Digits with separators, as typed. */
  amount: string;
  paidOn: string;
  method: PayoutMethod | null;
  note: string;
}

export const PAYOUT_ACTION_LABEL = "Отметить выплату";
export const PAYOUT_MAX_AGE_YEARS = 3;

/** The amount the form starts with: what is left to pay (never negative); empty when nothing is left. */
export function defaultPayoutAmount(state: PayoutState | null | undefined): number | null {
  const left = Math.max(0, state?.balance ?? 0);
  return left > 0 ? left : null;
}

export function emptyPayoutValues(today: string, state: PayoutState | null | undefined): PayoutFormValues {
  const amount = defaultPayoutAmount(state);
  return { amount: amount === null ? "" : String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " "), paidOn: today, method: null, note: "" };
}

export function validatePayout(values: PayoutFormValues, today: string): string | null {
  const amount = parseMoneyInput(values.amount);
  if (amount === null) return "Укажите сумму";
  if (amount < 1) return "Сумма должна быть больше нуля";
  if (amount > MAX_MONEY) return "Сумма слишком большая";
  if (!isIsoDate(values.paidOn)) return "Укажите дату выплаты";
  if (values.paidOn > today) return "Дата выплаты не может быть в будущем";
  if (values.paidOn < subtractYears(today, PAYOUT_MAX_AGE_YEARS)) return "Дата выплаты старше 3 лет";
  if (!values.method) return "Выберите способ выплаты";
  if (values.note.trim().length > NOTE_MAX) return `Примечание не длиннее ${NOTE_MAX} символов`;
  return null;
}

export function buildPayoutBody(values: PayoutFormValues): PayoutCreate {
  const body: PayoutCreate = { amount: parseMoneyInput(values.amount) ?? 0, paid_on: values.paidOn, method: values.method ?? "other" };
  const note = values.note.trim();
  if (note) body.note = note;
  return body;
}

/** The overpayment the amount makes: «Это больше, чем осталось выплатить. Переплата 30 000 сум. Продолжить?»; null when it does not exceed what is left. */
export function payoutOverpay(amount: number | null, state: PayoutState | null | undefined): number | null {
  if (amount === null || amount < 1) return null;
  const left = Math.max(0, state?.balance ?? 0);
  return amount > left ? amount - left : null;
}

export function payoutOverpayQuestion(overpay: number): string {
  return `Это больше, чем осталось выплатить. Переплата ${formatMoney(overpay)}. Продолжить?`;
}

/** Under the amount: what is left after this payout («Останется выплатить 125 000 сум» / «Выплачено полностью»). */
export function payoutAfterText(amount: number | null, state: PayoutState | null | undefined): string {
  if (amount === null || amount < 1 || !state) return "";
  const rest = state.balance - amount;
  if (rest > 0) return `Останется выплатить ${formatMoney(rest)}`;
  if (rest === 0) return "Выплачено полностью";
  return `Переплата ${formatMoney(-rest)}`;
}

/** One payout of the history: «05.11.2026 · 475 000 · Наличные · Арслан». */
export function payoutLine(payout: Pick<PayoutOut, "paid_on" | "amount" | "method" | "created_by_name">): string {
  return [formatDateRu(payout.paid_on), formatMoney(payout.amount), payoutMethodLabel(payout.method), payout.created_by_name].filter(Boolean).join(" · ");
}

export function validatePayoutVoid(reason: string | null | undefined): string | null {
  const text = (reason ?? "").trim();
  if (text.length < REASON_MIN) return `Укажите причину (не короче ${REASON_MIN} символов)`;
  if (text.length > REASON_MAX) return `Причина не длиннее ${REASON_MAX} символов`;
  return null;
}

export type PayoutErrorKind = "duplicate" | "not_saved" | "already_voided" | "amount_range" | "paid_on_range" | "method_required" | "reason_required" | "other";

const PAYOUT_ERROR: Record<string, PayoutErrorKind> = {
  DUPLICATE_PAYOUT: "duplicate",
  SHEET_NOT_SAVED: "not_saved",
  ALREADY_VOIDED: "already_voided",
  AMOUNT_RANGE: "amount_range",
  PAID_ON_RANGE: "paid_on_range",
  METHOD_REQUIRED: "method_required",
  REASON_REQUIRED: "reason_required",
};

export function payoutError(error: PayrollErrorLike | null | undefined): { kind: PayoutErrorKind; message: string } {
  const code = error?.code ?? (error?.detail as { code?: string } | null | undefined)?.code;
  const message = (error?.message || "Не удалось выполнить действие").replace(/[.\s]+$/, "");
  return { kind: (code && PAYOUT_ERROR[code]) || "other", message };
}

// ── The cover of a lesson (decision 5) ──────────────────────────────────────

/** «из них списано центром: 2 урока» — lessons whose student was released by the centre but are paid to the teacher. */
export function writtenOffText(lessons: number): string | null {
  if (!lessons || lessons < 1) return null;
  return `из них списано центром: ${lessons} ${pluralRu(lessons, "урок", "урока", "уроков")}`;
}

/** Lessons of a line whose cover is a forgiven debt (`cover = "writeoff"`); the server's `written_off` count when it sends one. */
export function writtenOffLessons(line: Pick<PayrollLine, "marks"> & { written_off?: number }): number {
  if (typeof line.written_off === "number") return line.written_off;
  return arr<PayrollMark & { cover?: string | null }>(line.marks).filter((mark) => mark.cover === "writeoff").length;
}

export function sheetWrittenOffLessons(sheet: { written_off_total?: number; lines: Array<Pick<PayrollLine, "marks"> & { written_off?: number }> }): number {
  if (typeof sheet.written_off_total === "number") return sheet.written_off_total;
  return sheet.lines.reduce((total, line) => total + writtenOffLessons(line), 0);
}

// ── F14: the lines of a student split by lesson type ───────────────────────

export interface SplitLine {
  /** The first row of the student's lines in this block carries the name; the others are sub-rows of the same student. */
  first: boolean;
  /** «Группа · 6 уроков» when the student has lines of several types in the group; else null. */
  typeLabel: string | null;
}

/** «Группа · 6 уроков» / «Пара · 6 уроков». */
export function typeLineLabel(type: unknown, counted: number): string {
  return `${lessonTypeLabel(type)} · ${counted} ${pluralRu(counted, "урок", "урока", "уроков")}`;
}

/** A line key of a split line is `<membership>:<type>`; an ordinary line's is the membership id. */
export function isSplitLine(line: { line_key?: string | null }): boolean {
  return Boolean(line.line_key && line.line_key.includes(":"));
}

/**
 * For the lines of one block in the order they are shown: which row starts a student and which carry the «Группа · 6 уроков»
 * sub-labels.  A student with one line has none.
 */
export function splitLayout(lines: ReadonlyArray<{ membership_id: string; lesson_type: string; counted: number; line_key?: string | null }>): SplitLine[] {
  const perMembership = new Map<string, number>();
  for (const line of lines) perMembership.set(line.membership_id, (perMembership.get(line.membership_id) ?? 0) + 1);
  const seen = new Set<string>();
  return lines.map((line) => {
    const first = !seen.has(line.membership_id);
    seen.add(line.membership_id);
    return { first, typeLabel: (perMembership.get(line.membership_id) ?? 0) > 1 || isSplitLine(line) ? typeLineLabel(line.lesson_type, line.counted) : null };
  });
}

/** Rows of a block sorted by student, keeping the sub-rows of a student together (stable by the type order the server sent). */
export function sortLinesByStudent<T extends { student_name: string; membership_id: string }>(lines: T[]): T[] {
  const order = new Map<string, number>();
  lines.forEach((line, index) => { if (!order.has(line.membership_id)) order.set(line.membership_id, index); });
  return [...lines].sort((a, b) => {
    const byName = a.student_name.localeCompare(b.student_name, "ru");
    if (byName !== 0) return byName;
    if (a.membership_id !== b.membership_id) return (order.get(a.membership_id) ?? 0) - (order.get(b.membership_id) ?? 0);
    return 0;
  });
}

// ── F7: the divisor by month ────────────────────────────────────────────────

export interface DivisorRow {
  /** `YYYY-MM` (`2020-01` is «с самого начала»). */
  valid_from: string;
  divisor: number;
}

export interface PayrollSettingsFull {
  divisor: number;
  valid_from?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
  history?: DivisorRow[];
}

export const DIVISOR_HELP = "Старые месяцы не меняются. Ведомости, рассчитанные с другим делителем, покажут «Есть изменения».";
export const DIVISOR_FROM_LABEL = "Делитель действует с месяца";

/** «С октября 2026 — 13 · раньше 12» (newest first); the first row is «С самого начала — 12». */
export function divisorHistoryRows(history: DivisorRow[] | null | undefined): Array<{ key: string; from: string; divisor: number; text: string }> {
  const rows = arr<DivisorRow>(history).map((row) => ({ valid_from: String(row.valid_from), divisor: num(row.divisor) })).sort((a, b) => (a.valid_from < b.valid_from ? -1 : 1));
  return rows
    .map((row, index) => {
      const earlier = index > 0 ? rows[index - 1] : null;
      const from = row.valid_from === RATE_FROM_START ? RATE_FROM_START_LABEL : `С ${monthWordGenitive(row.valid_from)}`;
      return { key: row.valid_from, from, divisor: row.divisor, text: `${from} — ${row.divisor}${earlier ? ` · раньше ${earlier.divisor}` : ""}` };
    })
    .reverse();
}

// «с октября 2026»: the month after «с» takes the genitive.
const MONTH_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** «октября 2026» after «с»: the title of the month in the genitive («С октября 2026»). */
export function monthWordGenitive(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return `${MONTH_GENITIVE[index] ?? month} ${month.slice(0, 4)}`;
}

/** The divisor in force in a month by the history (12 without one): what the settings say next to «Сейчас». */
export function divisorFor(history: DivisorRow[] | null | undefined, month: string, fallback = 12): number {
  const rows = arr<DivisorRow>(history).filter((row) => row.valid_from <= month).sort((a, b) => (a.valid_from < b.valid_from ? -1 : 1));
  return rows.length > 0 ? num(rows[rows.length - 1].divisor) : fallback;
}

/** `PUT /org/payroll/settings`: the divisor and the month it starts in. */
export function buildDivisorBody(divisor: number, validFrom: string): { divisor: number; valid_from: string } {
  return { divisor, valid_from: validFrom };
}

/** The line under the form that says what saving does: «С октября 2026 делитель 13 (сейчас 12). Старые месяцы не меняются.» */
export function divisorChangeText(divisor: number | null, validFrom: string, current: number): string {
  if (divisor === null) return "";
  const from = validFrom === RATE_FROM_START ? "С самого начала" : `С ${monthWordGenitive(validFrom)}`;
  return divisor === current && validFrom !== RATE_FROM_START
    ? `${from} делитель ${divisor}, как сейчас.`
    : `${from} делитель ${divisor} (сейчас ${current}). Старые месяцы не меняются.`;
}

export function divisorMonthTitle(month: string): string {
  return month === RATE_FROM_START ? RATE_FROM_START_LABEL : monthTitle(month);
}

// ── F14: the fingerprint is required to save a calculation ─────────────────

export const FINGERPRINT_REQUIRED_TEXT = "Откройте расчёт заново: сохранение без проверки данных невозможно";

export function isFingerprintRequired(error: PayrollErrorLike | null | undefined): boolean {
  return error?.code === "FINGERPRINT_REQUIRED";
}

/** The first problem of a payroll error of the LOGIC-A routes, in words (the fingerprint has its own, the rest are the server's). */
export function payrollLogicaErrorText(error: PayrollErrorLike | null | undefined): string | null {
  if (isFingerprintRequired(error)) return FINGERPRINT_REQUIRED_TEXT;
  if (error?.code === "DIVISOR_RANGE") return error.message || "Делитель: от 1 до 31";
  return null;
}

/** The days of a payout in the month overview are never older than the sheet: `addDays` for the date limits of the form. */
export function payoutDateBounds(today: string): { min: string; max: string } {
  return { min: subtractYears(today, PAYOUT_MAX_AGE_YEARS), max: today };
}
