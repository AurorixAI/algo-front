/**
 * The time of a lesson against the clock of the centre, the names of the weekdays and the words of the lesson counts: ONE copy for the screens of the
 * teacher (the dashboard, the schedule, the group page).  Before WB-P3 each screen carried its own copy (F-A11).
 * No React and no network here, so node:test can load this file directly.
 */
import { businessTimeMinutes } from "./business-time";
import { pluralRu } from "./plural";

export const DAYS = [
  { id: 1, name: "Понедельник", short: "Пн" },
  { id: 2, name: "Вторник", short: "Вт" },
  { id: 3, name: "Среда", short: "Ср" },
  { id: 4, name: "Четверг", short: "Чт" },
  { id: 5, name: "Пятница", short: "Пт" },
  { id: 6, name: "Суббота", short: "Сб" },
  { id: 7, name: "Воскресенье", short: "Вс" },
];

const NO_TIME = {
  isLive: false,
  isUpcoming: false,
  isPast: false,
  canStart: false,
  diffMinutes: 0,
  startMinutes: 0,
  endMinutes: 0,
  isPastEndTime: false,
};

export function getLessonTimeStatus(
  lesson?: { startTime?: string; endTime?: string; dayOfWeek?: number } | null,
  todayDayOfWeek?: number,
  isAttendanceMarked?: boolean,
  isCompletedExplicitly?: boolean,
  nowMinutes: number = businessTimeMinutes(),
) {
  if (!lesson || !lesson.startTime || !lesson.endTime) return { type: "other_day" as const, ...NO_TIME };

  const isToday = lesson.dayOfWeek === todayDayOfWeek;
  if (!isToday) return { type: "other_day" as const, ...NO_TIME };

  if (isCompletedExplicitly) return { type: "completed" as const, ...NO_TIME, isPast: true };

  const [startH, startM] = (lesson.startTime || "00:00").split(":").map(Number);
  const [endH, endM] = (lesson.endTime || "00:00").split(":").map(Number);
  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 0) * 60 + (endM || 0);

  if (nowMinutes < startMinutes) {
    return {
      type: "upcoming" as const,
      ...NO_TIME,
      isUpcoming: true,
      diffMinutes: startMinutes - nowMinutes,
      startMinutes,
      endMinutes,
    };
  }
  // The lesson has started and is NOT finished until the teacher explicitly clicks «Завершить урок»
  return {
    type: "live" as const,
    ...NO_TIME,
    isLive: true,
    canStart: true,
    startMinutes,
    endMinutes,
    isPastEndTime: nowMinutes > endMinutes,
  };
}

/** «3 занятия» */
export function classCountLabel(count: number): string {
  return `${count} ${pluralRu(count, "занятие", "занятия", "занятий")}`;
}

/** «Завершено: 2 из 5 уроков» (after «из» the genitive: «из 1 урока», «из 5 уроков») */
export function completedLessonsProgressLabel(completed: number, total: number): string {
  const absolute = Math.abs(total) % 100;
  const isSingularGenitive = absolute % 10 === 1 && absolute !== 11;
  return `Завершено: ${completed} из ${total} ${isSingularGenitive ? "урока" : "уроков"}`;
}

/** «3 экзамена» */
export function formatExamQueueCount(count: number): string {
  return `${count} ${pluralRu(count, "экзамен", "экзамена", "экзаменов")}`;
}
