/**
 * PAY-DUE 9.6 / 10.3 / 10.6 / 10.7: the block «Срок оплаты» of the settings of «Оплаты».  Pure: no React, so node:test loads it.
 * The RULE and its words about the students live on the server (the dry run of `PUT /org/settings/payments` answers `pay_due_impact`); here are only the ranges of the two fields, the example under the field
 * (the term counted from a day, the first day being the first) and the one line before saving.  LESSONS 143: the line about the students is the server's, never rebuilt.
 */
import { addIsoDays, formatDayMonthRu } from "./business-time";
import { pluralRu } from "./plural";

export const PAY_DUE_DAYS_RANGE = { min: 0, max: 14 } as const;
export const PAY_DUE_LESSONS_RANGE = { min: 0, max: 4 } as const;
/** A package: an unpaid lesson becomes a debt on the 15th day after the lesson at the latest (the label of the field says «не дольше 14 дней»). */
export const PACKAGE_UNPAID_DAYS = 14;

export const PAY_DUE_TITLE = "Срок оплаты";
export const PAY_DUE_DAYS_LABEL = "Платить в течение";
export const PAY_DUE_DAYS_UNIT = "дней с начала периода";
export const PAY_DUE_LESSONS_LABEL = "Без оплаты можно провести";
export const PAY_DUE_LESSONS_HINT = `не дольше ${PACKAGE_UNPAID_DAYS} дней`;
export const PAY_DUE_HELP = "Срок меняет только название суммы и списки должников. Суммы и зарплата не меняются.";
export const PAY_DUE_READONLY_NOTE = "Меняет владелец";

export function daysWord(days: number): string {
  return pluralRu(days, "день", "дня", "дней");
}

export function lessonsUnit(count: number): string {
  return pluralRu(count, "урок", "урока", "уроков");
}

/** «Срок оплаты — 10 дней» (the message after saving) / «Срок оплаты — 2 урока» is not used: a package says its lessons in the field. */
export function payDueSavedText(days: number): string {
  return `${PAY_DUE_TITLE} — ${days} ${daysWord(days)}`;
}

/** «Срок оплаты: 5 дней» - the line of an administrator with the right to money (and the link text of the card «К оплате»). */
export function payDueReadText(days: number): string {
  return `${PAY_DUE_TITLE}: ${days} ${daysWord(days)}`;
}

/** The first day of the next period of a centre with the common month: the `day` of this month if it is still ahead, else of the next one (ISO). */
export function nextPeriodStart(today: string, billingDay: number): string {
  const [year, month, dayOfMonth] = today.split("-").map(Number);
  if (!year || !month || !dayOfMonth) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  if (dayOfMonth < billingDay) return `${year}-${pad(month)}-${pad(billingDay)}`;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${month === 12 ? year + 1 : year}-${pad(nextMonth)}-${pad(billingDay)}`;
}

/**
 * The example under the field of days: where the term ends if it is counted from a day, the first day being the first.
 *  - a common month (`fixed_day`): «Период с 01.12 — платить до 05.12 включительно»;
 *  - a personal period (`payment_date`): «Записан 20.11 — платить до 24.11 включительно» (the day is today);
 *  - 0 days: «Неоплата — долг с первого дня».
 */
export function payDueExample(input: { anchor: "payment_date" | "fixed_day"; billingDay: number; days: number; today: string }): string {
  const days = Math.floor(Number(input.days));
  if (!Number.isFinite(days) || days < PAY_DUE_DAYS_RANGE.min || days > PAY_DUE_DAYS_RANGE.max) return "";
  if (days === 0) return "Неоплата — долг с первого дня";
  const start = input.anchor === "fixed_day" ? nextPeriodStart(input.today, input.billingDay) : input.today;
  const until = addIsoDays(start, days - 1);
  if (!start || !until) return "";
  const from = formatDayMonthRu(start);
  const to = formatDayMonthRu(until);
  return input.anchor === "fixed_day" ? `Период с ${from} — платить до ${to} включительно` : `Записан ${from} — платить до ${to} включительно`;
}

const ORDINAL_NOMINATIVE = ["Первый", "Второй", "Третий", "Четвёртый", "Пятый"] as const;

/** The example under the field of lessons: «Третий неоплаченный урок или 15-й день после урока — уже долг». */
export function payDueLessonsExample(lessons: number): string {
  const count = Math.floor(Number(lessons));
  if (!Number.isFinite(count) || count < PAY_DUE_LESSONS_RANGE.min || count > PAY_DUE_LESSONS_RANGE.max) return "";
  return `${ORDINAL_NOMINATIVE[count]} неоплаченный урок или ${PACKAGE_UNPAID_DAYS + 1}-й день после урока — уже долг`;
}

/** What `PUT …?dry_run=true` says about the students: the server's lines, one per kind, none when nothing changes name. */
export function payDueImpactLines(impact: { texts?: string[] | null } | null | undefined): string[] {
  return (impact?.texts ?? []).map((line) => String(line).trim()).filter(Boolean);
}

/** The body of the save: only the fields of the term that changed (what the dry run was asked with). */
export function payDueBody(loaded: { pay_due_days: number; pay_due_lessons: number }, form: { pay_due_days: number; pay_due_lessons: number }): { pay_due_days?: number; pay_due_lessons?: number } {
  const body: { pay_due_days?: number; pay_due_lessons?: number } = {};
  if (form.pay_due_days !== loaded.pay_due_days) body.pay_due_days = form.pay_due_days;
  if (form.pay_due_lessons !== loaded.pay_due_lessons) body.pay_due_lessons = form.pay_due_lessons;
  return body;
}

/** The fields are whole numbers inside their ranges (a typed «» or «20» is not saved). */
export function payDueValid(form: { pay_due_days: number; pay_due_lessons: number }): boolean {
  const inRange = (value: number, range: { min: number; max: number }) => Number.isInteger(value) && value >= range.min && value <= range.max;
  return inRange(form.pay_due_days, PAY_DUE_DAYS_RANGE) && inRange(form.pay_due_lessons, PAY_DUE_LESSONS_RANGE);
}
