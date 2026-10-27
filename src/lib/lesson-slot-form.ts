/**
 * The weekly lesson form, shared by the teacher's schedule and by the group page of the owner / administrator (P1).
 * Pure helpers: no React, no network.  The words and the rules are the ones the teacher's screen always had.
 */
import type { LessonEvent } from "./api";
import { addIsoDays, businessDayOfWeek, businessWeekdayDate } from "./business-time";
import { MONTHS_RU_GENITIVE } from "./form-fields";
import { roomForSave } from "./schedule-slots";

/** The weekly lesson as the schedule screens and the shared dialogs know it (`LessonEvent` of the schedule, or an occurrence of it). */
export type WeeklyLesson = Pick<LessonEvent, "id" | "groupName" | "classLevel" | "dayOfWeek" | "startTime" | "endTime" | "room" | "format" | "color"> & { topic?: string; groupId?: string };

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

/** The time of one lesson: a weekly lesson of the form has one for all days, or - «Разное время по дням» - one of its own for each day. */
export interface TimeRange { startTime: string; endTime: string }
/** The time of each chosen weekday («Разное время по дням»); `null` = one time for all days. */
export type DayTimes = Record<number, TimeRange>;

/** One weekly lesson to save: its weekday, its time and the date it starts acting. */
export interface WeeklySlot extends TimeRange { day: number; validFrom: string }

/** «Разное время по дням» is offered for a weekly lesson on two days or more. */
export function canVaryTimes(scope: "recurring" | "one_off", days: readonly number[]): boolean {
  return scope === "recurring" && days.length >= 2;
}

/** The time of a day: its own when the times differ by day (and the day has one), else the shared one. */
export function timeOfDay(shared: TimeRange, perDay: DayTimes | null, day: number): TimeRange {
  return perDay?.[day] ?? { startTime: shared.startTime, endTime: shared.endTime };
}

/** The time of every chosen day, in the order of the week (the shared time for each when the times do not differ by day). */
export function dayTimesOf(days: readonly number[], shared: TimeRange, perDay: DayTimes | null): Array<TimeRange & { day: number }> {
  return [...days].sort((a, b) => a - b).map((day) => ({ day, ...timeOfDay(shared, perDay, day) }));
}

/** The toggle goes on: every chosen day starts with the time typed so far. */
export function seedDayTimes(days: readonly number[], shared: TimeRange): DayTimes {
  return Object.fromEntries(days.map((day) => [day, { startTime: shared.startTime, endTime: shared.endTime }]));
}

/**
 * The days changed: with fewer than two days the toggle disappears and the single day's own time becomes THE time (nothing typed is lost);
 * a day added later takes the shared time until it gets one of its own.
 */
export function reconcileDayTimes(days: readonly number[], perDay: DayTimes | null, shared: TimeRange): { perDay: DayTimes | null; shared: TimeRange } {
  if (!perDay || days.length >= 2) return { perDay, shared };
  const own = days.length === 1 ? perDay[days[0]] : undefined;
  return { perDay: null, shared: own ? { startTime: own.startTime, endTime: own.endTime } : shared };
}

/** The sentence about the time of a day, with its weekday when the times differ by day; null when the time is fine. */
export function dayTimeProblem(day: number, range: TimeRange, withDay: boolean): string | null {
  const problem = timeRangeProblem(range.startTime, range.endTime);
  return problem ? (withDay ? `${dayShort(day)}: ${problem}` : problem) : null;
}

