/**
 * The chips in the head of a column of the group journal (UX pack №26): at most TWO - the ones that matter most - the rest is behind «ещё N» (a hint with their words).  The order of weight:
 * the marks of a lesson (the decision about an additional lesson, a substitution, a request) → who held it (a substitute) → «исправлен» → «задним числом».  Pure: no React.
 */
import type { LessonMark } from "./substitutions";

export const JOURNAL_HEAD_CHIPS_MAX = 2;

export interface HeaderChipPlan {
  marks: LessonMark[];
  teacher: boolean;
  correction: boolean;
  backdated: boolean;
  /** The words of the chips that did not fit («Замена: Иванов И.», «исправлен»…): the hint «ещё N». */
  hidden: string[];
}

export function headerChipPlan(input: { marks: ReadonlyArray<LessonMark>; teacherLabel: string | null; correctionLabel: string | null; backdatedLabel: string | null; max?: number }): HeaderChipPlan {
  const max = input.max ?? JOURNAL_HEAD_CHIPS_MAX;
  let room = max;
  const marks = input.marks.slice(0, room);
  room -= marks.length;
  const hidden = input.marks.slice(marks.length).map((mark) => mark.text);
  const take = (label: string | null): boolean => {
    if (!label) return false;
    if (room > 0) { room -= 1; return true; }
    hidden.push(label);
    return false;
  };
  const teacher = take(input.teacherLabel);
  const correction = take(input.correctionLabel);
  const backdated = take(input.backdatedLabel);
  return { marks: [...marks], teacher, correction, backdated, hidden };
}

/**
 * Under the items of the menu of a column of the journal (UX pack №26): ONE grey line - what the action does to the money and to the lesson, in the words of the dictionary (§1) and of the
 * windows the items open (the numbers are shown there, by the dry run of the server).
 */
export const COLUMN_ACTION_HINT = {
  reconcile: "Урок войдёт в зарплату того, кто его провёл.",
  cancel_missed: "Урок не войдёт в зарплату; перерасчёт ученикам — по вашему выбору.",
  correct: "Зарплата и оплата учеников пересчитаются — покажем до сохранения.",
  return: "Урок станет «не проведён» и выйдет из зарплаты.",
  undo_decision: "Урок выйдет из зарплаты — пока месяц не закрыт.",
  return_review: "Урок снова ждёт отметки; перерасчёт ученикам снимется.",
} as const;
