/**
 * LOGIC-A («деньги»): what the front knows about the opening balance of a membership, a pause, leaving / archiving with the
 * money settled, the money effect of a price change, the change of the billing mode, and a payment of a student who has left.
 * Contract: `tests/fixtures/logicA` (the frozen `logicA_contract.json` of the backend).
 *
 * The owner's vocabulary of 21.10 runs through every sentence: «Стоимость» (not «Начисление»), «Баланс» («Долг N» / «Аванс N» / «0»),
 * «Простить долг» / «Прощено».  The sentences that are about a calculation of the server (`PayoutState.text`, the summary of a
 * preview) are the server's; everything else is arranged here.  Pure: no React, no network.
 */
import {
  addDays,
  daysBetween,
  formatDateRu,
  formatMoney,
  isIsoDate,
  MAX_MONEY,
  parseMoneyInput,
  REASON_MAX,
  REASON_MIN,
  type MembershipPaymentRow,
  type PayMethod,
  type PaymentPreview,
} from "./payments";
import { daysLabel, pluralRu } from "./plural";

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};
const arr = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const dm = (iso: string): string => formatDateRu(iso).slice(0, 5);

// ── Shared: the money effect of a change of one membership ─────────────────

/** `ImpactMoney`: the ledger of the membership before and after the change, on the same day. */
export interface ImpactMoney {
  debt_before: number;
  debt_after: number;
  advance_before: number;
  advance_after: number;
  paid_until_before: string | null;
  paid_until_after: string | null;
  charged_delta: number;
  refundable_before: number;
  refundable_after: number;
}

export function normalizeImpact(raw: Partial<ImpactMoney> | null | undefined): ImpactMoney | null {
  if (!raw) return null;
  return {
    debt_before: num(raw.debt_before),
    debt_after: num(raw.debt_after),
    advance_before: num(raw.advance_before),
    advance_after: num(raw.advance_after),
    paid_until_before: raw.paid_until_before ?? null,
    paid_until_after: raw.paid_until_after ?? null,
    charged_delta: num(raw.charged_delta),
    refundable_before: num(raw.refundable_before),
    refundable_after: num(raw.refundable_after),
  };
}

/** «Баланс: долг 213 000 сум» / «аванс 80 000 сум» / «0» from a debt and an advance. */
export function balanceWords(debt: number, advance: number): string {
  if (debt > 0) return `долг ${formatMoney(debt)}`;
  if (advance > 0) return `аванс ${formatMoney(advance)}`;
  return "0";
}

/** «Баланс: долг 20 000 сум → аванс 80 000 сум»; "" when nothing moves. */
export function impactBalanceLine(impact: ImpactMoney | null | undefined): string {
  if (!impact) return "";
  const before = balanceWords(impact.debt_before, impact.advance_before);
  const after = balanceWords(impact.debt_after, impact.advance_after);
  return before === after ? "" : `Баланс: ${before} → ${after}`;
}

/** «Оплачено до: 30.10.2026 → 03.11.2026»; "" when it does not move. */
export function impactPaidUntilLine(impact: ImpactMoney | null | undefined): string {
  if (!impact || impact.paid_until_after === impact.paid_until_before || !impact.paid_until_after) return "";
  return `Оплачено до: ${impact.paid_until_before ? `${formatDateRu(impact.paid_until_before)} → ` : ""}${formatDateRu(impact.paid_until_after)}`;
}

// ── Errors of the LOGIC-A routes ───────────────────────────────────────────

export interface FreshBalance {
  membership_id: string;
  debt: number;
  advance: number;
  refundable: number;
}

export interface LogicaError {
  code: string | null;
  /** The server's own Russian text. */
  message: string;
  dates: string[];
  students: Array<{ membership_id: string; student_name: string }>;
  fresh: FreshBalance[];
  debt: number | null;
  payoutId: string | null;
}

/** The refusal of a LOGIC-A call in one shape: the code, the server's words and the lists some codes carry. */
export function logicaError(error: unknown, fallback = "Не удалось выполнить действие"): LogicaError {
  const e = (error ?? {}) as { message?: string; code?: string; detail?: Record<string, unknown> | string | null };
  const detail = e.detail && typeof e.detail === "object" ? e.detail : null;
  const code = (e.code ?? (detail?.code as string | undefined) ?? null) || null;
  const message = String((detail?.message as string | undefined) || e.message || fallback).replace(/[.\s]+$/, "");
  return {
    code,
    message,
    dates: arr<string>(detail?.dates),
    students: arr<{ membership_id: string; student_name: string }>(detail?.students),
    fresh: arr<FreshBalance>(detail?.fresh).map((item) => ({ membership_id: String(item.membership_id), debt: num(item.debt), advance: num(item.advance), refundable: num(item.refundable) })),
    debt: detail?.debt === null || detail?.debt === undefined ? null : num(detail.debt),
    payoutId: (detail?.payout_id as string | null | undefined) ?? null,
  };
}

