/**
 * Deadline of a pending excuse: payroll is monthly, so a decision must be made by the last day
 * of the month of the lesson (business calendar, Asia/Tashkent). Pure: the caller passes the
 * business date of "today" (`formatBusinessDate()`), so nothing here depends on the browser zone.
 */

const DAY_MS = 86_400_000;

function utcDay(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS : NaN;
}

/** Last day (YYYY-MM-DD) of the month of the lesson, or null when the date is invalid. */
export function excuseDeadline(lessonDate: string | null | undefined): string | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])-\d{2}/.exec(lessonDate ?? "");
  if (!match) return null;
  const last = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  return `${match[1]}-${match[2]}-${String(last).padStart(2, "0")}`;
}

export interface ExcuseDeadlineHint {
  /** «подтвердить до 31.10 · осталось 16 дн.» / «… · последний день» / «… · срок прошёл». */
  text: string;
  overdue: boolean;
  /** Whole days left (0 on the deadline day), negative when overdue. */
  daysLeft: number;
}

/** null for anything but a pending excuse (or an invalid date): decided excuses have no deadline. */
export function excuseDeadlineHint(
  lessonDate: string | null | undefined,
  status: string,
  today: string,
): ExcuseDeadlineHint | null {
  if (status !== "pending") return null;
  const deadline = excuseDeadline(lessonDate);
  if (!deadline) return null;
  const daysLeft = utcDay(deadline) - utcDay(today);
  if (Number.isNaN(daysLeft)) return null;
  const label = `подтвердить до ${deadline.slice(8, 10)}.${deadline.slice(5, 7)}`;
  if (daysLeft < 0) return { text: `${label} · срок прошёл`, overdue: true, daysLeft };
  if (daysLeft === 0) return { text: `${label} · последний день`, overdue: false, daysLeft };
  return { text: `${label} · осталось ${daysLeft} дн.`, overdue: false, daysLeft };
}
