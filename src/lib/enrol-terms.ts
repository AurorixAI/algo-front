/**
 * The «Условия» line of the windows of enrolment: «Оплата с 19 ноября, по цене группы» - arranged from the fields the person set and the server's day (`pay-from-default`).  The rule of the day and the price
 * stays on the server; this file only says it in words and decides when a typed sum is an individual price at all.  Pure.
 */
import { MONTHS_GENITIVE } from "./ru-calendar";
import { formatMoney, formatMoneyInput } from "./money-format";
import { checkEnrolOverride, isLessonsPriceLabel, reasonProblem, type EnrolOverrideValues, type EnrolPriceOverride, type FormCheck } from "./group-price";
import { DRY_RUN_REASON } from "./dry-run";

/** «19 ноября»; with the year («19 ноября 2025») when it is not the year of `todayIso`; "" for anything but a real ISO date. */
export function dayMonthWords(iso: string | null | undefined, todayIso?: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!match) return "";
  const month = MONTHS_GENITIVE[Number(match[2]) - 1];
  if (!month) return "";
  const year = todayIso && /^\d{4}/.test(todayIso) && todayIso.slice(0, 4) !== match[1] ? ` ${match[1]}` : "";
  return `${Number(match[3])} ${month}${year}`;
}

/**
 * The reason of the day, as the server states it («Оплата с 19.11.2026 — сегодня у группы занятие» -> «сегодня у группы занятие»; «… — ближайшее занятие группы» -> «ближайшее занятие группы»): the sentence
 * repeats the date that the line already says, so only its second half is shown; a sentence without a dash is shown whole.
 */
export function payFromReason(text: string | null | undefined): string | null {
  const full = (text ?? "").trim();
  if (!full) return null;
  const cut = /\s[—–]\s|:\s/.exec(full);
  const tail = cut ? full.slice(cut.index + cut[0].length).trim() : full;
  return tail || full;
}

const digitsOf = (text: string): number | null => {
  const digits = text.replace(/\D/g, "");
  return digits === "" ? null : Number(digits);
};

/** A typed sum is an individual price when there is one and it is not the price of the group (the same number is «по цене группы»). */
export function isOwnPrice(amountText: string, groupAmount: number | null | undefined): boolean {
  const typed = digitsOf(amountText);
  return typed !== null && typed !== (groupAmount ?? null);
}

export interface TermsLineInput {
  /** the day the charge starts (ISO), "" until the server's default arrives */
  payFrom: string;
  /** the server's «today» (ISO) - the year is said only when it differs */
  today?: string | null;
  /** the price of the group is set (a sum or free) */
  groupHasPrice: boolean;
  /** the individual price typed (digits), "" when none */
  ownAmount: string;
  /** an opening balance is entered */
  opening?: boolean;
}

/** «Оплата с 19 ноября, по цене группы» / «Оплата с 17 ноября, своя цена 400 000» / «Оплата с 19 ноября» (no price of the group yet). */
export function termsLine(input: TermsLineInput): string {
  const day = dayMonthWords(input.payFrom, input.today);
  const own = digitsOf(input.ownAmount);
  const price = own !== null ? `своя цена ${formatMoneyInput(own)}` : input.groupHasPrice ? "по цене группы" : null;
  const parts = [day ? `Оплата с ${day}` : null, price, input.opening ? "с остатком на начало учёта" : null].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return "";
  const text = parts.join(", ");
  return text.charAt(0).toLocaleUpperCase("ru") + text.slice(1);
}

/** «450 000 сум в месяц» / «450 000 сум за пакет» / «бесплатно»: the price of the group under the title of a window. */
export function priceInWords(amount: number, label: string): string {
  if (amount === 0) return "бесплатно";
  return `${formatMoney(amount)} ${isLessonsPriceLabel(label) ? "за пакет" : "в месяц"}`;
}

/**
 * The own price for the PROBE (the dry run): a price entered without its reason is asked with the stand-in reason of a dry run (as the cancel of a payment does), so the sum of the bar follows the price on the
 * screen at once; the real write is checked by `checkEnrolOverride` and never goes without the reason (Money-2 fix 11, F5).  A reason that is long enough is sent as it is.
 */
export function dryRunOverride(values: EnrolOverrideValues): FormCheck<EnrolPriceOverride | null> {
  if (!values.enabled) return { error: null, request: null };
  return checkEnrolOverride({ ...values, reason: reasonProblem(values.reason) ? DRY_RUN_REASON : values.reason });
}

export interface OwnPriceError {
  /** the field the refusal stands at */
  field: "amount" | "reason";
  text: string;
}

/** What is wrong with the own price entered, and in WHICH field (the error stands at that field, not in a plate far from it); null - nothing wrong or no own price. */
export function ownPriceError(values: EnrolOverrideValues): OwnPriceError | null {
  const amount = dryRunOverride(values);
  if (amount.error) return { field: "amount", text: amount.error };
  const full = checkEnrolOverride(values);
  return full.error ? { field: "reason", text: full.error } : null;
}

/** «Начисление начнётся 21 ноября»: the muted line of the bar when nobody pays at once because the day of the charge is still ahead (the day is the server's `pay_from`). */
export const payStartsLine = (iso: string, todayIso?: string | null): string => `Начисление начнётся ${dayMonthWords(iso, todayIso)}`;
