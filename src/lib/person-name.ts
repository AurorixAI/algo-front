/**
 * Money-1 V / Н7: ONE rule of how a person is named on a screen (LESSONS 104: one number - one function).
 *
 * The server sends a ready name (`teacher_name`, «Эргашев К.» or «Камол Эргашев» depending on the place) AND its parts (`teacher_first_name`, `teacher_last_name`).
 *  - a title, a list, a row, a card, the title of a window: the FULL name «Имя Фамилия» (`personName`) - the same in the list of the month and in the title of the sheet;
 *  - inside a sentence and in the table «Что изменится» (the server declines the phrase around it): the short name as it came - `teacher_name` («Эргашев К.»), never rebuilt here.
 * No parts - the ready name as it is; no name at all - the fallback.
 */

/** Used when the server could not name the person. */
export const TEACHER_FALLBACK = "Преподаватель";

interface NameInput {
  first?: string | null;
  last?: string | null;
  /** The ready name of the server. */
  ready?: string | null;
}

const clean = (value: string | null | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();

/** «Камол Эргашев»; one part alone as it is; no parts - `ready`; nothing - `fallback`. */
export function personName({ first, last, ready }: NameInput, fallback: string = TEACHER_FALLBACK): string {
  const parts = [clean(first), clean(last)].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return clean(ready) || fallback;
}

/** The name of a teacher of any payroll answer: `{teacher_name, teacher_first_name, teacher_last_name}`. */
export function teacherFullName(teacher: { teacher_name?: string | null; teacher_first_name?: string | null; teacher_last_name?: string | null }): string {
  return personName({ first: teacher.teacher_first_name, last: teacher.teacher_last_name, ready: teacher.teacher_name });
}

/** The short name inside a sentence: the ready name of the server as it came (it is the one the server declines); without it - the full one built from the parts. */
export function personShortName({ first, last, ready }: NameInput, fallback: string = TEACHER_FALLBACK): string {
  return clean(ready) || personName({ first, last }, fallback);
}
