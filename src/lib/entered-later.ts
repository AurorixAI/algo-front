/**
 * Money-2 Э9 (Т17): a payment entered LATER than its own day carries the mark «внесено 18.11» (the day of the record on the clock of the centre, against the day of the payment).  Pure; the day of the
 * record is `created_at` of the payment, the day of the payment its `paid_on` / the date of the row.  Nothing is guessed: no record time - no mark.
 */
import { formatDayMonthRu, formatUtcNaiveAsBusinessDate } from "./business-time";

/** «внесено 18.11» when the record day is after `day` (both ISO / naive UTC), else null. */
export function enteredLaterMark(createdAt: string | null | undefined, day: string | null | undefined): string | null {
  const recorded = formatUtcNaiveAsBusinessDate(createdAt);          // ДД.ММ.ГГГГ
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(recorded);
  if (!match || !day) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return iso > day.slice(0, 10) ? `внесено ${formatDayMonthRu(iso)}` : null;
}
