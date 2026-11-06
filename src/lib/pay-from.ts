/**
 * «Деньги-1 / Б», Б1 - «Оплата с»: the day a student added to a group is charged from.  The default is the first lesson of the group from today (`GET /org/groups/{id}/pay-from-default`);
 * a chosen day is MONEY (the owner or an administrator with access to money; the server refuses it to everybody else with 403, and the field is not drawn for them at all - not blocked, absent).
 * The sentences about the day are the server's (`billing.text` of the answer of adding, `PAY_FROM_RANGE` / `PAY_FROM_NOT_APPLICABLE`, `billing.immediate.text` of the dry run); this file arranges them.
 * Pure: no React, no network.  Contract: `MONEY1_B_SERVER_REPORT.md`, Б1.
 */
import { addIsoDays, formatDateRu, formatDayMonthRu } from "./business-time";
import { formatMoney, tidyMoneyText } from "./money-format";
import { pluralRu } from "./plural";

const isIsoDateString = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const PAY_FROM_LABEL = "Оплата с";
/** The day of the field never goes further into the future than the server allows. */
export const PAY_FROM_MAX_AHEAD_DAYS = 62;
/** The oldest day when the centre has not said when its accounting starts (the server's own floor is the start of the accounting). */
export const PAY_FROM_FLOOR = "2020-01-01";

export interface PayFromDefault {
  today: string;
  first_lesson: string | null;
  default_pay_from: string;
  /** The server's one sentence: «Оплата с 09.11.2026 — первое занятие группы с сегодня» (null from an older server). */
  text: string | null;
}

export function normalizePayFromDefault(raw: unknown): PayFromDefault | null {
  const r = (raw ?? {}) as Partial<PayFromDefault>;
  if (!isIsoDateString(r.default_pay_from) || !isIsoDateString(r.today)) return null;
  return { today: r.today, first_lesson: isIsoDateString(r.first_lesson) ? r.first_lesson : null, default_pay_from: r.default_pay_from, text: typeof r.text === "string" && r.text.trim() ? r.text.trim() : null };
}

/** What the answer of adding says about the charge (`billing` of the single route; null for a transfer). */
export interface BillingBrief {
  pay_from: string;
  explicit: boolean;
  default_pay_from: string;
  first_lesson: string | null;
  text: string;
  /** The dry run only, and only for a caller with access to money: what is charged AT ONCE. */
  immediate: { amount: number; lessons: number; text: string; parts: ImmediatePart[] } | null;
}

/** One month (or a part of it) of what is charged at once: «Октябрь, с 27.10 — 89 000 сум · 2 урока из 9».  The server adds `parts` to `immediate`; an older server sends none (the sentence alone is shown). */
export interface ImmediatePart {
  label: string;
  from: string;
  amount: number;
  lessons: number;
  lessons_in_period: number;
  whole: boolean;
}

export function normalizeParts(raw: unknown): ImmediatePart[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const p = (item ?? {}) as Partial<ImmediatePart>;
    if (typeof p.label !== "string" || !p.label) return [];
    return [{ label: p.label, from: isIsoDateString(p.from) ? p.from : "", amount: Math.round(Number(p.amount) || 0), lessons: Math.round(Number(p.lessons) || 0), lessons_in_period: Math.round(Number(p.lessons_in_period) || 0), whole: Boolean(p.whole) }];
  });
}

/** The lines of the break-down: «Ноябрь, весь месяц — 400 000 сум» for a whole month, «Октябрь, с 27.10 — 89 000 сум · 2 урока из 9» for a part. */
export function immediatePartLines(parts: ImmediatePart[]): string[] {
  return parts.map((part) => {
    const sum = formatMoney(part.amount);
    if (part.whole || !part.from) return `${part.label}, весь месяц — ${sum}`;
    const day = formatDayMonthRu(part.from);
    const lessons = `${part.lessons} ${pluralRu(part.lessons, ["урок", "урока", "уроков"])} из ${part.lessons_in_period}`;
    return `${part.label}, с ${day} — ${sum} · ${lessons}`;
  });
}

export function normalizeBilling(raw: unknown): BillingBrief | null {
  const r = (raw ?? null) as (Partial<BillingBrief> & { immediate?: Partial<NonNullable<BillingBrief["immediate"]>> | null }) | null;
  if (!r || !isIsoDateString(r.pay_from)) return null;
  const now = r.immediate;
  return {
    pay_from: r.pay_from,
    explicit: Boolean(r.explicit),
    default_pay_from: isIsoDateString(r.default_pay_from) ? r.default_pay_from : r.pay_from,
    first_lesson: isIsoDateString(r.first_lesson) ? r.first_lesson : null,
    text: tidyMoneyText(String(r.text ?? "")),
    immediate: now && typeof now.text === "string" && now.text ? { amount: Math.round(Number(now.amount) || 0), lessons: Math.round(Number(now.lessons) || 0), text: tidyMoneyText(now.text), parts: normalizeParts((now as { parts?: unknown }).parts) } : null,
  };
}

