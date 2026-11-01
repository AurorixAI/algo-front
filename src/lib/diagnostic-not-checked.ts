/**
 * «Ответ не проверен» (diagnostic-service, 503 ANSWER_NOT_CHECKED): the symbolic checker is busy or down.  The server
 * neither saved the answer nor counted it as wrong, and the same question is still the current one - so the student
 * is shown the server's own text and sends the answer again.  If it fails twice in a row on the SAME question he must
 * not be stuck: «Пропустить вопрос» sends «не знаю», an answer the server grades without the checker.
 * Pure: no React and no network, so node:test can load this file.
 */

export const ANSWER_NOT_CHECKED_CODE = "ANSWER_NOT_CHECKED";
/** The answer «Пропустить вопрос» sends (an IDK token of the server: graded as «не знаю», never reaches the checker). */
export const SKIP_ANSWER = "не знаю";
/** After this many «не проверено» in a row on one question the skip button appears. */
export const SKIP_AFTER_NOT_CHECKED = 2;
export const SKIP_BUTTON_LABEL = "Пропустить вопрос";
export const SKIP_HINT = "Если проверка не заработает, вопрос можно пропустить: он будет засчитан как «не знаю».";
/** Used only when the server sent no text. */
export const NOT_CHECKED_FALLBACK = "Не удалось проверить ответ: проверка сейчас занята. Ответ не засчитан как неверный. Отправьте его ещё раз.";

export interface NotCheckedStreak {
  taskId: string | null;
  count: number;
}

export const NO_STREAK: NotCheckedStreak = { taskId: null, count: 0 };

export function isAnswerNotChecked(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === ANSWER_NOT_CHECKED_CODE;
}

/** What the student reads: the server's text (it is Russian and says «не засчитан как неверный»), else the fallback. */
export function notCheckedMessage(error: unknown): string {
  const text = typeof error === "object" && error !== null ? (error as { message?: unknown }).message : undefined;
  return typeof text === "string" && text.trim() ? text : NOT_CHECKED_FALLBACK;
}

/** The streak after one more «не проверено» on `taskId`; a streak of another question starts again at 1. */
export function addNotChecked(streak: NotCheckedStreak, taskId: string): NotCheckedStreak {
  return { taskId, count: streak.taskId === taskId ? streak.count + 1 : 1 };
}

/** Whether «Пропустить вопрос» is shown for the question on screen. */
export function canSkipQuestion(streak: NotCheckedStreak, currentTaskId: string | null | undefined): boolean {
  return !!currentTaskId && streak.taskId === currentTaskId && streak.count >= SKIP_AFTER_NOT_CHECKED;
}