// ── Decision 1: opening balance («остаток на начало») ───────────────────────

/** The live opening balance (`OpeningOut`). */
export interface OpeningOut {
  id: string;
  membership_id: string;
  paid_until: string | null;
  debt_amount: number | null;
  debt_on: string | null;
  note: string | null;
  source: "import" | "manual" | "add";
  created_by_name: string | null;
  created_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
}

/** Body of «Добавить ученика» (`OpeningIn`) and of the PUT (`OpeningPut`: + note and reason). */
export interface OpeningIn {
  paid_until?: string | null;
  debt_amount?: number | null;
  debt_on?: string | null;
}

export interface OpeningPut extends OpeningIn {
  note?: string | null;
  reason?: string | null;
}

export interface OpeningSaved {
  opening: OpeningOut | null;
  impact: ImpactMoney | null;
  dry_run: boolean;
  row: MembershipPaymentRow | null;
}

export interface OpeningVoided {
  opening: OpeningOut;
  impact: ImpactMoney | null;
  row: MembershipPaymentRow | null;
}

export interface OpeningFormValues {
  /** `YYYY-MM-DD` or "". */
  paidUntil: string;
  /** Digits with separators, as typed. */
  debt: string;
  /** `YYYY-MM-DD` or "". */
  debtOn: string;
  note: string;
  /** Required by the server when a replacement happens over money already taken (`REASON_REQUIRED`). */
  reason: string;
}

export const OPENING_TITLE = "Остаток на начало учёта";
export const OPENING_PAID_UNTIL_LABEL = "Оплачено до";
export const OPENING_PAID_UNTIL_HINT = "Ученик уже заплатил до этой даты — до запуска в ALGO. Эти дни не начисляются и не превращаются в аванс.";
export const OPENING_DEBT_LABEL = "Долг на начало, сум";
export const OPENING_DEBT_ON_LABEL = "Долг на дату";
export const OPENING_DEBT_HINT = "Сколько ученик был должен до запуска в ALGO.";
export const OPENING_NOTE_MAX = 300;
export const OPENING_MIN_DATE = "2020-01-01";

export function emptyOpeningValues(): OpeningFormValues {
  return { paidUntil: "", debt: "", debtOn: "", note: "", reason: "" };
}

