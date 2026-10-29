"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { orgApi } from "@/lib/api";
import { lessonStatusKey, needsLessonStatus, type ExamForState } from "@/lib/exam-lobby";

const REFRESH_MS = 60_000;

/**
 * The status of the lesson TODAY for the exams of a list whose lobby is by its status and whose lesson is today (#159): the lists say «Лобби открыто» only while that
 * lesson is in progress (the server lets students in only then), so they ask for it - the journal of the group of the exam for today, `statuses[<date>_<lessonId>]`,
 * one request per group, again every minute while there is such an exam.  `statusOf(exam)` is `undefined` until known (and when the answer failed): the list then says «Сегодня».
 * Exams of other days and of other statuses cost no request.
 */
export function useTodayLessonStatuses(exams: ReadonlyArray<ExamForState>, today: string): { statusOf: (exam: ExamForState) => string | undefined } {
  const [byGroup, setByGroup] = useState<Record<string, Record<string, string>>>({});
  const groups = useMemo(() => {
    const ids = new Set<string>();
    for (const exam of exams) if (needsLessonStatus(exam, today) && exam.group_id) ids.add(exam.group_id);
    return Array.from(ids).sort();
  }, [exams, today]);
  const key = groups.join("|");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    const wanted = key ? key.split("|") : [];
    await Promise.all(wanted.map(async (groupId) => {
      try {
        const attendance = await orgApi.getGroupAttendance(groupId, { dateFrom: today, dateTo: today });
        if (alive.current) setByGroup((previous) => ({ ...previous, [groupId]: (attendance?.statuses ?? {}) as Record<string, string> }));
      } catch {
        // not known: the list keeps saying «Сегодня» (it never claims an open lobby it could not check)
      }
    }));
  }, [key, today]);

  useEffect(() => {
    if (!key) return undefined;
    void load();
    const timer = window.setInterval(() => { void load(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [key, load]);

  const statusOf = useCallback(
    (exam: ExamForState): string | undefined => {
      if (!exam.group_id || !exam.scheduled_lesson_id || !exam.scheduled_lesson_date) return undefined;
      return byGroup[exam.group_id]?.[lessonStatusKey(exam.scheduled_lesson_date, exam.scheduled_lesson_id)];
    },
    [byGroup],
  );
  return { statusOf };
}
