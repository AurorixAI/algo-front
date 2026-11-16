/**
 * Money-2 wave 2 (А6): ONE line of the weekly schedule of a group for the card in the windows of an enrolment and a transfer: «Пн · Ср · Пт · 16:00–17:00» (the same time on every day),
 * «Пн 16:00 · Ср 17:30» (the time differs), «расписание не задано».  Pure; the days are those of `DAYS` (the same names as the schedule of the teacher).
 */
import { DAYS } from "./schedule-time";

export const NO_SCHEDULE_TEXT = "расписание не задано";

export interface ScheduleSlotLike {
  dayOfWeek?: number;
  day_of_week?: number;
  startTime?: string;
  start_time?: string;
  endTime?: string;
  end_time?: string;
  room?: string | null;
  format?: string | null;
}

interface Slot { day: number; start: string; end: string }

const hhmm = (value: unknown): string => (typeof value === "string" ? value.slice(0, 5) : "");

function slotsOf(schedule: ReadonlyArray<ScheduleSlotLike> | null | undefined): Slot[] {
  const seen = new Set<string>();
  const slots: Slot[] = [];
  for (const raw of schedule ?? []) {
    const day = Number(raw?.dayOfWeek ?? raw?.day_of_week);
    const start = hhmm(raw?.startTime ?? raw?.start_time);
    const end = hhmm(raw?.endTime ?? raw?.end_time);
    if (!Number.isInteger(day) || day < 1 || day > 7 || !start) continue;
    const key = `${day}|${start}|${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({ day, start, end });
  }
  return slots.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
}

const dayName = (day: number) => DAYS.find((item) => item.id === day)?.short ?? String(day);

export function groupScheduleLine(schedule: ReadonlyArray<ScheduleSlotLike> | null | undefined): string {
  const slots = slotsOf(schedule);
  if (slots.length === 0) return NO_SCHEDULE_TEXT;
  const same = slots.every((slot) => slot.start === slots[0].start && slot.end === slots[0].end);
  if (same) {
    const days = [...new Set(slots.map((slot) => dayName(slot.day)))].join(" · ");
    return `${days} · ${slots[0].start}${slots[0].end ? `–${slots[0].end}` : ""}`;
  }
  return slots.map((slot) => `${dayName(slot.day)} ${slot.start}`).join(" · ");
}

/** The room and the format of the lessons («Каб. 12 · онлайн») for the part under «Подробнее»; null when the schedule says neither. */
export function groupPlaceLine(schedule: ReadonlyArray<ScheduleSlotLike> | null | undefined): string | null {
  const rooms = [...new Set((schedule ?? []).map((slot) => (typeof slot?.room === "string" ? slot.room.trim() : "")).filter(Boolean))];
  const formats = [...new Set((schedule ?? []).map((slot) => slot?.format).filter((format): format is string => format === "online" || format === "offline"))];
  const parts = [...rooms, ...formats.map((format) => (format === "online" ? "онлайн" : "очно"))];
  return parts.length > 0 ? parts.join(" · ") : null;
}
