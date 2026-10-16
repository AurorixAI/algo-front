/**
 * Pure logic of the teacher / group filter (src/components/ui/cascading-filter.tsx), used on the
 * payments, students and excuses pages.  The filter is an in-panel drill-down: a teacher row selects the
 * teacher (= all his groups), a separate expand button opens his groups inline below the row.
 * Covered by tests/n13-ui-floating.test.cjs.
 */

export interface FilterValue {
  teacherId: string;
  groupId: string;
}

export interface FilterGroupRef {
  id: string;
  name: string;
  teacher_id: string;
}

export interface FilterPanelState {
  open: boolean;
  /** The teacher whose groups are shown inline (accordion: at most one). */
  expandedTeacherId: string | null;
}

export type FilterPanelAction =
  | { type: "toggle" }
  | { type: "close" }
  | { type: "expand"; teacherId: string }
  | { type: "pick-all" }
  | { type: "pick-teacher"; teacherId: string }
  | { type: "pick-group"; teacherId: string; groupId: string };

export interface FilterPanelContext {
  value: FilterValue;
  groups: FilterGroupRef[];
}

export const EMPTY_FILTER: FilterValue = { teacherId: "", groupId: "" };

export const CLOSED_FILTER_PANEL: FilterPanelState = { open: false, expandedTeacherId: null };

export function groupsOfTeacher<G extends FilterGroupRef>(groups: G[], teacherId: string): G[] {
  return groups.filter((group) => group.teacher_id === teacherId);
}

/** Opening the panel shows the current selection: the teacher of the selected group is expanded. */
export function initialExpandedTeacher(value: FilterValue, groups: FilterGroupRef[]): string | null {
  if (!value.groupId) return null;
  const group = groups.find((item) => item.id === value.groupId);
  return group ? group.teacher_id : value.teacherId || null;
}

/**
 * The panel's reducer.  `value` is set only by a pick (the panel closes with it); toggling and
 * expanding never change the filter, so the pages' `onChange` fires on a real choice only.
 */
export function reduceFilterPanel(
  state: FilterPanelState,
  action: FilterPanelAction,
  ctx: FilterPanelContext,
): { state: FilterPanelState; value?: FilterValue } {
  switch (action.type) {
    case "toggle":
      return state.open
        ? { state: CLOSED_FILTER_PANEL }
        : { state: { open: true, expandedTeacherId: initialExpandedTeacher(ctx.value, ctx.groups) } };
    case "close":
      return { state: CLOSED_FILTER_PANEL };
    case "expand":
      return {
        state: { ...state, expandedTeacherId: state.expandedTeacherId === action.teacherId ? null : action.teacherId },
      };
    case "pick-all":
      return { state: CLOSED_FILTER_PANEL, value: EMPTY_FILTER };
    case "pick-teacher":
      return { state: CLOSED_FILTER_PANEL, value: { teacherId: action.teacherId, groupId: "" } };
    case "pick-group":
      return { state: CLOSED_FILTER_PANEL, value: { teacherId: action.teacherId, groupId: action.groupId } };
  }
}

/** The label of the trigger: the group, else the teacher, else «Все ученики». */
export function filterLabel(
  value: FilterValue,
  groups: FilterGroupRef[],
  teacherName: (teacherId: string) => string | null,
  fallback = "Фильтр",
  emptyLabel = "Все ученики",
): string {
  if (value.groupId) return groups.find((group) => group.id === value.groupId)?.name ?? fallback;
  if (value.teacherId) return teacherName(value.teacherId) ?? fallback;
  return emptyLabel;
}

/** A teacher row is checked when the whole teacher is selected (no group chosen). */
export function isTeacherSelected(value: FilterValue, teacherId: string): boolean {
  return value.teacherId === teacherId && !value.groupId;
}

/** A teacher row is on the selection path when one of his groups is selected. */
export function isTeacherOnPath(value: FilterValue, teacherId: string): boolean {
  return value.teacherId === teacherId && Boolean(value.groupId);
}
