import { orgApi } from "@/lib/api";
import { askConfirm } from "@/lib/confirm-dialog";
import { openLessonItemKey, openLessonsQuestion, type OpenLessonsGate } from "@/lib/payroll-open-lessons";

/** The names of the groups of the unfinished lessons (the items of the server carry ids only); an empty map when «Незакрытые уроки» cannot be read - the list then has dates. */
async function groupNamesOfOpenLessons(): Promise<Map<string, string>> {
  try {
    const actions = await orgApi.getOpenAttendanceActions();
    return new Map(actions.map((action) => [openLessonItemKey(action), action.groupName] as [string, string]));
  } catch {
    return new Map();
  }
}

/**
 * Money-1 I-4: asked before a sheet of a month that is over is saved (the save closes the month).  true: save; false: the owner went back.
 * Nothing to ask (`none`) is a yes without a window.
 */
export async function confirmUnfinishedLessons(gate: OpenLessonsGate): Promise<boolean> {
  if (gate.kind === "none") return true;
  const names = gate.kind === "list" && gate.items.length > 0 ? await groupNamesOfOpenLessons() : new Map<string, string>();
  const question = openLessonsQuestion(gate, names);
  return question ? askConfirm(question) : true;
}
