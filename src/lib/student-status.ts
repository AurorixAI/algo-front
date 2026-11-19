/**
 * What the facts of a student say about his groups: is he in a group at all, and which one is «now».  The stored status «Активный» says nothing about groups:
 * the window of enrolment reads the tag of a row («без группы» / «в «…»» / «в 2 группах») from these facts.
 * Pure: no React and no network, so node:test can load this file.
 */

export interface StudentGroupFacts {
  /** The stored primary group; it can be empty or stale, so the list API's memberships win over it. */
  group_id?: string | null;
  /** Active memberships in live (not archived) groups; sent by the list API only (older servers omit it). */
  groups_count?: number | null;
  /** The group the student is in now, from the memberships; sent together with `groups_count`. */
  current_group_id?: string | null;
  /** LOGIC-B (O15): the server's own reading - an active membership in a live group (`has_group`) - when it sends it. */
  has_group?: boolean | null;
  /** LOGIC-B (O15): the server's reading of the status (`new | diagnosed | active | no_group | archived`); the window of enrolment does not show a status, the field stays in the contract. */
  status_view?: string | null;
}

/**
 * True when the student is in a group: an active membership in a live group (the server's `has_group`).
 * A stale `group_id` without such a membership, or a membership in an archived group only, is NOT
 * «in a group». An older server sends no `groups_count`; then only the stored `group_id` is known.
 */
export function studentHasGroup(student: StudentGroupFacts): boolean {
  if (typeof student.has_group === "boolean") return student.has_group;
  if (typeof student.groups_count === "number") return student.groups_count > 0;
  return Boolean(student.group_id);
}

/** The group to show for the student («сейчас в …»): from the memberships, else the stored primary group. */
export function studentGroupId(student: StudentGroupFacts): string | null {
  if (typeof student.groups_count === "number") return student.current_group_id || null;
  return student.group_id || null;
}
