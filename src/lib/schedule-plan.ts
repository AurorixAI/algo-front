/**
 * What counts in the plan of a week and how a lesson that is not in it is said (owner review 22.10, S06).
 *
 * A lesson moved away («Перенесён на сб, 24.10, 14:00») or cancelled is not a lesson of the plan: it is not in «План недели», in the
 * number of «На неделю» or in «Завершено x из y» — the new lesson of the move counts instead.  Its card is muted: the time struck
 * through, one chip, nothing to press.  The time of every card reads «11:00–12:00» (an en dash, no spaces), as on the group's cards.
 * Pure functions: no React, no network.
 */
import type { SubstitutionMovedTo, SubstitutionOutcome } from "./substitution-types";
import { movedToLabel } from "./substitutions";

/** The original of a move: the server's outcome says it («rescheduled»); the status of such an original is «cancelled», but the outcome is the proof. */
export function isMovedAway(outcome: Pick<SubstitutionOutcome, "kind"> | null | undefined): boolean {
  return outcome?.kind === "rescheduled";
}

/** «Перенесён на сб, 24.10, 14:00» (the chip of a muted card); «Перенесён» when the server did not say where. */
export function movedAwayChip(movedTo: Pick<SubstitutionMovedTo, "date" | "startTime"> | null | undefined): string {
  return movedTo ? `Перенесён на ${movedToLabel(movedTo)}` : "Перенесён";
}

/** «11:00–12:00». */
export function timeRange(start: string | null | undefined, end: string | null | undefined): string {
  return `${(start ?? "").trim() || "—"}–${(end ?? "").trim() || "—"}`;
}

export type OutOfPlan = "moved" | "cancelled" | null;

/** Why a lesson is not in the plan: moved away / cancelled; null for a lesson of the plan. */
export function outOfPlan(input: { status?: string | null; outcome?: Pick<SubstitutionOutcome, "kind"> | null }): OutOfPlan {
  if (isMovedAway(input.outcome)) return "moved";
  if (input.status === "cancelled" || input.outcome?.kind === "cancelled") return "cancelled";
  return null;
}

export interface PlanItem { date: string; status: string; outcome?: Pick<SubstitutionOutcome, "kind"> | null }

export interface WeekPlan {
  /** The lessons of the plan: not moved away, not cancelled. */
  planned: number;
  completed: number;
  /** Cancelled lessons (a moved one is not «cancelled»). */
  cancelled: number;
  moved: number;
  needsCompletion: number;
  notStarted: number;
  remaining: number;
}

/** The numbers of the week: only the lessons of the plan are counted in `planned`, `completed` of `planned`. */
export function weekPlan(items: PlanItem[], businessDate: string): WeekPlan {
  const out: WeekPlan = { planned: 0, completed: 0, cancelled: 0, moved: 0, needsCompletion: 0, notStarted: 0, remaining: 0 };
  for (const item of items) {
    const reason = outOfPlan({ status: item.status, outcome: item.outcome });
    if (reason === "moved") { out.moved += 1; continue; }
    if (reason === "cancelled") { out.cancelled += 1; continue; }
    out.planned += 1;
    if (item.status === "completed") out.completed += 1;
    else if (item.date < businessDate) {
      if (item.status === "in_progress") out.needsCompletion += 1;
      else out.notStarted += 1;
    }
  }
  out.remaining = out.planned - out.completed;
  return out;
}

/** The line under «План недели»: the plan is empty because everything was moved or cancelled, or because nothing is planned. */
export function weekPlanDescription(plan: Pick<WeekPlan, "planned" | "completed" | "cancelled" | "moved">, progress: (completed: number, total: number) => string): string {
  if (plan.planned === 0) return plan.cancelled + plan.moved > 0 ? "Все занятия недели отменены или перенесены" : "На эту неделю уроков нет";
  return plan.completed === plan.planned ? "План недели выполнен" : progress(plan.completed, plan.planned);
}

/** The place of a lesson, only when there is one to say: «Онлайн» or the room; never «Кабинет не указан». */
export function placeText(lesson: { format?: string | null; room?: string | null }): string | null {
  if (lesson.format === "online") return "Онлайн";
  const room = (lesson.room ?? "").trim();
  return room || null;
}

/** The title of the group's «today» strip when no lesson of the plan is left: everything was moved away («перенесено») or cancelled / a mix. */
export function todayPlanLines(reasons: OutOfPlan[]): { title: string; description: string; moved: boolean } {
  const moved = reasons.length > 0 && reasons.every((reason) => reason === "moved");
  return moved
    ? { title: "Занятие на сегодня перенесено", description: "Урок перенесён на другой день — отметка посещаемости на новом уроке.", moved: true }
    : { title: "Занятие на сегодня отменено", description: "Посещаемость по отменённому уроку недоступна.", moved: false };
}
