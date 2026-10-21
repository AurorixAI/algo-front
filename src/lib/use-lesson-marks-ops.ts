"use client";

import { useCallback, useRef, useState } from "react";
import {
  lessonFailure,
  mergeKeepMine,
  type LessonFailure,
  type LessonOperation,
  type MarkRecords,
} from "./attendance-ops";
import type { AttendanceConflictDetail, LiveExamItem } from "./ops-b-types";

export interface MarksConflict {
  detail: AttendanceConflictDetail;
  /** the marks as the screen loaded or saved them last */
  base: MarkRecords;
  /** the marks on the screen when the save was refused: my edits are the difference from `base` */
  mine: MarkRecords;
}

/**
 * LOGIC-B (O7, O8) for the lesson panels of the teacher's cabinet (the dashboard and the schedule): one lesson is open at a time, its marks
 * are saved as one snapshot.  The hook keeps what the panel must remember - the version of the lesson record (`expectedVersion`), the marks
 * as last loaded or saved (the base of «Оставить мои»), the open conflict and the exam the finish waits for - and sorts a refusal.
 * The panel keeps its own state of marks; it passes them in and takes them back through `apply`.
 */
export function useLessonMarksOps() {
  const versionRef = useRef<number | undefined>(undefined);
  const baseRef = useRef<MarkRecords>({});
  const [conflict, setConflict] = useState<MarksConflict | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [liveExams, setLiveExams] = useState<LiveExamItem[] | null>(null);

  /** A lesson was opened (or read again): its version and its marks are the base. */
  const reset = useCallback((version: number | null | undefined, base: MarkRecords) => {
    versionRef.current = typeof version === "number" ? version : undefined;
    baseRef.current = { ...base };
    setConflict(null);
    setConflictError(null);
    setLiveExams(null);
  }, []);

  /** The part of a save body that carries the version (nothing for an older server that sent none). */
  const versionBody = useCallback((): { expectedVersion?: number } => (
    versionRef.current === undefined ? {} : { expectedVersion: versionRef.current }
  ), []);

  /** A write succeeded: the answer carries the new version; the saved marks are the new base. */
  const noteSaved = useCallback((result: { version?: number | null } | null | undefined, saved?: MarkRecords) => {
    if (typeof result?.version === "number") versionRef.current = result.version;
    if (saved) baseRef.current = { ...saved };
  }, []);

  /** The lesson record changed through another way of the same panel (start, reconcile): remember its version. */
  const noteVersion = useCallback((result: { version?: number | null } | null | undefined) => {
    if (typeof result?.version === "number") versionRef.current = result.version;
  }, []);

  /**
   * A write was refused: sorts it; a conflict opens the dialog (my marks `mine` against the other person's), a running exam
   * opens the confirmation.  Returns the failure so the panel can show `text` for anything else.
   */
  const refused = useCallback((error: unknown, operation: LessonOperation, fallback: string, mine: MarkRecords): LessonFailure => {
    const failure = lessonFailure(error, operation, fallback);
    if (failure.kind === "conflict") {
      setConflictError(null);
      setLiveExams(null);
      setConflict({ detail: failure.detail, base: { ...baseRef.current }, mine: { ...mine } });
    } else if (failure.kind === "live_exam") {
      setLiveExams(failure.exams);
    }
    return failure;
  }, []);

  const clearLiveExams = useCallback(() => setLiveExams(null), []);

  /** «Принять чужие»: the other person's marks become the screen's, the version moves on. */
  const takeTheirs = useCallback((apply: (theirs: MarkRecords) => void) => {
    const current = conflict;
    if (!current) return;
    const theirs = { ...(current.detail.records ?? {}) };
    versionRef.current = current.detail.currentVersion;
    baseRef.current = theirs;
    setConflict(null);
    setConflictError(null);
    apply(theirs);
  }, [conflict]);

  /**
   * «Оставить мои»: my edits over the other person's marks, saved again against the version the server named.  `send` does the request;
   * `apply` hands the merged marks back to the panel when it went through.
   */
  const keepMine = useCallback(async (
    send: (merged: MarkRecords, expectedVersion: number) => Promise<{ version?: number | null } | null | undefined>,
    apply: (merged: MarkRecords) => void,
  ) => {
    const current = conflict;
    if (!current || conflictBusy) return;
    setConflictBusy(true);
    setConflictError(null);
    const merged = mergeKeepMine(current.base, current.mine, current.detail.records ?? {});
    try {
      const result = await send(merged, current.detail.currentVersion);
      noteSaved(result, merged);
      if (typeof result?.version !== "number") versionRef.current = current.detail.currentVersion;
      setConflict(null);
      apply(merged);
    } catch (error) {
      const failure = lessonFailure(error, "save", "Не удалось сохранить отметки. Данные не изменены.");
      // changed again while the dialog was open: the newest state replaces the old one, my edits stay
      if (failure.kind === "conflict") setConflict({ ...current, detail: failure.detail });
      else setConflictError(failure.text);
    } finally {
      setConflictBusy(false);
    }
  }, [conflict, conflictBusy, noteSaved]);

  return {
    conflict, conflictBusy, conflictError, liveExams,
    reset, versionBody, noteSaved, noteVersion, refused, clearLiveExams, takeTheirs, keepMine,
  };
}
