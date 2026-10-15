/**
 * «Ученики»: the two lists «В группах» and «Без группы». Pure: no React and no network, so node:test can load this file.
 *
 * Both lists leave archived students out. The owner dashboard «Всего учеников» does the same
 * (the server counts non-archived students), so «В группах (N)» + «Без группы (M)» equal that number
 * when no search is typed.
 */

export type StudentTab = "grouped" | "ungrouped";

/** Totals from the API; `null` while unknown (the request failed or has not answered yet). */
export interface StudentTabCounts {
  grouped: number | null;
  ungrouped: number | null;
}

/** Server filter of a tab: `has_group` = a primary group or any active membership. */
export function studentTabQuery(tab: StudentTab, search?: string): {
  search?: string;
  has_group: boolean;
  exclude_status: "archived";
} {
  return { search: search || undefined, has_group: tab === "grouped", exclude_status: "archived" };
}

/** «В группах (41)», «Без группы (9)»; the number is dropped while unknown. */
export function studentTabLabel(tab: StudentTab, count: number | null | undefined): string {
  const title = tab === "grouped" ? "В группах" : "Без группы";
  return typeof count === "number" ? `${title} (${count})` : title;
}

/** «1 ученик», «2 ученика», «5 учеников», «21 ученик», «12 учеников». */
export function studentsPlural(n: number): string {
  const tail = n % 100;
  const last = n % 10;
  const word = tail >= 11 && tail <= 14 ? "учеников" : last === 1 ? "ученик" : last >= 2 && last <= 4 ? "ученика" : "учеников";
  return `${n} ${word}`;
}

/**
 * Line under the page title: the students of both tabs together (the number the dashboard shows),
 * or the size of the open list when the other tab is unknown or a group is chosen. Empty for zero.
 */
export function studentsSubtitle(counts: StudentTabCounts, tab: StudentTab, openTotal: number, groupFiltered: boolean): string {
  const sum = !groupFiltered && counts.grouped !== null && counts.ungrouped !== null
    ? counts.grouped + counts.ungrouped
    : openTotal;
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
