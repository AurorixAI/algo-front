/**
 * The business time the stand clock is put to before the ordinary projects (pure; run.mjs prints and sets it).
 * The nearest 10:00 AHEAD by Tashkent - but only on a day of the SAFE range FIRST_STAND_DAY..LAST_STAND_DAY of a month; when the day of that moment lies outside it,
 * the moment is 10:00 of the nearest day of the range ahead (the same month below the range, the next month above it).  Returns "YYYY-MM-DDT10:00".
 *
 * Why the range (found by the runs of 28.11 on the 28th and 01.12 on the 1st; the code lines are in the report of the task):
 *  - LAST 28: the billing day of a centre is 1..28 (the money tests of the lessons set «the common month starts today»), so the 29th-31st cannot hold them.
 *  - FIRST 11: the money tests charge a student «from ten days ago» (`addDays(today, -10)`), and the statement shows the charge in the CURRENT month only when that day is in it (day >= 11);
 *    on the 1st-5th the first period of the common month has just begun (the term of payment of 5 days has not passed: «К оплате», no «Долг»); on the 1st the common month of a NEW centre
 *    (billing day 1, written at its creation) is the same as the day the test picks, so no change of the mode asks for a confirmation.
 */
export const TASHKENT_OFFSET_HOURS = 5; // Asia/Tashkent has no daylight saving time
export const FIRST_STAND_DAY = 11;
export const LAST_STAND_DAY = 28;
/** The longest way the clock goes ahead: from the 28th after 10:00 of a 31-day month to 10:00 of the 11th of the next one is 14 days; one more day of room for the reuse check (a stand is read at 10:00-11:30). */
export const STAND_MAX_AHEAD_SECONDS = 15 * 24 * 3600;

export function standTargetTime(realNowMs) {
  const local = new Date(realNowMs + TASHKENT_OFFSET_HOURS * 3600_000); // the UTC fields of this date are the Tashkent wall time
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  let day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (minutes >= 10 * 60 ? 1 : 0)));
  if (day.getUTCDate() < FIRST_STAND_DAY) day = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), FIRST_STAND_DAY));
  else if (day.getUTCDate() > LAST_STAND_DAY) day = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, FIRST_STAND_DAY));
  return `${day.toISOString().slice(0, 10)}T10:00`;
}
