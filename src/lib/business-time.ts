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

function businessParts(value = new Date()): BusinessDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
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

const NAIVE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Some API timestamps (membership `joined_at`, `created_at`) are naive UTC:
 * "2026-10-14T19:40:00" is 15.10 00:40 in Tashkent. The browser would read such a string as
 * its own local time, so the day can be wrong near midnight. Returns the instant, or null.
 * A date-only value ("2026-10-14") is a calendar day, not an instant: also null.
 */
export function parseUtcNaive(value: string | null | undefined): Date | null {
  if (!value || !NAIVE_TIMESTAMP.test(value)) return null;
  const text = value.trim().replace(" ", "T");
  const date = new Date(HAS_ZONE.test(text) ? text : `${text}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
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
