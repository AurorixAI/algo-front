/**
 * O1 / O11 (LOGIC-B): a recurring slot has a start date («Действует с»), a room is optional and never invented.
 * Pure helpers of the schedule screens.
 */
import { addIsoDays, formatIsoDateLabel } from "./business-time";

/** `validFrom` of a new slot may be today .. today + 365 days (the server answers 422 VALID_FROM_PAST for the past). */
export const VALID_FROM_MAX_DAYS = 365;

export const VALID_FROM_HINT = "До этой даты уроков в журнале не будет.";
export const ROOM_LABEL = "Кабинет (необязательно)";
export const ROOM_PLACEHOLDER = "Например: 12";
export const ROOM_NOT_SET = "Кабинет не указан";
export const ONLINE_LABEL = "Онлайн";

export function validFromBounds(today: string): { min: string; max: string } {
  return { min: today, max: addIsoDays(today, VALID_FROM_MAX_DAYS) };
}

/** null when the chosen date is fine; else the sentence under the field. A blank value means «today» (the server default). */
export function validFromError(value: string, today: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Укажите дату начала";
  const { min, max } = validFromBounds(today);
  if (value < min) return "Дата начала не может быть в прошлом";
  if (value > max) return "Дата начала — не позже чем через год";
  return null;
}

/** The room as the server stores it: blank is `null` (the screen then says «Кабинет не указан»). */
export function roomForSave(room: string | null | undefined): string | null {
  const text = (room ?? "").trim();
  return text ? text : null;
}

/** What a lesson says about its place: «Онлайн», the room, or «Кабинет не указан» - never an invented «Кабинет 204». */
export function roomLabel(lesson: { format?: string | null; room?: string | null }): string {
  if (lesson.format === "online") return ONLINE_LABEL;
  const room = (lesson.room ?? "").trim();
  return room || ROOM_NOT_SET;
}

/** True when the lesson has a real room to print (the map pin is not shown for «Кабинет не указан»). */
export function hasRoom(lesson: { format?: string | null; room?: string | null }): boolean {
  return lesson.format !== "online" && Boolean((lesson.room ?? "").trim());
}

/** «с 26.10» for a slot that starts in the future; null when it already acts (or has no date: an older server). */
export function validFromBadge(validFrom: string | null | undefined, today: string): string | null {
  if (!validFrom || !/^\d{4}-\d{2}-\d{2}$/.test(validFrom) || validFrom <= today) return null;
  return `с ${formatIsoDateLabel(validFrom, { day: "2-digit", month: "2-digit" })}`;
}

/** The first date the form offers: the day of the week the slot repeats on, on or after `from`. Used to tell the user when the first lesson is. */
export function firstOccurrenceOnOrAfter(from: string, dayOfWeek: number): string {
  for (let offset = 0; offset < 7; offset += 1) {
    const day = addIsoDays(from, offset);
    const date = new Date(`${day}T12:00:00Z`).getUTCDay();
    const iso = date === 0 ? 7 : date;
    if (iso === dayOfWeek) return day;
  }
  return from;
}
