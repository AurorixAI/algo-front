import { ASSIGN_TEACHER_ACTION, REPLACE_TEACHER_ACTION, canReplaceTeacher } from "./lesson-teacher";

/** What the owner / administrator can do with one lesson of the group's week schedule, from the lesson sheet (the card itself has no buttons). */
export type ScheduleCardAction =
  | "assign"          // «Назначить замену» (future) / «Назначить того, кто провёл» (past): the teacher of this lesson
  | "reschedule"      // «Перенести урок» (the time / room of this lesson)
  | "cancel"          // «Отменить урок»
  | "mark"            // «Отметить посещаемость»: a past lesson nobody marked (the journal)
  | "journal";        // «Открыть в журнале»: a lesson that is held or going on

export const SCHEDULE_ACTION_LABEL: Record<Exclude<ScheduleCardAction, "assign">, string> = {
  reschedule: "Перенести урок",
  cancel: "Отменить урок",
  mark: "Отметить посещаемость",
  journal: "Открыть в журнале",
};

export const ASSIGN_SUBSTITUTE_ACTION = "Назначить замену";
export const ASSIGN_WHO_HELD_ACTION = "Назначить того, кто провёл";

export interface ScheduleCardInput {
  role: string | null | undefined;
  archived: boolean;
  /** `scheduled` | `in_progress` | `completed` | `cancelled` */
  state: string;
  date: string;
  today: string;
  /** The server sent who teaches the lesson (an older one does not: no assignment then). */
  hasTeacherInfo: boolean;
}

/** The actions of the lesson sheet by situation; [] for a card that is information only (cancelled, archived group, not a manager). */
export function scheduleCardActions(input: ScheduleCardInput): ScheduleCardAction[] {
  if (input.archived || (input.role !== "owner" && input.role !== "admin")) return [];
  const { state, date, today } = input;
  if (state === "cancelled") return [];
  if (state === "completed") return ["journal"];
  if (state === "in_progress") return ["journal"];
  const out: ScheduleCardAction[] = [];
  const canAssign = input.hasTeacherInfo && canReplaceTeacher(input.role, state);
  if (date >= today) {
    if (canAssign) out.push("assign");
    out.push("reschedule", "cancel");
  } else {
    out.push("mark");
    if (canAssign) out.push("assign");
  }
  return out;
}

/** The label of «assign» by situation: a future lesson «Назначить замену» (or «Заменить преподавателя» when a substitute is already there), a past one «Назначить того, кто провёл». */
export function assignActionLabel(input: { past: boolean; lacksTeacher: boolean; isSubstitution: boolean }): string {
  if (input.lacksTeacher) return ASSIGN_TEACHER_ACTION;
  if (input.past) return ASSIGN_WHO_HELD_ACTION;
  return input.isSubstitution ? REPLACE_TEACHER_ACTION : ASSIGN_SUBSTITUTE_ACTION;
}
