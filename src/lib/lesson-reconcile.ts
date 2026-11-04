/**
 * «Деньги-1» A6 (ЗПД-6): «Отметить посещаемость» of a past lesson that nobody started (the server: «Оформить проведённый урок») says WHO actually taught it - the pay of the lesson
 * goes to him.  Only the owner and an administrator with the money right may name another teacher than the planned one (`taughtBy`); by default it is the planned teacher
 * (nothing is sent).  The audit of the journal marks such a lesson «Оформлен задним числом».  Pure: no React, no network.
 */
import { formatDateRu } from "./business-time";
import type { LessonTeacherCandidates } from "./ops-b-types";

export const RECONCILE_TITLE = "Отметить посещаемость";
export const RECONCILE_WHO_LABEL = "Кто провёл урок";
export const RECONCILE_EXPLAIN = "Урок пройден, но не был начат вовремя: он оформляется задним числом и появится в журнале с этой пометкой. Оплата за урок пойдёт тому, кто его провёл.";
export const RECONCILE_PLANNED_NOTE = "по расписанию";
export const RECONCILE_SUBMIT = "Оформить урок";

/** The teacher the lesson is planned for: the one who leads it now (a substitute, else the group's teacher). */
export function plannedTeacherId(list: Pick<LessonTeacherCandidates, "currentTeacherId" | "defaultTeacherId"> | null | undefined): string | null {
  return list?.currentTeacherId ?? list?.defaultTeacherId ?? null;
}

/** `taughtBy` of the request: only when somebody OTHER than the planned teacher is chosen (the default sends nothing). */
export function taughtByOf(pick: string | null, planned: string | null): string | undefined {
  return pick && planned && pick !== planned ? pick : pick && !planned ? pick : undefined;
}

/** «Оплата за урок 12.10 пойдёт Рахимов Т., а не Каримова К.» - said when another teacher than the planned one is chosen. */
export function reconcilePayNote(input: { lessonDate: string; pickName: string | null; plannedName: string | null }): string | null {
  if (!input.pickName || !input.plannedName || input.pickName === input.plannedName) return null;
  const planned = input.plannedName.endsWith(".") ? input.plannedName : `${input.plannedName}.`;          // a short name («Каримова К.») has its full stop already
  return `Оплата за урок ${formatDateRu(input.lessonDate).slice(0, 5)} пойдёт ${input.pickName}, а не ${planned}`;
}

export const RECONCILE_DONE_TEXT = "Урок открыт: отметьте учеников в столбце";
