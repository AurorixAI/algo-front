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
  /** what the person was doing when the save was refused: «Оставить мои» repeats exactly this */
  operation: LessonOperation;
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
      setConflict({ operation, detail: failure.detail, base: { ...baseRef.current }, mine: { ...mine } });
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
   * «Оставить мои»: my edits over the other person's marks, then the ORIGINAL action of the person (save, finish, cancel) is repeated
   * against the version the server named - `retry` is the handler of that action, called with the merged marks.  If it is refused again
   * (another conflict, a running exam) its own refusal opens the dialog again.
   */
  const keepMine = useCallback(async (retry: (operation: LessonOperation, merged: MarkRecords) => Promise<void>) => {
    const current = conflict;
    if (!current || conflictBusy) return;
    setConflictBusy(true);
    setConflictError(null);
    const theirs = current.detail.records ?? {};
    const merged = mergeKeepMine(current.base, current.mine, theirs);
    // the new base is what the journal holds now; my edits are the difference from it
    versionRef.current = current.detail.currentVersion;
    baseRef.current = { ...theirs };
    setConflict(null);
    try {
      await retry(current.operation, merged);
    } finally {
      setConflictBusy(false);
    }
  }, [conflict, conflictBusy]);

  return {
    conflict, conflictBusy, conflictError, liveExams,
    reset, versionBody, noteSaved, noteVersion, refused, clearLiveExams, takeTheirs, keepMine,
  };
}
