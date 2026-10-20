/**
 * Deadline of a pending excuse: payroll is monthly, so a decision must be made by the last day
 * of the month of the lesson (business calendar, Asia/Tashkent). Pure: the caller passes the
 * business date of "today" (`formatBusinessDate()`), so nothing here depends on the browser zone.
 */

import type { ChipTone } from "./chip-tone";
import { leftPhrase, pluralRu } from "./plural";

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

// ── Server deadline (N13 P1.5): before the student's next payment ────────────

/** `deadline` of an excuses-list item: dates and lesson counts only, never money. */
export type ServerExcuseDeadline =
  | { kind: "date"; date: string; overdue: boolean; days_left: number }
  | { kind: "lessons"; lessons_left: number; urgent: boolean; due_now?: boolean; overdue: boolean };

type LessonsPhase = "ok" | "due" | "overdue";

/**
 * Where a lessons package stands: more than N lessons left is `ok`, exactly N is `due` (the last lesson to
 * confirm in), fewer is `overdue`. `due_now` / `overdue` come from the server; an older server that sent
 * only `urgent` is read as `due`, and an empty package that nobody called due counts as `overdue`.
 */
function lessonsPhase(server: Record<string, unknown>, left: number): LessonsPhase {
  if (server.overdue === true) return "overdue";
  if (server.due_now === true) return "due";
  if (left === 0) return "overdue";
  if (server.due_now === undefined && server.urgent === true) return "due";
  return "ok";
}

function isoDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value);
}

/** The confirmation deadline of a pending excuse has passed: the day it was due by, or null when it is a lessons package (no date). */
export interface ExcuseDeadlinePassed {
  date: string | null;
}

/**
 * Has the deadline passed - exactly when the «Срок» cell is red (same checks, same fallback to the month end)?
 * null for a decided excuse, for one whose deadline is not known, and while there is still time (including the last day and,
 * for a package, the last lesson to confirm in).  Confirming after the deadline stays allowed - this only informs the dialog.
 */
export function excuseDeadlinePassed(
  item: { lesson_date: string | null | undefined; status: string; deadline?: ServerExcuseDeadline | null },
  today: string,
): ExcuseDeadlinePassed | null {
  if (item.status !== "pending") return null;
  const server = item.deadline as unknown as Record<string, unknown> | null | undefined;
  if (server && server.kind === "date" && isoDay(server.date)) {
    const left = typeof server.days_left === "number" && Number.isFinite(server.days_left)
      ? server.days_left
      : utcDay(server.date) - utcDay(today);
    return server.overdue === true || left < 0 ? { date: server.date } : null;
  }
  if (server && server.kind === "lessons" && typeof server.lessons_left === "number" && Number.isFinite(server.lessons_left)) {
    return lessonsPhase(server, Math.max(0, server.lessons_left)) === "overdue" ? { date: null } : null;
  }
  // an older server: the last day of the lesson's month
  const monthEnd = excuseDeadline(item.lesson_date);
  return monthEnd && utcDay(monthEnd) - utcDay(today) < 0 ? { date: monthEnd } : null;
}

// ── The «Срок» column in human words (UX-1 B) ────────────────────────────────

/** Amber from this many days before a calendar deadline (a lessons package is amber exactly at N lessons). */
export const EXCUSE_DEADLINE_SOON_DAYS = 7;

export interface ExcuseDeadlineCell {
  /** «Осталось 25 дней» / «Срок сегодня» / «Срок прошёл 3 дня назад» / «Осталось 5 уроков» / «Последний урок для подтверждения». */
  headline: string;
  /** The small line under it: «до 31.10» (the year only when it is not this year) or «по пакету уроков». */
  sub: string;
  /** neutral: more than 7 days; warn (amber): 7 days or less, today, the last lesson; danger (red): passed. */
  tone: ChipTone;
  /** The tooltip: the whole sentence with the full date. */
  title: string;
  /** Sort key, smaller = more urgent: passed (the longest ago first), then today, then the nearest date. */
  urgency: number;
}

type DeadlineSource = { lesson_date: string | null | undefined; status: string; deadline?: ServerExcuseDeadline | null };

