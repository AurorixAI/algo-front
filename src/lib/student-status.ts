/**
 * Student status as the owner reads it. The stored status «Активный» says nothing about groups:
 * an active student without any active membership is shown as «Без группы».
 * Pure: no React and no network, so node:test can load this file.
 */

export interface StudentGroupFacts {
  /** The stored primary group; it can be empty or stale, so the list API's memberships win over it. */
  group_id?: string | null;
  /** Active memberships in live (not archived) groups; sent by the list API only (older servers omit it). */
  groups_count?: number | null;
  /** The group the student is in now, from the memberships; sent together with `groups_count`. */
  current_group_id?: string | null;
}

/**
 * True when the student is in a group: an active membership in a live group (the server's `has_group`).
 * A stale `group_id` without such a membership, or a membership in an archived group only, is NOT
 * «in a group». An older server sends no `groups_count`; then only the stored `group_id` is known.
 */
export function studentHasGroup(student: StudentGroupFacts): boolean {
  if (typeof student.groups_count === "number") return student.groups_count > 0;
  return Boolean(student.group_id);
}

/** The group to show for the student («сейчас в …»): from the memberships, else the stored primary group. */
export function studentGroupId(student: StudentGroupFacts): string | null {
  if (typeof student.groups_count === "number") return student.current_group_id || null;
  return student.group_id || null;
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
