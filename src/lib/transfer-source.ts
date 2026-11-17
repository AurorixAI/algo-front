/**
 * Money-2 T1 / Э1: a transfer closes ONE stay - the one the person names.  A student with several active groups must say «Из какой группы» (the server refuses with 422
 * `TRANSFER_SOURCE_REQUIRED` and the list of the groups when it is missing).  Pure: the choice and the reading of that refusal; the words of the money are the server's.
 */
export interface SourceGroup { id: string; name: string }

export const SOURCE_LABEL = "Из какой группы";
export const SOURCE_PLACEHOLDER = "Выберите группу";
export const SOURCE_WHY = "Выберите, из какой группы перевести ученика";

/** The groups the server names in its refusal `TRANSFER_SOURCE_REQUIRED` (`detail.groups[] = {group_id, group_name}`); null for any other error. */
export function sourcesFromError(error: unknown): SourceGroup[] | null {
  const source = error as { code?: unknown; detail?: { code?: unknown; groups?: unknown } | null } | null | undefined;
  const code = source?.code ?? source?.detail?.code;
  if (code !== "TRANSFER_SOURCE_REQUIRED" || !Array.isArray(source?.detail?.groups)) return null;
  const groups = (source!.detail!.groups as Array<{ group_id?: unknown; group_name?: unknown } | null>)
    .filter((item) => item && typeof item.group_id === "string" && item.group_id)
    .map((item) => ({ id: item!.group_id as string, name: String(item!.group_name ?? "") }));
  return groups.length > 0 ? groups : null;
}

/** `needed`: the person must choose (several groups); `id`: the group the request names (the only one, or the chosen one; null while the choice is open). */
export function transferSource(sources: SourceGroup[], chosen: string): { needed: boolean; id: string | null } {
  if (sources.length > 1) return { needed: true, id: sources.some((group) => group.id === chosen) ? chosen : null };
  return { needed: false, id: sources[0]?.id ?? null };
}

/**
 * Money-2 fix 3 / п.1: a BULK transfer names the source of every student: `sources: {student_id: group_id}`.  Only a student with exactly ONE active group is named
 * (the group the list gives); a student with two or more groups is never guessed - he stays out of `sources` and the server answers his row with `TRANSFER_SOURCE_REQUIRED`.
 */
export function bulkSources(students: ReadonlyArray<{ id: string; group_id?: string | null; groups_count?: number | null; current_group_id?: string | null }>, targetGroupId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of students) {
    const many = typeof s.groups_count === "number" && s.groups_count > 1;
    const from = typeof s.groups_count === "number" ? s.current_group_id : s.group_id;
    if (!many && from && from !== targetGroupId) out[s.id] = from;
  }
  return out;
}

/** The one hint of the action under a refusal `TRANSFER_SOURCE_REQUIRED` of a bulk row (the words of the reason are the server's). */
export const SOURCE_REQUIRED_HINT = "переведите его отдельно — нужно выбрать группу";

/** Money-2 fix 5: under a chosen student of several groups in the mode «перевести» - before the button, not only in the outcome. */
export const MANY_GROUPS_TRANSFER_HINT = "учится в нескольких группах — переведите его отдельно";

/** «в 2 группах» for a student of two or more groups (the count is the server's `groups_count`); "" for one group or none. */
export function inGroupsLabel(groupsCount: number | null | undefined): string {
  if (typeof groupsCount !== "number" || groupsCount < 2) return "";
  const n = Math.floor(groupsCount);
  return `в ${n} ${n % 100 >= 11 && n % 100 <= 14 ? "группах" : n % 10 === 1 ? "группе" : "группах"}`;
}
