/**
 * The public exam info (`GET /exams/by-code/{code}`) as the student page uses it.
 *
 * The service answers `has_group` (the group's own id is not public).  For one release an older service may still
 * answer `group_id` only; that means the same thing, so the page reads one flag either way.
 */
export function normalizeExamInfo<T extends { has_group?: boolean; group_id?: string | null }>(
  info: T,
): Omit<T, "group_id"> & { has_group: boolean } {
  const { group_id, ...rest } = info;
  return { ...rest, has_group: info.has_group ?? Boolean(group_id) };
}
