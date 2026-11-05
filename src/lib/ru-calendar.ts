// The Russian names of the months: THE one list of each form (WAVE E, DUP-2).  Thirteen copies of the same twelve words were spread over the lib;
// each form has one name here.  Pure: no imports.

/** «январь» ... «декабрь»: the month in a sentence («за октябрь»). */
export const MONTHS_NOMINATIVE = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
] as const;

/** «Январь» ... «Декабрь»: the title of a calendar or a month switcher. */
export const MONTHS_NOMINATIVE_CAP = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
] as const;

/** «января» ... «декабря»: after a day number («22 октября»). */
export const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
] as const;

/** «янв» ... «мая» ... : a short month beside a day number («5 мая»): May is «мая», as in a date. */
export const MONTHS_SHORT_DATE = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"] as const;

/** The same short names for a TITLE of a period («май 2026»): May is «май». */
export const MONTHS_SHORT_TITLE = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"] as const;

/**
 * «сентябрь» / «Сентябрь 2025»: a month `YYYY-MM` in a sentence (the year only when it is not the year of `today`, the business date; `capitalized` for the start of a sentence).
 * A leaf function: the money texts of the effects, of the closed month and of the decisions all name a month this one way.
 */
export function monthLabel(month: string, today: string, capitalized = false): string {
  const [year, number] = month.split("-");
  const name = MONTHS_NOMINATIVE[Number(number) - 1] ?? month;
  const text = year && year !== today.slice(0, 4) ? `${name} ${year}` : name;
  return capitalized ? text.charAt(0).toLocaleUpperCase("ru-RU") + text.slice(1) : text;
}
