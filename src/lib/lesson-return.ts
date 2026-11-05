/**
 * «Деньги-1» A2 (frontend): the words and rules of the two returns of a lesson that had begun:
 *  - «Вернуть урок» - a HELD lesson goes back to «не проведён» (`POST attendance/return`, a dry run first);
 *  - «Вернуть на отметку» - «Урока не было» said by mistake: the lesson is back in «Уроки без отметки» (`POST lessons/restore` for a lesson that has begun).
 * Both: the owner and an administrator with the money right, a reason, an open month of the teacher (the server answers 409 `PERIOD_CLOSED` otherwise).
 *
 * Pure: no React, no network.
 */
import { formatDateRu } from "./business-time";
import { formatMoney, REASON_MAX, REASON_MIN } from "./payments";

export const RETURN_LESSON_LABEL = "Вернуть урок";
export const RETURN_TO_REVIEW_LABEL = "Вернуть на отметку";
export const RETURN_REASON_LABEL = "Причина";
export const RETURN_REASON_PLACEHOLDER = "Например: нажали «Завершить» по ошибке, урока не было";
export const RETURN_REASON_HINT = "Причина и ваше имя останутся в журнале урока.";

/** What the return of a held lesson does, in one sentence (the numbers of money are the dry run's, under it). */
export const RETURN_LESSON_EXPLAIN = "Урок станет «не проведён»: отметки сохранятся, а завершить его можно будет заново. Пока он не завершён, он не списывается из пакетов учеников и не оплачивается преподавателю.";

export const RETURN_REVIEW_TITLE = "Вернуть урок на отметку?";
export const RETURN_REVIEW_EXPLAIN = "Урок снова появится в «Уроки без отметки»: отметьте на нём посещаемость или отмените его заново.";
/** R3 #23: the dry run of the return says WHOSE deduction for the cancelled lesson goes away and by how much (the money right only) - it replaces the general line. */
export const DEDUCTIONS_TITLE = "Вычеты за этот урок исчезнут";

export interface DeductionLine {
  studentId: string;
  name: string;
  amount: number;
}

/** `deductions` of the answer of `lessons/restore` (dry or real): a row without a name or a positive sum is not a deduction. */
export function deductionsOf(answer: unknown): DeductionLine[] {
  const raw = (answer as { deductions?: unknown } | null | undefined)?.deductions;
  if (!Array.isArray(raw)) return [];
  const lines: DeductionLine[] = [];
  for (const item of raw) {
    const row = item as { studentId?: unknown; name?: unknown; amount?: unknown } | null;
    const amount = Number(row?.amount);
    const name = typeof row?.name === "string" ? row.name.trim() : "";
    if (name && Number.isFinite(amount) && amount > 0) lines.push({ studentId: String(row?.studentId ?? name), name, amount });
  }
  return lines;
}

export function deductionText(line: DeductionLine): string {
  return `${line.name}: ${formatMoney(line.amount)}`;
}
export const RETURN_REVIEW_PAY = "Преподавателю урок оплатится, когда его проведут.";

export function validateReturnReason(reason: string | null | undefined): string | null {
  const text = (reason ?? "").trim();
  if (text.length < REASON_MIN) return `Укажите причину (не короче ${REASON_MIN} символов)`;
  if (text.length > REASON_MAX) return `Причина не длиннее ${REASON_MAX} символов`;
  return null;
}

export function returnTitle(lessonDate: string): string {
  return `Вернуть урок ${formatDateRu(lessonDate).slice(0, 5)}?`;
}

/** The toast after the return of a held lesson; `changed: false` is a repeat (the lesson was not held any more). */
export function returnDoneText(lessonDate: string, changed: boolean): string {
  const day = formatDateRu(lessonDate).slice(0, 5);
  return changed ? `Урок ${day} возвращён: он снова не проведён` : `Урок ${day} уже не проведён`;
}

export function returnReviewDoneText(lessonDate: string): string {
  return `Урок ${formatDateRu(lessonDate).slice(0, 5)} возвращён в «Уроки без отметки»`;
}

/** A lesson cancelled by hand that has begun and can go back to the review: not the original of a move, not cancelled by a day off (the day off is undone itself). */
export function canReturnToReview(input: {
  moneyRight: boolean;
  archived: boolean;
  state: string;
  /** The lesson has begun (a future one goes back to the schedule - `canRestoreLesson`). */
  started: boolean;
  moved?: boolean;
  cancelKind?: string | null;
}): boolean {
  if (!input.moneyRight || input.archived) return false;
  if (input.state !== "cancelled" || !input.started) return false;
  return !input.moved && input.cancelKind !== "day_off";
}

/** A held lesson that can go back to «не проведён»: the money right, an active group. */
export function canReturnHeld(input: { moneyRight: boolean; archived: boolean; state: string }): boolean {
  return input.moneyRight && !input.archived && input.state === "completed";
}

/** The reasons the owner reads of the refusals of a return in the words of the screen; the server's own sentence where it has one. */
export function returnErrorText(error: unknown, fallback = "Не удалось вернуть урок. Данные не изменены."): string {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  const message = error instanceof Error ? error.message.trim() : "";
  if (code === "LESSON_NOT_HELD") return message || "Проведённого урока нет: возвращать нечего. Обновите страницу";
  // R3 #11: the lesson was changed after the window read it - the window has read it again
  if (code === "ATTENDANCE_CONFLICT") return `${(message || "Отметки урока уже изменили. Обновите страницу").replace(/[.\s]+$/, "")}. Мы прочитали урок заново: проверьте последствия и нажмите ещё раз.`;
  return message || fallback;
}
