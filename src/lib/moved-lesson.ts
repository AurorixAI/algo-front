/**
 * The lesson a move led to (owner decision 04.11): the panel of the ORIGINAL says «Урок перенесён на чт, 29.10, 16:00» and, when the teacher still has the new lesson,
 * offers «Открыть урок 29.10».  The new lesson is looked up in the schedule of its day; a lesson that went to another teacher, was cancelled since or cannot be read
 * is not offered - the text stays without the button.
 */
import { useEffect, useState } from "react";
import { orgApi, type GroupAttendance, type ScheduleOccurrence } from "./api";
import { lessonDateOf } from "./lesson-panel-data";
import { lessonBelongsToOther } from "./lesson-teacher";
import { isMovedAway } from "./schedule-plan";
import type { SubstitutionMovedTo } from "./substitution-types";

type Located = Pick<ScheduleOccurrence, "id" | "groupId" | "startTime"> & { replacedBy?: unknown };

/** The new lesson among the lessons of its day: the same group, the id the server named (else the start time). Null when it is not the teacher's any more. */
export function movedTargetOf<L extends Located>(input: {
  occurrences: readonly L[];
  journal: Pick<GroupAttendance, "statuses" | "lessonTeachers"> | null | undefined;
  groupId: string;
  movedTo: SubstitutionMovedTo;
  viewerId: string | null | undefined;
}): L | null {
  const { occurrences, journal, groupId, movedTo, viewerId } = input;
  const found = occurrences.find((item) => item.groupId === groupId && (movedTo.lessonId ? item.id === movedTo.lessonId : item.startTime === movedTo.startTime));
  if (!found || found.replacedBy) return null;
  const key = `${movedTo.date}_${found.id}`;                 // the key of the journal: <date>_<lesson id>
  if (journal?.statuses?.[key] === "cancelled") return null;
  if (lessonBelongsToOther(journal?.lessonTeachers?.[key], viewerId)) return null;
  return found;
}

/** The new lesson of the move the open lesson was taken away by (null: not a moved lesson, not read yet, or not the teacher's). */
export function useMovedLessonTarget<L extends Located & { groupId: string; substitutionOutcome?: ScheduleOccurrence["substitutionOutcome"] }>(
  lesson: L | null, viewerId: string | null | undefined, businessDate: string,
): L | null {
  const movedTo = lesson && isMovedAway(lesson.substitutionOutcome) ? lesson.substitutionOutcome?.movedTo ?? null : null;
  const marker = lesson && movedTo ? `${lessonDateOf(lesson as never, businessDate)}|${lesson.groupId}|${lesson.id}|${movedTo.date}|${movedTo.startTime}|${movedTo.lessonId ?? ""}` : null;
  const [found, setFound] = useState<{ marker: string; lesson: L | null } | null>(null);
  useEffect(() => {
    if (!marker || !movedTo || !lesson) return;
    let current = true;
    void (async () => {
      try {
        const [occurrences, journal] = await Promise.all([
          orgApi.getScheduleOccurrences({ dateFrom: movedTo.date, dateTo: movedTo.date }, viewerId ?? undefined),
          orgApi.getGroupAttendance(lesson.groupId, { dateFrom: movedTo.date, dateTo: movedTo.date }),
        ]);
        if (current) setFound({ marker, lesson: movedTargetOf({ occurrences: occurrences as unknown as L[], journal, groupId: lesson.groupId, movedTo, viewerId }) });
      } catch {
        if (current) setFound({ marker, lesson: null });
      }
    })();
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marker]);
  return marker && found?.marker === marker ? found.lesson : null;
}
