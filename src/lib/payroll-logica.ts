/**
 * LOGIC-A «деньги», payroll part: payouts of the teachers' pay (decision 6), the divisor by month (F7), the lines of a sheet split
 * by lesson type (F14), the money cover of a lesson (decision 5) and the demand for the fingerprint (F14).
 * Contract: `tests/fixtures/logicA` (A19–A28).  The sentences of a payout state (`PayoutState.text`) are the server's (spec §5.8).
 *
 * The pay of a teacher is a different account from the student's: «начислено / к выплате» keep their words here (owner 21.10).
 * Pure: no React, no network.
 */
import { formatUtcNaiveAsBusinessDateTime } from "./business-time";
import { MONTHS_GENITIVE } from "./ru-calendar";
import { formatMoneyInput, formatSignedMoney } from "./money-format";
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
  /** Money-1 A1b: always `saved` - the payout is by the SAVED total of the sheet (the field stays for older answers: `fresh` = the target was the fresh total). */
  basis: "fresh" | "saved";
  /** Money-1 A1b: fresh total − saved total (0: the sheet is up to date or cannot be counted); the payout does not move, the sheet says «изменилась на ±N» and waits for «Пересохранить». */
  changed_by: number;
  /** The sentence of the server for `changed_by` («После сохранения ведомость изменилась на +125 000. Пересохраните ведомость, чтобы учесть»); null without a change. */
  change_text: string | null;
  /** The sentence of the server (spec §5.8). */
  text: string;
  /** Live and cancelled, the oldest first. */
  items: PayoutOut[];
  /** R3 3: the advance of the earlier months of this teacher, how much of it this month's total took (`target` is AFTER it) and what this month hands on to the next one. */
  carry_in: number;
  carry_used: number;
  advance_out: number;
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
  /** MN-32: the server answers 409 `OVERPAY_CONFIRM_REQUIRED` to a payout above the balance until this is `true` AND `overpay` is the sum the owner was shown (R3 7). */
  confirm_overpay?: boolean;
  overpay?: number;
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
    changed_by: num(raw.changed_by),
    change_text: typeof raw.change_text === "string" && raw.change_text.trim() ? raw.change_text.trim() : null,
    text: String(raw.text ?? ""),
    items,
    carry_in: num(raw.carry_in),
    carry_used: num(raw.carry_used),
    advance_out: num(raw.advance_out),
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
 * The chip of the «Выплата» column: «Не выплачено» / «Выплачено 475 000 из 600 000» / «Выплачено полностью» / «Переплачено 125 000».  The payout is by the SAVED total of
 * the sheet (Money-1 A1b): a change of the data after the saving is the line `payoutChangeText`, never a different target.  null while the teacher has no saved sheet.
 */
