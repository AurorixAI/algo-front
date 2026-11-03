/**
 * WAVE E (E-C, decision 11): where the tab «Экзамены» of the group page leads, by workspace.  Pure (no React), so node:test loads it.
 */
import type { GroupWorkspace } from "./group-workspace";

/**
 * What a role may do with the exams of a group - as the exam service decides (`require_group_access`, `_require_teacher_exam_operator`):
 * the lifecycle of a classroom run belongs to the teacher who LEADS the group; the owner and the administrator watch the exams of the whole
 * center, a teacher who only substitutes has no page of the group at all (403).  A button the
 * role cannot use is not shown.
 */
export interface GroupExamsAccess {
  /** «Добавить экзамен», «Выбрать» from the library, «Создать первый экзамен». */
  canAssign: boolean;
  /** The access code (a student capability) and its «copy link» button: only the teacher gets the code from the service. */
  showCode: boolean;
}

export function groupExamsAccess(input: { workspace: GroupWorkspace }): GroupExamsAccess {
  const teacher = input.workspace === "teacher";
  return { canAssign: teacher, showCode: teacher };
}

/** `?return_to=` of the monitor of an exam: only a page of the administrator's own workspace (no other site, no `//host`). */
export function safeAdminReturnPath(value: string | null | undefined): string | null {
  return value && value.startsWith("/admin/") && !value.startsWith("//") ? value : null;
}

export interface GroupExamLinks {
  /** «Создать новый» (a teacher who leads the group): the constructor with the group already chosen. */
  newExam: string;
  /** The library of the teacher. */
  library: string;
  /** A row of the list: the hub of the exam (comes back to the same tab and filter); null: the role has no page of an exam to go to (the owner). */
  exam: (examId: string, returnTo: string) => string | null;
}

export function groupExamLinks(input: { workspace: GroupWorkspace; groupId: string; groupName: string }): GroupExamLinks {
  const { groupId, groupName } = input;
  return {
    newExam: `/teacher/exams/new?group_id=${encodeURIComponent(groupId)}&group_name=${encodeURIComponent(groupName)}`,
    library: "/teacher/exams/new",
    exam: (examId, returnTo) => {
      if (input.workspace === "admin") return `/admin/exams/${encodeURIComponent(examId)}?return_to=${encodeURIComponent(returnTo)}`; // the monitor of the administrator; «назад» comes back to the group
      if (input.workspace === "owner") return null; // the owner workspace never links into /admin/* (ia-links.ts) and has no page of an exam
      return `/teacher/exams/${encodeURIComponent(examId)}?from_group=${encodeURIComponent(groupId)}&from_name=${encodeURIComponent(groupName)}&return_to=${encodeURIComponent(returnTo)}`;
    },
  };
}
