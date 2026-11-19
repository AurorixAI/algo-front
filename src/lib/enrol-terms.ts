/**
 * The «Условия» line of the windows of enrolment: «Оплата с 19 ноября, по цене группы» - arranged from the fields the person set and the server's day (`pay-from-default`).  The rule of the day and the price
 * stays on the server; this file only says it in words and decides when a typed sum is an individual price at all.  Pure.
 */
import { MONTHS_GENITIVE } from "./ru-calendar";
import { formatMoney, formatMoneyInput } from "./money-format";
import { isLessonsPriceLabel } from "./group-price";

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
 * The reason of the day, as the server states it («Оплата с 19.11.2026 — первое занятие группы с сегодня» -> «первое занятие группы с сегодня»): the sentence repeats the date that the line already
 * says, so only its second half is shown; a sentence without a dash is shown whole.
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