export function payoutChip(state: PayoutState | null | undefined): PayoutChip | null {
  if (!state) return null;
  switch (state.state) {
    case "settled":
      return { text: "Выплачено полностью", tone: "ok" };
    case "overpaid":
      return { text: `Переплачено ${formatMoney(Math.abs(state.balance))}`, tone: "over" };
    case "due":
      return { text: `Выплачено ${formatMoney(state.paid)} из ${formatMoney(state.target)}`, tone: "due" };
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

/**
 * The chip of the BLOCK «Выплата» on a sheet (walk of 05.11, D-3, rule 87): the card above already says the sum («К выплате» / «Начислено сейчас») and the list below lists
 * the payouts, so the chip names the ONE thing neither says - what is left («Осталось выплатить 116 667») or what was overpaid.  The chip of a month row (`payoutChip`) is
 * self-contained, because the row has no such card.  An open month never says «Выплачено полностью»: it is paid by what is accrued NOW («На сегодня выплачено всё»).
 */
export function sheetPayoutChip(state: PayoutState | null | undefined): PayoutChip | null {
  if (!state) return null;
  switch (state.state) {
    case "settled":
      if (state.paid === 0 && state.carry_used > 0) return { text: "Закрыто авансом", tone: "ok" };
      return { text: state.basis === "fresh" ? "На сегодня выплачено всё" : "Выплачено полностью", tone: "ok" };
    case "overpaid":
      return { text: `Переплачено ${formatMoney(-state.balance)}`, tone: "over" };
    case "due":
      return { text: `Осталось выплатить ${formatMoney(state.balance)}`, tone: "due" };
    default:
      // the card's sum is the whole sheet; with the advance of the earlier months taken off the payable sum is another number, and only the chip says it
      return state.carry_used > 0 && state.balance > 0 ? { text: `Осталось выплатить ${formatMoney(state.balance)}`, tone: "due" } : { text: "Не выплачено", tone: "none" };
  }
}

function monthPayoutParts(month: string, teachers: ReadonlyArray<{ payout?: PayoutState | null }>): { head: string; tail: string[] } | null {
  const states = teachers.map((teacher) => normalizePayoutState(teacher.payout)).filter((state): state is PayoutState => state !== null);
  if (states.length === 0) return null;
  const target = states.reduce((total, state) => total + state.target, 0);
  const paid = states.reduce((total, state) => total + state.paid, 0);
  const due = states.reduce((total, state) => total + Math.max(0, state.balance), 0);
  const over = states.reduce((total, state) => total + Math.max(0, -state.balance), 0);
  const tail = [`выплачено ${formatMoney(paid)}`];
  if (due > 0 && paid > 0) tail.push(`осталось выплатить ${formatMoney(due)}`);
  if (over > 0) tail.push(`переплачено ${formatMoney(over)}`);
  return { head: `К выплате за ${monthNameRu(month).toLowerCase()}: ${formatMoney(target)}`, tail };
}

/** The totals of the month as one sentence: «К выплате за октябрь: 600 000 сум · выплачено 475 000 · доплатить 125 000». */
export function monthPayoutText(month: string, teachers: ReadonlyArray<{ payout?: PayoutState | null }>): string | null {
  const parts = monthPayoutParts(month, teachers);
  return parts ? [parts.head, ...parts.tail].join(" · ") : null;
}

/**
 * What the payouts add to the ONE summary line of the month («К выплате за сентябрь: 5 006 248 сум · сохранено 2 из 3 · выплачено 0 сум»):
 * «выплачено 475 000 сум · доплатить 125 000»; null while no sheet has a payout state.
 */
export function monthPayoutTail(teachers: ReadonlyArray<{ payout?: PayoutState | null }>): string | null {
  const parts = monthPayoutParts("2000-01", teachers);
  return parts ? parts.tail.join(" · ") : null;
}

/** The block of a sheet: «К выплате 600 000 · Выплачено 475 000 · Доплатить 125 000» as parts, each with its tone. */
export function sheetPayoutParts(state: PayoutState | null | undefined): Array<{ label: string; value: string; tone: "plain" | "due" | "over" }> {
  // R3 m2 (rule 87): the month that is still open says it ONCE, in the sentence of the server («Месяц открыт: начислено сейчас N, выплачено M, к выплате N−M» - `payoutNote`); the three figures
  // would repeat that sentence word for word
  if (!state || state.basis === "fresh") return [];
  const parts: Array<{ label: string; value: string; tone: "plain" | "due" | "over" }> = [
    { label: "К выплате", value: formatMoney(state.target), tone: "plain" },
    ...(state.carry_used > 0 ? [{ label: "Аванс прошлого месяца", value: formatMoney(state.carry_used), tone: "plain" as const }] : []),
    { label: "Выплачено", value: formatMoney(state.paid), tone: "plain" },
  ];
  if (state.balance > 0) parts.push({ label: "Осталось выплатить", value: formatMoney(state.balance), tone: "due" });
  else if (state.balance < 0) parts.push({ label: "Переплачено", value: formatMoney(-state.balance), tone: "over" });
  return parts;
}

/**
 * The server's sentence under the figures, only when it says what the chip and the figures do not (rel-b3 walk: «Переплачено 25 000» stood
 * three times): a month the advance of the earlier months closed whole.
 */
export function payoutNote(state: PayoutState | null | undefined): string | null {
  if (!state || !state.text) return null;
  // R3 #20: a month that is still open is paid by what is accrued NOW - the sentence of the server says it: «Месяц открыт: начислено сейчас N, выплачено M, к выплате N−M»
  if (state.basis === "fresh") return state.text;
  return state.state === "settled" && state.paid === 0 && state.carry_used > 0 ? state.text : null;
}

export interface SheetHeadline {
  /** The caption over the big number. */
  label: string;
  value: number;
  /** «Сохранено 03.11: 45 000 сум»: the saved sum, small, only where the big number is not it; null otherwise. */
  saved: string | null;
}

/**
 * The big number on top of a sheet (walk of 05.11, D-2).  A CLOSED month is paid by the saved total: «К выплате».  An OPEN month is paid by what is accrued NOW (rule 20 of the server:
 * `payout.basis` is `fresh`), so the saved total is only a stage of it: the big number is «Начислено сейчас» (`payout.fresh_total`) and the saved one is a small line - never a «К выплате».
 * While the owner has unsaved edits the total is the table's («Итог с правками»), as it always was.  Nothing is told by dates here: the state of the month is the server's field.
 */
export function sheetHeadline(input: { total: number; dirty: boolean; payout: Partial<PayoutState> | null | undefined; updatedAt: string | null | undefined }): SheetHeadline {
  const state = normalizePayoutState(input.payout);
  if (!state || state.basis !== "fresh" || state.fresh_total === null) return { label: "К выплате", value: input.total, saved: null };
  if (input.dirty) return { label: "Итог с правками", value: input.total, saved: null };
  if (state.changed_by === 0) return { label: "Начислено сейчас", value: state.fresh_total, saved: null };
  const day = formatUtcNaiveAsBusinessDateTime(input.updatedAt).split(" ")[0] ?? "";
  const on = /^\d{2}\.\d{2}\./.test(day) ? ` ${day.slice(0, 5)}` : "";
  return { label: "Начислено сейчас", value: state.fresh_total, saved: `Сохранено${on}: ${formatMoney(state.saved_total)}` };
}

/** The facts that describe the SAVED sheet (not the rate in force): what was counted, what is without pay, what waits for a decision. */
const SAVED_FACT = /^(засчитано|без оплаты|не решено)/;

/**
 * The line of facts of an OPEN month's card (walk of 05.11, 4б): the big number is what is accrued now, and the counts under it belong to the SAVED sheet - so they stand in its brackets:
 * «Сохранено 03.11: 45 000 сум (засчитано 3 посещения) · Ставка: Группа 50%».  The rate is the one in force, it stays outside.
 */
export function savedFactsLine(saved: string, facts: ReadonlyArray<string>): string {
  const counted = facts.filter((fact) => SAVED_FACT.test(fact));
  const rest = facts.filter((fact) => !SAVED_FACT.test(fact));
  return [counted.length > 0 ? `${saved} (${counted.join(", ")})` : saved, ...rest].join(" · ");
}

/**
 * What kind of payout a line of the history is (walk of 05.11, 4а): the line says the KIND («аванс» - the payout goes beyond what the month asks for), never the state of the month - the state is
 * the chip's word («Выплачено полностью», «Переплачено …»).  A payout is walked in the order it was made: the part that lies above `target` is the advance.  null: an ordinary payout.
 */
export function payoutKindMark(state: Pick<PayoutState, "items" | "target">, item: Pick<PayoutOut, "id">): string | null {
  let before = 0;
  for (const payout of state.items) {
    if (payout.voided_at) continue;
    if (payout.id === item.id) {
      if (before >= state.target) return "аванс";
      return before + payout.amount > state.target ? "с авансом" : null;
    }
    before += payout.amount;
  }
  return null;
}

/** Money-1 A1b: the one button of a sheet whose data moved after the saving (it was «Пересчитать»): the new version holds the fresh numbers. */
export const RESAVE_LABEL = "Пересохранить";

/**
 * Money-1 A1b: the data of a saved sheet moved after the saving (a late payment, a mark corrected): «изменилось на +125 000».  The payout does not move with it - the sheet
 * waits for «Пересохранить».  0 / absent: nothing to say.
 */
export function payoutChangedBy(state: Pick<PayoutState, "changed_by"> | null | undefined): number {
  return state?.changed_by ?? 0;
}

/** The short line of the month list under the payout chip: «изменилось на +125 000» (the long sentence of the server is its tooltip). */
export function payoutChangeLine(state: Pick<PayoutState, "changed_by" | "change_text"> | null | undefined): { text: string; title: string | null } | null {
  const delta = payoutChangedBy(state);
  if (delta === 0) return null;
  return { text: `изменилось на ${formatSignedMoney(delta)}`, title: state?.change_text ?? null };
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
  return { amount: amount === null ? "" : formatMoneyInput(amount), paidOn: today, method: null, note: "" };
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

/** `confirmedOverpay`: the sum of the server's question the owner answered «Записать как аванс» to (MN-32, R3 7); never sent by default. */
export function buildPayoutBody(values: PayoutFormValues, confirmedOverpay: number | null = null): PayoutCreate {
  const body: PayoutCreate = { amount: parseMoneyInput(values.amount) ?? 0, paid_on: values.paidOn, method: values.method ?? "other" };
  const note = values.note.trim();
  if (note) body.note = note;
  if (confirmedOverpay !== null) { body.confirm_overpay = true; body.overpay = confirmedOverpay; }
  return body;
}

/** MN-32: the question of the window when the SERVER says the payout is above the balance (it counts the balance under the lock of the sheet, the screen may be stale). */
export function payoutOverpayQuestion(overpay: number, basis: PayoutState["basis"] = "saved"): string {
  // an open month is paid by what is accrued now (R3 #20): the payout above it is an advance on what the month has not earned yet
  return basis === "fresh"
    ? `Выплата больше начисленного сейчас на ${formatMoney(overpay)} — записать как аванс?`
    : `Выплата больше остатка на ${formatMoney(overpay)} — записать как аванс?`;
}

export const PAYOUT_ADVANCE_LABEL = "Записать как аванс";
/** R3 3: under the question of the window - what the advance does.  A CLOSED month hands the advance on as it is. */
export const PAYOUT_ADVANCE_HINT = "Аванс уменьшит выплату следующего месяца";
/** An OPEN month is paid by what is accrued now and hands nothing on yet (`advance_out = 0`): only what is left of the overpay at the END of the month goes on. */
export const PAYOUT_ADVANCE_HINT_OPEN = "Месяц ещё идёт: если к его концу начислится меньше выплаченного, разница уменьшит выплату следующего месяца";

/** The hint under the question about an overpay, by the basis of the payout state (R3 #20): `fresh` - the month is open, otherwise it is closed. */
export function payoutAdvanceHint(basis: PayoutState["basis"] | null | undefined): string {
  return basis === "fresh" ? PAYOUT_ADVANCE_HINT_OPEN : PAYOUT_ADVANCE_HINT;
}

/**
 * Under the chip of a sheet: only what the chip and the card do not say, and no number twice (walk of 05.11, D-3, rule 87).
 * The advance of the earlier months is named with its sum (nothing else on the screen says it); the overpay of a CLOSED month is already in the chip, so the line says only what
 * happens to it («Переплата зачтётся в выплате следующего месяца»), and the sum is repeated only when it is not the chip's (the advance then includes what is left of earlier ones).
 * An OPEN month hands nothing on yet: the overpay may still be earned back.  Empty when there is nothing to add.
 */
export function advanceLines(state: PayoutState | null | undefined): string[] {
  if (!state) return [];
  const lines: string[] = [];
  if (state.carry_used > 0) {
    const whole = state.state === "settled" && state.paid === 0;
    lines.push(`Аванс прошлого месяца: ${formatMoney(state.carry_used)} — зачтён${whole ? " целиком" : ", к выплате меньше на эту сумму"}`);
  }
  if (state.basis === "fresh") {
    if (state.state === "overpaid") lines.push(PAYOUT_ADVANCE_HINT_OPEN);
  } else if (state.advance_out > 0) {
    lines.push(state.state === "overpaid" && state.advance_out === -state.balance
      ? "Переплата зачтётся в выплате следующего месяца"
      : `Аванс ${formatMoney(state.advance_out)} зачтётся в выплате следующего месяца`);
  }
  return lines;
}

/** Under the amount: what is left after this payout («Останется выплатить 125 000 сум» / «Выплачено полностью»). */
export function payoutAfterText(amount: number | null, state: PayoutState | null | undefined): string {
  if (amount === null || amount < 1 || !state) return "";
  const rest = Math.max(state.balance, 0) - amount;      // as the server's question: an earlier overpay is not «left to pay» (rel-b3 walk)
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

export type PayoutErrorKind = "overpay_confirm" | "duplicate" | "not_saved" | "already_voided" | "amount_range" | "paid_on_range" | "method_required" | "reason_required" | "other";

const PAYOUT_ERROR: Record<string, PayoutErrorKind> = {
  OVERPAY_CONFIRM_REQUIRED: "overpay_confirm",
  DUPLICATE_PAYOUT: "duplicate",
  SHEET_NOT_SAVED: "not_saved",
  ALREADY_VOIDED: "already_voided",
  AMOUNT_RANGE: "amount_range",
  PAID_ON_RANGE: "paid_on_range",
  METHOD_REQUIRED: "method_required",
  REASON_REQUIRED: "reason_required",
};

export function payoutError(error: PayrollErrorLike | null | undefined): { kind: PayoutErrorKind; message: string; overpay: number | null } {
  const code = error?.code ?? (error?.detail as { code?: string } | null | undefined)?.code;
  const message = (error?.message || "Не удалось выполнить действие").replace(/[.\s]+$/, "");
  const kind = (code && PAYOUT_ERROR[code]) || "other";
  const extra = (error?.detail as { overpay?: unknown } | null | undefined)?.overpay;
  return { kind, message, overpay: kind === "overpay_confirm" && typeof extra === "number" && extra > 0 ? extra : null };
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
  /** Money-1 A3: only the answer of a change - the saved sheets from `valid_from` that now differ from what was saved (`lib/money-effects.ts`). */
  money_effects?: unknown;
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

/** «октября 2026» after «с»: the title of the month in the genitive («С октября 2026»). */
export function monthWordGenitive(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return `${MONTHS_GENITIVE[index] ?? month} ${month.slice(0, 4)}`;
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

/** 422 `LINE_NOT_FOUND`: a ticked line is not on the sheet any more (the data moved): the page reads the sheet again. */
export const LINE_NOT_FOUND_TEXT = "Строка ведомости изменилась — обновите страницу";

export function isLineNotFound(error: PayrollErrorLike | null | undefined): boolean {
  return error?.code === "LINE_NOT_FOUND";
}

export function isFingerprintRequired(error: PayrollErrorLike | null | undefined): boolean {
  return error?.code === "FINGERPRINT_REQUIRED";
}

/** The first problem of a payroll error of the LOGIC-A routes, in words (the fingerprint has its own, the rest are the server's). */
export function payrollLogicaErrorText(error: PayrollErrorLike | null | undefined): string | null {
  if (isFingerprintRequired(error)) return FINGERPRINT_REQUIRED_TEXT;
  if (error?.code === "DIVISOR_RANGE") return error.message || "Делитель: от 1 до 31";
  return null;
}
