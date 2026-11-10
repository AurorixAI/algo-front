/**
 * The ACTIONS of the teacher's day, in one place for «Главная» and «Расписание» (release review 06.11: the schedule said «На сегодня всё» while the dashboard said «Начните урок 09:00» - two rules for one question).
 * The server's open actions (a journal to finish, a missed lesson) and the actions of the CLOCK (a lesson whose time has come, a lesson of today that is over and never started) are merged here;
 * `pickNextStep` (lib/teacher-agenda.ts) then chooses ONE step.  Pure: no React; what depends on the platform (the lesson of an action, the lock of an old one) is passed in.
 */
import { formatIsoDateLabel } from "./business-time";
import type { OpenAttendanceAction } from "./api";
import type { AgendaEntry, AgendaLessonLike, LaterLesson, NextStep, TodayAgenda } from "./teacher-agenda";
import { orderActions, pickNextStep } from "./teacher-agenda";

export interface TodayActionBase<L> {
  lesson: L;
  label: string;
  description: string;
  cardLabel?: string;
  cardDescription?: string;
  /** `rose` is the RANK «overdue» (it sorts first), SHOWN as a warning (yellow): red is for errors and debts only. */
  tone: "rose" | "amber" | "emerald";
  actionType?: "in_progress" | "missed";
  badge?: string;
  locked?: boolean;
}

/** The actions the CLOCK gives: a lesson of today that is over and was never started (red, unless the server already returned it), a lesson whose time has come (unless a later lesson of the group is started). */
export function scheduledTodayActions<L extends AgendaLessonLike & { groupName: string }>(input: {
  entries: readonly AgendaEntry<L>[];
  openActions: ReadonlyArray<{ lessonId: string; lessonDate: string }>;
  today: string;
  subsequentStarted: (lesson: L) => boolean;
}): TodayActionBase<L>[] {
  return input.entries.flatMap<TodayActionBase<L>>((entry) => {
    if (entry.phase === "missed") {
      if (input.openActions.some((action) => action.lessonId === entry.lesson.id && action.lessonDate === input.today)) return [];
      return [{
        lesson: entry.lesson,
        label: "Разберите урок",
        cardLabel: "Разобрать пропущенный урок",
        description: `${entry.lesson.groupName} · ${entry.lesson.startTime} — ${entry.lesson.endTime} · состоялся ли он`,
        // ONE line: the date and the lesson (the explanation «урок не был начат…» lives on the screen the arrow leads to)
        cardDescription: `${formatIsoDateLabel(input.today, { weekday: "short", day: "numeric", month: "short" })} · ${entry.lesson.groupName} · ${entry.lesson.startTime}`,
        badge: "Посещаемость не отмечена",
        tone: "rose",
      }];
    }
    if (entry.phase !== "to_start") return [];
    if (input.subsequentStarted(entry.lesson)) return [];
    return [{ lesson: entry.lesson, label: "Начните урок", description: `${entry.lesson.groupName} · ${entry.lesson.startTime} — ${entry.lesson.endTime}`, tone: "emerald" }];
  });
}

/** The ONE list the card, the tile «Требуют действия» and the centre read: not locked, red first, then in progress, then to start. */
export function orderedTodayActions<A extends TodayActionBase<AgendaLessonLike>>(input: { open: readonly A[]; scheduled: readonly A[]; today: string }): A[] {
  return orderActions([...input.open.filter((action) => !action.locked), ...input.scheduled], input.today);
}

/** The step of «Ближайшее действие» - the same answer on every screen that shows it. */
export function todayNextStep<A extends TodayActionBase<L>, L extends AgendaLessonLike, E>(input: {
  actions: readonly A[];
  agenda: Pick<TodayAgenda<L>, "upcoming">;
  activeExam: E | null;
  attentionExam: E | null;
  loadFailed: boolean;
  today: string;
  later: LaterLesson | null;
}): NextStep<A, L, E> {
  return pickNextStep(input);
}

/** The actions the SERVER gives (a journal to finish, a missed lesson) in the words of the teacher's cabinet; `toLesson` and `isLocked` come from the platform (the panel, the role). */
export function openTodayActions<L extends AgendaLessonLike>(input: {
  actions: readonly OpenAttendanceAction[];
  today: string;
  toLesson: (action: OpenAttendanceAction) => L;
  isLocked: (action: OpenAttendanceAction) => boolean;
}): Array<TodayActionBase<L> & { sourceAction: OpenAttendanceAction; markedCount: number; rosterCount: number; remainingCount: number }> {
  return input.actions.map((action) => {

      const isMissed = action.actionType === "missed";
      const isHistorical = action.lessonDate < input.today;
      const hasNoRoster = !isMissed && action.rosterCount === 0;
      const lesson = input.toLesson(action);
      const locked = input.isLocked(action);
      const progress = hasNoRoster
        ? "На дату занятия в составе группы не было учеников — отметки не требуются."
        : action.rosterCount > 0
        ? `Отмечено ${action.markedCount} из ${action.rosterCount}${action.remainingCount > 0 ? ` · осталось ${action.remainingCount}` : ""}.`
        : "Проверьте и завершите журнал занятия.";
      return {
        lesson,
        actionType: action.actionType,
        sourceAction: action,
        // The dashboard is only an entry point. The reason and the
        // attendance rules belong in the lesson detail, not in its headline.
        cardLabel: hasNoRoster ? "Требует действия" : undefined,
        cardDescription: hasNoRoster
          ? `${formatIsoDateLabel(action.lessonDate, { weekday: "short", day: "numeric", month: "short" })} · ${action.groupName}`
          : undefined,
        label: isMissed
          ? "Разобрать пропущенный урок"
          : hasNoRoster ? "Завершите урок без отметок"
            : action.remainingCount > 0 ? "Завершите посещаемость" : "Завершите урок",
        description: isMissed
          ? `${formatIsoDateLabel(action.lessonDate, { weekday: "short", day: "numeric", month: "short" })} · ${action.groupName}`
          : `${formatIsoDateLabel(action.lessonDate, { weekday: "short", day: "numeric", month: "short" })} · ${action.groupName} · ${progress}`,
        tone: isMissed || isHistorical ? "rose" : "amber",
        markedCount: action.markedCount,
        rosterCount: action.rosterCount,
        remainingCount: action.remainingCount,
        locked,
      };
    });
}
