import { useEffect, useRef, useState } from "react";
import { orgApi } from "./api";
import { leaveUndoOf, type LeaveUndo } from "./transfer-effects";

/**
 * Money-2 fix 7 (T6, one rule at every entrance): of the students chosen in the drawer «Зачислить учеников», the ones who come back the DAY OF THEIR LEAVING (`leave_undo.undone` of the dry run of
 * `mode=add`, one per student - the bulk dry run does not carry it).  `ready` is false until every ask is answered (the button of the window does not wait: a failed ask is «not undone»,
 * the server decides at the write).  Only `undone` students are returned.
 */
export function useLeaveUndos(groupId: string, ids: readonly string[], enabled: boolean): { undone: Map<string, LeaveUndo>; ready: boolean } {
  const [answers, setAnswers] = useState<Map<string, LeaveUndo | null>>(new Map());
  const asked = useRef(new Set<string>());
  useEffect(() => { asked.current = new Set(); setAnswers(new Map()); }, [groupId, enabled]);
  const key = enabled ? ids.join(",") : "";
  useEffect(() => {
    if (!enabled) return undefined;
    ids.filter((id) => !asked.current.has(id)).forEach((id) => {
      asked.current.add(id);
      orgApi.dryRunAddStudent(groupId, id, {})
        .then((answer) => setAnswers((prev) => new Map(prev).set(id, leaveUndoOf(answer))))
        .catch(() => { setAnswers((prev) => new Map(prev).set(id, null)); });
    });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, key, enabled]);
  const undone = new Map<string, LeaveUndo>();
  ids.forEach((id) => { const found = answers.get(id); if (found?.undone) undone.set(id, found); });
  return { undone, ready: ids.every((id) => answers.has(id)) };
}
