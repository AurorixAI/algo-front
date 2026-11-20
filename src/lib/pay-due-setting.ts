/**
 * PAY-DUE 9.6 / 10.3 / 10.6 / 10.7: the block «Срок оплаты» of the settings of «Оплаты».  Pure: no React, so node:test loads it.
 * The RULE and its words live on the server: the dry run of `PUT /org/settings/payments` answers `pay_due_impact` (the line about the students) and `pay_due_example` (the example under the field); here are only
 * the ranges of the two fields, the names and the body of the save.  LESSONS 143: the example and the line about the students are the server's, never rebuilt.
 */
import { pluralRu } from "./plural";

export const PAY_DUE_DAYS_RANGE = { min: 0, max: 14 } as const;
export const PAY_DUE_LESSONS_RANGE = { min: 0, max: 4 } as const;
export const PAY_DUE_TITLE = "Срок оплаты";
export const PAY_DUE_DAYS_LABEL = "Платить в течение";
export const PAY_DUE_DAYS_UNIT = "дней с начала периода";
export const PAY_DUE_LESSONS_LABEL = "Без оплаты можно провести";
/** «не дольше 14 дней» - the number is the server's (`pay_due_package_max_days`); without it the screen says nothing (LESSONS 151). */
export function payDueLessonsHint(maxDays: number | null | undefined): string {
  return Number.isInteger(maxDays) && (maxDays as number) > 0 ? `не дольше ${maxDays} ${daysWord(maxDays as number)}` : "";
}
export const PAY_DUE_HELP = "Срок меняет только название суммы и списки должников. Суммы и зарплата не меняются.";
export const PAY_DUE_READONLY_NOTE = "Меняет владелец";

export function daysWord(days: number): string {
  return pluralRu(days, "день", "дня", "дней");
}

export function lessonsUnit(count: number): string {
  return pluralRu(count, "урок", "урока", "уроков");
}

/** «Срок оплаты — 10 дней» (the message after saving); a package centre: «Срок оплаты — 2 урока». */
export function payDueSavedText(value: number, lessons = false): string {
  return `${PAY_DUE_TITLE} — ${value} ${lessons ? lessonsUnit(value) : daysWord(value)}`;
}

/** «Срок оплаты: 5 дней» - the line of an administrator with the right to money (and the link text of the card «К оплате»). */
export function payDueReadText(days: number): string {
  return `${PAY_DUE_TITLE}: ${days} ${daysWord(days)}`;
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
