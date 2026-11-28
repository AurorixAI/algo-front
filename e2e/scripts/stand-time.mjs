/**
 * The business time the stand clock is put to before the ordinary projects (pure; run.mjs prints and sets it).
 * The nearest 10:00 AHEAD by Tashkent - but never on the 29th-31st: the billing day of a centre is 1..28, so the money tests of the lessons cannot run there.
 * When the day of that moment is above 28, it is 10:00 of the 1st of the next month.  Returns "YYYY-MM-DDT10:00".
 */
export const TASHKENT_OFFSET_HOURS = 5; // Asia/Tashkent has no daylight saving time
export const LAST_BILLING_DAY = 28;

export function standTargetTime(realNowMs) {
  const local = new Date(realNowMs + TASHKENT_OFFSET_HOURS * 3600_000); // the UTC fields of this date are the Tashkent wall time
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  let day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (minutes >= 10 * 60 ? 1 : 0)));
  if (day.getUTCDate() > LAST_BILLING_DAY) day = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1));
  return `${day.toISOString().slice(0, 10)}T10:00`;
}