/** «31.10»; with the year («31.10.2027») when it is not the year of `today`. */
function deadlineDate(date: string, today: string): string {
  const short = dayMonth(date);
  return date.slice(0, 4) === today.slice(0, 4) ? short : `${short}.${date.slice(0, 4)}`;
}

function dayMonth(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

const PACKAGE_SUB = "по пакету уроков";
const AFTER_DEADLINE_TOO = "После срока решение тоже можно принять.";

function dateCell(date: string, left: number, overdueFlag: boolean, today: string): ExcuseDeadlineCell {
  const sub = `до ${deadlineDate(date, today)}`;
  const title = `Подтвердить пропуск нужно до ${dayMonth(date)}.${date.slice(0, 4)}. ${AFTER_DEADLINE_TOO}`;
  if (overdueFlag || left < 0) {
    const ago = left < 0 ? -left : 0;
    const headline = ago > 0 ? `Срок прошёл ${ago} ${pluralRu(ago, "день", "дня", "дней")} назад` : "Срок прошёл";
    return { headline, sub, tone: "danger", title, urgency: ago > 0 ? left : -0.5 };
  }
  if (left === 0) return { headline: "Срок сегодня", sub, tone: "warn", title, urgency: 0 };
  return {
    headline: leftPhrase(left, "день", "дня", "дней"),
    sub,
    tone: left <= EXCUSE_DEADLINE_SOON_DAYS ? "warn" : "neutral",
    title,
    urgency: left,
  };
}

/**
 * The «Срок» cell of a pending excuse in words a person reads at a glance (the server value wins, same checks as
 * `excuseDeadlinePassed`; an older server without `deadline` falls back to the last day of the lesson's month).
 * null for anything but a pending excuse (or an unreadable date).  Confirming after the deadline stays allowed - this is only a hint.
 */
export function excuseDeadlineCell(item: DeadlineSource, today: string): ExcuseDeadlineCell | null {
  if (item.status !== "pending") return null;
  const server = item.deadline as unknown as Record<string, unknown> | null | undefined;

  if (server && server.kind === "date" && isoDay(server.date)) {
    const left = typeof server.days_left === "number" && Number.isFinite(server.days_left)
      ? server.days_left
      : utcDay(server.date) - utcDay(today);
    if (Number.isNaN(left)) return null;
    return dateCell(server.date, left, server.overdue === true, today);
  }

  if (server && server.kind === "lessons" && typeof server.lessons_left === "number" && Number.isFinite(server.lessons_left)) {
    const left = Math.max(0, server.lessons_left);
    const phase = lessonsPhase(server, left);
    const title = `Срок считается по урокам пакета ученика, а не по дате. ${AFTER_DEADLINE_TOO}`;
    if (phase === "overdue") return { headline: "Срок прошёл", sub: PACKAGE_SUB, tone: "danger", title, urgency: -0.5 };
    if (phase === "due") return { headline: "Последний урок для подтверждения", sub: PACKAGE_SUB, tone: "warn", title, urgency: 0.5 };
    return {
      headline: leftPhrase(left, "урок", "урока", "уроков"),
      sub: PACKAGE_SUB,
      tone: "neutral",
      title,
      // a package has no date: it goes after every date that is amber or red
      urgency: EXCUSE_DEADLINE_SOON_DAYS + 1 + left,
    };
  }

  // No usable server value: the last day of the lesson's month.
  const date = excuseDeadline(item.lesson_date);
  if (!date) return null;
  const left = utcDay(date) - utcDay(today);
  if (Number.isNaN(left)) return null;
  return dateCell(date, left, false, today);
}

/**
 * The excuses in the order they must be looked at: the deadline that has passed first (the longest ago first), then today,
 * then the nearest; a package after the dates; an excuse without a known deadline last.  A new array; equal ones keep their order.
 */
export function sortExcusesByUrgency<T extends DeadlineSource>(items: readonly T[], today: string): T[] {
  return items
    .map((item, index) => ({ item, index, key: excuseDeadlineCell(item, today)?.urgency ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => (a.key === b.key ? a.index - b.index : a.key < b.key ? -1 : 1))
    .map((entry) => entry.item);
}
