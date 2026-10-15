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
