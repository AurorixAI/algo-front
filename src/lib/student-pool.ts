/**
 * Who the «Добавить учеников» drawer offers. The drawer enrols NEW students: by default the
 * students of the centre without any group (in the group's class), never archived ones.
 * Students who already study in other groups appear only for a search of two or more characters.
 */
import { studentHasGroup, type StudentGroupFacts } from "./student-status";

/** Shortest search that reaches students who are already in other groups. */
export const POOL_MIN_SEARCH = 2;

export interface PoolQuery {
  search?: string;
  class_level?: number;
  exclude_status: "archived";
  /** `false` = students with no active group; absent when a search looks through everyone. */
  has_group?: false;
  limit: number;
}

/** The search the server gets: trimmed, and empty while it is shorter than two characters. */
export function poolSearchTerm(raw: string): string {
  const term = (raw || "").trim();
  return Array.from(term).length >= POOL_MIN_SEARCH ? term : "";
}

/**
 * Server query. The class filter is dropped by «Все классы» (or when the group has no class);
 * without a search only students without a group are asked for, with a search all non-archived ones.
 */
export function studentPoolQuery(opts: { search: string; groupClassLevel?: number | null; allClasses: boolean; limit?: number }): PoolQuery {
  const search = poolSearchTerm(opts.search);
  const query: PoolQuery = {
    search: search || undefined,
    class_level: opts.allClasses ? undefined : opts.groupClassLevel || undefined,
    // Archived students cannot be enrolled.
    exclude_status: "archived",
    // The server caps a page at 500; beyond that the search box narrows the list.
    limit: opts.limit ?? 500,
  };
  if (!search) query.has_group = false;
  return query;
}

/**
 * Rolling update: an older server ignores `exclude_status`, so archived and already-enrolled
 * students are dropped here too; `ungroupedOnly` (no search) also drops students of other groups.
 */
export function availableStudents<T extends StudentGroupFacts & { id: string; status: string }>(
  students: T[],
  existingIds: Set<string>,
  opts: { ungroupedOnly?: boolean } = {},
): T[] {
  return students.filter((s) =>
    s.status !== "archived" && !existingIds.has(s.id) && !(opts.ungroupedOnly && studentHasGroup(s)));
}
