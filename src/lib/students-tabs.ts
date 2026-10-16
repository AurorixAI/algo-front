/**
 * «Ученики»: the lists «В группах», «Без группы» and «Архив». Pure: no React and no network, so node:test can load this file.
 *
 * The first two lists leave archived students out. The owner dashboard «Всего учеников» does the same
 * (the server counts non-archived students), so «В группах (N)» + «Без группы (M)» equal that number
 * when no search is typed. «Архив (K)» is a separate list that never joins that sum.
 */

export type StudentTab = "grouped" | "ungrouped" | "archived";

/** All tabs, in the order of the tab bar. */
export const STUDENT_TABS: readonly StudentTab[] = ["grouped", "ungrouped", "archived"];

/** The tab of `/students` without `?tab=`. */
export const DEFAULT_STUDENT_TAB: StudentTab = "grouped";

/** Totals from the API; `null` while unknown (the request failed or has not answered yet). */
export interface StudentTabCounts {
  grouped: number | null;
  ungrouped: number | null;
  archived?: number | null;
}

/**
 * `?tab=` of the list: «ungrouped» / «archived»; missing or unknown -> «В группах» (as before the URL
 * carried the tab).  The key is the tab itself, so a link to the archive is `/admin/students?tab=archived`.
 */
export function parseStudentTab(value: string | null | undefined): StudentTab {
  return STUDENT_TABS.find((tab) => tab === value) ?? DEFAULT_STUDENT_TAB;
}

/** The address of a tab: the default tab keeps the plain path. */
export function studentTabHref(pathname: string, tab: StudentTab): string {
  return tab === DEFAULT_STUDENT_TAB ? pathname : `${pathname}?tab=${tab}`;
}

/** Server filter of a tab: `has_group` = a primary group or any active membership; the archive is `status=archived`. */
export type StudentTabQuery =
  | { search?: string; has_group: boolean; exclude_status: "archived" }
  | { search?: string; status: "archived" };

export function studentTabQuery(tab: StudentTab, search?: string): StudentTabQuery {
  if (tab === "archived") return { search: search || undefined, status: "archived" };
  return { search: search || undefined, has_group: tab === "grouped", exclude_status: "archived" };
}

/** «В группах (41)», «Без группы (9)», «Архив (1)»; the number is dropped while unknown. */
export function studentTabLabel(tab: StudentTab, count: number | null | undefined): string {
  const title = tab === "grouped" ? "В группах" : tab === "ungrouped" ? "Без группы" : "Архив";
  return typeof count === "number" ? `${title} (${count})` : title;
}

/**
 * The counts of the tab bar after one load: the open tab shows the exact total of its list, the other
 * tabs the one-row totals asked with the same search (`null` for a request that failed).
 */
export function studentTabCounts(
  activeTab: StudentTab,
  openTotal: number,
  others: Partial<Record<StudentTab, number | null>>,
): Required<StudentTabCounts> {
  const counts: Required<StudentTabCounts> = { grouped: null, ungrouped: null, archived: null };
  for (const tab of STUDENT_TABS) counts[tab] = tab === activeTab ? openTotal : (others[tab] ?? null);
  return counts;
}

/** «1 ученик», «2 ученика», «5 учеников», «21 ученик», «12 учеников». */
export function studentsPlural(n: number): string {
  const tail = n % 100;
  const last = n % 10;
  const word = tail >= 11 && tail <= 14 ? "учеников" : last === 1 ? "ученик" : last >= 2 && last <= 4 ? "ученика" : "учеников";
  return `${n} ${word}`;
}

/**
 * Line under the page title: the students of both live tabs together (the number the dashboard shows),
 * or the size of the open list when the other tab is unknown or a group is chosen. Empty for zero.
 * Archived students are never part of it; on the archive tab the line is the live total or nothing
 * (the size of the open list would be the archive's).
 */
export function studentsSubtitle(counts: StudentTabCounts, tab: StudentTab, openTotal: number, groupFiltered: boolean): string {
  const known = counts.grouped !== null && counts.ungrouped !== null;
  const sum = !groupFiltered && known
    ? (counts.grouped as number) + (counts.ungrouped as number)
    : tab === "archived" ? 0 : openTotal;
  return sum > 0 ? studentsPlural(sum) : "";
}

/** «ещё 2» for a student in several groups (`groups_count` counts the shown group too); empty for one group or none. */
export function extraGroupsLabel(groupsCount: number | null | undefined): string {
  return typeof groupsCount === "number" && groupsCount > 1 ? `ещё ${groupsCount - 1}` : "";
}

/**
 * The muted line of a student card on a phone: «TE-010 · 7 класс». The ID is returned apart so the
 * card can make it tap-to-copy; either part may be missing (no ID yet, no class).
 */
export function studentCardMeta(
  displayId: string | null | undefined,
  classLevel: number | null | undefined,
): { id: string; classLabel: string; line: string } {
  const id = (displayId ?? "").trim();
  const classLabel = classLevel ? `${classLevel} класс` : "";
  return { id, classLabel, line: [id, classLabel].filter(Boolean).join(" · ") };
}
