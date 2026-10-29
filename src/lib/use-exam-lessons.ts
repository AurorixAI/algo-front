"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { orgApi } from "@/lib/api";
import { lessonStatusKey, needsLessonStatus, type ExamForState } from "@/lib/exam-lobby";

const REFRESH_MS = 60_000;

/**
 * The groups whose journal this user cannot read (403: not his group, 404: gone) - asked once, then never again until the page is reloaded (#159 E3): a request that fails is
 * logged by the browser as a red line in the console every time, so a minute timer would paint one per group per minute.  Module level on purpose: leaving the screen and coming back
 * does not ask again either.
 */
const unavailableGroups = new Set<string>();

/** 403 / 404 of the journal of a group: this group will not answer a retry. */
export function isGroupUnavailable(err: unknown): boolean {
  const status = typeof err === "object" && err !== null ? (err as { status?: unknown }).status : undefined;
  return status === 403 || status === 404;
}
export const rememberUnavailableGroup = (groupId: string): void => { unavailableGroups.add(groupId); };
export const isGroupRemembered = (groupId: string): boolean => unavailableGroups.has(groupId);
/** For tests and for a sign-out: forget what was learned. */
export const forgetUnavailableGroups = (): void => { unavailableGroups.clear(); };

/**
 * The status of the lesson TODAY for the exams of a list whose lobby is by its status and whose lesson is today (#159): the lists say «Лобби открыто» only while that
 * lesson is in progress (the server lets students in only then), so they ask for it - the journal of the group of the exam for today, `statuses[<date>_<lessonId>]`,
 * one request per group, again every minute while there is such an exam and the tab is in front (#159 E2: a hidden tab asks nothing; on the return, and on the opening of the screen, it
 * asks at once).  A group that answered 403 / 404 is not asked again (E3).  `statusOf(exam)` is `undefined` until known (and when the answer failed): the list then says «Сегодня».
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
    const wanted = (key ? key.split("|") : []).filter((groupId) => !unavailableGroups.has(groupId));
    await Promise.all(wanted.map(async (groupId) => {
      try {
        const attendance = await orgApi.getGroupAttendance(groupId, { dateFrom: today, dateTo: today });
        if (alive.current) setByGroup((previous) => ({ ...previous, [groupId]: (attendance?.statuses ?? {}) as Record<string, string> }));
      } catch (err) {
        // not known: the list keeps saying «Сегодня» (it never claims an open lobby it could not check)
        if (isGroupUnavailable(err)) unavailableGroups.add(groupId);
      }
    }));
  }, [key, today]);

  useEffect(() => {
    if (!key) return undefined;
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, REFRESH_MS);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
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
