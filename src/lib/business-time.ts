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

export function businessTimeMinutes(value = new Date()): number {
  const { hour, minute } = businessParts(value);
  return hour * 60 + minute;
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
