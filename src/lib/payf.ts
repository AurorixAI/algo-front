/**
 * PAY-F: the words and the small rules of the four parts (spec `artifacts/payf/PAY_F_SPEC.md`).  No React, no fetch: pure functions, tested by `tests/payf.test.cjs`.
 *
 *  1. the forecast of a package «хватит до ~ДД.ММ (по расписанию)»;
 *  2. «Выходной день центра» (the types of the day off and the words of its dialog);
 *  3. the kind of a cancellation («По вине центра» / «Праздник, выходной») and the deduction «−46 000 сум: урок 21.10 отменён центром»;
 *  4. the names of the ways to count a payment live in ONE dictionary: `PAYMENT_MODELS` in `payments.ts`.
 */
import type { MembershipPaymentRow } from "./payments";

const MINUS = "−";

function dayMonth(iso: string | null | undefined): string {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "";
}

function money(amount: number): string {
  return `${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} сум`;
}

// ── 1. The forecast of a package ────────────────────────────────────────────

/** Nothing is left of the package. */
export const PACKAGE_OVER_TEXT = "пакет закончился";

/** The forecast is a promise of the schedule, not of the money. */
export const FORECAST_NOTE = "по расписанию";

/**
 * «хватит до ~30.10 (по расписанию)» for a package that still has lessons, «пакет закончился» when none is left, "" otherwise (a monthly mode, no schedule far enough,
 * a membership that is not in the group).  The day is the server's `paid_through_forecast`; the receipt and the statement never show it (they state facts).
 */
export function forecastText(row: Pick<MembershipPaymentRow, "period_mode" | "lessons_left" | "paid_through_forecast">): string {
  if (row.period_mode !== "lessons") return "";
  if (row.lessons_left === 0) return PACKAGE_OVER_TEXT;
  const day = dayMonth(row.paid_through_forecast);
  return day ? `хватит до ~${day} (${FORECAST_NOTE})` : "";
}

// ── 3. The kind of a cancellation and the deduction ─────────────────────────

export type CancellationKind = "centre" | "holiday";

/** The choice in the dialog of a cancellation: the centre's fault is the default (it may be deducted from the next payment), a holiday never is. */
export const CANCELLATION_KINDS: ReadonlyArray<{ key: CancellationKind; label: string; hint: string }> = [
  { key: "centre", label: "По вине центра", hint: "Например, заболел преподаватель. Если в настройках включён перерасчёт, ученикам вычтут урок из следующей оплаты." },
  { key: "holiday", label: "Праздник, выходной", hint: "Перерасчёта не будет." },
];
export const DEFAULT_CANCELLATION_KIND: CancellationKind = "centre";

/** One deduction as the server sends it (`text` is the server's own sentence). */
export interface RecalcLine {
  lesson_date: string;
  lesson_id: string;
  amount: number;
  text: string;
}

export const RECALC_HEADING = "Перерасчёт за уроки, отменённые центром";

/** «−46 000 сум: урок 21.10 отменён центром» (the server's words; built here only for a line that came without a text). */
export function recalcText(line: Pick<RecalcLine, "amount" | "lesson_date"> & { text?: string | null }): string {
  return line.text || `${MINUS}${money(line.amount)}: урок ${dayMonth(line.lesson_date)} отменён центром`;
}

/** The lines to show (the sum is the total the payment is smaller by); nothing when the server sent none (an older server). */
export function recalcLines(lines: ReadonlyArray<RecalcLine> | null | undefined): { texts: string[]; total: number } {
  const list = lines ?? [];
  return { texts: list.map(recalcText), total: list.reduce((all, line) => all + (Number(line.amount) || 0), 0) };
}

// ── 2. «Выходной день центра» ────────────────────────────────────────────────

export const DAY_OFF_MAX_DAYS = 14;
export const DAY_OFF_REASON_MIN = 3;

export interface DayOffLesson {
  groupId: string;
  groupName: string;
  lessonId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  /** Why a lesson is not cancelled / not given back. */
  reason: string | null;
}

export interface DayOffPlan {
  dateFrom: string;
  dateTo: string;
  reason: string;
  cancellable: DayOffLesson[];
  blocked: DayOffLesson[];
  alreadyCancelled: number;
  groups: number;
  /** «Будут отменены 4 урока в 4 группах: …» */
  text: string;
}

export interface DayOffOut {
  id: string;
  dateFrom: string;
  dateTo: string;
  reason: string;
  createdAt: string | null;
  createdByName: string | null;
  voidedAt: string | null;
  active: boolean;
}

export interface DayOffApplied {
  dayOff: DayOffOut;
  cancelled: DayOffLesson[];
  blocked: DayOffLesson[];
  alreadyCancelled: number;
}

export interface DayOffVoided {
  dayOff: DayOffOut;
  restored: DayOffLesson[];
  kept: DayOffLesson[];
  dryRun: boolean;
}

export interface DayOffForDate {
  dayOff: DayOffOut | null;
}

export interface DayOffForm {
  dateFrom: string;
  dateTo: string;
  reason: string;
}

/** The number of a calendar day (days of the proleptic Gregorian calendar): the difference of two is the days between them, with no time zone in it. */
function dayNumber(iso: string): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const y = month <= 2 ? year - 1 : year;
  const m = (month + 9) % 12;
  return 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + Math.floor((m * 306 + 5) / 10) + day;
}

function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from) + 1;
}

/** What is wrong with the form of a day off, or null.  The server checks the same (3 characters, up to 14 days). */
export function dayOffError(form: DayOffForm): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateFrom)) return "Укажите дату";
  if (form.dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(form.dateTo)) return "Укажите дату окончания";
  const to = form.dateTo || form.dateFrom;
  if (to < form.dateFrom) return "Конец выходного раньше его начала";
  if (daysBetween(form.dateFrom, to) > DAY_OFF_MAX_DAYS) return `Выходной — не больше ${DAY_OFF_MAX_DAYS} дней подряд`;
  if (form.reason.trim().length < DAY_OFF_REASON_MIN) return `Укажите причину: не короче ${DAY_OFF_REASON_MIN} символов`;
  return null;
}

/** The body of the request: a single date has the same end. */
export function dayOffBody(form: DayOffForm): { dateFrom: string; dateTo: string; reason: string } {
  return { dateFrom: form.dateFrom, dateTo: form.dateTo || form.dateFrom, reason: form.reason.trim().replace(/\s+/g, " ") };
}

/** «21.10» or «21.10–23.10». */
export function dayOffSpan(day: Pick<DayOffOut, "dateFrom" | "dateTo">): string {
  return day.dateFrom === day.dateTo ? dayMonth(day.dateFrom) : `${dayMonth(day.dateFrom)}–${dayMonth(day.dateTo)}`;
}

/** The warning when a lesson is created on a day off of the centre (a warning, never a block). */
export function dayOffWarning(day: Pick<DayOffOut, "reason"> | null | undefined): string | null {
  return day ? `Это выходной день центра («${day.reason}»). Урок всё равно можно добавить.` : null;
}

/** «Хайит · 21.10: 4 урока отменено, 1 нельзя» for the journal. */
export function dayOffLine(day: DayOffOut): string {
  return `${day.reason} · ${dayOffSpan(day)}${day.active ? "" : " · отменён"}`;
}

/** «Группа 5 · 21.10 10:00 — идёт экзамен» for a lesson in a list. */
export function dayOffLessonLine(lesson: DayOffLesson): string {
  const when = [dayMonth(lesson.date), lesson.startTime].filter(Boolean).join(" ");
  return `${lesson.groupName} · ${when}${lesson.reason ? ` — ${lesson.reason}` : ""}`;
}