/** «2 ноября» for «2026-11-02». */
export function dayMonthWords(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS_RU_GENITIVE[(month || 1) - 1]}`;
}

/** The quiet note under the form: today's lesson of that weekday has gone, the weekday starts a week later. */
export function shiftedDayNote(shifted: { day: number; from: string }): string {
  const name = (DAYS.find((item) => item.id === shifted.day)?.name ?? "").toLowerCase();
  return `${dayShort(shifted.day)}: сегодняшний урок уже прошёл — ${name} начнётся с ${dayMonthWords(shifted.from)}`;
}

/**
 * «Today's start has gone» - the ONE rule of the owner's, the administrator's and the teacher's form.  The server refuses a lesson of today
 * in the past, so a weekly lesson of today's weekday whose start has gone (and which acts from today) is sent with «Действует с» = the next
 * date of that weekday (today + 7 days): its first lesson is the next week's, nothing is dropped and nothing is blocked.  Every other chosen
 * day goes as it is.  A one-off lesson of today in the past stays blocked (`pastOneOff` is the sentence).
 * `times`: the time of each chosen day (for a one-off lesson - one entry with its time).
 */
export function pastDayPlan(o: {
  scope: "recurring" | "one_off"; times: ReadonlyArray<TimeRange & { day: number }>; validFrom: string; date: string;
  today: string; todayDay: number; nowMinutes: number;
}): { slots: WeeklySlot[]; shifted: { day: number; from: string } | null; pastOneOff: string | null } {
  const from = o.validFrom || o.today;
  const slots: WeeklySlot[] = [];
  let shifted: { day: number; from: string } | null = null;
  if (o.scope === "recurring") {
    for (const time of [...o.times].sort((a, b) => a.day - b.day)) {
      const gone = from === o.today && time.day === o.todayDay && pastTimeProblem(time.startTime, o.nowMinutes);
      const validFrom = gone ? addIsoDays(o.today, 7) : from;
      if (gone) shifted = { day: time.day, from: validFrom };
      slots.push({ ...time, validFrom });
    }
  }
  return {
    slots,
    shifted,
    pastOneOff: o.scope === "one_off" && o.date === o.today && o.times[0] ? pastTimeProblem(o.times[0].startTime, o.nowMinutes) : null,
  };
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
export function weeklyResultText(
  added: readonly number[],
  failed: ReadonlyArray<{ day: number; reason: string }>,
  words: { one: string; many: string; none: string } = { one: "добавлен", many: "добавлены", none: "Не добавлено" },
): string {
  if (failed.length === 0) return "";
  const bad = [...failed].sort((a, b) => a.day - b.day).map((item) => `${dayShort(item.day)} — ${item.reason}`).join("; ");
  if (added.length === 0) return `${words.none}: ${bad}`;
  return `${dayList(added)} ${added.length > 1 ? words.many : words.one}, ${bad}`;
}

/** The words of «изменено» for the same sentence («Пн и Ср изменены, Пт — преподаватель занят»). */
export const CHANGED_WORDS = { one: "изменён", many: "изменены", none: "Не изменено" };

// ── the state of a weekly lesson on a date, and what a change of it really changes ───────────────────────────────

/**
 * The weekly lesson as it stands ON a date (a revision that is already scheduled counts), from the occurrence of that date.  A moved
 * occurrence carries the time of the move: the weekly lesson itself keeps the planned one.
 */
export function snapshotFromOccurrence(
  occurrence: WeeklyLesson & { isRescheduled?: boolean; originalStartTime?: string | null; originalEndTime?: string | null; originalRoom?: string | null },
): WeeklyLesson {
  const moved = Boolean(occurrence.isRescheduled);
  return {
    id: occurrence.id,
    groupId: occurrence.groupId,
    groupName: occurrence.groupName,
    classLevel: occurrence.classLevel,
    dayOfWeek: occurrence.dayOfWeek,
    startTime: moved && occurrence.originalStartTime ? occurrence.originalStartTime : occurrence.startTime,
    endTime: moved && occurrence.originalEndTime ? occurrence.originalEndTime : occurrence.endTime,
    room: moved ? (occurrence.originalRoom ?? occurrence.room ?? null) : (occurrence.room ?? null),
    format: occurrence.format,
    color: occurrence.color,
    topic: occurrence.topic,
  };
}

/** The first occurrence of the weekly lesson `lessonId` (of `groupId`) in a list of occurrences, by date; null when there is none. */
export function firstOccurrenceOf<T extends { id: string; groupId: string; occurrenceDate: string }>(occurrences: readonly T[], groupId: string, lessonId: string): T | null {
  const own = occurrences.filter((item) => item.id === lessonId && item.groupId === groupId);
  if (own.length === 0) return null;
  return [...own].sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))[0];
}

export interface RevisionForm {
  day: number;
  startTime: string;
  endTime: string;
  room: string;
  format: LessonFormat;
  topic: string;
  color: LessonColor;
}

/**
 * Only the fields that differ from the lesson as it stands on the date of the change.  The server applies the patch to its own state
 * on that date, so a field that was not touched can never undo a revision that is already scheduled.
 */
export function revisionPatch(snapshot: WeeklyLesson, form: RevisionForm): {
  dayOfWeek?: number; startTime?: string; endTime?: string; room?: string; format?: LessonFormat; color?: LessonColor; topic?: string;
} {
  const patch: ReturnType<typeof revisionPatch> = {};
  if (form.day !== Number(snapshot.dayOfWeek)) patch.dayOfWeek = form.day;
  if (form.startTime !== snapshot.startTime) patch.startTime = form.startTime;
  if (form.endTime !== snapshot.endTime) patch.endTime = form.endTime;
  const room = roomForSave(form.room);
  if (room !== null && room !== (snapshot.room ?? "").trim()) patch.room = room;
  if (form.format !== (snapshot.format || "offline")) patch.format = form.format;
  if (form.color !== (snapshot.color || "blue")) patch.color = form.color;
  const topic = form.topic.trim();
  if (topic !== (snapshot.topic ?? "").trim() && topic) patch.topic = topic;
  return patch;
}

const ROOM_WORD = /^(?:кабинет|каб)(?:\.\s*|\s+)(\S.*)$/iu;

/**
 * «каб. 12» for a room given as a number or a code, and for «Кабинет 5» / «кабинет 5» / «Каб. 5» / «каб 5» (one way of writing it on every screen);
 * a room that begins with another word («Зал», «Малый зал», «Актовый зал») is shown as it is.  Display only: what is saved is not changed.
 */
export function roomWithPrefix(room: string): string {
  const text = room.trim();
  const word = ROOM_WORD.exec(text);
  if (word) return `каб. ${word[1]}`;
  return /^\p{L}/u.test(text) ? text : `каб. ${text}`;
}

/**
 * The patch of a new start time: the end follows it (+90 minutes) only while nobody has typed an end of his own, and a start that did
 * not change (a blur repeats it) changes nothing.  null: no change at all.
 */
export function startTimePatch(current: { startTime: string }, startTime: string, endTyped: boolean): { startTime: string; endTime?: string } | null {
  if (startTime === current.startTime) return null;
  const endTime = endTimeAfter(startTime);
  return endTime && !endTyped ? { startTime, endTime } : { startTime };
}

/** An end that is not empty was typed (or pasted) by the user; an emptied one gives the start its say again. */
export function isEndTyped(endTime: string): boolean {
  return endTime !== "";
}

/**
 * What a change applied to the other weekly lessons of the group may carry: the time, the room, the format, the topic - never the day or the
 * colour.  The time goes as a pair (a new start alone could fall after the end of another day's lesson).
 */
export function sharedRevisionPatch(
  patch: ReturnType<typeof revisionPatch>,
  time: { startTime: string; endTime: string },
): { startTime?: string; endTime?: string; room?: string; format?: LessonFormat; topic?: string } {
  const out: ReturnType<typeof sharedRevisionPatch> = {};
  if (patch.startTime !== undefined || patch.endTime !== undefined) { out.startTime = time.startTime; out.endTime = time.endTime; }
  if (patch.room !== undefined) out.room = patch.room;
  if (patch.format !== undefined) out.format = patch.format;
  if (patch.topic !== undefined) out.topic = patch.topic;
  return out;
}

/** The part of a shared change that is really new for this lesson (the server refuses a revision without a difference). */
export function patchFor(
  target: Pick<WeeklyLesson, "startTime" | "endTime" | "room" | "format" | "topic">,
  shared: ReturnType<typeof sharedRevisionPatch>,
): ReturnType<typeof sharedRevisionPatch> {
  const current = { startTime: target.startTime, endTime: target.endTime, room: target.room ?? "", format: target.format || "offline", topic: target.topic || "" };
  const out: ReturnType<typeof sharedRevisionPatch> = {};
  if (shared.startTime !== undefined && (shared.startTime !== current.startTime || shared.endTime !== current.endTime)) { out.startTime = shared.startTime; out.endTime = shared.endTime; }
  if (shared.room !== undefined && (shared.room ?? "") !== current.room) out.room = shared.room;
  if (shared.format !== undefined && shared.format !== current.format) out.format = shared.format;
  if (shared.topic !== undefined && (shared.topic ?? "") !== current.topic) out.topic = shared.topic;
  return out;
}
