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

/** The tabs of the list.  The public demo has no archive (its students endpoint ignores `status`): no «Архив» there. */
export function availableStudentTabs(demo: boolean): readonly StudentTab[] {
  return demo ? STUDENT_TABS.filter((tab) => tab !== "archived") : STUDENT_TABS;
}

/**
 * `?tab=` of the list: «ungrouped» / «archived»; missing or unknown -> «В группах» (as before the URL
 * carried the tab).  The key is the tab itself, so a link to the archive is `/admin/students?tab=archived`;
 * a tab that is not offered (the archive in the demo) opens «В группах».
 */
export function parseStudentTab(value: string | null | undefined, tabs: readonly StudentTab[] = STUDENT_TABS): StudentTab {
  return tabs.find((tab) => tab === value) ?? DEFAULT_STUDENT_TAB;
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

// ── The list in the address (IA audit F34) ──────────────────────────────────

/**
 * Everything the list shows lives in the URL: `?tab=archived&q=иванов&teacher=<id>&group=<id>&page=3`.  A return from a card, a reload and a
 * shared link keep the filters; defaults are not written.  `page` is 1-based in the address and 0-based in the code.
 */
export interface StudentsListState {
  tab: StudentTab;
  q: string;
  teacher: string;
  group: string;
  page: number;
}

export function parseStudentsListQuery(params: { get(name: string): string | null } | null | undefined, tabs: readonly StudentTab[] = STUDENT_TABS): StudentsListState {
  const page = Math.floor(Number(params?.get("page")));
  return {
    tab: parseStudentTab(params?.get("tab"), tabs),
    q: (params?.get("q") ?? "").slice(0, 80),
    teacher: params?.get("teacher") ?? "",
    group: params?.get("group") ?? "",
    page: Number.isFinite(page) && page >= 2 ? page - 1 : 0,
  };
}

export function studentsListHref(pathname: string, state: StudentsListState): string {
  const params = new URLSearchParams();
  if (state.tab !== DEFAULT_STUDENT_TAB) params.set("tab", state.tab);
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.teacher) params.set("teacher", state.teacher);
  if (state.group) params.set("group", state.group);
  if (state.page > 0) params.set("page", String(state.page + 1));
  const text = params.toString();
  return text ? `${pathname}?${text}` : pathname;
}

/**
 * IA audit F37: a teacher chosen without a group filters the STUDENTS (not a second screen of group cards).  The server has no `teacher_id`
 * filter on the list, so the students of the teacher's live groups are read group by group and merged here; a student who is in two of
 * them is counted once.  Sorted like the list (surname, name).
 */
export function mergeTeacherStudents<T extends { id: string; last_name?: string; first_name?: string }>(pages: ReadonlyArray<ReadonlyArray<T>>): T[] {
  const seen = new Map<string, T>();
  for (const page of pages) for (const student of page) if (!seen.has(student.id)) seen.set(student.id, student);
  return [...seen.values()].sort((a, b) => `${a.last_name ?? ""} ${a.first_name ?? ""}`.localeCompare(`${b.last_name ?? ""} ${b.first_name ?? ""}`, "ru"));
}
