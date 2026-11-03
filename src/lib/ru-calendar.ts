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
