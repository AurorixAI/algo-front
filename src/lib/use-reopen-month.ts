import { useEffect, useRef, useState } from "react";
import { orgApi } from "./api";
import {
  REOPEN_NO_SHEET_TEXT,
  buildReopenBody,
  isSheetChanged,
  reopenErrorText,
  revisionOf,
  validateReopenReason,
  type ReopenResult,
} from "./closed-period";
import { useDialogAction } from "./use-dialog-action";

export interface ReopenTarget {
  /** `YYYY-MM` */
  month: string;
  teacherId: string;
  teacherName: string | null;
  /** The revision of the saved sheet the screen saw (`sheetRevision` of the list of months); absent: it is read when the form opens. */
  sheetRevision?: number | null;
}

/**
 * «Переоткрыть месяц»: the state both forms share - the window of the sheet (`ReopenMonthDialog`) and the block inside a window of a lesson (UX pack №27, `ReopenInline`).
 * A reason (3..500 characters) is required; the revision of the saved sheet is the one the person looks at (R3 #11: a sheet saved meanwhile is refused with `SHEET_CHANGED`, the revision is read again).
 */
export function useReopenMonth(target: ReopenTarget | null, onReopened: (result: ReopenResult, target: ReopenTarget) => void) {
  const [reason, setReason] = useState("");
  const { busy, error, setError, run } = useDialogAction(target ? `${target.month}|${target.teacherId}` : null);
  /** undefined while it is being read; null: the teacher has no sheet in that month. */
  const [revision, setRevision] = useState<number | null | undefined>(typeof target?.sheetRevision === "number" ? target.sheetRevision : undefined);
  const reads = useRef(0);

  const readRevision = async (month: string, teacherId: string) => {
    const token = ++reads.current;
    setRevision(undefined);
    try {
      const periods = await orgApi.getPayrollPeriods(month);
      if (token !== reads.current) return;
      const next = revisionOf(periods, teacherId);
      setRevision(next);
      if (next === null) setError(REOPEN_NO_SHEET_TEXT);
    } catch (cause) {
      if (token !== reads.current) return;
      setRevision(null);
      setError(reopenErrorText(cause));
    }
  };

  useEffect(() => {
    setReason("");
    reads.current += 1;
    if (!target) { setRevision(undefined); return; }
    if (typeof target.sheetRevision === "number") setRevision(target.sheetRevision);
    else void readRevision(target.month, target.teacherId);
    // the revision is read when the form opens for a teacher and a month, not when the page behind it refreshes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.month, target?.teacherId]);

  const submit = async () => {
    if (!target || busy || typeof revision !== "number") return;
    const problem = validateReopenReason(reason);
    if (problem) { setError(problem); return; }
    await run(async () => {
      const result = await orgApi.reopenPayrollPeriod(target.month, buildReopenBody(target.teacherId, reason, revision));
      onReopened(result, target);
    }, (cause) => {
      // the sheet was saved again after the screen read it: read it again - the person looks at the new state and asks once more
      if (isSheetChanged(cause)) void readRevision(target.month, target.teacherId);
    });
  };

  return { reason, setReason, busy, error, setError, revision, submit };
}
