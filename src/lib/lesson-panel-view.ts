/**
 * WE-E (E1, decision 3): WHICH banner the lesson panel shows - one function, one order, for the dashboard and the schedule.
 * Before, each screen had its own chain of conditions (a future lesson had two different banners, a past one that was never started was a dead end on the schedule).
 *

 * The order is the order of the lifecycle: the end states first (cancelled, finished), then a lesson too old for the teacher, then what the teacher has already done (unsaved marks, saved marks, started),
 * then why a lesson that is still «scheduled» cannot be started (its day is over / has not come, a later lesson was already started, the clock), then «ready».
 */
import type { LessonDateRelation } from "./lesson-actions";

export type LessonPanelBanner =
  | "cancelled"
  | "completed"
  | "tooOld"
  | "dirty"
  | "saved"
  | "started"
  | "past"
  | "future"
  | "subsequent"
  | "upcoming"
  | "overdue"
  | "ready";

export function lessonPanelBanner(input: {
  status: string;
  /** The day of the lesson against the business day. */
  relation: LessonDateRelation | null;
  /** The lesson is older than the window of the teacher (7 days): only an administrator or the owner closes it - ONE line instead of any action. */
  tooOld?: boolean;
  /** Marks were changed and not saved yet. */
  isDirty: boolean;
  /** The journal holds saved marks of this lesson. */
  hasSavedMarks: boolean;
  /** A later lesson of the same teacher was already started: this one can no longer be. */
  hasSubsequentStarted: boolean;
  /** The clock against a lesson of today (null for another day). */
  time: { type: string; isPastEndTime?: boolean } | null;
}): LessonPanelBanner {
  if (input.status === "cancelled") return "cancelled";
  if (input.status === "completed") return "completed";
  if (input.tooOld) return "tooOld";
  if (input.isDirty) return "dirty";
  if (input.hasSavedMarks) return "saved";
  if (input.status === "in_progress") return "started";
  if (input.relation === "past") return "past";
  if (input.relation === "future") return "future";
  if (input.hasSubsequentStarted) return "subsequent";
  if (input.time?.type === "upcoming") return "upcoming";
  if (input.time?.isPastEndTime) return "overdue";
  return "ready";
}

/**
 * Money-1 A5: what the panel of the TEACHER says under «Урок завершён».  The teacher corrects the marks of his own held lesson in the journal within 7 days, with a reason
 * (the month must be open); older - the administrator does it.  ONE text for the dashboard and the schedule.
 */
export function completedLessonNote(input: { tooOld: boolean }): { text: string; journalLink: boolean } {
  return input.tooOld
    ? { text: "Отметки зафиксированы. Исправить их может только администратор — с причиной.", journalLink: false }
    : { text: "Отметки зафиксированы. Если ошиблись, исправьте их в журнале группы — в течение 7 дней, с причиной.", journalLink: true };
}

/** Where the teacher starts «Урока не было» (given that he may cancel the lesson at all): the button of the state card, a row of the «⋯» menu, the dialog «Пропущенный урок» (after «Разобрать»), or nowhere yet. */
export type CancelEntry = "card" | "menu" | "dialog" | "wait";

/**
 * ONE answer for the card, the dialog and the «⋯» menu: a lesson has exactly one road to its cancellation (one action - one place).
 *  - the state card has the button (overdue, past without a task, a later lesson started) - "card";
 *  - past with a task of the server: «Разобрать» opens the dialog that already offers both outcomes - "dialog";
 *  - past with the list of tasks unread: «Повторить»; we do not know yet whether the lesson is to be reconciled, so nothing is cancelled - "wait";
 *  - everywhere else (no state card on the screen: an empty roster, the marking step; overdue with saved marks; a lesson in time that is the teacher's own one-off) - the menu row.
 * Only "menu" keeps the row in the menu.
 */
export function cancelEntryPoint(input: {
  banner: LessonPanelBanner;
  /** The overview with a state card is on the screen (not a lesson led by another, not loading, not an empty roster, not the marking step). */
  overviewShown: boolean;
  /** «Overdue»: the marks are saved already - the card offers no actions. */
  attendanceSaved: boolean;
  /** «Past»: the list of the server's tasks could not be read ("Повторить" instead) / holds a task of this lesson ("Разобрать" instead). */
  missedUnknown: boolean;
  missedAction: boolean;
}): CancelEntry {
  if (!input.overviewShown) return "menu";
  if (input.banner === "overdue") return input.attendanceSaved ? "menu" : "card";
  if (input.banner === "past") return input.missedUnknown ? "wait" : input.missedAction ? "dialog" : "card";
  return input.banner === "subsequent" ? "card" : "menu";
}
