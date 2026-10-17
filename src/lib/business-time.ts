/**
 * Calendar decisions for lessons must use the organisation's business clock,
 * not the browser's timezone. The API uses the same Asia/Tashkent timezone.
 */
export const BUSINESS_TIME_ZONE = "Asia/Tashkent";

type BusinessDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

// Created once: building an Intl formatter is expensive and this runs per table cell.
const BUSINESS_PARTS_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function businessParts(value = new Date()): BusinessDateParts {
  const parts = BUSINESS_PARTS_FORMAT.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function formatBusinessDate(value = new Date()): string {
  const { year, month, day } = businessParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Human-readable date based on the same organisation clock as the API. */
export function formatBusinessDateLabel(
  options: Intl.DateTimeFormatOptions,
  value = new Date(),
): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: BUSINESS_TIME_ZONE,
    ...options,
  }).format(value);
}

/** Formats an already-known ISO calendar date without allowing browser TZ drift. */
export function formatIsoDateLabel(
  isoDate: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    ...options,
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

/**
 * Uppercases ONLY the first letter ("октябрь 2026 г." -> "Октябрь 2026 г."). The CSS `capitalize` class
 * would upper-case every word and turn «г.» into «Г.» (and «окт.» into «Окт.»).
 */
export function capitalizeFirst(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase("ru-RU") + text.slice(1) : text;
}

/** "2026-10" -> "октябрь 2026 г." (lower case, for use inside a sentence: «за октябрь 2026 г.»). */
export function monthYearLabelRu(month: string): string {
  return formatIsoDateLabel(`${month}-01`, { month: "long", year: "numeric" });
}

const NAIVE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
// Python writes microseconds ("10:00:00.123456"); only three fraction digits are portable across browsers.
const SECOND_FRACTION = /(:\d{2})\.(\d+)/;

/**
 * Some API timestamps (membership `joined_at`, `created_at`, exam `created_at` / `started_at` /
 * `submitted_at` / `generated_at`, diagnostic `created_at` / `completed_at`) are naive UTC:
 * "2026-10-14T19:40:00" is 15.10 00:40 in Tashkent. The browser would read such a string as
 * its own local time, so the day can be wrong near midnight. Returns the instant, or null.
 * A value that already carries a zone ("...Z", "+05:00") is taken as written.
 * A date-only value ("2026-10-14") is a calendar day, not an instant: also null.
 */
export function parseUtcNaive(value: string | null | undefined): Date | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || !NAIVE_TIMESTAMP.test(raw)) return null;
  const text = raw
    .replace(" ", "T")
    .replace(SECOND_FRACTION, (_all, head: string, fraction: string) => `${head}.${`${fraction}00`.slice(0, 3)}`);
  const date = new Date(HAS_ZONE.test(text) ? text : `${text}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Tashkent is a fixed UTC+5: no daylight saving, so a wall time maps to one instant all year. */
const BUSINESS_UTC_OFFSET_MINUTES = 5 * 60;

/**
 * The instant of a business-calendar date ("YYYY-MM-DD") and wall time ("HH:MM" or "HH:MM:SS") - the twin of the
 * server's `lesson_start_as_naive_utc`.  Never reads the device zone.  null when the date or the time is not valid.
 */
export function businessWallTimeToInstant(isoDate: string | null | undefined, time: string | null | undefined): Date | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec((isoDate ?? "").trim());
  const wall = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((time ?? "").trim());
  if (!day || !wall) return null;
  const [year, month, date] = [Number(day[1]), Number(day[2]), Number(day[3])];
  const [hour, minute] = [Number(wall[1]), Number(wall[2])];
  if (hour > 23 || minute > 59) return null;
  const calendar = new Date(Date.UTC(year, month - 1, date));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== date) return null;
  return new Date(Date.UTC(year, month - 1, date, hour, minute) - BUSINESS_UTC_OFFSET_MINUTES * 60_000);
}

/** YYYY-MM-DD of a naive-UTC timestamp on the business calendar; a date-only value is returned as is; "" if invalid. */
export function utcNaiveToBusinessIsoDate(value: string | null | undefined): string {
  const instant = parseUtcNaive(value);
  if (instant) return formatBusinessDate(instant);
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(value ?? "");
  return dateOnly ? dateOnly[1] : "";
}

/**
 * Day of a naive-UTC timestamp (or an ISO instant with a zone) on the Tashkent calendar.
 * Default «ДД.ММ.ГГГГ»; pass Intl options for another look («14 окт. 2026 г.»).
 * "" for empty/invalid input.
 */
export function formatUtcNaiveAsBusinessDate(
  value: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  const instant = parseUtcNaive(value);
  if (instant) {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: BUSINESS_TIME_ZONE,
      ...(options ?? { day: "2-digit", month: "2-digit", year: "numeric" }),
    }).format(instant);
  }
  const iso = utcNaiveToBusinessIsoDate(value);
  if (!iso) return "";
  return formatIsoDateLabel(iso, options ?? { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * «ДД.ММ.ГГГГ ЧЧ:ММ» of a naive-UTC timestamp (or an ISO instant with a zone) on the Tashkent clock:
 * "2026-10-15T08:55:00" is «15.10.2026 13:55». "" for empty/invalid input and for a date-only
 * value (a calendar day has no time of day).
 *
 * Only for timestamps the server really writes in UTC (journal correction time, payment
 * `created_at` / `voided_at`, payment settings `updated_at`). The excuse times (`reason_at`,
 * `reviewed_at`) are already Tashkent wall time: they go through `formatDateTimeRu` unchanged.
 */
export function formatUtcNaiveAsBusinessDateTime(value: string | null | undefined): string {
  const instant = parseUtcNaive(value);
  return instant ? formatBusinessDateTime(instant) : "";
}

/** «ДД.ММ.ГГГГ ЧЧ:ММ» of an instant on the Tashkent clock (the device's zone never enters). */
export function formatBusinessDateTime(instant: Date): string {
  const parts = BUSINESS_PARTS_FORMAT.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}

/**
 * «ЧЧ:ММ» of a naive-UTC timestamp (or an ISO instant with a zone) on the Tashkent clock:
 * "2026-10-15T08:55:00" is «13:55». "" for empty/invalid input and for a date-only value.
 */
export function formatUtcNaiveAsBusinessTime(value: string | null | undefined): string {
  const instant = parseUtcNaive(value);
  if (!instant) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

/**
 * Day and time of a naive-UTC timestamp (or an ISO instant with a zone) on the Tashkent clock,
 * default «15 окт., 13:55». Pass Intl options for another look («15 октября, 13:55»).
 * "" for empty/invalid input and for a date-only value (a calendar day has no time of day).
 */
export function formatUtcNaiveAsBusinessDayTime(
  value: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  const instant = parseUtcNaive(value);
  if (!instant) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: BUSINESS_TIME_ZONE,
    ...(options ?? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  }).format(instant);
}

/**
 * A business-local calendar date ("2026-10-16") is never an instant: it is printed as written,
 * through UTC noon so that no browser zone can move the day. "" if it is not a date-only value
 * (a timestamp has to go through the naive-UTC helpers).
 */
export function formatBusinessCalendarDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
): string {
  // Date-only on purpose: a timestamp is an instant and must go through the naive-UTC helpers.
  const day = /^(\d{4}-\d{2}-\d{2})$/.exec(typeof value === "string" ? value.trim() : "")?.[1];
  return day ? formatIsoDateLabel(day, options) : "";
}

/** ISO calendar date + n days (n may be negative); pure calendar arithmetic, no timezone involved. */
export function addIsoDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? "");
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days, 12));
  return date.toISOString().slice(0, 10);
}

/**
 * The month `delta` months away, as pure "YYYY-MM" arithmetic: shiftBusinessMonth("2026-12", 1) -> "2027-01".
 * Month switchers use this and never `Date.setMonth` (31 January + 1 month is 3 March there, February skipped).
 * Anything that is not "YYYY-MM" is returned unchanged.
 */
export function shiftBusinessMonth(month: string, delta: number): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month ?? "");
  if (!match) return month;
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + delta;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Business-calendar date `days` away from today (0 = today, -1 = yesterday) as YYYY-MM-DD. */
export function businessDateWithOffset(days: number, value = new Date()): string {
  return addIsoDays(formatBusinessDate(value), days);
}

/** ISO weekday (1 = Monday ... 7 = Sunday) of a calendar date; 0 when it is not a date. */
export function isoDateDayOfWeek(isoDate: string | null | undefined): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? "");
  if (!match) return 0;
  const utcDay = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

/**
 * «Доброй ночи» (00:00-04:59) / «Доброе утро» (05:00-11:59) / «Добрый день» (12:00-17:59) / «Добрый вечер» (18:00-23:59)
 * by the Tashkent hour, never the browser's.
 */
export function businessGreeting(value = new Date()): string {
  const hour = Math.floor(businessTimeMinutes(value) / 60);
  if (hour < 5) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

export function businessTimeMinutes(value = new Date()): number {
  const { hour, minute } = businessParts(value);
  return hour * 60 + minute;
}

/**
 * Compact, non-wrapping duration for operational UI.
 *
 * Keeping the unit together with its number avoids a card splitting
 * “4 ч” or “26 мин” across two lines on narrow screens.
 */
export function formatMinutesUntil(value: number): string {
  const minutes = Math.max(0, Math.round(value));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) return `${minutes}\u00a0мин`;
  if (remainder === 0) return `${hours}\u00a0ч`;
  return `${hours}\u00a0ч ${remainder}\u00a0мин`;
}

export function businessDayOfWeek(value = new Date()): number {
  const { year, month, day } = businessParts(value);
  const utcDay = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

/** Returns the ISO date for a weekday in the selected business-calendar week. */
export function businessWeekdayDate(
  dayOfWeek: number,
  weekOffset = 0,
  value = new Date(),
): string {
  const { year, month, day } = businessParts(value);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const currentDay = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + (dayOfWeek - currentDay) + weekOffset * 7);
  return date.toISOString().slice(0, 10);
}
