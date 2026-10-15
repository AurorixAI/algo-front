/**
 * Student status as the owner reads it. The stored status «Активный» says nothing about groups:
 * an active student without any active membership is shown as «Без группы».
 * Pure: no React and no network, so node:test can load this file.
 */

export interface StudentGroupFacts {
  /** Current (primary) group; null when the student is in none. */
  group_id?: string | null;
  /** Number of active memberships; sent by the list API only (older servers omit it). */
  groups_count?: number | null;
}

/** True when the student is in a group: a primary group or any active membership (the server's `has_group`). */
export function studentHasGroup(student: StudentGroupFacts): boolean {
  if (student.group_id) return true;
  return typeof student.groups_count === "number" && student.groups_count > 0;
}

/** Stored statuses plus «no_group» (active, but in no group). */
export type StudentStatusKey = "new" | "diagnosed" | "active" | "archived" | "no_group";

export const STUDENT_STATUS_LABELS: Record<StudentStatusKey, string> = {
  new: "Новый",
  diagnosed: "Диагностирован",
  active: "Активный",
  archived: "Архив",
  no_group: "Без группы",
};

/** The status to show: an active student without a group becomes «no_group»; other statuses stay as stored. */
export function studentStatusKey(student: StudentGroupFacts & { status: string }): string {
  if (student.status === "active" && !studentHasGroup(student)) return "no_group";
  return student.status;
}

export function studentStatusLabel(student: StudentGroupFacts & { status: string }): string {
  const key = studentStatusKey(student);
  return (STUDENT_STATUS_LABELS as Record<string, string>)[key] ?? key;
}
