/**
 * Words of the marks of the group journal, in one place (UX-1 B): a cell, the menu of a cell and the legend above the
 * table read from here, so a word means the same thing everywhere.  Whole words, no abbreviations («Не был», not «Н/Б»):
 * the cell is wide enough for the longest of them («Уважительная», «Ждёт решения»).  No React: node:test loads this file.
 */

export type MarkValue = "present" | "late" | "absent" | "excused";
export type ExcuseReviewState = "pending" | "confirmed" | "rejected";

/** The text of a cell with the mark. */
export const MARK_CELL_LABEL: Record<MarkValue, string> = {
  present: "Был",
  late: "Опоздал",
  absent: "Не был",
  excused: "Уважительная",
};

/** The text of the item in the menu where a mark is chosen. */
export const MARK_MENU_LABEL: Record<MarkValue, string> = {
  present: "Был на уроке",
  late: "Опоздал",
  absent: "Не был",
  excused: "Уважительная причина",
};

/** The text of an «Уважительная» cell by what the administrator decided. */
export const EXCUSE_REVIEW_LABEL: Record<ExcuseReviewState, string> = {
  pending: "Ждёт решения",
  confirmed: "Подтверждена",
  rejected: "Отклонена",
};

/** What a decision means for the lesson, in the legend (the same facts the confirmation dialog states). */
export const EXCUSE_REVIEW_MEANING: Record<ExcuseReviewState, string> = {
  pending: "решит администратор",
  confirmed: "урок не идёт в зарплату",
  rejected: "считается обычным пропуском",
};

/** Order of the legend: the marks first, then the decisions about an «Уважительная». */
export const LEGEND_MARKS: MarkValue[] = ["present", "late", "absent", "excused"];
export const LEGEND_DECISIONS: ExcuseReviewState[] = ["pending", "confirmed", "rejected"];
