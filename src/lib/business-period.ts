import { addIsoDays, formatBusinessDate, utcNaiveToBusinessIsoDate } from "./business-time";

/**
 * "Today / yesterday / last 7 / last 30 days" filters judge the organisation's calendar
 * (Asia/Tashkent), exactly like the API's date filters - never the device's zone.
 */
export type BusinessPeriod = "all" | "today" | "yesterday" | "week" | "month";

/**
 * Whether a server timestamp (naive UTC like "2026-10-14T19:40:00", or an ISO instant with a zone,
 * or a plain business date) falls into the period on the Tashkent calendar.
 * A value that cannot be read as a date stays visible (never hide a record over a bad stamp).
 */
export function matchesBusinessPeriod(
  timestamp: string | null | undefined,
  period: string,
  now: Date = new Date(),
): boolean {
  if (period === "all") return true;
  const day = utcNaiveToBusinessIsoDate(timestamp);
  if (!day) return true;
  const today = formatBusinessDate(now);
  if (period === "today") return day === today;
  if (period === "yesterday") return day === addIsoDays(today, -1);
  if (period === "week") return day >= addIsoDays(today, -7);
  if (period === "month") return day >= addIsoDays(today, -30);
  return true;
}
