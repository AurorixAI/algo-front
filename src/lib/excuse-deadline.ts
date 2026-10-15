/**
 * Deadline of a pending excuse: payroll is monthly, so a decision must be made by the last day
 * of the month of the lesson (business calendar, Asia/Tashkent). Pure: the caller passes the
 * business date of "today" (`formatBusinessDate()`), so nothing here depends on the browser zone.
 */

import type { ChipTone } from "./chip-tone";

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

// ── Server deadline (N13 P1.5): before the student's next payment ────────────

/** `deadline` of an excuses-list item: dates and lesson counts only, never money. */
export type ServerExcuseDeadline =
  | { kind: "date"; date: string; overdue: boolean; days_left: number }
  | { kind: "lessons"; lessons_left: number; urgent: boolean; due_now?: boolean; overdue: boolean };

/** Words of a lessons package at the threshold (N = the owner's «осталось N урока(ов)» setting). */
export const LAST_LESSON_TO_CONFIRM = "последний урок для подтверждения";
export const DEADLINE_PASSED = "срок прошёл";

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

export interface ExcuseDeadlineView {
  text: string;
  /** Amber: the date has passed, or the last lesson to confirm in has come. */
  warn: boolean;
}

/** 1 урок, 2 урока, 5 уроков. */
export function lessonsWord(count: number): string {
  const n = Math.abs(Math.trunc(count));
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "уроков";
  if (last === 1) return "урок";
  if (last >= 2 && last <= 4) return "урока";
  return "уроков";
}

/** 1 день, 2 дня, 5 дней. */
export function daysWord(count: number): string {
  const n = Math.abs(Math.trunc(count));
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "дней";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

function isoDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value);
}

/**
 * The line under a pending excuse. The server value wins: «подтвердить до 25.10 · осталось 10 дн.»,
 * «… · последний день», «… · срок прошёл» (calendar payment, or the month end when nothing was paid),
 * «подтвердить до конца пакета · осталось 5 уроков» / «последний урок для подтверждения» / «… · срок прошёл»
 * (lessons package: more than N left / exactly N / fewer).
 * An older server sends no `deadline` (or something unreadable): the month-end rule is used instead.
 * Decided excuses have no line. Confirming after the deadline stays allowed - this is only a hint.
 */
export function excuseDeadlineView(
  item: { lesson_date: string | null | undefined; status: string; deadline?: ServerExcuseDeadline | null },
  today: string,
): ExcuseDeadlineView | null {
  if (item.status !== "pending") return null;
  // Whatever the server sent is checked field by field: a malformed value falls back to the month end.
  const server = item.deadline as unknown as Record<string, unknown> | null | undefined;
  if (server && server.kind === "date" && isoDay(server.date)) {
    const date = server.date;
    const label = `подтвердить до ${date.slice(8, 10)}.${date.slice(5, 7)}`;
    const left = typeof server.days_left === "number" && Number.isFinite(server.days_left)
      ? server.days_left
      : utcDay(date) - utcDay(today);
    if (server.overdue === true || left < 0) return { text: `${label} · срок прошёл`, warn: true };
    if (left === 0) return { text: `${label} · последний день`, warn: false };
    return { text: `${label} · осталось ${left} дн.`, warn: false };
  }
  if (server && server.kind === "lessons" && typeof server.lessons_left === "number" && Number.isFinite(server.lessons_left)) {
    const left = Math.max(0, server.lessons_left);
    const phase = lessonsPhase(server, left);
    if (phase === "overdue") return { text: `подтвердить до конца пакета · ${DEADLINE_PASSED}`, warn: true };
    if (phase === "due") return { text: LAST_LESSON_TO_CONFIRM, warn: true };
    return { text: `подтвердить до конца пакета · осталось ${left} ${lessonsWord(left)}`, warn: false };
  }
  const fallback = excuseDeadlineHint(item.lesson_date, item.status, today);
  return fallback ? { text: fallback.text, warn: fallback.overdue } : null;
}

// ── Compact chip of the «Срок» column (N13 P1.6) ─────────────────────────────

export interface ExcuseDeadlineChip {
  /** «до 31.10 · 16 дн.», «пакет: осталось 5 уроков», «последний урок для подтверждения», «срок прошёл». */
  text: string;
  /** neutral (grey) by default, warn (amber) when it is close, danger (red) when it is over. */
  tone: ChipTone;
  /** The longer sentence of `excuseDeadlineView` for the tooltip. */
  title: string;
}

/** Amber from this many days before a calendar deadline (a lessons package is amber exactly at N lessons). */
export const EXCUSE_DEADLINE_WARN_DAYS = 3;

function dayMonth(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

function upperFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * Short form of the deadline for the table and the cards. The server value wins (same checks as
 * `excuseDeadlineView`); an older server without `deadline` falls back to the month end.
 * null for anything but a pending excuse. Confirming after the deadline stays allowed - this is only a hint.
 */
export function excuseDeadlineChip(
  item: { lesson_date: string | null | undefined; status: string; deadline?: ServerExcuseDeadline | null },
  today: string,
): ExcuseDeadlineChip | null {
  const view = excuseDeadlineView(item, today);
  if (!view) return null;
  const title = upperFirst(view.text);
  const server = item.deadline as unknown as Record<string, unknown> | null | undefined;

  if (server && server.kind === "date" && isoDay(server.date)) {
    const left = typeof server.days_left === "number" && Number.isFinite(server.days_left)
      ? server.days_left
      : utcDay(server.date) - utcDay(today);
    return dateChip(server.date, left, server.overdue === true, title);
  }
  if (server && server.kind === "lessons" && typeof server.lessons_left === "number" && Number.isFinite(server.lessons_left)) {
    const left = Math.max(0, server.lessons_left);
    const phase = lessonsPhase(server, left);
    if (phase === "overdue") return { text: DEADLINE_PASSED, tone: "danger", title };
    if (phase === "due") return { text: LAST_LESSON_TO_CONFIRM, tone: "warn", title };
    return { text: `пакет: осталось ${left} ${lessonsWord(left)}`, tone: "neutral", title };
  }
  // No usable server value: the last day of the lesson's month.
  const date = excuseDeadline(item.lesson_date);
  if (!date) return null;
  const left = utcDay(date) - utcDay(today);
  if (Number.isNaN(left)) return null;
  return dateChip(date, left, false, title);
}

function dateChip(date: string, left: number, overdue: boolean, title: string): ExcuseDeadlineChip {
  if (overdue || left < 0) return { text: DEADLINE_PASSED, tone: "danger", title };
  const label = `до ${dayMonth(date)}`;
  if (left === 0) return { text: `${label} · сегодня`, tone: "warn", title };
  return { text: `${label} · ${left} дн.`, tone: left <= EXCUSE_DEADLINE_WARN_DAYS ? "warn" : "neutral", title };
}
