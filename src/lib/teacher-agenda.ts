/**
 * The teacher's day on the dashboard: ONE place that says which lessons count and what the teacher does next (#158, LESSONS 38).
 *
 * The card «Ближайшее действие», the tile «Уроков сегодня», the tile «Требуют действия» and «Группы в фокусе» all read the same list:
 * a lesson that is cancelled, moved away or led by a substitute is not a lesson of the teacher's day.
 * Pure functions: no React, no network, the clock comes in as `nowMinutes` (business time).
 */
import { outOfPlan } from "./schedule-plan";

export type LifecycleStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

/** What the functions need to know about a lesson (`LessonSummary` and `ScheduleOccurrence` both fit). */
export interface AgendaLessonLike {
  id: string;
  groupId?: string;
  groupName?: string;
  startTime: string;
  endTime: string;
  occurrenceDate?: string;
  replacedBy?: { id: string; name: string } | null;
  substitutionOutcome?: { kind: "rescheduled" | "cancelled" } | null;
}

/** «14:05» -> 845; null when the time cannot be read. */
export function minutesOfTime(time: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec((time ?? "").trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** A lesson of the teacher's plan: not cancelled, not moved away, not led by a substitute (he has nothing to start in it). */
export function onAgenda(lesson: Pick<AgendaLessonLike, "replacedBy" | "substitutionOutcome">, status: LifecycleStatus): boolean {
  if (lesson.replacedBy) return false;
  return outOfPlan({ status, outcome: lesson.substitutionOutcome }) === null;
}

/**
 * done        - the journal is closed;
 * in_progress - started, not closed;
 * to_start    - the time has come (from the minute of the start to the minute of the end), not started;
 * upcoming    - before the start;
 * missed      - the end has passed and the lesson was never started (the server returns it as «Разобрать пропущенный урок»).
 */
export type AgendaPhase = "done" | "in_progress" | "to_start" | "upcoming" | "missed";

export interface AgendaEntry<L> {
  lesson: L;
  status: LifecycleStatus;
  phase: AgendaPhase;
  /** Minutes to the start; 0 once it has begun. */
  minutesToStart: number;
}

export interface TodayAgenda<L> {
  /** The lessons of the day that count, by start time. */
  entries: AgendaEntry<L>[];
  total: number;
  /** Not closed and not missed: in progress, to start, upcoming. */
  remaining: number;
  /** Before the start, nearest first. */
  upcoming: AgendaEntry<L>[];
}

function phaseOf(status: LifecycleStatus, startMinutes: number | null, endMinutes: number | null, nowMinutes: number): AgendaPhase {
  if (status === "completed") return "done";
  if (status === "in_progress") return "in_progress";
  if (startMinutes !== null && nowMinutes < startMinutes) return "upcoming";
  if (endMinutes !== null && nowMinutes > endMinutes) return "missed";
  return "to_start";
}

export function todayAgenda<L extends AgendaLessonLike>(
  lessons: readonly L[],
  statusOf: (lesson: L) => LifecycleStatus,
  nowMinutes: number,
): TodayAgenda<L> {
  const entries: AgendaEntry<L>[] = [];
  for (const lesson of lessons) {
    const status = statusOf(lesson);
    if (!onAgenda(lesson, status)) continue;
    const start = minutesOfTime(lesson.startTime);
    const phase = phaseOf(status, start, minutesOfTime(lesson.endTime), nowMinutes);
    entries.push({ lesson, status, phase, minutesToStart: phase === "upcoming" && start !== null ? start - nowMinutes : 0 });
  }
  entries.sort((a, b) => (a.lesson.startTime || "").localeCompare(b.lesson.startTime || ""));
  const upcoming = entries.filter((entry) => entry.phase === "upcoming");
  return {
    entries,
    total: entries.length,
    remaining: entries.filter((entry) => entry.phase === "in_progress" || entry.phase === "to_start" || entry.phase === "upcoming").length,
    upcoming,
  };
}

/** «Уроков сегодня»: «3», and «осталось 1» beside it. */
export function lessonsTodayTile(agenda: Pick<TodayAgenda<unknown>, "total" | "remaining">): { value: number; note: string | null } {
  return { value: agenda.total, note: agenda.total > 0 ? `осталось ${agenda.remaining}` : null };
}

// ── the next step ──────────────────────────────────────────────────────────────────────────────────────

/** An action the server or the clock gives (`LessonAction` of the dashboard). */
export interface StepActionLike {
  lesson: Pick<AgendaLessonLike, "startTime" | "occurrenceDate">;
  tone: "rose" | "amber" | "emerald";
  actionType?: "in_progress" | "missed";
}

/** 0 a missed or an old journal (red), 1 a lesson in progress, 2 a lesson whose time has come. */
export function actionRank(action: Pick<StepActionLike, "tone" | "actionType">): 0 | 1 | 2 {
  if (action.tone === "rose") return 0;
  return action.actionType === "in_progress" ? 1 : 2;
}

/** Red first, then the lesson in progress, then the one to start; inside a group of the same rank - by date and time. */
export function orderActions<A extends StepActionLike>(actions: readonly A[], today: string): A[] {
  return [...actions].sort((left, right) => {
    const byRank = actionRank(left) - actionRank(right);
    if (byRank !== 0) return byRank;
    return `${left.lesson.occurrenceDate || today}T${left.lesson.startTime}`.localeCompare(`${right.lesson.occurrenceDate || today}T${right.lesson.startTime}`);
  });
}

export interface LaterLesson {
  date: string;
  startTime: string;
  groupName: string;
}

export type NextStep<A, L, E> =
  | { kind: "action"; action: A }
  | { kind: "upcoming"; entry: AgendaEntry<L>; more: number }
  | { kind: "exam_active"; exam: E }
  | { kind: "exam_attention"; exam: E }
  | { kind: "failed" }
  | { kind: "closed"; later: LaterLesson | null };

/**
 * «Ближайшее действие» (#158): the first match of
 *   1-3 a missed / old journal, a lesson in progress, a lesson to start;  4 the nearest lesson of today before its start;
 *   5 a running exam, then an exam that needs a decision;  6 «На сегодня всё закрыто».
 * A failed load never says «всё закрыто» (and does not promise a lesson from stale data): it says it could not check.
 */
export function pickNextStep<A extends StepActionLike, L extends AgendaLessonLike, E>(input: {
  actions: readonly A[];
  agenda: Pick<TodayAgenda<L>, "upcoming">;
  activeExam: E | null;
  attentionExam: E | null;
  loadFailed: boolean;
  today: string;
  later: LaterLesson | null;
}): NextStep<A, L, E> {
  const [action] = orderActions(input.actions, input.today);
  if (action) return { kind: "action", action };
  const [nearest] = input.agenda.upcoming;
  if (nearest && !input.loadFailed) return { kind: "upcoming", entry: nearest, more: input.agenda.upcoming.length - 1 };
  if (input.activeExam) return { kind: "exam_active", exam: input.activeExam };
  if (input.attentionExam) return { kind: "exam_attention", exam: input.attentionExam };
  if (input.loadFailed) return { kind: "failed" };
  return { kind: "closed", later: input.later };
}

/** «через 40 мин» / «через 2 ч 10 мин» (non-breaking spaces inside a duration, as everywhere on the dashboard). */
export function startsInText(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  const text = hours === 0 ? `${rounded} мин` : rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
  return `через ${text}`;
}

/** «и ещё 2 сегодня». */
export function moreTodayText(more: number): string | null {
  return more > 0 ? `и ещё ${more} сегодня` : null;
}

/**
 * The nearest lesson that is still ahead of the teacher: a later day, or today's lesson that is in progress / not over.
 * The status of a lesson is known for TODAY only (the map is by lesson id, and a weekly lesson keeps its id on every date).
 * `groupId` narrows it to one group («Группы в фокусе»).
 */
export function nextLessonAhead<L extends AgendaLessonLike & { occurrenceDate: string }>(input: {
  lessons: readonly L[];
  today: string;
  nowMinutes: number;
  todayStatusOf: (lesson: L) => LifecycleStatus;
  groupId?: string;
}): { lesson: L; live: boolean } | null {
  const candidates: { lesson: L; live: boolean }[] = [];
  for (const lesson of input.lessons) {
    if (input.groupId && lesson.groupId !== input.groupId) continue;
    if (lesson.occurrenceDate < input.today) continue;
    if (lesson.occurrenceDate > input.today) {
      if (onAgenda(lesson, "scheduled")) candidates.push({ lesson, live: false });
      continue;
    }
    const status = input.todayStatusOf(lesson);
    if (!onAgenda(lesson, status)) continue;
    const phase = phaseOf(status, minutesOfTime(lesson.startTime), minutesOfTime(lesson.endTime), input.nowMinutes);
    if (phase === "done" || phase === "missed") continue;
    candidates.push({ lesson, live: phase === "in_progress" });
  }
  candidates.sort((a, b) => `${a.lesson.occurrenceDate}T${a.lesson.startTime}`.localeCompare(`${b.lesson.occurrenceDate}T${b.lesson.startTime}`));
  return candidates[0] ?? null;
}

/** «05:30» / «01:05:30»: the time left of an exam. */
export function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(restMinutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`
    : `${String(restMinutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

/** «Ведёт замена: Иванов А.» - the grey word on a lesson of the main teacher that a substitute leads (the lesson sheet says the same). */
export function ledByText(name: string | null | undefined): string {
  const who = (name ?? "").trim();
  return who ? `Ведёт замена: ${who}` : "Ведёт замена";
}
