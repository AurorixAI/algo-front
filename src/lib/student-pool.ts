/** Who the «Добавить учеников» drawer offers: the group's class by default, never archived students. */

export interface PoolQuery {
  search?: string;
  class_level?: number;
  exclude_status: "archived";
  limit: number;
}

/** Server query: the class filter is dropped by «Все классы» (or when the group has no class). */
export function studentPoolQuery(opts: { search: string; groupClassLevel?: number | null; allClasses: boolean; limit?: number }): PoolQuery {
  return {
    search: opts.search || undefined,
    class_level: opts.allClasses ? undefined : opts.groupClassLevel || undefined,
    // Archived students cannot be enrolled.
    exclude_status: "archived",
    // The server caps a page at 500; beyond that the search box narrows the list.
    limit: opts.limit ?? 500,
  };
}

/** Rolling update: an older server ignores `exclude_status`, so archived and already-enrolled students are dropped here too. */
export function availableStudents<T extends { id: string; status: string }>(students: T[], existingIds: Set<string>): T[] {
  return students.filter((s) => s.status !== "archived" && !existingIds.has(s.id));
}
