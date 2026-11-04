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
 * Does the state card of the overview show «Урока не было» itself (given that the teacher may cancel the lesson at all)?  ONE answer for the card and the «⋯» menu: what the card shows the menu does not repeat
 * (one action - one place on the screen), and where the card has no such button (a task «Разобрать», marking of the roster, an empty roster) the row stays in the menu.
 */
export function cancelShownInCard(input: {
  banner: LessonPanelBanner;
  /** The overview with a state card is on the screen (not a lesson led by another, not loading, not an empty roster, not the marking step). */
  overviewShown: boolean;
  /** «Overdue»: the marks are saved already - the card offers no actions. */
  attendanceSaved: boolean;
  /** «Past»: the list of the server's tasks could not be read ("Повторить" instead) / holds a task of this lesson ("Разобрать" instead). */
  missedUnknown: boolean;
  missedAction: boolean;
}): boolean {
  if (!input.overviewShown) return false;
  if (input.banner === "overdue") return !input.attendanceSaved;
  if (input.banner === "past") return !input.missedUnknown && !input.missedAction;
  return input.banner === "subsequent";
}
