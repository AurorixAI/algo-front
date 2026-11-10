/**
 * Money-1 V8 / Ф2: «Моя зарплата» of a teacher - the types of the answers `GET /auth/org/me/payroll?month=` and `GET /auth/org/me/payroll/months`, their normalizer and the words of the screen.
 *
 * The numbers are the OWNER's numbers (the server does not calculate a second time - LESSONS 104) and nothing about prices, students or debts is in the answer (LESSONS 95): this module
 * does not know such fields, so they cannot reach the screen.  The words of a month that is not saved come from the server (`text`), a sum is «N сум» with a non-breaking space.
 */
import { formatMoney, pluralRu } from "./payments";
import { tidyMoneyText } from "./money-format";
import { monthTitle } from "./payroll";
import type { ChipTone } from "./chip-tone";

export type MyMonthState = "saved" | "open_preliminary" | "not_saved";

export interface MyMonth {
  /** YYYY-MM */
  month: string;
  /** «Ноябрь 2026» */
  title: string;
  state: MyMonthState;
  /** The current month (or a month the owner has not closed): the sum may change until the salary is saved. */
  preliminary: boolean;
  lessonsCounted: number;
  /** null: nothing to show (the month is not saved, or there is no rate yet). */
  total: number | null;
  paid: number;
  /** > 0 left to pay, < 0 paid forward. */
  balance: number;
  /** The advance of the earlier months that is taken off this month. */
  carryIn: number;
  /** The words of the server (the state of the month, «К выплате …», «Предварительно: …»). */
  text: string;
  updatedAt: string | null;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const STATES: ReadonlyArray<MyMonthState> = ["saved", "open_preliminary", "not_saved"];

const whole = (value: unknown): number => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? number : 0;
};

/** One month of the answer; null when it is not a month at all (the screen shows an error, never a made-up month). */
export function normalizeMyMonth(raw: unknown): MyMonth | null {
  const item = raw as Record<string, unknown> | null | undefined;
  if (!item || typeof item !== "object" || typeof item.month !== "string" || !MONTH.test(item.month)) return null;
  const state = STATES.includes(item.state as MyMonthState) ? (item.state as MyMonthState) : "not_saved";
  const total = item.total === null || item.total === undefined || item.total === "" ? null : whole(item.total);
  return {
    month: item.month,
    title: monthTitle(item.month).replace(/\s*г\.$/, ""),
    state,
    preliminary: state === "open_preliminary" || item.preliminary === true,
    lessonsCounted: Math.max(0, whole(item.lessons_counted)),
    total,
    paid: whole(item.paid),
    balance: whole(item.balance),
    carryIn: Math.max(0, whole(item.carry_in)),
    text: tidyMoneyText(typeof item.text === "string" ? item.text.trim() : ""),
    updatedAt: typeof item.updated_at === "string" && item.updated_at ? item.updated_at : null,
  };
}

/** The list of months, newest first (the server sorts; a month twice is kept once); an answer that is not a list is `null` - a failure, not «no months». */
export function normalizeMyMonths(raw: unknown): MyMonth[] | null {
  const items = (raw as { items?: unknown } | null | undefined)?.items;
  if (!Array.isArray(items)) return null;
  const seen = new Set<string>();
  const months: MyMonth[] = [];
  for (const entry of items) {
    const month = normalizeMyMonth(entry);
    if (!month || seen.has(month.month)) continue;
    seen.add(month.month);
    months.push(month);
  }
  return months.sort((a, b) => b.month.localeCompare(a.month));
}

/** The month of the address `?month=`: a valid month not later than the current one, otherwise the current one. */
export function myMonthParam(value: string | null | undefined, today: string): string {
  const current = today.slice(0, 7);
  return value && MONTH.test(value) && value <= current ? value : current;
}

export const MY_PAYROLL_TITLE = "Моя зарплата";
export const MY_PAYROLL_EMPTY_TITLE = "Пока нет начислений";
export const MY_PAYROLL_EMPTY_HINT = "Они появятся после первого проведённого урока.";
export const MY_PAYROLL_PAST = "Прошлые месяцы";
export const MY_PAYROLL_BACK = "К текущему месяцу";
export const MY_PAYROLL_NO_MONTH = "Этого месяца ещё нет";
export const MY_PAYROLL_LOAD_FAILED = "Не удалось загрузить зарплату";
export const PRELIMINARY_CHIP = "Предварительно";
export const PRELIMINARY_NOW = "на сегодня";

/** «31 урок» */
export const lessonsText = (count: number): string => `${count} ${pluralRu(count, ["урок", "урока", "уроков"])}`;

/** «Получено авансом раньше: 200 000 сум — вычитается из суммы этого месяца» (the words of the lead, 10.11); null without an advance. */
export function carryText(month: Pick<MyMonth, "carryIn">): string | null {
  return month.carryIn > 0 ? `Получено авансом раньше: ${formatMoney(month.carryIn)} — вычитается из суммы этого месяца` : null;
}

/** The chip of the month: a state is a fact, not a task for the teacher - never amber. */
export function myMonthChip(month: Pick<MyMonth, "state" | "preliminary">): { label: string; tone: ChipTone } {
  if (month.preliminary) return { label: PRELIMINARY_CHIP, tone: "info" };
  if (month.state === "saved") return { label: "Сохранена", tone: "ok" };
  return { label: "Не сохранена", tone: "neutral" };
}

/** What is left, in words of the dictionary: «К выплате» / «Выплачено вперёд» / «Остаток» (nothing left) - and the number. */
export function balanceView(balance: number): { label: string; value: string } {
  if (balance > 0) return { label: "К выплате", value: formatMoney(balance) };
  if (balance < 0) return { label: "Выплачено вперёд", value: formatMoney(-balance) };
  return { label: "Остаток", value: formatMoney(0) };
}

/** Does the month have numbers to show (a month the owner has not saved, or without a rate, has none). */
export const hasNumbers = (month: Pick<MyMonth, "total">): boolean => month.total !== null;

/** The line under the numbers: the caution of a month that is going on, or the reason there are no numbers - the server's own words.  A saved month says everything with its numbers. */
export function stateLine(month: Pick<MyMonth, "state" | "text">): string | null {
  return month.state === "saved" ? null : month.text || null;
}

/** The one line of a month in the list: «31 урок · 4 100 000 сум» - or the server's words when there is no sum. */
export function listLine(month: MyMonth): string {
  if (month.total === null) return month.text;
  return `${lessonsText(month.lessonsCounted)} · ${formatMoney(month.total)}`;
}

/** The right-hand word of a row: the state of the payment (saved) or «Предварительно». */
export function listState(month: MyMonth): string {
  if (month.preliminary) return PRELIMINARY_CHIP;
  return month.state === "saved" ? month.text : "";
}

/** The list has nothing to show: no lessons, no sum, no payout and no advance in any month. */
export function isEmptyList(months: ReadonlyArray<MyMonth>): boolean {
  return months.every((month) => month.lessonsCounted === 0 && (month.total ?? 0) === 0 && month.paid === 0 && month.carryIn === 0);
}
