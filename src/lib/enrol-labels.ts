/**
 * IA audit F12: ONE vocabulary of enrolment and transfer for every screen that does either (the card of the student, the group page, the
 * dialogs).  Pure: no React, so node:test loads it.  «Зачислить в группу» is the first enrolment AND an additional one;
 * «Перевести в другую группу» closes the current memberships and moves the student.  No «Добавить в группу», «Перевести сюда»,
 * «Добавить ученика», «Перевести» alone.
 */
export const ENROL_ACTION_LABEL = "Зачислить в группу";
export const TRANSFER_ACTION_LABEL = "Перевести в другую группу";

/** Group page: the button over the roster and the title of the side sheet (one or several students of a class are enrolled). */
export const ENROL_STUDENTS_BUTTON_LABEL = "Зачислить учеников";
export const ENROL_STUDENTS_TITLE = "Зачислить учеников в группу";

/** Group page, a student who is already in another group: the two choices of the sheet. */
export const ENROL_HERE_TRANSFER_LABEL = "Перевести в эту группу";
export const ENROL_HERE_ADD_LABEL = "Зачислить и в эту группу";

/** Titles and button texts of the dialog of the card (mode «add» = one more group, «transfer» = move; no current group = first enrolment). */
export function enrolDialogTitle(mode: "add" | "transfer", hasCurrentGroup: boolean): string {
  if (mode === "add") return ENROL_ACTION_LABEL;
  return hasCurrentGroup ? TRANSFER_ACTION_LABEL : ENROL_ACTION_LABEL;
}

export function enrolSubmitLabel(mode: "add" | "transfer", hasCurrentGroup: boolean): string {
  return enrolDialogTitle(mode, hasCurrentGroup);
}
