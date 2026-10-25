/**
 * The weekly lesson form, shared by the teacher's schedule and by the group page of the owner / administrator (P1).
 * Pure helpers: no React, no network.  The words and the rules are the ones the teacher's screen always had.
 */
import type { LessonEvent } from "./api";
import { businessDayOfWeek, businessWeekdayDate } from "./business-time";

export type LessonColor = LessonEvent["color"];
export type LessonFormat = LessonEvent["format"];

export const LESSON_COLORS: readonly LessonColor[] = ["blue", "indigo", "purple", "emerald", "amber", "rose"];

export const COLOR_CLASSES = {
  blue: {
    bg: "bg-blue-50/90 hover:bg-blue-100/90 border-blue-200/80 text-blue-900",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
    border: "border-l-blue-500",
  },
  indigo: {
    bg: "bg-indigo-50/90 hover:bg-indigo-100/90 border-indigo-200/80 text-indigo-900",
    badge: "bg-indigo-100 text-indigo-700",
    dot: "bg-indigo-500",
    border: "border-l-indigo-500",
  },
  purple: {
    bg: "bg-purple-50/90 hover:bg-purple-100/90 border-purple-200/80 text-purple-900",
    badge: "bg-purple-100 text-purple-700",
    dot: "bg-purple-500",
    border: "border-l-purple-500",
  },
  emerald: {
    bg: "bg-emerald-50/90 hover:bg-emerald-100/90 border-emerald-200/80 text-emerald-900",
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
    border: "border-l-emerald-500",
  },
  amber: {
    bg: "bg-amber-50/90 hover:bg-amber-100/90 border-amber-200/80 text-amber-900",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
    border: "border-l-amber-500",
  },
  rose: {
    bg: "bg-rose-50/90 hover:bg-rose-100/90 border-rose-200/80 text-rose-900",
    badge: "bg-rose-100 text-rose-700",
    dot: "bg-rose-500",
    border: "border-l-rose-500",
  },
} as const;

// Accessible names of the colour dots (the dots themselves carry no text).
export const COLOR_NAMES: Record<string, string> = {
  blue: "Синий",
  indigo: "Индиго",
  purple: "Фиолетовый",
  emerald: "Зелёный",
  amber: "Янтарный",
  rose: "Розовый",
};

export const DAYS = [
  { id: 1, name: "Понедельник", short: "Пн" },
  { id: 2, name: "Вторник", short: "Вт" },
  { id: 3, name: "Среда", short: "Ср" },
  { id: 4, name: "Четверг", short: "Чт" },
  { id: 5, name: "Пятница", short: "Пт" },
  { id: 6, name: "Суббота", short: "Сб" },
  { id: 7, name: "Воскресенье", short: "Вс" },
];

export const FORMAT_OPTIONS = [
  { value: "offline", label: "Офлайн в классе" },
  { value: "online", label: "Онлайн (Zoom)" },
];

/** ALGO schedules mathematics groups only: the stored subject is fixed, the form shows no choice of it. */
export const LESSON_SUBJECT = "Математика";

/** The group has no teacher: the weekly lesson is saved all the same, and appears in a teacher's schedule once somebody is assigned. */
export const NO_TEACHER_SCHEDULE_HINT = "Назначьте преподавателя группе, чтобы уроки появились у него в расписании";

export const END_BEFORE_START_TEXT = "Окончание должно быть позже начала";
export const DAY_REQUIRED_TEXT = "Выберите день недели";
export const TIME_REQUIRED_TEXT = "Укажите время начала и окончания";

/** First calendar date on which a regular schedule change may take effect (tomorrow, or Monday after Sunday). */
export function nextBusinessDate(): string {
  const todayDay = businessDayOfWeek();
  return businessWeekdayDate(todayDay === 7 ? 1 : todayDay + 1, todayDay === 7 ? 1 : 0);
}

/** `start` + `minutes` as «ЧЧ:ММ» (a lesson is 90 minutes unless said otherwise); "" when `start` is not a time. */
export function endTimeAfter(start: string, minutes = 90): string {
  if (!start || !start.includes(":")) return "";
  const [h, m] = start.split(":").map(Number);
  const total = (h || 0) * 60 + (m || 0) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Default time of a new lesson of a day: after the latest lesson already there, else 10:00–11:30. */
export function suggestedTimes(dayLessons: Array<{ endTime: string }>): { startTime: string; endTime: string } {
  if (dayLessons.length === 0) return { startTime: "10:00", endTime: "11:30" };
  const latest = [...dayLessons].sort((a, b) => b.endTime.localeCompare(a.endTime))[0].endTime;
  const [h, m] = latest.split(":").map(Number);
  return { startTime: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, endTime: endTimeAfter(latest) };
}

/** The lesson of the same day that overlaps the given time (not the lesson `excludeId` itself). */
export function overlappingLesson<T extends { id: string; dayOfWeek: number; startTime: string; endTime: string }>(
  lessons: readonly T[],
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  excludeId?: string,
): T | undefined {
  return lessons.find((lesson) => {
    if (excludeId && lesson.id === excludeId) return false;
    if (lesson.dayOfWeek !== dayOfWeek) return false;
    return startTime < lesson.endTime && endTime > lesson.startTime;
  });
}

/** The sentence when a lesson would start in the past of today (the day is today and the start time has gone), else null. */
export function pastTimeProblem(startTime: string, nowMinutes: number): string | null {
  const [h, m] = (startTime || "00:00").split(":").map(Number);
  if ((h || 0) * 60 + (m || 0) >= nowMinutes) return null;
  const now = `${String(Math.floor(nowMinutes / 60)).padStart(2, "0")}:${String(nowMinutes % 60).padStart(2, "0")}`;
  return `Нельзя назначить урок на прошедшее время сегодняшнего дня (текущее время: ${now})`;
}

/** null when the times are fine; else the sentence under the fields (empty, or the end is not after the start). */
export function timeRangeProblem(startTime: string, endTime: string): string | null {
  if (!startTime || !endTime) return TIME_REQUIRED_TEXT;
  if (endTime <= startTime) return END_BEFORE_START_TEXT;
  return null;
}

// ── several weekdays at once ─────────────────────────────────────────────────────────────────────────────────────

export const DAYS_REQUIRED_HINT = "Выберите день";

/** «Пн» for 1 .. «Вс» for 7. */
export function dayShort(day: number): string {
  return DAYS.find((item) => item.id === day)?.short ?? String(day);
}

/** «Пн», «Пн и Ср», «Пн, Ср и Пт» (the days in the order of the week). */
export function dayList(days: readonly number[]): string {
  const names = [...days].sort((a, b) => a - b).map(dayShort);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`;
}

/** The days with `day` switched on / off, in the order of the week. */
export function toggleDay(days: readonly number[], day: number): number[] {
  return (days.includes(day) ? days.filter((item) => item !== day) : [...days, day]).sort((a, b) => a - b);
}

/**
 * What a save of several weekly lessons says, with no silent partial success: «Пн и Ср добавлены, Пт — преподаватель занят».
 * "" when nothing failed (the caller then shows its plain success text).
 */
export function weeklyResultText(added: readonly number[], failed: ReadonlyArray<{ day: number; reason: string }>): string {
  if (failed.length === 0) return "";
  const bad = [...failed].sort((a, b) => a.day - b.day).map((item) => `${dayShort(item.day)} — ${item.reason}`).join("; ");
  if (added.length === 0) return `Не добавлено: ${bad}`;
  return `${dayList(added)} ${added.length > 1 ? "добавлены" : "добавлен"}, ${bad}`;
}
