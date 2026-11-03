/**
 * ONE way to bind an exam to a lesson (WAVE E, E-C decision 11).  The library «Назначить» and the group page «Выбрать» used to be two
 * implementations: the first opened a lobby on a chosen lesson, the second made a draft of the group with no lesson at all.  Both are
 * this function now: the teacher chooses an exact lesson (`ScheduleExamModal`), then an online exam opens its lobby on it
 * (`assign publish:true` with the lesson) and a paper exam freezes its print package for it.
 */
import type { examsApi } from "./api";

export interface AssignSelection {
  group: { id: string };
  occurrence: { id: string; occurrenceDate: string };
}

type AssignApi = Pick<typeof examsApi, "assign" | "preparePrintPackage">;
export type AssignResult = Awaited<ReturnType<typeof examsApi.assign>>;

export type AssignOutcome =
  | { kind: "print" }
  | { kind: "lobby"; result: AssignResult };

export async function assignExamToLesson(
  api: AssignApi,
  exam: { exam_id: string; delivery_mode?: string | null },
  selection: AssignSelection,
): Promise<AssignOutcome> {
  const { group, occurrence } = selection;
  if (exam.delivery_mode === "print") {
    await api.preparePrintPackage(exam.exam_id, { group_id: group.id, lesson_id: occurrence.id, lesson_date: occurrence.occurrenceDate });
    return { kind: "print" };
  }
  const result = await api.assign(exam.exam_id, { group_id: group.id, publish: true, lesson_id: occurrence.id, lesson_date: occurrence.occurrenceDate });
  return { kind: "lobby", result };
}
