/** Business clock of the centre (Asia/Tashkent): the API and the front decide "today" and "now" with it. */
export const BUSINESS_TZ = "Asia/Tashkent";

const PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface BusinessNow {
  /** YYYY-MM-DD */
  date: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** minutes since midnight */
  minutes: number;
  /** 1 (Mon) .. 7 (Sun), like the schedule API */
  isoWeekday: number;
}

export function businessNow(at: Date = new Date()): BusinessNow {
  const parts = PARTS.formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value || 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year,
    month,
    day,
    hour,
    minute,
    minutes: hour * 60 + minute,
    isoWeekday: isoWeekday(year, month, day),
  };
}

/** 1 (Mon) .. 7 (Sun) of a calendar date (no time zone involved). */
export function isoWeekday(year: number, month: number, day: number): number {
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
}

export function hhmm(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.floor(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return isoWeekday(y, m, d);
}

/** Mock-free "round to whole thousands, a half goes up" of the payments API (integer maths). */
export function round1000(numerator: number, denominator = 1): number {
  return Math.floor((2 * numerator + 1000 * denominator) / (2000 * denominator)) * 1000;
}

/** Days in a calendar month (month 1..12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Last day of the month of an ISO date. */
export function monthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return isoDate(y, m, daysInMonth(y, m));
}

/**
 * Default end of a calendar payment that starts on `iso`: the day before the same day of the next month
 * (05.10 -> 04.11, 31.01 -> 28.02, the 1st -> the end of the SAME month). Written independently of the API
 * (this is the test oracle), from the rule stated in the payments documentation.
 */
export function addMonthMinusDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (d === 1) return isoDate(y, m, daysInMonth(y, m));
  const [ny, nm] = m === 12 ? [y + 1, 1] : [y, m + 1];
  return isoDate(ny, nm, Math.min(d - 1, daysInMonth(ny, nm)));
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** The centre's period of "one payment day" that contains `iso`: from `billingDay` of a month to the day before the next one. */
export function billingPeriod(iso: string, billingDay: number): { start: string; end: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const [sy, sm] = d >= billingDay ? [y, m] : m === 1 ? [y - 1, 12] : [y, m - 1];
  const [ey, em] = sm === 12 ? [sy + 1, 1] : [sy, sm + 1];
  return { start: isoDate(sy, sm, billingDay), end: addDays(isoDate(ey, em, billingDay), -1) };
}

/** How many lessons a weekly schedule (ISO weekdays) has in `from .. to`, both included. */
export function countWeeklyLessons(weekdays: number[], from: string, to: string): number {
  let n = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) if (weekdays.includes(weekdayOf(day))) n++;
  return n;
}

/** Russian plural of "урок" for the caption of a prorated payment. */
export function lessonsWord(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return "уроков";
  if (mod10 === 1) return "урок";
  if (mod10 >= 2 && mod10 <= 4) return "урока";
  return "уроков";
}

/**
 * Payroll line of the partner's formula, in exact integer arithmetic (the test oracle):
 *   amount = round_half_up( fee * percent / 100 * lessons / divisor ),  percent with at most 2 decimals.
 */
export function payrollLine(fee: number, percent: string, lessons: number, divisor = 12): number {
  const [whole, frac = ""] = percent.replace(",", ".").split(".");
  const hundredths = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  const numerator = BigInt(fee) * hundredths * BigInt(lessons);
  const denominator = 10_000n * BigInt(divisor);
  return Number((2n * numerator + denominator) / (2n * denominator));
}
