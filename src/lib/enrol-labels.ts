/**
 * IA audit F12: ONE vocabulary of enrolment and transfer for every screen that does either (the card of the student, the group page, the
 * dialogs).  Pure: no React, so node:test loads it.  «Зачислить в группу» is the first enrolment AND an additional one;
 * «Перевести в другую группу» closes the current memberships and moves the student.  No «Добавить в группу», «Перевести сюда»,
 * «Добавить ученика»; «Перевести» is the BUTTON of the window titled «Перевести в другую группу» (re-audit В2), never an action name of a menu.
 */
export const ENROL_ACTION_LABEL = "Зачислить в группу";
export const TRANSFER_ACTION_LABEL = "Перевести в другую группу";
/** UX pack №7: the button is not hidden from an administrator without the money access - it is off, with the reason (a transfer carries the money of the student). */
export const TRANSFER_NO_RIGHT_TEXT = "Переводить может владелец или администратор с доступом к деньгам.";

/** Group page: the button over the roster (the title of the sheet names the group: «Зачислить в «М11 БС»»). */
export const ENROL_STUDENTS_BUTTON_LABEL = "Зачислить учеников";

/** Group page, a student who is already in another group: the two choices of the sheet. */
export const ENROL_HERE_TRANSFER_LABEL = "Перевести сюда";
export const ENROL_HERE_ADD_LABEL = "Оставить в обеих";

/** The title of the window of the student's card: «Зачислить: Анвар Каримов» / «Перевести: Анвар Каримов» (the group is chosen in the window, so the title names the person). */
export function enrolCardTitle(transfer: boolean, studentName: string): string {
  return `${transfer ? "Перевести" : "Зачислить"}: ${studentName}`;
}

/**
 * The name of a group as a window says it (title, button, card, message): a hyphen inside a name («М11 Г Пн-Ср-Пт») is the NON-BREAKING one (U+2011), so a line never breaks the name in the middle of a word
 * («Пн-Ср-⏎Пт»).  Only for showing: the name that goes to the server or is compared stays as it is (Money-2 fix 11, F8).
 */
export const groupNameShown = (name: string): string => name.replace(/-/g, "\u2011");

/**
 * A sentence of the server shown in a window of enrolment (a special row, the words of a transfer, the reason of a refusal, the message after the write): inside «…» a hyphen is the NON-BREAKING one (U+2011), so the name of
 * a group («М11 ВС Вт-Чт-Сб») is not torn at a hyphen; the rest of the text stays as the server said it (Money-2 fix 12, item 3).
 */
export const serverPhraseShown = <T extends string | null | undefined>(text: T): T => (typeof text === "string" ? (text.replace(/«[^»]*»/g, (quoted) => quoted.replace(/-/g, "‑")) as T) : text);