/** The form of an existing opening balance (the card edits it). */
export function openingValuesFrom(opening: { paid_until?: string | null; debt_amount?: number | null; debt_on?: string | null; note?: string | null } | null | undefined): OpeningFormValues {
  if (!opening) return emptyOpeningValues();
  return {
    paidUntil: opening.paid_until ?? "",
    debt: opening.debt_amount ? String(opening.debt_amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ") : "",
    debtOn: opening.debt_on ?? "",
    note: opening.note ?? "",
    reason: "",
  };
}

/** Nothing typed: «Добавить ученика» sends no opening, the card's PUT voids the live one. */
export function openingIsEmpty(values: Pick<OpeningFormValues, "paidUntil" | "debt" | "debtOn">): boolean {
  return !values.paidUntil && parseMoneyInput(values.debt) === null && !values.debtOn;
}

export interface OpeningContext {
  /** The day the membership starts (the enrolment): «Оплачено до» is not earlier, «Долг на дату» not later. */
  enrolDate: string;
  accountingStart?: string | null;
  today: string;
}

/** The latest «Оплачено до» the server accepts: today + 366 days. */
export function openingPaidUntilMax(today: string): string {
  return addDays(today, 366);
}

/** The first problem of the form, in words; null when it may be sent (an empty form is fine: there is nothing to record). */
export function validateOpening(values: OpeningFormValues, context: OpeningContext): string | null {
  if (openingIsEmpty(values)) return null;
  const debt = parseMoneyInput(values.debt);
  if (values.paidUntil) {
    if (!isIsoDate(values.paidUntil)) return "Укажите дату «Оплачено до»";
    const floor = context.accountingStart && context.accountingStart > context.enrolDate ? context.accountingStart : context.enrolDate;
    if (values.paidUntil < floor) return `«Оплачено до» не раньше ${formatDateRu(floor)}: даты зачисления и начала учёта`;
    if (values.paidUntil > openingPaidUntilMax(context.today)) return "«Оплачено до» — не дальше чем на год вперёд";
  }
  if (debt !== null || values.debtOn) {
    if (debt === null) return "Укажите сумму долга или очистите дату долга";
    if (debt < 1) return "Долг должен быть больше нуля";
    if (debt > MAX_MONEY) return "Сумма долга слишком большая";
    if (!isIsoDate(values.debtOn)) return "Укажите, на какую дату был долг";
    if (values.debtOn < OPENING_MIN_DATE) return "Дата долга не раньше 01.01.2020";
    if (values.debtOn > context.enrolDate) return `«Долг на дату» — не позже дня зачисления (${formatDateRu(context.enrolDate)})`;
  }
  if (values.note.trim().length > OPENING_NOTE_MAX) return `Примечание не длиннее ${OPENING_NOTE_MAX} символов`;
  if (values.reason.trim().length > REASON_MAX) return `Причина не длиннее ${REASON_MAX} символов`;
  return null;
}

/** `OpeningIn` for «Добавить ученика» (null when nothing was typed). */
export function buildOpeningIn(values: OpeningFormValues): OpeningIn | null {
  if (openingIsEmpty(values)) return null;
  const debt = parseMoneyInput(values.debt);
  return {
    paid_until: values.paidUntil || null,
    debt_amount: debt !== null && debt > 0 ? debt : null,
    debt_on: debt !== null && debt > 0 ? values.debtOn || null : null,
  };
}

/** `OpeningPut`: all three empty = the live one is voided (the server needs the reason when money was taken). */
export function buildOpeningPut(values: OpeningFormValues): OpeningPut {
  const base = buildOpeningIn(values) ?? { paid_until: null, debt_amount: null, debt_on: null };
  const body: OpeningPut = { ...base };
  const note = values.note.trim();
  if (note) body.note = note;
  const reason = values.reason.trim();
  if (reason) body.reason = reason;
  return body;
}

/**
 * The live line under the fields: «Стоимость считается с 01.11. Оплачено до 31.10. Долг на начало: 250 000 сум.»
 * The cost of the study is counted from the day after «Оплачено до», or from the enrolment.
 */
export function openingLine(values: OpeningFormValues, context: Pick<OpeningContext, "enrolDate">): string {
  if (openingIsEmpty(values)) return "";
  const parts: string[] = [];
  const from = values.paidUntil && isIsoDate(values.paidUntil) ? addDays(values.paidUntil, 1) : context.enrolDate;
  parts.push(`Стоимость считается с ${dm(from)}.`);
  if (values.paidUntil && isIsoDate(values.paidUntil)) parts.push(`Оплачено до ${dm(values.paidUntil)}.`);
  const debt = parseMoneyInput(values.debt);
  if (debt !== null && debt > 0) parts.push(`Долг на начало: ${formatMoney(debt)}${values.debtOn && isIsoDate(values.debtOn) ? ` на ${dm(values.debtOn)}` : ""}.`);
  return parts.join(" ");
}

/** The summary of a live opening for the card: «Оплачено до 31.10.2026 (до ALGO) · долг на начало 250 000 сум на 30.09.2026». */
export function openingSummary(opening: { paid_until?: string | null; debt_amount?: number | null; debt_on?: string | null } | null | undefined): string {
  if (!opening) return "";
  const parts: string[] = [];
  if (opening.paid_until) parts.push(`оплачено до ${formatDateRu(opening.paid_until)} (до ALGO)`);
  if (opening.debt_amount) parts.push(`долг на начало ${formatMoney(opening.debt_amount)}${opening.debt_on ? ` на ${formatDateRu(opening.debt_on)}` : ""}`);
  const text = parts.join(" · ");
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
}

/** What the change does to the money of the membership, line by line (the preview of the PUT and the answer of the void). */
export function openingImpactLines(impact: ImpactMoney | null | undefined): string[] {
  const lines = [impactBalanceLine(impact), impactPaidUntilLine(impact)].filter(Boolean);
  if (impact && impact.charged_delta !== 0) lines.push(`Стоимость: ${impact.charged_delta < 0 ? "−" : "+"}${formatMoney(Math.abs(impact.charged_delta))}`);
  return lines;
}

// ── Decision 2: pause ───────────────────────────────────────────────────────

export const PAUSE_BACKDATE_DAYS = 30;
export const PAUSE_MAX_DAYS = 366;
export const PAUSE_REASON_MAX = 300;

export interface PauseOut {
  id: string;
  membership_id: string;
  first_day: string;
  last_day: string;
  days: number;
  reason: string | null;
  created_by_name: string | null;
  created_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
}

export interface PauseLessonMark {
  date: string;
  marks: string | null;
}

export interface PauseSaved {
  pause: PauseOut;
  impact: ImpactMoney | null;
  lessons: { excluded: PauseLessonMark[]; attended: PauseLessonMark[] };
  /** Owner only: the months whose saved sheet goes «Есть изменения». */
  payroll: { months: string[]; saved_sheets_changed: number } | null;
  dry_run: boolean;
  row: MembershipPaymentRow | null;
}

export interface PauseVoided {
  pause: PauseOut;
  impact: ImpactMoney | null;
  row: MembershipPaymentRow | null;
}

export interface PauseFormValues {
  first: string;
  last: string;
  reason: string;
}

export function emptyPauseValues(today: string): PauseFormValues {
  return { first: today, last: "", reason: "" };
}

/** The earliest day a pause may start (today − 30 days). */
export function pauseEarliest(today: string): string {
  return addDays(today, -PAUSE_BACKDATE_DAYS);
}

/** «Задним числом — не больше 30 дней: с 21.09.2026». */
export function pauseBackdateHint(today: string): string {
  return `Задним числом можно не больше ${PAUSE_BACKDATE_DAYS} дней — не раньше ${formatDateRu(pauseEarliest(today))}`;
}

/** Number of days of a pause, both ends included (0 for a broken range). */
export function pauseDays(first: string, last: string): number {
  if (!isIsoDate(first) || !isIsoDate(last) || last < first) return 0;
  return daysBetween(first, last) + 1;
}

export function validatePause(values: PauseFormValues, today: string): string | null {
  if (!isIsoDate(values.first)) return "Укажите, с какого дня пауза";
  if (!isIsoDate(values.last)) return "Укажите, по какой день пауза";
  if (values.last < values.first) return "Пауза заканчивается раньше, чем начинается";
  if (values.first < pauseEarliest(today)) return `Пауза начинается не раньше чем ${PAUSE_BACKDATE_DAYS} дней назад (${formatDateRu(pauseEarliest(today))})`;
  if (pauseDays(values.first, values.last) > PAUSE_MAX_DAYS) return `Пауза не длиннее ${PAUSE_MAX_DAYS} дней`;
  if (values.reason.trim().length > PAUSE_REASON_MAX) return `Причина не длиннее ${PAUSE_REASON_MAX} символов`;
  return null;
}

export function buildPauseBody(values: PauseFormValues): { first_day: string; last_day: string; reason?: string } {
  const body: { first_day: string; last_day: string; reason?: string } = { first_day: values.first, last_day: values.last };
  const reason = values.reason.trim();
  if (reason) body.reason = reason;
  return body;
}

/**
 * The calculation under the form (the server's dry run): «За паузу не начисляется 10 дней: −200 000 сум. Место в группе сохраняется.
 * Оплачено до станет 09.11.» — the money part only for a role that sees money (`impact` is null otherwise).
 */
export function pauseCalcLines(saved: Pick<PauseSaved, "pause" | "impact"> | null | undefined): string[] {
  if (!saved) return [];
  const { pause, impact } = saved;
  const days = pause.days || pauseDays(pause.first_day, pause.last_day);
  const head = impact && impact.charged_delta !== 0
    ? `За паузу не начисляется ${daysLabel(days)}: ${impact.charged_delta < 0 ? "−" : "+"}${formatMoney(Math.abs(impact.charged_delta))}.`
    : `За паузу не начисляется ${daysLabel(days)}.`;
  const lines = [`${head} Место в группе сохраняется.`];
  if (impact && impact.paid_until_after && impact.paid_until_after !== impact.paid_until_before) lines.push(`Оплачено до станет ${dm(impact.paid_until_after)}.`);
  const balance = impactBalanceLine(impact);
  if (balance) lines.push(balance);
  return lines;
}

/** The warnings of a pause: a backdated one (lessons are not counted for anybody), attended lessons, the saved payroll sheets. */
export function pauseWarnings(saved: Pick<PauseSaved, "pause" | "lessons" | "payroll"> | null | undefined, today: string): string[] {
  if (!saved) return [];
  const out: string[] = [];
  const { pause } = saved;
  if (pause.first_day < today) {
    out.push(`Пауза задним числом: уроки с ${dm(pause.first_day)} по ${dm(pause.last_day < today ? pause.last_day : addDays(today, -1))} не будут засчитаны ни ученику, ни преподавателю`);
  }
  const attended = arr<PauseLessonMark>(saved.lessons?.attended);
  if (attended.length > 0) out.push(attendedText(attended.map((item) => item.date)));
  const changed = saved.payroll?.saved_sheets_changed ?? 0;
  if (changed > 0) {
    out.push(`Ведомость за ${arr<string>(saved.payroll?.months).map(monthWordShort).join(", ") || "месяц"} покажет «Есть изменения»`);
  }
  return out;
}

const MONTHS_GEN = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
function monthWordShort(key: string): string {
  return MONTHS_GEN[Number(key.slice(5, 7)) - 1] ?? key;
}

/** «Ученик был отмечен на уроках 12.10, 14.10 — на эти даты паузу поставить нельзя». */
export function attendedText(dates: string[]): string {
  return `Ученик был отмечен на уроках ${dates.map(dm).join(", ")} — на эти даты паузу поставить нельзя`;
}

/** «На паузе до 20.10» — the chip of a list and of the card. */
export function pausedChipText(paused: { from: string; to: string } | null | undefined): string {
  return paused?.to ? `На паузе до ${dm(paused.to)}` : "На паузе";
}

/** A pause that is on today («Закончить паузу» shortens it to yesterday) vs one that has not begun («Отменить паузу»). */
export function pauseEndAction(pause: Pick<PauseOut, "first_day" | "last_day">, today: string): "end" | "cancel" | null {
  if (pause.last_day < today) return null;
  return pause.first_day < today ? "end" : "cancel";
}

/** The day a running pause is shortened to: yesterday. */
export function pauseEndDay(today: string): string {
  return addDays(today, -1);
}

/** The pauses worth listing in the dialog: not cancelled, the freshest first. */
export function livePauses(list: PauseOut[] | null | undefined): PauseOut[] {
  return arr<PauseOut>(list).filter((pause) => !pause.voided_at).sort((a, b) => (a.first_day < b.first_day ? 1 : -1));
}

/** «с 11.10 по 20.10 · 10 дней · уехал к родственникам». */
export function pauseLine(pause: Pick<PauseOut, "first_day" | "last_day" | "days" | "reason">): string {
  const days = pause.days || pauseDays(pause.first_day, pause.last_day);
  return `с ${dm(pause.first_day)} по ${dm(pause.last_day)} · ${daysLabel(days)}${pause.reason ? ` · ${pause.reason}` : ""}`;
}

// ── F9: leaving a group / archive with the money settled ───────────────────

export type SettleAction = "keep" | "writeoff" | "refund";

export interface LeaveMoney {
  debt: number;
  advance: number;
  refundable: number;
  paid_until: string | null;
  charged_after_leave: number;
  individual_price_ends: boolean;
}

export interface LeaveMembership {
  membership_id: string;
  group_id: string;
  group_name: string;
  /** Null for a role that does not see money: the dialog only says there are settlements. */
  money: LeaveMoney | null;
  has_open_balance: boolean;
  allowed: SettleAction[];
}

export interface LeavePreview {
  as_of: string;
  memberships: LeaveMembership[];
}

export interface SettleItem {
  membership_id: string;
  action: SettleAction;
  expected_debt?: number | null;
  expected_refundable?: number | null;
  method?: Exclude<PayMethod, "unknown"> | null;
  reason?: string | null;
}

export interface SettledOut {
  membership_id: string;
  action: SettleAction;
  amount: number;
  refund_id: string | null;
  writeoff_id: string | null;
}

export function normalizeLeavePreview(raw: unknown): LeavePreview {
  const data = (raw ?? {}) as Partial<LeavePreview>;
  return {
    as_of: String(data.as_of ?? ""),
    memberships: arr<LeaveMembership>(data.memberships).map((item) => ({
      membership_id: String(item.membership_id),
      group_id: String(item.group_id),
      group_name: String(item.group_name ?? ""),
      money: item.money
        ? {
            debt: num(item.money.debt),
            advance: num(item.money.advance),
            refundable: num(item.money.refundable),
            paid_until: item.money.paid_until ?? null,
            charged_after_leave: num(item.money.charged_after_leave),
            individual_price_ends: Boolean(item.money.individual_price_ends),
          }
        : null,
      has_open_balance: Boolean(item.has_open_balance),
      allowed: arr<SettleAction>(item.allowed).length > 0 ? arr<SettleAction>(item.allowed) : ["keep"],
    })),
  };
}

/** The choice of the owner for one membership (the dialog starts from «keep»). */
export interface SettleChoice {
  action: SettleAction;
  /** «Вернуть аванс»: how the money was given back. */
  method: Exclude<PayMethod, "unknown"> | null;
  /** «Простить долг»: the reason, 3..500 characters. */
  reason: string;
}

export function defaultSettleChoice(): SettleChoice {
  return { action: "keep", method: null, reason: "" };
}

/** What the dialog says for one membership — the three blocks of the spec and the two without money. */
export type SettleKind = "none" | "hidden" | "debt" | "advance";

export function settleKind(membership: LeaveMembership): SettleKind {
  if (!membership.money) return membership.has_open_balance ? "hidden" : "none";
  if (membership.money.debt > 0) return "debt";
  if (membership.money.refundable > 0 || membership.money.advance > 0) return "advance";
  return "none";
}

/** «После ухода у ученика долг 120 000 сум.» / «После ухода у ученика аванс 135 000 сум. Что сделать?» / «Расчётов нет — можно убирать» / … */
export function settleHeadline(membership: LeaveMembership): string {
  switch (settleKind(membership)) {
    case "debt":
      return `После ухода у ученика долг ${formatMoney(membership.money!.debt)}.`;
    case "advance":
      return `После ухода у ученика аванс ${formatMoney(membership.money!.advance)}. Что сделать?`;
    case "hidden":
      return "У ученика есть расчёты по оплате — их видит владелец";
    default:
      return "Расчётов нет — можно убирать";
  }
}

export const SETTLE_LABEL = {
  keepDebt: "Оставить долг — оплатить его можно и после ухода",
  forgive: "Простить долг",
  keepAdvance: "Оставить аванс на счёте",
  refund: (amount: number) => `Вернуть ${formatMoney(amount)}`,
} as const;

/** The first problem of the choices (a reason for a forgiven debt, a method for a refund); null when the dialog may go on. */
export function validateSettle(preview: LeavePreview | null, choices: Record<string, SettleChoice>): string | null {
  for (const membership of preview?.memberships ?? []) {
    const choice = choices[membership.membership_id] ?? defaultSettleChoice();
    if (choice.action === "writeoff") {
      const reason = choice.reason.trim();
      if (reason.length < REASON_MIN) return `${membership.group_name}: укажите причину прощения долга (не короче ${REASON_MIN} символов)`;
      if (reason.length > REASON_MAX) return `${membership.group_name}: причина не длиннее ${REASON_MAX} символов`;
    }
    if (choice.action === "refund" && !choice.method) return `${membership.group_name}: выберите, как вернули деньги`;
  }
  return null;
}

/** `settle[]` of the request: what the owner saw (`expected_*`) goes along, so a payment that came in between is caught (409 `BALANCE_CHANGED`). */
export function buildSettle(preview: LeavePreview | null, choices: Record<string, SettleChoice>): SettleItem[] {
  const out: SettleItem[] = [];
  for (const membership of preview?.memberships ?? []) {
    if (!membership.money) continue;
    const choice = choices[membership.membership_id] ?? defaultSettleChoice();
    if (choice.action === "refund" && membership.money.refundable > 0) {
      out.push({ membership_id: membership.membership_id, action: "refund", expected_refundable: membership.money.refundable, method: choice.method });
    } else if (choice.action === "writeoff" && membership.money.debt > 0) {
      out.push({ membership_id: membership.membership_id, action: "writeoff", expected_debt: membership.money.debt, reason: choice.reason.trim() });
    } else if (membership.money.debt > 0 || membership.money.refundable > 0) {
      out.push({ membership_id: membership.membership_id, action: "keep" });
    }
  }
  return out;
}

/** A refreshed preview after `BALANCE_CHANGED`: the fresh numbers replace the old ones, the choices that no longer fit fall back to «keep». */
export function applyFreshBalances(preview: LeavePreview, fresh: FreshBalance[]): { preview: LeavePreview; reset: string[] } {
  const reset: string[] = [];
  const memberships = preview.memberships.map((membership) => {
    const next = fresh.find((item) => item.membership_id === membership.membership_id);
    if (!next || !membership.money) return membership;
    reset.push(membership.membership_id);
    return { ...membership, money: { ...membership.money, debt: next.debt, advance: next.advance, refundable: next.refundable }, has_open_balance: next.debt > 0 || next.advance > 0 };
  });
  return { preview: { ...preview, memberships }, reset };
}

export const BALANCE_CHANGED_TEXT = "Данные оплат изменились — проверьте суммы";

/** «Возвращено 135 000 сум» / «Долг 120 000 сум прощён» — the toast lines after a settled leave. */
export function settledLines(settled: SettledOut[] | null | undefined, groupNames: Record<string, string> = {}): string[] {
  return arr<SettledOut>(settled)
    .filter((item) => item.action !== "keep" && item.amount > 0)
    .map((item) => {
      const where = groupNames[item.membership_id] ? ` (${groupNames[item.membership_id]})` : "";
      return item.action === "refund" ? `Возвращено ${formatMoney(item.amount)}${where}` : `Долг ${formatMoney(item.amount)} прощён${where}`;
    });
}

/** «Индивидуальная цена закончится: в этой группе ученик вернётся по цене группы» (F13). */
export const INDIVIDUAL_PRICE_ENDS_TEXT = "Индивидуальная цена закончится вместе с группой: при возвращении ученик платит по цене группы";

// ── A payment of a student who has left (S-5): at most the debt ────────────

/** The preview of a closed membership says so with this warning (`left_debt_only`). */
export function isLeftDebtOnly(preview: Pick<PaymentPreview, "warnings"> | null | undefined): boolean {
  return Boolean(preview?.warnings?.some((warning) => warning.code === "left_debt_only"));
}

/** «Ученик ушёл: можно оплатить только долг». */
export const LEFT_DEBT_ONLY_TEXT = "Ученик ушёл: можно оплатить только долг";

/** The cap of a payment of a left student: the debt (0 = nothing to pay). */
export function leftPaymentProblem(amount: number | null, debt: number): string | null {
  if (debt <= 0) return "Ученик ушёл, долга нет: принимать нечего";
  if (amount !== null && amount > debt) return `Ученик ушёл: принять можно не больше долга ${formatMoney(debt)}`;
  return null;
}

/** A closed membership (or an archived student) that still owes: the card offers «Внести оплату долга». */
export function canPayLeftDebt(row: Pick<MembershipPaymentRow, "is_active" | "debt">, archived = false): boolean {
  return (!row.is_active || archived) && num(row.debt) > 0;
}

// ── Decision 4: price backdating and the impact window ─────────────────────

export interface PriceImpactItem {
  membership_id: string;
  student_name: string;
  debt_before: number;
  debt_after: number;
  advance_before: number;
  advance_after: number;
  paid_until_before: string | null;
  paid_until_after: string | null;
  has_money: boolean;
}

export interface PriceImpactMoney {
  memberships_with_new_debt: number;
  debt_delta: number;
  memberships_with_less_advance: number;
  advance_delta: number;
  days_lost_total: number;
  backdated: boolean;
  items: PriceImpactItem[];
}

export function normalizePriceMoney(raw: Partial<PriceImpactMoney> | null | undefined): PriceImpactMoney | null {
  if (!raw) return null;
  return {
    memberships_with_new_debt: num(raw.memberships_with_new_debt),
    debt_delta: num(raw.debt_delta),
    memberships_with_less_advance: num(raw.memberships_with_less_advance),
    advance_delta: num(raw.advance_delta),
    days_lost_total: num(raw.days_lost_total),
    backdated: Boolean(raw.backdated),
    items: arr<PriceImpactItem>(raw.items).map((item) => ({
      membership_id: String(item.membership_id),
      student_name: String(item.student_name ?? ""),
      debt_before: num(item.debt_before),
      debt_after: num(item.debt_after),
      advance_before: num(item.advance_before),
      advance_after: num(item.advance_after),
      paid_until_before: item.paid_until_before ?? null,
      paid_until_after: item.paid_until_after ?? null,
      has_money: Boolean(item.has_money),
    })),
  };
}

/** The student whose number changes: «Каримов А.: долг 0 → 100 000 сум» / «аванс 200 000 сум, оплачено до 12.11 → 10.11». */
export function priceItemLine(item: PriceImpactItem): string {
  const parts: string[] = [];
  if (item.debt_after !== item.debt_before) parts.push(`долг ${formatMoney(item.debt_before)} → ${formatMoney(item.debt_after)}`);
  if (item.advance_after !== item.advance_before) parts.push(`аванс ${formatMoney(item.advance_before)} → ${formatMoney(item.advance_after)}`);
  if (item.paid_until_after !== item.paid_until_before && item.paid_until_after) {
    parts.push(`оплачено до ${item.paid_until_before ? `${dm(item.paid_until_before)} → ` : ""}${dm(item.paid_until_after)}`);
  }
  return `${item.student_name}: ${parts.join(", ") || "без изменений"}`;
}

/** Days an advance buys before and after: «было 12, станет 10» needs the dates, so the line speaks in the dates of «оплачено до». */
export function lostDaysOf(item: Pick<PriceImpactItem, "paid_until_before" | "paid_until_after">): number {
  if (!item.paid_until_before || !item.paid_until_after) return 0;
  return Math.max(0, daysBetween(item.paid_until_after, item.paid_until_before));
}

/**
 * The block «Что изменится» of the price dialogs: «С этого дня у 2 учеников появится долг: 140 000 сум.» · «У 1 ученика аванс купит
 * меньше дней: оплачено до сдвинется на 2 дня.» · «Ведомости, которые покажут «Есть изменения»: 2».
 */
export function priceMoneyLines(money: PriceImpactMoney | null | undefined, staleSheets = 0): string[] {
  const out: string[] = [];
  if (money) {
    if (money.memberships_with_new_debt > 0) {
      out.push(`С этого дня у ${money.memberships_with_new_debt} ${pluralRu(money.memberships_with_new_debt, "ученика", "учеников", "учеников")} появится долг: ${formatMoney(money.debt_delta)}.`);
    }
    if (money.memberships_with_less_advance > 0) {
      const days = money.days_lost_total;
      const who = `У ${money.memberships_with_less_advance} ${pluralRu(money.memberships_with_less_advance, "ученика", "учеников", "учеников")} аванс купит меньше дней`;
      out.push(days > 0 ? `${who}: «оплачено до» сдвинется на ${daysLabel(days)} назад.` : `${who}.`);
      if (money.advance_delta < 0) out.push(`Аванс уменьшится на ${formatMoney(-money.advance_delta)}.`);
    }
  }
  if (staleSheets > 0) out.push(`Ведомости, которые покажут «Есть изменения»: ${staleSheets}`);
  return out;
}

/** In place of «Уже внесённые оплаты не меняются никогда». */
export const PRICE_PAYMENTS_NOTE = "Внесённые оплаты не меняются, но долг и аванс пересчитываются — ниже, у кого.";

/** Nothing moves: «Деньги учеников не изменятся». */
export const PRICE_NO_MONEY_TEXT = "Долг и аванс учеников не изменятся.";

/** A price from a past day is allowed only when nobody has money behind the period. */
export function priceBackdateWarning(valueFrom: string | null | undefined, today: string): string | null {
  if (!valueFrom || !isIsoDate(valueFrom) || valueFrom >= today) return null;
  return "Цена задним числом: если у кого-то за этот период уже есть оплата, сервер откажет — разницу за прошлое закрывают прощением долга или возвратом.";
}

/** The red banner of 409 `PRICE_BACKDATE_WITH_PAYMENTS`: the server's sentence + who blocks (first 20). */
export function priceBlockedText(error: LogicaError): { message: string; students: string[] } {
  return { message: error.message, students: error.students.map((student) => student.student_name) };
}

export const PRICE_MARKER_TEXT = "Эту запись создала система при уходе из группы; её нельзя отменить";

/** «Индивидуальная цена закончилась. Сейчас — цена группы 600 000 сум.» for the returning student (F13). */
export function priceEndedText(groupAmount: number | null | undefined): string {
  return `Индивидуальная цена закончилась. Сейчас — цена группы${groupAmount ? ` ${formatMoney(groupAmount)}` : ""}.`;
}

// ── F12: the billing mode starts from the next period ──────────────────────

/** `PaymentSettingsChanged.regime_impact` (only on the dry run of a mode change). */
export interface RegimeImpact {
  students_affected: number;
  first_switch: string | null;
  latest_switch: string | null;
  defer: boolean;
}

/** The hint under the billing-mode choice. */
export const REGIME_HINT = "Новый режим начнёт действовать для каждого ученика с начала его следующего периода — идущие периоды не меняются.";

/**
 * The dry run of a change of the mode: «Новый режим начнёт действовать с 01.11 (у большинства) — последний переход 14.11. Затронет 38
 * учеников.»  The first / last switch come from the server's impact.
 */
export function regimeImpactLines(impact: RegimeImpact | null | undefined): string[] {
  if (!impact) return [];
  const lines: string[] = [];
  const n = num(impact.students_affected);
  if (n <= 0) return ["Режим сменится без последствий: ни у кого нет идущего периода."];
  if (impact.first_switch) {
    lines.push(
      impact.latest_switch && impact.latest_switch !== impact.first_switch
        ? `Новый режим начнёт действовать с ${formatDateRu(impact.first_switch)} — у каждого ученика с начала его следующего периода, последний переход ${formatDateRu(impact.latest_switch)}.`
        : `Новый режим начнёт действовать с ${formatDateRu(impact.first_switch)}.`,
    );
  }
  lines.push(`Затронет ${n} ${pluralRu(n, "ученика", "ученика", "учеников")}: первый переход ${impact.first_switch ? dm(impact.first_switch) : "—"}, последний ${impact.latest_switch ? dm(impact.latest_switch) : "—"}`);
  return lines;
}

/** The sentence after the mode was saved: «Новый режим начнёт действовать с 01.11». */
export function regimeSavedText(impact: RegimeImpact | null | undefined): string {
  if (impact?.first_switch) return `Новый режим начнёт действовать с ${formatDateRu(impact.first_switch)}`;
  return "Новый режим начнёт действовать с начала следующего периода";
}