/** The range of the field: from the start of the accounting of the centre to 62 days ahead (the server checks it too: 422 `PAY_FROM_RANGE`). */
export function payFromRange(today: string, accountingStart: string | null | undefined): { min: string; max: string } {
  return { min: isIsoDateString(accountingStart) ? accountingStart : PAY_FROM_FLOOR, max: addIsoDays(today, PAY_FROM_MAX_AHEAD_DAYS) };
}

/**
 * The day that goes to the server: only a day the person CHANGED (the default is not sent - the server stores nothing then and says «с первого занятия группы»); "" while the field is empty or not a date.
 * Nothing for a role without access to money, whatever its state is.
 */
export function payFromRequest(value: string, def: PayFromDefault | null, moneyRight: boolean): string | null {
  if (!moneyRight || !def || !isIsoDateString(value) || value === def.default_pay_from) return null;
  return value;
}

/** The quiet line for a role without money, and under the field for the others: «Оплата считается с 06.11.2026 — с первого занятия группы» (the words of the server's `billing.text`). */
export function payFromDefaultLine(def: PayFromDefault | null): string | null {
  if (!def) return null;
  if (def.text) return def.text;       // the sentence of the server; ours below only for an older server
  const when = formatDateRu(def.default_pay_from);
  return def.first_lesson === null ? `Оплата считается с ${when}: у группы нет занятий в ближайшие дни` : `Оплата считается с ${when} — с первого занятия группы`;
}

/** A chosen day before today charges the days of the past AT ONCE: the dry run says how much (a single student). */
export function payFromIsPast(value: string, def: PayFromDefault | null): boolean {
  return Boolean(def) && isIsoDateString(value) && value < (def as PayFromDefault).today;
}

export const PAY_FROM_NOTHING_NOW = "Сразу ничего не начислится";

/** What the dry run of a BULK add says about the charge at once: a line per student and the total - all of it the server's sentences (the money right only; otherwise nothing). */
export interface BulkImmediate {
  students: Array<{ studentId: string; text: string; parts: ImmediatePart[] }>;
  total: string | null;
}

export function normalizeBulkImmediate(raw: unknown): BulkImmediate {
  const r = (raw ?? {}) as { students?: unknown; billing?: unknown; immediate_total?: { text?: unknown } | null };
  // the dry run of ONE add (`billing` at the top) and of a bulk one (`students[].billing`) read the same way
  const list = Array.isArray(r.students) ? r.students : r.billing ? [{ student_id: "", billing: r.billing }] : [];
  const students = list.flatMap((item) => {
    const entry = item as { student_id?: unknown; billing?: unknown };
    const now = normalizeBilling(entry.billing)?.immediate;
    return now?.text ? [{ studentId: String(entry.student_id ?? ""), text: now.text, parts: now.parts }] : [];
  });
  const total = typeof r.immediate_total?.text === "string" && r.immediate_total.text ? tidyMoneyText(r.immediate_total.text) : null;
  return { students, total };
}

/** The field cannot be sent: an empty or impossible date. */
export function payFromProblem(value: string, def: PayFromDefault | null, range: { min: string; max: string }): string | null {
  if (!def) return null;
  if (!isIsoDateString(value)) return "Укажите дату «Оплата с»";
  if (value < range.min || value > range.max) return `«Оплата с» — от ${formatDateRu(range.min)} до ${formatDateRu(range.max)}`;
  return null;
}

export const PAY_FROM_RANGE_TEXT = "«Оплата с» — не раньше начала учёта центра и не позже чем через 62 дня от сегодня";
export const PAY_FROM_NOT_APPLICABLE_TEXT = "«Оплата с» задаётся только при добавлении ученика в группу: при переводе оплата идёт со следующего дня";

/**
 * The refusals of «Оплата с» in words: the server's own sentence when it sent one (it names the real dates of the centre), else ours.  `null`: not a refusal of this field.
 */
export function payFromErrorText(failure: { code: string | null; message: string }): string | null {
  if (failure.code === "PAY_FROM_RANGE") return tidyMoneyText(failure.message) || PAY_FROM_RANGE_TEXT;
  if (failure.code === "PAY_FROM_NOT_APPLICABLE") return tidyMoneyText(failure.message) || PAY_FROM_NOT_APPLICABLE_TEXT;
  return null;
}
