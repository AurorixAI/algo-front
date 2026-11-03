/**
 * WAVE E (E-C, decision 11): where the tab «Экзамены» of the group page leads, by workspace.  Pure (no React), so node:test loads it.
 */
import type { GroupWorkspace } from "./group-workspace";

export interface GroupExamLinks {
  /** «Создать новый»: the constructor with the group already chosen. */
  newExam: string;
  /** The library of the teacher. */
  library: string;
  /** A row of the list: the hub of the exam, coming back to the same tab and filter. */
  exam: (examId: string, returnTo: string) => string;
}

export function groupExamLinks(input: { workspace: GroupWorkspace; groupId: string; groupName: string }): GroupExamLinks {
  const { groupId, groupName } = input;
  return {
    newExam: `/teacher/exams/new?group_id=${encodeURIComponent(groupId)}&group_name=${encodeURIComponent(groupName)}`,
    library: "/teacher/exams/new",
    exam: (examId, returnTo) =>
      `/teacher/exams/${encodeURIComponent(examId)}?from_group=${encodeURIComponent(groupId)}&from_name=${encodeURIComponent(groupName)}&return_to=${encodeURIComponent(returnTo)}`,
  };
}
