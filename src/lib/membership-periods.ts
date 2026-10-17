/**
 * Membership periods: every stay of a student in a group, oldest first, naive UTC.
 * A student who returned to a group has several; the old `joined_at` / `left_at` mean the current (or last) one.
 * Pure: no React and no network, so node:test can load this file.
 */
import { businessWallTimeToInstant, formatUtcNaiveAsBusinessDate, parseUtcNaive, utcNaiveToBusinessIsoDate } from "./business-time";

/** `periods[]` of the profile (`group_history`, `groups`), of the group card (`students`) and of the journal (`historicalStudents`). */
export interface MembershipPeriod {
  joined_at?: string | null;
  left_at?: string | null;
}

/** Anything that carries a membership: the periods when the server sends them, else the single `joined_at` / `left_at`. */
export interface MembershipSource {
  periods?: ReadonlyArray<MembershipPeriod> | null;
  joined_at?: string | null;
  left_at?: string | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Business day (YYYY-MM-DD, Tashkent) of a naive-UTC stamp; "" when there is none or it is not a date. */
function businessDay(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const day = utcNaiveToBusinessIsoDate(raw) || raw.slice(0, 10);
  return ISO_DAY.test(day) ? day : "";
}

/**
 * The periods of a membership, oldest first.  An older server sends none: the single `joined_at` / `left_at` is then
 * the only period known; nothing at all gives an empty list.
 */
export function membershipPeriods(source: MembershipSource | null | undefined): MembershipPeriod[] {
  const listed = Array.isArray(source?.periods) ? source.periods.filter((period) => period && typeof period === "object") : [];
  if (listed.length > 0) return listed.map((period) => ({ joined_at: period.joined_at ?? null, left_at: period.left_at ?? null }));
  if (source?.joined_at || source?.left_at) return [{ joined_at: source.joined_at ?? null, left_at: source.left_at ?? null }];
  return [];
}

/**
 * Did the student belong to the group at this exact instant?  The server's rule (`membership_covers_instant`),
 * asked of every stay: `joined_at <= instant` (a missing one counts) and `left_at` open or `left_at > instant`.
 * All naive UTC; a stamp that is not a date-time is no bound.
 */
export function wasMemberAt(source: MembershipSource | null | undefined, instant: Date): boolean {
  const at = instant.getTime();
  const periods = membershipPeriods(source);
  if (periods.length === 0) return true;
  return periods.some((period) => {
    const joined = parseUtcNaive(period.joined_at);
    const left = parseUtcNaive(period.left_at);
    return (!joined || joined.getTime() <= at) && (!left || left.getTime() > at);
  });
}

/**
 * Did the student belong to the group on this lesson?  With the lesson's start time ("HH:MM", Tashkent) it is exactly
 * the server's rule at the lesson start (`wasMemberAt`), so the journal and the frozen roster never disagree around the
 * day he joined or left.  A lesson with no start time cannot be placed on the clock: only then the rule falls back to
 * the business DAY - the day of `joined_at` is already inside, the day of `left_at` is already outside.  Nothing
 * known about the membership never shades a lesson.
 */
export function wasMemberOn(source: MembershipSource | null | undefined, lessonDate: string, startTime?: string | null): boolean {
  const start = businessWallTimeToInstant(lessonDate, startTime);
  if (start) return wasMemberAt(source, start);
  const periods = membershipPeriods(source);
  if (periods.length === 0) return true;
  return periods.some((period) => {
    const from = businessDay(period.joined_at);
    const to = businessDay(period.left_at);
    return (!from || lessonDate >= from) && (!to || lessonDate < to);
  });
}

/** «01.09.2026 – 30.09.2026, с 01.11.2026»: every stay on the business calendar, an open one as «с …». "" when there is none. */
export function formatMembershipPeriods(periods: ReadonlyArray<MembershipPeriod> | null | undefined): string {
  return (periods ?? [])
    .map((period) => {
      const from = formatUtcNaiveAsBusinessDate(period.joined_at);
      const to = formatUtcNaiveAsBusinessDate(period.left_at);
      if (from && to) return `${from} – ${to}`;
      if (from) return `с ${from}`;
      return to ? `до ${to}` : "";
    })
    .filter(Boolean)
    .join(", ");
}
